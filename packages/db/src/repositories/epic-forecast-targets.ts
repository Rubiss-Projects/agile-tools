import type {
  EpicForecastTargetStatus,
  EpicStoryCountSource,
} from '@agile-tools/shared/contracts/epic-forecast';
import type { PrismaClient } from '@prisma/client';

export interface EpicForecastTargetRow {
  id: string;
  scopeId: string;
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
      storyCountSource: input.storyCountSource ?? 'manual',
      epicLinkStoryCount: input.epicLinkStoryCount ?? null,
      jiraStoryCount: input.jiraStoryCount ?? null,
      manualStoryCount: input.manualStoryCount ?? input.remainingStoryCount,
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
  return db.epicForecastTarget.findUnique({
    where: { id: targetId },
  }) as Promise<EpicForecastTargetRow>;
}

export async function refreshEpicLinkForecastTargetCounts(
  db: PrismaClient,
  scopeId: string,
  countsByIssueKey: Map<string, number>,
): Promise<number> {
  let updatedCount = 0;
  for (const [jiraIssueKey, remainingStoryCount] of countsByIssueKey) {
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
        ...(remainingStoryCount === 0
          ? { status: 'closed', closedAt: new Date() }
          : { closedAt: null }),
      },
    });
    updatedCount += updated.count;
  }
  return updatedCount;
}
