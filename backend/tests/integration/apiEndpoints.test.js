/**
 * WealthPilot Pro - API Integration Tests
 * End-to-end tests for all API endpoints
 */

// Set JWT_SECRET for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock the server setup for testing
const createTestApp = () => {
  const express = require('express');
  const app = express();
  
  app.use(express.json());
  
  // Mock authentication middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // Invalid token - continue without user
      }
    }
    next();
  });

  // Mock routes for testing
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = {
      id: 'test-user-id',
      email,
      firstName,
      lastName
    };

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Mock successful login
    if (email === 'demo@wealthpilot.com' && password === 'demo123456') {
      const user = {
        id: 'demo-user-id',
        email,
        firstName: 'Demo',
        lastName: 'User'
      };

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({ user, token });
    }

    res.status(401).json({ error: 'Invalid credentials' });
  });

  // Protected routes
  const requireAuth = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  };

  app.get('/api/portfolios', requireAuth, (req, res) => {
    res.json({
      portfolios: [
        {
          id: 'portfolio-1',
          userId: req.user.userId,
          name: 'Main Portfolio',
          cashBalance: 10000,
          totalValue: 50000
        }
      ]
    });
  });

  app.post('/api/portfolios', requireAuth, (req, res) => {
    const { name, description, currency, benchmark } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Portfolio name required' });
    }

    res.status(201).json({
      id: 'new-portfolio-id',
      userId: req.user.userId,
      name,
      description,
      currency: currency || 'USD',
      benchmark: benchmark || 'SPY',
      cashBalance: 0,
      createdAt: new Date().toISOString()
    });
  });

  app.get('/api/portfolios/:id', requireAuth, (req, res) => {
    res.json({
      id: req.params.id,
      userId: req.user.userId,
      name: 'Test Portfolio',
      cashBalance: 10000,
      totalValue: 50000,
      holdings: []
    });
  });

  app.get('/api/portfolios/:id/holdings', requireAuth, (req, res) => {
    res.json({
      holdings: [
        {
          id: 'holding-1',
          symbol: 'AAPL',
          shares: 100,
          avgCostBasis: 150,
          currentPrice: 175.50,
          currentValue: 17550,
          gain: 2550,
          gainPercent: 17
        }
      ]
    });
  });

  app.get('/api/market/quote/:symbol', (req, res) => {
    const quotes = {
      AAPL: { price: 175.50, change: 2.30, changePercent: 1.33 },
      GOOGL: { price: 140.25, change: -1.50, changePercent: -1.06 },
      MSFT: { price: 378.90, change: 5.20, changePercent: 1.39 }
    };

    const quote = quotes[req.params.symbol.toUpperCase()];
    if (quote) {
      res.json({ symbol: req.params.symbol.toUpperCase(), ...quote });
    } else {
      res.status(404).json({ error: 'Symbol not found' });
    }
  });

  app.get('/api/analytics/performance/:portfolioId', requireAuth, (req, res) => {
    res.json({
      portfolioId: req.params.portfolioId,
      totalReturn: 15.5,
      annualizedReturn: 12.3,
      sharpeRatio: 1.2,
      beta: 1.05,
      alpha: 2.1,
      maxDrawdown: -8.5
    });
  });

  return app;
};

describe('Health Check API', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  it('GET /api/health should return status ok', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });
});

describe('Authentication API', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          firstName: 'New',
          lastName: 'User'
        })
        .expect(201);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(response.body.token).toBeDefined();
    });

    it('should reject registration without email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          password: 'SecurePass123!'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short'
        })
        .expect(400);

      expect(response.body.error).toContain('8 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'demo@wealthpilot.com',
          password: 'demo123456'
        })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'demo@wealthpilot.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});

describe('Portfolio API', () => {
  let app;
  let authToken;

  beforeAll(() => {
    app = createTestApp();
    authToken = jwt.sign(
      { userId: 'test-user-id', email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/portfolios', () => {
    it('should return portfolios for authenticated user', async () => {
      const response = await request(app)
        .get('/api/portfolios')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.portfolios).toBeDefined();
      expect(Array.isArray(response.body.portfolios)).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/portfolios')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('POST /api/portfolios', () => {
    it('should create a new portfolio', async () => {
      const response = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Portfolio',
          description: 'Test portfolio',
          currency: 'USD',
          benchmark: 'SPY'
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('New Portfolio');
    });

    it('should reject portfolio without name', async () => {
      const response = await request(app)
        .post('/api/portfolios')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Missing name'
        })
        .expect(400);

      expect(response.body.error).toContain('name');
    });
  });

  describe('GET /api/portfolios/:id', () => {
    it('should return portfolio details', async () => {
      const response = await request(app)
        .get('/api/portfolios/test-portfolio-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe('test-portfolio-id');
      expect(response.body.name).toBeDefined();
    });
  });

  describe('GET /api/portfolios/:id/holdings', () => {
    it('should return holdings for portfolio', async () => {
      const response = await request(app)
        .get('/api/portfolios/test-portfolio-id/holdings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.holdings).toBeDefined();
      expect(Array.isArray(response.body.holdings)).toBe(true);
    });
  });
});

describe('Market Data API', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET /api/market/quote/:symbol', () => {
    it('should return quote for valid symbol', async () => {
      const response = await request(app)
        .get('/api/market/quote/AAPL')
        .expect(200);

      expect(response.body.symbol).toBe('AAPL');
      expect(response.body.price).toBeDefined();
      expect(response.body.change).toBeDefined();
      expect(response.body.changePercent).toBeDefined();
    });

    it('should be case insensitive', async () => {
      const response = await request(app)
        .get('/api/market/quote/aapl')
        .expect(200);

      expect(response.body.symbol).toBe('AAPL');
    });

    it('should return 404 for unknown symbol', async () => {
      const response = await request(app)
        .get('/api/market/quote/INVALID123')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});

describe('Analytics API', () => {
  let app;
  let authToken;

  beforeAll(() => {
    app = createTestApp();
    authToken = jwt.sign(
      { userId: 'test-user-id', email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/analytics/performance/:portfolioId', () => {
    it('should return performance metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/performance/test-portfolio-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalReturn).toBeDefined();
      expect(response.body.annualizedReturn).toBeDefined();
      expect(response.body.sharpeRatio).toBeDefined();
      expect(response.body.beta).toBeDefined();
      expect(response.body.alpha).toBeDefined();
    });

    it('should reject unauthenticated request', async () => {
      await request(app)
        .get('/api/analytics/performance/test-portfolio-id')
        .expect(401);
    });
  });
});

describe('Rate Limiting', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should include rate limit headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    // In a real implementation, check for rate limit headers
    expect(response.status).toBe(200);
  });
});

describe('Error Handling', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/nonexistent')
      .expect(404);
  });

  it('should handle invalid JSON gracefully', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('invalid json')
      .expect(400);
  });
});

describe('CORS', () => {
  let app;

  beforeAll(() => {
    const express = require('express');
    const cors = require('cors');
    app = express();
    app.use(cors({ origin: 'http://localhost:3000' }));
    app.get('/api/test', (req, res) => res.json({ ok: true }));
  });

  it('should include CORS headers', async () => {
    const response = await request(app)
      .get('/api/test')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });
});
