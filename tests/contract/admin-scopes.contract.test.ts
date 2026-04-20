/**
 * Contract tests for admin scope and sync routes.
 *
 * Validates that every response shape matches the contracts defined in
 * `@agile-tools/shared/contracts/api`. Uses MSW for outbound Jira calls and
 * Testcontainers Postgres for a real isolated database.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { NextRequest } from 'next/server';
import { resetConfig, encryptSecret } from '@agile-tools/shared';
import { getPrismaClient, disconnectPrisma } from '@agile-tools/db';
import {
  FlowScopeSchema,
  SyncRunSchema,
  ProblemSchema,
} from '@agile-tools/shared/contracts/api';
import { startPostgres, stopPostgres } from '../integration/support/postgres';
import { jiraHandlers } from '../msw/jira-handlers';
import { serializeWorkspaceContext } from '../../apps/web/src/server/session-cookie';

// ─── Mock Next.js server-only modules ─────────────────────────────────────────

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/server/queue', () => ({
  enqueueScopeSyncJob: vi.fn().mockResolvedValue('test-job-id'),
}));

// ─── Lazy imports after mocks ─────────────────────────────────────────────────

const { cookies } = await import('next/headers');
const { POST: createScope } = await import(
  '../../apps/web/src/app/api/v1/admin/scopes/route'
);
const { PUT: updateScope } = await import(
  '../../apps/web/src/app/api/v1/admin/scopes/[scopeId]/route'
);
const { POST: triggerSync, GET: listSyncs } = await import(
  '../../apps/web/src/app/api/v1/admin/scopes/[scopeId]/syncs/route'
);

// ─── Constants ────────────────────────────────────────────────────────────────

const JIRA_BASE = 'https://jira.example.internal';
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!';
const TEST_SESSION_SECRET = 'contract-session-secret-1234567890';
const TEST_PAT = 'test-jira-pat';

const SCOPE_PAYLOAD = {
  boardId: 1,
  timezone: 'UTC',
  includedIssueTypeIds: ['it-1'],
  startStatusIds: ['1'],
  doneStatusIds: ['3'],
  syncIntervalMinutes: 10,
};

const mswServer = setupServer(...jiraHandlers);

// ─── Test State ───────────────────────────────────────────────────────────────

let workspaceId: string;
let connectionId: string;
let scopeId: string;
let adminCookieValue: string;

function makeCookieStore(cookieValue: string | null) {
  return {
    get: (name: string) => {
      if (name === 'agile_session' && cookieValue !== null) return { value: cookieValue };
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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const pg = await startPostgres();
  process.env['DATABASE_URL'] = pg.connectionUrl;
  process.env['ENCRYPTION_KEY'] = TEST_ENCRYPTION_KEY;
  process.env['SESSION_SECRET'] = TEST_SESSION_SECRET;
  process.env['NODE_ENV'] = 'test';
  resetConfig();
  await disconnectPrisma();

  mswServer.listen({ onUnhandledRequest: 'error' });

  const db = getPrismaClient();
  const workspace = await db.workspace.create({
    data: { name: 'Scope Contract Workspace', defaultTimezone: 'UTC' },
  });
  workspaceId = workspace.id;

  const encryptedSecretRef = encryptSecret(TEST_PAT, TEST_ENCRYPTION_KEY);
  const conn = await db.jiraConnection.create({
    data: { workspaceId, baseUrl: JIRA_BASE, authType: 'pat', encryptedSecretRef },
  });
  connectionId = conn.id;

  // Create a fixture scope for update / sync list tests.
  const scope = await db.flowScope.create({
    data: {
      workspaceId,
      connectionId,
      boardId: '1',
      boardName: 'Team Kanban',
      timezone: 'UTC',
      includedIssueTypeIds: ['it-1'],
      startStatusIds: ['1'],
      doneStatusIds: ['3'],
      syncIntervalMinutes: 10,
    },
  });
  scopeId = scope.id;

  adminCookieValue = serializeWorkspaceContext({ userId: 'u-1', workspaceId, role: 'admin' });
});

afterAll(async () => {
  mswServer.close();
  await disconnectPrisma();
  await stopPostgres();
});

beforeEach(() => {
  vi.mocked(cookies).mockReturnValue(makeCookieStore(adminCookieValue) as never);
  mswServer.resetHandlers();
});

// ─── POST /v1/admin/scopes ────────────────────────────────────────────────────

describe('POST /v1/admin/scopes', () => {
  it('returns 201 with a FlowScope shape on valid input', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/scopes', 'POST', {
      connectionId,
      ...SCOPE_PAYLOAD,
    });
    const res = await createScope(req);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    const parsed = FlowScopeSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.boardId).toBe(1);
    expect(parsed.data?.connectionId).toBe(connectionId);
  });

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/scopes', 'POST', {
      connectionId,
      boardId: 1,
    });
    const res = await createScope(req);
    expect(res.status).toBe(400);
    expect(ProblemSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('returns 400 when startStatusIds and doneStatusIds overlap', async () => {
    const req = makeRequest('http://localhost/api/v1/admin/scopes', 'POST', {
      connectionId,
      ...SCOPE_PAYLOAD,
      startStatusIds: ['1', '2'],
      doneStatusIds: ['2', '3'],
    });
    const res = await createScope(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the connection does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest('http://localhost/api/v1/admin/scopes', 'POST', {
      connectionId: missingId,
      ...SCOPE_PAYLOAD,
    });
    const res = await createScope(req);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(cookies).mockReturnValue(makeCookieStore(null) as never);
    const req = makeRequest('http://localhost/api/v1/admin/scopes', 'POST', {
      connectionId,
      ...SCOPE_PAYLOAD,
    });
    const res = await createScope(req);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /v1/admin/scopes/:id ─────────────────────────────────────────────────

describe('PUT /v1/admin/scopes/:id', () => {
  it('returns 200 with updated FlowScope when input is valid', async () => {
    const req = makeRequest(`http://localhost/api/v1/admin/scopes/${scopeId}`, 'PUT', {
      connectionId,
      ...SCOPE_PAYLOAD,
      syncIntervalMinutes: 15,
    });
    const res = await updateScope(req, { params: Promise.resolve({ scopeId }) });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = FlowScopeSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.syncIntervalMinutes).toBe(15);
  });

  it('returns 404 when the scope does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(`http://localhost/api/v1/admin/scopes/${missingId}`, 'PUT', {
      connectionId,
      ...SCOPE_PAYLOAD,
    });
    const res = await updateScope(req, { params: Promise.resolve({ scopeId: missingId }) });
    expect(res.status).toBe(404);
  });
});

// ─── POST /v1/admin/scopes/:id/syncs ─────────────────────────────────────────

describe('POST /v1/admin/scopes/:id/syncs', () => {
  it('returns 202 with a SyncRun shape when sync is queued', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/scopes/${scopeId}/syncs`,
      'POST',
    );
    const res = await triggerSync(req, { params: Promise.resolve({ scopeId }) });
    expect(res.status).toBe(202);
    const body: unknown = await res.json();
    const parsed = SyncRunSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.data?.trigger).toBe('manual');
    expect(parsed.data?.status).toBe('queued');
  });

  it('returns 409 when a sync is already active for this scope', async () => {
    // The previous test created a queued run; a second trigger should conflict.
    const req = makeRequest(
      `http://localhost/api/v1/admin/scopes/${scopeId}/syncs`,
      'POST',
    );
    const res = await triggerSync(req, { params: Promise.resolve({ scopeId }) });
    expect(res.status).toBe(409);
  });

  it('returns 404 when the scope does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(
      `http://localhost/api/v1/admin/scopes/${missingId}/syncs`,
      'POST',
    );
    const res = await triggerSync(req, { params: Promise.resolve({ scopeId: missingId }) });
    expect(res.status).toBe(404);
  });
});

// ─── GET /v1/admin/scopes/:id/syncs ──────────────────────────────────────────

describe('GET /v1/admin/scopes/:id/syncs', () => {
  it('returns 200 with an array of SyncRun records', async () => {
    const req = makeRequest(
      `http://localhost/api/v1/admin/scopes/${scopeId}/syncs`,
    );
    const res = await listSyncs(req, { params: Promise.resolve({ scopeId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { syncs: unknown[] };
    expect(Array.isArray(body.syncs)).toBe(true);
    // Verify each run parses as a SyncRun.
    for (const run of body.syncs) {
      expect(SyncRunSchema.safeParse(run).success).toBe(true);
    }
  });

  it('returns 404 when the scope does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(
      `http://localhost/api/v1/admin/scopes/${missingId}/syncs`,
    );
    const res = await listSyncs(req, { params: Promise.resolve({ scopeId: missingId }) });
    expect(res.status).toBe(404);
  });
});
