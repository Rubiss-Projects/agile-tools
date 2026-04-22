import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { InvalidTimeZoneError } from '@agile-tools/shared';

vi.mock('@/server/auth', () => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock('@agile-tools/db', () => ({
  getPrismaClient: vi.fn(() => ({})),
  getFlowScope: vi.fn(),
  getLastSucceededSyncRun: vi.fn(),
  getSyncRunByDataVersion: vi.fn(),
  queryDailyThroughput: vi.fn(),
}));

const { GET } = await import('./route');
const { requireWorkspaceContext } = await import('@/server/auth');
const {
  getFlowScope,
  getLastSucceededSyncRun,
  queryDailyThroughput,
} = await import('@agile-tools/db');

describe('GET /api/v1/scopes/:scopeId/throughput', () => {
  beforeEach(() => {
    vi.mocked(requireWorkspaceContext).mockResolvedValue({
      workspaceId: 'workspace-1',
      userId: 'user-1',
    } as never);
    vi.mocked(getFlowScope).mockResolvedValue({
      id: 'scope-1',
      workspaceId: 'workspace-1',
      timezone: 'ETC',
    } as never);
    vi.mocked(getLastSucceededSyncRun).mockResolvedValue({
      dataVersion: 'sync-1',
      finishedAt: new Date('2026-04-21T00:00:00Z'),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an actionable 409 when the scope timezone is invalid', async () => {
    vi.mocked(queryDailyThroughput).mockRejectedValue(new InvalidTimeZoneError('ETC'));

    const response = await GET(
      new NextRequest('http://localhost/api/v1/scopes/scope-1/throughput'),
      { params: Promise.resolve({ scopeId: 'scope-1' }) },
    );

    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.code).toBe('INVALID_SCOPE_TIMEZONE');
    expect(body.message).toContain('ETC');
    expect(body.message).toContain('UTC');
  });
});