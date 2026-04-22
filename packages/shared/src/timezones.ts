import { z } from 'zod';

export class InvalidTimeZoneError extends RangeError {
  readonly timezone: string;

  constructor(timezone: string) {
    super(`Unsupported time zone identifier: ${timezone}`);
    this.name = 'InvalidTimeZoneError';
    this.timezone = timezone;
  }
}

export function normalizeTimeZone(timezone: string): string | null {
  const trimmed = timezone.trim();
  if (!trimmed) return null;

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: trimmed,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function normalizeTimeZoneOrThrow(timezone: string): string {
  const normalized = normalizeTimeZone(timezone);
  if (!normalized) {
    throw new InvalidTimeZoneError(timezone);
  }
  return normalized;
}

export const TimeZoneIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required.')
  .refine(
    (value) => normalizeTimeZone(value) !== null,
    'Must be a valid time zone identifier such as UTC or America/New_York.',
  )
  .transform((value) => normalizeTimeZoneOrThrow(value));