import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, resetConfig } from './config.js';

const ORIGINAL_ENV = { ...process.env };

describe('getConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfig();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('returns defaults for optional values', () => {
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/agile_tools';
    process.env['ENCRYPTION_KEY'] = '12345678901234567890123456789012';

    const config = getConfig();

    expect(config.NODE_ENV).toBe('test');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.PORT).toBe(3000);
    expect(config.DEFAULT_SYNC_INTERVAL_MINUTES).toBe(10);
  });

  it('caches the parsed result until resetConfig is called', () => {
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/one';
    process.env['ENCRYPTION_KEY'] = '12345678901234567890123456789012';

    const first = getConfig();

    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/two';

    const second = getConfig();

    expect(second).toBe(first);
    expect(second.DATABASE_URL).toBe('postgresql://localhost:5432/one');

    resetConfig();

    const third = getConfig();
    expect(third.DATABASE_URL).toBe('postgresql://localhost:5432/two');
  });

  it('throws a readable error when required values are missing or invalid', () => {
    delete process.env['DATABASE_URL'];
    process.env['ENCRYPTION_KEY'] = 'too-short';

    expect(() => getConfig()).toThrowError(/DATABASE_URL|ENCRYPTION_KEY/);
  });
});