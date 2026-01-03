/**
 * Holdings API Tests
 * Tests for portfolio holdings CRUD operations
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret';
const mockUserId = 'test-user-id';

// Mock data
let mockPortfolios = [];
let mockHoldings = [];
let holdingIdCounter = 1;

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Validate symbol format
const isValidSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') return false;
  return /^[A-Z0-9.\-^]{1,10}$/.test(symbol.toUpperCase());
};

// Holdings routes
app.get('/api/portfolios/:portfolioId/holdings', authenticate, (req, res) => {
  const portfolio = mockPortfolios.find(p => p.id === req.params.portfolioId && p.userId === req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  const holdings = mockHoldings.filter(h => h.portfolioId === req.params.portfolioId);
  res.json({ holdings });
});

app.post('/api/portfolios/:portfolioId/holdings', authenticate, (req, res) => {
  const portfolio = mockPortfolios.find(p => p.id === req.params.portfolioId && p.userId === req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  const { symbol, shares, costBasis } = req.body;

  if (!symbol || !isValidSymbol(symbol)) {
    return res.status(400).json({ error: 'Valid symbol is required (1-10 alphanumeric characters)' });
  }

  if (typeof shares !== 'number' || shares <= 0) {
    return res.status(400).json({ error: 'Shares must be a positive number' });
  }

  if (typeof costBasis !== 'number' || costBasis < 0) {
    return res.status(400).json({ error: 'Cost basis must be a non-negative number' });
  }

  // Check if holding already exists
  const existingHolding = mockHoldings.find(
    h => h.portfolioId === req.params.portfolioId && h.symbol === symbol.toUpperCase()
  );

  if (existingHolding) {
    // Update existing holding
    existingHolding.shares += shares;
    existingHolding.costBasis += costBasis;
    return res.json({ holding: existingHolding, updated: true });
  }

  const holding = {
    id: `hold_${holdingIdCounter++}`,
    portfolioId: req.params.portfolioId,
    symbol: symbol.toUpperCase(),
    shares,
    costBasis,
    averageCost: costBasis / shares,
    currentPrice: null,
    marketValue: null,
    gain: null,
    gainPercent: null,
    createdAt: new Date().toISOString()
  };

  mockHoldings.push(holding);
  res.status(201).json({ holding });
});

app.put('/api/portfolios/:portfolioId/holdings/:holdingId', authenticate, (req, res) => {
  const portfolio = mockPortfolios.find(p => p.id === req.params.portfolioId && p.userId === req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  const holdingIndex = mockHoldings.findIndex(
    h => h.id === req.params.holdingId && h.portfolioId === req.params.portfolioId
  );

  if (holdingIndex === -1) {
    return res.status(404).json({ error: 'Holding not found' });
  }

  const { shares, costBasis } = req.body;

  if (shares !== undefined && (typeof shares !== 'number' || shares < 0)) {
    return res.status(400).json({ error: 'Shares must be a non-negative number' });
  }

  mockHoldings[holdingIndex] = {
    ...mockHoldings[holdingIndex],
    shares: shares !== undefined ? shares : mockHoldings[holdingIndex].shares,
    costBasis: costBasis !== undefined ? costBasis : mockHoldings[holdingIndex].costBasis,
    averageCost: shares > 0 ? (costBasis || mockHoldings[holdingIndex].costBasis) / shares : 0
  };

  res.json({ holding: mockHoldings[holdingIndex] });
});

app.delete('/api/portfolios/:portfolioId/holdings/:holdingId', authenticate, (req, res) => {
  const portfolio = mockPortfolios.find(p => p.id === req.params.portfolioId && p.userId === req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  const holdingIndex = mockHoldings.findIndex(
    h => h.id === req.params.holdingId && h.portfolioId === req.params.portfolioId
  );

  if (holdingIndex === -1) {
    return res.status(404).json({ error: 'Holding not found' });
  }

  mockHoldings.splice(holdingIndex, 1);
  res.json({ success: true, message: 'Holding deleted' });
});

// Helper to get auth token
const getAuthToken = () => {
  return jwt.sign({ userId: mockUserId }, JWT_SECRET, { expiresIn: '1h' });
};

// Helper to create a test portfolio
const createTestPortfolio = () => {
  const portfolio = {
    id: 'test-portfolio-id',
    userId: mockUserId,
    name: 'Test Portfolio',
    type: 'investment',
    currency: 'USD'
  };
  mockPortfolios.push(portfolio);
  return portfolio;
};

describe('Holdings API', () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockPortfolios = [];
    mockHoldings = [];
    holdingIdCounter = 1;
  });

  describe('GET /api/portfolios/:portfolioId/holdings', () => {
    it('should return empty holdings for new portfolio', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .get(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.holdings).toEqual([]);
    });

    it('should return 404 for non-existent portfolio', async () => {
      const response = await request(app)
        .get('/api/portfolios/non-existent/holdings')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/portfolios/:portfolioId/holdings', () => {
    it('should add a new holding', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: 10,
          costBasis: 1500
        });

      expect(response.status).toBe(201);
      expect(response.body.holding.symbol).toBe('AAPL');
      expect(response.body.holding.shares).toBe(10);
      expect(response.body.holding.averageCost).toBe(150);
    });

    it('should reject invalid symbols', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'INVALID_SYMBOL_TOO_LONG',
          shares: 10,
          costBasis: 100
        });

      expect(response.status).toBe(400);
    });

    it('should reject negative shares', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: -10,
          costBasis: 100
        });

      expect(response.status).toBe(400);
    });

    it('should update existing holding if symbol already exists', async () => {
      const portfolio = createTestPortfolio();

      // Add first holding
      await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: 10,
          costBasis: 1500
        });

      // Add more of the same symbol
      const response = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: 5,
          costBasis: 800
        });

      expect(response.status).toBe(200);
      expect(response.body.holding.shares).toBe(15);
      expect(response.body.holding.costBasis).toBe(2300);
      expect(response.body.updated).toBe(true);
    });

    it('should normalize symbol to uppercase', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'aapl',
          shares: 10,
          costBasis: 1500
        });

      expect(response.status).toBe(201);
      expect(response.body.holding.symbol).toBe('AAPL');
    });
  });

  describe('PUT /api/portfolios/:portfolioId/holdings/:holdingId', () => {
    it('should update holding shares', async () => {
      const portfolio = createTestPortfolio();

      // Create holding
      const createResponse = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: 10,
          costBasis: 1500
        });

      const holdingId = createResponse.body.holding.id;

      // Update holding
      const response = await request(app)
        .put(`/api/portfolios/${portfolio.id}/holdings/${holdingId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          shares: 20,
          costBasis: 3000
        });

      expect(response.status).toBe(200);
      expect(response.body.holding.shares).toBe(20);
      expect(response.body.holding.costBasis).toBe(3000);
    });

    it('should return 404 for non-existent holding', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .put(`/api/portfolios/${portfolio.id}/holdings/non-existent`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ shares: 20 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/portfolios/:portfolioId/holdings/:holdingId', () => {
    it('should delete a holding', async () => {
      const portfolio = createTestPortfolio();

      // Create holding
      const createResponse = await request(app)
        .post(`/api/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          symbol: 'AAPL',
          shares: 10,
          costBasis: 1500
        });

      const holdingId = createResponse.body.holding.id;

      // Delete holding
      const response = await request(app)
        .delete(`/api/portfolios/${portfolio.id}/holdings/${holdingId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent holding', async () => {
      const portfolio = createTestPortfolio();

      const response = await request(app)
        .delete(`/api/portfolios/${portfolio.id}/holdings/non-existent`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });
  });
});
