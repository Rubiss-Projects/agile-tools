import { type NextRequest } from 'next/server';
import {
  acquireScopeSyncLock,
  createSyncRun,
  getActiveSyncRun,
  getFlowScope,
  getJiraConnection,
  getPrismaClient,
  updateFlowScope,
  updateSyncRun,
} from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { UpdateFlowScopeRequestSchema } from '@agile-tools/shared/contracts/api';
import { getBoardDetail } from '@agile-tools/jira-client';
import { z } from 'zod';
import { requireAdminContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { createClientForConnection, normalizeJiraError } from '../../jira-connections/_lib';
import { mapScope } from '../_lib';
import { enqueueScopeSyncJob } from '@/server/queue';

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== new Set(right).size) return false;
  return right.every((value) => leftSet.has(value));
}

type ScopeUpdatePayload = z.infer<typeof UpdateFlowScopeRequestSchema>;

function hasBoundaryChanges(scope: {
  connectionId: string;
  boardId: string;
  timezone: string;
  includedIssueTypeIds: string[];
  startStatusIds: string[];
  doneStatusIds: string[];
}, input: ScopeUpdatePayload): boolean {
  return (
    scope.connectionId !== input.connectionId ||
    scope.boardId !== String(input.boardId) ||
    scope.timezone !== input.timezone ||
    !sameStringSet(scope.includedIssueTypeIds, input.includedIssueTypeIds) ||
    !sameStringSet(scope.startStatusIds, input.startStatusIds) ||
    !sameStringSet(scope.doneStatusIds, input.doneStatusIds)
  );
}

function hasBoardSelectionChange(scope: {
  connectionId: string;
  boardId: string;
}, input: ScopeUpdatePayload): boolean {
  return scope.connectionId !== input.connectionId || scope.boardId !== String(input.boardId);
}

