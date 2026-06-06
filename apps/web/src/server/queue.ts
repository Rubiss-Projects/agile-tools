import { PgBoss } from 'pg-boss';
import { send } from '@vercel/queue';
import {
  getConfig,
  logger,
  QUEUE_NAMES,
} from '@agile-tools/shared';
import { getPrismaClient, incrementHostedUsageCounter } from '@agile-tools/db';

const COMPLETED_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const JOB_EXPIRY_SECONDS = 60 * 60;

let _boss: PgBoss | undefined;

async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;

  const { DATABASE_URL } = getConfig();
  _boss = new PgBoss({
    connectionString: DATABASE_URL,
  });

  _boss.on('error', (err: Error) => {
    logger.error('pg-boss error (web publisher)', { error: err.message });
  });

  await _boss.start();
  await _boss.createQueue(QUEUE_NAMES.SCOPE_SYNC, {
    deleteAfterSeconds: COMPLETED_JOB_RETENTION_SECONDS,
    retentionSeconds: JOB_RETENTION_SECONDS,
  });
  return _boss;
}

export interface ScopeSyncJobData {
  scopeId: string;
  syncRunId: string;
  requestedBy?: string;
  trigger: 'manual' | 'scheduled';
}

export interface SyncDispatchBackend {
  enqueueScopeSync(input: {
    scopeId: string;
    syncRunId: string;
    requestedBy?: string;
    trigger: 'manual' | 'scheduled';
  }): Promise<{ messageId: string | null }>;
}

/**
 * Send a scope sync job to the pg-boss queue from the web process.
 * The singletonKey prevents duplicate queued jobs for the same scope.
 * Returns the pg-boss job ID, or null if a job for this scope was already queued
 * (deduplication). The caller should have already prevented this via a DB check.
 */
export async function enqueueScopeSyncJob(data: ScopeSyncJobData): Promise<string | null> {
  if (getConfig().SYNC_BACKEND === 'vercel_queues') {
    const result = await new VercelQueuesSyncDispatchBackend().enqueueScopeSync(data);
    return result.messageId ?? data.syncRunId;
  }

  const result = await new PgBossSyncDispatchBackend().enqueueScopeSync(data);
  return result.messageId;
}

class PgBossSyncDispatchBackend implements SyncDispatchBackend {
  async enqueueScopeSync(data: ScopeSyncJobData): Promise<{ messageId: string | null }> {
    const boss = await getBoss();
    const messageId = await boss.send(QUEUE_NAMES.SCOPE_SYNC, data, {
      singletonKey: data.scopeId,
      retryLimit: 1,
      expireInSeconds: JOB_EXPIRY_SECONDS,
    });
    return { messageId };
  }
}

class VercelQueuesSyncDispatchBackend implements SyncDispatchBackend {
  async enqueueScopeSync(data: ScopeSyncJobData): Promise<{ messageId: string | null }> {
    const prisma = getPrismaClient();
    const dedupeKey = `${QUEUE_NAMES.HOSTED_SYNC}:${data.syncRunId}:initialize`;
    await prisma.hostedSyncTask.upsert({
      where: { dedupeKey },
      create: {
        syncRunId: data.syncRunId,
        scopeId: data.scopeId,
        phase: 'initialize',
        dedupeKey,
      },
      update: {},
    });

    const result = await send(
      QUEUE_NAMES.HOSTED_SYNC,
      {
        type: 'scope-sync',
        scopeId: data.scopeId,
        syncRunId: data.syncRunId,
        phase: 'initialize',
        dedupeKey,
        trigger: data.trigger,
        requestedBy: data.requestedBy,
      },
      {
        idempotencyKey: dedupeKey,
        retentionSeconds: JOB_RETENTION_SECONDS,
      },
    );
    await incrementHostedUsageCounter(prisma, 'vercel_queue_operations');

    return { messageId: result.messageId };
  }
}
