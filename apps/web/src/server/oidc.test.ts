import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '@agile-tools/shared';

import { getOidcSettings, resolveOidcInitialRole } from './oidc';

const ORIGINAL_ENV = { ...process.env };

describe('OIDC settings', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/agile_tools',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SESSION_SECRET: 'session-secret-for-tests-1234567890',
      AUTH_PROVIDER: 'oidc',
      OIDC_ISSUER: 'https://idp.example.test',
      OIDC_CLIENT_ID: 'agile-tools',
      OIDC_CLIENT_SECRET: 'client-secret',
      OIDC_REDIRECT_URI: 'https://app.example.test/api/oidc/callback',
      OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.example.test/',
      OIDC_WORKSPACE_ID: 'workspace-uuid',
      OIDC_SESSION_MAX_AGE_SECONDS: '3600',
      OIDC_ADMIN_EMAILS: 'admin@example.test,owner@example.test',
      OIDC_ADMIN_CLAIM: 'groups',
      OIDC_ADMIN_CLAIM_VALUES: 'agile-tools-admins,flow-admins',
    };
    resetConfig();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('normalizes configured lists and keeps OIDC scoped to self-hosted settings', () => {
    const settings = getOidcSettings();

    expect(settings.scopes).toBe('openid profile email');
    expect(settings.adminEmails).toEqual(['admin@example.test', 'owner@example.test']);
    expect(settings.adminClaimValues).toEqual(['agile-tools-admins', 'flow-admins']);
    expect(settings.workspaceId).toBe('workspace-uuid');
    expect(settings.sessionMaxAgeSeconds).toBe(3600);
  });
});

describe('resolveOidcInitialRole', () => {
  const settings = {
    adminEmails: ['admin@example.test'],
    adminClaim: 'groups',
    adminClaimValues: ['agile-tools-admins'],
  };

  it('seeds admin from a configured email', () => {
    expect(resolveOidcInitialRole(settings, { email: 'Admin@Example.Test' })).toBe('admin');
  });

  it('seeds admin from a configured claim value', () => {
    expect(resolveOidcInitialRole(settings, { groups: ['team-a', 'agile-tools-admins'] })).toBe('admin');
  });

  it('defaults new users to member when no admin mapping matches', () => {
    expect(resolveOidcInitialRole(settings, { email: 'member@example.test', groups: ['team-a'] })).toBe('member');
  });
});
