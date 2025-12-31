/**
 * Jest Test Setup
 * Runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/wealthpilot_test';

// Increase timeout for slower CI environments
jest.setTimeout(30000);

// Mock console.error to reduce noise in tests
const originalError = console.error;
console.error = (...args) => {
  // Filter out expected test errors
  if (
    args[0]?.includes?.('Warning:') ||
    args[0]?.includes?.('DeprecationWarning')
  ) {
    return;
  }
  originalError.apply(console, args);
};

// Clean up after all tests
afterAll(async () => {
  // Add any cleanup logic here
});
