import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { ResponseError } from './errors';
import {
  assertTrustedMutationRequest,
  enforceRateLimit,
  resetRateLimitStore,
} from './request-security';

const ORIGINAL_ENV = { ...process.env };

describe('request-security', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
    resetRateLimitStore();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetRateLimitStore();
  });

  it('allows safe methods without CSRF metadata', () => {
    const request = new NextRequest('https://agile.example.com/api/v1/scopes/demo', {
      method: 'GET',
    });

    expect(() => assertTrustedMutationRequest(request)).not.toThrow();
  });

  it('allows same-origin mutation requests', () => {
    const request = new NextRequest('https://agile.example.com/api/v1/scopes/demo', {
      method: 'POST',
      headers: {
        Origin: 'https://agile.example.com',
      },
    });

    expect(() => assertTrustedMutationRequest(request)).not.toThrow();
  });

  it('blocks cross-site mutation requests', () => {
    const request = new NextRequest('https://agile.example.com/api/v1/scopes/demo', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
      },
    });

    expect(() => assertTrustedMutationRequest(request)).toThrow(ResponseError);
  });

  it('returns 429 after the bucket limit is exceeded', () => {
    const request = new NextRequest('https://agile.example.com/api/v1/scopes/demo', {
      method: 'POST',
      headers: {
        Origin: 'https://agile.example.com',
      },
    });

    enforceRateLimit(request, {
      bucket: 'forecast',
      identifier: 'workspace:user',
      max: 2,
      windowMs: 60_000,
    });
    enforceRateLimit(request, {
      bucket: 'forecast',
      identifier: 'workspace:user',
      max: 2,
      windowMs: 60_000,
    });

    let thrown: unknown;
    try {
      enforceRateLimit(request, {
        bucket: 'forecast',
        identifier: 'workspace:user',
        max: 2,
        windowMs: 60_000,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResponseError);
    expect((thrown as ResponseError).response.status).toBe(429);
  });
});