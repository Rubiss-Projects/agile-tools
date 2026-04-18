import { Prisma, type PrismaClient, type JiraConnection } from '@prisma/client';
import type { ConnectionHealthStatus } from '@prisma/client';

export interface CreateJiraConnectionInput {
  baseUrl: string;
  encryptedSecretRef: string;
  displayName?: string;
}

export interface UpdateConnectionHealthInput {
  healthStatus: ConnectionHealthStatus;
  lastValidatedAt?: Date;
  lastHealthyAt?: Date;
  /** Pass `null` to clear the error code. Pass `undefined` to leave unchanged. */
  lastErrorCode?: string | null;
}

export async function createJiraConnection(
  client: PrismaClient,
  workspaceId: string,
  input: CreateJiraConnectionInput,
): Promise<JiraConnection> {
  return client.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: input.baseUrl,
      displayName: input.displayName ?? null,
      encryptedSecretRef: input.encryptedSecretRef,
      authType: 'pat',
    },
  });
}

export async function getJiraConnection(
  client: PrismaClient,
  workspaceId: string,
  connectionId: string,
): Promise<JiraConnection | null> {
  return client.jiraConnection.findFirst({
    where: { workspaceId, id: connectionId },
  });
}

export async function listJiraConnections(
  client: PrismaClient,
  workspaceId: string,
): Promise<JiraConnection[]> {
  return client.jiraConnection.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Atomically update connection health fields.
 * Returns the updated record or null if the connection does not exist in the workspace.
 */
export async function updateConnectionHealth(
  client: PrismaClient,
  workspaceId: string,
  connectionId: string,
  update: UpdateConnectionHealthInput,
): Promise<JiraConnection | null> {
  const data: Prisma.JiraConnectionUpdateInput = {
    healthStatus: update.healthStatus,
  };
  if (update.lastValidatedAt !== undefined) data.lastValidatedAt = update.lastValidatedAt;
  if (update.lastHealthyAt !== undefined) data.lastHealthyAt = update.lastHealthyAt;
  if (update.lastErrorCode !== undefined) data.lastErrorCode = update.lastErrorCode;

  try {
    return await client.jiraConnection.update({
      where: { workspaceId_id: { workspaceId, id: connectionId } },
      data,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

export async function deleteJiraConnection(
  client: PrismaClient,
  workspaceId: string,
  connectionId: string,
): Promise<boolean> {
  const result = await client.jiraConnection.deleteMany({
    where: { workspaceId, id: connectionId },
  });
  return result.count > 0;
}
