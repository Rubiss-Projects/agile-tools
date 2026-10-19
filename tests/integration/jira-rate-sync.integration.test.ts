import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient, disconnectPrisma, createPostgresJiraRateLimiter, claimConnectionSync, releaseConnectionSync, renewConnectionSync } from '@agile-tools/db';
import { encryptSecret, resetConfig, JiraRateStateSchema } from '@agile-tools/shared';
import { runScopeSync } from '../../apps/worker/src/sync/run-scope-sync';
import { cancelActiveSyncRuns, trackActiveSyncRun, WORKER_SHUTDOWN_SYNC_ERROR_CODE } from '../../apps/worker/src/jobs/active-sync-runs';
import { startPostgres, stopPostgres } from './support/postgres';

const key = 'integration-encryption-key-at-least-32-characters';
let connectionId: string;
let workspaceId: string;
let issueCount = 100;
let blocked = false;
let missingBoard = false;
let removedFirstIssue = false;
let changedSecondIssue = false;
let missingThirdTimestamp = false;
let columnName = 'Doing';
const requests: string[] = [];

beforeAll(async () => {
  const postgres = await startPostgres();
  vi.stubEnv('DATABASE_URL', postgres.connectionUrl);
  vi.stubEnv('ENCRYPTION_KEY', key);
  vi.stubEnv('JIRA_RATE_RETRY_BUDGET_MS', '1000');
  vi.stubEnv('LOG_LEVEL', 'error');
  resetConfig();
  await disconnectPrisma();
});
afterAll(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetConfig();
  await disconnectPrisma(); await stopPostgres();
});

beforeEach(async () => {
  requests.length = 0; blocked = false; missingBoard = false; removedFirstIssue = false; issueCount = 100;
  changedSecondIssue = false; missingThirdTimestamp = false;
  columnName = 'Doing';
  const db = getPrismaClient();
  const workspace = await db.workspace.create({ data: { name: `rate-test-${crypto.randomUUID()}`, defaultTimezone: 'UTC' } });
  workspaceId = workspace.id;
  const connection = await db.jiraConnection.create({ data: {
    workspaceId, baseUrl: 'https://fake-jira.test', encryptedSecretRef: encryptSecret('service-pat', key),
    jiraVersion: '9.0', jiraDeploymentType: 'Server', changelogStrategy: 'issue_expand',
  } });
  connectionId = connection.id;
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    const url = new URL(input);
    const path = url.pathname;
    requests.push(path);
    // Accelerated bucket for persistence tests; exact 120/minute pacing is tested with a virtual clock.
    const headers = { 'X-RateLimit-Limit': '240', 'X-RateLimit-Remaining': '200', 'X-RateLimit-FillRate': '120000', 'X-RateLimit-Interval-Seconds': '60', 'Retry-After': '0' };
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
    if (path.endsWith('/configuration')) return missingBoard ? json({}, 404) : json({ name: 'Board', columnConfig: { columns: [{ name: columnName, statuses: [{ id: '10' }] }] } });
    if (path.endsWith('/status')) return json([{ id: '10', name: 'Doing' }]);
    if (path.endsWith('/issuetype')) return json([{ id: 'story', name: 'Story' }]);
    if (path.endsWith('/field')) return json([]);
    if (path.endsWith('/project')) return json({ values: [] });
    const boardMatch = path.match(/board\/(\d+)\/issue$/);
    if (boardMatch) {
      const issues = Array.from({ length: issueCount }, (_, index) => ({
        id: `${boardMatch[1]}-${index}`, key: `TEST-${boardMatch[1]}-${index}`,
        fields: { summary: changedSecondIssue && index === 1 ? 'Updated story' : 'Story', issuetype: { id: 'story', name: 'Story' }, project: { id: '1', key: 'TEST' },
          status: { id: '10', name: 'Doing' }, created: '2026-01-01T00:00:00Z',
          ...(missingThirdTimestamp && index === 2 ? {} : { updated: changedSecondIssue && index === 1 ? '2026-10-19T00:00:00Z' : '2026-10-18T00:00:00Z' }),
          comment: { total: 0, comments: [] } },
        changelog: { startAt: 0, maxResults: 0, total: 1, histories: [] },
      })).filter((_, index) => !removedFirstIssue || index !== 0);
      const startAt = Number(url.searchParams.get('startAt'));
      const maxResults = Number(url.searchParams.get('maxResults'));
      return json({ startAt, maxResults, total: issues.length, issues: issues.slice(startAt, startAt + maxResults) });
    }
    const detail = path.match(/issue\/(\d+)-(\d+)$/);
    if (detail) {
      if (blocked && Number(detail[2]) >= 10) return json({}, 429);
      return json({ changelog: { startAt: 0, maxResults: 1, total: 1, histories: [{ id: '1', created: '2026-01-02T00:00:00Z', items: [{ field: 'status', from: '5', to: '10' }] }] } });
    }
    throw new Error(`Unexpected Jira request: ${path}`);
  }));
});

