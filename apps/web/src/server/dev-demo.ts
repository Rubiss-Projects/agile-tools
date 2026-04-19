import { getPrismaClient } from '@agile-tools/db';
import { encryptSecret, getConfig } from '@agile-tools/shared';
import type { WorkspaceContext } from './auth';

function demoUuid(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
}

export const LOCAL_DEMO_IDS = {
  workspaceId: demoUuid(1),
  connectionId: demoUuid(2),
  scopeId: demoUuid(3),
  syncRunId: demoUuid(4),
  userId: demoUuid(5),
} as const;

const LOCAL_DEMO_WORKSPACE_NAME = 'Local Demo Workspace';
const LOCAL_DEMO_CONNECTION_NAME = 'Local Demo Jira';
const LOCAL_DEMO_BASE_URL = 'https://jira.local.example';
const LOCAL_DEMO_BOARD_ID = '42';
const LOCAL_DEMO_BOARD_NAME = 'Payments Flow Board';
const LOCAL_DEMO_TIMEZONE = 'UTC';
const LOCAL_DEMO_PROJECT_ID = 'AG';
const LOCAL_DEMO_PAT = 'local-demo-personal-access-token';

export function isLocalDemoEnabled(): boolean {
  return getConfig().NODE_ENV !== 'production';
}

export function getLocalDemoDefaultPath(): string {
  return `/scopes/${LOCAL_DEMO_IDS.scopeId}`;
}

export function createLocalDemoSession(): WorkspaceContext {
  return {
    userId: LOCAL_DEMO_IDS.userId,
    workspaceId: LOCAL_DEMO_IDS.workspaceId,
    role: 'admin',
  };
}

export async function seedLocalDemoWorkspace(): Promise<{ scopeId: string }> {
  const db = getPrismaClient();
  const { ENCRYPTION_KEY, DEFAULT_SYNC_INTERVAL_MINUTES } = getConfig();

  const encryptedSecretRef = encryptSecret(LOCAL_DEMO_PAT, ENCRYPTION_KEY);
  const syncStartedAt = minutesAgo(40);
  const syncFinishedAt = minutesAgo(28);

  const completedItems = buildCompletedDemoItems(syncFinishedAt);
  const activeItems = buildActiveDemoItems(syncFinishedAt);

  await db.$transaction(async (tx) => {
    await tx.workspace.upsert({
      where: { id: LOCAL_DEMO_IDS.workspaceId },
      update: {
        name: LOCAL_DEMO_WORKSPACE_NAME,
        defaultTimezone: LOCAL_DEMO_TIMEZONE,
      },
      create: {
        id: LOCAL_DEMO_IDS.workspaceId,
        name: LOCAL_DEMO_WORKSPACE_NAME,
        defaultTimezone: LOCAL_DEMO_TIMEZONE,
      },
    });

    await tx.jiraConnection.upsert({
      where: { id: LOCAL_DEMO_IDS.connectionId },
      update: {
        workspaceId: LOCAL_DEMO_IDS.workspaceId,
        baseUrl: LOCAL_DEMO_BASE_URL,
        displayName: LOCAL_DEMO_CONNECTION_NAME,
        encryptedSecretRef,
        healthStatus: 'healthy',
        lastValidatedAt: minutesAgo(90),
        lastHealthyAt: minutesAgo(90),
        lastErrorCode: null,
      },
      create: {
        id: LOCAL_DEMO_IDS.connectionId,
        workspaceId: LOCAL_DEMO_IDS.workspaceId,
        baseUrl: LOCAL_DEMO_BASE_URL,
        displayName: LOCAL_DEMO_CONNECTION_NAME,
        encryptedSecretRef,
        healthStatus: 'healthy',
        lastValidatedAt: minutesAgo(90),
        lastHealthyAt: minutesAgo(90),
      },
    });

    await tx.flowScope.upsert({
      where: { id: LOCAL_DEMO_IDS.scopeId },
      update: {
        workspaceId: LOCAL_DEMO_IDS.workspaceId,
        connectionId: LOCAL_DEMO_IDS.connectionId,
        boardId: LOCAL_DEMO_BOARD_ID,
        boardName: LOCAL_DEMO_BOARD_NAME,
        timezone: LOCAL_DEMO_TIMEZONE,
        includedIssueTypeIds: ['story'],
        startStatusIds: ['in-progress', 'review', 'blocked'],
        doneStatusIds: ['done'],
        syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
        status: 'active',
      },
      create: {
        id: LOCAL_DEMO_IDS.scopeId,
        workspaceId: LOCAL_DEMO_IDS.workspaceId,
        connectionId: LOCAL_DEMO_IDS.connectionId,
        boardId: LOCAL_DEMO_BOARD_ID,
        boardName: LOCAL_DEMO_BOARD_NAME,
        timezone: LOCAL_DEMO_TIMEZONE,
        includedIssueTypeIds: ['story'],
        startStatusIds: ['in-progress', 'review', 'blocked'],
        doneStatusIds: ['done'],
        syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
        status: 'active',
      },
    });

    await tx.forecastResultCache.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });
    await tx.agingThresholdModel.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });
    await tx.holdDefinition.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });
    await tx.workItem.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });
    await tx.boardSnapshot.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });
    await tx.syncRun.deleteMany({ where: { scopeId: LOCAL_DEMO_IDS.scopeId } });

    await tx.syncRun.create({
      data: {
        id: LOCAL_DEMO_IDS.syncRunId,
        scopeId: LOCAL_DEMO_IDS.scopeId,
        trigger: 'manual',
        status: 'succeeded',
        requestedBy: LOCAL_DEMO_IDS.userId,
        startedAt: syncStartedAt,
        finishedAt: syncFinishedAt,
        dataVersion: LOCAL_DEMO_IDS.syncRunId,
      },
    });

    await tx.holdDefinition.create({
      data: {
        scopeId: LOCAL_DEMO_IDS.scopeId,
        holdStatusIds: ['blocked'],
        blockedTruthyValues: [],
        effectiveFrom: syncFinishedAt,
        updatedBy: LOCAL_DEMO_IDS.userId,
      },
    });

    await tx.workItem.createMany({ data: completedItems });

    for (const item of activeItems) {
      await tx.workItem.create({ data: item });
    }

    await tx.agingThresholdModel.create({
      data: {
        scopeId: LOCAL_DEMO_IDS.scopeId,
        historicalWindowDays: 90,
        sampleSize: completedItems.length,
        metricBasis: 'cycle_time',
        p50: 6.2,
        p70: 9.1,
        p85: 13.4,
        calculatedAt: syncFinishedAt,
        dataVersion: LOCAL_DEMO_IDS.syncRunId,
      },
    });
  });

  return { scopeId: LOCAL_DEMO_IDS.scopeId };
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function daysAgo(days: number, hour = 12): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function issueUrl(issueKey: string): string {
  return `${LOCAL_DEMO_BASE_URL}/browse/${issueKey}`;
}

