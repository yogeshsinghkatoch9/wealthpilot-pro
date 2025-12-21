/**
 * Jest Test Setup for WealthPilot Pro
 * Global test configuration and utilities
 */

const Database = require('better-sqlite3');

// Global test database
let testDb = null;

// Test user data
global.testUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  password: 'hashedpassword123',
  name: 'Test User',
  role: 'user'
};

// Test portfolio data
global.testPortfolio = {
  id: 'test-portfolio-123',
  name: 'Test Portfolio',
  description: 'A test portfolio',
  userId: 'test-user-123'
};

// Test holding data
global.testHolding = {
  id: 'test-holding-123',
  portfolioId: 'test-portfolio-123',
  symbol: 'AAPL',
  shares: 100,
  costBasis: 150.00,
  currentPrice: 175.00
};

/**
 * Setup test database
 */
global.setupTestDatabase = async () => {
  testDb = new Database(':memory:');

  // Create tables
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      notification_preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      cost_basis REAL,
      current_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      shares REAL NOT NULL,
      price REAL NOT NULL,
      date DATETIME NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL,
      target_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      symbols TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      data TEXT,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return testDb;
};

/**
 * Cleanup test database
 */
global.cleanupTestDatabase = async () => {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
};

/**
 * Get test database
 */
global.getTestDb = () => testDb;

/**
 * Seed test data
 */
global.seedTestData = async () => {
  const db = global.getTestDb();
  if (!db) return;

  // Insert test user
  db.prepare(`
    INSERT INTO users (id, email, password, name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    global.testUser.id,
    global.testUser.email,
    global.testUser.password,
    global.testUser.name,
    global.testUser.role
  );

  // Insert test portfolio
  db.prepare(`
    INSERT INTO portfolios (id, user_id, name, description)
    VALUES (?, ?, ?, ?)
  `).run(
    global.testPortfolio.id,
    global.testPortfolio.userId,
    global.testPortfolio.name,
    global.testPortfolio.description
  );

  // Insert test holding
  db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, shares, cost_basis, current_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    global.testHolding.id,
    global.testHolding.portfolioId,
    global.testHolding.symbol,
    global.testHolding.shares,
    global.testHolding.costBasis,
    global.testHolding.currentPrice
  );
};

/**
 * Clear test data
 */
global.clearTestData = async () => {
  const db = global.getTestDb();
  if (!db) return;

  db.exec(`
    DELETE FROM notification_logs;
    DELETE FROM audit_logs;
    DELETE FROM alerts;
    DELETE FROM watchlists;
    DELETE FROM transactions;
    DELETE FROM holdings;
    DELETE FROM portfolios;
    DELETE FROM users;
  `);
};

/**
 * Mock JWT token
 */
global.mockAuthToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlci0xMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MDAwMDAwMDB9.mock';

/**
 * Create mock request object
 */
global.mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: global.testUser,
  headers: {
    'authorization': global.mockAuthToken,
    'content-type': 'application/json'
  },
  ip: '127.0.0.1',
  get: (header) => this.headers?.[header.toLowerCase()],
  ...overrides
});

/**
 * Create mock response object
 */
global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Wait utility for async tests
 */
global.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate random string for tests
 */
global.randomString = (length = 10) => {
  return Math.random().toString(36).substring(2, length + 2);
};

/**
 * Generate UUID for tests
 */
global.generateId = () => {
  return 'test-' + Date.now() + '-' + global.randomString(8);
};

// Suppress console output during tests (optional)
// Uncomment to hide console logs during testing
// console.log = jest.fn();
// console.error = jest.fn();
// console.warn = jest.fn();

// Global timeout for all tests
jest.setTimeout(10000);

// Cleanup after all tests
afterAll(async () => {
  await global.cleanupTestDatabase();
});
