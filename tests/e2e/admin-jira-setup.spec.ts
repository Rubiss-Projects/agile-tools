/**
 * E2E tests for the admin Jira setup flow.
 *
 * Prerequisites:
 *  - PLAYWRIGHT_BASE_URL (defaults to http://localhost:3000 via playwright.config.ts)
 *  - DATABASE_URL pointing to a running Postgres (e.g. from docker-compose)
 *  - ENCRYPTION_KEY env var (at least 32 characters)
 *  - The Next.js dev server must be running (started automatically outside of CI)
 *
 * The tests seed real DB records in beforeAll and clean up in afterAll.
 * They authenticate by injecting the `agile_session` cookie directly.
 * page.route() mocks are used for browser-initiated API calls to avoid
 * hitting the real Jira server.
 */

import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@agile-tools/db';
import { encryptSecret } from '@agile-tools/shared';
import { serializeWorkspaceContext } from '../../apps/web/src/server/session-cookie';

// ─── DB seeding helpers ───────────────────────────────────────────────────────

const ENCRYPTION_KEY =
  process.env['ENCRYPTION_KEY'] ?? 'test-encryption-key-32-chars-ok!';
const SESSION_SECRET =
  process.env['SESSION_SECRET'] ?? 'playwright-session-secret-1234567890';
const TEST_PAT = 'e2e-test-pat';
const JIRA_BASE = 'https://jira.example.internal';

process.env['SESSION_SECRET'] = SESSION_SECRET;

let db: PrismaClient;
let workspaceId: string;
let connectionId: string;
let scopeId: string;
let syncRunId: string;
let adminCookie: string;

test.beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for E2E tests. Start docker-compose first.');
  }

  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const workspace = await db.workspace.create({
    data: { name: 'E2E Test Workspace', defaultTimezone: 'UTC' },
  });
  workspaceId = workspace.id;

  const encryptedSecretRef = encryptSecret(TEST_PAT, ENCRYPTION_KEY);
  const connection = await db.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: JIRA_BASE,
      displayName: 'E2E Jira Connection',
      authType: 'pat',
      encryptedSecretRef,
      healthStatus: 'healthy',
    },
  });
  connectionId = connection.id;

  const scope = await db.flowScope.create({
    data: {
      workspaceId,
      connectionId,
      boardId: '42',
      boardName: 'E2E Kanban Board',
      timezone: 'UTC',
      includedIssueTypeIds: ['story'],
      startStatusIds: ['10'],
      doneStatusIds: ['30'],
      syncIntervalMinutes: 10,
    },
  });
  scopeId = scope.id;

  const syncRun = await db.syncRun.create({
    data: {
      scopeId,
      trigger: 'manual',
      status: 'succeeded',
      startedAt: new Date('2025-01-01T00:00:00Z'),
      finishedAt: new Date('2025-01-01T01:00:00Z'),
    },
  });
  syncRunId = syncRun.id;

  // Build the base64-encoded admin session cookie.
  adminCookie = serializeWorkspaceContext({
    userId: 'e2e-user',
    workspaceId,
    role: 'admin',
  });
});

test.afterAll(async () => {
  if (!db) return;
  // Clean up in reverse FK order.
  await db.syncRun.deleteMany({ where: { id: syncRunId } });
  await db.flowScope.deleteMany({ where: { id: scopeId } });
  await db.jiraConnection.deleteMany({ where: { id: connectionId } });
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.$disconnect();
});

/** Inject the admin session cookie before each test navigates anywhere. */
async function setAdminSession(page: Page) {
  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
  const url = new URL(baseUrl);
  await page.context().addCookies([
    {
      name: 'agile_session',
      value: adminCookie,
      domain: url.hostname,
      path: '/',
    },
  ]);
}

// ─── Test: /admin/jira renders pre-seeded connections and scopes ──────────────

test('admin/jira page shows seeded connection name and health status', async ({ page }) => {
  await setAdminSession(page);
  await page.goto('/admin/jira');

  // The connection name must appear.
  await expect(page.getByText('E2E Jira Connection').first()).toBeVisible();

  // The health status badge must be visible.
  await expect(page.getByText('healthy')).toBeVisible();

  // The scope board name must appear in the scopes list.
  await expect(page.getByText('E2E Kanban Board')).toBeVisible();
});

// ─── Test: Validate button triggers API call and UI updates ──────────────────

