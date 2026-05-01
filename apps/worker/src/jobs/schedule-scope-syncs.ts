import type { PrismaClient } from '@agile-tools/db';
import { acquireScopeSyncLock, createSyncRun, resolveActiveSyncRun, updateSyncRun } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import type { PgBoss } from 'pg-boss';
import { getQueue, QUEUE_NAMES } from '../lib/queue.js';

const DISPATCH_QUEUE_NAME = 'scope-sync-dispatch';

/**
 * Register the scope sync dispatch job and its 1-minute recurring cron schedule.
 *
 * Every minute, the dispatch handler inspects all active scopes and enqueues a
 * `scope-sync` job for any scope whose last sync run started more than
 * `syncIntervalMinutes` ago (or that has never synced).
 *
 * This approach avoids the pg-boss limitation where `schedule(name, cron, …)` uses
 * `name` as both the schedule ID and the destination queue name — which would require
 * a separate registered worker per scope if per-scope cron schedules were used.
 */
export async function registerScopeSyncDispatch(db: PrismaClient): Promise<void> {
  const boss = getQueue();

  await boss.createQueue(DISPATCH_QUEUE_NAME);

  await boss.work<Record<string, never>>(
    DISPATCH_QUEUE_NAME,
    { batchSize: 1 },
    () => dispatchDueScopes(boss, db),
  );

  // Fire once per minute; the handler decides which scopes are actually due.
  await boss.schedule(DISPATCH_QUEUE_NAME, '* * * * *', {});

  logger.info('Scope sync dispatch job registered');
}

async function dispatchDueScopes(boss: PgBoss, db: PrismaClient): Promise<void> {
  const activeScopes = await db.flowScope.findMany({ where: { status: 'active' } });
  const now = Date.now();

  for (const scope of activeScopes) {
    try {
      await maybeDispatchScopeSync(boss, db, scope.workspaceId, scope.id, scope.syncIntervalMinutes, now);
    } catch (err) {
      // Log per-scope failures and continue — don't let one scope block others.
      logger.error('Failed to dispatch sync for scope', {
        scopeId: scope.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function maybeDispatchScopeSync(
  boss: PgBoss,
  db: PrismaClient,
  workspaceId: string,
  scopeId: string,
  intervalMinutes: number,
  now: number,
): Promise<void> {
  const syncRun = await db.$transaction(async (tx) => {
    await acquireScopeSyncLock(tx, scopeId);

    const activeSyncRun = await resolveActiveSyncRun(tx, workspaceId, scopeId);
    if (activeSyncRun) return null;

    const lastStartedRun = await tx.syncRun.findFirst({
      where: {
        scopeId,
        startedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
    });

    const intervalMs = intervalMinutes * 60 * 1000;
    const isDue = !lastStartedRun || now - lastStartedRun.startedAt!.getTime() >= intervalMs;
    if (!isDue) return null;

    return createSyncRun(tx, { scopeId, trigger: 'scheduled' });
  });
  if (!syncRun) return;

  let jobId: string | null;
  try {
    jobId = await boss.send(
      QUEUE_NAMES.SCOPE_SYNC,
      { scopeId, syncRunId: syncRun.id, trigger: 'scheduled' },
      {
        singletonKey: scopeId, // extra guard: only one pending job per scope in the queue
        retryLimit: 1,
        expireInSeconds: 60 * 60,
      },
    );
  } catch (err) {
    await updateSyncRun(db, syncRun.id, {
      status: 'canceled',
      finishedAt: new Date(),
      errorCode: 'SYNC_ENQUEUE_FAILED',
      errorSummary: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }

  if (jobId) {
    logger.info('Dispatched scheduled scope sync', { scopeId, syncRunId: syncRun.id });
  } else {
    await updateSyncRun(db, syncRun.id, {
      status: 'canceled',
      finishedAt: new Date(),
      errorCode: 'SYNC_ENQUEUE_DEDUPED',
      errorSummary: 'pg-boss did not enqueue the scheduled scope sync job.',
    });
    logger.debug('Scope sync job already queued (singletonKey dedup)', { scopeId, syncRunId: syncRun.id });
  }
}
