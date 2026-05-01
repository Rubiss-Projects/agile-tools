/**
 * Integration tests for flow analytics: hold-period derivation, percentile
 * aging model computation, and zone classification from projections.
 *
 * Two sections:
 * 1. Pure unit tests for `buildAgingThresholdModel` and `classifyAgingZone` —
 *    no DB required.
 * 2. DB integration tests (Testcontainers Postgres) for `rebuildHoldPeriods`
 *    and `queryCurrentWorkItems` with aging thresholds.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resetConfig } from '@agile-tools/shared';
import { getPrismaClient, disconnectPrisma, queryCurrentWorkItems } from '@agile-tools/db';
import {
  buildAgingThresholdModel,
  classifyAgingZone,
  AGING_CONFIDENCE_THRESHOLD,
} from '../../packages/analytics/src/aging-thresholds';
import { rebuildHoldPeriods } from '../../apps/worker/src/projections/rebuild-hold-periods';
import { startPostgres, stopPostgres } from './support/postgres';

// ─── Section 1: Pure unit tests ───────────────────────────────────────────────

describe('buildAgingThresholdModel — pure unit', () => {
  it('returns zeros and lowConfidenceReason for empty input', () => {
    const result = buildAgingThresholdModel([], 90);

    expect(result.sampleSize).toBe(0);
    expect(result.p50).toBe(0);
    expect(result.p70).toBe(0);
    expect(result.p85).toBe(0);
    expect(result.lowConfidenceReason).not.toBeNull();
  });

  it(`sets lowConfidenceReason when sample < ${AGING_CONFIDENCE_THRESHOLD}`, () => {
    const stories = Array.from({ length: 10 }, (_, i) => ({ cycleTimeDays: i + 1 }));
    const result = buildAgingThresholdModel(stories, 90);

    expect(result.sampleSize).toBe(10);
    expect(result.lowConfidenceReason).not.toBeNull();
    expect(result.lowConfidenceReason).toContain('10');
  });

  it('clears lowConfidenceReason when sample meets threshold', () => {
    const stories = Array.from({ length: AGING_CONFIDENCE_THRESHOLD }, (_, i) => ({
      cycleTimeDays: i + 1,
    }));
    const result = buildAgingThresholdModel(stories, 90);

    expect(result.sampleSize).toBe(AGING_CONFIDENCE_THRESHOLD);
    expect(result.lowConfidenceReason).toBeNull();
  });

  it('computes correct p50, p70, p85 for a known dataset', () => {
    // 10 items: 1..10 days.  Nearest-rank (0-indexed, floor):
    // p50: floor(0.5 * 10) = 5 → index 5 → value 6
    // p70: floor(0.7 * 10) = 7 → index 7 → value 8
    // p85: floor(0.85 * 10) = 8 → index 8 → value 9
    const stories = Array.from({ length: 10 }, (_, i) => ({ cycleTimeDays: i + 1 }));
    const result = buildAgingThresholdModel(stories, 90);

    expect(result.p50).toBe(6);
    expect(result.p70).toBe(8);
    expect(result.p85).toBe(9);
  });

  it('filters out negative cycle times', () => {
    const stories = [
      { cycleTimeDays: -1 },
      { cycleTimeDays: 2 },
      { cycleTimeDays: 5 },
    ];
    const result = buildAgingThresholdModel(stories, 90);

    expect(result.sampleSize).toBe(2);
  });
});

describe('classifyAgingZone — pure unit', () => {
  const thresholds = { p50: 5, p85: 10 };

  it('returns normal when ageDays <= p50', () => {
    expect(classifyAgingZone(5, thresholds)).toBe('normal');
    expect(classifyAgingZone(3, thresholds)).toBe('normal');
  });

  it('returns watch when p50 < ageDays <= p85', () => {
    expect(classifyAgingZone(6, thresholds)).toBe('watch');
    expect(classifyAgingZone(10, thresholds)).toBe('watch');
  });

  it('returns aging when ageDays > p85', () => {
    expect(classifyAgingZone(11, thresholds)).toBe('aging');
    expect(classifyAgingZone(100, thresholds)).toBe('aging');
  });

  it('returns normal when all thresholds are zero (no data)', () => {
    expect(classifyAgingZone(99, { p50: 0, p85: 0 })).toBe('normal');
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

// ─── rebuildHoldPeriods tests ─────────────────────────────────────────────────

describe('rebuildHoldPeriods — DB integration', () => {
  let scopeId: string;
  let syncRunId: string;
  let workItemId: string;

  beforeAll(async () => {
    await ensureDbStarted();
    resetConfig();
    await disconnectPrisma();

    const db = getPrismaClient();

    const workspace = await db.workspace.create({
      data: { name: 'Hold Period Test Workspace', defaultTimezone: 'UTC' },
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
        boardId: '5',
        boardName: 'Hold Test Board',
        timezone: 'UTC',
        includedIssueTypeIds: ['story'],
        startStatusIds: ['10'],
        doneStatusIds: ['30'],
        syncIntervalMinutes: 10,
      },
    });
    scopeId = scope.id;

    // Create an active hold definition for status '20' (On Hold).
    await db.holdDefinition.create({
      data: {
        scopeId,
        holdStatusIds: ['20'],
        blockedFieldId: null,
        blockedTruthyValues: [],
        updatedBy: 'test',
        effectiveFrom: new Date('2025-01-01T00:00:00Z'),
      },
    });

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

    // Create a work item that enters status '20' then leaves.
    const wi = await db.workItem.create({
      data: {
        scopeId,
        lastSyncRunId: syncRunId,
        jiraIssueId: 'HP-1',
        issueKey: 'HP-1',
        summary: 'Item with hold period',
        issueTypeId: 'story',
        issueTypeName: 'Story',
        projectId: 'HP',
        currentStatusId: '10',
        currentColumn: 'In Progress',
        directUrl: 'https://jira.example.internal/browse/HP-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        startedAt: new Date('2025-01-01T00:00:00Z'),
      },
    });
    workItemId = wi.id;

    // Seed lifecycle events: enter hold → leave hold.
    await db.workItemLifecycleEvent.createMany({
      data: [
        {
          workItemId,
          eventType: 'status_change',
          fromStatusId: '10',
          toStatusId: '20',
          changedAt: new Date('2025-01-02T09:00:00Z'),
        },
        {
          workItemId,
          eventType: 'status_change',
          fromStatusId: '20',
          toStatusId: '10',
          changedAt: new Date('2025-01-04T17:00:00Z'),
        },
      ],
    });
  });

  it('creates a closed hold period from status-change events', async () => {
    const db = getPrismaClient();
    await rebuildHoldPeriods(db, scopeId, syncRunId);

    const periods = await db.holdPeriod.findMany({ where: { workItemId } });
    expect(periods).toHaveLength(1);

    const [hp] = periods;
    expect(hp!.source).toBe('status');
    expect(hp!.sourceValue).toBe('20');
    expect(hp!.startedAt.toISOString()).toBe('2025-01-02T09:00:00.000Z');
    expect(hp!.endedAt?.toISOString()).toBe('2025-01-04T17:00:00.000Z');
  });

  it('rebuilds idempotently (repeated call yields same result)', async () => {
    const db = getPrismaClient();
    await rebuildHoldPeriods(db, scopeId, syncRunId);
    await rebuildHoldPeriods(db, scopeId, syncRunId);

    const periods = await db.holdPeriod.findMany({ where: { workItemId } });
    expect(periods).toHaveLength(1);
  });
});

// ─── queryCurrentWorkItems aging zone classification ─────────────────────────

describe('queryCurrentWorkItems — aging zone classification — DB integration', () => {
  let scopeId: string;
  let syncRunId: string;

  beforeAll(async () => {
    await ensureDbStarted();
    resetConfig();
    await disconnectPrisma();

    const db = getPrismaClient();

    const workspace = await db.workspace.create({
      data: { name: 'Aging Zone Test Workspace', defaultTimezone: 'UTC' },
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
        boardId: '6',
        boardName: 'Aging Zone Board',
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

    // Create three items with ages designed to fall into different zones.
    // Thresholds below: p50=5, p85=10.
    // With "now" fixed to 2025-01-13T12:00:00Z:
    // Item A: Fri 2025-01-10 12:00 → Mon 2025-01-13 12:00 = 1 working day
    // Item B: Mon 2025-01-06 00:00 → Mon 2025-01-13 12:00 = 5.5 working days
    // Item C: Mon 2024-12-30 00:00 → Mon 2025-01-13 12:00 = 10.5 working days
    await db.workItem.createMany({
      data: [
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'AZ-1',
          issueKey: 'AZ-1',
          summary: 'Normal item',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'AZ',
          currentStatusId: '10',
          currentStatusName: 'In Progress',
          currentColumn: 'In Progress',
          assigneeName: 'Riley Chen',
          directUrl: 'https://jira.example.internal/browse/AZ-1',
          createdAt: new Date('2025-01-10T12:00:00Z'),
          startedAt: new Date('2025-01-10T12:00:00Z'),
        },
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'AZ-2',
          issueKey: 'AZ-2',
          summary: 'Watch item',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'AZ',
          currentStatusId: '10',
          currentStatusName: 'In Progress',
          currentColumn: 'In Progress',
          assigneeName: null,
          directUrl: 'https://jira.example.internal/browse/AZ-2',
          createdAt: new Date('2025-01-06T00:00:00Z'),
          startedAt: new Date('2025-01-06T00:00:00Z'),
        },
        {
          scopeId,
          lastSyncRunId: syncRunId,
          jiraIssueId: 'AZ-3',
          issueKey: 'AZ-3',
          summary: 'Aging item',
          issueTypeId: 'story',
          issueTypeName: 'Story',
          projectId: 'AZ',
          currentStatusId: '10',
          currentStatusName: 'In Progress',
          currentColumn: 'In Progress',
          assigneeName: 'Casey Nguyen',
          directUrl: 'https://jira.example.internal/browse/AZ-3',
          createdAt: new Date('2024-12-30T00:00:00Z'),
          startedAt: new Date('2024-12-30T00:00:00Z'),
        },
      ],
    });
  });

  it('classifies zones correctly when agingThresholds are supplied', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-13T12:00:00Z'));
    try {
      const db = getPrismaClient();
      const agingThresholds = { p50: 5, p85: 10 };

      const items = await queryCurrentWorkItems(db, scopeId, {
        dataVersion: syncRunId,
        agingThresholds,
        timezone: 'UTC',
      });

      expect(items).toHaveLength(3);

      const byKey = Object.fromEntries(items.map((i) => [i.issueKey, i]));
      expect(byKey['AZ-1']!.agingZone).toBe('normal');
      expect(byKey['AZ-2']!.agingZone).toBe('watch');
      expect(byKey['AZ-3']!.agingZone).toBe('aging');
      expect(byKey['AZ-1']!.currentStatusName).toBe('In Progress');
      expect(byKey['AZ-1']!.assigneeName).toBe('Riley Chen');
      expect(byKey['AZ-2']!.assigneeName).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults all items to normal zone when no agingThresholds supplied', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-13T12:00:00Z'));
    try {
      const db = getPrismaClient();
      const items = await queryCurrentWorkItems(db, scopeId, {
        dataVersion: syncRunId,
        timezone: 'UTC',
      });

      expect(items.every((i) => i.agingZone === 'normal')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
