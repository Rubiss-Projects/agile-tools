import { type PrismaClient, type SyncRun, type SyncRunTrigger } from '@prisma/client';

export interface CreateSyncRunInput {
  scopeId: string;
  trigger: SyncRunTrigger;
  requestedBy?: string;
}

export async function createSyncRun(
  client: PrismaClient,
  input: CreateSyncRunInput,
): Promise<SyncRun> {
  return client.syncRun.create({
    data: {
      scopeId: input.scopeId,
      trigger: input.trigger,
      ...(input.requestedBy !== undefined && { requestedBy: input.requestedBy }),
    },
  });
}

/**
 * Look up a single sync run by ID, scoped to the workspace via the parent FlowScope relation.
 * Returns null if not found or if the run does not belong to the workspace.
 */
export async function getSyncRun(
  client: PrismaClient,
  workspaceId: string,
  syncRunId: string,
): Promise<SyncRun | null> {
  return client.syncRun.findFirst({
    where: {
      id: syncRunId,
      scope: { workspaceId },
    },
  });
}

export async function listSyncRuns(
  client: PrismaClient,
  workspaceId: string,
  scopeId: string,
  limit = 50,
): Promise<SyncRun[]> {
  return client.syncRun.findMany({
    where: {
      scopeId,
      scope: { workspaceId },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Return the most recent queued or running sync run for a scope, or null if none.
 * Used to detect active syncs before enqueuing a new manual run.
 */
export async function getActiveSyncRun(
  client: PrismaClient,
  workspaceId: string,
  scopeId: string,
): Promise<SyncRun | null> {
  return client.syncRun.findFirst({
    where: {
      scopeId,
      scope: { workspaceId },
      status: { in: ['queued', 'running'] },
    },
    orderBy: { createdAt: 'desc' },
  });
}
