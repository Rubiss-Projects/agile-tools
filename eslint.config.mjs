import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  {
    // Node.js globals for the worker process (process, console, Buffer, etc.)
    files: ['apps/worker/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Browser globals for Next.js web app client components
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // eslint-plugin-react-hooks@4.x is incompatible with ESLint 9 for
    // exhaustive-deps: context.getSource() was removed. Disable the crashing
    // rule for files that use useEffect/useCallback until the plugin is
    // upgraded to v5.
    files: [
      'apps/web/src/components/flow/flow-analytics-section.tsx',
      'apps/web/src/components/flow/work-item-detail-drawer.tsx',
      'apps/web/src/components/admin/hold-definition-form.tsx',
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    ignores: [
      '**/.next/**',
      '**/dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'apps/web/next-env.d.ts',
    ],
  },
];
