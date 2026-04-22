import type {
  FlowScope as ApiFlowScope,
  SyncRun as ApiSyncRun,
} from '@agile-tools/shared/contracts/api';
import {
  acquireScopeSyncLock,
  createSyncRun,
  getActiveSyncRun,
  getPrismaClient,
  getFlowScope,
  getSyncRun,
  updateSyncRun,
} from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import type { z } from 'zod';
import { ResponseError } from '@/server/errors';
import { enqueueScopeSyncJob } from '@/server/queue';

type DbFlowScope = NonNullable<Awaited<ReturnType<typeof getFlowScope>>>;
type DbSyncRun = NonNullable<Awaited<ReturnType<typeof getSyncRun>>>;

/**
 * Map a Prisma FlowScope record to the API response shape.
 * Converts the stored string boardId back to a number, and omits boardName
 * when not present.
 */
export function mapScope(scope: DbFlowScope): ApiFlowScope {
  return {
    id: scope.id,
    connectionId: scope.connectionId,
    boardId: Number(scope.boardId),
    ...(scope.boardName ? { boardName: scope.boardName } : {}),
    timezone: scope.timezone,
    includedIssueTypeIds: scope.includedIssueTypeIds,
    startStatusIds: scope.startStatusIds,
    doneStatusIds: scope.doneStatusIds,
    syncIntervalMinutes: scope.syncIntervalMinutes,
    status: scope.status as ApiFlowScope['status'],
  };
}

/**
 * Map a Prisma SyncRun record to the API response shape.
 */
export function mapSyncRun(run: DbSyncRun): ApiSyncRun {
  return {
    id: run.id,
    scopeId: run.scopeId,
    trigger: run.trigger as ApiSyncRun['trigger'],
    status: run.status as ApiSyncRun['status'],
    ...(run.requestedBy != null && { requestedBy: run.requestedBy }),
    ...(run.startedAt != null && { startedAt: run.startedAt.toISOString() }),
    ...(run.finishedAt != null && { finishedAt: run.finishedAt.toISOString() }),
    ...(run.dataVersion != null && { dataVersion: run.dataVersion }),
    ...(run.errorCode != null && { errorCode: run.errorCode }),
    ...(run.errorSummary != null && { errorSummary: run.errorSummary }),
  };
}

export function formatIssueDetail(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function formatIssueDetails(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map(formatIssueDetail);
}

/**
 * Load a flow scope scoped to the workspace, throwing a 404 Response if not found.
 */
export async function requireScope(
  workspaceId: string,
  scopeId: string,
): Promise<DbFlowScope> {
  const prisma = getPrismaClient();
  const scope = await getFlowScope(prisma, workspaceId, scopeId);
  if (!scope) {
    throw new ResponseError(
      Response.json(
        { code: 'NOT_FOUND', message: 'Flow scope not found.' },
        { status: 404 },
      ),
    );
  }
  return scope;
}

export async function queueManualScopeSync(
  workspaceId: string,
  scopeId: string,
  requestedBy?: string,
): Promise<
  | { status: 'active'; syncRun: DbSyncRun }
  | { status: 'queued'; syncRun: DbSyncRun }
  | { status: 'failed'; message: string }
> {
  const prisma = getPrismaClient();
  const queuedCandidate = await prisma.$transaction(async (tx) => {
    await acquireScopeSyncLock(tx, scopeId);
    const activeRun = await getActiveSyncRun(tx, workspaceId, scopeId);
    if (activeRun) {
      return { status: 'active' as const, syncRun: activeRun };
    }

    const syncRun = await createSyncRun(tx, {
      scopeId,
      trigger: 'manual',
      ...(requestedBy !== undefined && { requestedBy }),
    });

    return { status: 'queued' as const, syncRun };
  });

  if (queuedCandidate.status === 'active') {
    return queuedCandidate;
  }

  try {
    const jobId = await enqueueScopeSyncJob({
      scopeId,
      syncRunId: queuedCandidate.syncRun.id,
      trigger: 'manual',
      ...(requestedBy !== undefined && { requestedBy }),
    });
    if (!jobId) {
      await updateSyncRun(prisma, queuedCandidate.syncRun.id, {
        status: 'canceled',
        finishedAt: new Date(),
        errorCode: 'SYNC_ENQUEUE_DEDUPED',
        errorSummary: 'pg-boss did not enqueue the scope sync job.',
      });
      return {
        status: 'failed',
        message: 'Failed to queue the sync job. Please try again.',
      };
    }
  } catch (enqueueErr) {
    await updateSyncRun(prisma, queuedCandidate.syncRun.id, {
      status: 'canceled',
      finishedAt: new Date(),
      errorCode: 'SYNC_ENQUEUE_FAILED',
      errorSummary: enqueueErr instanceof Error ? enqueueErr.message.slice(0, 500) : String(enqueueErr),
    });
    logger.warn('Failed to enqueue scope sync job; canceled the pre-created SyncRun row', {
      syncRunId: queuedCandidate.syncRun.id,
      scopeId,
      error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
    });
    return {
      status: 'failed',
      message: 'Failed to queue the sync job. Please try again.',
    };
  }

  return queuedCandidate;
}
