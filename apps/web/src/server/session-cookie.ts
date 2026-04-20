/* global Buffer */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { getConfig } from '@agile-tools/shared';

export type WorkspaceRole = 'admin' | 'member';

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

const SESSION_COOKIE_VERSION = 'v1';

export function serializeWorkspaceContext(context: WorkspaceContext): string {
  const payload = Buffer.from(JSON.stringify(context), 'utf8').toString('base64url');
  const signature = signPayload(payload);

  return `${SESSION_COOKIE_VERSION}.${payload}.${signature}`;
}

export function parseWorkspaceContextCookie(value: string): WorkspaceContext | null {
  const parts = value.split('.');

  if (parts.length === 3 && parts[0] === SESSION_COOKIE_VERSION) {
    const [, payload, signature] = parts;
    if (!payload || !signature || !isSignatureValid(payload, signature)) {
      return null;
    }

    return parsePayload(payload);
  }

  if (process.env['NODE_ENV'] === 'test') {
    return parsePayload(value);
  }

  return null;
}

function parsePayload(payload: string): WorkspaceContext | null {
  const parsed = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as unknown;

  if (!isValidPayload(parsed)) return null;
  return parsed;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function isSignatureValid(payload: string, signature: string): boolean {
  const actual = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(signPayload(payload), 'base64url');

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function getSessionSecret(): string {
  const { SESSION_SECRET } = getConfig();
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be configured for signed session cookies.');
  }

  return SESSION_SECRET;
}

function isValidPayload(value: unknown): value is WorkspaceContext {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['userId'] === 'string' &&
    typeof obj['workspaceId'] === 'string' &&
    (obj['role'] === 'admin' || obj['role'] === 'member')
  );
}