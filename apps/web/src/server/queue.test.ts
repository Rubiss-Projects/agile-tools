import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createQueue = vi.fn().mockResolvedValue(undefined);
const send = vi.fn().mockResolvedValue('job-123');
const start = vi.fn().mockResolvedValue(undefined);
const on = vi.fn();

vi.mock('pg-boss', () => ({
  PgBoss: class MockPgBoss {
    on = on;
    start = start;
    createQueue = createQueue;
    send = send;
  },
}));

vi.mock('@agile-tools/shared', () => ({
  getConfig: () => ({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agile_tools' }),
  logger: {
    error: vi.fn(),
  },
  QUEUE_NAMES: {
    SCOPE_SYNC: 'scope-sync',
    PROJECTION_REBUILD: 'scope-rebuild-projections',
  },
}));

describe('enqueueScopeSyncJob', () => {
  beforeEach(() => {
    vi.resetModules();
    createQueue.mockClear();
    send.mockClear();
    start.mockClear();
    on.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the shared scope-sync queue for createQueue and send', async () => {
    const { enqueueScopeSyncJob } = await import('./queue');

    const jobId = await enqueueScopeSyncJob({
      scopeId: 'scope-1',
      syncRunId: 'sync-run-1',
      requestedBy: 'user-1',
      trigger: 'manual',
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(createQueue).toHaveBeenCalledWith(
      'scope-sync',
      expect.objectContaining({
        deleteAfterSeconds: 24 * 60 * 60,
        retentionSeconds: 7 * 24 * 60 * 60,
      }),
    );
    expect(send).toHaveBeenCalledWith(
      'scope-sync',
      expect.objectContaining({
        scopeId: 'scope-1',
        syncRunId: 'sync-run-1',
        requestedBy: 'user-1',
        trigger: 'manual',
      }),
      expect.objectContaining({ singletonKey: 'scope-1' }),
    );
    expect(jobId).toBe('job-123');
  });
});