function buildCompletedDemoItems(syncFinishedAt: Date) {
  const items: Array<{
    id: string;
    scopeId: string;
    jiraIssueId: string;
    issueKey: string;
    summary: string;
    issueTypeId: string;
    issueTypeName: string;
    projectId: string;
    currentStatusId: string;
    currentColumn: string;
    createdAt: Date;
    startedAt: Date;
    completedAt: Date;
    reopenedCount: number;
    directUrl: string;
    syncedAt: Date;
    lastSyncRunId: string;
  }> = [];

  for (let dayOffset = 88; dayOffset >= 2; dayOffset--) {
    const completionsForDay = dayOffset % 7 === 0 ? 0 : dayOffset % 13 === 0 ? 2 : 1;

    for (let slot = 0; slot < completionsForDay; slot += 1) {
      const index = items.length + 1;
      const issueKey = `AG-${100 + index}`;
      const cycleDays = 4 + ((index * 3) % 9);
      const completedAt = daysAgo(dayOffset, 14 + (slot % 3));
      const startedAt = daysAgo(dayOffset + cycleDays, 10 + (slot % 2));
      const createdAt = daysAgo(dayOffset + cycleDays + 2, 9);

      items.push({
        id: demoUuid(1000 + index),
        scopeId: LOCAL_DEMO_IDS.scopeId,
        jiraIssueId: String(5000 + index),
        issueKey,
        summary: `Completed story ${index}: ${COMPLETED_STORY_THEMES[(index - 1) % COMPLETED_STORY_THEMES.length]}`,
        issueTypeId: 'story',
        issueTypeName: 'Story',
        projectId: LOCAL_DEMO_PROJECT_ID,
        currentStatusId: 'done',
        currentColumn: 'Done',
        createdAt,
        startedAt,
        completedAt,
        reopenedCount: index % 17 === 0 ? 1 : 0,
        directUrl: issueUrl(issueKey),
        syncedAt: syncFinishedAt,
        lastSyncRunId: LOCAL_DEMO_IDS.syncRunId,
      });
    }
  }

  return items.slice(0, 84);
}

