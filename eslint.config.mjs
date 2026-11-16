import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/dist-test/',
      '**/build/',
      '**/cdk.out/',
      '**/coverage/',
      '*.js',
      '*.cjs',
      '*.mjs',
      'scripts/',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // CloudFront Functions are plain scripts the edge runtime loads and calls
    // by convention: `handler` is the entry point, never imported, and the
    // file must stay module-free (contracts/csp-and-hosting.md § SPA routing).
    files: ['packages/infra/lib/functions/*.js'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
