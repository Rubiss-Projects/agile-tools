/**
 * Performance benchmarks for the three hot read paths:
 *
 *  - queryCurrentWorkItems   (flow scatter-plot DB query)
 *  - getWorkItemWithDetail   (item detail DB query)
 *  - queryDailyThroughput    (throughput projection DB query)
 *  - runWhenForecast / runHowManyForecast (Monte Carlo simulation)
 *
 * These tests spin up a real Postgres instance via Testcontainers and seed a
 * dataset sized close to the target production scale described in plan.md:
 *   - 500 active work items with hold periods
 *   - 400 completed work items spread over 24 months
 *   - ~5 lifecycle events per item (5 000 events total)
 *
 * Acceptance thresholds (from plan.md and quickstart.md):
 *   - Flow / detail DB queries: p95 < 500 ms
 *   - Monte Carlo (10k trials): < 3 000 ms
 *   - Throughput projection:     p95 < 500 ms
 *
 * NOTE: These are query-level guardrails, not end-to-end HTTP benchmarks.
 * They do not include Next.js route handling, auth, or serialization overhead.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetConfig } from '@agile-tools/shared';
import {
  getPrismaClient,
  disconnectPrisma,
  queryCurrentWorkItems,
  queryDailyThroughput,
  getWorkItemWithDetail,
} from '@agile-tools/db';
import {
  runWhenForecast,
  runHowManyForecast,
  DEFAULT_MONTE_CARLO_ITERATIONS,
} from '../../../packages/analytics/src/monte-carlo';
import { startPostgres, stopPostgres } from '../support/postgres';

// ─── Thresholds ────────────────────────────────────────────────────────────────

/** p95 target for DB projection queries (flow, detail, throughput). */
const DB_QUERY_P95_MS = 500;

/** Absolute budget for a single Monte Carlo simulation. */
const MONTE_CARLO_BUDGET_MS = 3_000;

/** Number of timing samples per benchmark. */
const SAMPLES = 20;

// ─── Shared state ──────────────────────────────────────────────────────────────

