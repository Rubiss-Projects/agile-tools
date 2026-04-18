import { defineConfig } from 'vitest/config';

export default defineConfig({
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
