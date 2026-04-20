import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { resetConfig } from '@agile-tools/shared';

vi.mock('@/server/dev-demo', () => ({
  createLocalDemoSession: vi.fn(),
  getLocalDemoDefaultPath: vi.fn(),
  isLocalDemoEnabled: vi.fn(),
  seedLocalDemoWorkspace: vi.fn(),
}));

const { POST } = await import('./route');
const {
  createLocalDemoSession,
  getLocalDemoDefaultPath,
  isLocalDemoEnabled,
  seedLocalDemoWorkspace,
} = await import('@/server/dev-demo');

const ORIGINAL_ENV = { ...process.env };

describe('POST /api/dev/bootstrap', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/agile_tools',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SESSION_SECRET: 'bootstrap-session-secret-1234567890',
    };
    resetConfig();

    vi.mocked(isLocalDemoEnabled).mockReturnValue(true);
    vi.mocked(getLocalDemoDefaultPath).mockReturnValue('/scopes/demo');
    vi.mocked(createLocalDemoSession).mockReturnValue({
      userId: 'demo-user',
      workspaceId: 'demo-workspace',
      role: 'admin',
    });
    vi.mocked(seedLocalDemoWorkspace).mockResolvedValue({ scopeId: 'demo-scope' });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    resetConfig();
  });

  it('sets the signed session cookie and redirects to the requested path', async () => {
    const formData = new FormData();
    formData.set('next', '/admin/jira');

    const response = await POST(
      new NextRequest('http://localhost/api/dev/bootstrap', {
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

  it('falls back to the default path when next is invalid', async () => {
    const formData = new FormData();
    formData.set('next', 'https://evil.example.com');

    const response = await POST(
      new NextRequest('http://localhost/api/dev/bootstrap', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
        body: formData,
      }),
    );

    expect(response.headers.get('location')).toBe('http://localhost/scopes/demo');
  });
});