import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider, logger } from '@agile-tools/shared';
import { getPrismaClient, getWorkspaceByClerkOrgId } from '@agile-tools/db';
import { ResponseError } from './errors';
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  parseWorkspaceContextCookie,
  serializeWorkspaceContext,
  type WorkspaceContext,
  type WorkspaceRole,
} from './session-cookie';
import { getOidcSessionWorkspaceContext } from './oidc';

export { SESSION_COOKIE_NAME, serializeWorkspaceContext, type WorkspaceContext, type WorkspaceRole };

export interface HostedClerkIdentity {
  userId: string;
  orgId: string | null;
  orgRole: string | null;
}

interface ClerkOrganizationMembershipList {
  data?: unknown[];
  totalCount?: number;
  total_count?: number;
}

interface ClerkOrganizationClient {
  organizations: {
    getOrganizationMembershipList(input: {
      organizationId: string;
      limit?: number;
      offset?: number;
    }): Promise<ClerkOrganizationMembershipList>;
  };
}

/**
 * Parse the opaque session cookie and return the workspace context, or fall
 * back to an env-gated read-only workspace context when configured. Returns
 * null only when neither a valid session cookie nor fallback context is
 * available.
 *
 * In production the session value is a signed JWT or opaque token issued by
 * the workspace auth middleware. For v1 the implementation reads from a signed
 * cookie; swap the body for your actual session provider without changing the
 * contract.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const provider = getAuthProvider();
  if (provider === 'clerk') {
    return getClerkWorkspaceContext();
  }
  if (provider === 'oidc') {
    return getOidcSessionWorkspaceContext();
  }

  return getLocalSessionWorkspaceContext();
}

async function getLocalSessionWorkspaceContext(): Promise<WorkspaceContext | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    try {
      const parsed = parseWorkspaceContextCookie(sessionCookie.value);
      if (parsed) return parsed;
    } catch (err) {
      logger.warn('Failed to parse session cookie', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return getReadonlyWorkspaceFallback();
}

export async function getHostedClerkIdentity(): Promise<HostedClerkIdentity | null> {
  const { auth } = await import('@clerk/nextjs/server');
  const session = await auth();
  if (!session.userId) return null;
  return {
    userId: session.userId,
    orgId: session.orgId ?? null,
    orgRole: session.orgRole ?? null,
  };
}

export async function countHostedClerkOrgMembers(orgId: string, limit: number): Promise<number> {
  const clerkModule = (await import('@clerk/nextjs/server')) as {
    clerkClient: () => Promise<ClerkOrganizationClient> | ClerkOrganizationClient;
  };
  const client = await clerkModule.clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit,
  });

  if (typeof memberships.totalCount === 'number') {
    return memberships.totalCount;
  }
  if (typeof memberships.total_count === 'number') {
    return memberships.total_count;
  }
  return Array.isArray(memberships.data) ? memberships.data.length : 0;
}

async function getClerkWorkspaceContext(): Promise<WorkspaceContext | null> {
  const identity = await getHostedClerkIdentity();
  if (!identity?.orgId) return null;

  const workspace = await getWorkspaceByClerkOrgId(getPrismaClient(), identity.orgId);
  if (!workspace) return null;

  return {
    workspaceId: workspace.id,
    userId: identity.userId,
    role: mapClerkOrgRole(identity.orgRole),
  };
}

function mapClerkOrgRole(orgRole: string | null): WorkspaceRole {
  return orgRole === 'org:admin' || orgRole === 'admin' ? 'admin' : 'member';
}

/**
 * Optional, env-gated read-only workspace fallback for pilot or standalone
 * deployments that do not yet have an upstream workspace auth/session
 * provider. When enabled, requests without a valid `agile_session` cookie
 * resolve to a `member`-scoped context for a configured workspace so that
 * normal users can view read-only product pages.
 *
 * This is intentionally member-scoped: `requireAdminContext()` continues to
 * reject the fallback because it always returns role `member`. A valid signed
 * session cookie still takes precedence over the fallback.
 *
 * Enable with:
 *   ALLOW_READONLY_WORKSPACE_FALLBACK=true
 *   READONLY_WORKSPACE_ID=<workspace uuid>
 *   READONLY_WORKSPACE_USER_ID=<optional stable user id>
 */
function getReadonlyWorkspaceFallback(): WorkspaceContext | null {
  if (process.env['ALLOW_READONLY_WORKSPACE_FALLBACK'] !== 'true') return null;

  const workspaceId = process.env['READONLY_WORKSPACE_ID'];
  if (!workspaceId) return null;

  return {
    workspaceId,
    userId: process.env['READONLY_WORKSPACE_USER_ID'] ?? 'readonly-public',
    role: 'member',
  };
}

/**
 * Return the workspace context or throw a Response with 401 status. The context
 * may come from the env-gated read-only fallback, so callers must not treat this
 * as proof of an authenticated user unless they specifically require a valid
 * session cookie.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    throw new ResponseError(
      Response.json({ code: 'UNAUTHENTICATED', message: 'Authentication required.' }, { status: 401 }),
    );
  }
  return ctx;
}

/**
 * Return the workspace context or throw a Response with 403 status.
 * Use this in API route handlers that require administrator access.
 */
export async function requireAdminContext(): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceContext();
  if (ctx.role !== 'admin') {
    throw new ResponseError(
      Response.json({ code: 'FORBIDDEN', message: 'Administrator access required.' }, { status: 403 }),
    );
  }
  return ctx;
}

export function setWorkspaceSessionCookie(
  response: NextResponse,
  request: NextRequest,
  context: WorkspaceContext,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializeWorkspaceContext(context),
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureSessionCookie(request),
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

function shouldUseSecureSessionCookie(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto ?? request.nextUrl.protocol.replace(/:$/, '');

  return protocol === 'https';
}
