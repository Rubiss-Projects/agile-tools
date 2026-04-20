import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkspacePackageAliases } from '../support/workspace-package-aliases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// next is installed only in apps/web; resolve it for contract tests that
// import route handlers which in turn import from next/server or next/headers.
const nextDir = path.resolve(repoRoot, 'apps/web/node_modules/next');

export default defineConfig({
  resolve: {
    // Route handlers in apps/web/src use the `@/*` alias mapped to `./src/*`.
    // Provide the same alias here so contract test imports resolve correctly.
    alias: [
      ...createWorkspacePackageAliases(repoRoot),
      {
        find: '@',
        replacement: path.resolve(repoRoot, 'apps/web/src'),
      },
      {
        find: 'next/server',
        replacement: path.join(nextDir, 'server.js'),
      },
      {
        find: 'next/headers',
        replacement: path.join(nextDir, 'headers.js'),
      },
      {
        find: 'next/navigation',
        replacement: path.join(nextDir, 'navigation.js'),
      },
      {
        find: 'next/cache',
        replacement: path.join(nextDir, 'cache.js'),
      },
    ],
  },
  test: {
    include: ['tests/contract/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    globals: false,
    // Contract tests use MSW to mock Jira and a real Postgres via Testcontainers.
    // They are slower than unit tests and require Docker.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
