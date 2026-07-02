import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as oidc from 'openid-client';

import {
  createOidcSession,
  deleteOidcSessionById,
  getOidcSessionById,
  getOidcSessionWithUserById,
  getPrismaClient,
  updateOidcSessionTokens,
  upsertOidcWorkspaceUser,
} from '@agile-tools/db';
import {
  decryptSecret,
  encryptSecret,
  getAuthProvider,
  getConfig,
  logger,
  recordOidcAuthEvent,
} from '@agile-tools/shared';

import {
  parseWorkspaceContextCookie,
  serializeWorkspaceContext,
  SESSION_COOKIE_NAME,
  type WorkspaceContext,
  type WorkspaceRole,
} from './session-cookie';

export const OIDC_SESSION_COOKIE_NAME = 'agile_oidc_session';

const OIDC_STATE_COOKIE_NAME = 'agile_oidc_state';
const OIDC_PKCE_COOKIE_NAME = 'agile_oidc_pkce';
const OIDC_NONCE_COOKIE_NAME = 'agile_oidc_nonce';
const OIDC_NEXT_COOKIE_NAME = 'agile_oidc_next';
const OIDC_TRANSIENT_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const DEFAULT_LOGIN_REDIRECT_PATH = '/';

type OidcClaims = Record<string, unknown>;

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post';
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string;
  allowedIssuers: string[];
  allowInsecureHttp: boolean;
  workspaceId: string;
  workspaceName: string;
  defaultTimezone: string;
  sessionMaxAgeSeconds: number;
  adminEmails: string[];
  adminClaim: string | null;
  adminClaimValues: string[];
}

interface OidcIdentity {
  issuer: string;
  externalSubject: string;
  subject: string;
  email: string | null;
  displayName: string | null;
  initialRole: WorkspaceRole;
}

let cachedConfiguration:
  | {
      key: string;
      value: oidc.Configuration;
    }
  | undefined;

export function getOidcSettings(): OidcSettings {
  const config = getConfig();
  if (config.AUTH_PROVIDER !== 'oidc') {
    throw new Error('OIDC auth is not enabled.');
  }

  const issuer = requireOidcValue(config.OIDC_ISSUER, 'OIDC_ISSUER');
  const clientId = requireOidcValue(config.OIDC_CLIENT_ID, 'OIDC_CLIENT_ID');
  const clientSecret = requireOidcValue(config.OIDC_CLIENT_SECRET, 'OIDC_CLIENT_SECRET');
  const redirectUri = requireOidcValue(config.OIDC_REDIRECT_URI, 'OIDC_REDIRECT_URI');
  const postLogoutRedirectUri = requireOidcValue(
    config.OIDC_POST_LOGOUT_REDIRECT_URI,
    'OIDC_POST_LOGOUT_REDIRECT_URI',
  );
  const workspaceId = requireOidcValue(config.OIDC_WORKSPACE_ID, 'OIDC_WORKSPACE_ID');

  return {
    issuer,
    clientId,
    clientSecret,
    clientAuthMethod: config.OIDC_CLIENT_AUTH_METHOD,
    redirectUri,
    postLogoutRedirectUri,
    scopes: normalizeScopes(config.OIDC_SCOPES),
    allowedIssuers: parseDelimitedList(config.OIDC_ALLOWED_ISSUERS),
    allowInsecureHttp: config.OIDC_ALLOW_INSECURE_HTTP === 'true',
    workspaceId,
    workspaceName: config.OIDC_WORKSPACE_NAME,
    defaultTimezone: config.OIDC_DEFAULT_TIMEZONE,
    sessionMaxAgeSeconds: config.OIDC_SESSION_MAX_AGE_SECONDS,
    adminEmails: parseDelimitedList(config.OIDC_ADMIN_EMAILS).map((email) => email.toLowerCase()),
    adminClaim: config.OIDC_ADMIN_CLAIM ?? null,
    adminClaimValues: parseDelimitedList(config.OIDC_ADMIN_CLAIM_VALUES),
  };
}

export function isOidcAuthEnabled(): boolean {
  return getAuthProvider() === 'oidc';
}

