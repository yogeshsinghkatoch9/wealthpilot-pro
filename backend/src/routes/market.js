const express = require('express');
const { query, param, validationResult } = require('express-validator');
const MarketDataService = require('../services/marketData');
const UnifiedMarketDataService = require('../services/unifiedMarketData');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize BOTH services for backward compatibility
const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);
const unifiedMarketData = new UnifiedMarketDataService();

router.use(optionalAuth);

/**
 * GET /api/market/indices
 * Get major market indices with real-time prices
 */
router.get('/indices', async (req, res) => {
  try {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'];
    const indexNames = {
      'SPY': 'S&P 500',
      'QQQ': 'NASDAQ 100',
      'DIA': 'Dow Jones',
      'IWM': 'Russell 2000',
      'VTI': 'Total Market'
    };

    logger.info('[API] Fetching market indices via unified service');

    const quotes = await Promise.all(
      indices.map(async (symbol) => {
        try {
          const quote = await unifiedMarketData.fetchQuote(symbol);
          return {
            symbol,
            name: indexNames[symbol],
            price: quote?.price || 0,
            change: quote?.change || 0,
            changePercent: quote?.changePercent || 0,
            previousClose: quote?.previousClose || 0,
            high: quote?.high || 0,
            low: quote?.low || 0,
            provider: quote?.provider || 'unknown'
          };
        } catch (e) {
          logger.warn(`Failed to fetch index ${symbol}:`, e.message);
          return { symbol, name: indexNames[symbol], price: 0, change: 0, changePercent: 0 };
        }
      })
    );

    res.json(quotes);
  } catch (error) {
    logger.error('Market indices error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/sectors
 * Get sector performance data
 */
router.get('/sectors', async (req, res) => {
  try {
    // Sector ETFs
    const sectorETFs = {
      'XLK': { name: 'Technology', color: '#3B82F6' },
      'XLF': { name: 'Financial', color: '#10B981' },
      'XLV': { name: 'Healthcare', color: '#EF4444' },
      'XLE': { name: 'Energy', color: '#F59E0B' },
      'XLY': { name: 'Consumer Discretionary', color: '#8B5CF6' },
      'XLP': { name: 'Consumer Staples', color: '#EC4899' },
      'XLI': { name: 'Industrial', color: '#6366F1' },
      'XLB': { name: 'Materials', color: '#14B8A6' },
      'XLU': { name: 'Utilities', color: '#F97316' },
      'XLRE': { name: 'Real Estate', color: '#06B6D4' },
      'XLC': { name: 'Communication', color: '#84CC16' }
    };

    logger.info('[API] Fetching sector performance via unified service');

    const sectors = await Promise.all(
      Object.entries(sectorETFs).map(async ([symbol, info]) => {
        try {
          const quote = await unifiedMarketData.fetchQuote(symbol);
          return {
            symbol,
            name: info.name,
            color: info.color,
            price: quote?.price || 0,
            change: quote?.change || 0,
            changePercent: quote?.changePercent || 0,
            provider: quote?.provider || 'unknown'
          };
        } catch (e) {
          return { symbol, name: info.name, color: info.color, price: 0, change: 0, changePercent: 0 };
        }
      })
    );

    // Sort by change percent (best to worst)
    sectors.sort((a, b) => b.changePercent - a.changePercent);

    res.json(sectors);
  } catch (error) {
    logger.error('Sectors error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/quote/:symbol
 * Uses unified service with 4-provider fallback
 */
router.get('/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    logger.info(`[API] Fetching quote for ${symbol} via unified service`);

    const quote = await unifiedMarketData.fetchQuote(symbol);

    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    res.json(quote);
  } catch (err) {
    logger.error('Get quote error:', err);
    res.status(500).json({ error: 'Failed to get quote' });
  }
});

/**
 * GET /api/market/quotes
 * Uses unified service for multiple symbols
 */
router.get('/quotes', [
  query('symbols').notEmpty()
], async (req, res) => {
  try {
    const symbols = req.query.symbols.split(',').map(s => s.trim().toUpperCase());
    logger.info(`[API] Fetching quotes for ${symbols.length} symbols via unified service`);

    const quotes = await Promise.all(
      symbols.map(symbol => unifiedMarketData.fetchQuote(symbol))
    );

    const validQuotes = quotes.filter(q => q !== null);
    res.json(validQuotes);
  } catch (err) {
    logger.error('Get quotes error:', err);
    res.status(500).json({ error: 'Failed to get quotes' });
  }
});

/**
 * POST /api/market/quotes
 * Batch fetch multiple stock quotes (shorthand)
 */
router.post('/quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array required' });
    }

    const upperSymbols = symbols.map(s => s.trim().toUpperCase());
    logger.info(`[API] Fetching quotes for ${upperSymbols.length} symbols via POST`);

    const quotes = await Promise.all(
      upperSymbols.map(symbol => unifiedMarketData.fetchQuote(symbol))
    );

    const validQuotes = quotes.filter(q => q !== null);
    res.json(validQuotes);
  } catch (err) {
    logger.error('POST quotes error:', err);
    res.status(500).json({ error: 'Failed to get quotes' });
  }
});

/**
 * POST /api/market/quotes/batch
 * Batch fetch multiple stock quotes (frontend compatibility)
 */
router.post('/quotes/batch', async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array required' });
    }

    const upperSymbols = symbols.map(s => s.trim().toUpperCase());
    logger.info(`[API] Batch fetching quotes for ${upperSymbols.length} symbols via unified service`);

    const quotes = await Promise.all(
      upperSymbols.map(symbol => unifiedMarketData.fetchQuote(symbol))
    );

    const validQuotes = quotes.filter(q => q !== null);
    res.json(validQuotes);
  } catch (err) {
    logger.error('Batch quotes error:', err);
    res.status(500).json({ error: 'Failed to get batch quotes' });
  }
});

