import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/dev-demo', () => ({
  createLocalDemoSession: vi.fn(),
  getLocalDemoDefaultPath: vi.fn(),
  isLocalDemoEnabled: vi.fn(),
  seedLocalDemoWorkspace: vi.fn(),
}));

vi.mock('@/server/local-bootstrap', () => ({
  createLocalAdminSession: vi.fn(),
  getLocalAdminDefaultPath: vi.fn(),
  isLocalAdminBootstrapRequestAllowed: vi.fn(),
  seedLocalAdminWorkspace: vi.fn(),
}));

const { POST } = await import('./route');
const {
  createLocalAdminSession,
  getLocalAdminDefaultPath,
  isLocalAdminBootstrapRequestAllowed,
  seedLocalAdminWorkspace,
} = await import('@/server/local-bootstrap');

const ORIGINAL_ENV = { ...process.env };

describe('POST /api/local/bootstrap', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/agile_tools',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SESSION_SECRET: 'bootstrap-session-secret-1234567890',
    };

    vi.mocked(isLocalAdminBootstrapRequestAllowed).mockReturnValue(true);
    vi.mocked(getLocalAdminDefaultPath).mockReturnValue('/admin/jira');
    vi.mocked(createLocalAdminSession).mockReturnValue({
      userId: 'admin-user',
      workspaceId: 'admin-workspace',
      role: 'admin',
    });
    vi.mocked(seedLocalAdminWorkspace).mockResolvedValue({ workspaceId: 'admin-workspace' });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('creates a local admin session and redirects to the requested path', async () => {
    const formData = new FormData();
    formData.set('mode', 'admin');
    formData.set('next', '/admin/jira');

    const response = await POST(
      new NextRequest('http://localhost/api/local/bootstrap', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
        body: formData,
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/admin/jira');

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('agile_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
  });

  it('returns 404 when the local admin bootstrap flow is not enabled', async () => {
    vi.mocked(isLocalAdminBootstrapRequestAllowed).mockReturnValue(false);

    const formData = new FormData();
    formData.set('mode', 'admin');

    const response = await POST(
      new NextRequest('http://localhost/api/local/bootstrap', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
        body: formData,
      }),
    );

    expect(response.status).toBe(404);
  });
});