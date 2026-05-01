import { normalizeTimeZoneOrThrow } from './timezones.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

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
  return getLocalDay(date, normalizeTimeZoneOrThrow(timezone));
}

export function isWeekendDate(day: string): boolean {
  const { year, month, date } = parseLocalDate(day);
  const weekDay = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekDay === 0 || weekDay === 6;
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

  let count = 0;
  for (let day = addCalendarDays(startDay, 1); day <= endDay; day = addCalendarDays(day, 1)) {
    if (!isWeekendDate(day)) {
      count += 1;
    }
  }
  return count;
}

export function addWorkingDaysToDate(date: Date, workingDays: number, timezone: string): string {
  if (!Number.isInteger(workingDays) || workingDays < 0) {
    throw new RangeError(`workingDays must be a non-negative integer, received ${workingDays}`);
  }

  const normalizedTimezone = normalizeTimeZoneOrThrow(timezone);
  let day = getLocalDay(date, normalizedTimezone);

  for (let remaining = workingDays; remaining > 0; ) {
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

  const normalizedTimezone = normalizeTimeZoneOrThrow(timezone);
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
