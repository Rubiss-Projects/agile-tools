import { Prisma, type PrismaClient, type JiraConnection } from '@prisma/client';
import type { ConnectionHealthStatus, JiraAuthType, JiraChangelogStrategy } from '@prisma/client';

type JiraConnectionClient = PrismaClient | Prisma.TransactionClient;

export interface CreateJiraConnectionInput {
  requestBudgetPerMinute?: number | null;
  baseUrl: string;
  encryptedSecretRef: string;
  displayName?: string;
}

export interface CreateJiraCloudOAuthConnectionInput {
  cloudId: string;
  siteUrl: string;
  displayName?: string;
  atlassianAccountId?: string;
  oauthScopes: string[];
  accessTokenSecretRef: string;
  refreshTokenSecretRef: string;
  accessTokenExpiresAt: Date;
}

export interface UpdateJiraConnectionInput {
  requestBudgetPerMinute?: number | null;
  baseUrl: string;
  displayName?: string | null;
  encryptedSecretRef?: string;
  resetValidationState?: boolean;
}

export interface UpdateConnectionHealthInput {
  healthStatus: ConnectionHealthStatus;
  lastValidatedAt?: Date;
  lastHealthyAt?: Date;
  /** Pass `null` to clear the error code. Pass `undefined` to leave unchanged. */
  lastErrorCode?: string | null;
}

export interface UpdateJiraConnectionCapabilitiesInput {
  jiraVersion?: string | null;
  jiraDeploymentType?: string | null;
  changelogStrategy?: JiraChangelogStrategy | null;
  capabilitiesDetectedAt?: Date;
}

export async function createJiraConnection(
  client: JiraConnectionClient,
  workspaceId: string,
  input: CreateJiraConnectionInput,
): Promise<JiraConnection> {
  return client.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: input.baseUrl,
      displayName: input.displayName ?? null,
      encryptedSecretRef: input.encryptedSecretRef,
      requestBudgetPerMinute: input.requestBudgetPerMinute ?? null,
      authType: 'data_center_pat',
    },
  });
}

export async function upsertJiraCloudOAuthConnection(
  client: PrismaClient,
  workspaceId: string,
  input: CreateJiraCloudOAuthConnectionInput,
): Promise<JiraConnection> {
  return client.$transaction((tx) => replaceJiraCloudOAuthConnection(tx, workspaceId, input));
}

async function replaceJiraCloudOAuthConnection(
  client: Prisma.TransactionClient,
  workspaceId: string,
  input: CreateJiraCloudOAuthConnectionInput,
): Promise<JiraConnection> {
  // Serialize concurrent reconnects, including the first connection to a site.
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`jira-oauth:${workspaceId}:${input.cloudId}`}, 0))`;
  await client.$queryRaw`SELECT id FROM "JiraConnection" WHERE "workspaceId" = ${workspaceId} AND "cloudId" = ${input.cloudId} AND "authType" = 'cloud_oauth_3lo' FOR UPDATE`;
  const existing = await client.jiraConnection.findFirst({
    where: {
      workspaceId,
      authType: 'cloud_oauth_3lo',
      cloudId: input.cloudId,
    },
  });

  const data: Prisma.JiraConnectionUpdateInput = {
    baseUrl: `https://api.atlassian.com/ex/jira/${input.cloudId}`,
    displayName: input.displayName ?? input.siteUrl,
    siteUrl: input.siteUrl,
    atlassianAccountId: input.atlassianAccountId ?? null,
    oauthScopes: input.oauthScopes,
    accessTokenSecretRef: input.accessTokenSecretRef,
    refreshTokenSecretRef: input.refreshTokenSecretRef,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    healthStatus: 'healthy',
    lastValidatedAt: new Date(),
    lastHealthyAt: new Date(),
    lastErrorCode: null,
    jiraDeploymentType: 'Cloud',
    changelogStrategy: 'subresource',
    capabilitiesDetectedAt: new Date(),
  };

  if (existing) {
    await assertConnectionIdle(client, existing);
    // Reconnect is a new authorization even when Atlassian omits the account ID.
    data.authorizationGeneration = { increment: 1 };
    data.issueCache = { deleteMany: {} };
    await client.jiraRateLimitState.deleteMany({ where: { connectionId: existing.id } });
    return client.jiraConnection.update({
      where: { workspaceId_id: { workspaceId, id: existing.id } },
      data,
    });
  }

  return client.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: `https://api.atlassian.com/ex/jira/${input.cloudId}`,
      displayName: input.displayName ?? input.siteUrl,
      authType: 'cloud_oauth_3lo',
      encryptedSecretRef: null,
      cloudId: input.cloudId,
      siteUrl: input.siteUrl,
      atlassianAccountId: input.atlassianAccountId ?? null,
      oauthScopes: input.oauthScopes,
      accessTokenSecretRef: input.accessTokenSecretRef,
      refreshTokenSecretRef: input.refreshTokenSecretRef,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      healthStatus: 'healthy',
      lastValidatedAt: new Date(),
      lastHealthyAt: new Date(),
      lastErrorCode: null,
      jiraDeploymentType: 'Cloud',
      changelogStrategy: 'subresource',
      capabilitiesDetectedAt: new Date(),
    },
  });
}

