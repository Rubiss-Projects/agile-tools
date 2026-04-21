import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { isLocalAdminBootstrapRequestAllowed } from './local-bootstrap';

const ORIGINAL_ENV = { ...process.env };

describe('local-bootstrap', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      ALLOW_LOCAL_BOOTSTRAP: 'true',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows the production bootstrap flow on loopback hosts', () => {
    const request = new NextRequest('http://localhost/api/local/bootstrap', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
      },
    });

    expect(isLocalAdminBootstrapRequestAllowed(request)).toBe(true);
  });

  it('does not trust x-forwarded-host when checking loopback-only access', () => {
    const request = new NextRequest('https://agile.example.com/api/local/bootstrap', {
      method: 'POST',
      headers: {
        origin: 'https://localhost',
        'x-forwarded-host': 'localhost',
      },
    });

    expect(isLocalAdminBootstrapRequestAllowed(request)).toBe(false);
  });
});