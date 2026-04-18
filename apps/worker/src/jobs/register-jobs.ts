import { getQueue, QUEUE_NAMES } from '../lib/queue.js';
import { logger } from '@agile-tools/shared';
import type PgBoss from 'pg-boss';

// Job data shapes — these are the payloads stored in pg-boss job records.
interface ScopeSyncJobData {
  scopeId: string;
  requestedBy?: string;
  trigger?: 'manual' | 'scheduled';
}

/**
 * Register all job handlers with the pg-boss queue instance.
 * This function is called once during worker startup.
 *
 * Each handler is a placeholder stub that subsequent tasks (T016, T017, T018)
 * will replace with the actual sync, projection, and health-update logic.
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
  for (const job of jobs) {
    const { scopeId, trigger = 'scheduled' } = job.data;
    logger.info('Scope sync started', { jobId: job.id, scopeId, trigger });

    // Placeholder: the full sync pipeline is wired in T016 (run-scope-sync.ts).
    // This stub ensures the job queue is operational from day one so integration
    // tests can enqueue and dequeue jobs without importing unimplemented modules.

    logger.info('Scope sync completed (stub)', { jobId: job.id, scopeId });
  }
}
