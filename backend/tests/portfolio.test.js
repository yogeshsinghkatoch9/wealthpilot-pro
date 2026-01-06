/**
 * Portfolio API Tests
 * Tests for portfolio CRUD operations
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret';
const mockUserId = 'test-user-id';

// Mock portfolios storage
let mockPortfolios = [];
let portfolioIdCounter = 1;

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

// Portfolio routes
app.get('/api/portfolios', authenticate, (req, res) => {
  const userPortfolios = mockPortfolios.filter(p => p.userId === req.user.id);
  res.json({ portfolios: userPortfolios });
});

app.get('/api/portfolios/:id', authenticate, (req, res) => {
  const portfolio = mockPortfolios.find(p => p.id === req.params.id && p.userId === req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  res.json({ portfolio });
});

app.post('/api/portfolios', authenticate, (req, res) => {
  const { name, type, currency } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Portfolio name is required' });
  }

  const portfolio = {
    id: `port_${portfolioIdCounter++}`,
    userId: req.user.id,
    name,
    type: type || 'investment',
    currency: currency || 'USD',
    createdAt: new Date().toISOString(),
    holdings: [],
    totalValue: 0,
    totalCost: 0,
    totalGain: 0
  };

  mockPortfolios.push(portfolio);
  res.status(201).json({ portfolio });
});

app.put('/api/portfolios/:id', authenticate, (req, res) => {
  const index = mockPortfolios.findIndex(p => p.id === req.params.id && p.userId === req.user.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  const { name, type, currency } = req.body;
  mockPortfolios[index] = {
    ...mockPortfolios[index],
    name: name || mockPortfolios[index].name,
    type: type || mockPortfolios[index].type,
    currency: currency || mockPortfolios[index].currency
  };

  res.json({ portfolio: mockPortfolios[index] });
});

app.delete('/api/portfolios/:id', authenticate, (req, res) => {
  const index = mockPortfolios.findIndex(p => p.id === req.params.id && p.userId === req.user.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  mockPortfolios.splice(index, 1);
  res.json({ success: true, message: 'Portfolio deleted' });
});

// Helper to get auth token
const getAuthToken = () => {
  return jwt.sign({ userId: mockUserId }, JWT_SECRET, { expiresIn: '1h' });
};

describe('Portfolio API', () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockPortfolios = [];
    portfolioIdCounter = 1;
  });

  describe('GET /api/portfolios', () => {
    it('should return empty array when no portfolios exist', async () => {
      const response = await request(app)
        .get('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.portfolios).toEqual([]);
    });

    it('should return user portfolios', async () => {
      // Create a portfolio first
      await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'My Portfolio' });

      const response = await request(app)
        .get('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.portfolios).toHaveLength(1);
      expect(response.body.portfolios[0].name).toBe('My Portfolio');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/portfolios');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/portfolios', () => {
    it('should create a new portfolio', async () => {
      const response = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Growth Portfolio', type: 'investment', currency: 'USD' });

      expect(response.status).toBe(201);
      expect(response.body.portfolio).toHaveProperty('id');
      expect(response.body.portfolio.name).toBe('Growth Portfolio');
      expect(response.body.portfolio.type).toBe('investment');
    });

    it('should require portfolio name', async () => {
      const response = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('name');
    });

    it('should use default values for type and currency', async () => {
      const response = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Simple Portfolio' });

      expect(response.status).toBe(201);
      expect(response.body.portfolio.type).toBe('investment');
      expect(response.body.portfolio.currency).toBe('USD');
    });
  });

  describe('GET /api/portfolios/:id', () => {
    it('should return a specific portfolio', async () => {
      // Create a portfolio
      const createResponse = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Test Portfolio' });

      const portfolioId = createResponse.body.portfolio.id;

      const response = await request(app)
        .get(`/api/portfolios/${portfolioId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.portfolio.id).toBe(portfolioId);
    });

    it('should return 404 for non-existent portfolio', async () => {
      const response = await request(app)
        .get('/api/portfolios/non-existent-id')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/portfolios/:id', () => {
    it('should update a portfolio', async () => {
      // Create a portfolio
      const createResponse = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Original Name' });

      const portfolioId = createResponse.body.portfolio.id;

      const response = await request(app)
        .put(`/api/portfolios/${portfolioId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.portfolio.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent portfolio', async () => {
      const response = await request(app)
        .put('/api/portfolios/non-existent-id')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/portfolios/:id', () => {
    it('should delete a portfolio', async () => {
      // Create a portfolio
      const createResponse = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'To Delete' });

      const portfolioId = createResponse.body.portfolio.id;

      const response = await request(app)
        .delete(`/api/portfolios/${portfolioId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await request(app)
        .get(`/api/portfolios/${portfolioId}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent portfolio', async () => {
      const response = await request(app)
        .delete('/api/portfolios/non-existent-id')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });
  });
});
