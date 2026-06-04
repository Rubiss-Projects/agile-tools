import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock('@agile-tools/db', () => ({
  getPrismaClient: vi.fn(),
  getFlowScope: vi.fn(),
  getWorkItemWithDetail: vi.fn(),
  getBoardColumnMappingsForDataVersion: vi.fn(),
}));

const { GET } = await import('./route');
const { requireWorkspaceContext } = await import('@/server/auth');
const { getPrismaClient, getFlowScope, getWorkItemWithDetail } = await import('@agile-tools/db');

describe('GET /api/v1/scopes/:scopeId/items/:workItemId', () => {
  beforeEach(() => {
    vi.mocked(requireWorkspaceContext).mockResolvedValue({
      workspaceId: 'workspace-1',
      userId: 'user-1',
    } as never);
    vi.mocked(getFlowScope).mockResolvedValue({
      id: 'scope-1',
      workspaceId: 'workspace-1',
      timezone: 'UTC',
    } as never);
  });

  it('returns timeline status names when matching status ids are known', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { currentStatusId: '10000', currentStatusName: 'Selected for Development', currentColumn: null },
      { currentStatusId: '10001', currentStatusName: 'In Progress', currentColumn: null },
      { currentStatusId: '3', currentStatusName: 'Done', currentColumn: null },
    ]);
    vi.mocked(getPrismaClient).mockReturnValue({
      workItem: { findMany },
    } as never);
    vi.mocked(getWorkItemWithDetail).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      issueKey: 'PROJ-1',
      summary: 'Timeline rendering bug',
      currentStatusId: '10001',
      currentStatusName: 'In Progress',
      currentColumn: 'In Progress',
      assigneeName: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      jiraUpdatedAt: new Date('2026-05-31T14:00:00.000Z'),
      latestCommentAuthor: 'Morgan Lee',
      latestCommentBody: 'I pushed the review fixes and am waiting on validation.',
      latestCommentCreatedAt: new Date('2026-05-31T13:30:00.000Z'),
      startedAt: new Date('2026-05-02T00:00:00.000Z'),
      completedAt: null,
      directUrl: 'https://jira.example/browse/PROJ-1',
      holdPeriods: [],
      lifecycleEvents: [
        {
          eventType: 'status_change',
          fromStatusId: '10000',
          toStatusId: '10001',
          changedAt: new Date('2026-05-10T00:00:00.000Z'),
        },
        {
          eventType: 'status_change',
          fromStatusId: '10001',
          toStatusId: '3',
          changedAt: new Date('2026-05-22T00:00:00.000Z'),
        },
        {
          eventType: 'status_change',
          fromStatusId: '3',
          toStatusId: '99999',
          changedAt: new Date('2026-05-30T00:00:00.000Z'),
        },
      ],
    } as never);

    const response = await GET(
      new NextRequest('http://localhost/api/v1/scopes/scope-1/items/work-item-1'),
      { params: Promise.resolve({ scopeId: 'scope-1', workItemId: 'work-item-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lifecycleEvents).toEqual([
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'Selected for Development',
        toStatus: 'In Progress',
      }),
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'In Progress',
        toStatus: 'Done',
      }),
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'Done',
        toStatus: '99999',
      }),
    ]);
    expect(body.jiraUpdatedAt).toBe('2026-05-31T14:00:00.000Z');
    expect(typeof body.jiraUpdatedAgeWorkingDays).toBe('number');
    expect(body.latestComment).toEqual({
      author: 'Morgan Lee',
      body: 'I pushed the review fixes and am waiting on validation.',
      createdAt: '2026-05-31T13:30:00.000Z',
      ageWorkingDays: expect.any(Number),
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { scopeId: 'scope-1', currentStatusId: { in: ['10000', '10001', '3', '99999'] } },
      select: { currentStatusId: true, currentStatusName: true, currentColumn: true },
      distinct: ['currentStatusId'],
    });
  });
});
