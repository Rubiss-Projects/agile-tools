import { type NextRequest } from 'next/server';

import { logger, recordOidcAuthEvent } from '@agile-tools/shared';

import { ResponseError } from '@/server/errors';
import { isOidcAuthEnabled, startOidcLogin } from '@/server/oidc';
import { enforceRateLimit } from '@/server/request-security';
import { withHttpMetrics } from '@/server/route-metrics';

async function handleGET(request: NextRequest): Promise<Response> {
  try {
    if (!isOidcAuthEnabled()) {
      recordOidcAuthEvent({
        event: 'login_start',
        result: 'failure',
        reason: 'disabled',
      });
      return Response.json(
        { code: 'NOT_FOUND', message: 'OIDC authentication is not enabled.' },
        { status: 404 },
      );
    }

    enforceRateLimit(request, {
      bucket: 'oidc:login',
      max: 12,
      windowMs: 5 * 60_000,
    });

    return await startOidcLogin(request);
  } catch (err) {
    if (err instanceof ResponseError) {
      recordOidcAuthEvent({
        event: 'login_start',
        result: 'failure',
        reason: err.response.status === 429 ? 'rate_limited' : 'exception',
      });
      return err.response;
    }
    logger.error('Failed to start OIDC login', {
      error: err instanceof Error ? err.message : String(err),
    });
    recordOidcAuthEvent({
      event: 'login_start',
      result: 'failure',
      reason: 'exception',
    });
    return Response.json(
      { code: 'OIDC_LOGIN_FAILED', message: 'OIDC login could not be started.' },
      { status: 500 },
    );
  }
}

export const GET = withHttpMetrics('GET', '/api/oidc/login', handleGET);
