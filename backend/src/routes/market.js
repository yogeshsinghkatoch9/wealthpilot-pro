const express = require('express');
const { query, param, validationResult } = require('express-validator');
const MarketDataService = require('../services/marketData');
const MarketDataServiceInstance = require('../services/marketDataService');
const UnifiedMarketDataService = require('../services/unifiedMarketData');
const yahooMovers = require('../services/yahooMovers');
const stockDataManager = require('../services/stockDataManager');
const jobQueue = require('../services/jobQueue');
const { optionalAuth, authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize services
const marketDataStatic = MarketDataService;
const marketDataInstance = new MarketDataServiceInstance();
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
 * GET /api/market/detail/:symbol
 * Comprehensive stock detail with all info from Yahoo Finance
 * Includes: quote, company info, key statistics, 52-week range, dividends, history
 */
router.get('/detail/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    logger.info(`[API] Fetching comprehensive detail for ${symbol}`);

    // Use existing services with fallbacks and caching
    const [quote, profile, history] = await Promise.all([
      unifiedMarketData.fetchQuote(symbol),
      unifiedMarketData.fetchCompanyProfile(symbol).catch(() => null),
      stockDataManager.getHistoricalData(symbol, 365).catch(() => null)
    ]);

    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Fetch key statistics from Finnhub
    let keyStats = {};
    try {
      const axios = require('axios');
      const finnhubKey = process.env.FINNHUB_API_KEY;
      if (finnhubKey) {
        const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubKey}`;
        const metricsRes = await axios.get(metricsUrl, { timeout: 5000 }).catch(() => ({ data: {} }));
        const m = metricsRes.data?.metric || {};

        keyStats = {
          peRatio: m.peNormalizedAnnual || m.peTTM,
          forwardPE: m.peAnnual,
          pegRatio: m.pegRatio,
          priceToBook: m.pbAnnual || m.pbQuarterly,
          dividendYield: m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual / 100 : null,
          dividendRate: m.dividendPerShareAnnual,
          beta: m.beta,
          fiftyTwoWeekHigh: m['52WeekHigh'],
          fiftyTwoWeekLow: m['52WeekLow'],
          fiftyDayAverage: m['10DayAverageTradingVolume'], // Finnhub doesn't have this exact field
          eps: m.epsNormalizedAnnual || m.epsTTM,
          marketCap: m.marketCapitalization ? m.marketCapitalization * 1000000 : null,
          revenueGrowth: m.revenueGrowthQuarterlyYoy,
          profitMargins: m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
          returnOnEquity: m.roeTTM ? m.roeTTM / 100 : null,
          currentRatio: m.currentRatioQuarterly,
          debtToEquity: m.totalDebt2TotalEquityQuarterly
        };
      }
    } catch (err) {
      logger.warn(`[Detail] Finnhub metrics failed for ${symbol}: ${err.message}`);
    }

    // Build comprehensive response
    const detail = {
      // Basic Info
      symbol: quote.symbol || symbol,
      name: quote.name || profile?.name || symbol,
      exchange: profile?.exchange,
      currency: profile?.currency || 'USD',
      quoteType: profile?.quoteType,

      // Current Price Data
      price: quote.price,
      previousClose: quote.previousClose,
      open: quote.open,
      dayHigh: quote.high,
      dayLow: quote.low,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      avgVolume: profile?.avgVolume,

      // Key Statistics (from Yahoo Finance)
      marketCap: keyStats.marketCap || quote.marketCap || profile?.marketCap,
      peRatio: keyStats.peRatio,
      forwardPE: keyStats.forwardPE,
      pegRatio: keyStats.pegRatio,
      priceToBook: keyStats.priceToBook,
      eps: keyStats.eps,

      // 52-Week Range
      fiftyTwoWeekHigh: keyStats.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: keyStats.fiftyTwoWeekLow,
      fiftyDayAverage: keyStats.fiftyDayAverage,
      twoHundredDayAverage: keyStats.twoHundredDayAverage,

      // Dividend Info
      dividendYield: keyStats.dividendYield,
      dividendRate: keyStats.dividendRate,

      // Risk & Performance
      beta: keyStats.beta || profile?.beta,

      // Financial Data
      profitMargins: keyStats.profitMargins,
      returnOnEquity: keyStats.returnOnEquity,

      // Company Profile
      sector: keyStats.sector || profile?.sector,
      industry: keyStats.industry || profile?.industry,
      website: keyStats.website || profile?.website,
      description: keyStats.description || profile?.description,
      employees: keyStats.employees || profile?.employees,
      country: keyStats.country || profile?.country,

      // Analyst Data
      targetMeanPrice: keyStats.targetMeanPrice,
      recommendationKey: keyStats.recommendationKey,

      timestamp: new Date().toISOString(),
      provider: quote.provider || 'Multi-source'
    };

    // Add historical data for chart if available
    if (history && history.length > 0) {
      detail.history = history.map(h => ({
        date: h.date,
        open: h.open,
        high: h.high,
        low: h.low,
        close: h.close,
        volume: h.volume
      }));
    }

    res.json(detail);
  } catch (err) {
    logger.error('Get stock detail error:', err);
    res.status(500).json({ error: 'Failed to get stock detail', message: err.message });
  }
});

/**
 * GET /api/market/history/:symbol
 * Uses StockDataManager - DB first, API fallback
 * Supports intraday intervals for short timeframes
 */
router.get('/history/:symbol', [
  query('days').optional().isInt({ min: 1, max: 3650 }).toInt(),
  query('interval').optional().isIn(['1m', '5m', '15m', '30m', '1h', '1d'])
], async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days) || 365;
    const interval = req.query.interval || '1d';

    logger.info(`[API] Fetching history for ${symbol}, days: ${days}, interval: ${interval}`);

    let history;

    // For intraday intervals, fetch directly from Yahoo Finance API
    if (interval !== '1d') {
      // Map days to Yahoo Finance range format
      let range = '1mo';
      if (days <= 1) range = '1d';
      else if (days <= 5) range = '5d';
      else if (days <= 30) range = '1mo';
      else range = '1mo'; // Max for intraday

      history = await marketDataInstance.getHistoricalData(symbol, range, interval);
    } else {
      // Use StockDataManager for daily data (DB first, then API)
      history = await stockDataManager.getHistoricalData(symbol, days);

      // Ensure we only return the requested number of days
      if (history && history.length > days) {
        history = history.slice(-days);
      }
    }

    if (!history || history.length === 0) {
      return res.status(404).json({ error: 'No historical data found for symbol' });
    }

    logger.info(`[API] Successfully retrieved ${history.length} ${interval} candles for ${symbol}`);

    res.json({
      symbol,
      days,
      interval,
      data: history,
      count: history.length
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
    const quote = await marketDataInstance.fetchQuote(searchQuery);

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
 * Returns LIVE market movers from Yahoo Finance - Stocks, Crypto, ETFs, Mutual Funds
 */
router.get('/movers', async (req, res) => {
  try {
    logger.info('[API] Fetching all market movers from Yahoo Finance');
    const movers = await yahooMovers.getAllMovers();
    res.json(movers);
  } catch (err) {
    logger.error('Get movers error:', err);
    res.status(500).json({ error: 'Failed to get movers' });
  }
});

/**
 * GET /api/market/movers/gainers
 * Top gaining stocks
 */
router.get('/movers/gainers', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const gainers = await yahooMovers.getTopGainers(count);
    res.json({ gainers, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get gainers error:', err);
    res.status(500).json({ error: 'Failed to get gainers' });
  }
});

/**
 * GET /api/market/movers/losers
 * Top losing stocks
 */
router.get('/movers/losers', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const losers = await yahooMovers.getTopLosers(count);
    res.json({ losers, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get losers error:', err);
    res.status(500).json({ error: 'Failed to get losers' });
  }
});

/**
 * GET /api/market/movers/active
 * Most active stocks by volume
 */
router.get('/movers/active', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const active = await yahooMovers.getMostActive(count);
    res.json({ active, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get most active error:', err);
    res.status(500).json({ error: 'Failed to get most active' });
  }
});

/**
 * GET /api/market/movers/crypto
 * Top cryptocurrencies
 */
router.get('/movers/crypto', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const crypto = await yahooMovers.getTopCrypto(count);
    res.json({ crypto, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get crypto error:', err);
    res.status(500).json({ error: 'Failed to get crypto' });
  }
});

/**
 * GET /api/market/movers/etfs
 * Top ETFs
 */
router.get('/movers/etfs', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const etfs = await yahooMovers.getTopETFs(count);
    res.json({ etfs, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get ETFs error:', err);
    res.status(500).json({ error: 'Failed to get ETFs' });
  }
});

/**
 * GET /api/market/movers/mutualfunds
 * Top Mutual Funds
 */
router.get('/movers/mutualfunds', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const mutualFunds = await yahooMovers.getTopMutualFunds(count);
    res.json({ mutualFunds, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('Get mutual funds error:', err);
    res.status(500).json({ error: 'Failed to get mutual funds' });
  }
});

// ==================== STOCK DATA MANAGEMENT ENDPOINTS ====================

/**
 * GET /api/market/data/status
 * Get stock data system status
 */
router.get('/data/status', async (req, res) => {
  try {
    const status = await stockDataManager.getStatus();
    const queueStats = jobQueue.getStats();

    res.json({
      stockData: status,
      jobQueue: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Data status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * POST /api/market/data/populate
 * Trigger population of stock data for all existing holdings
 */
router.post('/data/populate', authenticate, async (req, res) => {
  try {
    logger.info('[API] Triggering stock data population');

    const result = await stockDataManager.populateExistingSymbols();

    res.json({
      success: true,
      message: `Queued ${result.queued} symbols for data fetch`,
      total: result.total,
      queued: result.queued
    });
  } catch (err) {
    logger.error('Data populate error:', err);
    res.status(500).json({ error: 'Failed to populate data' });
  }
});

/**
 * POST /api/market/data/fetch/:symbol
 * Trigger data fetch for a specific symbol
 */
router.post('/data/fetch/:symbol', authenticate, async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    logger.info(`[API] Triggering data fetch for ${symbol}`);

    const result = await stockDataManager.onTickerAdded(symbol);

    res.json({
      success: true,
      symbol,
      status: result.status,
      message: result.status === 'queued' ? 'Data fetch queued' :
               result.status === 'exists' ? 'Data already exists, checking for updates' :
               'Data fetch pending'
    });
  } catch (err) {
    logger.error(`Data fetch error for ${req.params.symbol}:`, err);
    res.status(500).json({ error: 'Failed to trigger fetch' });
  }
});

/**
 * POST /api/market/data/update
 * Trigger daily update for all tracked symbols
 */
router.post('/data/update', authenticate, async (req, res) => {
  try {
    logger.info('[API] Triggering daily data update');

    const result = await stockDataManager.runDailyUpdate();

    res.json({
      success: true,
      message: `Queued ${result.queued} symbols for update`,
      total: result.total,
      queued: result.queued
    });
  } catch (err) {
    logger.error('Data update error:', err);
    res.status(500).json({ error: 'Failed to trigger update' });
  }
});

/**
 * GET /api/market/data/tracker/:symbol
 * Get tracker info for a specific symbol
 */
router.get('/data/tracker/:symbol', async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');
    const symbol = req.params.symbol.toUpperCase();

    const tracker = await prisma.stockDataTracker.findUnique({
      where: { symbol }
    });

    if (!tracker) {
      return res.status(404).json({ error: 'Symbol not tracked' });
    }

    // Also get history count
    const historyCount = await prisma.stockHistory.count({
      where: { symbol }
    });

    // Get date range
    const dateRange = await prisma.stockHistory.aggregate({
      where: { symbol },
      _min: { date: true },
      _max: { date: true }
    });

    res.json({
      ...tracker,
      actualHistoryCount: historyCount,
      actualDateRange: {
        start: dateRange._min.date,
        end: dateRange._max.date
      }
    });
  } catch (err) {
    logger.error(`Tracker error for ${req.params.symbol}:`, err);
    res.status(500).json({ error: 'Failed to get tracker' });
  }
});

/**
 * GET /api/market/data/trackers
 * Get all tracked symbols
 */
router.get('/data/trackers', async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const trackers = await prisma.stockDataTracker.findMany({
      take: limit,
      skip: offset,
      orderBy: { updated_at: 'desc' }
    });

    const total = await prisma.stockDataTracker.count();

    res.json({
      trackers,
      total,
      limit,
      offset
    });
  } catch (err) {
    logger.error('Trackers error:', err);
    res.status(500).json({ error: 'Failed to get trackers' });
  }
});

/**
 * GET /api/market/data/history/:symbol
 * Get stored historical data directly from database
 */
router.get('/data/history/:symbol', async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');
    const symbol = req.params.symbol.toUpperCase();
    const limit = parseInt(req.query.limit) || 365;

    const history = await prisma.stockHistory.findMany({
      where: { symbol },
      orderBy: { date: 'desc' },
      take: limit
    });

    if (history.length === 0) {
      return res.status(404).json({
        error: 'No stored history for symbol',
        hint: `POST /api/market/data/fetch/${symbol} to trigger fetch`
      });
    }

    // Reverse to chronological order
    history.reverse();

    res.json({
      symbol,
      count: history.length,
      data: history.map(h => ({
        date: h.date.toISOString().split('T')[0],
        open: h.open,
        high: h.high,
        low: h.low,
        close: h.close,
        adjClose: h.adjClose,
        volume: Number(h.volume),
        changePercent: h.changePercent
      }))
    });
  } catch (err) {
    logger.error(`DB history error for ${req.params.symbol}:`, err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

module.exports = router;
