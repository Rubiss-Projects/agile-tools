const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';

export interface AtlassianOAuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  atlassianAccountId?: string;
}

export interface AtlassianAccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  account_id?: string;
}

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export async function exchangeAtlassianOAuthCode(input: OAuthClientCredentials & {
  code: string;
  redirectUri: string;
}): Promise<AtlassianOAuthTokenResponse> {
  return requestToken({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshAtlassianOAuthToken(input: OAuthClientCredentials & {
  refreshToken: string;
}): Promise<AtlassianOAuthTokenResponse> {
  return requestToken({
    grant_type: 'refresh_token',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
}

export async function fetchAtlassianAccessibleResources(
  accessToken: string,
): Promise<AtlassianAccessibleResource[]> {
  const response = await fetch(ATLASSIAN_ACCESSIBLE_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Atlassian accessible resources failed ${response.status}: ${body.slice(0, 200)}`);
  }

  const resources: unknown = await response.json();
  if (!Array.isArray(resources)) return [];

  return resources.flatMap((resource): AtlassianAccessibleResource[] => {
    if (typeof resource !== 'object' || resource === null) return [];
    const obj = resource as Record<string, unknown>;
    if (typeof obj['id'] !== 'string' || typeof obj['url'] !== 'string') return [];
    return [{
      id: obj['id'],
      name: typeof obj['name'] === 'string' ? obj['name'] : obj['url'],
      url: obj['url'],
      scopes: Array.isArray(obj['scopes'])
        ? obj['scopes'].filter((scope): scope is string => typeof scope === 'string')
        : [],
      ...(typeof obj['avatarUrl'] === 'string' ? { avatarUrl: obj['avatarUrl'] } : {}),
    }];
  });
}

async function requestToken(form: Record<string, string>): Promise<AtlassianOAuthTokenResponse> {
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(form),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Atlassian OAuth token request failed ${response.status}: ${body.slice(0, 200)}`);
  }

  const body = (await response.json()) as RawTokenResponse;
  if (!body.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error('Atlassian OAuth token response did not include required token fields.');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [],
    ...(body.account_id ? { atlassianAccountId: body.account_id } : {}),
  };
}