let scopeId: string;
let sampleWorkItemId: string;
let sampleCompletedWorkItemId: string;
let scopeTimezone: string;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const pg = await startPostgres();
  process.env['DATABASE_URL'] = pg.connectionUrl;
  process.env['ENCRYPTION_KEY'] = 'perf-test-encryption-key-32chars!';
  resetConfig();
  await disconnectPrisma();

  const db = getPrismaClient();

  // ── Workspace, connection, scope ──────────────────────────────────────────
  const workspace = await db.workspace.create({
    data: { name: 'Perf Test Workspace', defaultTimezone: 'UTC' },
  });

  const conn = await db.jiraConnection.create({
    data: {
      workspaceId: workspace.id,
      baseUrl: 'https://jira.perf.test',
      authType: 'pat',
      encryptedSecretRef: 'dummy-encrypted',
    },
  });

  scopeTimezone = 'UTC';
  const scope = await db.flowScope.create({
    data: {
      workspaceId: workspace.id,
      connectionId: conn.id,
      boardId: '99',
      boardName: 'Perf Test Board',
      timezone: scopeTimezone,
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
      startedAt: new Date('2025-01-01T08:00:00Z'),
      finishedAt: new Date('2025-01-01T08:15:00Z'),
      dataVersion: 'perf-dv-001',
    },
  });

  // ── Seed 500 active work items with hold periods ───────────────────────────
  const activeItems = Array.from({ length: 500 }, (_, i) => ({
    scopeId,
    jiraIssueId: `PERF-A${i + 1}`,
    issueKey: `PERF-A${i + 1}`,
    summary: `Active story ${i + 1}`,
    issueTypeId: 'story',
    issueTypeName: 'Story',
    projectId: 'PERF',
    currentStatusId: '20',
    currentColumn: 'In Progress',
    directUrl: `https://jira.perf.test/browse/PERF-A${i + 1}`,
    createdAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
    lastSyncRunId: syncRun.id,
    updatedAt: new Date(),
  }));

  // Batch insert in chunks of 100 to stay within Prisma's createMany limits
  for (let i = 0; i < activeItems.length; i += 100) {
    await db.workItem.createMany({ data: activeItems.slice(i, i + 100) });
  }

  // Give 100 of the active items a hold period
  const allActive = await db.workItem.findMany({
    where: { scopeId, completedAt: null },
    select: { id: true },
    take: 100,
  });

  const holdPeriods = allActive.map((wi, idx) => ({
    workItemId: wi.id,
    startedAt: new Date(Date.now() - (idx + 2) * 24 * 60 * 60 * 1000),
    endedAt: new Date(Date.now() - (idx + 1) * 24 * 60 * 60 * 1000),
    source: 'status' as const,
    sourceValue: '25',
  }));
  await db.holdPeriod.createMany({ data: holdPeriods });

  // Record the first active item id for detail benchmarks
  sampleWorkItemId = allActive[0]!.id;

  // ── Seed 400 completed work items over 24 months ───────────────────────────
  const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;
  const completedItems = Array.from({ length: 400 }, (_, i) => {
    const completedAt = new Date(Date.now() - TWO_YEARS_MS + i * (TWO_YEARS_MS / 400));
    const startedAt = new Date(completedAt.getTime() - (3 + (i % 14)) * 24 * 60 * 60 * 1000);
    return {
      scopeId,
      jiraIssueId: `PERF-C${i + 1}`,
      issueKey: `PERF-C${i + 1}`,
      summary: `Completed story ${i + 1}`,
      issueTypeId: 'story',
      issueTypeName: 'Story',
      projectId: 'PERF',
      currentStatusId: '30',
      currentColumn: 'Done',
      directUrl: `https://jira.perf.test/browse/PERF-C${i + 1}`,
      createdAt: new Date(startedAt.getTime() - 24 * 60 * 60 * 1000),
      startedAt,
      completedAt,
      lastSyncRunId: syncRun.id,
      updatedAt: new Date(),
    };
  });

  for (let i = 0; i < completedItems.length; i += 100) {
    await db.workItem.createMany({ data: completedItems.slice(i, i + 100) });
  }

  const firstCompleted = await db.workItem.findFirst({
    where: { scopeId, completedAt: { not: null } },
    select: { id: true },
  });
  sampleCompletedWorkItemId = firstCompleted!.id;

  // ── Seed lifecycle events (~5 per completed item, first 80 items) ──────────
  const completedSample = await db.workItem.findMany({
    where: { scopeId, completedAt: { not: null } },
    select: { id: true, startedAt: true },
    take: 80,
  });

  const lifecycleEvents = completedSample.flatMap((wi, idx) => [
    {
      workItemId: wi.id,
      eventType: 'status_change' as const,
      fromStatusId: '10',
      toStatusId: '20',
      changedAt: new Date((wi.startedAt ?? new Date()).getTime() + idx * 1000),
    },
    {
      workItemId: wi.id,
      eventType: 'status_change' as const,
      fromStatusId: '20',
      toStatusId: '25',
      changedAt: new Date((wi.startedAt ?? new Date()).getTime() + idx * 1000 + 3600_000),
    },
    {
      workItemId: wi.id,
      eventType: 'status_change' as const,
      fromStatusId: '25',
      toStatusId: '20',
      changedAt: new Date((wi.startedAt ?? new Date()).getTime() + idx * 1000 + 7200_000),
    },
    {
      workItemId: wi.id,
      eventType: 'status_change' as const,
      fromStatusId: '20',
      toStatusId: '30',
      changedAt: new Date((wi.startedAt ?? new Date()).getTime() + idx * 1000 + 86_400_000),
    },
    {
      workItemId: wi.id,
      eventType: 'completed' as const,
      changedAt: new Date((wi.startedAt ?? new Date()).getTime() + idx * 1000 + 86_400_000 + 1),
    },
  ]);

  for (let i = 0; i < lifecycleEvents.length; i += 100) {
    await db.workItemLifecycleEvent.createMany({ data: lifecycleEvents.slice(i, i + 100) });
  }
}, 180_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopPostgres();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Run `fn` `samples` times and return an array of elapsed milliseconds. */
async function measureMs(fn: () => Promise<void>, samples: number): Promise<number[]> {
  const times: number[] = [];
  // Warm-up: one call before recording to avoid cold-cache distortion
  await fn();
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return times;
}

/** Compute p95 of an array of millisecond measurements. */
function p95(ms: number[]): number {
  const sorted = [...ms].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)]!;
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe('queryCurrentWorkItems — flow scatter-plot query', () => {
  it(`p95 < ${DB_QUERY_P95_MS} ms for 500 active items`, async () => {
    const db = getPrismaClient();
    const times = await measureMs(
      () => queryCurrentWorkItems(db, scopeId).then(() => undefined),
      SAMPLES,
    );
    const result = p95(times);
    console.info(`queryCurrentWorkItems p95: ${result.toFixed(1)} ms (n=${SAMPLES})`);
    expect(result).toBeLessThan(DB_QUERY_P95_MS);
  });
});

