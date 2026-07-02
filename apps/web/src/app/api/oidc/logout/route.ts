import { type NextRequest } from 'next/server';

import { logger, recordOidcAuthEvent } from '@agile-tools/shared';

import { ResponseError } from '@/server/errors';
import { isOidcAuthEnabled, logoutOidc, resolveOidcRedirectOrigin } from '@/server/oidc';
import { assertTrustedMutationRequest } from '@/server/request-security';
import { withHttpMetrics } from '@/server/route-metrics';

async function handlePOST(request: NextRequest): Promise<Response> {
  try {
    if (!isOidcAuthEnabled()) {
      recordOidcAuthEvent({
        event: 'logout',
        result: 'failure',
        reason: 'disabled',
      });
      return Response.json(
        { code: 'NOT_FOUND', message: 'OIDC authentication is not enabled.' },
        { status: 404 },
      );
    }

    assertTrustedMutationRequest(request);
    return await logoutOidc(request);
  } catch (err) {
    if (err instanceof ResponseError) {
      recordOidcAuthEvent({
        event: 'logout',
        result: 'failure',
        reason: err.response.status === 403 ? 'csrf' : 'exception',
      });
      return err.response;
    }
    logger.warn('Failed to complete OIDC logout', {
      error: err instanceof Error ? err.message : String(err),
    });
    recordOidcAuthEvent({
      event: 'logout',
      result: 'failure',
      reason: 'exception',
    });
    return Response.redirect(new URL('/', resolveOidcRedirectOrigin(request)));
  }
}

export const POST = withHttpMetrics('POST', '/api/oidc/logout', handlePOST);