export async function getJiraConnection(
  client: JiraConnectionClient,
  workspaceId: string,
  connectionId: string,
): Promise<JiraConnection | null> {
  return client.jiraConnection.findFirst({
    where: { workspaceId, id: connectionId },
  });
}

export async function listJiraConnections(
  client: JiraConnectionClient,
  workspaceId: string,
  options?: { authType?: JiraAuthType },
): Promise<JiraConnection[]> {
  return client.jiraConnection.findMany({
    where: {
      workspaceId,
      ...(options?.authType !== undefined ? { authType: options.authType } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Atomically update connection health fields.
 * Returns the updated record or null if the connection does not exist in the workspace.
 */
export async function updateConnectionHealth(
  client: JiraConnectionClient,
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

export class JiraConnectionBusyError extends Error {
  constructor() {
    super('Wait for active or queued syncs to finish before changing the Jira URL or credentials.');
    this.name = 'JiraConnectionBusyError';
  }
}

/** Publish validation state only for the identity that made the Jira requests. */
export async function updateJiraConnectionValidation(
  client: JiraConnectionClient,
  connection: Pick<JiraConnection, 'id' | 'workspaceId' | 'baseUrl' | 'authType' | 'encryptedSecretRef' | 'authorizationGeneration'>,
  data: UpdateConnectionHealthInput & UpdateJiraConnectionCapabilitiesInput,
): Promise<JiraConnection | null> {
  try {
    return await client.jiraConnection.update({
      where: {
        id: connection.id,
        workspaceId: connection.workspaceId,
        baseUrl: connection.baseUrl,
        authType: connection.authType,
        encryptedSecretRef: connection.encryptedSecretRef,
        authorizationGeneration: connection.authorizationGeneration,
      },
      data,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
    throw err;
  }
}

/** Caller holds the connection row lock, shared with sync creation and claims. */
async function assertConnectionIdle(client: Prisma.TransactionClient, connection: Pick<JiraConnection, 'id' | 'syncLeaseUntil'>): Promise<void> {
  const activeRun = await client.syncRun.findFirst({ where: {
    scope: { connectionId: connection.id }, status: { in: ['queued', 'running'] },
  }, select: { id: true } });
  if ((connection.syncLeaseUntil && connection.syncLeaseUntil > new Date()) || activeRun) {
    throw new JiraConnectionBusyError();
  }
}

export async function updateJiraConnection(
  client: PrismaClient,
  workspaceId: string,
  connectionId: string,
  input: UpdateJiraConnectionInput,
): Promise<JiraConnection | null> {
  return client.$transaction(async (tx) => {
    // Serialize identity replacement with worker claims and limiter observations.
    await tx.$queryRaw`SELECT id FROM "JiraConnection" WHERE id = ${connectionId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    const existing = await getJiraConnection(tx, workspaceId, connectionId);
    if (!existing) return null;
    const resetValidation = input.resetValidationState || input.baseUrl !== existing.baseUrl || input.encryptedSecretRef !== undefined;
    const data: Prisma.JiraConnectionUpdateInput = { baseUrl: input.baseUrl };
    if (input.requestBudgetPerMinute !== undefined) data.requestBudgetPerMinute = input.requestBudgetPerMinute;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.encryptedSecretRef !== undefined) data.encryptedSecretRef = input.encryptedSecretRef;

    if (resetValidation) {
      await assertConnectionIdle(tx, existing);
      data.authorizationGeneration = { increment: 1 };
      data.healthStatus = 'draft';
      data.lastValidatedAt = null;
      data.lastHealthyAt = null;
      data.lastErrorCode = null;
      data.jiraVersion = null;
      data.jiraDeploymentType = null;
      data.changelogStrategy = null;
      data.capabilitiesDetectedAt = null;
      data.issueCache = { deleteMany: {} };
      await tx.jiraRateLimitState.deleteMany({ where: { connectionId } });
    }
    return tx.jiraConnection.update({
      where: { workspaceId_id: { workspaceId, id: connectionId } }, data,
    });
  });
}

/**
 * Persist Jira server metadata and detected API capabilities.
 *
 * All fields are optional so callers can update version metadata from
 * `/serverInfo`, changelog strategy from a runtime probe, or both together.
 */
export async function updateJiraConnectionCapabilities(
  client: JiraConnectionClient,
  workspaceId: string,
  connectionId: string,
  input: UpdateJiraConnectionCapabilitiesInput,
): Promise<JiraConnection | null> {
  const data: Prisma.JiraConnectionUpdateInput = {};
  if (input.jiraVersion !== undefined) data.jiraVersion = input.jiraVersion;
  if (input.jiraDeploymentType !== undefined) data.jiraDeploymentType = input.jiraDeploymentType;
  if (input.changelogStrategy !== undefined) data.changelogStrategy = input.changelogStrategy;
  if (input.capabilitiesDetectedAt !== undefined) {
    data.capabilitiesDetectedAt = input.capabilitiesDetectedAt;
  }

  if (Object.keys(data).length === 0) {
    return getJiraConnection(client, workspaceId, connectionId);
  }

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
  client: JiraConnectionClient,
  workspaceId: string,
  connectionId: string,
): Promise<boolean> {
  const result = await client.jiraConnection.deleteMany({
    where: { workspaceId, id: connectionId },
  });
  return result.count > 0;
}
