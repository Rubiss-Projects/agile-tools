import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConfigMock, getWorkspaceContextMock, redirectMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getWorkspaceContextMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@agile-tools/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agile-tools/shared')>()),
  getConfig: getConfigMock,
}));
vi.mock('@/server/auth', () => ({ getWorkspaceContext: getWorkspaceContextMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import AdminJiraPage from './page';

describe('AdminJiraPage session recovery', () => {
  beforeEach(() => {
    getWorkspaceContextMock.mockResolvedValue(null);
    redirectMock.mockReset();
  });

  it('starts OIDC login when auto-login is enabled', async () => {
    getConfigMock.mockReturnValue({
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'true',
      JIRA_CONNECTION_POLICY: 'self_hosted_tokens',
    });
    redirectMock.mockImplementation(() => {
      throw new Error('redirected');
    });

    await expect(AdminJiraPage()).rejects.toThrow('redirected');
    expect(redirectMock).toHaveBeenCalledWith('/api/oidc/login?next=%2Fadmin%2Fjira');
  });

  it('keeps the authentication panel when auto-login is disabled', async () => {
    getConfigMock.mockReturnValue({
      AUTH_PROVIDER: 'oidc',
      OIDC_AUTO_LOGIN: 'false',
      JIRA_CONNECTION_POLICY: 'self_hosted_tokens',
    });

    await expect(AdminJiraPage()).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
