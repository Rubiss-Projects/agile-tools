import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest): Response {
  if (process.env['NODE_ENV'] !== 'production') {
    return NextResponse.next();
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const isHttps = forwardedProto ? forwardedProto === 'https' : request.nextUrl.protocol === 'https:';
  if (isHttps) {
    return NextResponse.next();
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