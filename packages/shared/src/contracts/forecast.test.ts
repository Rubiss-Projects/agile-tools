import { describe, expect, it } from 'vitest';

import { ForecastRequestSchema } from './forecast.js';

describe('ForecastRequestSchema', () => {
  it('accepts a real calendar date for how_many requests', () => {
    const parsed = ForecastRequestSchema.safeParse({
      type: 'how_many',
      targetDate: '2025-02-28',
      historicalWindowDays: 90,
      confidenceLevels: [50, 85],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects impossible calendar dates for how_many requests', () => {
    const parsed = ForecastRequestSchema.safeParse({
      type: 'how_many',
      targetDate: '2025-02-30',
      historicalWindowDays: 90,
      confidenceLevels: [50, 85],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain('real calendar date');
  });
});
