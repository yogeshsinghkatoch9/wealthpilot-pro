/**
 * WealthPilot Pro - Test Setup
 * Global test configuration, fixtures, and utilities
 */

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.EMAIL_PROVIDER = 'test';

// Mock external services
jest.mock('../src/services/marketData', () => ({
  getQuote: jest.fn().mockResolvedValue({
    symbol: 'AAPL',
    price: 175.50,
    change: 2.50,
    changePercent: 1.45,
    volume: 45000000,
    previousClose: 173.00
  }),
  getBatchQuotes: jest.fn().mockResolvedValue({
    AAPL: { price: 175.50, change: 2.50 },
    MSFT: { price: 380.00, change: -1.20 },
    GOOGL: { price: 140.00, change: 0.75 }
  }),
  getHistoricalPrices: jest.fn().mockResolvedValue([
    { date: '2024-12-01', close: 170.00 },
    { date: '2024-12-02', close: 172.50 },
    { date: '2024-12-03', close: 175.50 }
  ])
}));

jest.mock('../src/services/emailService', () => ({
  initialize: jest.fn().mockResolvedValue(true),
  send: jest.fn().mockResolvedValue({ success: true, messageId: 'test-msg-id' }),
  queueEmail: jest.fn().mockReturnValue('queue-id'),
  sendBulk: jest.fn().mockResolvedValue([])
}));

// In-memory test database
const testDb = {
  users: new Map(),
  portfolios: new Map(),
  holdings: new Map(),
  transactions: new Map(),
  alerts: new Map(),
  watchlists: new Map(),
  auditLogs: new Map(),
  notificationLogs: new Map()
};

// Test data generators
const generateId = () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const randomString = (length = 10) => Math.random().toString(36).substr(2, length);

// Global test fixtures
global.testFixtures = {
  user: {
    id: 'user-test-001',
    email: 'test@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv', // bcrypt hash
    name: 'Test User',
    role: 'USER',
    preferences: {},
    createdAt: new Date().toISOString()
  },
  advisor: {
    id: 'advisor-test-001',
    email: 'advisor@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv',
    name: 'Test Advisor',
    role: 'ADVISOR',
    preferences: {},
    createdAt: new Date().toISOString()
  },
  admin: {
    id: 'admin-test-001',
    email: 'admin@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv',
    name: 'Test Admin',
    role: 'ADMIN',
    preferences: {},
    createdAt: new Date().toISOString()
  },
  portfolio: {
    id: 'portfolio-test-001',
    userId: 'user-test-001',
    name: 'Test Portfolio',
    description: 'A test portfolio',
    currency: 'USD',
    benchmark: 'SPY',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  holding: {
    id: 'holding-test-001',
    portfolioId: 'portfolio-test-001',
    symbol: 'AAPL',
    shares: 100,
    costBasis: 15000,
    purchaseDate: '2024-01-15',
    createdAt: new Date().toISOString()
  },
  transaction: {
    id: 'transaction-test-001',
    portfolioId: 'portfolio-test-001',
    holdingId: 'holding-test-001',
    type: 'BUY',
    symbol: 'AAPL',
    shares: 100,
    price: 150.00,
    date: '2024-01-15',
    createdAt: new Date().toISOString()
  },
  alert: {
    id: 'alert-test-001',
    userId: 'user-test-001',
    symbol: 'AAPL',
    type: 'above',
    targetPrice: 180.00,
    isActive: true,
    triggered: false,
    createdAt: new Date().toISOString()
  },
  watchlist: {
    id: 'watchlist-test-001',
    userId: 'user-test-001',
    name: 'Tech Stocks',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'NVDA'],
    createdAt: new Date().toISOString()
  }
};

// Test database helpers
global.testDb = {
  clear: () => {
    testDb.users.clear();
    testDb.portfolios.clear();
    testDb.holdings.clear();
    testDb.transactions.clear();
    testDb.alerts.clear();
    testDb.watchlists.clear();
    testDb.auditLogs.clear();
    testDb.notificationLogs.clear();
  },
  seed: () => {
    testDb.users.set(global.testFixtures.user.id, { ...global.testFixtures.user });
    testDb.users.set(global.testFixtures.advisor.id, { ...global.testFixtures.advisor });
    testDb.users.set(global.testFixtures.admin.id, { ...global.testFixtures.admin });
    testDb.portfolios.set(global.testFixtures.portfolio.id, { ...global.testFixtures.portfolio });
    testDb.holdings.set(global.testFixtures.holding.id, { ...global.testFixtures.holding });
    testDb.transactions.set(global.testFixtures.transaction.id, { ...global.testFixtures.transaction });
    testDb.alerts.set(global.testFixtures.alert.id, { ...global.testFixtures.alert });
    testDb.watchlists.set(global.testFixtures.watchlist.id, { ...global.testFixtures.watchlist });
  },
  getDb: () => testDb
};

// Mock request/response helpers
global.mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ip: '127.0.0.1',
  get: jest.fn(),
  ...overrides
});

global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

global.mockNext = jest.fn();

// Async test helpers
global.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility exports
global.generateId = generateId;
global.randomString = randomString;

// JWT helper for tests
const jwt = require('jsonwebtoken');
global.generateTestToken = (user = global.testFixtures.user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Setup and teardown
beforeAll(async () => {
  global.testDb.seed();
});

afterAll(async () => {
  global.testDb.clear();
  jest.clearAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any resources
});

// Custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
      pass
    };
  },
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be within range ${floor} - ${ceiling}`,
      pass
    };
  },
  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
      pass
    };
  },
  toBeValidISODate(received) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime());
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid ISO date`,
      pass
    };
  }
});

console.log('🧪 Test environment initialized');

// Test suite must contain at least one test
describe('Test Environment', () => {
  it('should initialize test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(global.testFixtures).toBeDefined();
    expect(global.testDb).toBeDefined();
  });
});
