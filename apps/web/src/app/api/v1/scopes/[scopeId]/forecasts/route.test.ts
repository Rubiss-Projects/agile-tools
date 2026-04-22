import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { InvalidTimeZoneError } from '@agile-tools/shared';

vi.mock('@/server/auth', () => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock('@/server/request-security', () => ({
  assertTrustedMutationRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('@agile-tools/db', () => ({
  getPrismaClient: vi.fn(() => ({
    forecastResultCache: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  })),
  getFlowScope: vi.fn(),
  getLastSucceededSyncRun: vi.fn(),
  getSyncRunByDataVersion: vi.fn(),
  queryDailyThroughput: vi.fn(),
  computeForecastRequestHash: vi.fn(() => 'hash-1'),
  lookupForecastCache: vi.fn().mockResolvedValue(null),
  storeForecastCache: vi.fn(),
  formatDateInTimezone: vi.fn(),
}));

const { POST } = await import('./route');
const { requireWorkspaceContext } = await import('@/server/auth');
const {
  getFlowScope,
  getLastSucceededSyncRun,
  queryDailyThroughput,
} = await import('@agile-tools/db');

describe('POST /api/v1/scopes/:scopeId/forecasts', () => {
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

    const response = await POST(
      new NextRequest('http://localhost/api/v1/scopes/scope-1/forecasts', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'when',
          remainingStoryCount: 12,
          historicalWindowDays: 90,
          confidenceLevels: [85],
        }),
      }),
      { params: Promise.resolve({ scopeId: 'scope-1' }) },
    );

    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.code).toBe('INVALID_SCOPE_TIMEZONE');
    expect(body.message).toContain('ETC');
    expect(body.message).toContain('America/New_York');
  });
});