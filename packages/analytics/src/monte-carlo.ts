import type { ForecastResult } from '@agile-tools/shared/contracts/forecast';

/**
 * Minimum number of completed stories in the historical window before a Monte
 * Carlo forecast is considered reliable. Below this threshold the engine still
 * runs but attaches a LOW_SAMPLE_SIZE warning to every response.
 * (Research Decision 7: degraded-visible below 60 completed stories)
 */
export const FORECAST_MIN_SAMPLE_SIZE = 60;

export const DEFAULT_MONTE_CARLO_ITERATIONS = 10_000;

export interface ForecastWarning {
  code: string;
  message: string;
}

export interface MonteCarloForecastResult {
  results: ForecastResult[];
  warnings: ForecastWarning[];
}

// ─── "When" forecast ──────────────────────────────────────────────────────────

export interface WhenForecastInput {
  /**
   * Historical per-day story completion counts, including days with 0 completions.
   * Must cover the entire requested historical window to represent realistic "dry days".
   */
  historicalDailyThroughput: number[];
  /** Number of completed stories used to build the throughput sample (for warning thresholds). */
  sampleSize: number;
  /** Number of remaining stories to complete. */
  remainingStoryCount: number;
  /** Confidence percentiles to compute (e.g. [50, 70, 85, 95]). */
  confidenceLevels: number[];
  /** Reference date for converting simulation day-offsets to calendar dates. Defaults to today. */
  referenceDate?: Date;
  /** Number of Monte Carlo trials. Defaults to DEFAULT_MONTE_CARLO_ITERATIONS. */
  iterations?: number;
}

/**
 * Run a "when will N stories be done?" Monte Carlo simulation.
 *
 * For each trial the engine samples daily throughput values (with replacement)
 * until the cumulative count reaches `remainingStoryCount`, recording the
 * number of days required. The p-th percentile of "days needed" across all
 * trials is then converted to a calendar date for each requested confidence level.
 *
 * Higher confidence level → longer (more conservative) completion date.
 */
export function runWhenForecast(input: WhenForecastInput): MonteCarloForecastResult {
  const {
    historicalDailyThroughput,
    sampleSize,
    remainingStoryCount,
    confidenceLevels,
    iterations = DEFAULT_MONTE_CARLO_ITERATIONS,
    referenceDate = new Date(),
  } = input;

  const warnings = buildWarnings(historicalDailyThroughput, sampleSize);
  const hasPositiveThroughput = historicalDailyThroughput.some((v) => v > 0);

  if (!hasPositiveThroughput) {
    return { results: confidenceLevels.map((cl) => ({ confidenceLevel: cl })), warnings };
  }

  const completionDays: number[] = [];

  // Safety cap: prevent infinite loops when daily throughput is very low
  const maxDays = Math.max(remainingStoryCount * 365, 3650);

  for (let i = 0; i < iterations; i++) {
    let accumulated = 0;
    let days = 0;
    while (accumulated < remainingStoryCount && days < maxDays) {
      accumulated += sampleDay(historicalDailyThroughput);
      days++;
    }
    completionDays.push(days);
  }

  completionDays.sort((a, b) => a - b);

  const results: ForecastResult[] = confidenceLevels.map((cl) => {
    const daysNeeded = nearestRankPercentile(completionDays, cl);
    const completionDate = new Date(referenceDate);
    completionDate.setDate(completionDate.getDate() + daysNeeded);
    return {
      confidenceLevel: cl,
      completionDate: completionDate.toISOString().slice(0, 10),
    };
  });

  return { results, warnings };
}

// ─── "How many" forecast ──────────────────────────────────────────────────────

export interface HowManyForecastInput {
  /** Historical per-day story completion counts, including 0-completion days. */
  historicalDailyThroughput: number[];
  /** Number of completed stories used to build the throughput sample. */
  sampleSize: number;
  /** Calendar days from today to the target date (inclusive). */
  targetDays: number;
  /** Confidence percentiles to compute. */
  confidenceLevels: number[];
  /** Number of Monte Carlo trials. Defaults to DEFAULT_MONTE_CARLO_ITERATIONS. */
  iterations?: number;
}

/**
 * Run a "how many stories by a target date?" Monte Carlo simulation.
 *
 * For each trial the engine sums `targetDays` sampled daily throughput values
 * (with replacement). The (100-p)-th percentile of "stories completed" across
 * all trials is returned for each confidence level p, meaning:
 *   at p% confidence, at least X stories will be completed by the target date.
 *
 * Higher confidence level → fewer (more conservative) story count.
 */
export function runHowManyForecast(input: HowManyForecastInput): MonteCarloForecastResult {
  const {
    historicalDailyThroughput,
    sampleSize,
    targetDays,
    confidenceLevels,
    iterations = DEFAULT_MONTE_CARLO_ITERATIONS,
  } = input;

  const warnings = buildWarnings(historicalDailyThroughput, sampleSize);
  const hasPositiveThroughput = historicalDailyThroughput.some((v) => v > 0);

  if (!hasPositiveThroughput) {
    return { results: confidenceLevels.map((cl) => ({ confidenceLevel: cl })), warnings };
  }

  const storyCounts: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let d = 0; d < targetDays; d++) {
      total += sampleDay(historicalDailyThroughput);
    }
    storyCounts.push(total);
  }

  storyCounts.sort((a, b) => a - b);

  // At confidence p: at least X stories → X = (100-p)-th percentile of storyCounts
  const results: ForecastResult[] = confidenceLevels.map((cl) => ({
    confidenceLevel: cl,
    completedStoryCount: nearestRankPercentile(storyCounts, 100 - cl),
  }));

  return { results, warnings };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sampleDay(days: number[]): number {
  return days[Math.floor(Math.random() * days.length)]!;
}

/**
 * Nearest-rank percentile (0-indexed, clamped).
 * Input array must be sorted ascending.
 */
function nearestRankPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)]!;
}

function buildWarnings(
  historicalDailyThroughput: number[],
  sampleSize: number,
): ForecastWarning[] {
  const warnings: ForecastWarning[] = [];

  if (sampleSize < FORECAST_MIN_SAMPLE_SIZE) {
    warnings.push({
      code: 'LOW_SAMPLE_SIZE',
      message:
        `Only ${sampleSize} completed ${sampleSize === 1 ? 'story' : 'stories'} in the ` +
        `historical window. At least ${FORECAST_MIN_SAMPLE_SIZE} are recommended for ` +
        `reliable forecasts.`,
    });
  }

  if (!historicalDailyThroughput.some((v) => v > 0)) {
    warnings.push({
      code: 'NO_THROUGHPUT_HISTORY',
      message: 'No completed stories in the historical window. Forecast is not available.',
    });
  }

  return warnings;
}
