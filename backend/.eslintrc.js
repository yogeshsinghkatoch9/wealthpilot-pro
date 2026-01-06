/**
 * ESLint Configuration for WealthPilot Pro Backend
 *
 * Rules enforce:
 * - No console.log in production (use logger service)
 * - Consistent error handling
 * - Proper async/await usage
 * - No unused variables
 */

module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: [
    'eslint:recommended'
  ],
  rules: {
    // Console statements - warn in development, error in production
    'no-console': ['warn', {
      allow: ['warn', 'error', 'info']
    }],

    // Variables
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }],
    'no-undef': 'error',

    // Best practices
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-multi-spaces': 'error',
    'no-multiple-empty-lines': ['error', { max: 2 }],

    // Async/await
    'require-await': 'warn',
    'no-async-promise-executor': 'error',
    'no-return-await': 'warn',

    // Error handling
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',

    // Code style
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'arrow-spacing': ['error', { before: true, after: true }],
    'keyword-spacing': ['error', { before: true, after: true }],
    'space-before-blocks': ['error', 'always'],
    'space-infix-ops': 'error',

    // Functions
    'no-empty-function': ['warn', {
      allow: ['constructors']
    }],
    'func-style': ['warn', 'declaration', { allowArrowFunctions: true }],

    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // Imports
    'no-duplicate-imports': 'error',

    // Complexity limits
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    'max-params': ['warn', 5],
    'complexity': ['warn', 20]
  },
  overrides: [
    // Allow console in seed scripts
    {
      files: ['**/seed*.js', '**/migrate*.js', 'prisma/**/*.js'],
      rules: {
        'no-console': 'off'
      }
    },
    // Allow longer functions in route handlers
    {
      files: ['**/routes/**/*.js'],
      rules: {
        'max-lines-per-function': ['warn', { max: 300, skipBlankLines: true, skipComments: true }]
      }
    },
    // Test files
    {
      files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js'],
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        'max-depth': 'off'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
    'prisma/migrations/**'
  ]
};
