import { PgBoss } from 'pg-boss';
import { logger, QUEUE_NAMES, type QueueName } from '@agile-tools/shared';

export { QUEUE_NAMES };
export type { QueueName };

const COMPLETED_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const JOB_EXPIRY_SECONDS = 60 * 60;

let _boss: PgBoss | undefined;

export async function initQueue(databaseUrl: string): Promise<PgBoss> {
  if (_boss) return _boss;

  _boss = new PgBoss({
    connectionString: databaseUrl,
  });

  _boss.on('error', (err: Error) => {
    logger.error('pg-boss error', { error: err.message, stack: err.stack });
  });

  await _boss.start();

  for (const queueName of Object.values(QUEUE_NAMES)) {
    await _boss.createQueue(queueName, {
      // Keep completed jobs for 1 day for observability.
      deleteAfterSeconds: COMPLETED_JOB_RETENTION_SECONDS,
      // Retain queued and retried jobs for 7 days for investigation.
      retentionSeconds: JOB_RETENTION_SECONDS,
    });
  }

  return _boss;
}

export function getQueue(): PgBoss {
  if (!_boss) {
    throw new Error('Queue has not been initialised. Call initQueue() first.');
  }
  return _boss;
}

export async function closeQueue(): Promise<void> {
  if (_boss) {
    await _boss.stop();
    _boss = undefined;
  }
}

/**
 * Schedule a recurring sync job for a scope with single-instance locking so
 * only one sync per scope can run at a time.
 */
export async function scheduleScopeSync(scopeId: string, intervalMinutes: number): Promise<void> {
  const boss = getQueue();
  const scheduleId = `${QUEUE_NAMES.SCOPE_SYNC}-${scopeId}`;

  await boss.schedule(scheduleId, `*/${intervalMinutes} * * * *`, { scopeId });
  logger.debug('Scheduled scope sync', { scopeId, intervalMinutes });
}

/**
 * Remove the recurring schedule for a scope (e.g. when a scope is paused or
 * deleted).
 */
export async function unscheduleScopeSync(scopeId: string): Promise<void> {
  const boss = getQueue();
  const scheduleId = `${QUEUE_NAMES.SCOPE_SYNC}-${scopeId}`;

  await boss.unschedule(scheduleId);
  logger.debug('Unscheduled scope sync', { scopeId });
}

/**
 * Enqueue a manual sync for a scope. The job is deduplicated by scopeId so
 * concurrent manual requests don't stack up.
 */
export function enqueueScopeSync(
  scopeId: string,
  requestedBy: string,
): Promise<string | null> {
  const boss = getQueue();
  return boss.send(
    QUEUE_NAMES.SCOPE_SYNC,
    { scopeId, requestedBy, trigger: 'manual' },
    {
      // Deduplication key: only one manual sync per scope in the queue at a time.
      singletonKey: scopeId,
      retryLimit: 1,
      expireInSeconds: JOB_EXPIRY_SECONDS,
    },
  );
}
