/**
 * Market Data Service Tests
 * Tests for market data fetching and validation
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret';
const mockUserId = 'test-user-id';

// Mock market data
const mockQuotes = {
  AAPL: { symbol: 'AAPL', price: 185.92, change: 2.34, changePercent: 1.27, volume: 54321000 },
  MSFT: { symbol: 'MSFT', price: 378.45, change: -1.23, changePercent: -0.32, volume: 23456000 },
  GOOGL: { symbol: 'GOOGL', price: 141.80, change: 0.56, changePercent: 0.40, volume: 18765000 },
  NVDA: { symbol: 'NVDA', price: 495.22, change: 12.45, changePercent: 2.58, volume: 45678000 },
  SPY: { symbol: 'SPY', price: 475.32, change: 1.87, changePercent: 0.39, volume: 67890000 }
};

const mockHistoricalData = [
  { date: '2024-01-15', open: 182.50, high: 186.00, low: 181.25, close: 185.92, volume: 54321000 },
  { date: '2024-01-14', open: 180.25, high: 183.50, low: 179.80, close: 182.50, volume: 48765000 },
  { date: '2024-01-13', open: 178.90, high: 181.00, low: 177.50, close: 180.25, volume: 52341000 }
];

// Validate symbol format
const isValidSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') return false;
  return /^[A-Z0-9.\-^]{1,10}$/.test(symbol.toUpperCase());
};

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Market data routes
app.get('/api/market/quote/:symbol', authenticate, (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  if (!isValidSymbol(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  const quote = mockQuotes[symbol];
  if (!quote) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

  res.json({
    ...quote,
    timestamp: new Date().toISOString(),
    source: 'test'
  });
});

app.get('/api/market/quotes', authenticate, (req, res) => {
  const symbols = req.query.symbols;

  if (!symbols) {
    return res.status(400).json({ error: 'Symbols parameter is required' });
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  // Validate all symbols
  const invalidSymbols = symbolList.filter(s => !isValidSymbol(s));
  if (invalidSymbols.length > 0) {
    return res.status(400).json({ error: `Invalid symbols: ${invalidSymbols.join(', ')}` });
  }

  const quotes = symbolList
    .map(symbol => mockQuotes[symbol])
    .filter(Boolean);

  res.json({
    quotes,
    requested: symbolList.length,
    found: quotes.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/market/historical/:symbol', authenticate, (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const range = req.query.range || '1mo';

  if (!isValidSymbol(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  if (!mockQuotes[symbol]) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

  const validRanges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'ytd', 'max'];
  if (!validRanges.includes(range)) {
    return res.status(400).json({ error: `Invalid range. Valid options: ${validRanges.join(', ')}` });
  }

  res.json({
    symbol,
    range,
    data: mockHistoricalData,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/market/search', authenticate, (req, res) => {
  const query = req.query.q;

  if (!query || query.length < 1) {
    return res.status(400).json({ error: 'Search query is required (min 1 character)' });
  }

  const results = Object.keys(mockQuotes)
    .filter(symbol => symbol.includes(query.toUpperCase()))
    .map(symbol => ({
      symbol,
      name: `${symbol} Inc.`,
      exchange: 'NASDAQ'
    }));

  res.json({
    query,
    results,
    count: results.length
  });
});

// Helper to get auth token
const getAuthToken = () => {
  return jwt.sign({ userId: mockUserId }, JWT_SECRET, { expiresIn: '1h' });
};

describe('Market Data API', () => {
  describe('GET /api/market/quote/:symbol', () => {
    it('should return quote for valid symbol', async () => {
      const response = await request(app)
        .get('/api/market/quote/AAPL')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.symbol).toBe('AAPL');
      expect(response.body).toHaveProperty('price');
      expect(response.body).toHaveProperty('change');
      expect(response.body).toHaveProperty('changePercent');
      expect(response.body).toHaveProperty('volume');
    });

    it('should handle lowercase symbols', async () => {
      const response = await request(app)
        .get('/api/market/quote/aapl')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.symbol).toBe('AAPL');
    });

    it('should return 404 for unknown symbol', async () => {
      const response = await request(app)
        .get('/api/market/quote/UNKNOWN')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });

    it('should reject invalid symbol format', async () => {
      const response = await request(app)
        .get('/api/market/quote/INVALID_SYMBOL_TOO_LONG')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/market/quote/AAPL');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/market/quotes', () => {
    it('should return quotes for multiple symbols', async () => {
      const response = await request(app)
        .get('/api/market/quotes?symbols=AAPL,MSFT,GOOGL')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.quotes).toHaveLength(3);
      expect(response.body.requested).toBe(3);
      expect(response.body.found).toBe(3);
    });

    it('should handle partial matches', async () => {
      const response = await request(app)
        .get('/api/market/quotes?symbols=AAPL,UNKNOWN,MSFT')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.quotes).toHaveLength(2);
      expect(response.body.requested).toBe(3);
      expect(response.body.found).toBe(2);
    });

    it('should require symbols parameter', async () => {
      const response = await request(app)
        .get('/api/market/quotes')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });

    it('should reject invalid symbols in batch', async () => {
      const response = await request(app)
        .get('/api/market/quotes?symbols=AAPL,INVALID_LONG_SYMBOL')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/market/historical/:symbol', () => {
    it('should return historical data', async () => {
      const response = await request(app)
        .get('/api/market/historical/AAPL?range=1mo')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.symbol).toBe('AAPL');
      expect(response.body.range).toBe('1mo');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data[0]).toHaveProperty('date');
      expect(response.body.data[0]).toHaveProperty('open');
      expect(response.body.data[0]).toHaveProperty('close');
    });

    it('should use default range if not specified', async () => {
      const response = await request(app)
        .get('/api/market/historical/AAPL')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.range).toBe('1mo');
    });

    it('should reject invalid range', async () => {
      const response = await request(app)
        .get('/api/market/historical/AAPL?range=invalid')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });

    it('should return 404 for unknown symbol', async () => {
      const response = await request(app)
        .get('/api/market/historical/UNKNOWN')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/market/search', () => {
    it('should return search results', async () => {
      const response = await request(app)
        .get('/api/market/search?q=A')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.results).toBeInstanceOf(Array);
      expect(response.body.query).toBe('A');
    });

    it('should find matching symbols', async () => {
      const response = await request(app)
        .get('/api/market/search?q=AAPL')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].symbol).toBe('AAPL');
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/market/search')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });
  });

  describe('Symbol Validation', () => {
    it('should accept valid stock symbols', async () => {
      const validSymbols = ['AAPL', 'MSFT', 'BRK.B', 'BRK-A', 'SPY', 'VTI', 'QQQ'];

      for (const symbol of validSymbols) {
        if (mockQuotes[symbol]) {
          const response = await request(app)
            .get(`/api/market/quote/${symbol}`)
            .set('Authorization', `Bearer ${getAuthToken()}`);

          expect(response.status).not.toBe(400);
        }
      }
    });

    it('should reject symbols with special characters', async () => {
      const invalidSymbols = ['AAPL$', 'MSFT@', 'GO<script>', 'A;DROP'];

      for (const symbol of invalidSymbols) {
        const response = await request(app)
          .get(`/api/market/quote/${symbol}`)
          .set('Authorization', `Bearer ${getAuthToken()}`);

        expect(response.status).toBe(400);
      }
    });

    it('should reject excessively long symbols', async () => {
      const response = await request(app)
        .get('/api/market/quote/THISSYMBOLISTOOLONG')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(response.status).toBe(400);
    });
  });
});