async function scope(boardId: number) {
  return getPrismaClient().flowScope.create({ data: {
    workspaceId, connectionId, boardId: String(boardId), boardName: 'Board', timezone: 'UTC',
    includedIssueTypeIds: ['story'], startStatusIds: ['10'], doneStatusIds: [], syncIntervalMinutes: 10,
  } });
}
async function sync(scopeId: string) {
  const db = getPrismaClient();
  const run = await db.syncRun.create({ data: { scopeId, trigger: 'scheduled' } });
  await runScopeSync(db, run.id);
  return db.syncRun.findUniqueOrThrow({ where: { id: run.id } });
}

describe('shared Jira sync persistence', () => {
  it('preserves staged batches when shutdown pauses an attempt that still owns its lease', async () => {
    issueCount = 20;
    const db = getPrismaClient();
    const item = await scope(95);
    const run = await db.syncRun.create({ data: { scopeId: item.id, trigger: 'scheduled' } });
    const originalFetch = globalThis.fetch;
    let shutdownRequested = false;
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!shutdownRequested && url.includes('/issue/95-10')) {
        shutdownRequested = true;
        expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
        expect(await cancelActiveSyncRuns(db)).toBe(1);
      }
      return originalFetch(...args);
    }));
    const untrack = trackActiveSyncRun(run.id);
    try {
      await runScopeSync(db, run.id);
    } finally {
      untrack();
    }
    expect(shutdownRequested).toBe(true);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: 'queued', errorCode: WORKER_SHUTDOWN_SYNC_ERROR_CODE,
    });
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
    expect(await db.jiraConnection.findUniqueOrThrow({ where: { id: connectionId } })).toMatchObject({ activeSyncLeaseToken: null });
    requests.length = 0;
    await runScopeSync(db, run.id);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'succeeded' });
    expect(await db.workItem.count({ where: { scopeId: item.id, lastSyncRunId: run.id } })).toBe(20);
    expect(requests).not.toContain('/rest/api/2/issue/95-0');
  });

  it('publishes 12 scopes, removes departed issues and cuts unchanged requests by over 90%', async () => {
    const db = getPrismaClient();
    const scopes = await Promise.all(Array.from({ length: 12 }, (_, i) => scope(i + 1)));
    for (const item of scopes) expect((await sync(item.id)).status).toBe('succeeded');
    const firstRequests = requests.length;
    expect(await db.jiraIssueCache.count({ where: { connectionId } })).toBe(1200);
    requests.length = 0;
    removedFirstIssue = true;
    for (const item of scopes) {
      const run = await sync(item.id);
      expect(run.status).toBe('succeeded');
      expect(await db.workItem.count({ where: { scopeId: item.id, lastSyncRunId: run.id } })).toBe(99);
    }
    console.info(`[jira-rate-sync] initial=${firstRequests}, unchanged=${requests.length}, reduction=${(100 * (1 - requests.length / firstRequests)).toFixed(1)}%`);
    expect(requests.length / firstRequests).toBeLessThan(0.1);
    expect(requests.some((path) => /\/api\/2\/issue\//.test(path))).toBe(false);
    expect(await db.syncRun.count({ where: { scope: { connectionId }, status: 'failed' } })).toBe(0);
  }, 180_000);

  it('resumes with the current board mapping without fetching completed issue details again', async () => {
    issueCount = 20; blocked = true;
    const db = getPrismaClient();
    const item = await scope(99);
    const run = await sync(item.id);
    expect(run).toMatchObject({ status: 'queued', errorCode: 'RATE_LIMITED' });
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
    expect(await db.workItem.count({ where: { scopeId: item.id } })).toBe(0);
    const before = requests.filter((path) => path === '/rest/api/2/issue/99-0').length;
    blocked = false;
    columnName = 'In progress';
    // Simulate Jira's bucket having refilled while the run was queued.
    await db.jiraRateLimitState.update({ where: { connectionId }, data: { state: JiraRateStateSchema.parse({ fillRate: 120000, updatedAt: Date.now() }) } });
    await runScopeSync(db, run.id);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'succeeded', errorCode: null });
    expect(requests.filter((path) => path === '/rest/api/2/issue/99-0')).toHaveLength(before);
    expect(await db.workItem.count({ where: { scopeId: item.id, lastSyncRunId: run.id } })).toBe(20);
    expect(await db.workItem.count({ where: { scopeId: item.id, lastSyncRunId: run.id, currentColumn: columnName } })).toBe(20);
  });

  it('schedules a paused run after a shared limiter deadline even without receiving a 429 itself', async () => {
    const db = getPrismaClient();
    const item = await scope(96);
    const limiter = createPostgresJiraRateLimiter(db, connectionId);
    const state = await limiter.observe(new Headers({ 'Retry-After': '600' }), 429, 0);
    const run = await sync(item.id);
    expect(run).toMatchObject({ status: 'queued', errorCode: 'RATE_LIMITED', resumeAfter: new Date(state.blockedUntil) });
    expect(requests).toHaveLength(0);
  });

  it('reconciles changed, departed, and undated staged issues before publishing a resumed run', async () => {
    issueCount = 20; blocked = true;
    const db = getPrismaClient();
    const item = await scope(98);
    const run = await sync(item.id);
    expect(run).toMatchObject({ status: 'queued', errorCode: 'RATE_LIMITED' });
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
    removedFirstIssue = true;
    changedSecondIssue = true;
    missingThirdTimestamp = true;
    blocked = false;
    requests.length = 0;
    await db.jiraRateLimitState.update({ where: { connectionId }, data: { state: JiraRateStateSchema.parse({ fillRate: 120000, updatedAt: Date.now() }) } });
    await runScopeSync(db, run.id);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'succeeded' });
    const published = await db.workItem.findMany({ where: { scopeId: item.id, lastSyncRunId: run.id } });
    expect(published).toHaveLength(19);
    expect(published.some((issue) => issue.jiraIssueId === '98-0')).toBe(false);
    expect(published.find((issue) => issue.jiraIssueId === '98-1')).toMatchObject({
      summary: 'Updated story', jiraUpdatedAt: new Date('2026-10-19T00:00:00Z'),
    });
    expect(published.find((issue) => issue.jiraIssueId === '98-2')).toMatchObject({ jiraUpdatedAt: null });
    expect(requests).toContain('/rest/api/2/issue/98-1');
    expect(requests).toContain('/rest/api/2/issue/98-2');
    expect(requests).not.toContain('/rest/api/2/issue/98-3');
  });

  it.each(['paused', 'drift'] as const)('cleans retained stages when resumption is canceled by %s', async (reason) => {
    issueCount = 20; blocked = true;
    const db = getPrismaClient();
    const item = await scope(97);
    const run = await sync(item.id);
    expect(run.status).toBe('queued');
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
    await db.flowScope.update({ where: { id: item.id }, data: reason === 'paused'
      ? { status: 'paused' } : { startStatusIds: ['20'] } });
    await db.jiraRateLimitState.update({ where: { connectionId }, data: { state: JiraRateStateSchema.parse({ fillRate: 120000, updatedAt: Date.now() }) } });
    await runScopeSync(db, run.id);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: 'canceled', errorCode: reason === 'paused' ? 'SCOPE_NOT_ACTIVE' : 'BOARD_DRIFT_DETECTED',
    });
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(0);
    expect(await db.workItem.count({ where: { scopeId: item.id } })).toBe(0);
  });

  it('backs off permanent board failures and requires attention after the third failure', async () => {
    missingBoard = true;
    const item = await scope(404);
    for (let i = 0; i < 3; i++) await expect(sync(item.id)).rejects.toMatchObject({ statusCode: 404 });
    const updated = await getPrismaClient().flowScope.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated).toMatchObject({ status: 'needs_attention', permanentFailureCount: 3 });
    expect(updated.nextSyncAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });

  it('coordinates independent limiter instances and admits only one connection lease', async () => {
    const db = getPrismaClient();
    const results = await Promise.all([claimConnectionSync(db, connectionId, 'run-a'), claimConnectionSync(db, connectionId, 'run-b')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await releaseConnectionSync(db, connectionId, results[0] ? 'run-a' : 'run-b');
    await claimConnectionSync(db, connectionId, 'same-run', 'replacement');
    expect(await renewConnectionSync(db, connectionId, 'same-run', 'old-attempt')).toBe(false);
    await releaseConnectionSync(db, connectionId, 'same-run', 'old-attempt');
    expect(await claimConnectionSync(db, connectionId, 'another-run')).toBe(false);
    await releaseConnectionSync(db, connectionId, 'same-run', 'replacement');
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 4 }, async () => {
      const limiter = createPostgresJiraRateLimiter(db, connectionId);
      const release = await limiter.acquire(); starts.push(Date.now()); await release();
    }));
    starts.sort((a, b) => a - b);
    expect(starts[3]! - starts[0]!).toBeGreaterThanOrEqual(2900);
  });
});
