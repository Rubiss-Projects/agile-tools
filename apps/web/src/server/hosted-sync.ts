import { send } from '@vercel/queue';
import { z } from 'zod';

import {
  acquireScopeSyncLock,
  createSyncRun,
  getPrismaClient,
  resolveActiveSyncRun,
  updateSyncRun,
} from '@agile-tools/db';
import { getConfig, logger, QUEUE_NAMES } from '@agile-tools/shared';
import { runScopeSync } from '@agile-tools/worker/sync';

import { enqueueScopeSyncJob } from './queue';
import { assertHostedWriteAllowed } from './hosted-policy';

const HostedScopeSyncMessageSchema = z.object({
  type: z.literal('scope-sync'),
  scopeId: z.string().uuid(),
  syncRunId: z.string().uuid(),
  phase: z.string(),
  dedupeKey: z.string(),
  trigger: z.enum(['manual', 'scheduled']),
  requestedBy: z.string().optional(),
});

const HostedTickMessageSchema = z.object({
  type: z.literal('tick'),
  slot: z.string(),
});

export type HostedScopeSyncMessage = z.infer<typeof HostedScopeSyncMessageSchema>;
export type HostedTickMessage = z.infer<typeof HostedTickMessageSchema>;

export async function processHostedScopeSyncMessage(message: unknown): Promise<void> {
  const parsed = HostedScopeSyncMessageSchema.parse(message);
  const db = getPrismaClient();

  const claimed = await db.hostedSyncTask.updateMany({
    where: {
      dedupeKey: parsed.dedupeKey,
      syncRunId: parsed.syncRunId,
      scopeId: parsed.scopeId,
      phase: parsed.phase,
      status: { in: ['queued', 'failed'] },
    },
    data: {
      status: 'running',
      attempt: { increment: 1 },
      lockedAt: new Date(),
      error: null,
    },
  });
  if (claimed.count === 0) {
    const existing = await db.hostedSyncTask.findUnique({
      where: { dedupeKey: parsed.dedupeKey },
      select: { status: true, syncRunId: true, scopeId: true, phase: true },
    });
    if (existing) {
      if (
        existing.syncRunId !== parsed.syncRunId ||
        existing.scopeId !== parsed.scopeId ||
        existing.phase !== parsed.phase
      ) {
        logger.warn('Hosted sync task identity mismatch; acknowledging queue message without running', {
          dedupeKey: parsed.dedupeKey,
          taskSyncRunId: existing.syncRunId,
          messageSyncRunId: parsed.syncRunId,
          taskScopeId: existing.scopeId,
          messageScopeId: parsed.scopeId,
          taskPhase: existing.phase,
          messagePhase: parsed.phase,
        });
        return;
      }

      logger.debug('Hosted sync task already claimed; acknowledging duplicate', {
        dedupeKey: parsed.dedupeKey,
        status: existing.status,
      });
      return;
    }

    logger.warn('Hosted sync task missing; acknowledging queue message', {
      dedupeKey: parsed.dedupeKey,
      syncRunId: parsed.syncRunId,
    });
    return;
  }

  try {
    await runScopeSync(db, parsed.syncRunId);
    await db.syncRunCheckpoint.upsert({
      where: { syncRunId: parsed.syncRunId },
      create: {
        syncRunId: parsed.syncRunId,
        phase: 'succeed',
        counts: {},
      },
      update: {
        phase: 'succeed',
        counts: {},
      },
    });
    await db.hostedSyncTask.update({
      where: { dedupeKey: parsed.dedupeKey },
      data: {
        status: 'completed',
        completedAt: new Date(),
        error: null,
      },
    });
  } catch (err) {
    await db.syncRunCheckpoint.upsert({
      where: { syncRunId: parsed.syncRunId },
      create: {
        syncRunId: parsed.syncRunId,
        phase: 'fail',
        counts: {},
      },
      update: {
        phase: 'fail',
        counts: {},
      },
    }).catch(() => undefined);
    await db.hostedSyncTask.update({
      where: { dedupeKey: parsed.dedupeKey },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: err instanceof Error ? err.message.slice(0, 1000) : String(err),
      },
    }).catch(() => undefined);
    throw err;
  }
}

export async function processHostedTickMessage(message: unknown): Promise<void> {
  HostedTickMessageSchema.parse(message);
  await markHostedTickSeen();
  await assertHostedWriteAllowed('scheduled_sync');

  const db = getPrismaClient();
  const scopes = await db.flowScope.findMany({
    where: { status: 'active' },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  });
  const now = Date.now();
  const minInterval = getConfig().HOSTED_BETA_MIN_SCHEDULED_SYNC_INTERVAL_MINUTES;

  for (const scope of scopes) {
    await maybeEnqueueHostedScheduledSync(scope.workspaceId, scope.id, Math.max(scope.syncIntervalMinutes, minInterval), now)
      .catch((err: unknown) => {
        logger.warn('Hosted scheduled sync dispatch failed', {
          scopeId: scope.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  await scheduleHostedSyncTick(getConfig().HOSTED_BETA_TICK_INTERVAL_MINUTES * 60);
}

export async function scheduleHostedSyncTick(delaySeconds = 0): Promise<void> {
  const intervalSeconds = getConfig().HOSTED_BETA_TICK_INTERVAL_MINUTES * 60;
  const slot = String(Math.floor((Date.now() + delaySeconds * 1000) / (intervalSeconds * 1000)));
  const idempotencyKey = `${QUEUE_NAMES.HOSTED_SYNC_TICK}:${slot}`;
  await send(
    QUEUE_NAMES.HOSTED_SYNC_TICK,
    { type: 'tick', slot },
    {
      idempotencyKey,
      delaySeconds,
      retentionSeconds: 24 * 60 * 60,
    },
  );
}

export async function shouldReseedHostedSyncTick(): Promise<boolean> {
  const latestTick = await getPrismaClient().hostedUsageCounter.findFirst({
    where: { key: 'hosted_sync_tick_seen' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!latestTick) return true;

  const maxAgeMs = getConfig().HOSTED_BETA_TICK_INTERVAL_MINUTES * 2 * 60 * 1000;
  return Date.now() - latestTick.updatedAt.getTime() > maxAgeMs;
}

async function maybeEnqueueHostedScheduledSync(
  workspaceId: string,
  scopeId: string,
  intervalMinutes: number,
  now: number,
): Promise<void> {
  const db = getPrismaClient();
  const syncRun = await db.$transaction(async (tx) => {
    await acquireScopeSyncLock(tx, scopeId);
    const activeRun = await resolveActiveSyncRun(tx, workspaceId, scopeId);
    if (activeRun) return null;

    const lastStartedRun = await tx.syncRun.findFirst({
      where: {
        scopeId,
        startedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (lastStartedRun && now - lastStartedRun.startedAt!.getTime() < intervalMinutes * 60 * 1000) {
      return null;
    }

    return createSyncRun(tx, { scopeId, trigger: 'scheduled' });
  });
  if (!syncRun) return;

  try {
    await enqueueScopeSyncJob({
      scopeId,
      syncRunId: syncRun.id,
      trigger: 'scheduled',
    });
  } catch (err) {
    await updateSyncRun(db, syncRun.id, {
      status: 'canceled',
      finishedAt: new Date(),
      errorCode: 'SYNC_ENQUEUE_FAILED',
      errorSummary: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
}

async function markHostedTickSeen(): Promise<void> {
  await getPrismaClient().hostedUsageCounter.create({
    data: {
      key: 'hosted_sync_tick_seen',
      period: 'singleton',
      value: 1,
    },
  });
}
