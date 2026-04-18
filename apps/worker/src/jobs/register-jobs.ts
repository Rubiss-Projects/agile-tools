import { getQueue, QUEUE_NAMES } from '../lib/queue.js';
import { getPrismaClient, createSyncRun } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import type PgBoss from 'pg-boss';
import { runScopeSync } from '../sync/run-scope-sync.js';

// Job data shapes — these are the payloads stored in pg-boss job records.
interface ScopeSyncJobData {
  scopeId: string;
  /** Present for manual syncs enqueued by the web API (SyncRun was pre-created). */
  syncRunId?: string;
  requestedBy?: string;
  trigger?: 'manual' | 'scheduled';
}

/**
 * Register all job handlers with the pg-boss queue instance.
 * This function is called once during worker startup.
 */
export async function registerJobs(): Promise<void> {
  const boss = getQueue();

  // ── Scope sync job ────────────────────────────────────────────────────────
  await boss.work<ScopeSyncJobData>(
    QUEUE_NAMES.SCOPE_SYNC,
    { batchSize: 1 },
    handleScopeSync,
  );

  logger.info('All jobs registered');
}

async function handleScopeSync(jobs: PgBoss.Job<ScopeSyncJobData>[]): Promise<void> {
  const db = getPrismaClient();

  for (const job of jobs) {
    const { scopeId, syncRunId: existingSyncRunId, trigger = 'scheduled' } = job.data;

    let syncRunId: string;

    if (existingSyncRunId) {
      // Manual sync: use the SyncRun created by the web API before enqueueing.
      syncRunId = existingSyncRunId;
    } else {
      // Scheduled sync: create a new SyncRun in the worker.
      const newRun = await createSyncRun(db, { scopeId, trigger: 'scheduled' });
      syncRunId = newRun.id;
    }

    logger.info('Scope sync job received', { jobId: job.id, scopeId, syncRunId, trigger });

    try {
      await runScopeSync(db, syncRunId);
    } catch (err) {
      // runScopeSync already marks the SyncRun as failed and logs the error.
      // Log here too so the job failure is visible at the queue level.
      logger.error('Scope sync job failed', {
        jobId: job.id,
        scopeId,
        syncRunId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
