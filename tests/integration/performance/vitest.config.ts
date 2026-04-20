import { defineConfig } from 'vitest/config';

export default defineConfig({
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
