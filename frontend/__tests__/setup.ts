/**
 * Jest Test Setup
 * Global configuration and mocks for all tests
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.API_URL = 'http://localhost:4000';

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  }
});

// Global test utilities
export const mockApiResponse = (data: unknown, status = 200) => ({
  data,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: {},
  config: {}
});

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User'
};

export const mockPortfolio = {
  id: 'test-portfolio-id',
  name: 'Test Portfolio',
  description: 'Test portfolio description',
  currency: 'USD',
  cashBalance: 10000,
  totalValue: 50000
};

export const mockHolding = {
  id: 'test-holding-id',
  portfolioId: 'test-portfolio-id',
  symbol: 'AAPL',
  shares: 100,
  avgCost: 150.00,
  currentPrice: 175.00,
  value: 17500,
  gain: 2500,
  gainPercent: 16.67
};

export const mockAlert = {
  id: 'test-alert-id',
  symbol: 'AAPL',
  type: 'price_above',
  condition: { price: 200 },
  isActive: true,
  message: 'AAPL above $200'
};

export const mockWatchlist = {
  id: 'test-watchlist-id',
  name: 'Tech Stocks',
  description: 'Technology sector stocks',
  items: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' }
  ]
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
