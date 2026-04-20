import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { createWorkspacePackageAliases } from '../../support/workspace-package-aliases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  resolve: {
    alias: createWorkspacePackageAliases(repoRoot),
  },
  test: {
    include: ['tests/integration/performance/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    globals: false,
    // Performance tests spin up Testcontainers and seed large datasets.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Single-fork: Testcontainer instances are expensive; run sequentially.
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
