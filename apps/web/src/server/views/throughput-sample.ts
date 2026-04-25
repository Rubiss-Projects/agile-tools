import type { ThroughputDay } from '@agile-tools/shared/contracts/api';

export function getForecastSampleDays(days: ThroughputDay[]): ThroughputDay[] {
  return days.filter((day) => day.complete === true);
}

export function getCompletedStoryCount(
  days: ReadonlyArray<Pick<ThroughputDay, 'completedStoryCount'>>,
): number {
  return days.reduce((total, day) => total + day.completedStoryCount, 0);
}

export function getForecastSampleSize(days: ThroughputDay[]): number {
  return getCompletedStoryCount(getForecastSampleDays(days));
}
