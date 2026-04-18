/** Minimum completed-story sample size before aging thresholds are considered reliable. */
export const AGING_CONFIDENCE_THRESHOLD = 30;

export interface CompletedStory {
  /** Cycle time in fractional days from startedAt (or createdAt) to completedAt. */
  cycleTimeDays: number;
}

export interface AgingThresholdResult {
  sampleSize: number;
  p50: number;
  p70: number;
  p85: number;
  lowConfidenceReason: string | null;
}

/**
 * Compute percentile-based aging thresholds from a sample of recently completed stories.
 *
 * Returns p50, p70, and p85 cycle-time thresholds in fractional days.
 * Emits `lowConfidenceReason` when the sample size falls below the configured threshold.
 *
 * Percentiles are computed with the nearest-rank method (0-indexed, rounded down).
 */
export function buildAgingThresholdModel(
  completedStories: CompletedStory[],
  historicalWindowDays: number,
): AgingThresholdResult {
  const cycleTimes = completedStories
    .map((s) => s.cycleTimeDays)
    .filter((v) => v >= 0)
    .sort((a, b) => a - b);

  const sampleSize = cycleTimes.length;

  let lowConfidenceReason: string | null = null;

  if (sampleSize === 0) {
    lowConfidenceReason = `No completed stories in the ${historicalWindowDays}-day window.`;
    return { sampleSize: 0, p50: 0, p70: 0, p85: 0, lowConfidenceReason };
  }

  if (sampleSize < AGING_CONFIDENCE_THRESHOLD) {
    lowConfidenceReason =
      `Only ${sampleSize} completed ${sampleSize === 1 ? 'story' : 'stories'} in the ` +
      `${historicalWindowDays}-day window (${AGING_CONFIDENCE_THRESHOLD} required for reliable thresholds).`;
  }

  return {
    sampleSize,
    p50: percentile(cycleTimes, 50),
    p70: percentile(cycleTimes, 70),
    p85: percentile(cycleTimes, 85),
    lowConfidenceReason,
  };
}

/**
 * Classify a work item's age against pre-computed thresholds.
 *
 * Returns:
 * - 'normal' when ageDays <= p50
 * - 'watch'  when p50 < ageDays <= p85
 * - 'aging'  when ageDays > p85
 *
 * Falls back to 'normal' when all thresholds are zero (no data).
 */
export function classifyAgingZone(
  ageDays: number,
  thresholds: Pick<AgingThresholdResult, 'p50' | 'p85'>,
): 'normal' | 'watch' | 'aging' {
  if (thresholds.p85 <= 0 && thresholds.p50 <= 0) return 'normal';
  if (ageDays > thresholds.p85) return 'aging';
  if (ageDays > thresholds.p50) return 'watch';
  return 'normal';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Nearest-rank percentile (0-indexed, round down).
 * Input array must be sorted ascending.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.floor((p / 100) * sorted.length);
  const clamped = Math.min(index, sorted.length - 1);
  return sorted[clamped]!;
}