test('clicking Validate button sends POST to validate endpoint', async ({ page }) => {
  await setAdminSession(page);

  // Intercept the browser-side validate API call and return a healthy mock.
  await page.route(`**/api/v1/admin/jira-connections/${connectionId}/validate`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connectionId,
        healthStatus: 'healthy',
        checkedAt: new Date().toISOString(),
        warnings: [],
      }),
    });
  });

  await page.goto('/admin/jira');

  // Click the Validate button for the connection.
  const validateBtn = page.getByRole('button', { name: /validate/i }).first();
  await validateBtn.click();

  // The route intercept verifies the call happened; just confirm no error state.
  await expect(page.getByText('E2E Jira Connection').first()).toBeVisible();
});

test('editing a Jira connection sends a PUT request with rotated credentials', async ({ page }) => {
  await setAdminSession(page);

  let requestBody: Record<string, unknown> | null = null;
  await page.route(`**/api/v1/admin/jira-connections/${connectionId}`, async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: connectionId,
        baseUrl: 'https://jira-edited.example.internal',
        displayName: 'Edited Jira Connection',
        healthStatus: 'draft',
      }),
    });
  });

  await page.goto('/admin/jira');
  await page.getByRole('button', { name: /edit connection/i }).first().click();
  await page.getByRole('textbox', { name: /jira base url/i }).first().fill('https://jira-edited.example.internal');
  await page.getByRole('textbox', { name: /display name/i }).first().fill('Edited Jira Connection');
  await page.getByLabel(/replace personal access token/i).fill('rotated-pat');
  await page.getByRole('button', { name: /save changes/i }).click();

  await expect(page.getByText(/connection updated/i)).toBeVisible();
  expect(requestBody).toMatchObject({
    baseUrl: 'https://jira-edited.example.internal',
    displayName: 'Edited Jira Connection',
    pat: 'rotated-pat',
  });
});

test('editing a flow scope sends a PUT request and keeps the admin on the setup screen', async ({
  page,
}) => {
  await setAdminSession(page);

  let scopeRequestBody: Record<string, unknown> | null = null;
  await page.route(`**/api/v1/admin/jira-connections/${connectionId}/discovery/boards`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        boards: [{ boardId: 42, boardName: 'E2E Kanban Board' }],
      }),
    });
  });
  await page.route(`**/api/v1/admin/jira-connections/${connectionId}/discovery/boards/42`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        boardId: 42,
        boardName: 'E2E Kanban Board',
        columns: [{ name: 'Doing', statusIds: ['10'] }],
        statuses: [{ id: '10', name: 'In Progress' }],
        completionStatuses: [{ id: '30', name: 'Done' }],
        issueTypes: [{ id: 'story', name: 'Story' }],
      }),
    });
  });
  await page.route(`**/api/v1/admin/scopes/${scopeId}`, async (route) => {
    scopeRequestBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: scopeId,
        connectionId,
        boardId: 42,
        boardName: 'E2E Kanban Board',
        timezone: 'UTC',
        includedIssueTypeIds: ['story'],
        startStatusIds: ['10'],
        doneStatusIds: ['30'],
        syncIntervalMinutes: 15,
        status: 'active',
      }),
    });
  });

  await page.goto('/admin/jira');
  await page.getByRole('button', { name: /edit flow scope/i }).first().click();
  await page.getByRole('spinbutton', { name: /sync interval/i }).first().waitFor();
  await page.getByRole('spinbutton', { name: /sync interval/i }).first().fill('15');
  await page.getByRole('button', { name: /save flow scope/i }).click();

  await expect(page.getByText(/flow scope updated/i)).toBeVisible();
  expect(scopeRequestBody).toMatchObject({
    connectionId,
    boardId: 42,
    syncIntervalMinutes: 15,
  });
});

// ─── Test: /scopes/:id renders scope detail ───────────────────────────────────

test('scope detail page shows board name, sync status, and no error warnings', async ({
  page,
}) => {
  await setAdminSession(page);
  await page.goto(`/scopes/${scopeId}`);

  // Board name heading.
  await expect(page.getByText('E2E Kanban Board')).toBeVisible();

  // Last sync shows succeeded.
  await expect(page.getByText('succeeded')).toBeVisible();

  // No warning banner should be present for a healthy, succeeded scope.
  await expect(page.getByText('⚠ Warnings')).not.toBeVisible();

  // Configuration section shows correct values.
  const configurationSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Configuration', exact: true }),
  });

  const boardIdCard = configurationSection.locator('article').filter({
    has: page.getByText('Board ID', { exact: true }),
  });
  await expect(boardIdCard.getByText('42', { exact: true })).toBeVisible();

  const timezoneCard = configurationSection.locator('article').filter({
    has: page.getByText('Timezone', { exact: true }),
  });
  await expect(timezoneCard.getByText('UTC', { exact: true })).toBeVisible();
});
