import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  updateEpicForecastTargetById,
  upsertEpicForecastTarget,
  type UpdateEpicForecastTargetInput,
} from './epic-forecast-targets.js';

function baseUpdateInput(overrides?: Partial<UpdateEpicForecastTargetInput>): UpdateEpicForecastTargetInput {
  return {
    jiraIssueKey: 'AG-EPIC-1',
    summary: 'Checkout reliability hardening',
    dueDate: '2026-06-20',
    remainingStoryCount: 3,
    storyCountSource: 'epic_link',
    epicLinkStoryCount: 3,
    jiraStoryCount: null,
    manualStoryCount: null,
    status: 'active',
    closedAt: null,
    sortOrder: 1,
    ...overrides,
  };
}

describe('epic forecast targets repository', () => {
  it('clears stored Epic Link child keys when a target is edited to a different epic', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ jiraIssueKey: 'AG-EPIC-OLD', storyCountSource: 'epic_link' })
      .mockResolvedValueOnce({ id: 'target-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      epicForecastTarget: {
        findFirst,
        updateMany,
      },
    } as unknown as PrismaClient;

    await updateEpicForecastTargetById(db, 'scope-1', 'target-1', baseUpdateInput());

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jiraIssueKey: 'AG-EPIC-1',
          epicLinkIssueKeys: [],
        }),
      }),
    );
  });

  it('preserves stored Epic Link child keys when the target keeps the same epic and source', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ jiraIssueKey: 'AG-EPIC-1', storyCountSource: 'epic_link' })
      .mockResolvedValueOnce({ id: 'target-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      epicForecastTarget: {
        findFirst,
        updateMany,
      },
    } as unknown as PrismaClient;

    await updateEpicForecastTargetById(
      db,
      'scope-1',
      'target-1',
      baseUpdateInput({ dueDate: '2026-06-27' }),
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          epicLinkIssueKeys: expect.anything(),
        }),
      }),
    );
  });

  it('clears stored Epic Link child keys when an upsert changes a target away from Epic Link counts', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'target-1' });
    const db = {
      epicForecastTarget: {
        upsert,
      },
    } as unknown as PrismaClient;

    await upsertEpicForecastTarget(db, {
      scopeId: 'scope-1',
      jiraIssueKey: 'AG-EPIC-1',
      summary: 'Checkout reliability hardening',
      dueDate: '2026-06-20',
      remainingStoryCount: 3,
      storyCountSource: 'manual',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          storyCountSource: 'manual',
          epicLinkIssueKeys: [],
        }),
      }),
    );
  });
});
