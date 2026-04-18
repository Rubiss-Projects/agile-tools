import type {
  FlowScope as ApiFlowScope,
  SyncRun as ApiSyncRun,
} from '@agile-tools/shared/contracts/api';
import { getPrismaClient, getFlowScope, getSyncRun } from '@agile-tools/db';
import { ResponseError } from '@/server/errors';

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