/**
 * GET /api/market/profile/:symbol
 * Uses unified service with 3-provider fallback
 */
router.get('/profile/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    logger.info(`[API] Fetching profile for ${symbol} via unified service`);

    const profile = await unifiedMarketData.fetchCompanyProfile(symbol);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (err) {
    logger.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/market/history/:symbol
 * Uses unified service with 4-provider fallback for historical data
 */
router.get('/history/:symbol', [
  query('days').optional().isInt({ min: 1, max: 3650 }).toInt()
], async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days) || 30;

    logger.info(`[API] Fetching history for ${symbol}, days: ${days} via unified service`);

    const history = await unifiedMarketData.fetchHistoricalData(symbol, days);

    if (!history || history.length === 0) {
      return res.status(404).json({ error: 'No historical data found for symbol' });
    }

    logger.info(`[API] Successfully retrieved ${history.length} data points for ${symbol}`);

    res.json({
      symbol,
      days,
      data: history
    });
  } catch (err) {
    logger.error('[API] History error:', {
      message: err.message,
      symbol: req.params.symbol
    });
    res.status(500).json({
      error: 'Failed to get history',
      details: err.message,
      symbol: req.params.symbol
    });
  }
});

/**
 * GET /api/market/search
 */
router.get('/search', [
  query('q').trim().notEmpty()
], async (req, res) => {
  try {
    const searchQuery = req.query.q.toUpperCase();

    // Try to get live quote directly for the symbol
    const quote = await marketData.fetchQuote(searchQuery);

    if (quote) {
      // Return live quote data in expected format
      return res.json({
        success: true,
        results: [{
          symbol: quote.symbol,
          name: searchQuery,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: quote.volume,
          sector: 'N/A',
          timestamp: quote.timestamp
        }]
      });
    }

    // If no direct match found
    res.json({
      success: true,
      results: []
    });
  } catch (err) {
    logger.error('Search error:', err);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      results: []
    });
  }
});

// Cache for market movers (refresh every 2 minutes)
let moversCache = null;
let moversCacheTime = null;
const MOVERS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * GET /api/market/movers
 * Returns LIVE market movers using Finnhub API
 */
router.get('/movers', async (req, res) => {
  try {
    // Return cached data if fresh
    if (moversCache && moversCacheTime && (Date.now() - moversCacheTime < MOVERS_CACHE_TTL)) {
      return res.json(moversCache);
    }

    const axios = require('axios');
    const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

    // Key stocks to track for market movers
    const symbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC',
      'JPM', 'BAC', 'GS', 'V', 'MA', 'JNJ', 'UNH', 'PFE', 'LLY',
      'WMT', 'COST', 'HD', 'XOM', 'CVX', 'F', 'GM', 'PLTR', 'COIN',
      'NET', 'CRWD', 'SNOW', 'DDOG', 'CRM', 'NFLX', 'DIS', 'UBER'
    ];

    const quotesArray = [];

    // Fetch quotes using Finnhub (which we know works)
    for (const symbol of symbols) {
      try {
        const response = await axios.get('https://finnhub.io/api/v1/quote', {
          params: { symbol, token: FINNHUB_KEY },
          timeout: 3000
        });

        const data = response.data;
        if (data && data.c > 0) {
          quotesArray.push({
            symbol,
            name: symbol, // Finnhub quote doesn't include name
            price: data.c, // Current price
            previousClose: data.pc, // Previous close
            change: data.d, // Change
            changePercent: data.dp, // Change percent
            high: data.h,
            low: data.l,
            open: data.o
          });
        }
      } catch (err) {
        logger.debug(`Movers: Failed to fetch ${symbol} from Finnhub`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Sort for gainers
    const gainers = quotesArray
      .filter(q => q.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 15)
      .map(q => ({
        symbol: q.symbol,
        name: q.name,
        price: Number(q.price.toFixed(2)),
        change: Number(q.change.toFixed(2)),
        changePercent: Number(q.changePercent.toFixed(2))
      }));

    // Sort for losers
    const losers = quotesArray
      .filter(q => q.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 15)
      .map(q => ({
        symbol: q.symbol,
        name: q.name,
        price: Number(q.price.toFixed(2)),
        change: Number(q.change.toFixed(2)),
        changePercent: Number(q.changePercent.toFixed(2))
      }));

    // Sort for most active by absolute change
    const active = quotesArray
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 15)
      .map(q => ({
        symbol: q.symbol,
        name: q.name,
        price: Number(q.price.toFixed(2)),
        change: Number(q.change.toFixed(2)),
        changePercent: Number(q.changePercent.toFixed(2))
      }));

    const result = {
      gainers,
      losers,
      active,
      count: quotesArray.length,
      lastUpdated: new Date().toISOString()
    };

    // Cache the result
    moversCache = result;
    moversCacheTime = Date.now();

    res.json(result);
  } catch (err) {
    logger.error('Get movers error:', err);
    res.status(500).json({ error: 'Failed to get movers' });
  }
});

module.exports = router;
