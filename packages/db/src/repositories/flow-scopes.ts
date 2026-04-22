import { Prisma, type PrismaClient, type FlowScope } from '@prisma/client';
import type { FlowScopeStatus } from '@prisma/client';

import { normalizeTimeZoneOrThrow } from '@agile-tools/shared';

type FlowScopeClient = PrismaClient | Prisma.TransactionClient;

export interface CreateFlowScopeInput {
  connectionId: string;
  /** Jira board ID (numeric). Stored as string internally. */
  boardId: number;
  boardName: string;
  timezone: string;
  includedIssueTypeIds: string[];
  startStatusIds: string[];
  doneStatusIds: string[];
  syncIntervalMinutes: number;
}

export type UpdateFlowScopeInput = CreateFlowScopeInput;

function assertStatusSetsDisjoint(startStatusIds: string[], doneStatusIds: string[]): void {
  const start = new Set(startStatusIds);
  const overlap = doneStatusIds.filter((id) => start.has(id));
  if (overlap.length > 0) {
    throw new Error(
      `startStatusIds and doneStatusIds must be disjoint. Overlapping IDs: ${overlap.join(', ')}`,
    );
  }
}

export async function createFlowScope(
  client: FlowScopeClient,
  workspaceId: string,
  input: CreateFlowScopeInput,
): Promise<FlowScope> {
  assertStatusSetsDisjoint(input.startStatusIds, input.doneStatusIds);
  const timezone = normalizeTimeZoneOrThrow(input.timezone);

  return client.flowScope.create({
    data: {
      workspaceId,
      connectionId: input.connectionId,
      boardId: String(input.boardId),
      boardName: input.boardName,
      timezone,
      includedIssueTypeIds: input.includedIssueTypeIds,
      startStatusIds: input.startStatusIds,
      doneStatusIds: input.doneStatusIds,
      syncIntervalMinutes: input.syncIntervalMinutes,
    },
  });
}

export async function getFlowScope(
  client: FlowScopeClient,
  workspaceId: string,
  scopeId: string,
): Promise<FlowScope | null> {
  return client.flowScope.findFirst({
    where: { workspaceId, id: scopeId },
  });
}

export async function listFlowScopes(
  client: FlowScopeClient,
  workspaceId: string,
): Promise<FlowScope[]> {
  return client.flowScope.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Full-replacement update for all scope configuration fields.
 * Returns the updated record or null if the scope does not exist in the workspace.
 */
export async function updateFlowScope(
  client: FlowScopeClient,
  workspaceId: string,
  scopeId: string,
  input: UpdateFlowScopeInput,
): Promise<FlowScope | null> {
  assertStatusSetsDisjoint(input.startStatusIds, input.doneStatusIds);
  const timezone = normalizeTimeZoneOrThrow(input.timezone);

  try {
    return await client.flowScope.update({
      where: { id: scopeId, workspaceId },
      data: {
        connectionId: input.connectionId,
        boardId: String(input.boardId),
        boardName: input.boardName,
        timezone,
        includedIssueTypeIds: input.includedIssueTypeIds,
        startStatusIds: input.startStatusIds,
        doneStatusIds: input.doneStatusIds,
        syncIntervalMinutes: input.syncIntervalMinutes,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

/**
 * Update only the operational status of a scope (active / paused / needs_attention).
 * Returns the updated record or null if not found.
 */
export async function updateFlowScopeStatus(
  client: FlowScopeClient,
  workspaceId: string,
  scopeId: string,
  status: FlowScopeStatus,
): Promise<FlowScope | null> {
  try {
    return await client.flowScope.update({
      where: { id: scopeId, workspaceId },
      data: { status },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

export async function deleteFlowScope(
  client: FlowScopeClient,
  workspaceId: string,
  scopeId: string,
): Promise<boolean> {
  const result = await client.flowScope.deleteMany({
    where: { workspaceId, id: scopeId },
  });
  return result.count > 0;
}
