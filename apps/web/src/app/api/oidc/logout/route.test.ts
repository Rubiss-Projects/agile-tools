import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { resetConfig } from '@agile-tools/shared';

const { POST } = await import('./route');

const ORIGINAL_ENV = { ...process.env };

describe('POST /api/oidc/logout', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
    };
    resetConfig();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('is not exposed unless OIDC auth is explicitly selected', async () => {
    delete process.env['AUTH_PROVIDER'];

    const response = await POST(new NextRequest('http://localhost/api/oidc/logout', { method: 'POST' }));

    expect(response.status).toBe(404);
  });

  it('rejects cross-site logout posts before mutating the session', async () => {
    process.env['AUTH_PROVIDER'] = 'oidc';

    const response = await POST(new NextRequest('http://localhost/api/oidc/logout', {
      method: 'POST',
      headers: { Origin: 'http://evil.example.test' },
    }));

    expect(response.status).toBe(403);
  });
});
