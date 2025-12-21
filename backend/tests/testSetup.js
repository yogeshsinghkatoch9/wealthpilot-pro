/**
 * WealthPilot Pro - Test Configuration & Mocks
 * Comprehensive test setup for all test suites
 */

const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.ALPHA_VANTAGE_API_KEY = 'test-api-key';

/**
 * Mock Database
 */
class MockDatabase {
  constructor() {
    this.users = new Map();
    this.portfolios = new Map();
    this.holdings = new Map();
    this.transactions = new Map();
    this.alerts = new Map();
    this.watchlists = new Map();
    this.sessions = new Map();
    this.auditLogs = [];
    
    this.idCounter = 1;
  }

  generateId() {
    return `test-id-${this.idCounter++}`;
  }

  // User methods
  async createUser(data) {
    const id = this.generateId();
    const user = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      isVerified: false
    };
    this.users.set(id, user);
    return user;
  }

  async getUserById(id) {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email) {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async updateUser(id, data) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id) {
    return this.users.delete(id);
  }

  // Portfolio methods
  async createPortfolio(data) {
    const id = this.generateId();
    const portfolio = {
      id,
      ...data,
      cashBalance: data.cashBalance || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.portfolios.set(id, portfolio);
    return portfolio;
  }

  async getPortfolioById(id) {
    return this.portfolios.get(id) || null;
  }

  async getPortfoliosByUserId(userId) {
    const portfolios = [];
    for (const p of this.portfolios.values()) {
      if (p.userId === userId) portfolios.push(p);
    }
    return portfolios;
  }

  async updatePortfolio(id, data) {
    const portfolio = this.portfolios.get(id);
    if (!portfolio) return null;
    const updated = { ...portfolio, ...data, updatedAt: new Date() };
    this.portfolios.set(id, updated);
    return updated;
  }

  async deletePortfolio(id) {
    return this.portfolios.delete(id);
  }

  // Holding methods
  async createHolding(data) {
    const id = this.generateId();
    const holding = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.holdings.set(id, holding);
    return holding;
  }

  async getHoldingById(id) {
    return this.holdings.get(id) || null;
  }

  async getHoldingsByPortfolioId(portfolioId) {
    const holdings = [];
    for (const h of this.holdings.values()) {
      if (h.portfolioId === portfolioId) holdings.push(h);
    }
    return holdings;
  }

  async getHoldingBySymbol(portfolioId, symbol) {
    for (const h of this.holdings.values()) {
      if (h.portfolioId === portfolioId && h.symbol === symbol) return h;
    }
    return null;
  }

  async updateHolding(id, data) {
    const holding = this.holdings.get(id);
    if (!holding) return null;
    const updated = { ...holding, ...data, updatedAt: new Date() };
    this.holdings.set(id, updated);
    return updated;
  }

  async deleteHolding(id) {
    return this.holdings.delete(id);
  }

  // Transaction methods
  async createTransaction(data) {
    const id = this.generateId();
    const transaction = {
      id,
      ...data,
      createdAt: new Date()
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async getTransactionsByPortfolioId(portfolioId, options = {}) {
    const transactions = [];
    for (const t of this.transactions.values()) {
      if (t.portfolioId === portfolioId) transactions.push(t);
    }
    return transactions.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
  }

  // Alert methods
  async createAlert(data) {
    const id = this.generateId();
    const alert = {
      id,
      ...data,
      isActive: true,
      isTriggered: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.alerts.set(id, alert);
    return alert;
  }

  async getAlertsByUserId(userId) {
    const alerts = [];
    for (const a of this.alerts.values()) {
      if (a.userId === userId) alerts.push(a);
    }
    return alerts;
  }

  // Watchlist methods
  async createWatchlist(data) {
    const id = this.generateId();
    const watchlist = {
      id,
      ...data,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.watchlists.set(id, watchlist);
    return watchlist;
  }

  async getWatchlistsByUserId(userId) {
    const watchlists = [];
    for (const w of this.watchlists.values()) {
      if (w.userId === userId) watchlists.push(w);
    }
    return watchlists;
  }

  // Session methods
  async createSession(data) {
    const id = this.generateId();
    const session = {
      id,
      ...data,
      createdAt: new Date()
    };
    this.sessions.set(data.token, session);
    return session;
  }

  async getSessionByToken(token) {
    return this.sessions.get(token) || null;
  }

  async deleteSession(token) {
    return this.sessions.delete(token);
  }

  // Audit log methods
  async createAuditLog(data) {
    const log = {
      id: this.generateId(),
      ...data,
      createdAt: new Date()
    };
    this.auditLogs.push(log);
    return log;
  }

  async getAuditLogs(options = {}) {
    let logs = [...this.auditLogs];
    if (options.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }
    if (options.action) {
      logs = logs.filter(l => l.action === options.action);
    }
    return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Reset for tests
  reset() {
    this.users.clear();
    this.portfolios.clear();
    this.holdings.clear();
    this.transactions.clear();
    this.alerts.clear();
    this.watchlists.clear();
    this.sessions.clear();
    this.auditLogs = [];
    this.idCounter = 1;
  }
}

/**
 * Mock Market Data Service
 */
class MockMarketDataService {
  constructor() {
    this.quotes = {
      'AAPL': { price: 175.50, change: 2.30, changePercent: 1.33 },
      'GOOGL': { price: 140.25, change: -1.50, changePercent: -1.06 },
      'MSFT': { price: 378.90, change: 5.20, changePercent: 1.39 },
      'AMZN': { price: 178.35, change: 3.10, changePercent: 1.77 },
      'TSLA': { price: 248.50, change: -8.20, changePercent: -3.19 },
      'SPY': { price: 475.50, change: 4.30, changePercent: 0.91 }
    };
  }

  async getQuote(symbol) {
    const quote = this.quotes[symbol.toUpperCase()];
    if (!quote) {
      return {
        symbol,
        price: 100 + Math.random() * 100,
        change: (Math.random() - 0.5) * 10,
        changePercent: (Math.random() - 0.5) * 5
      };
    }
    return { symbol, ...quote };
  }

  async getBatchQuotes(symbols) {
    const quotes = {};
    for (const symbol of symbols) {
      quotes[symbol] = await this.getQuote(symbol);
    }
    return quotes;
  }

  async getHistoricalData(symbol, period = '1Y') {
    const data = [];
    const days = period === '1M' ? 30 : period === '3M' ? 90 : period === '1Y' ? 365 : 30;
    let price = 150;

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      price = price * (1 + (Math.random() - 0.48) * 0.03);
      data.push({
        date: date.toISOString().split('T')[0],
        open: price * 0.99,
        high: price * 1.02,
        low: price * 0.98,
        close: price,
        volume: Math.floor(Math.random() * 10000000)
      });
    }
    return data;
  }
}

/**
 * Mock Email Service
 */
class MockEmailService {
  constructor() {
    this.sentEmails = [];
  }

  async send(options) {
    this.sentEmails.push({
      ...options,
      sentAt: new Date()
    });
    return { success: true, messageId: `test-${Date.now()}` };
  }

  async initialize() {
    return true;
  }

  getSentEmails() {
    return this.sentEmails;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }
}

/**
 * Test Utilities
 */
const testUtils = {
  /**
   * Create a test user
   */
  createTestUser(overrides = {}) {
    return {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      ...overrides
    };
  },

  /**
   * Create a test portfolio
   */
  createTestPortfolio(userId, overrides = {}) {
    return {
      userId,
      name: `Test Portfolio ${Date.now()}`,
      description: 'Test portfolio description',
      currency: 'USD',
      benchmark: 'SPY',
      ...overrides
    };
  },

  /**
   * Create a test holding
   */
  createTestHolding(portfolioId, overrides = {}) {
    return {
      portfolioId,
      symbol: 'AAPL',
      shares: 100,
      avgCostBasis: 150.00,
      sector: 'Technology',
      assetType: 'stock',
      ...overrides
    };
  },

  /**
   * Create a test transaction
   */
  createTestTransaction(userId, portfolioId, overrides = {}) {
    return {
      userId,
      portfolioId,
      symbol: 'AAPL',
      type: 'buy',
      shares: 10,
      price: 150.00,
      amount: 1500.00,
      fees: 0,
      executedAt: new Date(),
      ...overrides
    };
  },

  /**
   * Generate JWT token for testing
   */
  generateTestToken(userId) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  /**
   * Wait for async operations
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Global test setup
beforeAll(async () => {
  // Initialize any global test resources
});

afterAll(async () => {
  // Cleanup any global test resources
});

// Export mocks and utilities
module.exports = {
  MockDatabase,
  MockMarketDataService,
  MockEmailService,
  testUtils,
  mockDb: new MockDatabase(),
  mockMarketData: new MockMarketDataService(),
  mockEmail: new MockEmailService()
};
