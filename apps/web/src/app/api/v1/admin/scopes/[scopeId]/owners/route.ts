import { type NextRequest } from 'next/server';
import {
  addFlowScopeUserRoleAssignment,
  getPrismaClient,
  getWorkspaceUser,
  listFlowScopeUserRoleAssignments,
  removeFlowScopeUserRoleAssignment,
} from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { AssignFlowScopeOwnerRequestSchema } from '@agile-tools/shared/contracts/api';
import { requireAdminContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { requireScope, mapFlowScopeOwner } from '../../_lib';
import { withHttpMetrics } from '@/server/route-metrics';

async function handleGET(
  _req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const { scopeId } = await params;
    const ctx = await requireAdminContext();

    await requireScope(ctx.workspaceId, scopeId);

    const owners = await listFlowScopeUserRoleAssignments(
      getPrismaClient(),
      ctx.workspaceId,
      scopeId,
      'owner',
    );
    return Response.json({ owners: owners.map(mapFlowScopeOwner) });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to list flow scope owners', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const { scopeId } = await params;
    const ctx = await requireAdminContext();
    assertTrustedMutationRequest(req);
    enforceRateLimit(req, {
      bucket: 'admin-scope-owners:assign',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${scopeId}`,
      max: 30,
      windowMs: 5 * 60_000,
    });

    await requireScope(ctx.workspaceId, scopeId);

    const body: unknown = await req.json().catch(() => null);
    const parsed = AssignFlowScopeOwnerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'workspaceUserId is required.',
          details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        },
        { status: 400 },
      );
    }

    const db = getPrismaClient();
    const user = await getWorkspaceUser(db, ctx.workspaceId, parsed.data.workspaceUserId);
    if (!user) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Workspace user not found.' },
        { status: 404 },
      );
    }

    await addFlowScopeUserRoleAssignment(
      db,
      ctx.workspaceId,
      scopeId,
      user.id,
      ctx.userId,
      'owner',
    );
    const owners = await listFlowScopeUserRoleAssignments(db, ctx.workspaceId, scopeId, 'owner');
    return Response.json({ owners: owners.map(mapFlowScopeOwner) }, { status: 201 });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to assign flow scope owner', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

async function handleDELETE(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const { scopeId } = await params;
    const ctx = await requireAdminContext();
    assertTrustedMutationRequest(req);
    enforceRateLimit(req, {
      bucket: 'admin-scope-owners:remove',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${scopeId}`,
      max: 30,
      windowMs: 5 * 60_000,
    });

    await requireScope(ctx.workspaceId, scopeId);

    const body: unknown = await req.json().catch(() => null);
    const parsed = AssignFlowScopeOwnerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'workspaceUserId is required.',
          details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        },
        { status: 400 },
      );
    }

    const removed = await removeFlowScopeUserRoleAssignment(
      getPrismaClient(),
      ctx.workspaceId,
      scopeId,
      parsed.data.workspaceUserId,
      'owner',
    );
    if (!removed) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Flow scope owner assignment not found.' },
        { status: 404 },
      );
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to remove flow scope owner', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

export const GET = withHttpMetrics('GET', '/api/v1/admin/scopes/[scopeId]/owners', handleGET);
export const POST = withHttpMetrics('POST', '/api/v1/admin/scopes/[scopeId]/owners', handlePOST);
export const DELETE = withHttpMetrics('DELETE', '/api/v1/admin/scopes/[scopeId]/owners', handleDELETE);
