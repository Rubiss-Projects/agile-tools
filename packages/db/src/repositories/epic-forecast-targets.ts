import type {
  EpicForecastTargetStatus,
  EpicStoryCountSource,
} from '@agile-tools/shared/contracts/epic-forecast';
import type { PrismaClient } from '@prisma/client';
import { differenceInWorkingDays } from '@agile-tools/shared';

export interface EpicForecastTargetRow {
  id: string;
  scopeId: string;
  jiraIssueKey: string;
  summary: string;
  dueDate: string;
  remainingStoryCount: number;
  storyCountSource: EpicStoryCountSource;
  epicLinkStoryCount: number | null;
  epicLinkIssueKeys: string[];
  jiraStoryCount: number | null;
  manualStoryCount: number | null;
  status: EpicForecastTargetStatus;
  closedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertEpicForecastTargetInput {
  scopeId: string;
  jiraIssueKey: string;
  summary: string;
  dueDate: string;
  remainingStoryCount: number;
  storyCountSource?: EpicStoryCountSource;
  epicLinkStoryCount?: number | null;
  jiraStoryCount?: number | null;
  manualStoryCount?: number | null;
  status?: EpicForecastTargetStatus;
  closedAt?: Date | null;
  sortOrder?: number;
}

export interface UpdateEpicForecastTargetInput {
  jiraIssueKey: string;
  summary: string;
  dueDate: string;
  remainingStoryCount: number;
  storyCountSource: EpicStoryCountSource;
  epicLinkStoryCount: number | null;
  jiraStoryCount: number | null;
  manualStoryCount: number | null;
  status: EpicForecastTargetStatus;
  closedAt: Date | null;
  sortOrder: number;
}

export interface EpicLinkForecastTargetSnapshot {
  remainingStoryCount: number;
  issueKeys: string[];
}

export interface EpicForecastChildProgressInput {
  jiraIssueKey: string;
  epicLinkIssueKeys?: string[];
}

export interface EpicForecastChildProgressRow {
  epicIssueKey: string;
  issueKey: string;
  ageInDays: number;
  startedAt: Date;
}

function resolveManualStoryCount(
  storyCountSource: EpicStoryCountSource,
  manualStoryCount: number | null | undefined,
  remainingStoryCount: number,
): number | null {
  if (storyCountSource !== 'manual') {
    return null;
  }
  return manualStoryCount ?? remainingStoryCount;
}

export async function listEpicForecastTargets(
  db: PrismaClient,
  scopeId: string,
): Promise<EpicForecastTargetRow[]> {
  return db.epicForecastTarget.findMany({
    where: { scopeId },
    orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { dueDate: 'asc' }, { jiraIssueKey: 'asc' }],
  }) as Promise<EpicForecastTargetRow[]>;
}

