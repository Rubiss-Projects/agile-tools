import { type NextRequest, NextResponse } from 'next/server';

import {
  createLocalAdminSession,
  getLocalAdminDefaultPath,
  isLocalAdminBootstrapRequestAllowed,
  seedLocalAdminWorkspace,
} from './local-bootstrap';
import {
  createLocalDemoSession,
  getLocalDemoDefaultPath,
  isLocalDemoEnabled,
  seedLocalDemoWorkspace,
} from './dev-demo';
import { setWorkspaceSessionCookie } from './auth';
import { assertTrustedMutationRequest, enforceRateLimit } from './request-security';

export type LocalBootstrapMode = 'admin' | 'demo';

export async function handleLocalBootstrapRequest(
  request: NextRequest,
  modeOverride?: LocalBootstrapMode,
): Promise<Response> {
  assertTrustedMutationRequest(request);

  const formData = await request.formData().catch(() => null);
  const requestedMode = formData ? formData.get('mode') : null;
  const requestedNextPath = formData ? formData.get('next') : null;
  const mode = modeOverride ?? parseMode(requestedMode);
  const nextPath = sanitizeNextPath(requestedNextPath);

  enforceRateLimit(request, {
    bucket: `local-bootstrap:${mode}`,
    max: 20,
    windowMs: 5 * 60_000,
  });

  if (mode === 'demo') {
    if (!isLocalDemoEnabled()) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 });
    }

    await seedLocalDemoWorkspace();

    const response = NextResponse.redirect(new URL(nextPath ?? getLocalDemoDefaultPath(), request.url));
    setWorkspaceSessionCookie(response, request, createLocalDemoSession());
    return response;
  }

  if (!isLocalAdminBootstrapRequestAllowed(request)) {
    return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 });
  }

  await seedLocalAdminWorkspace();

  const response = NextResponse.redirect(new URL(nextPath ?? getLocalAdminDefaultPath(), request.url));
  setWorkspaceSessionCookie(response, request, createLocalAdminSession());
  return response;
}

function parseMode(value: FormDataEntryValue | null): LocalBootstrapMode {
  return value === 'demo' ? 'demo' : 'admin';
}

function sanitizeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  return value;
}