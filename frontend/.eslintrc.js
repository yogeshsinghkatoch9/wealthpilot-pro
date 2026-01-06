/**
 * ESLint Configuration for WealthPilot Pro Frontend
 *
 * TypeScript-aware rules for Express + EJS server
 */

module.exports = {
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    // Console statements - warn only (frontend may need some logging)
    'no-console': ['warn', {
      allow: ['warn', 'error', 'info']
    }],

    // TypeScript specific
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // Best practices
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-var': 'error',
    'prefer-const': 'error',

    // Code style
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],

    // Async/await
    'no-async-promise-executor': 'error',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/await-thenable': 'error',

    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error'
  },
  overrides: [
    // JavaScript files (non-TypeScript)
    {
      files: ['**/*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'public/js/lib/',
    '*.min.js',
    '*.d.ts'
  ]
};
