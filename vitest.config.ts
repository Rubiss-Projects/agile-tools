import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live alongside source files (*.test.ts, *.spec.ts)
    include: ['packages/*/src/**/*.{test,spec}.{ts,tsx}', 'apps/*/src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.d.ts', '**/dist/**'],
    },
  },
});
