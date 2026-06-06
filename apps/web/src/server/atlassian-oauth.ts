/* global Buffer */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  exchangeAtlassianOAuthCode,
  fetchAtlassianAccessibleResources,
  refreshAtlassianOAuthToken,
} from '@agile-tools/jira-client';
import type { AtlassianAccessibleResource } from '@agile-tools/jira-client';
import {
  getPrismaClient,
  reserveHostedCapacity,
  upsertJiraCloudOAuthConnection,
  updateConnectionHealth,
} from '@agile-tools/db';
import { decryptSecret, encryptSecret, getConfig } from '@agile-tools/shared';

const STATE_VERSION = 'v1';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;

interface OAuthStatePayload {
  userId: string;
  orgId: string;
  nonce: string;
  returnUrl: string;
  expiresAt: string;
}

export type ValidatedOAuthState = OAuthStatePayload;

export function buildAtlassianAuthorizationUrl(input: {
  userId: string;
  orgId: string;
  returnUrl: string;
}): URL {
  const config = getConfig();
  const url = new URL('https://auth.atlassian.com/authorize');
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', requireHostedConfigValue('ATLASSIAN_CLIENT_ID'));
  url.searchParams.set('scope', requireHostedConfigValue('ATLASSIAN_SCOPES'));
  url.searchParams.set('redirect_uri', requireHostedConfigValue('ATLASSIAN_REDIRECT_URI'));
  url.searchParams.set('state', signOAuthState({
    ...input,
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  }));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent');

  if (config.NODE_ENV !== 'production') {
    url.searchParams.set('redirect_uri', config.ATLASSIAN_REDIRECT_URI ?? url.searchParams.get('redirect_uri')!);
  }

  return url;
}

export function validateAtlassianOAuthState(value: string): ValidatedOAuthState {
  const [version, payload, signature] = value.split('.');
  if (version !== STATE_VERSION || !payload || !signature) {
    throw new Error('Invalid OAuth state.');
  }

  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature.');
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (!isOAuthStatePayload(parsed)) {
    throw new Error('Invalid OAuth state payload.');
  }
  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    throw new Error('OAuth state expired.');
  }

  return parsed;
}

export async function completeAtlassianOAuthConnection(input: {
  workspaceId: string;
  code: string;
}): Promise<{ connectionId: string; resource: AtlassianAccessibleResource }> {
  const config = getConfig();
  const tokens = await exchangeAtlassianOAuthCode({
    clientId: requireHostedConfigValue('ATLASSIAN_CLIENT_ID'),
    clientSecret: requireHostedConfigValue('ATLASSIAN_CLIENT_SECRET'),
    redirectUri: requireHostedConfigValue('ATLASSIAN_REDIRECT_URI'),
    code: input.code,
  });
  const resources = await fetchAtlassianAccessibleResources(tokens.accessToken);
  const resource = resources[0];
  if (!resource) {
    throw new Error('No Jira Cloud sites were returned by Atlassian.');
  }

  const connection = await upsertJiraCloudOAuthConnection(getPrismaClient(), input.workspaceId, {
    cloudId: resource.id,
    siteUrl: resource.url.replace(/\/$/, ''),
    displayName: resource.name,
    ...(tokens.atlassianAccountId !== undefined
      ? { atlassianAccountId: tokens.atlassianAccountId }
      : {}),
    oauthScopes: tokens.scopes.length > 0 ? tokens.scopes : resource.scopes,
    accessTokenSecretRef: encryptSecret(tokens.accessToken, config.ENCRYPTION_KEY),
    refreshTokenSecretRef: encryptSecret(tokens.refreshToken, config.ENCRYPTION_KEY),
    accessTokenExpiresAt: tokens.expiresAt,
  });
  await reserveHostedCapacity(getPrismaClient(), 'jira_connection', connection.id, input.workspaceId);

  return { connectionId: connection.id, resource };
}

export async function getCloudAccessTokenForConnection(connection: {
  id: string;
  workspaceId: string;
  accessTokenSecretRef: string | null;
  refreshTokenSecretRef: string | null;
  accessTokenExpiresAt: Date | null;
}): Promise<string> {
  const config = getConfig();
  if (!connection.accessTokenSecretRef || !connection.refreshTokenSecretRef) {
    throw new Error('Jira Cloud OAuth connection is missing encrypted token refs.');
  }

  if (
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_SKEW_MS
  ) {
    return decryptSecret(connection.accessTokenSecretRef, config.ENCRYPTION_KEY);
  }

  try {
    const refreshed = await refreshAtlassianOAuthToken({
      clientId: requireHostedConfigValue('ATLASSIAN_CLIENT_ID'),
      clientSecret: requireHostedConfigValue('ATLASSIAN_CLIENT_SECRET'),
      refreshToken: decryptSecret(connection.refreshTokenSecretRef, config.ENCRYPTION_KEY),
    });

    await getPrismaClient().jiraConnection.update({
      where: { workspaceId_id: { workspaceId: connection.workspaceId, id: connection.id } },
      data: {
        accessTokenSecretRef: encryptSecret(refreshed.accessToken, config.ENCRYPTION_KEY),
        refreshTokenSecretRef: encryptSecret(refreshed.refreshToken, config.ENCRYPTION_KEY),
        accessTokenExpiresAt: refreshed.expiresAt,
        oauthScopes: refreshed.scopes,
        healthStatus: 'healthy',
        lastHealthyAt: new Date(),
        lastErrorCode: null,
      },
    });

    return refreshed.accessToken;
  } catch (err) {
    await updateConnectionHealth(getPrismaClient(), connection.workspaceId, connection.id, {
      healthStatus: 'unhealthy',
      lastErrorCode: 'ATLASSIAN_TOKEN_REFRESH_FAILED',
    }).catch(() => undefined);
    throw err;
  }
}

function signOAuthState(payload: OAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${STATE_VERSION}.${encoded}.${signPayload(encoded)}`;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getConfig().ENCRYPTION_KEY).update(payload).digest('base64url');
}

function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['userId'] === 'string' &&
    typeof obj['orgId'] === 'string' &&
    typeof obj['nonce'] === 'string' &&
    typeof obj['returnUrl'] === 'string' &&
    typeof obj['expiresAt'] === 'string'
  );
}

function requireHostedConfigValue(key: 'ATLASSIAN_CLIENT_ID' | 'ATLASSIAN_CLIENT_SECRET' | 'ATLASSIAN_REDIRECT_URI' | 'ATLASSIAN_SCOPES'): string {
  const value = getConfig()[key];
  if (!value) {
    throw new Error(`${key} is required for Jira Cloud OAuth.`);
  }
  return value;
}
