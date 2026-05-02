import { normalizeTimeZoneOrThrow } from './timezones.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const normalizedTimezoneCache = new Map<string, string>();

function getNormalizedTimezone(timezone: string): string {
  const trimmed = timezone.trim();
  let normalized = normalizedTimezoneCache.get(trimmed);
  if (!normalized) {
    normalized = normalizeTimeZoneOrThrow(trimmed);
    normalizedTimezoneCache.set(trimmed, normalized);
    normalizedTimezoneCache.set(normalized, normalized);
  }
  return normalized;
}

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getDateTimeFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    dateTimeFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(day: string): { year: number; month: number; date: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new RangeError(`Invalid local date: ${day}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, date));
  if (formatUtcDate(candidate) !== day) {
    throw new RangeError(`Invalid local date: ${day}`);
  }

  return { year, month, date };
}

function addCalendarDays(day: string, delta: number): string {
  const { year, month, date } = parseLocalDate(day);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, date + delta)));
}

function getUtcWeekDay(day: string): number {
  const { year, month, date } = parseLocalDate(day);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

function differenceInCalendarDays(startDay: string, endDay: string): number {
  const { year: startYear, month: startMonth, date: startDate } = parseLocalDate(startDay);
  const { year: endYear, month: endMonth, date: endDate } = parseLocalDate(endDay);
  const startMs = Date.UTC(startYear, startMonth - 1, startDate);
  const endMs = Date.UTC(endYear, endMonth - 1, endDate);
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

function countWorkingDaysInClosedRange(startDay: string, endDay: string): number {
  if (endDay < startDay) {
    return 0;
  }

  const totalDays = differenceInCalendarDays(startDay, endDay) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;

  let count = fullWeeks * 5;
  let weekDay = getUtcWeekDay(startDay);

  for (let i = 0; i < remainder; i++) {
    if (weekDay !== 0 && weekDay !== 6) {
      count += 1;
    }
    weekDay = (weekDay + 1) % 7;
  }

  return count;
}

function getLocalDay(date: Date, timezone: string): string {
  const parts = getDateFormatter(timezone).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new RangeError(`Could not format date for timezone ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}

function getLocalDayFraction(date: Date, timezone: string): { day: string; fraction: number } {
  const parts = getDateTimeFormatter(timezone).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const second = parts.find((part) => part.type === 'second')?.value;

  if (!year || !month || !day || !hour || !minute || !second) {
    throw new RangeError(`Could not format date-time for timezone ${timezone}`);
  }

  const timeOfDayMs =
    Number(hour) * 60 * 60 * 1000 +
    Number(minute) * 60 * 1000 +
    Number(second) * 1000 +
    date.getUTCMilliseconds();

  return {
    day: `${year}-${month}-${day}`,
    fraction: timeOfDayMs / MS_PER_DAY,
  };
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  return getLocalDay(date, getNormalizedTimezone(timezone));
}

export function isWeekendDate(day: string): boolean {
  const weekDay = getUtcWeekDay(day);
  return weekDay === 0 || weekDay === 6;
}

export function bucketToPreviousWorkingDay(day: string): string {
  parseLocalDate(day);
  if (!isWeekendDate(day)) {
    return day;
  }

  let bucketDay = addCalendarDays(day, -1);
  while (isWeekendDate(bucketDay)) {
    bucketDay = addCalendarDays(bucketDay, -1);
  }

  return bucketDay;
}

/**
 * Count working dates between two local dates.
 *
 * The start date is excluded and the end date is included.
 */
export function countWorkingDaysBetweenDates(startDay: string, endDay: string): number {
  parseLocalDate(startDay);
  parseLocalDate(endDay);

  if (endDay <= startDay) {
    return 0;
  }

  return countWorkingDaysInClosedRange(addCalendarDays(startDay, 1), endDay);
}

export function addWorkingDaysToDate(date: Date, workingDays: number, timezone: string): string {
  if (!Number.isInteger(workingDays) || workingDays < 0) {
    throw new RangeError(`workingDays must be a non-negative integer, received ${workingDays}`);
  }

  const normalizedTimezone = getNormalizedTimezone(timezone);
  const startDay = getLocalDay(date, normalizedTimezone);

  if (workingDays === 0) {
    return startDay;
  }

  let day = addCalendarDays(startDay, 1);
  while (isWeekendDate(day)) {
    day = addCalendarDays(day, 1);
  }

  let remaining = workingDays - 1;
  if (remaining >= 5) {
    const fullWeeks = Math.floor(remaining / 5);
    day = addCalendarDays(day, fullWeeks * 7);
    remaining %= 5;
  }

  while (remaining > 0) {
    day = addCalendarDays(day, 1);
    if (!isWeekendDate(day)) {
      remaining -= 1;
    }
  }

  return day;
}

export function differenceInWorkingDays(start: Date, end: Date, timezone: string): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const normalizedTimezone = getNormalizedTimezone(timezone);
  const startLocal = getLocalDayFraction(start, normalizedTimezone);
  const endLocal = getLocalDayFraction(end, normalizedTimezone);

  if (startLocal.day === endLocal.day) {
    if (isWeekendDate(startLocal.day)) {
      return 0;
    }
    return Math.max(0, endLocal.fraction - startLocal.fraction);
  }

  let total = 0;

  if (!isWeekendDate(startLocal.day)) {
    total += 1 - startLocal.fraction;
  }

  total += countWorkingDaysBetweenDates(startLocal.day, addCalendarDays(endLocal.day, -1));

  if (!isWeekendDate(endLocal.day)) {
    total += endLocal.fraction;
  }

  return total;
}
