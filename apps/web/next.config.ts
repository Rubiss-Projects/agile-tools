import type { NextConfig } from 'next';

const config: NextConfig = {
  // Enable strict mode for catching potential React issues early.
  reactStrictMode: true,

  // Transpile workspace packages so Next.js can resolve them.
  transpilePackages: ['@agile-tools/shared', '@agile-tools/db'],

  experimental: {
    // Required for server actions and React Server Components with workspace packages.
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default config;
