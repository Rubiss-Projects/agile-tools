import { beforeEach, describe, expect, it, vi } from 'vitest';

const runScopeSync = vi.fn();
const updateMany = vi.fn();
const findUnique = vi.fn();
const syncRunCheckpointUpsert = vi.fn();
const hostedSyncTaskUpdate = vi.fn();

vi.mock('@agile-tools/worker/sync', () => ({
  runScopeSync,
}));

vi.mock('@agile-tools/db', () => ({
  getPrismaClient: () => ({
    hostedSyncTask: {
      updateMany,
      findUnique,
      update: hostedSyncTaskUpdate,
    },
    syncRunCheckpoint: {
      upsert: syncRunCheckpointUpsert,
    },
  }),
}));

vi.mock('@agile-tools/shared', () => ({
  getConfig: () => ({
    HOSTED_BETA_TICK_INTERVAL_MINUTES: 15,
    HOSTED_BETA_MIN_SCHEDULED_SYNC_INTERVAL_MINUTES: 1440,
  }),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
  QUEUE_NAMES: {
    HOSTED_SYNC: 'hosted-sync',
    HOSTED_SYNC_TICK: 'hosted-sync-tick',
  },
}));

vi.mock('@vercel/queue', () => ({
  send: vi.fn(),
}));

vi.mock('./queue', () => ({
  enqueueScopeSyncJob: vi.fn(),
}));

vi.mock('./hosted-policy', () => ({
  assertHostedWriteAllowed: vi.fn(),
}));

describe('processHostedScopeSyncMessage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('acknowledges a duplicate delivery for a running task without completing it', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ status: 'running' });

    const { processHostedScopeSyncMessage } = await import('./hosted-sync');

    await processHostedScopeSyncMessage({
      type: 'scope-sync',
      scopeId: '00000000-0000-4000-8000-000000000001',
      syncRunId: '00000000-0000-4000-8000-000000000002',
      phase: 'initialize',
      dedupeKey: 'hosted-sync:scope:run',
      trigger: 'manual',
      requestedBy: 'user-1',
    });

    expect(runScopeSync).not.toHaveBeenCalled();
    expect(syncRunCheckpointUpsert).not.toHaveBeenCalled();
    expect(hostedSyncTaskUpdate).not.toHaveBeenCalled();
  });

  it('requires the stored task identity to match the queue message before running sync', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({
      status: 'queued',
      scopeId: '00000000-0000-4000-8000-000000000099',
      syncRunId: '00000000-0000-4000-8000-000000000098',
      phase: 'initialize',
    });

    const { processHostedScopeSyncMessage } = await import('./hosted-sync');

    await processHostedScopeSyncMessage({
      type: 'scope-sync',
      scopeId: '00000000-0000-4000-8000-000000000001',
      syncRunId: '00000000-0000-4000-8000-000000000002',
      phase: 'initialize',
      dedupeKey: 'hosted-sync:scope:run',
      trigger: 'manual',
      requestedBy: 'user-1',
    });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        dedupeKey: 'hosted-sync:scope:run',
        scopeId: '00000000-0000-4000-8000-000000000001',
        syncRunId: '00000000-0000-4000-8000-000000000002',
        phase: 'initialize',
      }),
    }));
    expect(runScopeSync).not.toHaveBeenCalled();
    expect(syncRunCheckpointUpsert).not.toHaveBeenCalled();
    expect(hostedSyncTaskUpdate).not.toHaveBeenCalled();
  });
});
