/**
 * Jest Configuration for WealthPilot Pro Frontend
 *
 * Testing TypeScript Express server with EJS templates
 */

module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',

  // Test environment
  testEnvironment: 'node',

  // Root directory
  rootDir: '.',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js'
  ],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/server*.ts',
    '!src/hooks/**',
    '!src/store/**',
    '!src/api/dataService.js',
    '!src/components/**',
    '!**/node_modules/**'
  ],

  // Coverage thresholds for tested modules
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 50,
      statements: 50
    },
    './src/utils/formatters.js': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95
    },
    './src/api/client.js': {
      branches: 50,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './src/middleware/auth.js': {
      branches: 60,
      functions: 40,
      lines: 60,
      statements: 60
    }
  },

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Transform configuration - handle both TS and JS files
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }],
    '^.+\\.(js|jsx)$': ['babel-jest', {
      presets: ['@babel/preset-env']
    }]
  },

  // Transform ES modules in source files
  transformIgnorePatterns: [
    '/node_modules/'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/setup.ts'
  ],

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Timeout for tests
  testTimeout: 10000
};
