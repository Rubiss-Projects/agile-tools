import { describe, expect, it } from 'vitest';

import {
  InvalidTimeZoneError,
  normalizeTimeZone,
  normalizeTimeZoneOrThrow,
  TimeZoneIdentifierSchema,
} from './timezones.js';

describe('timezones', () => {
  it('canonicalizes supported identifiers that resolve to UTC', () => {
    expect(normalizeTimeZone('UTC')).toBe('UTC');
    expect(normalizeTimeZone('utc')).toBe('UTC');
    expect(normalizeTimeZone('Etc/UTC')).toBe('UTC');
  });

  it('returns null for unsupported identifiers', () => {
    expect(normalizeTimeZone('ETC')).toBeNull();
  });

  it('throws a typed error when normalization fails', () => {
    expect(() => normalizeTimeZoneOrThrow('ETC')).toThrow(InvalidTimeZoneError);
  });

  it('normalizes valid schema input and rejects invalid input', () => {
    const valid = TimeZoneIdentifierSchema.safeParse('utc');
    expect(valid.success).toBe(true);
    expect(valid.data).toBe('UTC');

    const invalid = TimeZoneIdentifierSchema.safeParse('ETC');
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.message).toContain('valid time zone identifier');
  });
});