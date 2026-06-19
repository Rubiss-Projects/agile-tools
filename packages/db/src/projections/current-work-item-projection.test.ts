import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { queryHoldReviewItems, queryHoldStatusOptions } from './current-work-item-projection.js';

function d(value: string): Date {
  return new Date(value);
}

describe('queryHoldReviewItems', () => {
  it('returns current hold items outside the active flow chart and derives flow age from lifecycle history', async () => {
    const db = {
      workItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '11111111-1111-4111-8111-111111111111',
            scopeId: 'scope-1',
            issueKey: 'AGILE-202',
            summary: 'Waiting on vendor approval',
            issueTypeId: 'story',
            issueTypeName: 'Story',
            currentStatusId: '50',
            currentStatusName: 'On Hold',
            currentColumn: null,
            assigneeName: null,
            startedAt: null,
            directUrl: 'https://jira.example.internal/browse/AGILE-202',
            holdPeriods: [
              { startedAt: d('2025-01-08T00:00:00Z'), endedAt: null },
            ],
            lifecycleEvents: [
              { toStatusId: '10', changedAt: d('2025-01-06T00:00:00Z') },
              { toStatusId: '50', changedAt: d('2025-01-08T00:00:00Z') },
            ],
          },
        ]),
      },
    };

    const rows = await queryHoldReviewItems(db as unknown as PrismaClient, 'scope-1', {
      dataVersion: 'sync-1',
      timezone: 'UTC',
      now: d('2025-01-10T00:00:00Z'),
      startStatusIds: ['10'],
      holdStatusOptions: [
        { id: '50', name: 'On Hold', placement: 'off_board', onBoard: false },
      ],
    });

    expect(db.workItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        holdPeriods: { some: { endedAt: null } },
        lastSyncRunId: 'sync-1',
      }),
    }));
    expect(rows).toEqual([
      expect.objectContaining({
        issueKey: 'AGILE-202',
        placement: 'off_board',
        holdAgeDays: 2,
        flowAgeDays: 4,
      }),
    ]);
  });
});

describe('queryHoldStatusOptions', () => {
  it('classifies workflow statuses by their board placement', async () => {
    const db = {
      boardSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          columns: [
            { name: 'Backlog', statusIds: ['5'] },
            { name: 'In Progress', statusIds: ['10', '20'] },
            { name: 'Done', statusIds: ['30'] },
          ],
          workflowStatuses: [
            { id: '5', name: 'Selected' },
            { id: '10', name: 'In Progress' },
            { id: '20', name: 'Blocked' },
            { id: '30', name: 'Done' },
            { id: '50', name: 'On Hold' },
          ],
        }),
      },
    };

    const options = await queryHoldStatusOptions(db as unknown as PrismaClient, 'scope-1', {
      dataVersion: 'sync-1',
      startStatusIds: ['10'],
      doneStatusIds: ['30'],
    });

    expect(options).toEqual([
      { id: '5', name: 'Selected', placement: 'before_start', onBoard: true },
      { id: '10', name: 'In Progress', placement: 'in_flow', onBoard: true },
      { id: '20', name: 'Blocked', placement: 'in_flow', onBoard: true },
      { id: '30', name: 'Done', placement: 'done', onBoard: true },
      { id: '50', name: 'On Hold', placement: 'off_board', onBoard: false },
    ]);
  });
});
