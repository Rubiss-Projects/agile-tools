import path from 'node:path';
import type { NextConfig } from 'next';

const isProduction = process.env['NODE_ENV'] === 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self'${isProduction ? '' : ' http: https: ws:'}`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const config: NextConfig = {
  // Enable strict mode for catching potential React issues early.
  reactStrictMode: true,
  poweredByHeader: false,

  // Playwright may hit the dev server via 127.0.0.1 instead of localhost.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  turbopack: {
    // Keep module resolution anchored at the monorepo root for `next dev`.
    root: path.resolve(process.cwd(), '../..'),
  },

  // Transpile workspace packages so Next.js can resolve them.
  transpilePackages: ['@agile-tools/shared', '@agile-tools/db'],

  // Packages with native bindings or ESM-only deps that Node.js should load
  // directly rather than having Next.js bundle them.
  serverExternalPackages: ['@prisma/client', '@agile-tools/jira-client', 'pg-boss'],

  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]);
  },
};

export default config;
