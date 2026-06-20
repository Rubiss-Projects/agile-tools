import { type NextRequest, NextResponse } from 'next/server';

import { logger } from '@agile-tools/shared';

import { completeOidcCallback, isOidcAuthEnabled } from '@/server/oidc';
import { withHttpMetrics } from '@/server/route-metrics';

function callbackRedirect(request: NextRequest, code: string): NextResponse {
  const url = new URL('/', request.url);
  url.searchParams.set('auth', 'failed');
  url.searchParams.set('code', code);
  return NextResponse.redirect(url);
}

async function handleGET(request: NextRequest): Promise<Response> {
  if (!isOidcAuthEnabled()) {
    return Response.json(
      { code: 'NOT_FOUND', message: 'OIDC authentication is not enabled.' },
      { status: 404 },
    );
  }

  if (request.nextUrl.searchParams.get('error')) {
    return callbackRedirect(request, 'provider_error');
  }

  if (!request.nextUrl.searchParams.get('code')) {
    return callbackRedirect(request, 'missing_code');
  }

  try {
    return await completeOidcCallback(request);
  } catch (err) {
    logger.warn('Failed to complete OIDC callback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return callbackRedirect(request, 'callback_error');
  }
}

export const GET = withHttpMetrics('GET', '/api/oidc/callback', handleGET);
