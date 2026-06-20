import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { resetConfig } from '@agile-tools/shared';

const { GET } = await import('./route');

const ORIGINAL_ENV = { ...process.env };

describe('GET /api/oidc/login', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
    };
    delete process.env['AUTH_PROVIDER'];
    resetConfig();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('is not exposed unless OIDC auth is explicitly selected', async () => {
    const response = await GET(new NextRequest('http://localhost/api/oidc/login'));

    expect(response.status).toBe(404);
  });
});
