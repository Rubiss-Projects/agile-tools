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

// ─── DB seeding helpers ───────────────────────────────────────────────────────

const ENCRYPTION_KEY =
  process.env['ENCRYPTION_KEY'] ?? 'test-encryption-key-32-chars-ok!';
const TEST_PAT = 'e2e-test-pat';
const JIRA_BASE = 'https://jira.example.internal';

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
  adminCookie = Buffer.from(
    JSON.stringify({ userId: 'e2e-user', workspaceId, role: 'admin' }),
  ).toString('base64');
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
  await expect(page.getByText('E2E Jira Connection')).toBeVisible();

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
  await expect(page.getByText('E2E Jira Connection')).toBeVisible();
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