function toScopeUpdateInput(scope: {
  connectionId: string;
  boardId: string;
  boardName: string;
  timezone: string;
  includedIssueTypeIds: string[];
  startStatusIds: string[];
  doneStatusIds: string[];
  syncIntervalMinutes: number;
}) {
  return {
    connectionId: scope.connectionId,
    boardId: Number(scope.boardId),
    boardName: scope.boardName,
    timezone: scope.timezone,
    includedIssueTypeIds: scope.includedIssueTypeIds,
    startStatusIds: scope.startStatusIds,
    doneStatusIds: scope.doneStatusIds,
    syncIntervalMinutes: scope.syncIntervalMinutes,
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireAdminContext();
    assertTrustedMutationRequest(req);
    enforceRateLimit(req, {
      bucket: 'admin-scopes:update',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${(await params).scopeId}`,
      max: 20,
      windowMs: 5 * 60_000,
    });
    const { scopeId } = await params;

    const body: unknown = await req.json().catch(() => null);
    const parsed = UpdateFlowScopeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body.',
          details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 },
      );
    }

    const prisma = getPrismaClient();
    const preflightScope = await getFlowScope(prisma, ctx.workspaceId, scopeId);
    if (!preflightScope) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Flow scope not found.' },
        { status: 404 },
      );
    }

    const preflightRequiresSync = hasBoundaryChanges(preflightScope, parsed.data);
    if (preflightRequiresSync) {
      const activeRun = await getActiveSyncRun(prisma, ctx.workspaceId, scopeId);
      if (activeRun) {
        return Response.json(
          {
            code: 'SYNC_IN_PROGRESS',
            message: 'Wait for the active sync to finish before changing board or flow boundaries.',
            syncRunId: activeRun.id,
          },
          { status: 409 },
        );
      }
    }

    let prefetchedBoardName: string | null = null;
    if (hasBoardSelectionChange(preflightScope, parsed.data)) {
      const connection = await getJiraConnection(prisma, ctx.workspaceId, parsed.data.connectionId);
      if (!connection) {
        return Response.json(
          { code: 'NOT_FOUND', message: 'Jira connection not found.' },
          { status: 404 },
        );
      }

      const client = createClientForConnection(connection);
      try {
        const boardDetail = await getBoardDetail(client, parsed.data.boardId);
        prefetchedBoardName = boardDetail.boardName;
      } catch (err) {
        const jiraErr = normalizeJiraError(err);
        return Response.json(
          {
            code: jiraErr?.code ?? 'JIRA_ERROR',
            message: jiraErr?.message ?? 'Failed to fetch board details from Jira.',
          },
          { status: jiraErr?.statusCode === 404 ? 404 : 502 },
        );
      }
    }

    const txResult = await prisma.$transaction(async (tx) => {
      await acquireScopeSyncLock(tx, scopeId);

      const currentScope = await getFlowScope(tx, ctx.workspaceId, scopeId);
      if (!currentScope) {
        return { kind: 'missing' as const };
      }

      const rollbackScopeInput = toScopeUpdateInput(currentScope);
      const stillRequiresSync = hasBoundaryChanges(currentScope, parsed.data);

      if (stillRequiresSync) {
        const activeRun = await getActiveSyncRun(tx, ctx.workspaceId, scopeId);
        if (activeRun) {
          return { kind: 'active' as const, activeRunId: activeRun.id };
        }
      }

      let boardName = currentScope.boardName;
      if (hasBoardSelectionChange(currentScope, parsed.data)) {
        const connection = await getJiraConnection(tx, ctx.workspaceId, parsed.data.connectionId);
        if (!connection) {
          return { kind: 'missing-connection' as const };
        }
        if (prefetchedBoardName === null) {
          return { kind: 'stale-board-selection' as const };
        }
        boardName = prefetchedBoardName;
      }

      const updatedScopeInput = {
        connectionId: parsed.data.connectionId,
        boardId: parsed.data.boardId,
        boardName,
        timezone: parsed.data.timezone,
        includedIssueTypeIds: parsed.data.includedIssueTypeIds,
        startStatusIds: parsed.data.startStatusIds,
        doneStatusIds: parsed.data.doneStatusIds,
        syncIntervalMinutes: parsed.data.syncIntervalMinutes,
      };

      let updated;
      try {
        updated = await updateFlowScope(tx, ctx.workspaceId, scopeId, updatedScopeInput);
      } catch (err) {
        if (err instanceof Error && err.message.includes('disjoint')) {
          return { kind: 'invalid' as const, message: err.message };
        }
        throw err;
      }

      if (!updated) {
        return { kind: 'missing' as const };
      }

      if (!stillRequiresSync) {
        return { kind: 'updated' as const, updated };
      }

      const syncRun = await createSyncRun(tx, {
        scopeId,
        trigger: 'manual',
        requestedBy: ctx.userId,
      });

      return { kind: 'queued' as const, updated, syncRunId: syncRun.id, rollbackScopeInput };
    });

    if (txResult.kind === 'active') {
      return Response.json(
        {
          code: 'SYNC_IN_PROGRESS',
          message: 'Wait for the active sync to finish before changing board or flow boundaries.',
          syncRunId: txResult.activeRunId,
        },
        { status: 409 },
      );
    }
    if (txResult.kind === 'missing-connection') {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Jira connection not found.' },
        { status: 404 },
      );
    }
    if (txResult.kind === 'stale-board-selection') {
      return Response.json(
        {
          code: 'CONFLICT',
          message: 'The flow scope changed while validating the target board. Retry the update.',
        },
        { status: 409 },
      );
    }
    if (txResult.kind === 'invalid') {
      return Response.json(
        { code: 'INVALID_REQUEST', message: txResult.message },
        { status: 400 },
      );
    }
    if (txResult.kind === 'missing') {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Flow scope not found.' },
        { status: 404 },
      );
    }

    if (txResult.kind === 'queued') {
      let enqueueFailedMessage: string | null = null;
      try {
        const jobId = await enqueueScopeSyncJob({
          scopeId,
          syncRunId: txResult.syncRunId,
          requestedBy: ctx.userId,
          trigger: 'manual',
        });
        if (!jobId) {
          enqueueFailedMessage = 'pg-boss did not enqueue the follow-up sync job.';
        }
      } catch (enqueueErr) {
        enqueueFailedMessage =
          enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
      }

      if (enqueueFailedMessage !== null) {
        const rollback = await prisma.$transaction(async (tx) => {
          await acquireScopeSyncLock(tx, scopeId);
          await updateSyncRun(tx, txResult.syncRunId, {
            status: 'canceled',
            finishedAt: new Date(),
            errorCode: 'SYNC_ENQUEUE_FAILED',
            errorSummary: enqueueFailedMessage.slice(0, 500),
          });

          const currentScope = await getFlowScope(tx, ctx.workspaceId, scopeId);
          if (!currentScope) {
            return false;
          }

          const scopeStillMatchesUpdatedBoundary = hasBoundaryChanges(currentScope, parsed.data) === false;

          if (!scopeStillMatchesUpdatedBoundary) {
            return false;
          }

          await updateFlowScope(tx, ctx.workspaceId, scopeId, {
            ...txResult.rollbackScopeInput,
            syncIntervalMinutes: currentScope.syncIntervalMinutes,
          });
          return true;
        });

        logger.error('Failed to enqueue follow-up sync after scope update', {
          scopeId,
          syncRunId: txResult.syncRunId,
          rollbackSucceeded: rollback,
          error: enqueueFailedMessage,
        });

        return Response.json(
          {
            code: 'SYNC_ENQUEUE_FAILED',
            message: rollback
              ? 'Failed to queue the follow-up sync, so the scope update was rolled back.'
              : 'Failed to queue the follow-up sync. The scope may need manual review.',
          },
          { status: 503 },
        );
      }
    }

    return Response.json(mapScope(txResult.updated));
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to update flow scope', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
