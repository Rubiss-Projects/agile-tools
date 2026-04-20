import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '@agile-tools/shared';

import { parseWorkspaceContextCookie, serializeWorkspaceContext } from './session-cookie';

const ORIGINAL_ENV = { ...process.env };

describe('session-cookie', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/agile_tools',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SESSION_SECRET: 'session-secret-for-tests-1234567890',
    };
    resetConfig();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('round-trips a signed workspace context', () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    resetConfig();

    const cookie = serializeWorkspaceContext({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'admin',
    });

    expect(parseWorkspaceContextCookie(cookie)).toEqual({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'admin',
    });
  });

  it('rejects tampered signed cookies', () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    resetConfig();

    const cookie = serializeWorkspaceContext({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'admin',
    });

    expect(parseWorkspaceContextCookie(cookie.replace(/.$/, 'x'))).toBeNull();
  });

  it('accepts legacy unsigned cookies in test mode for route-handler tests', () => {
    const legacyCookie = Buffer.from(
      JSON.stringify({ userId: 'user-1', workspaceId: 'workspace-1', role: 'member' }),
      'utf8',
    ).toString('base64url');

    expect(parseWorkspaceContextCookie(legacyCookie)).toEqual({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'member',
    });
  });
});