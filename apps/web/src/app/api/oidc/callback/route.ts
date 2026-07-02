import { type NextRequest, NextResponse } from 'next/server';

import { logger, recordOidcAuthEvent } from '@agile-tools/shared';

import { completeOidcCallback, isOidcAuthEnabled, resolveOidcRedirectOrigin } from '@/server/oidc';
import { withHttpMetrics } from '@/server/route-metrics';

function callbackRedirect(request: NextRequest, code: string): NextResponse {
  const url = new URL('/', resolveOidcRedirectOrigin(request));
  url.searchParams.set('auth', 'failed');
  url.searchParams.set('code', code);
  return NextResponse.redirect(url);
}

function describeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { error: String(err) };
  }
  const cause = err.cause;
  if (cause && typeof cause === 'object' && ('error' in cause || 'error_description' in cause)) {
    const { error, error_description: errorDescription } = cause as {
      error?: string;
      error_description?: string;
    };
    return { error: err.message, providerError: error, providerErrorDescription: errorDescription };
  }
  return { error: err.message };
}

async function handleGET(request: NextRequest): Promise<Response> {
  if (!isOidcAuthEnabled()) {
    recordOidcAuthEvent({
      event: 'callback',
      result: 'failure',
      reason: 'disabled',
    });
    return Response.json(
      { code: 'NOT_FOUND', message: 'OIDC authentication is not enabled.' },
      { status: 404 },
    );
  }

  if (request.nextUrl.searchParams.get('error')) {
    recordOidcAuthEvent({
      event: 'callback',
      result: 'failure',
      reason: 'provider_error',
    });
    return callbackRedirect(request, 'provider_error');
  }

  if (!request.nextUrl.searchParams.get('code')) {
    recordOidcAuthEvent({
      event: 'callback',
      result: 'failure',
      reason: 'missing_code',
    });
    return callbackRedirect(request, 'missing_code');
  }

  try {
    return await completeOidcCallback(request);
  } catch (err) {
    logger.warn('Failed to complete OIDC callback', describeError(err));
    recordOidcAuthEvent({
      event: 'callback',
      result: 'failure',
      reason: 'callback_error',
    });
    return callbackRedirect(request, 'callback_error');
  }
}

export const GET = withHttpMetrics('GET', '/api/oidc/callback', handleGET);
