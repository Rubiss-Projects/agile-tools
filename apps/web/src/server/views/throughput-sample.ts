import type { ThroughputDay } from '@agile-tools/shared/contracts/api';

export function getForecastSampleDays(days: ThroughputDay[]): ThroughputDay[] {
  return days.filter((day) => day.complete === true);
}

export function getForecastSampleSize(days: ThroughputDay[]): number {
  return getForecastSampleDays(days).reduce((total, day) => total + day.completedStoryCount, 0);
}
