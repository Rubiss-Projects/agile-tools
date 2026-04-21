import { PgBoss } from 'pg-boss';
import { getConfig, logger, QUEUE_NAMES } from '@agile-tools/shared';

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

/**
 * Send a scope sync job to the pg-boss queue from the web process.
 * The singletonKey prevents duplicate queued jobs for the same scope.
 * Returns the pg-boss job ID, or null if a job for this scope was already queued
 * (deduplication). The caller should have already prevented this via a DB check.
 */
export async function enqueueScopeSyncJob(data: ScopeSyncJobData): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE_NAMES.SCOPE_SYNC, data, {
    singletonKey: data.scopeId,
    retryLimit: 1,
    expireInSeconds: JOB_EXPIRY_SECONDS,
  });
}
