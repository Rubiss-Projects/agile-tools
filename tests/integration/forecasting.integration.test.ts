/**
 * Integration tests for forecasting: throughput projection, Monte Carlo
 * sampling, and low-confidence warnings.
 *
 * Two sections:
 * 1. Pure unit tests for `runWhenForecast`, `runHowManyForecast`, and
 *    `computeForecastRequestHash` — no DB required.
 * 2. DB integration tests (Testcontainers Postgres) for `queryDailyThroughput`,
 *    `queryCompletedStories`, and the forecast cache round-trip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetConfig } from '@agile-tools/shared';
import {
  getPrismaClient,
  disconnectPrisma,
  queryDailyThroughput,
  queryCompletedStories,
  computeForecastRequestHash,
  lookupForecastCache,
  storeForecastCache,
  formatDateInTimezone,
} from '@agile-tools/db';
import {
  runWhenForecast,
  runHowManyForecast,
  FORECAST_MIN_SAMPLE_SIZE,
} from '../../packages/analytics/src/monte-carlo';
import { startPostgres, stopPostgres } from './support/postgres';

// ─── Section 1: Pure unit tests ───────────────────────────────────────────────

describe('runWhenForecast — pure unit', () => {
  it('returns the same completion date for all confidence levels when throughput is deterministic', () => {
    // With throughput always exactly 1 story/day, every trial takes exactly 5 days.
    // referenceDate 2025-01-01 + 5 days = 2025-01-06.
    const result = runWhenForecast({
      historicalDailyThroughput: [1],
      sampleSize: 100,
      remainingStoryCount: 5,
      confidenceLevels: [50, 85, 95],
      iterations: 200,
      referenceDate: new Date('2025-01-01T12:00:00Z'),
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r.completionDate).toBe('2025-01-06');
    }
  });

  it('attaches LOW_SAMPLE_SIZE warning when sampleSize is below threshold', () => {
    const result = runWhenForecast({
      historicalDailyThroughput: [1, 2, 3],
      sampleSize: FORECAST_MIN_SAMPLE_SIZE - 1,
      remainingStoryCount: 10,
      confidenceLevels: [50],
      iterations: 100,
    });

    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('LOW_SAMPLE_SIZE');
    expect(result.warnings.find((w) => w.code === 'LOW_SAMPLE_SIZE')!.message).toContain(
      String(FORECAST_MIN_SAMPLE_SIZE - 1),
    );
  });

  it('attaches NO_THROUGHPUT_HISTORY warning and omits completionDate when throughput is all zeros', () => {
    const result = runWhenForecast({
      historicalDailyThroughput: [0, 0, 0],
      sampleSize: 0,
      remainingStoryCount: 5,
      confidenceLevels: [50, 85],
      iterations: 100,
    });

    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('NO_THROUGHPUT_HISTORY');
    expect(result.results).toHaveLength(2);
    for (const r of result.results) {
      expect(r.completionDate).toBeUndefined();
    }
  });

  it('higher confidence level yields the same or later completion date', () => {
    // Variable throughput: 3, 1, 2, 0, 1 — stochastic but predictable ordering.
    const result = runWhenForecast({
      historicalDailyThroughput: [3, 1, 2, 0, 1],
      sampleSize: 100,
      remainingStoryCount: 20,
      confidenceLevels: [50, 70, 85, 95],
      iterations: 500,
      referenceDate: new Date('2025-01-01T12:00:00Z'),
    });

    expect(result.warnings).toHaveLength(0);
    const dates = result.results.map((r) => r.completionDate!);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! >= dates[i - 1]!).toBe(true);
    }
  });
});

describe('runHowManyForecast — pure unit', () => {
  it('returns the same story count for all confidence levels when throughput is deterministic', () => {
    // With throughput always exactly 2 stories/day × 5 days = always 10 stories per trial.
    const result = runHowManyForecast({
      historicalDailyThroughput: [2],
      sampleSize: 100,
      targetDays: 5,
      confidenceLevels: [50, 70, 85, 95],
      iterations: 200,
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.results).toHaveLength(4);
    for (const r of result.results) {
      expect(r.completedStoryCount).toBe(10);
    }
  });

  it('attaches LOW_SAMPLE_SIZE warning when sampleSize is below threshold', () => {
    const result = runHowManyForecast({
      historicalDailyThroughput: [1, 2],
      sampleSize: FORECAST_MIN_SAMPLE_SIZE - 1,
      targetDays: 14,
      confidenceLevels: [85],
      iterations: 100,
    });

    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('LOW_SAMPLE_SIZE');
  });

  it('attaches NO_THROUGHPUT_HISTORY warning and omits completedStoryCount when throughput is all zeros', () => {
    const result = runHowManyForecast({
      historicalDailyThroughput: [0, 0],
      sampleSize: 0,
      targetDays: 14,
      confidenceLevels: [50, 85],
      iterations: 100,
    });

    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('NO_THROUGHPUT_HISTORY');
    expect(result.results).toHaveLength(2);
    for (const r of result.results) {
      expect(r.completedStoryCount).toBeUndefined();
    }
  });

  it('higher confidence level yields the same or fewer stories (more conservative)', () => {
    const result = runHowManyForecast({
      historicalDailyThroughput: [3, 1, 2, 0, 1],
      sampleSize: 100,
      targetDays: 20,
      confidenceLevels: [50, 70, 85, 95],
      iterations: 500,
    });

    expect(result.warnings).toHaveLength(0);
    const counts = result.results.map((r) => r.completedStoryCount!);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]! <= counts[i - 1]!).toBe(true);
    }
  });
});

describe('computeForecastRequestHash — pure unit', () => {
  it('produces the same hash for identical inputs', () => {
    const input = {
      type: 'when' as const,
      historicalWindowDays: 90,
      iterations: 10000,
      confidenceLevels: [50, 85],
      remainingStoryCount: 10,
    };
    expect(computeForecastRequestHash(input)).toBe(computeForecastRequestHash(input));
  });

  it('produces the same hash regardless of confidence level order', () => {
    const base = {
      type: 'how_many' as const,
      historicalWindowDays: 90,
      iterations: 10000,
      targetDate: '2025-06-01',
    };
    const hash1 = computeForecastRequestHash({ ...base, confidenceLevels: [85, 50, 70] });
    const hash2 = computeForecastRequestHash({ ...base, confidenceLevels: [50, 70, 85] });
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different remainingStoryCount values', () => {
    const base = {
      type: 'when' as const,
      historicalWindowDays: 90,
      iterations: 10000,
      confidenceLevels: [85],
    };
    const h5 = computeForecastRequestHash({ ...base, remainingStoryCount: 5 });
    const h10 = computeForecastRequestHash({ ...base, remainingStoryCount: 10 });
    expect(h5).not.toBe(h10);
  });

  it('produces different hashes for when vs how_many', () => {
    const h1 = computeForecastRequestHash({
      type: 'when',
      historicalWindowDays: 90,
      iterations: 10000,
      confidenceLevels: [85],
      remainingStoryCount: 10,
    });
    const h2 = computeForecastRequestHash({
      type: 'how_many',
      historicalWindowDays: 90,
      iterations: 10000,
      confidenceLevels: [85],
      targetDate: '2025-06-01',
    });
    expect(h1).not.toBe(h2);
  });
});

// ─── Section 2: DB integration tests ─────────────────────────────────────────

let dbStarted = false;

async function ensureDbStarted() {
  if (dbStarted) return;
  const pg = await startPostgres();
  process.env['DATABASE_URL'] = pg.connectionUrl;
  process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars-ok!';
  dbStarted = true;
}

afterAll(async () => {
  await disconnectPrisma();
  await stopPostgres();
});

// ─── queryDailyThroughput tests ───────────────────────────────────────────────

describe('queryDailyThroughput — DB integration', () => {
  let scopeId: string;
  let syncRunId: string;
  let fiveDaysAgoDay: string;
  let twoDaysAgoDay: string;

  beforeAll(async () => {
    await ensureDbStarted();
    resetConfig();
    await disconnectPrisma();

    const db = getPrismaClient();

    const workspace = await db.workspace.create({
      data: { name: 'Throughput Test Workspace', defaultTimezone: 'UTC' },
    });

    const conn = await db.jiraConnection.create({
      data: {
        workspaceId: workspace.id,
        baseUrl: 'https://jira.example.internal',
        authType: 'pat',
        encryptedSecretRef: 'dummy',
      },
    });

    const scope = await db.flowScope.create({
      data: {
        workspaceId: workspace.id,
        connectionId: conn.id,
        boardId: '20',
        boardName: 'Throughput Test Board',
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
        finishedAt: new Date('2025-01-10T00:00:00Z'),
      },
    });
    syncRunId = syncRun.id;

    // Seed timestamps at noon UTC to avoid off-by-one edge cases at midnight.
    const now = new Date();
    const fiveDaysAgoNoon = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    fiveDaysAgoNoon.setUTCHours(12, 0, 0, 0);
    const twoDaysAgoNoon = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    twoDaysAgoNoon.setUTCHours(12, 0, 0, 0);

    // Compute the expected YYYY-MM-DD label for assertions.
    fiveDaysAgoDay = formatDateInTimezone(fiveDaysAgoNoon, 'UTC');
    twoDaysAgoDay = formatDateInTimezone(twoDaysAgoNoon, 'UTC');

    // 1 item completed 5 days ago; 2 items completed 2 days ago.
    await db.workItem.createMany({
      data: [
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'TH-1',
          issueKey: 'TH-1',
          summary: 'Done item 1',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'TH',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/TH-1',
          createdAt: fiveDaysAgoNoon,
          startedAt: fiveDaysAgoNoon,
          completedAt: fiveDaysAgoNoon,
        },
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'TH-2',
          issueKey: 'TH-2',
          summary: 'Done item 2',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'TH',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/TH-2',
          createdAt: twoDaysAgoNoon,
          startedAt: twoDaysAgoNoon,
          completedAt: twoDaysAgoNoon,
        },
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'TH-3',
          issueKey: 'TH-3',
          summary: 'Done item 3',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'TH',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/TH-3',
          createdAt: twoDaysAgoNoon,
          startedAt: twoDaysAgoNoon,
          completedAt: twoDaysAgoNoon,
        },
      ],
    });
  });

  it('returns one row per calendar day with YYYY-MM-DD format', async () => {
    const db = getPrismaClient();
    const days = await queryDailyThroughput(db, scopeId, 'UTC', { windowDays: 7 });

    expect(days.length).toBeGreaterThanOrEqual(7);
    for (const d of days) {
      expect(d.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.completedStoryCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('buckets completed items into the correct calendar days', async () => {
    const db = getPrismaClient();
    const days = await queryDailyThroughput(db, scopeId, 'UTC', { windowDays: 7 });

    const byDay = new Map(days.map((d) => [d.day, d.completedStoryCount]));

    expect(byDay.get(fiveDaysAgoDay)).toBe(1);
    expect(byDay.get(twoDaysAgoDay)).toBe(2);
  });

  it('all days between the seeded days have zero completions', async () => {
    const db = getPrismaClient();
    const days = await queryDailyThroughput(db, scopeId, 'UTC', { windowDays: 7 });

    const nonZeroDays = days.filter((d) => d.completedStoryCount > 0).map((d) => d.day);
    // Only fiveDaysAgo and twoDaysAgo should have non-zero counts.
    expect(nonZeroDays).toEqual(
      expect.arrayContaining([fiveDaysAgoDay, twoDaysAgoDay]),
    );
    // There should be exactly 2 non-zero past days.
    const nonZeroPastDays = nonZeroDays.filter((day) => {
      const today = formatDateInTimezone(new Date(), 'UTC');
      return day < today;
    });
    expect(nonZeroPastDays).toHaveLength(2);
  });

  it('marks today as complete: false and all past days as complete: true', async () => {
    const db = getPrismaClient();
    const days = await queryDailyThroughput(db, scopeId, 'UTC', { windowDays: 7 });

    const today = formatDateInTimezone(new Date(), 'UTC');

    const todayEntry = days.find((d) => d.day === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.complete).toBe(false);

    const pastDays = days.filter((d) => d.day < today);
    expect(pastDays.length).toBeGreaterThan(0);
    expect(pastDays.every((d) => d.complete)).toBe(true);
  });
});

// ─── queryCompletedStories tests ──────────────────────────────────────────────

describe('queryCompletedStories — DB integration', () => {
  let scopeId: string;
  let syncRunId: string;

  beforeAll(async () => {
    await ensureDbStarted();
    resetConfig();
    await disconnectPrisma();

    const db = getPrismaClient();

    const workspace = await db.workspace.create({
      data: { name: 'Completed Stories Test Workspace', defaultTimezone: 'UTC' },
    });

    const conn = await db.jiraConnection.create({
      data: {
        workspaceId: workspace.id,
        baseUrl: 'https://jira.example.internal',
        authType: 'pat',
        encryptedSecretRef: 'dummy',
      },
    });

    const scope = await db.flowScope.create({
      data: {
        workspaceId: workspace.id,
        connectionId: conn.id,
        boardId: '21',
        boardName: 'Completed Stories Board',
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
        finishedAt: new Date('2025-01-10T00:00:00Z'),
      },
    });
    syncRunId = syncRun.id;

    const now = new Date();
    // CS-1: started 20 days ago, completed 10 days ago → cycle ≈ 10 days
    const started20 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    started20.setUTCHours(12, 0, 0, 0);
    const completed10 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    completed10.setUTCHours(12, 0, 0, 0);

    // CS-2: started 10 days ago, completed 3 days ago → cycle ≈ 7 days
    const started10 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    started10.setUTCHours(12, 0, 0, 0);
    const completed3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    completed3.setUTCHours(12, 0, 0, 0);

    await db.workItem.createMany({
      data: [
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'CS-1',
          issueKey: 'CS-1',
          summary: 'Completed item A',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'CS',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/CS-1',
          createdAt: started20,
          startedAt: started20,
          completedAt: completed10,
        },
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'CS-2',
          issueKey: 'CS-2',
          summary: 'Completed item B',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'CS',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/CS-2',
          createdAt: started10,
          startedAt: started10,
          completedAt: completed3,
        },
        // This item should be excluded from results.
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'CS-3',
          issueKey: 'CS-3',
          summary: 'Excluded item',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'CS',
          currentStatusId: '30',
          currentColumn: 'Done',
          directUrl: 'https://jira.example.internal/browse/CS-3',
          createdAt: started10,
          startedAt: started10,
          completedAt: completed3,
          excludedReason: 'manual',
        },
      ],
    });
  });

  it('returns only non-excluded completed stories within the window', async () => {
    const db = getPrismaClient();
    const stories = await queryCompletedStories(db, scopeId, { windowDays: 90 });

    expect(stories).toHaveLength(2);
    const keys = stories.map((s) => s.issueKey);
    expect(keys).toContain('CS-1');
    expect(keys).toContain('CS-2');
    expect(keys).not.toContain('CS-3');
  });

  it('computes cycle time correctly for each story', async () => {
    const db = getPrismaClient();
    const stories = await queryCompletedStories(db, scopeId, { windowDays: 90 });

    const cs1 = stories.find((s) => s.issueKey === 'CS-1')!;
    const cs2 = stories.find((s) => s.issueKey === 'CS-2')!;

    // CS-1: 20 days ago → 10 days ago = 10 days cycle
    expect(cs1.cycleTimeDays).toBeCloseTo(10, 0);
    // CS-2: 10 days ago → 3 days ago = 7 days cycle
    expect(cs2.cycleTimeDays).toBeCloseTo(7, 0);
  });

  it('excludes stories completed outside the historical window', async () => {
    const db = getPrismaClient();
    // Window of only 5 days: only CS-2 (completed 3 days ago) should be returned.
    const stories = await queryCompletedStories(db, scopeId, { windowDays: 5 });

    expect(stories).toHaveLength(1);
    expect(stories[0]!.issueKey).toBe('CS-2');
  });
});

// ─── Forecast cache round-trip tests ─────────────────────────────────────────

describe('forecast cache round-trip — DB integration', () => {
  let scopeId: string;

  beforeAll(async () => {
    await ensureDbStarted();
    resetConfig();
    await disconnectPrisma();

    const db = getPrismaClient();

    const workspace = await db.workspace.create({
      data: { name: 'Cache Test Workspace', defaultTimezone: 'UTC' },
    });

    const conn = await db.jiraConnection.create({
      data: {
        workspaceId: workspace.id,
        baseUrl: 'https://jira.example.internal',
        authType: 'pat',
        encryptedSecretRef: 'dummy',
      },
    });

    const scope = await db.flowScope.create({
      data: {
        workspaceId: workspace.id,
        connectionId: conn.id,
        boardId: '22',
        boardName: 'Cache Test Board',
        timezone: 'UTC',
        includedIssueTypeIds: ['story'],
        startStatusIds: ['10'],
        doneStatusIds: ['30'],
        syncIntervalMinutes: 10,
      },
    });
    scopeId = scope.id;
  });

  it('returns null for a cache miss (unknown requestHash)', async () => {
    const db = getPrismaClient();
    const hash = computeForecastRequestHash({
      type: 'when',
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50],
      remainingStoryCount: 99,
    });
    const result = await lookupForecastCache(db, scopeId, hash, 'no-such-version');
    expect(result).toBeNull();
  });

  it('stores and retrieves a cached forecast result with correct payload and sampleSize', async () => {
    const db = getPrismaClient();
    const hash = computeForecastRequestHash({
      type: 'when',
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50, 85],
      remainingStoryCount: 10,
    });
    const dataVersion = 'cache-test-v1';
    const payload = {
      results: [
        { confidenceLevel: 50, completionDate: '2025-06-01' },
        { confidenceLevel: 85, completionDate: '2025-07-15' },
      ],
      warnings: [],
    };

    await storeForecastCache(db, {
      scopeId,
      requestHash: hash,
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50, 85],
      sampleSize: 75,
      dataVersion,
      payload,
    });

    const cached = await lookupForecastCache(db, scopeId, hash, dataVersion);
    expect(cached).not.toBeNull();
    expect(cached!.sampleSize).toBe(75);
    expect(cached!.payload.results).toHaveLength(2);
    expect(cached!.payload.results[0]!.completionDate).toBe('2025-06-01');
    expect(cached!.payload.results[1]!.completionDate).toBe('2025-07-15');
    expect(cached!.payload.warnings).toHaveLength(0);
  });

  it('upsert overwrites an existing cache entry with the same key', async () => {
    const db = getPrismaClient();
    const hash = computeForecastRequestHash({
      type: 'when',
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50],
      remainingStoryCount: 5,
    });
    const dataVersion = 'cache-test-v2';

    const firstPayload = {
      results: [{ confidenceLevel: 50, completionDate: '2025-05-01' }],
      warnings: [],
    };
    const secondPayload = {
      results: [{ confidenceLevel: 50, completionDate: '2025-05-15' }],
      warnings: [{ code: 'LOW_SAMPLE_SIZE', message: 'Only 30 stories.' }],
    };

    await storeForecastCache(db, {
      scopeId,
      requestHash: hash,
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50],
      sampleSize: 30,
      dataVersion,
      payload: firstPayload,
    });
    await storeForecastCache(db, {
      scopeId,
      requestHash: hash,
      historicalWindowDays: 90,
      iterations: 1000,
      confidenceLevels: [50],
      sampleSize: 30,
      dataVersion,
      payload: secondPayload,
    });

    const cached = await lookupForecastCache(db, scopeId, hash, dataVersion);
    expect(cached).not.toBeNull();
    expect(cached!.payload.results[0]!.completionDate).toBe('2025-05-15');
    expect(cached!.payload.warnings).toHaveLength(1);
  });
});
