import type { PrismaClient } from '@prisma/client';

import { normalizeTimeZoneOrThrow } from '@agile-tools/shared';

export const DEFAULT_COMPLETED_WINDOW_DAYS = 90;
export const DEFAULT_THROUGHPUT_WINDOW_DAYS = 90;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── Completed stories ───────────────────────────────────────────────────────

export interface CompletedStoryRow {
  workItemId: string;
  issueKey: string;
  completedAt: Date;
  /** Cycle time in fractional days from startedAt (or createdAt) to completedAt. */
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
  options?: { windowDays?: number; dataVersion?: string },
): Promise<CompletedStoryRow[]> {
  const windowDays = options?.windowDays ?? DEFAULT_COMPLETED_WINDOW_DAYS;
  const windowStart = new Date(Date.now() - windowDays * MS_PER_DAY);

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
    const cycleTimeDays = Math.max(
      0,
      (item.completedAt!.getTime() - referenceDate.getTime()) / MS_PER_DAY,
    );

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
  /** Calendar date in the scope's timezone, formatted as YYYY-MM-DD. */
  day: string;
  completedStoryCount: number;
  /** True when this day is fully in the past (not the current calendar day). */
  complete: boolean;
}

function formatDateInValidatedTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date as YYYY-MM-DD in a given IANA timezone.
 * Uses Intl.DateTimeFormat with 'en-CA' locale which produces YYYY-MM-DD natively.
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  return formatDateInValidatedTimezone(date, normalizeTimeZoneOrThrow(timezone));
}

/**
 * Build a daily throughput projection for a scope within a historical window.
 *
 * Returns one row per calendar day in the window — including days with zero
 * completions. Zero-completion days must be represented so that Monte Carlo
 * simulations sample realistic "dry day" frequency and avoid over-optimistic
 * forecasts.
 *
 * The `complete` flag distinguishes fully-past days from the current calendar
 * day (today), which is still in progress. Throughput charts may style the
 * current day differently; the Monte Carlo engine should only sample from
 * complete days.
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
  const normalizedTimezone = normalizeTimeZoneOrThrow(timezone);

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

  // Bucket completions by timezone-local calendar day
  const countsByDay = new Map<string, number>();
  for (const item of completedItems) {
    const day = formatDateInValidatedTimezone(item.completedAt!, normalizedTimezone);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }

  const todayLocal = formatDateInValidatedTimezone(now, normalizedTimezone);

  // Generate one entry per calendar day from windowStart → today (inclusive).
  // Walk forward 24 h at a time and deduplicate formatted dates to handle DST
  // transitions (where a 24 h step might land on the same or a skipped calendar day).
  const days: string[] = [];
  for (let i = windowDays; i >= 0; i--) {
    const d = new Date(now.getTime() - i * MS_PER_DAY);
    const day = formatDateInValidatedTimezone(d, normalizedTimezone);
    if (days.length === 0 || days[days.length - 1] !== day) {
      days.push(day);
    }
  }

  // Ensure today is always the last entry
  if (days.length === 0 || days[days.length - 1] !== todayLocal) {
    days.push(todayLocal);
  }

  return days.map((day) => ({
    day,
    completedStoryCount: countsByDay.get(day) ?? 0,
    complete: day < todayLocal,
  }));
}
