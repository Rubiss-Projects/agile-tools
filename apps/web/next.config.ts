import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Enable strict mode for catching potential React issues early.
  reactStrictMode: true,

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
};

export default config;
