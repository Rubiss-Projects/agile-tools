import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient, disconnectPrisma, createPostgresJiraRateLimiter, claimConnectionSync, releaseConnectionSync, renewConnectionSync } from '@agile-tools/db';
import { encryptSecret, resetConfig, JiraRateStateSchema } from '@agile-tools/shared';
import { runScopeSync } from '../../apps/worker/src/sync/run-scope-sync';
import { startPostgres, stopPostgres } from './support/postgres';

const key = 'integration-encryption-key-at-least-32-characters';
let connectionId: string;
let workspaceId: string;
let issueCount = 100;
let blocked = false;
let missingBoard = false;
let removedFirstIssue = false;
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
    if (path.endsWith('/configuration')) return missingBoard ? json({}, 404) : json({ name: 'Board', columnConfig: { columns: [{ name: 'Doing', statuses: [{ id: '10' }] }] } });
    if (path.endsWith('/status')) return json([{ id: '10', name: 'Doing' }]);
    if (path.endsWith('/issuetype')) return json([{ id: 'story', name: 'Story' }]);
    if (path.endsWith('/field')) return json([]);
    if (path.endsWith('/project')) return json({ values: [] });
    const boardMatch = path.match(/board\/(\d+)\/issue$/);
    if (boardMatch) {
      const issues = Array.from({ length: issueCount }, (_, index) => ({
        id: `${boardMatch[1]}-${index}`, key: `TEST-${boardMatch[1]}-${index}`,
        fields: { summary: 'Story', issuetype: { id: 'story', name: 'Story' }, project: { id: '1', key: 'TEST' },
          status: { id: '10', name: 'Doing' }, created: '2026-01-01T00:00:00Z', updated: '2026-10-18T00:00:00Z', comment: { total: 0, comments: [] } },
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

  it('retains batches on 429 and resumes the same run without fetching completed issue details again', async () => {
    issueCount = 20; blocked = true;
    const db = getPrismaClient();
    const item = await scope(99);
    const run = await sync(item.id);
    expect(run).toMatchObject({ status: 'queued', errorCode: 'RATE_LIMITED' });
    expect(await db.syncWorkItemStage.count({ where: { syncRunId: run.id } })).toBe(10);
    expect(await db.workItem.count({ where: { scopeId: item.id } })).toBe(0);
    const before = requests.filter((path) => path === '/rest/api/2/issue/99-0').length;
    blocked = false;
    // Simulate Jira's bucket having refilled while the run was queued.
    await db.jiraRateLimitState.update({ where: { connectionId }, data: { state: JiraRateStateSchema.parse({ fillRate: 120000, updatedAt: Date.now() }) } });
    await runScopeSync(db, run.id);
    expect(await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'succeeded', errorCode: null });
    expect(requests.filter((path) => path === '/rest/api/2/issue/99-0')).toHaveLength(before);
    expect(await db.workItem.count({ where: { scopeId: item.id, lastSyncRunId: run.id } })).toBe(20);
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