function buildActiveDemoItems(syncFinishedAt: Date) {
  return ACTIVE_ITEM_SPECS.map((spec, index) => ({
    id: demoUuid(2000 + index + 1),
    jiraIssueId: String(9000 + index + 1),
    issueKey: spec.issueKey,
    summary: spec.summary,
    issueTypeId: 'story',
    issueTypeName: 'Story',
    projectId: LOCAL_DEMO_PROJECT_ID,
    currentStatusId: spec.currentStatusId,
    currentColumn: spec.currentColumn,
    createdAt: daysAgo(spec.createdDaysAgo, 10),
    startedAt: daysAgo(spec.startedDaysAgo, 10),
    directUrl: issueUrl(spec.issueKey),
    syncedAt: syncFinishedAt,
    lastSyncRunId: LOCAL_DEMO_IDS.syncRunId,
    scope: {
      connect: { id: LOCAL_DEMO_IDS.scopeId },
    },
    lifecycleEvents: {
      create: spec.lifecycleEvents.map((event, eventIndex) => ({
        id: demoUuid(3000 + index * 20 + eventIndex + 1),
        rawChangelogId: `${spec.issueKey}-${eventIndex + 1}`,
        eventType: event.eventType,
        fromStatusId: event.fromStatusId,
        toStatusId: event.toStatusId,
        changedFieldId: event.changedFieldId,
        changedAt: daysAgo(event.daysAgo, event.hour ?? 11),
      })),
    },
    holdPeriods: {
      create: spec.holdPeriods.map((hold, holdIndex) => ({
        id: demoUuid(4000 + index * 10 + holdIndex + 1),
        startedAt: daysAgo(hold.startedDaysAgo, hold.startedHour ?? 11),
        endedAt: hold.endedDaysAgo == null ? null : daysAgo(hold.endedDaysAgo, hold.endedHour ?? 16),
        source: hold.source,
        sourceValue: hold.sourceValue,
      })),
    },
  }));
}

const COMPLETED_STORY_THEMES = [
  'Refine blocked-item highlighting',
  'Improve sync telemetry',
  'Tune Monte Carlo caching',
  'Clean up board drift warnings',
  'Polish flow analytics labels',
  'Harden throughput projections',
];

const ACTIVE_ITEM_SPECS = [
  {
    issueKey: 'AG-201',
    summary: 'Tune aging thresholds for the payment intake lane',
    currentStatusId: 'in-progress',
    currentColumn: 'In Progress',
    createdDaysAgo: 9,
    startedDaysAgo: 8,
    lifecycleEvents: [
      { eventType: 'status_change', fromStatusId: 'backlog', toStatusId: 'in-progress', daysAgo: 8 },
    ],
    holdPeriods: [],
  },
  {
    issueKey: 'AG-202',
    summary: 'Add forecast snapshot labeling in the scope header',
    currentStatusId: 'review',
    currentColumn: 'Review',
    createdDaysAgo: 12,
    startedDaysAgo: 10,
    lifecycleEvents: [
      { eventType: 'status_change', fromStatusId: 'backlog', toStatusId: 'in-progress', daysAgo: 10 },
      { eventType: 'status_change', fromStatusId: 'in-progress', toStatusId: 'review', daysAgo: 3 },
    ],
    holdPeriods: [],
  },
  {
    issueKey: 'AG-203',
    summary: 'Resolve blocked stories that lost their Jira column mapping',
    currentStatusId: 'blocked',
    currentColumn: 'Blocked',
    createdDaysAgo: 15,
    startedDaysAgo: 13,
    lifecycleEvents: [
      { eventType: 'status_change', fromStatusId: 'backlog', toStatusId: 'in-progress', daysAgo: 13 },
      { eventType: 'status_change', fromStatusId: 'in-progress', toStatusId: 'blocked', daysAgo: 5 },
    ],
    holdPeriods: [
      { source: 'status', sourceValue: 'blocked', startedDaysAgo: 5 },
    ],
  },
  {
    issueKey: 'AG-204',
    summary: 'Reduce stale connection warnings on the admin board',
    currentStatusId: 'in-progress',
    currentColumn: 'In Progress',
    createdDaysAgo: 18,
    startedDaysAgo: 16,
    lifecycleEvents: [
      { eventType: 'status_change', fromStatusId: 'backlog', toStatusId: 'in-progress', daysAgo: 16 },
      { eventType: 'status_change', fromStatusId: 'in-progress', toStatusId: 'blocked', daysAgo: 9 },
      { eventType: 'status_change', fromStatusId: 'blocked', toStatusId: 'in-progress', daysAgo: 6 },
    ],
    holdPeriods: [
      { source: 'status', sourceValue: 'blocked', startedDaysAgo: 9, endedDaysAgo: 6 },
    ],
  },
  {
    issueKey: 'AG-205',
    summary: 'Investigate why urgent work is aging faster than expected',
    currentStatusId: 'blocked',
    currentColumn: 'Blocked',
    createdDaysAgo: 23,
    startedDaysAgo: 20,
    lifecycleEvents: [
      { eventType: 'status_change', fromStatusId: 'backlog', toStatusId: 'in-progress', daysAgo: 20 },
      { eventType: 'status_change', fromStatusId: 'in-progress', toStatusId: 'blocked', daysAgo: 11 },
    ],
    holdPeriods: [
      { source: 'status', sourceValue: 'blocked', startedDaysAgo: 11 },
    ],
  },
] as const;