import { type NextRequest, NextResponse } from 'next/server';
import { isHostedModeFromEnv, logger } from '@agile-tools/shared';

import {
  completeAtlassianOAuthConnection,
  validateAtlassianOAuthState,
} from '@/server/atlassian-oauth';
import { getHostedClerkIdentity } from '@/server/auth';
import {
  assertHostedConnectionCapacity,
  assertHostedWriteAllowed,
} from '@/server/hosted-policy';
import { getPrismaClient, getWorkspaceByClerkOrgId } from '@agile-tools/db';

function callbackRedirect(request: NextRequest, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function isClerkOrgAdmin(orgRole: string | null): boolean {
  return orgRole === 'org:admin' || orgRole === 'admin';
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isHostedModeFromEnv()) {
    return Response.json(
      { code: 'NOT_FOUND', message: 'Jira Cloud OAuth is only available in hosted mode.' },
      { status: 404 },
    );
  }

  const code = request.nextUrl.searchParams.get('code');
  const stateValue = request.nextUrl.searchParams.get('state');
  if (!code || !stateValue) {
    return callbackRedirect(request, '/admin/jira', {
      oauth: 'failed',
      code: 'missing_code_or_state',
    });
  }

  let state;
  try {
    state = validateAtlassianOAuthState(stateValue);
  } catch (err) {
    logger.warn('Rejected invalid Atlassian OAuth state', {
      error: err instanceof Error ? err.message : String(err),
    });
    return callbackRedirect(request, '/admin/jira', {
      oauth: 'failed',
      code: 'invalid_state',
    });
  }

  try {
    const identity = await getHostedClerkIdentity();
    if (!identity || identity.userId !== state.userId || identity.orgId !== state.orgId) {
      return callbackRedirect(request, '/admin/jira', {
        oauth: 'failed',
        code: 'identity_mismatch',
      });
    }
    if (!isClerkOrgAdmin(identity.orgRole)) {
      return callbackRedirect(request, '/admin/jira', {
        oauth: 'failed',
        code: 'forbidden',
      });
    }

    const workspace = await getWorkspaceByClerkOrgId(getPrismaClient(), state.orgId);
    if (!workspace) {
      return callbackRedirect(request, '/onboarding', {
        next: state.returnUrl,
        oauth: 'workspace_missing',
      });
    }

    await assertHostedWriteAllowed('jira_connection_create');
    await assertHostedConnectionCapacity(workspace.id);
    await completeAtlassianOAuthConnection({
      workspaceId: workspace.id,
      code,
    });

    return callbackRedirect(request, state.returnUrl, { oauth: 'connected' });
  } catch (err) {
    logger.error('Failed to complete Atlassian OAuth callback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return callbackRedirect(request, state.returnUrl, {
      oauth: 'failed',
      code: 'callback_error',
    });
  }
}
