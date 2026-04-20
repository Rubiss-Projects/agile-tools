import { type NextRequest } from 'next/server';
import { getPrismaClient, createSyncRun, listSyncRuns, getActiveSyncRun } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { requireAdminContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { enqueueScopeSyncJob } from '@/server/queue';
import { requireScope, mapSyncRun } from '../../_lib';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireAdminContext();
    assertTrustedMutationRequest(_req);
    enforceRateLimit(_req, {
      bucket: 'admin-syncs:trigger',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${(await params).scopeId}`,
      max: 10,
      windowMs: 5 * 60_000,
    });
    const { scopeId } = await params;

    await requireScope(ctx.workspaceId, scopeId);

    const prisma = getPrismaClient();

    // Guard against duplicate active syncs.
    const activeRun = await getActiveSyncRun(prisma, ctx.workspaceId, scopeId);
    if (activeRun) {
      return Response.json(
        {
          code: 'SYNC_IN_PROGRESS',
          message: 'A sync is already queued or running for this scope.',
          syncRunId: activeRun.id,
        },
        { status: 409 },
      );
    }

    const syncRun = await createSyncRun(prisma, {
      scopeId,
      trigger: 'manual',
      requestedBy: ctx.userId,
    });

    // Best-effort: enqueue the pg-boss job. If this fails we still return the
    // queued SyncRun row so the operator knows a run was created; the worker
    // can be triggered again or will pick it up via scheduled sweep.
    try {
      await enqueueScopeSyncJob({
        scopeId,
        syncRunId: syncRun.id,
        requestedBy: ctx.userId,
        trigger: 'manual',
      });
    } catch (enqueueErr) {
      logger.warn('Failed to enqueue scope sync job; SyncRun row created but job may not fire', {
        syncRunId: syncRun.id,
        scopeId,
        error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
      });
    }

    return Response.json(mapSyncRun(syncRun), { status: 202 });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to trigger manual sync', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireAdminContext();
    const { scopeId } = await params;

    await requireScope(ctx.workspaceId, scopeId);

    const prisma = getPrismaClient();
    const runs = await listSyncRuns(prisma, ctx.workspaceId, scopeId);

    return Response.json({ syncs: runs.map(mapSyncRun) });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to list sync runs', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