describe('getWorkItemWithDetail — item detail query', () => {
  it(`p95 < ${DB_QUERY_P95_MS} ms including lifecycle events and hold periods`, async () => {
    const db = getPrismaClient();
    const times = await measureMs(
      () => getWorkItemWithDetail(db, scopeId, sampleWorkItemId).then(() => undefined),
      SAMPLES,
    );
    const result = p95(times);
    console.info(`getWorkItemWithDetail p95: ${result.toFixed(1)} ms (n=${SAMPLES})`);
    expect(result).toBeLessThan(DB_QUERY_P95_MS);
  });

  it(`p95 < ${DB_QUERY_P95_MS} ms for completed item with lifecycle history`, async () => {
    const db = getPrismaClient();
    const times = await measureMs(
      () => getWorkItemWithDetail(db, scopeId, sampleCompletedWorkItemId).then(() => undefined),
      SAMPLES,
    );
    const result = p95(times);
    console.info(`getWorkItemWithDetail (completed) p95: ${result.toFixed(1)} ms (n=${SAMPLES})`);
    expect(result).toBeLessThan(DB_QUERY_P95_MS);
  });
});

describe('queryDailyThroughput — throughput projection query', () => {
  it(`p95 < ${DB_QUERY_P95_MS} ms for 90-day window over 400 completed items`, async () => {
    const db = getPrismaClient();
    const times = await measureMs(
      () =>
        queryDailyThroughput(db, scopeId, scopeTimezone, { windowDays: 90 }).then(() => undefined),
      SAMPLES,
    );
    const result = p95(times);
    console.info(`queryDailyThroughput (90d) p95: ${result.toFixed(1)} ms (n=${SAMPLES})`);
    expect(result).toBeLessThan(DB_QUERY_P95_MS);
  });

  it(`p95 < ${DB_QUERY_P95_MS} ms for 180-day window`, async () => {
    const db = getPrismaClient();
    const times = await measureMs(
      () =>
        queryDailyThroughput(db, scopeId, scopeTimezone, { windowDays: 180 }).then(
          () => undefined,
        ),
      SAMPLES,
    );
    const result = p95(times);
    console.info(`queryDailyThroughput (180d) p95: ${result.toFixed(1)} ms (n=${SAMPLES})`);
    expect(result).toBeLessThan(DB_QUERY_P95_MS);
  });
});

describe('Monte Carlo simulation — CPU budget', () => {
  // Build a realistic throughput distribution from 90 days, ~1.5 stories/day average
  const historicalDailyThroughput = Array.from({ length: 90 }, (_, i) =>
    i % 3 === 0 ? 0 : i % 7 === 0 ? 3 : 1,
  );
  const sampleSize = historicalDailyThroughput.reduce((a, b) => a + b, 0);

  it(`runWhenForecast (${DEFAULT_MONTE_CARLO_ITERATIONS} trials) < ${MONTE_CARLO_BUDGET_MS} ms`, () => {
    const start = performance.now();
    const result = runWhenForecast({
      historicalDailyThroughput,
      sampleSize,
      remainingStoryCount: 50,
      confidenceLevels: [50, 70, 85, 95],
      iterations: DEFAULT_MONTE_CARLO_ITERATIONS,
    });
    const elapsed = performance.now() - start;
    console.info(`runWhenForecast elapsed: ${elapsed.toFixed(1)} ms`);
    expect(result.results).toHaveLength(4);
    expect(elapsed).toBeLessThan(MONTE_CARLO_BUDGET_MS);
  });

  it(`runHowManyForecast (${DEFAULT_MONTE_CARLO_ITERATIONS} trials) < ${MONTE_CARLO_BUDGET_MS} ms`, () => {
    const start = performance.now();
    const result = runHowManyForecast({
      historicalDailyThroughput,
      sampleSize,
      targetDays: 60,
      confidenceLevels: [50, 70, 85, 95],
      iterations: DEFAULT_MONTE_CARLO_ITERATIONS,
    });
    const elapsed = performance.now() - start;
    console.info(`runHowManyForecast elapsed: ${elapsed.toFixed(1)} ms`);
    expect(result.results).toHaveLength(4);
    expect(elapsed).toBeLessThan(MONTE_CARLO_BUDGET_MS);
  });
});