export async function upsertEpicForecastTarget(
  db: PrismaClient,
  input: UpsertEpicForecastTargetInput,
): Promise<EpicForecastTargetRow> {
  const storyCountSource = input.storyCountSource ?? 'manual';
  return db.epicForecastTarget.upsert({
    where: {
      scopeId_jiraIssueKey: {
        scopeId: input.scopeId,
        jiraIssueKey: input.jiraIssueKey,
      },
    },
    create: {
      scopeId: input.scopeId,
      jiraIssueKey: input.jiraIssueKey,
      summary: input.summary,
      dueDate: input.dueDate,
      remainingStoryCount: input.remainingStoryCount,
      storyCountSource,
      epicLinkStoryCount: input.epicLinkStoryCount ?? null,
      jiraStoryCount: input.jiraStoryCount ?? null,
      manualStoryCount: resolveManualStoryCount(
        storyCountSource,
        input.manualStoryCount,
        input.remainingStoryCount,
      ),
      status: input.status ?? 'active',
      closedAt: input.closedAt ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
    update: {
      summary: input.summary,
      dueDate: input.dueDate,
      remainingStoryCount: input.remainingStoryCount,
      ...(input.storyCountSource !== undefined ? { storyCountSource: input.storyCountSource } : {}),
      ...(input.epicLinkStoryCount !== undefined ? { epicLinkStoryCount: input.epicLinkStoryCount } : {}),
      ...(input.jiraStoryCount !== undefined ? { jiraStoryCount: input.jiraStoryCount } : {}),
      ...(input.manualStoryCount !== undefined ? { manualStoryCount: input.manualStoryCount } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.closedAt !== undefined ? { closedAt: input.closedAt } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  }) as Promise<EpicForecastTargetRow>;
}

export async function deleteEpicForecastTarget(
  db: PrismaClient,
  scopeId: string,
  targetId: string,
): Promise<boolean> {
  const deleted = await db.epicForecastTarget.deleteMany({
    where: { id: targetId, scopeId },
  });
  return deleted.count > 0;
}

export async function updateEpicForecastTargetById(
  db: PrismaClient,
  scopeId: string,
  targetId: string,
  input: UpdateEpicForecastTargetInput,
): Promise<EpicForecastTargetRow | null> {
  const updated = await db.epicForecastTarget.updateMany({
    where: { id: targetId, scopeId },
    data: input,
  });
  if (updated.count === 0) {
    return null;
  }
  return db.epicForecastTarget.findFirst({
    where: { id: targetId, scopeId },
  }) as Promise<EpicForecastTargetRow | null>;
}

export async function refreshEpicLinkForecastTargetCounts(
  db: PrismaClient,
  scopeId: string,
  snapshotsByIssueKey: Map<string, EpicLinkForecastTargetSnapshot>,
): Promise<number> {
  let updatedCount = 0;
  for (const [jiraIssueKey, snapshot] of snapshotsByIssueKey) {
    const remainingStoryCount = snapshot.remainingStoryCount;
    const updated = await db.epicForecastTarget.updateMany({
      where: {
        scopeId,
        jiraIssueKey,
        storyCountSource: 'epic_link',
        status: 'active',
      },
      data: {
        remainingStoryCount,
        epicLinkStoryCount: remainingStoryCount,
        epicLinkIssueKeys: snapshot.issueKeys,
        ...(remainingStoryCount === 0
          ? { status: 'closed', closedAt: new Date() }
          : { closedAt: null }),
      },
    });
    updatedCount += updated.count;
  }
  return updatedCount;
}

export async function queryEpicForecastChildProgress(
  db: PrismaClient,
  scopeId: string,
  targets: EpicForecastChildProgressInput[],
  options?: {
    dataVersion?: string;
    timezone?: string;
    now?: Date;
  },
): Promise<Map<string, EpicForecastChildProgressRow[]>> {
  const issueKeyToEpicKeys = new Map<string, Set<string>>();
  for (const target of targets) {
    for (const issueKey of target.epicLinkIssueKeys ?? []) {
      const normalizedIssueKey = issueKey.toUpperCase();
      const epicKeys = issueKeyToEpicKeys.get(normalizedIssueKey) ?? new Set<string>();
      epicKeys.add(target.jiraIssueKey);
      issueKeyToEpicKeys.set(normalizedIssueKey, epicKeys);
    }
  }

  if (issueKeyToEpicKeys.size === 0) {
    return new Map();
  }

  const now = options?.now ?? new Date();
  const timezone = options?.timezone ?? 'UTC';
  const items = await db.workItem.findMany({
    where: {
      scopeId,
      issueKey: { in: Array.from(issueKeyToEpicKeys.keys()) },
      completedAt: null,
      startedAt: { not: null },
      excludedReason: null,
      ...(options?.dataVersion ? { lastSyncRunId: options.dataVersion } : {}),
    },
    select: {
      issueKey: true,
      startedAt: true,
      createdAt: true,
    },
  });

  const progressByEpicKey = new Map<string, EpicForecastChildProgressRow[]>();
  for (const item of items) {
    const issueKey = item.issueKey.toUpperCase();
    const epicKeys = issueKeyToEpicKeys.get(issueKey);
    const startedAt = item.startedAt ?? item.createdAt;
    if (!epicKeys || !item.startedAt) {
      continue;
    }

    const ageInDays = Math.max(0, differenceInWorkingDays(startedAt, now, timezone));
    for (const epicIssueKey of epicKeys) {
      const rows = progressByEpicKey.get(epicIssueKey) ?? [];
      rows.push({
        epicIssueKey,
        issueKey: item.issueKey,
        ageInDays,
        startedAt: item.startedAt,
      });
      progressByEpicKey.set(epicIssueKey, rows);
    }
  }

  return progressByEpicKey;
}
