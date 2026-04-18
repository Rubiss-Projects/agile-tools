import type { PrismaClient } from '@prisma/client';

export interface CurrentWorkItemRow {
  workItemId: string;
  scopeId: string;
  issueKey: string;
  summary: string;
  issueTypeId: string;
  /** Human-readable issue type name; falls back to issueTypeId when not available. */
  issueTypeName: string;
  currentStatusId: string;
  /** Board column name; falls back to currentStatusId when the status has no column mapping. */
  currentColumn: string;
  /** Cycle time in fractional days from startedAt (or createdAt if not yet started). */
  ageInDays: number;
  startedAt: Date | null;
  /** Total hold duration in hours derived from HoldPeriod records. */
  totalHoldHours: number;
  /** True when the item has an open HoldPeriod (endedAt IS NULL). */
  onHoldNow: boolean;
  /**
   * Aging zone classification.
   * Defaults to 'normal' until AgingThresholdModel is computed (US2).
   */
  agingZone: 'normal' | 'watch' | 'aging';
  directUrl: string;
}

export interface ScopeFilterOptions {
  /** Distinct issue types present in the latest-synced active work items. */
  issueTypes: Array<{ id: string; name: string }>;
  /**
   * Distinct statuses present in the latest-synced active work items.
   * id = Jira status ID (for server-side filtering);
   * name = board column name for display (falls back to status ID).
   */
  statuses: Array<{ id: string; name: string }>;
}

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

/**
 * Query active (non-completed, non-excluded) work items for a scope with
 * computed projection fields.
 *
 * Pass `dataVersion` (= the latest succeeded SyncRun id) to pin results to a
 * specific sync snapshot and exclude stale items that disappeared from the board.
 */
export async function queryCurrentWorkItems(
  db: PrismaClient,
  scopeId: string,
  options?: { dataVersion?: string },
): Promise<CurrentWorkItemRow[]> {
  const now = new Date();

  const items = await db.workItem.findMany({
    where: {
      scopeId,
      completedAt: null,
      excludedReason: null,
      ...(options?.dataVersion ? { lastSyncRunId: options.dataVersion } : {}),
    },
    include: { holdPeriods: true },
    orderBy: { startedAt: 'asc' },
  });

  return items.map((item) => {
    const referenceDate = item.startedAt ?? item.createdAt;
    const ageInDays = (now.getTime() - referenceDate.getTime()) / MS_PER_DAY;

    let totalHoldMs = 0;
    let onHoldNow = false;

    for (const hp of item.holdPeriods) {
      const end = hp.endedAt ?? now;
      totalHoldMs += end.getTime() - hp.startedAt.getTime();
      if (!hp.endedAt) {
        onHoldNow = true;
      }
    }

    const totalHoldHours = totalHoldMs / MS_PER_HOUR;

    return {
      workItemId: item.id,
      scopeId: item.scopeId,
      issueKey: item.issueKey,
      summary: item.summary,
      issueTypeId: item.issueTypeId,
      issueTypeName: item.issueTypeName ?? item.issueTypeId,
      currentStatusId: item.currentStatusId,
      currentColumn: item.currentColumn ?? item.currentStatusId,
      ageInDays,
      startedAt: item.startedAt,
      totalHoldHours,
      onHoldNow,
      agingZone: 'normal' as const,
      directUrl: item.directUrl,
    };
  });
}

/**
 * Derive distinct filter options from current active work items for a scope.
 *
 * Pass `dataVersion` to pin to a specific sync snapshot (same semantics as
 * `queryCurrentWorkItems`).
 */
export async function queryScopeFilterOptions(
  db: PrismaClient,
  scopeId: string,
  options?: { dataVersion?: string },
): Promise<ScopeFilterOptions> {
  const items = await db.workItem.findMany({
    where: {
      scopeId,
      completedAt: null,
      excludedReason: null,
      ...(options?.dataVersion ? { lastSyncRunId: options.dataVersion } : {}),
    },
    select: {
      issueTypeId: true,
      issueTypeName: true,
      currentStatusId: true,
      currentColumn: true,
    },
  });

  const issueTypeMap = new Map<string, string>();
  const statusMap = new Map<string, string>();

  for (const item of items) {
    if (!issueTypeMap.has(item.issueTypeId)) {
      issueTypeMap.set(item.issueTypeId, item.issueTypeName ?? item.issueTypeId);
    }
    if (!statusMap.has(item.currentStatusId)) {
      statusMap.set(item.currentStatusId, item.currentColumn ?? item.currentStatusId);
    }
  }

  return {
    issueTypes: Array.from(issueTypeMap.entries()).map(([id, name]) => ({ id, name })),
    statuses: Array.from(statusMap.entries()).map(([id, name]) => ({ id, name })),
  };
}
