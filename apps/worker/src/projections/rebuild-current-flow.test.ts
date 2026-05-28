import { describe, expect, it, vi } from 'vitest';

vi.mock('@agile-tools/shared', async (importActual) => {
  const actual = await importActual<typeof import('@agile-tools/shared')>();
  return {
    ...actual,
    logger: {
      info: vi.fn(),
    },
  };
});

import { rebuildCurrentFlowProjection } from './rebuild-current-flow.js';

describe('rebuildCurrentFlowProjection', () => {
  it('queries completed stories only from the current sync run', async () => {
    const now = new Date('2026-05-28T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());

    const db = {
      flowScope: {
        findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      workItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            startedAt: new Date('2026-05-25T12:00:00.000Z'),
            completedAt: new Date('2026-05-28T12:00:00.000Z'),
            createdAt: new Date('2026-05-24T12:00:00.000Z'),
          },
        ]),
      },
      agingThresholdModel: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    await rebuildCurrentFlowProjection(
      db as unknown as Parameters<typeof rebuildCurrentFlowProjection>[0],
      'scope-1',
      'sync-run-2',
      { historicalWindowDays: 90 },
    );

    expect(db.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scopeId: 'scope-1',
          completedAt: { not: null, gte: new Date('2026-02-27T12:00:00.000Z') },
          excludedReason: null,
          lastSyncRunId: 'sync-run-2',
        }),
      }),
    );
  });
});
