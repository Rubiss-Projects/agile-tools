import { type NextRequest } from 'next/server';

import { logger } from '@agile-tools/shared';

import { ResponseError } from '@/server/errors';
import { isOidcAuthEnabled, logoutOidc } from '@/server/oidc';
import { assertTrustedMutationRequest } from '@/server/request-security';
import { withHttpMetrics } from '@/server/route-metrics';

async function handlePOST(request: NextRequest): Promise<Response> {
  try {
    if (!isOidcAuthEnabled()) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'OIDC authentication is not enabled.' },
        { status: 404 },
      );
    }

    assertTrustedMutationRequest(request);
    return await logoutOidc(request);
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.warn('Failed to complete OIDC logout', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.redirect(new URL('/', request.url));
  }
}

export const POST = withHttpMetrics('POST', '/api/oidc/logout', handlePOST);
