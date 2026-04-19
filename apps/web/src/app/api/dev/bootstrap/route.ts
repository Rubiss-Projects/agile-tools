import { type NextRequest, NextResponse } from 'next/server';
import { createLocalDemoSession, getLocalDemoDefaultPath, isLocalDemoEnabled, seedLocalDemoWorkspace } from '@/server/dev-demo';
import { serializeWorkspaceContext, SESSION_COOKIE_NAME } from '@/server/auth';

export async function GET(request: NextRequest): Promise<Response> {
  if (!isLocalDemoEnabled()) {
    return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 });
  }

  const requestedNext = request.nextUrl.searchParams.get('next');
  const nextPath = sanitizeNextPath(requestedNext);

  await seedLocalDemoWorkspace();

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializeWorkspaceContext(createLocalDemoSession()),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

function sanitizeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return getLocalDemoDefaultPath();
  }
  return value;
}