import { Prisma, type PrismaClient, type SyncRun, type SyncRunTrigger, type SyncRunStatus } from '@prisma/client';

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

export interface UpdateSyncRunInput {
  status?: SyncRunStatus;
  startedAt?: Date;
  finishedAt?: Date;
  dataVersion?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
}

/**
 * Update a subset of SyncRun fields. Undefined values are left unchanged;
 * explicit null values clear the column.
 */
export async function updateSyncRun(
  client: PrismaClient,
  syncRunId: string,
  input: UpdateSyncRunInput,
): Promise<SyncRun> {
  const data: Prisma.SyncRunUpdateInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.startedAt !== undefined) data.startedAt = input.startedAt;
  if (input.finishedAt !== undefined) data.finishedAt = input.finishedAt;
  if (input.dataVersion !== undefined) data.dataVersion = input.dataVersion;
  if (input.errorCode !== undefined) data.errorCode = input.errorCode;
  if (input.errorSummary !== undefined) data.errorSummary = input.errorSummary;

  return client.syncRun.update({ where: { id: syncRunId }, data });
}

/**
 * Return the most recent successfully completed sync run that published a
 * dataVersion for a scope, or null if none exists yet.
 * Used to pin analytics projections to a stable snapshot.
 */
export async function getLastSucceededSyncRun(
  client: PrismaClient,
  workspaceId: string,
  scopeId: string,
): Promise<SyncRun | null> {
  return client.syncRun.findFirst({
    where: {
      scopeId,
      scope: { workspaceId },
      status: 'succeeded',
      dataVersion: { not: null },
    },
    orderBy: { createdAt: 'desc' },
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