export async function getOidcSessionWorkspaceContext(): Promise<WorkspaceContext | null> {
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!workspaceCookie) return null;

  let parsed: WorkspaceContext | null;
  try {
    parsed = parseWorkspaceContextCookie(workspaceCookie);
  } catch (err) {
    logger.warn('Failed to parse OIDC workspace session cookie', {
      error: err instanceof Error ? err.message : String(err),
    });
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'invalid_workspace_cookie',
    });
    return null;
  }
  if (!parsed) {
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'invalid_workspace_cookie',
    });
    return null;
  }
  if (parsed.authProvider !== 'oidc') {
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'legacy_workspace_cookie',
    });
    return null;
  }

  const oidcSessionId = cookieStore.get(OIDC_SESSION_COOKIE_NAME)?.value;
  if (!oidcSessionId) {
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'missing_session_cookie',
    });
    return null;
  }

  const db = getPrismaClient();
  const oidcSession = await getOidcSessionWithUserById(db, oidcSessionId);
  if (!oidcSession) {
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'missing_session_row',
    });
    return null;
  }
  if (
    oidcSession.workspaceId !== parsed.workspaceId ||
    oidcSession.workspaceUserId !== parsed.userId ||
    oidcSession.user.workspaceId !== parsed.workspaceId
  ) {
    logger.warn('Rejected mismatched OIDC session cookie pair', {
      workspaceId: parsed.workspaceId,
      userId: parsed.userId,
      oidcSessionId,
    });
    recordOidcAuthEvent({
      event: 'session_rejected',
      result: 'failure',
      reason: 'session_mismatch',
    });
    return null;
  }

  if (!(await ensureOidcSessionFresh(oidcSession))) {
    return null;
  }

  return {
    workspaceId: oidcSession.workspaceId,
    userId: oidcSession.user.id,
    role: oidcSession.user.role,
    authProvider: 'oidc',
  };
}

export async function startOidcLogin(request: NextRequest): Promise<NextResponse> {
  const settings = getOidcSettings();
  const configuration = await getOidcConfiguration(settings);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const nextPath = sanitizeOidcRedirectPath(request.nextUrl.searchParams.get('next'));

  const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: settings.redirectUri,
    response_type: 'code',
    scope: settings.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  const response = NextResponse.redirect(authorizationUrl);
  setOidcCookie(response, request, OIDC_STATE_COOKIE_NAME, state, OIDC_TRANSIENT_COOKIE_MAX_AGE_SECONDS);
  setOidcCookie(response, request, OIDC_PKCE_COOKIE_NAME, codeVerifier, OIDC_TRANSIENT_COOKIE_MAX_AGE_SECONDS);
  setOidcCookie(response, request, OIDC_NONCE_COOKIE_NAME, nonce, OIDC_TRANSIENT_COOKIE_MAX_AGE_SECONDS);
  setOidcCookie(response, request, OIDC_NEXT_COOKIE_NAME, nextPath, OIDC_TRANSIENT_COOKIE_MAX_AGE_SECONDS);
  recordOidcAuthEvent({
    event: 'login_start',
    result: 'success',
    reason: 'success',
  });
  return response;
}

export async function completeOidcCallback(request: NextRequest): Promise<NextResponse> {
  const settings = getOidcSettings();
  const expectedState = getRequiredRequestCookie(request, OIDC_STATE_COOKIE_NAME);
  const pkceCodeVerifier = getRequiredRequestCookie(request, OIDC_PKCE_COOKIE_NAME);
  const expectedNonce = getRequiredRequestCookie(request, OIDC_NONCE_COOKIE_NAME);
  const nextPath = sanitizeOidcRedirectPath(request.cookies.get(OIDC_NEXT_COOKIE_NAME)?.value ?? null);
  const configuration = await getOidcConfiguration(settings);

  const tokens = await oidc.authorizationCodeGrant(
    configuration,
    new URL(request.url),
    {
      pkceCodeVerifier,
      expectedState,
      expectedNonce,
      idTokenExpected: true,
    },
    { redirect_uri: settings.redirectUri },
  );
  const idTokenClaims = tokens.claims();
  if (!idTokenClaims) {
    throw new Error('OIDC provider did not return an id_token.');
  }

  const userInfo = await fetchOptionalUserInfo(configuration, tokens.access_token, idTokenClaims);
  const identity = resolveOidcIdentity(settings, configuration, idTokenClaims, userInfo);
  const db = getPrismaClient();
  await ensureOidcWorkspace(settings);

  const user = await upsertOidcWorkspaceUser(db, {
    workspaceId: settings.workspaceId,
    externalSubject: identity.externalSubject,
    email: identity.email,
    displayName: identity.displayName,
    initialRole: identity.initialRole,
  });
  const encryptionKey = getConfig().ENCRYPTION_KEY;
  const oidcSession = await createOidcSession(db, {
    workspaceId: settings.workspaceId,
    workspaceUserId: user.id,
    issuer: identity.issuer,
    subject: identity.subject,
    idTokenSecretRef: encryptToken(tokens.id_token, encryptionKey),
    accessTokenSecretRef: encryptToken(tokens.access_token, encryptionKey),
    refreshTokenSecretRef: encryptToken(tokens.refresh_token, encryptionKey),
    accessTokenExpiresAt: accessTokenExpiresAt(tokens.expiresIn()),
  });

  const response = NextResponse.redirect(new URL(nextPath, resolveOidcRedirectOrigin(request)));
  setWorkspaceSessionCookie(
    response,
    request,
    {
      workspaceId: settings.workspaceId,
      userId: user.id,
      role: user.role,
      authProvider: 'oidc',
    },
    settings.sessionMaxAgeSeconds,
  );
  setOidcCookie(
    response,
    request,
    OIDC_SESSION_COOKIE_NAME,
    oidcSession.id,
    settings.sessionMaxAgeSeconds,
  );
  clearOidcTransientCookies(response, request);
  recordOidcAuthEvent({
    event: 'callback',
    result: 'success',
    reason: 'success',
  });
  return response;
}

