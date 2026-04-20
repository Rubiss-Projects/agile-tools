import { defineConfig } from 'vitest/config';

export default defineConfig({
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
