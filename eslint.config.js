import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.tsbuildinfo',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/*.d.ts',
      'eslint.config.js',
      '**/*.config.{js,ts,mjs,cjs}',
      'packages/takuhon/**',
      'packages/create-takuhon/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./packages/*/tsconfig.json'],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/no-named-as-default-member': 'off',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },
  // CLI / Node runtime
  {
    files: ['packages/cli/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Core: runtime-agnostic (no DOM, no Node specifics)
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.es2022 },
    },
  },
  // API: Hono, runs on Workers / Node / Bun / Deno
  {
    files: ['packages/api/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.worker, ...globals.node, ...globals.serviceworker },
    },
  },
  // UI + playground: browser globals (covers both .ts and .tsx)
  {
    files: ['packages/ui/**/*.{ts,tsx}', 'apps/playground/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // UI + playground: React rules only on .tsx (JSX-bearing files)
  {
    files: ['packages/ui/**/*.tsx', 'apps/playground/**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19.2' } },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  // Adapters: Cloudflare = Workers; Vercel = Node + Edge; WordPress = mixed
  {
    files: ['adapters/cloudflare/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.worker, ...globals.serviceworker },
    },
  },
  {
    files: ['adapters/vercel/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Tests: allow Vitest globals + Node
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // Config files (CommonJS / Node scripts in root)
  {
    files: ['*.config.{js,ts,mjs,cjs}', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettierConfig,
);
