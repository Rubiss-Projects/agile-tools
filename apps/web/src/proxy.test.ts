import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from './proxy';

const ORIGINAL_ENV = { ...process.env };

describe('proxy', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('redirects forwarded http traffic to https in production', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };

    const response = await proxy(
      new NextRequest('http://internal.example.com/admin/jira', {
        headers: {
          'x-forwarded-proto': 'http',
          'x-forwarded-host': 'agile.example.com',
        },
      }),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://agile.example.com/admin/jira');
  });

  it('redirects loopback traffic in production when bypass is disabled', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };

    const response = await proxy(new NextRequest('http://127.0.0.1:3000/admin/jira'));
    const location = response.headers.get('location');

    expect(response.status).toBe(308);
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.protocol).toBe('https:');
    expect(redirectUrl.pathname).toBe('/admin/jira');
    expect(redirectUrl.port).toBe('3000');
  });

  it('passes loopback traffic through in production when bypass is enabled', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      ALLOW_LOOPBACK_HTTP_BYPASS: 'true',
    };

    const response = await proxy(new NextRequest('http://127.0.0.1:3000/admin/jira'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes requests through outside production', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' };

    const response = await proxy(new NextRequest('http://localhost:3000/admin/jira'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not auto-login OIDC page requests unless explicitly enabled', async () => {
    process.env = {
      ...process.env,
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'false',
    };

    const response = await proxy(
      new NextRequest('http://localhost:3000/scopes/scope-1', {
        headers: { accept: 'text/html' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects unauthenticated OIDC browser page requests when auto-login is enabled', async () => {
    process.env = {
      ...process.env,
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'true',
    };

    const response = await proxy(
      new NextRequest('http://localhost:3000/scopes/scope-1?tab=flow', {
        headers: { accept: 'text/html' },
      }),
    );
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe('/api/oidc/login');
    expect(redirectUrl.searchParams.get('next')).toBe('/scopes/scope-1?tab=flow');
  });

  it('does not auto-login OIDC requests with an existing workspace session cookie', async () => {
    process.env = {
      ...process.env,
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'true',
    };

    const response = await proxy(
      new NextRequest('http://localhost:3000/admin/jira', {
        headers: {
          accept: 'text/html',
          cookie: 'agile_session=v1.payload.signature',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not auto-login API, metrics, or static asset requests', async () => {
    process.env = {
      ...process.env,
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'true',
    };

    const apiResponse = await proxy(
      new NextRequest('http://localhost:3000/api/v1/scopes/scope-1', {
        headers: { accept: 'application/json' },
      }),
    );
    const metricsResponse = await proxy(
      new NextRequest('http://localhost:3000/metrics', {
        headers: { accept: 'text/html' },
      }),
    );
    const assetResponse = await proxy(
      new NextRequest('http://localhost:3000/logo.png', {
        headers: { accept: 'text/html' },
      }),
    );

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers.get('location')).toBeNull();
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers.get('location')).toBeNull();
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get('location')).toBeNull();
  });

  it('passes /metrics through in production', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };

    const response = await proxy(
      new NextRequest('http://internal.example.com/metrics', {
        headers: {
          'x-forwarded-proto': 'http',
          'x-forwarded-host': 'agile.example.com',
        },
      }),
    );
    const trailingSlashResponse = await proxy(
      new NextRequest('http://internal.example.com/metrics/', {
        headers: {
          'x-forwarded-proto': 'http',
          'x-forwarded-host': 'agile.example.com',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(trailingSlashResponse.status).toBe(200);
    expect(trailingSlashResponse.headers.get('location')).toBeNull();
  });
});
