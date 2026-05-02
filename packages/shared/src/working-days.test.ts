import { describe, expect, it } from 'vitest';

import {
  addWorkingDaysToDate,
  bucketToPreviousWorkingDay,
  countWorkingDaysBetweenDates,
  differenceInWorkingDays,
  formatDateInTimezone,
} from './working-days.js';

describe('working-day helpers', () => {
  it('formats dates in the requested timezone', () => {
    expect(formatDateInTimezone(new Date('2025-01-11T02:00:00Z'), 'America/Los_Angeles')).toBe(
      '2025-01-10',
    );
  });

  it('counts working days between local dates with weekend exclusion', () => {
    expect(countWorkingDaysBetweenDates('2025-01-10', '2025-01-13')).toBe(1);
    expect(countWorkingDaysBetweenDates('2025-01-13', '2025-01-17')).toBe(4);
    expect(countWorkingDaysBetweenDates('2025-01-01', '2025-12-31')).toBe(260);
  });

  it('advances forecast dates by working days only', () => {
    expect(addWorkingDaysToDate(new Date('2025-01-10T12:00:00Z'), 1, 'UTC')).toBe('2025-01-13');
    expect(addWorkingDaysToDate(new Date('2025-01-10T12:00:00Z'), 5, 'UTC')).toBe('2025-01-17');
    expect(addWorkingDaysToDate(new Date('2025-01-11T12:00:00Z'), 5, 'UTC')).toBe('2025-01-17');
  });

  it('re-buckets weekend dates onto the previous working day', () => {
    expect(bucketToPreviousWorkingDay('2025-01-10')).toBe('2025-01-10');
    expect(bucketToPreviousWorkingDay('2025-01-11')).toBe('2025-01-10');
    expect(bucketToPreviousWorkingDay('2025-01-12')).toBe('2025-01-10');
  });

  it('excludes weekend portions from fractional working-day differences', () => {
    expect(
      differenceInWorkingDays(
        new Date('2025-01-10T12:00:00Z'),
        new Date('2025-01-13T12:00:00Z'),
        'UTC',
      ),
    ).toBeCloseTo(1, 5);
  });

  it('uses the scope timezone to decide when a weekend starts', () => {
    expect(
      differenceInWorkingDays(
        new Date('2025-01-11T02:00:00Z'),
        new Date('2025-01-11T10:00:00Z'),
        'America/Los_Angeles',
      ),
    ).toBeCloseTo(0.25, 5);
  });
});
