import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicHostedRoute = createRouteMatcher([
  '/',
  '/api/healthz',
  '/api/atlassian/oauth/callback',
  '/api/hosted/cron/sync-watchdog',
  '/api/hosted/queues/(.*)',
]);

const hostedClerkProxy = clerkMiddleware(async (auth, request) => {
  const httpsRedirect = enforceProductionHttps(request);
  if (httpsRedirect) return httpsRedirect;

  if (!isPublicHostedRoute(request)) {
    await auth.protect();
  }

  return NextResponse.next();
});

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackBypassEnabled(): boolean {
  return process.env['ALLOW_LOOPBACK_HTTP_BYPASS'] === 'true';
}

export async function proxy(
  request: NextRequest,
  event?: NextFetchEvent,
): Promise<Response> {
  if (process.env['AUTH_PROVIDER'] === 'clerk') {
    if (!event) {
      return enforceProductionHttps(request) ?? NextResponse.next();
    }
    return hostedClerkProxy(request, event) as Promise<Response>;
  }

  const httpsRedirect = enforceProductionHttps(request);
  if (httpsRedirect) return httpsRedirect;

  return NextResponse.next();
}

function enforceProductionHttps(request: NextRequest): Response | null {
  if (process.env['NODE_ENV'] !== 'production') {
    return null;
  }

  if (request.nextUrl.pathname === '/metrics' || request.nextUrl.pathname === '/metrics/') {
    return null;
  }

  if (isLoopbackBypassEnabled() && isLoopbackHost(request.nextUrl.hostname)) {
    return null;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const isHttps = forwardedProto ? forwardedProto === 'https' : request.nextUrl.protocol === 'https:';
  if (isHttps) {
    return null;
  }

  const redirectUrl = new URL(request.url);
  redirectUrl.protocol = 'https:';

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    redirectUrl.host = forwardedHost;
  }

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
