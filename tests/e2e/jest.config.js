/**
 * Jest Configuration for E2E Tests
 * Tests against live API endpoints
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: ['**/*.test.js'],

  // Timeout for E2E tests (longer than unit tests)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Run tests serially to avoid race conditions
  maxWorkers: 1,

  // Clear mocks between tests
  clearMocks: true,

  // Globals
  globals: {
    API_URL: process.env.API_URL || 'http://localhost:4000'
  }
};
