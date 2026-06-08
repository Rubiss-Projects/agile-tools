import { type NextRequest } from 'next/server';
import { isHostedModeFromEnv, logger } from '@agile-tools/shared';

import {
  buildAtlassianAuthorizationUrl,
  getMissingAtlassianOAuthConfig,
} from '@/server/atlassian-oauth';
import { getHostedClerkIdentity, requireAdminContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import {
  assertHostedConnectionCapacity,
  assertHostedWriteAllowed,
} from '@/server/hosted-policy';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';

function normalizeReturnUrl(request: NextRequest): string {
  const requested = request.nextUrl.searchParams.get('returnUrl') ?? '/admin/jira';
  if (!requested.startsWith('/') || requested.startsWith('//')) {
    return '/admin/jira';
  }
  return requested;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (!isHostedModeFromEnv()) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Jira Cloud OAuth is only available in hosted mode.' },
        { status: 404 },
      );
    }

    const missingOAuthConfig = getMissingAtlassianOAuthConfig();
    if (missingOAuthConfig.length > 0) {
      return Response.json(
        {
          code: 'ATLASSIAN_OAUTH_NOT_CONFIGURED',
          message: 'Atlassian OAuth is not configured for this deployment.',
        },
        { status: 503 },
      );
    }

    const ctx = await requireAdminContext();
    const identity = await getHostedClerkIdentity();
    if (!identity?.orgId) {
      return Response.json(
        { code: 'CLERK_ORG_REQUIRED', message: 'Select or create a Clerk organization first.' },
        { status: 409 },
      );
    }

    assertTrustedMutationRequest(request);
    enforceRateLimit(request, {
      bucket: 'atlassian-oauth:start',
      identifier: `${ctx.workspaceId}:${ctx.userId}`,
      max: 8,
      windowMs: 5 * 60_000,
    });
    await assertHostedWriteAllowed('jira_connection_create');
    await assertHostedConnectionCapacity(ctx.workspaceId);

    const url = buildAtlassianAuthorizationUrl({
      userId: identity.userId,
      orgId: identity.orgId,
      returnUrl: normalizeReturnUrl(request),
    });

    return Response.json({ authorizationUrl: url.toString() });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to start Atlassian OAuth', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