export async function logoutOidc(request: NextRequest): Promise<NextResponse> {
  const settings = getOidcSettings();
  const sessionId = request.cookies.get(OIDC_SESSION_COOKIE_NAME)?.value;
  const redirectTo = new URL(settings.postLogoutRedirectUri, request.url);
  let providerLogoutUrl: URL | null = null;

  if (sessionId) {
    const db = getPrismaClient();
    const session = await getOidcSessionById(db, sessionId);
    if (session) {
      const configuration = await getOidcConfiguration(settings);
      await revokeOidcSessionTokens(configuration, session);
      providerLogoutUrl = buildProviderLogoutUrl(configuration, settings, session);
      await deleteOidcSessionById(db, sessionId);
    }
  }

  const response = NextResponse.redirect(providerLogoutUrl ?? redirectTo);
  clearCookie(response, request, SESSION_COOKIE_NAME);
  clearCookie(response, request, OIDC_SESSION_COOKIE_NAME);
  clearOidcTransientCookies(response, request);
  recordOidcAuthEvent({
    event: 'logout',
    result: 'success',
    reason: 'success',
  });
  return response;
}

export function resolveOidcInitialRole(settings: Pick<OidcSettings, 'adminEmails' | 'adminClaim' | 'adminClaimValues'>, claims: OidcClaims): WorkspaceRole {
  const email = firstStringClaim(claims, ['email']);
  if (email && settings.adminEmails.includes(email.toLowerCase())) {
    return 'admin';
  }

  if (settings.adminClaim && settings.adminClaimValues.length > 0) {
    const adminValues = new Set(settings.adminClaimValues);
    const claimValues = claimStringValues(claims[settings.adminClaim]);
    if (claimValues.some((value) => adminValues.has(value))) {
      return 'admin';
    }
  }

  return 'member';
}

function requireOidcValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} must be configured when AUTH_PROVIDER=oidc.`);
  }
  return value;
}

async function ensureOidcSessionFresh(session: {
  id: string;
  refreshTokenSecretRef: string | null;
  accessTokenExpiresAt: Date | null;
}): Promise<boolean> {
  if (!session.accessTokenExpiresAt) {
    return true;
  }

  const refreshAt = new Date(Date.now() + 60_000);
  if (session.accessTokenExpiresAt > refreshAt) {
    return true;
  }

  if (!session.refreshTokenSecretRef) {
    recordOidcAuthEvent({
      event: 'refresh',
      result: 'failure',
      reason: 'no_refresh_token',
    });
    await deleteOidcSessionById(getPrismaClient(), session.id);
    return false;
  }

  const settings = getOidcSettings();
  const configuration = await getOidcConfiguration(settings);
  const encryptionKey = getConfig().ENCRYPTION_KEY;

  try {
    const tokens = await oidc.refreshTokenGrant(
      configuration,
      decryptSecret(session.refreshTokenSecretRef, encryptionKey),
      { scope: settings.scopes },
    );
    const updateInput: {
      idTokenSecretRef?: string | null;
      accessTokenSecretRef?: string | null;
      refreshTokenSecretRef?: string | null;
      accessTokenExpiresAt?: Date | null;
    } = {
      accessTokenExpiresAt: accessTokenExpiresAt(tokens.expiresIn()),
    };
    if (tokens.id_token) {
      updateInput.idTokenSecretRef = encryptSecret(tokens.id_token, encryptionKey);
    }
    if (tokens.access_token) {
      updateInput.accessTokenSecretRef = encryptSecret(tokens.access_token, encryptionKey);
    }
    if (tokens.refresh_token) {
      updateInput.refreshTokenSecretRef = encryptSecret(tokens.refresh_token, encryptionKey);
    }
    await updateOidcSessionTokens(getPrismaClient(), session.id, {
      ...updateInput,
    });
    recordOidcAuthEvent({
      event: 'refresh',
      result: 'success',
      reason: 'success',
    });
    return true;
  } catch (err) {
    logger.warn('Failed to refresh OIDC session; deleting local session row', {
      oidcSessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
    recordOidcAuthEvent({
      event: 'refresh',
      result: 'failure',
      reason: 'refresh_failed',
    });
    await deleteOidcSessionById(getPrismaClient(), session.id);
    return false;
  }
}

async function getOidcConfiguration(settings: OidcSettings): Promise<oidc.Configuration> {
  const key = JSON.stringify([
    settings.issuer,
    settings.clientId,
    settings.clientAuthMethod,
    settings.redirectUri,
    settings.allowInsecureHttp,
  ]);
  if (cachedConfiguration?.key === key) {
    return cachedConfiguration.value;
  }

  const clientAuth =
    settings.clientAuthMethod === 'client_secret_post'
      ? oidc.ClientSecretPost(settings.clientSecret)
      : oidc.ClientSecretBasic(settings.clientSecret);
  const configuration = await oidc.discovery(
    new URL(settings.issuer),
    settings.clientId,
    {
      redirect_uris: [settings.redirectUri],
      response_types: ['code'],
    },
    clientAuth,
    settings.allowInsecureHttp ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );

  cachedConfiguration = { key, value: configuration };
  return configuration;
}

async function ensureOidcWorkspace(settings: OidcSettings): Promise<void> {
  await getPrismaClient().workspace.upsert({
    where: { id: settings.workspaceId },
    create: {
      id: settings.workspaceId,
      name: settings.workspaceName,
      defaultTimezone: settings.defaultTimezone,
    },
    update: {},
  });
}

async function fetchOptionalUserInfo(
  configuration: oidc.Configuration,
  accessToken: string | undefined,
  idTokenClaims: oidc.IDToken,
): Promise<oidc.UserInfoResponse | null> {
  if (!accessToken || typeof idTokenClaims.sub !== 'string') {
    return null;
  }

  try {
    return await oidc.fetchUserInfo(configuration, accessToken, idTokenClaims.sub);
  } catch (err) {
    logger.warn('Failed to fetch OIDC userinfo; continuing with id_token claims', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function resolveOidcIdentity(
  settings: OidcSettings,
  configuration: oidc.Configuration,
  idTokenClaims: oidc.IDToken,
  userInfo: oidc.UserInfoResponse | null,
): OidcIdentity {
  const claims: OidcClaims = userInfo ? { ...userInfo, ...idTokenClaims } : { ...idTokenClaims };
  const issuer = firstStringClaim(idTokenClaims, ['iss']);
  if (!issuer) {
    throw new Error('OIDC id_token is missing the iss claim.');
  }

  const allowedIssuers = resolveAllowedIssuers(settings, configuration);
  if (!allowedIssuers.has(normalizeIssuer(issuer))) {
    throw new Error('OIDC id_token issuer is not allowed.');
  }

  const subject = firstStringClaim(claims, ['sub', 'oid', 'email']);
  if (!subject) {
    throw new Error('OIDC identity is missing sub, oid, and email claims.');
  }

  return {
    issuer,
    subject,
    externalSubject: `${normalizeIssuer(issuer)}|${subject}`,
    email: firstStringClaim(claims, ['email', 'preferred_username', 'upn']),
    displayName: firstStringClaim(claims, ['name', 'preferred_username', 'email']),
    initialRole: resolveOidcInitialRole(settings, claims),
  };
}

function resolveAllowedIssuers(
  settings: OidcSettings,
  configuration: oidc.Configuration,
): Set<string> {
  const configured = settings.allowedIssuers.map(normalizeIssuer);
  if (configured.length > 0) {
    return new Set(configured);
  }

  const discoveredIssuer = configuration.serverMetadata().issuer;
  return new Set(discoveredIssuer ? [normalizeIssuer(discoveredIssuer)] : [normalizeIssuer(settings.issuer)]);
}

function buildProviderLogoutUrl(
  configuration: oidc.Configuration,
  settings: OidcSettings,
  session: {
    idTokenSecretRef: string | null;
  },
): URL | null {
  if (!configuration.serverMetadata().end_session_endpoint) {
    return null;
  }

  const idToken = session.idTokenSecretRef
    ? decryptSecret(session.idTokenSecretRef, getConfig().ENCRYPTION_KEY)
    : null;
  return oidc.buildEndSessionUrl(configuration, {
    post_logout_redirect_uri: settings.postLogoutRedirectUri,
    ...(idToken ? { id_token_hint: idToken } : {}),
  });
}

async function revokeOidcSessionTokens(
  configuration: oidc.Configuration,
  session: {
    accessTokenSecretRef: string | null;
    refreshTokenSecretRef: string | null;
  },
): Promise<void> {
  if (!configuration.serverMetadata().revocation_endpoint) {
    return;
  }

  const encryptionKey = getConfig().ENCRYPTION_KEY;
  const tokens = [
    { value: session.refreshTokenSecretRef, hint: 'refresh_token' },
    { value: session.accessTokenSecretRef, hint: 'access_token' },
  ];

  for (const token of tokens) {
    if (!token.value) continue;
    try {
      await oidc.tokenRevocation(configuration, decryptSecret(token.value, encryptionKey), {
        token_type_hint: token.hint,
      });
    } catch (err) {
      logger.warn('Failed to revoke OIDC token during logout', {
        tokenTypeHint: token.hint,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function encryptToken(token: string | undefined, encryptionKey: string): string | null {
  return token ? encryptSecret(token, encryptionKey) : null;
}

function accessTokenExpiresAt(expiresIn: number | undefined): Date | null {
  return expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000);
}

function getRequiredRequestCookie(request: NextRequest, name: string): string {
  const value = request.cookies.get(name)?.value;
  if (!value) {
    throw new Error(`Missing ${name} cookie for OIDC callback.`);
  }
  return value;
}

function setWorkspaceSessionCookie(
  response: NextResponse,
  request: NextRequest,
  context: WorkspaceContext,
  maxAge: number,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializeWorkspaceContext(context),
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge,
  });
}

function setOidcCookie(
  response: NextResponse,
  request: NextRequest,
  name: string,
  value: string,
  maxAge: number,
): void {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge,
  });
}

function clearOidcTransientCookies(response: NextResponse, request: NextRequest): void {
  for (const name of [
    OIDC_STATE_COOKIE_NAME,
    OIDC_PKCE_COOKIE_NAME,
    OIDC_NONCE_COOKIE_NAME,
    OIDC_NEXT_COOKIE_NAME,
  ]) {
    clearCookie(response, request, name);
  }
}

function clearCookie(response: NextResponse, request: NextRequest, name: string): void {
  response.cookies.set({
    name,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: 0,
  });
}

function shouldUseSecureCookie(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto ?? request.nextUrl.protocol.replace(/:$/, '');

  return protocol === 'https';
}

/**
 * Behind the ingress, `request.url` reflects the pod's internal address
 * (e.g. http://localhost:8080), not the public host. Redirects built from
 * it leak that internal address to the browser, so prefer the forwarded
 * proto/host the ingress sets (mirrors proxy.ts's enforceProductionHttps).
 */
export function resolveOidcRedirectOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, '');
    return `${protocol}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

export function sanitizeOidcRedirectPath(value: string | null): string {
  const candidate = value?.trim();
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.toLowerCase().includes('%5c')
  ) {
    return DEFAULT_LOGIN_REDIRECT_PATH;
  }

  const sentinelOrigin = 'https://agile-tools.local';
  try {
    const resolved = new URL(candidate, sentinelOrigin);
    if (resolved.origin !== sentinelOrigin) {
      return DEFAULT_LOGIN_REDIRECT_PATH;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_LOGIN_REDIRECT_PATH;
  }
}

function normalizeScopes(value: string): string {
  const scopes = value.split(/\s+/).filter(Boolean);
  return scopes.includes('openid') ? scopes.join(' ') : ['openid', ...scopes].join(' ');
}

function parseDelimitedList(value: string | undefined): string[] {
  return value
    ? value
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, '');
}

function firstStringClaim(claims: OidcClaims, names: string[]): string | null {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function claimStringValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}
