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
    // Deprecated APIs are refused in new code. The rule needs type information,
    // so each package has a tsconfig.eslint.json that also covers its tests and
    // config files; tsc never builds it.
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['packages/*/tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
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
