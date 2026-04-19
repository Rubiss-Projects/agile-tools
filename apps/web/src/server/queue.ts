import PgBoss from 'pg-boss';
import { getConfig, logger } from '@agile-tools/shared';

// Must match the queue name used by the worker.
const SCOPE_SYNC_QUEUE = 'scope:sync';

let _boss: PgBoss | undefined;

async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;

  const { DATABASE_URL } = getConfig();
  _boss = new PgBoss({
    connectionString: DATABASE_URL,
    deleteAfterDays: 1,
    retentionDays: 7,
  });

  _boss.on('error', (err: Error) => {
    logger.error('pg-boss error (web publisher)', { error: err.message });
  });

  await _boss.start();
  await _boss.createQueue(SCOPE_SYNC_QUEUE);
  return _boss;
}

export interface ScopeSyncJobData {
  scopeId: string;
  syncRunId: string;
  requestedBy?: string;
  trigger: 'manual' | 'scheduled';
}

/**
 * Send a scope sync job to the pg-boss queue from the web process.
 * The singletonKey prevents duplicate queued jobs for the same scope.
 * Returns the pg-boss job ID, or null if a job for this scope was already queued
 * (deduplication). The caller should have already prevented this via a DB check.
 */
export async function enqueueScopeSyncJob(data: ScopeSyncJobData): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(SCOPE_SYNC_QUEUE, data, {
    singletonKey: data.scopeId,
    retryLimit: 1,
    expireInMinutes: 60,
  });
}
