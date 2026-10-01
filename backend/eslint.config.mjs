// AMENDED 2026-09-27 (tech-stack.md v1.1, QA-01 lint script): backend never
// had ESLint configured at all before this. Flat config (eslint.config.mjs)
// matches what @nestjs/cli 11 scaffolds by default, and eslint/typescript-eslint
// are both on csmju2030-standards' allowed_dev_tooling list.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      // Nest's own DI/decorator patterns rely on these; matches @nestjs/cli's
      // own default generated eslint config for the same reason.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
