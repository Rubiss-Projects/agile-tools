import { type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createHostedWorkspace,
  getPrismaClient,
  getWorkspaceByClerkOrgId,
  reserveHostedCapacity,
} from '@agile-tools/db';
import { isHostedModeFromEnv, logger, normalizeTimeZoneOrThrow } from '@agile-tools/shared';

import { getHostedClerkIdentity } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import {
  assertHostedOrgMemberCapacity,
  assertHostedWorkspaceCapacity,
  assertHostedWriteAllowed,
} from '@/server/hosted-policy';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';

const CreateHostedWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  defaultTimezone: z.string().trim().min(1),
});

export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (!isHostedModeFromEnv()) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Hosted onboarding is only available in hosted mode.' },
        { status: 404 },
      );
    }

    assertTrustedMutationRequest(request);
    const identity = await getHostedClerkIdentity();
    if (!identity?.orgId) {
      return Response.json(
        { code: 'CLERK_ORG_REQUIRED', message: 'Select or create a Clerk organization first.' },
        { status: 409 },
      );
    }
    if (identity.orgRole !== 'org:admin' && identity.orgRole !== 'admin') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only Clerk organization admins can create hosted workspaces.' },
        { status: 403 },
      );
    }

    enforceRateLimit(request, {
      bucket: 'hosted-onboarding:create-workspace',
      identifier: `${identity.orgId}:${identity.userId}`,
      max: 5,
      windowMs: 10 * 60_000,
    });

    const body: unknown = await request.json().catch(() => null);
    const parsed = CreateHostedWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'Invalid hosted workspace request.',
          details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        },
        { status: 400 },
      );
    }

    const db = getPrismaClient();
    const existing = await getWorkspaceByClerkOrgId(db, identity.orgId);
    if (existing) {
      return Response.json({ workspaceId: existing.id });
    }

    await assertHostedWriteAllowed('workspace_create');
    await assertHostedOrgMemberCapacity(identity.orgId);
    await assertHostedWorkspaceCapacity();

    const timezone = normalizeTimeZoneOrThrow(parsed.data.defaultTimezone);
    const workspace = await createHostedWorkspace(db, {
      name: parsed.data.name,
      clerkOrgId: identity.orgId,
      defaultTimezone: timezone,
    });
    await reserveHostedCapacity(db, 'workspace', workspace.id, workspace.id);

    return Response.json({ workspaceId: workspace.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to create hosted workspace', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
