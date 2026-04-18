import type { NextConfig } from 'next';

const config: NextConfig = {
  // Enable strict mode for catching potential React issues early.
  reactStrictMode: true,

  // Transpile workspace packages so Next.js can resolve them.
  transpilePackages: ['@agile-tools/shared', '@agile-tools/db'],

  // Packages with native bindings or ESM-only deps that Node.js should load
  // directly rather than having Next.js bundle them.
  serverExternalPackages: ['@prisma/client', '@agile-tools/jira-client'],
};

export default config;
