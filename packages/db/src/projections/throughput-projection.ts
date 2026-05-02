import type { PrismaClient } from '@prisma/client';

import {
  bucketToPreviousWorkingDay,
  differenceInWorkingDays,
  formatDateInTimezone as sharedFormatDateInTimezone,
  isWeekendDate,
} from '@agile-tools/shared';

export const DEFAULT_COMPLETED_WINDOW_DAYS = 90;
export const DEFAULT_THROUGHPUT_WINDOW_DAYS = 90;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── Completed stories ───────────────────────────────────────────────────────

export interface CompletedStoryRow {
  workItemId: string;
  issueKey: string;
  completedAt: Date;
  /** Cycle time in fractional working days from startedAt (or createdAt) to completedAt. */
  cycleTimeDays: number;
  /** Total on-hold duration in fractional days derived from HoldPeriod records. */
  holdTimeDays: number;
  reopenedCount: number;
}

/**
 * Query completed, non-excluded work items for a scope within a historical window.
 *
 * Returns one row per completed story with computed cycle-time and hold-time
 * metrics. This projection is used by:
 *  - The throughput API to build daily throughput charts.
 *  - The Monte Carlo engine as the source dataset for forecast sampling.
 *
 * Pass `dataVersion` (= a syncRunId) to pin results to a specific sync snapshot.
 */
export async function queryCompletedStories(
  db: PrismaClient,
  scopeId: string,
  options?: { windowDays?: number; dataVersion?: string; timezone?: string },
): Promise<CompletedStoryRow[]> {
  const windowDays = options?.windowDays ?? DEFAULT_COMPLETED_WINDOW_DAYS;
  const windowStart = new Date(Date.now() - windowDays * MS_PER_DAY);
  const timezone = options?.timezone ?? 'UTC';

  const items = await db.workItem.findMany({
    where: {
      scopeId,
      completedAt: { not: null, gte: windowStart },
      excludedReason: null,
      ...(options?.dataVersion ? { lastSyncRunId: options.dataVersion } : {}),
    },
    include: { holdPeriods: true },
    orderBy: { completedAt: 'asc' },
  });

  return items.map((item) => {
    const referenceDate = item.startedAt ?? item.createdAt;
    const cycleTimeDays = differenceInWorkingDays(referenceDate, item.completedAt!, timezone);

    let totalHoldMs = 0;
    for (const hp of item.holdPeriods) {
      const end = hp.endedAt ?? item.completedAt!;
      totalHoldMs += Math.max(0, end.getTime() - hp.startedAt.getTime());
    }
    const holdTimeDays = totalHoldMs / MS_PER_DAY;

    return {
      workItemId: item.id,
      issueKey: item.issueKey,
      completedAt: item.completedAt!,
      cycleTimeDays,
      holdTimeDays,
      reopenedCount: item.reopenedCount,
    };
  });
}

// ─── Daily throughput ────────────────────────────────────────────────────────

export interface DailyThroughputRow {
  /** Working-day date in the scope's timezone, formatted as YYYY-MM-DD. */
  day: string;
  completedStoryCount: number;
  /** True when this working day is fully in the past (not the current local weekday). */
  complete: boolean;
}

export const formatDateInTimezone = sharedFormatDateInTimezone;

/**
 * Build a daily throughput projection for a scope within a historical window.
 *
 * Returns one row per working day in the window — including working days with
 * zero completions. Zero-completion weekdays must be represented so that Monte
 * Carlo simulations sample realistic "dry day" frequency. Weekend completions
 * are re-bucketed onto the previous working day so weekend work still counts
 * toward throughput and forecast sampling.
 *
 * The `complete` flag distinguishes fully-past working days from the current
 * working-day bucket, which remains in progress. On weekends, the current
 * working-day bucket is the prior Friday because weekend completions rebucket
 * there. The Monte Carlo engine should only sample from complete working days.
 *
 * Pass `dataVersion` to pin to a specific sync snapshot.
 */
export async function queryDailyThroughput(
  db: PrismaClient,
  scopeId: string,
  timezone: string,
  options?: { windowDays?: number; dataVersion?: string },
): Promise<DailyThroughputRow[]> {
  const windowDays = options?.windowDays ?? DEFAULT_THROUGHPUT_WINDOW_DAYS;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

  const completedItems = await db.workItem.findMany({
    where: {
      scopeId,
      completedAt: { not: null, gte: windowStart },
      excludedReason: null,
      ...(options?.dataVersion ? { lastSyncRunId: options.dataVersion } : {}),
    },
    select: { completedAt: true },
    orderBy: { completedAt: 'asc' },
  });

  // Bucket completions by timezone-local working day, rolling weekend
  // completions back onto the prior Friday so weekend work contributes to
  // working-day throughput without creating weekend buckets.
  const countsByDay = new Map<string, number>();
  for (const item of completedItems) {
    const day = bucketToPreviousWorkingDay(sharedFormatDateInTimezone(item.completedAt!, timezone));
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }

  const todayLocal = sharedFormatDateInTimezone(now, timezone);
  const currentWorkingDay = bucketToPreviousWorkingDay(todayLocal);

  // Generate one entry per working day from windowStart → today (inclusive).
  // Walk forward 24 h at a time and deduplicate formatted dates to handle DST
  // transitions (where a 24 h step might land on the same or a skipped local date).
  const days: string[] = [];
  for (let i = windowDays; i >= 0; i--) {
    const d = new Date(now.getTime() - i * MS_PER_DAY);
    const day = sharedFormatDateInTimezone(d, timezone);
    if (!isWeekendDate(day) && (days.length === 0 || days[days.length - 1] !== day)) {
      days.push(day);
    }
  }

  const earliestBucketDay = Array.from(countsByDay.keys()).sort()[0];
  if (earliestBucketDay && (days.length === 0 || earliestBucketDay < days[0]!)) {
    days.unshift(earliestBucketDay);
  }

  // Ensure the current working-day bucket is always the last entry. On
  // weekends, that bucket is the prior Friday because weekend completions roll
  // back there.
  if (days.length === 0 || days[days.length - 1] !== currentWorkingDay) {
    days.push(currentWorkingDay);
  }

  return days.map((day) => ({
    day,
    completedStoryCount: countsByDay.get(day) ?? 0,
    complete: day < currentWorkingDay,
  }));
}
