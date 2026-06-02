import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock('@/server/request-security', () => ({
  assertTrustedMutationRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('@agile-tools/db', () => ({
  deleteEpicForecastTarget: vi.fn(),
  getFlowScope: vi.fn(),
  getJiraConnection: vi.fn(),
  getPrismaClient: vi.fn(() => ({})),
  updateEpicForecastTargetById: vi.fn(),
}));

const { PATCH } = await import('./route');
const { requireWorkspaceContext } = await import('@/server/auth');
const {
  getFlowScope,
  getJiraConnection,
  updateEpicForecastTargetById,
} = await import('@agile-tools/db');

const scopeId = '00000000-0000-4000-8000-000000000003';
const targetId = '00000000-0000-4000-8000-000000006001';

describe('PATCH /api/v1/scopes/:scopeId/epic-forecasts/:targetId', () => {
  beforeEach(() => {
    vi.mocked(requireWorkspaceContext).mockResolvedValue({
      workspaceId: 'workspace-1',
      userId: 'user-1',
    } as never);
    vi.mocked(getFlowScope).mockResolvedValue({
      id: scopeId,
      workspaceId: 'workspace-1',
      connectionId: 'connection-1',
    } as never);
    vi.mocked(getJiraConnection).mockResolvedValue({
      id: 'connection-1',
      baseUrl: 'https://jira.local.example',
    } as never);
    vi.mocked(updateEpicForecastTargetById).mockResolvedValue({
      id: targetId,
      scopeId,
      jiraIssueKey: 'AG-EPIC-1',
      summary: 'Checkout reliability hardening',
      dueDate: '2026-06-20',
      remainingStoryCount: 0,
      storyCountSource: 'epic_link',
      epicLinkStoryCount: 0,
      jiraStoryCount: null,
      manualStoryCount: null,
      status: 'active',
      closedAt: null,
      sortOrder: 1,
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves null manual story counts for non-manual sources with zero remaining stories', async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost/api/v1/scopes/${scopeId}/epic-forecasts/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraIssueKey: 'ag-epic-1',
          summary: 'Checkout reliability hardening',
          dueDate: '2026-06-20',
          remainingStoryCount: 0,
          storyCountSource: 'epic_link',
          epicLinkStoryCount: 0,
          manualStoryCount: null,
        }),
      }),
      { params: Promise.resolve({ scopeId, targetId }) },
    );

    expect(response.status).toBe(200);
    expect(updateEpicForecastTargetById).toHaveBeenCalledWith(
      expect.anything(),
      scopeId,
      targetId,
      expect.objectContaining({
        jiraIssueKey: 'AG-EPIC-1',
        remainingStoryCount: 0,
        storyCountSource: 'epic_link',
        epicLinkStoryCount: 0,
        manualStoryCount: null,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      remainingStoryCount: 0,
      storyCountSource: 'epic_link',
      manualStoryCount: null,
    });
  });
});
