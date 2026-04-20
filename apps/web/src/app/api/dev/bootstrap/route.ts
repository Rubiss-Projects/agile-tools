import { type NextRequest, NextResponse } from 'next/server';
import { createLocalDemoSession, getLocalDemoDefaultPath, isLocalDemoEnabled, seedLocalDemoWorkspace } from '@/server/dev-demo';
import { serializeWorkspaceContext, SESSION_COOKIE_NAME } from '@/server/auth';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';

export async function POST(request: NextRequest): Promise<Response> {
  if (!isLocalDemoEnabled()) {
    return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 });
  }

  assertTrustedMutationRequest(request);
  enforceRateLimit(request, {
    bucket: 'dev-bootstrap',
    max: 10,
    windowMs: 60_000,
  });

  const formData = await request.formData().catch(() => null);
  const requestedNext = formData ? formData.get('next') : null;
  const nextPath = sanitizeNextPath(requestedNext);

  await seedLocalDemoWorkspace();

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializeWorkspaceContext(createLocalDemoSession()),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

function sanitizeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') {
    return getLocalDemoDefaultPath();
  }

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return getLocalDemoDefaultPath();
  }
  return value;
}