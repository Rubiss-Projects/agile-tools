/**
 * Contract tests for admin Jira connection routes.
 *
 * These tests call Next.js route handlers directly (not over HTTP) to verify
 * that every response conforms to the shapes defined in
 * `@agile-tools/shared/contracts/api`. They use:
 *
 *  - MSW (node) to intercept outbound Jira HTTP calls
 *  - Testcontainers Postgres for a real, isolated database
 *  - vi.mock for Next.js server-only modules (next/headers, @/server/queue)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { resetConfig, encryptSecret, JiraRateStateSchema } from '@agile-tools/shared';
import { JiraClient } from '@agile-tools/jira-client';
import { getPrismaClient, disconnectPrisma, createPostgresJiraRateLimiter, claimConnectionSync, upsertJiraCloudOAuthConnection, updateJiraConnectionValidation, JiraConnectionBusyError } from '@agile-tools/db';
import {
  JiraConnectionSchema,
  JiraConnectionValidationSchema,
  BoardDiscoveryDetailSchema,
  ProblemSchema,
} from '@agile-tools/shared/contracts/api';
import { startPostgres, stopPostgres } from '../integration/support/postgres';
import { jiraHandlers, jiraUnauthorisedHandlers } from '../msw/jira-handlers';
import { serializeWorkspaceContext } from '../../apps/web/src/server/session-cookie';
import { getCloudAccessTokenForConnection } from '../../apps/web/src/server/atlassian-oauth';

// ─── Mock Next.js server-only modules ─────────────────────────────────────────

// vi.mock calls are automatically hoisted before all imports by Vitest.
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/server/queue', () => ({
  enqueueScopeSyncJob: vi.fn().mockResolvedValue('test-job-id'),
}));

// ─── Lazy imports after mocks are hoisted ─────────────────────────────────────

// These must be imported after vi.mock so they receive the mocked modules.
const { cookies } = await import('next/headers');
const { POST: createConnection } = await import(
  '../../apps/web/src/app/api/v1/admin/jira-connections/route'
);
const { PUT: updateConnection } = await import(
  '../../apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/route'
);
const { POST: validateConnection } = await import(
  '../../apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/validate/route'
);
const { GET: listBoards } = await import(
  '../../apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/route'
);
const { GET: getBoardDetail } = await import(
  '../../apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/[boardId]/route'
);

// ─── Constants ────────────────────────────────────────────────────────────────

const JIRA_BASE = 'https://jira.example.internal';
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!';
const TEST_SESSION_SECRET = 'contract-session-secret-1234567890';
const TEST_PAT = 'test-jira-pat';

// ─── MSW Server ───────────────────────────────────────────────────────────────

const mswServer = setupServer(...jiraHandlers);

// ─── Test State ───────────────────────────────────────────────────────────────

let workspaceId: string;
let connectionId: string;
let adminCookieValue: string;
let memberCookieValue: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCookieStore(cookieValue: string | null) {
  return {
    get: (name: string) => {
      if (name === 'agile_session' && cookieValue !== null) {
        return { value: cookieValue };
      }
      return undefined;
    },
  };
}

function makeRequest(url: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      Origin: 'http://localhost',
      Referer: 'http://localhost/admin/jira',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Start isolated Postgres and set env vars before any DB/config access.
  const pg = await startPostgres();
  process.env['DATABASE_URL'] = pg.connectionUrl;
  process.env['ENCRYPTION_KEY'] = TEST_ENCRYPTION_KEY;
  process.env['SESSION_SECRET'] = TEST_SESSION_SECRET;
  process.env['NODE_ENV'] = 'test';
  resetConfig();
  await disconnectPrisma();

  // Start MSW to intercept outbound Jira HTTP calls.
  mswServer.listen({ onUnhandledRequest: 'error' });

  // Seed a Workspace row (required FK for JiraConnection).
  const db = getPrismaClient();
  const workspace = await db.workspace.create({
    data: { name: 'Contract Test Workspace', defaultTimezone: 'UTC' },
  });
  workspaceId = workspace.id;

  // Seed a JiraConnection fixture for tests that need an existing connection.
  const encryptedSecretRef = encryptSecret(TEST_PAT, TEST_ENCRYPTION_KEY);
  const conn = await db.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: JIRA_BASE,
      displayName: 'Test Jira',
      authType: 'data_center_pat',
      encryptedSecretRef,
    },
  });
  connectionId = conn.id;

  // Build session cookie payloads.
  adminCookieValue = serializeWorkspaceContext({ userId: 'u-1', workspaceId, role: 'admin' });
  memberCookieValue = serializeWorkspaceContext({ userId: 'u-2', workspaceId, role: 'member' });
});

afterAll(async () => {
  mswServer.close();
  await disconnectPrisma();
  await stopPostgres();
});

beforeEach(() => {
  // Default to admin session; individual tests override for auth edge cases.
  vi.mocked(cookies).mockReturnValue(makeCookieStore(adminCookieValue));
  mswServer.resetHandlers();
});

// ─── POST /v1/admin/jira-connections ─────────────────────────────────────────

describe('POST /v1/admin/jira-connections', () => {
  it('returns 201 with a JiraConnection shape on valid input', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/jira-connections', 'POST', {
      baseUrl: JIRA_BASE,
      pat: TEST_PAT,
      displayName: 'New Connection',
    });
    const res = await createConnection(req);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    const parsed = JiraConnectionSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
  });

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/jira-connections', 'POST', {
      displayName: 'No URL or PAT',
    });
    const res = await createConnection(req);
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expect(ProblemSchema.safeParse(body).success).toBe(true);
  });

  it('returns 400 when the base URL does not use http or https', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/jira-connections', 'POST', {
      baseUrl: 'javascript:alert(1)',
      pat: TEST_PAT,
    });
    const res = await createConnection(req);
    expect(res.status).toBe(400);
    const body = ProblemSchema.parse(await res.json());
    expect(body.details).toContain('baseUrl: URL must use http or https.');
  });

  it('returns 401 when no session cookie is present', async () => {
    vi.mocked(cookies).mockReturnValue(makeCookieStore(null));
    const req = makeRequest('http://localhost/api/v1/admin/jira-connections', 'POST', {
      baseUrl: JIRA_BASE,
      pat: TEST_PAT,
    });
    const res = await createConnection(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is a member (not admin)', async () => {
    vi.mocked(cookies).mockReturnValue(makeCookieStore(memberCookieValue));
    const req = makeRequest('http://localhost/api/v1/admin/jira-connections', 'POST', {
      baseUrl: JIRA_BASE,
      pat: TEST_PAT,
    });
    const res = await createConnection(req);
    expect(res.status).toBe(403);
  });
});

// ─── PUT /v1/admin/jira-connections/:id ────────────────────────────────────────

describe('PUT /v1/admin/jira-connections/:id', () => {
  it.each(['running', 'queued'] as const)('rejects identity replacement while a sync is %s', async (status) => {
    const db = getPrismaClient();
    const connection = await db.jiraConnection.create({ data: {
      workspaceId, baseUrl: JIRA_BASE, encryptedSecretRef: encryptSecret(TEST_PAT, TEST_ENCRYPTION_KEY),
    } });
    const scope = await db.flowScope.create({ data: {
      workspaceId, connectionId: connection.id, boardId: '1', boardName: 'Board', timezone: 'UTC',
      includedIssueTypeIds: ['story'], startStatusIds: ['10'], doneStatusIds: [], syncIntervalMinutes: 10,
    } });
    await db.syncRun.create({ data: { scopeId: scope.id, trigger: 'scheduled', status } });
    const res = await updateConnection(makeRequest(`http://localhost/api/v1/admin/jira-connections/${connection.id}`, 'PUT', {
      baseUrl: status === 'running' ? 'https://replacement.test' : JIRA_BASE,
      ...(status === 'queued' ? { pat: 'replacement-pat' } : {}),
    }), { params: Promise.resolve({ connectionId: connection.id }) });
    expect(res.status).toBe(409);
    expect(ProblemSchema.parse(await res.json()).code).toBe('CONNECTION_SYNC_ACTIVE');
    expect(await db.jiraConnection.findUniqueOrThrow({ where: { id: connection.id } })).toMatchObject({
      baseUrl: connection.baseUrl, encryptedSecretRef: connection.encryptedSecretRef,
    });
    const budgetResponse = await updateConnection(makeRequest(`http://localhost/api/v1/admin/jira-connections/${connection.id}`, 'PUT', {
      baseUrl: JIRA_BASE, requestBudgetPerMinute: 30,
    }), { params: Promise.resolve({ connectionId: connection.id }) });
    expect(budgetResponse.status).toBe(200);
  });

  it.each(['url', 'pat'] as const)('resets cached details and limiter state on %s replacement and rejects old clients', async (kind) => {
    const db = getPrismaClient();
    const connection = await db.jiraConnection.create({ data: {
      workspaceId, baseUrl: JIRA_BASE, encryptedSecretRef: encryptSecret(TEST_PAT, TEST_ENCRYPTION_KEY),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      activeSyncRunId: 'expired-run', activeSyncLeaseToken: 'expired-lease', syncLeaseUntil: new Date('2026-01-01T00:00:00Z'),
    } });
    const oldLimiter = createPostgresJiraRateLimiter(db, connection.id, null, connection);
    await db.jiraIssueCache.create({ data: {
      connectionId: connection.id, jiraIssueId: '1', jiraUpdatedAt: '2026-01-01T00:00:00Z',
      changelog: [], latestComment: { value: null }, fetchedAt: new Date(),
    } });
    await oldLimiter.observe(new Headers({ 'Retry-After': '7200' }), 429, 0);
    const res = await updateConnection(makeRequest(`http://localhost/api/v1/admin/jira-connections/${connection.id}`, 'PUT', {
      baseUrl: kind === 'url' ? 'https://replacement.test' : JIRA_BASE,
      ...(kind === 'pat' ? { pat: 'replacement-pat' } : {}),
    }), { params: Promise.resolve({ connectionId: connection.id }) });
    expect(res.status).toBe(200);
    expect(await db.jiraIssueCache.count({ where: { connectionId: connection.id } })).toBe(0);
    expect(await db.jiraRateLimitState.findUnique({ where: { connectionId: connection.id } })).toBeNull();
    await expect(oldLimiter.observe(new Headers(), 200, 0)).rejects.toThrow('Jira connection changed');
    expect(await claimConnectionSync(db, connection.id, 'old-run', 'old-lease', connection.updatedAt)).toBe(false);
    const updated = await db.jiraConnection.findUniqueOrThrow({ where: { id: connection.id } });
    const release = await createPostgresJiraRateLimiter(db, updated.id, null, updated).acquire();
    await release();
    const row = await db.jiraRateLimitState.findUniqueOrThrow({ where: { connectionId: updated.id } });
    expect(JiraRateStateSchema.parse(row.state).blockedUntil).toBe(0);
  });

  it('persists and clears a per-connection request budget without rotating the PAT', async () => {
    for (const requestBudgetPerMinute of [30, null]) {
      const response = await updateConnection(makeRequest(`http://localhost/api/v1/admin/jira-connections/${connectionId}`, 'PUT', {
        baseUrl: JIRA_BASE, requestBudgetPerMinute,
      }), { params: Promise.resolve({ connectionId }) });
      expect(response.status).toBe(200);
      expect(JiraConnectionSchema.parse(await response.json()).requestBudgetPerMinute).toBe(requestBudgetPerMinute);
      expect((await getPrismaClient().jiraConnection.findUniqueOrThrow({ where: { id: connectionId } })).requestBudgetPerMinute).toBe(requestBudgetPerMinute);
    }
  });
  it('returns 200 with a JiraConnection shape and resets validation state after base URL or PAT changes', async () => {
    const db = getPrismaClient();
    await db.jiraConnection.update({
      where: { id: connectionId },
      data: {
        healthStatus: 'healthy',
        lastValidatedAt: new Date('2026-04-19T12:00:00Z'),
        lastHealthyAt: new Date('2026-04-19T12:00:00Z'),
        lastErrorCode: 'JIRA_AUTH_ERROR',
        jiraVersion: '8.2.0',
        jiraDeploymentType: 'Server',
        changelogStrategy: 'issue_expand',
        capabilitiesDetectedAt: new Date('2026-04-19T12:00:00Z'),
      },
    });

    const req = makeRequest(`http://localhost/api/v1/admin/jira-connections/${connectionId}`, 'PUT', {
      baseUrl: 'https://jira.updated.internal/',
      displayName: 'Updated Jira',
      pat: 'rotated-pat',
    });
    const res = await updateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = JiraConnectionSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.baseUrl).toBe('https://jira.updated.internal');
    expect(parsed.data?.displayName).toBe('Updated Jira');
    expect(parsed.data?.healthStatus).toBe('draft');
    expect(parsed.data?.lastValidatedAt).toBeUndefined();
    expect(parsed.data?.lastErrorCode).toBeUndefined();

    const stored = await db.jiraConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(stored.jiraVersion).toBeNull();
    expect(stored.jiraDeploymentType).toBeNull();
    expect(stored.changelogStrategy).toBeNull();
    expect(stored.capabilitiesDetectedAt).toBeNull();
  });

  it('returns 200 and preserves healthy state when only the display name changes', async () => {
    const db = getPrismaClient();
    await db.jiraConnection.update({
      where: { id: connectionId },
      data: {
        baseUrl: JIRA_BASE,
        displayName: 'Test Jira',
        healthStatus: 'healthy',
        lastValidatedAt: new Date('2026-04-19T12:00:00Z'),
        lastHealthyAt: new Date('2026-04-19T12:00:00Z'),
        lastErrorCode: null,
      },
    });

    const req = makeRequest(`http://localhost/api/v1/admin/jira-connections/${connectionId}`, 'PUT', {
      baseUrl: JIRA_BASE,
      displayName: 'Renamed Jira',
    });
    const res = await updateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = JiraConnectionSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.displayName).toBe('Renamed Jira');
    expect(parsed.data?.healthStatus).toBe('healthy');
  });

  it('preserves the existing display name when it is omitted from the update payload', async () => {
    const db = getPrismaClient();
    await db.jiraConnection.update({
      where: { id: connectionId },
      data: {
        baseUrl: JIRA_BASE,
        displayName: 'Preserved Jira',
        healthStatus: 'healthy',
        lastValidatedAt: new Date('2026-04-19T12:00:00Z'),
        lastHealthyAt: new Date('2026-04-19T12:00:00Z'),
        lastErrorCode: null,
      },
    });

    const req = makeRequest(`http://localhost/api/v1/admin/jira-connections/${connectionId}`, 'PUT', {
      baseUrl: JIRA_BASE,
      pat: 'rotated-pat',
    });
    const res = await updateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = JiraConnectionSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.displayName).toBe('Preserved Jira');
    expect(parsed.data?.healthStatus).toBe('draft');
  });

  it('returns 404 when the connection does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(`http://localhost/api/v1/admin/jira-connections/${missingId}`, 'PUT', {
      baseUrl: JIRA_BASE,
      displayName: 'Missing Jira',
    });
    const res = await updateConnection(req, {
      params: Promise.resolve({ connectionId: missingId }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when updating to a non-http base URL', async () => {
    const req = makeRequest(`http://localhost/api/v1/admin/jira-connections/${connectionId}`, 'PUT', {
      baseUrl: 'javascript:alert(1)',
      displayName: 'Unsafe Jira',
    });
    const res = await updateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(400);
    const body = ProblemSchema.parse(await res.json());
    expect(body.details).toContain('baseUrl: URL must use http or https.');
  });
});

// ─── POST /v1/admin/jira-connections/:id/validate ────────────────────────────

describe('Jira Cloud OAuth reconnection', () => {
  const oauthInput = (): Parameters<typeof upsertJiraCloudOAuthConnection>[2] => ({
    cloudId: crypto.randomUUID(), siteUrl: 'https://cloud.atlassian.net',
    atlassianAccountId: 'account-a', oauthScopes: ['read:jira-work'],
    accessTokenSecretRef: 'encrypted-access', refreshTokenSecretRef: 'encrypted-refresh',
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
  });

  it.each([200, 400])('discards an in-flight HTTP %s token refresh after reconnection', async (status) => {
    vi.stubEnv('ATLASSIAN_CLIENT_ID', 'test-client');
    vi.stubEnv('ATLASSIAN_CLIENT_SECRET', 'test-secret');
    resetConfig();
    const db = getPrismaClient();
    const input = { ...oauthInput(),
      accessTokenExpiresAt: new Date(0),
      refreshTokenSecretRef: encryptSecret('old-refresh', TEST_ENCRYPTION_KEY),
    };
    const original = await upsertJiraCloudOAuthConnection(db, workspaceId, input);
    let reconnected = false;
    mswServer.use(http.post('https://auth.atlassian.com/oauth/token', async () => {
      await upsertJiraCloudOAuthConnection(db, workspaceId, {
        ...input, atlassianAccountId: 'account-b', accessTokenSecretRef: 'new-access', refreshTokenSecretRef: 'new-refresh',
      });
      reconnected = true;
      return HttpResponse.json({ access_token: 'stale-access', refresh_token: 'stale-refresh', expires_in: 3600 }, { status });
    }));
    try {
      await expect(getCloudAccessTokenForConnection(original)).rejects.toThrow();
      expect(reconnected).toBe(true);
      expect(await db.jiraConnection.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
        authorizationGeneration: original.authorizationGeneration + 1,
        atlassianAccountId: 'account-b', accessTokenSecretRef: 'new-access', refreshTokenSecretRef: 'new-refresh',
        healthStatus: 'healthy', lastErrorCode: null,
      });
    } finally {
      vi.unstubAllEnvs();
      resetConfig();
    }
  });

  it.each(['account', 'scopes', 'unknown-account'] as const)('invalidates old authorization on %s reconnection', async (kind) => {
    const db = getPrismaClient();
    const input = oauthInput();
    if (kind === 'unknown-account') delete input.atlassianAccountId;
    const original = await upsertJiraCloudOAuthConnection(db, workspaceId, input);
    await db.jiraIssueCache.create({ data: {
      connectionId: original.id, jiraIssueId: '1', jiraUpdatedAt: 'unchanged',
      changelog: [], latestComment: { value: { body: 'Old principal comment' } }, fetchedAt: new Date(),
    } });
    const oldLimiter = createPostgresJiraRateLimiter(db, original.id, null, original);
    await oldLimiter.observe(new Headers({ 'Retry-After': '600' }), 429, 0);
    const reconnected = await upsertJiraCloudOAuthConnection(db, workspaceId, {
      ...input,
      ...(kind === 'account' ? { atlassianAccountId: 'account-b' } : {}),
      ...(kind === 'scopes' ? { oauthScopes: ['read:issue:jira'] } : {}),
      accessTokenSecretRef: 'replacement-access', refreshTokenSecretRef: 'replacement-refresh',
    });
    expect(reconnected.id).toBe(original.id);
    expect(reconnected.authorizationGeneration).toBe(original.authorizationGeneration + 1);
    expect(await db.jiraIssueCache.count({ where: { connectionId: original.id } })).toBe(0);
    expect(await db.jiraRateLimitState.findUnique({ where: { connectionId: original.id } })).toBeNull();
    await expect(oldLimiter.observe(new Headers(), 200, 0)).rejects.toThrow('Jira connection changed');
    expect(await updateJiraConnectionValidation(db, original, { healthStatus: 'unhealthy' })).toBeNull();
    expect(await claimConnectionSync(db, original.id, 'stale-run', 'stale-lease', original.updatedAt)).toBe(false);
  });

  it.each(['running', 'queued', 'lease'] as const)('rejects OAuth replacement while a %s sync owns the connection', async (status) => {
    const db = getPrismaClient();
    const input = oauthInput();
    const original = await upsertJiraCloudOAuthConnection(db, workspaceId, input);
    if (status === 'lease') {
      expect(await claimConnectionSync(db, original.id, 'active-run')).toBe(true);
    } else {
      const scope = await db.flowScope.create({ data: {
        workspaceId, connectionId: original.id, boardId: '1', boardName: 'Board', timezone: 'UTC',
        includedIssueTypeIds: ['1'], startStatusIds: ['1'], doneStatusIds: ['2'], syncIntervalMinutes: 10,
      } });
      await db.syncRun.create({ data: { scopeId: scope.id, trigger: 'scheduled', status } });
    }
    await expect(upsertJiraCloudOAuthConnection(db, workspaceId, {
      ...input, atlassianAccountId: 'account-b', accessTokenSecretRef: 'replacement-access',
    })).rejects.toBeInstanceOf(JiraConnectionBusyError);
    expect(await db.jiraConnection.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
      authorizationGeneration: original.authorizationGeneration, atlassianAccountId: 'account-a',
      accessTokenSecretRef: input.accessTokenSecretRef,
    });
  });
});

describe('POST /v1/admin/jira-connections/:id/validate', () => {
  it.each([
    ['url', 'success'], ['url', 'failure'], ['pat', 'success'], ['pat', 'failure'],
  ] as const)('discards stale validation after %s replacement on %s', async (kind, outcome) => {
    const db = getPrismaClient();
    const connection = await db.jiraConnection.create({ data: {
      workspaceId, baseUrl: JIRA_BASE, encryptedSecretRef: encryptSecret(TEST_PAT, TEST_ENCRYPTION_KEY),
    } });
    const validation = vi.spyOn(JiraClient.prototype, 'validateConnection').mockImplementationOnce(async () => {
      // Replace the identity after validation starts but before its result is persisted.
      const replacement = await updateConnection(makeRequest(`http://localhost/api/v1/admin/jira-connections/${connection.id}`, 'PUT', {
        baseUrl: kind === 'url' ? 'https://replacement.test' : JIRA_BASE,
        ...(kind === 'pat' ? { pat: 'replacement-pat' } : {}),
      }), { params: Promise.resolve({ connectionId: connection.id }) });
      expect(replacement.status).toBe(200);
      if (outcome === 'failure') throw new Error('Old identity validation failed');
      return { version: '8.14.0', deploymentType: 'Server', baseUrl: JIRA_BASE };
    });
    try {
      const res = await validateConnection(makeRequest(
        `http://localhost/api/v1/admin/jira-connections/${connection.id}/validate`, 'POST',
      ), { params: Promise.resolve({ connectionId: connection.id }) });
      expect(res.status).toBe(409);
      expect(ProblemSchema.parse(await res.json()).code).toBe('CONNECTION_CHANGED');
      expect(await db.jiraConnection.findUniqueOrThrow({ where: { id: connection.id } })).toMatchObject({
        healthStatus: 'draft', lastValidatedAt: null, lastHealthyAt: null, lastErrorCode: null,
        jiraVersion: null, jiraDeploymentType: null, changelogStrategy: null, capabilitiesDetectedAt: null,
      });
    } finally {
      validation.mockRestore();
    }
  });

  it('returns 200 with healthy validation when Jira responds normally', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/validate`,
      'POST',
    );
    const res = await validateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = JiraConnectionValidationSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.healthStatus).toBe('healthy');
    expect(parsed.data?.connectionId).toBe(connectionId);

    const stored = await getPrismaClient().jiraConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(stored.jiraVersion).toBe('8.14.0');
    expect(stored.jiraDeploymentType).toBe('Server');
    expect(stored.changelogStrategy).toBe('subresource');
    expect(stored.capabilitiesDetectedAt).toBeInstanceOf(Date);
  });

  it('returns 200 with unhealthy validation when Jira returns 401', async () => {
    mswServer.use(...jiraUnauthorisedHandlers);
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/validate`,
      'POST',
    );
    const res = await validateConnection(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = JiraConnectionValidationSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.healthStatus).toBe('unhealthy');
    expect(parsed.data?.warnings.length).toBeGreaterThan(0);
  });

  it('returns 404 when the connection does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${missingId}/validate`,
      'POST',
    );
    const res = await validateConnection(req, {
      params: Promise.resolve({ connectionId: missingId }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── GET /v1/admin/jira-connections/:id/discovery/boards ─────────────────────

describe('GET /v1/admin/jira-connections/:id/discovery/boards', () => {
  it('returns 200 with a boards array', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/discovery/boards`,
    );
    const res = await listBoards(req, {
      params: Promise.resolve({ connectionId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { boards: unknown[] };
    expect(Array.isArray(body.boards)).toBe(true);
    expect(body.boards.length).toBeGreaterThan(0);
  });

  it('returns 404 when the connection does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${missingId}/discovery/boards`,
    );
    const res = await listBoards(req, { params: Promise.resolve({ connectionId: missingId }) });
    expect(res.status).toBe(404);
  });
});

// ─── GET /v1/admin/jira-connections/:id/discovery/boards/:boardId ─────────────

describe('GET /v1/admin/jira-connections/:id/discovery/boards/:boardId', () => {
  it('returns 200 with BoardDiscoveryDetail shape for a valid board', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/discovery/boards/1`,
    );
    const res = await getBoardDetail(req, {
      params: Promise.resolve({ connectionId, boardId: '1' }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = BoardDiscoveryDetailSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.boardId).toBe(1);
    expect(parsed.data?.completionStatuses?.some((status) => status.id === '4')).toBe(true);
  });

  it('returns 400 when boardId is not a positive integer', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/discovery/boards/abc`,
    );
    const res = await getBoardDetail(req, {
      params: Promise.resolve({ connectionId, boardId: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the board is not found in Jira', async () => {
    mswServer.use(
      http.get(`${JIRA_BASE}/rest/agile/1.0/board/:boardId/configuration`, () =>
        HttpResponse.json({ message: 'Board not found' }, { status: 404 }),
      ),
    );
    const req = makeRequest(
      `http://localhost/api/v1/admin/jira-connections/${connectionId}/discovery/boards/999`,
    );
    const res = await getBoardDetail(req, {
      params: Promise.resolve({ connectionId, boardId: '999' }),
    });
    expect(res.status).toBe(404);
  });
});
