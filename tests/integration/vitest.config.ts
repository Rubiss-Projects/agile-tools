import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { createWorkspacePackageAliases } from '../support/workspace-package-aliases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  resolve: {
    alias: createWorkspacePackageAliases(repoRoot),
  },
  test: {
    include: [
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
      '!tests/integration/performance/**',
    ],
    environment: 'node',
    globals: false,
    // Integration tests spin up a real Postgres via Testcontainers.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Run integration tests sequentially to avoid port conflicts between
    // Testcontainer instances started in the same process.
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
