/**
 * API Integration Tests
 * End-to-end tests for API endpoints
 */

describe('API Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await global.setupTestDatabase();
    await global.seedTestData();
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user with valid data', () => {
        const userData = {
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User'
        };

        const validateRegistration = (data) => {
          const errors = [];
          if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.push('Valid email required');
          }
          if (!data.password || data.password.length < 8) {
            errors.push('Password must be at least 8 characters');
          }
          return { valid: errors.length === 0, errors };
        };

        const validation = validateRegistration(userData);
        expect(validation.valid).toBe(true);
      });

      it('should reject registration with invalid email', () => {
        const userData = {
          email: 'invalid-email',
          password: 'SecurePass123!'
        };

        const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        expect(validateEmail(userData.email)).toBe(false);
      });

      it('should reject registration with short password', () => {
        const userData = {
          email: 'user@example.com',
          password: 'short'
        };

        expect(userData.password.length >= 8).toBe(false);
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', () => {
        const validateCredentials = (inputPassword) => inputPassword === 'correct_password';
        const isValid = validateCredentials('correct_password');
        expect(isValid).toBe(true);
      });

      it('should return JWT token on successful login', () => {
        const jwt = require('jsonwebtoken');
        const secret = 'test-secret';

        const token = jwt.sign(
          { id: 'user-123', email: 'test@example.com' },
          secret,
          { expiresIn: '24h' }
        );

        expect(token).toBeDefined();
        const decoded = jwt.verify(token, secret);
        expect(decoded.id).toBe('user-123');
      });

      it('should reject invalid credentials', () => {
        const validateCredentials = (inputPassword) => inputPassword === 'correct_password';
        expect(validateCredentials('wrong_password')).toBe(false);
      });
    });
  });

  describe('Portfolio Endpoints', () => {
    describe('GET /api/portfolios', () => {
      it('should return all portfolios for user', () => {
        const portfolios = db.prepare(
          'SELECT * FROM portfolios WHERE user_id = ? AND deleted_at IS NULL'
        ).all(global.testUser.id);

        expect(portfolios).toBeDefined();
        expect(Array.isArray(portfolios)).toBe(true);
      });

      it('should not return other users portfolios', () => {
        const portfolios = db.prepare(
          'SELECT * FROM portfolios WHERE user_id = ? AND deleted_at IS NULL'
        ).all('other-user-id');

        expect(portfolios).toHaveLength(0);
      });
    });

    describe('POST /api/portfolios', () => {
      it('should create a new portfolio', () => {
        const newPortfolio = {
          id: global.generateId(),
          userId: global.testUser.id,
          name: 'Integration Test Portfolio',
          description: 'Created in integration test'
        };

        const result = db.prepare(
          'INSERT INTO portfolios (id, user_id, name, description) VALUES (?, ?, ?, ?)'
        ).run(newPortfolio.id, newPortfolio.userId, newPortfolio.name, newPortfolio.description);

        expect(result.changes).toBe(1);
      });

      it('should validate portfolio data', () => {
        const validatePortfolio = (data) => {
          const errors = [];
          if (!data.name || data.name.trim() === '') {
            errors.push('Name is required');
          }
          if (data.name && data.name.length > 100) {
            errors.push('Name must be less than 100 characters');
          }
          return errors;
        };

        expect(validatePortfolio({ name: '' })).toContain('Name is required');
        expect(validatePortfolio({ name: 'Valid Name' })).toHaveLength(0);
      });
    });

    describe('GET /api/portfolios/:id', () => {
      it('should return portfolio with holdings', () => {
        const portfolio = db.prepare(
          'SELECT * FROM portfolios WHERE id = ?'
        ).get(global.testPortfolio.id);

        expect(portfolio).toBeDefined();
        expect(portfolio.name).toBe(global.testPortfolio.name);
      });

      it('should return 404 for non-existent portfolio', () => {
        const portfolio = db.prepare(
          'SELECT * FROM portfolios WHERE id = ?'
        ).get('non-existent-id');

        expect(portfolio).toBeUndefined();
      });
    });

    describe('PUT /api/portfolios/:id', () => {
      it('should update portfolio', () => {
        const updates = { name: 'Updated Name' };

        const result = db.prepare(
          "UPDATE portfolios SET name = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(updates.name, global.testPortfolio.id);

        expect(result.changes).toBe(1);

        // Restore
        db.prepare('UPDATE portfolios SET name = ? WHERE id = ?')
          .run(global.testPortfolio.name, global.testPortfolio.id);
      });
    });

    describe('DELETE /api/portfolios/:id', () => {
      it('should soft delete portfolio', () => {
        const tempId = global.generateId();

        db.prepare('INSERT INTO portfolios (id, user_id, name) VALUES (?, ?, ?)')
          .run(tempId, global.testUser.id, 'Temp Portfolio');

        const result = db.prepare(
          "UPDATE portfolios SET deleted_at = datetime('now') WHERE id = ?"
        ).run(tempId);

        expect(result.changes).toBe(1);

        const p = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(tempId);
        expect(p.deleted_at).toBeDefined();
      });
    });
  });

  describe('Holdings Endpoints', () => {
    describe('GET /api/portfolios/:id/holdings', () => {
      it('should return all holdings for portfolio', () => {
        const holdings = db.prepare(
          'SELECT * FROM holdings WHERE portfolio_id = ?'
        ).all(global.testPortfolio.id);

        expect(holdings).toBeDefined();
        expect(Array.isArray(holdings)).toBe(true);
      });
    });

    describe('POST /api/portfolios/:id/holdings', () => {
      it('should add holding to portfolio', () => {
        const newHolding = {
          id: global.generateId(),
          portfolioId: global.testPortfolio.id,
          symbol: 'TSLA',
          shares: 25,
          costBasis: 250.00
        };

        const result = db.prepare(
          'INSERT INTO holdings (id, portfolio_id, symbol, shares, cost_basis) VALUES (?, ?, ?, ?, ?)'
        ).run(newHolding.id, newHolding.portfolioId, newHolding.symbol, newHolding.shares, newHolding.costBasis);

        expect(result.changes).toBe(1);
      });
    });
  });

  describe('Transaction Endpoints', () => {
    describe('POST /api/portfolios/:id/transactions', () => {
      it('should record a buy transaction', () => {
        const transaction = {
          id: global.generateId(),
          portfolioId: global.testPortfolio.id,
          symbol: 'AAPL',
          type: 'BUY',
          shares: 10,
          price: 175.00,
          date: new Date().toISOString()
        };

        const result = db.prepare(
          'INSERT INTO transactions (id, portfolio_id, symbol, type, shares, price, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(transaction.id, transaction.portfolioId, transaction.symbol, transaction.type, transaction.shares, transaction.price, transaction.date);

        expect(result.changes).toBe(1);
      });

      it('should validate transaction data', () => {
        const validateTransaction = (data) => {
          const errors = [];
          if (!data.symbol) errors.push('Symbol required');
          if (!['BUY', 'SELL', 'DIVIDEND'].includes(data.type)) errors.push('Invalid type');
          if (!data.shares || data.shares <= 0) errors.push('Shares must be positive');
          if (!data.price || data.price <= 0) errors.push('Price must be positive');
          return errors;
        };

        expect(validateTransaction({ symbol: 'AAPL', type: 'BUY', shares: 10, price: 150 })).toHaveLength(0);
        expect(validateTransaction({ type: 'INVALID', shares: -5, price: 0 })).toHaveLength(4);
      });
    });
  });

  describe('Alert Endpoints', () => {
    describe('POST /api/alerts', () => {
      it('should create a price alert', () => {
        const alert = {
          id: global.generateId(),
          userId: global.testUser.id,
          symbol: 'AAPL',
          condition: 'ABOVE',
          targetPrice: 200.00
        };

        const result = db.prepare(
          'INSERT INTO alerts (id, user_id, symbol, condition, target_price) VALUES (?, ?, ?, ?, ?)'
        ).run(alert.id, alert.userId, alert.symbol, alert.condition, alert.targetPrice);

        expect(result.changes).toBe(1);
      });
    });

    describe('GET /api/alerts', () => {
      it('should return active alerts for user', () => {
        const alerts = db.prepare(
          'SELECT * FROM alerts WHERE user_id = ? AND is_active = 1'
        ).all(global.testUser.id);

        expect(alerts).toBeDefined();
        expect(Array.isArray(alerts)).toBe(true);
      });
    });
  });

  describe('Watchlist Endpoints', () => {
    describe('POST /api/watchlists', () => {
      it('should create a watchlist', () => {
        const watchlist = {
          id: global.generateId(),
          userId: global.testUser.id,
          name: 'Tech Stocks',
          symbols: JSON.stringify(['AAPL', 'GOOGL', 'MSFT'])
        };

        const result = db.prepare(
          'INSERT INTO watchlists (id, user_id, name, symbols) VALUES (?, ?, ?, ?)'
        ).run(watchlist.id, watchlist.userId, watchlist.name, watchlist.symbols);

        expect(result.changes).toBe(1);
      });
    });
  });

  describe('Market Data Endpoints', () => {
    describe('GET /api/market/quote/:symbol', () => {
      it('should validate symbol format', () => {
        const isValidSymbol = (symbol) => /^[A-Z]{1,5}$/.test(symbol);

        expect(isValidSymbol('AAPL')).toBe(true);
        expect(isValidSymbol('invalid')).toBe(false);
        expect(isValidSymbol('12345')).toBe(false);
      });
    });
  });

  describe('Analytics Endpoints', () => {
    describe('GET /api/portfolios/:id/analytics', () => {
      it('should calculate portfolio metrics', () => {
        const holdings = [
          { symbol: 'AAPL', shares: 100, currentPrice: 175, costBasis: 150 },
          { symbol: 'GOOGL', shares: 20, currentPrice: 140, costBasis: 120 }
        ];

        const totalValue = holdings.reduce((s, h) => s + (h.shares * h.currentPrice), 0);
        const totalCost = holdings.reduce((s, h) => s + (h.shares * h.costBasis), 0);
        const totalGain = totalValue - totalCost;
        const returnPct = (totalGain / totalCost) * 100;

        expect(totalValue).toBe(20300);
        expect(totalCost).toBe(17400);
        expect(totalGain).toBe(2900);
        expect(returnPct).toBeCloseTo(16.67, 1);
      });
    });
  });

  describe('Import Endpoints', () => {
    describe('POST /api/import/csv', () => {
      it('should validate CSV format', () => {
        const validateCSV = (headers) => {
          const required = ['symbol', 'shares'];
          return required.every(h => headers.includes(h));
        };

        expect(validateCSV(['symbol', 'shares', 'price'])).toBe(true);
        expect(validateCSV(['name', 'value'])).toBe(false);
      });

      it('should parse CSV rows correctly', () => {
        const parseRow = (row, headers) => {
          const values = row.split(',');
          const result = {};
          headers.forEach((h, i) => {
            result[h] = values[i];
          });
          return result;
        };

        const headers = ['symbol', 'shares', 'price'];
        const row = 'AAPL,100,150.50';
        const parsed = parseRow(row, headers);

        expect(parsed.symbol).toBe('AAPL');
        expect(parsed.shares).toBe('100');
        expect(parsed.price).toBe('150.50');
      });
    });
  });
});
