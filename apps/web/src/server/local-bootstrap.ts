import type { NextRequest } from 'next/server';

import { getPrismaClient } from '@agile-tools/db';

import type { WorkspaceContext } from './auth';

function bootstrapUuid(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
}

export const LOCAL_ADMIN_IDS = {
  workspaceId: bootstrapUuid(11),
  userId: bootstrapUuid(12),
} as const;

const LOCAL_ADMIN_WORKSPACE_NAME = 'Local Workspace';
const LOCAL_ADMIN_TIMEZONE = 'UTC';

export function isLocalAdminBootstrapAvailable(): boolean {
  return process.env['NODE_ENV'] !== 'production' || process.env['ALLOW_LOCAL_BOOTSTRAP'] === 'true';
}

export function isLocalAdminBootstrapRequestAllowed(request: NextRequest): boolean {
  if (!isLocalAdminBootstrapAvailable()) return false;
  if (process.env['NODE_ENV'] !== 'production') return true;

  return isLoopbackHost(getRequestHostname(request));
}

export function getLocalAdminDefaultPath(): string {
  return '/admin/jira';
}

export function createLocalAdminSession(): WorkspaceContext {
  return {
    userId: LOCAL_ADMIN_IDS.userId,
    workspaceId: LOCAL_ADMIN_IDS.workspaceId,
    role: 'admin',
  };
}

export async function seedLocalAdminWorkspace(): Promise<{ workspaceId: string }> {
  const db = getPrismaClient();

  await db.workspace.upsert({
    where: { id: LOCAL_ADMIN_IDS.workspaceId },
    update: {
      name: LOCAL_ADMIN_WORKSPACE_NAME,
      defaultTimezone: LOCAL_ADMIN_TIMEZONE,
    },
    create: {
      id: LOCAL_ADMIN_IDS.workspaceId,
      name: LOCAL_ADMIN_WORKSPACE_NAME,
      defaultTimezone: LOCAL_ADMIN_TIMEZONE,
    },
  });

  return { workspaceId: LOCAL_ADMIN_IDS.workspaceId };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
}

function getRequestHostname(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    try {
      return new URL(`http://${forwardedHost}`).hostname;
    } catch {
      return '';
    }
  }

  return request.nextUrl.hostname;
}