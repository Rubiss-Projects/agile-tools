import type { NextRequest } from 'next/server';

import { logger } from '@agile-tools/shared';

import { ResponseError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface RateLimitOptions {
  bucket: string;
  identifier?: string;
  max: number;
  windowMs: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

declare global {
  var __agileToolsRateLimitStore: Map<string, RateLimitState> | undefined;
}

export function assertTrustedMutationRequest(request: NextRequest): void {
  if (SAFE_METHODS.has(request.method)) return;

  const expectedOrigin = getExpectedOrigin(request);
  const origin = request.headers.get('origin');
  if (origin) {
    if (origin !== expectedOrigin) {
      throw forbidden('Cross-site request blocked.');
    }
    return;
  }

  const referer = request.headers.get('referer');
  if (referer) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw forbidden('Invalid referer header.');
    }

    if (refererOrigin !== expectedOrigin) {
      throw forbidden('Cross-site request blocked.');
    }
    return;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchSite === 'none') {
    return;
  }

  if (process.env['NODE_ENV'] === 'test' && !fetchSite) {
    return;
  }

  throw forbidden('Missing same-origin request metadata.');
}

export function enforceRateLimit(request: NextRequest, options: RateLimitOptions): void {
  const store = getRateLimitStore();
  const identifier = options.identifier ?? getClientIdentifier(request);
  const key = `${options.bucket}:${identifier}`;
  const now = Date.now();

  pruneExpiredEntries(store, now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (current.count >= options.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    logger.warn('Rate limit exceeded', {
      bucket: options.bucket,
      identifier,
      method: request.method,
      path: request.nextUrl.pathname,
      retryAfterSeconds,
    });

    throw new ResponseError(
      Response.json(
        { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        },
      ),
    );
  }

  current.count += 1;
}

export function resetRateLimitStore(): void {
  globalThis.__agileToolsRateLimitStore?.clear();
}

function forbidden(message: string): ResponseError {
  return new ResponseError(
    Response.json({ code: 'FORBIDDEN', message }, { status: 403 }),
  );
}

function getExpectedOrigin(request: NextRequest): string {
  const forwardedProto = getFirstHeaderValue(request, 'x-forwarded-proto');
  const forwardedHost = getFirstHeaderValue(request, 'x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host') ?? request.nextUrl.host;
  const protocol = forwardedProto ?? request.nextUrl.protocol.replace(/:$/, '');

  return `${protocol}://${host}`;
}

function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = getFirstHeaderValue(request, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor;

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  const userAgent = request.headers.get('user-agent');
  if (userAgent) return userAgent;

  return 'unknown-client';
}

function getFirstHeaderValue(request: NextRequest, key: string): string | null {
  const value = request.headers.get(key);
  if (!value) return null;

  const [first] = value.split(',');
  return first?.trim() || null;
}

function getRateLimitStore(): Map<string, RateLimitState> {
  if (!globalThis.__agileToolsRateLimitStore) {
    globalThis.__agileToolsRateLimitStore = new Map<string, RateLimitState>();
  }

  return globalThis.__agileToolsRateLimitStore;
}

function pruneExpiredEntries(store: Map<string, RateLimitState>, now: number): void {
  if (store.size < 512) return;

  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}