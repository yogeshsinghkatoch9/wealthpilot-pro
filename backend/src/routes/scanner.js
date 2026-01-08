/**
 * Stock Scanner Routes
 * Provides market scanning capabilities with presets and custom filters
 * Uses real data from Yahoo Finance movers and FMP stock screener
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const yahooMovers = require('../services/yahooMovers');

// FMP API Key
const FMP_KEY = process.env.FMP_API_KEY;

// Cache for scanner results (1 minute TTL)
const scannerCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

function getCached(key) {
  const cached = scannerCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`[Scanner] Cache HIT: ${key}`);
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  scannerCache.set(key, { data, timestamp: Date.now() });
}

// Scanner presets
const PRESETS = {
  gainers: {
    name: 'Top Gainers',
    description: 'Stocks with highest daily gains',
    useYahooMovers: 'gainers',
    sortBy: 'changePercent',
    sortOrder: 'desc'
  },
  losers: {
    name: 'Top Losers',
    description: 'Stocks with highest daily losses',
    useYahooMovers: 'losers',
    sortBy: 'changePercent',
    sortOrder: 'asc'
  },
  volume: {
    name: 'Most Active',
    description: 'Most actively traded stocks by volume',
    useYahooMovers: 'active',
    sortBy: 'volume',
    sortOrder: 'desc'
  },
  breakout: {
    name: 'Breakouts',
    description: 'Stocks near 52-week highs with strong momentum',
    useFMPScreener: true,
    fmpParams: {
      priceMoreThan: 5,
      volumeMoreThan: 500000,
      betaMoreThan: 1.2
    },
    sortBy: 'changePercent',
    sortOrder: 'desc'
  },
  oversold: {
    name: 'Oversold',
    description: 'Potentially oversold stocks (value plays)',
    useFMPScreener: true,
    fmpParams: {
      priceMoreThan: 5,
      volumeMoreThan: 100000,
      betaLowerThan: 1.5
    },
    sortBy: 'changePercent',
    sortOrder: 'asc'
  },
  overbought: {
    name: 'Overbought',
    description: 'Stocks with strong recent gains (potential pullback)',
    useYahooMovers: 'gainers',
    sortBy: 'changePercent',
    sortOrder: 'desc'
  },
  earnings: {
    name: 'Earnings Movers',
    description: 'High volume stocks (potential earnings plays)',
    useYahooMovers: 'active',
    sortBy: 'volume',
    sortOrder: 'desc'
  },
  dividend: {
    name: 'High Dividend',
    description: 'Dividend yield above 3%',
    useFMPScreener: true,
    fmpParams: {
      dividendMoreThan: 3,
      marketCapMoreThan: 1000000000,
      volumeMoreThan: 100000
    },
    sortBy: 'dividendYield',
    sortOrder: 'desc'
  },
  undervalued: {
    name: 'Undervalued',
    description: 'Low P/E ratio stocks (potential value)',
    useFMPScreener: true,
    fmpParams: {
      peRatioLowerThan: 15,
      peRatioMoreThan: 0,
      marketCapMoreThan: 500000000,
      volumeMoreThan: 100000
    },
    sortBy: 'pe',
    sortOrder: 'asc'
  },
  growth: {
    name: 'Growth Stocks',
    description: 'Technology sector growth stocks',
    useFMPScreener: true,
    fmpParams: {
      sector: 'Technology',
      marketCapMoreThan: 1000000000,
      volumeMoreThan: 500000
    },
    sortBy: 'marketCap',
    sortOrder: 'desc'
  }
};

/**
 * Fetch stocks from FMP screener API
 */
async function fetchFMPScreener(params = {}) {
  if (!FMP_KEY) {
    logger.warn('[Scanner] FMP API key not configured');
    return [];
  }

  const cacheKey = `fmp_screener_${JSON.stringify(params)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const queryParams = {
      apikey: FMP_KEY,
      limit: 50,
      ...params
    };

    const url = 'https://financialmodelingprep.com/api/v3/stock-screener';
    const response = await axios.get(url, {
      params: queryParams,
      timeout: 10000
    });

    if (!response.data || !Array.isArray(response.data)) {
      logger.warn('[Scanner] FMP screener returned no data');
      return [];
    }

    const results = response.data.map(stock => formatFMPStock(stock));
    setCache(cacheKey, results);
    return results;
  } catch (err) {
    logger.error(`[Scanner] FMP screener error: ${err.message}`);
    return [];
  }
}

/**
 * Format FMP stock data to standard format
 */
function formatFMPStock(stock) {
  const avgVolume = stock.volume || 1;
  const volumeRatio = avgVolume > 0 ? stock.volume / avgVolume : 1;

  return {
    symbol: stock.symbol,
    name: stock.companyName || stock.symbol,
    sector: stock.sector || 'Unknown',
    price: stock.price || 0,
    change: stock.price && stock.lastAnnualDividend
      ? (stock.price * (stock.changesPercentage || 0) / 100)
      : 0,
    changePercent: stock.changesPercentage || 0,
    volume: stock.volume || 0,
    avgVolume: avgVolume,
    marketCap: stock.marketCap || 0,
    pe: stock.peRatio || null,
    dividendYield: stock.lastAnnualDividend && stock.price
      ? (stock.lastAnnualDividend / stock.price * 100)
      : 0,
    beta: stock.beta || 1,
    volumeRatio: volumeRatio,
    volumeRatioDisplay: volumeRatio.toFixed(2) + 'x',
    exchange: stock.exchange || 'Unknown',
    country: stock.country || 'US',
    signal: determineSignal({
      changePercent: stock.changesPercentage || 0,
      rsi: null,
      volume: stock.volume || 0,
      avgVolume: avgVolume,
      dividendYield: stock.lastAnnualDividend && stock.price
        ? (stock.lastAnnualDividend / stock.price * 100)
        : 0
    })
  };
}

/**
 * Format Yahoo movers data to standard format
 */
function formatYahooStock(stock) {
  const avgVolume = stock.avgVolume || stock.volume || 1;
  const volumeRatio = avgVolume > 0 ? (stock.volume || 0) / avgVolume : 1;

  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    sector: stock.sector || 'Unknown',
    price: stock.price || 0,
    change: stock.change || 0,
    changePercent: stock.changePercent || 0,
    volume: stock.volume || 0,
    avgVolume: avgVolume,
    marketCap: stock.marketCap || 0,
    pe: stock.pe || null,
    dividendYield: stock.dividendYield || 0,
    rsi: stock.rsi || null,
    volumeRatio: volumeRatio,
    volumeRatioDisplay: volumeRatio.toFixed(2) + 'x',
    week52High: stock.fiftyTwoWeekHigh || stock.price * 1.1,
    week52Low: stock.fiftyTwoWeekLow || stock.price * 0.7,
    signal: determineSignal({
      changePercent: stock.changePercent || 0,
      rsi: stock.rsi,
      volume: stock.volume || 0,
      avgVolume: avgVolume,
      dividendYield: stock.dividendYield || 0
    })
  };
}

/**
 * Determine signal based on technical indicators
 */
function determineSignal(stock) {
  if (stock.changePercent > 10) return { type: 'BREAKOUT', color: 'emerald' };
  if (stock.changePercent > 5) return { type: 'STRONG BUY', color: 'emerald' };
  if (stock.rsi && stock.rsi < 30) return { type: 'OVERSOLD', color: 'amber' };
  if (stock.rsi && stock.rsi > 70) return { type: 'OVERBOUGHT', color: 'red' };
  if (stock.avgVolume && stock.volume / stock.avgVolume > 2) return { type: 'VOLUME', color: 'sky' };
  if (stock.dividendYield > 4) return { type: 'DIVIDEND', color: 'purple' };
  if (stock.changePercent < -5) return { type: 'SELLOFF', color: 'red' };
  if (stock.changePercent < -2) return { type: 'WEAK', color: 'orange' };
  if (stock.changePercent > 2) return { type: 'BULLISH', color: 'green' };
  return { type: 'NEUTRAL', color: 'slate' };
}

/**
 * Apply custom filters to results
 */
function applyFilters(results, filters) {
  let filtered = [...results];

  if (filters.minChange !== undefined) {
    filtered = filtered.filter(s => s.changePercent >= filters.minChange);
  }
  if (filters.maxChange !== undefined) {
    filtered = filtered.filter(s => s.changePercent <= filters.maxChange);
  }
  if (filters.minRsi !== undefined) {
    filtered = filtered.filter(s => s.rsi !== null && s.rsi >= filters.minRsi);
  }
  if (filters.maxRsi !== undefined) {
    filtered = filtered.filter(s => s.rsi !== null && s.rsi <= filters.maxRsi);
  }
  if (filters.minDividendYield !== undefined) {
    filtered = filtered.filter(s => s.dividendYield >= filters.minDividendYield);
  }
  if (filters.maxDividendYield !== undefined) {
    filtered = filtered.filter(s => s.dividendYield <= filters.maxDividendYield);
  }
  if (filters.sector && filters.sector !== 'All') {
    filtered = filtered.filter(s => s.sector === filters.sector);
  }
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter(s => s.price >= filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter(s => s.price <= filters.maxPrice);
  }
  if (filters.minMarketCap !== undefined) {
    filtered = filtered.filter(s => s.marketCap >= filters.minMarketCap);
  }
  if (filters.maxMarketCap !== undefined) {
    filtered = filtered.filter(s => s.marketCap <= filters.maxMarketCap);
  }
  if (filters.minVolume !== undefined) {
    filtered = filtered.filter(s => s.volume >= filters.minVolume);
  }
  if (filters.maxVolume !== undefined) {
    filtered = filtered.filter(s => s.volume <= filters.maxVolume);
  }
  if (filters.minPe !== undefined) {
    filtered = filtered.filter(s => s.pe !== null && s.pe >= filters.minPe);
  }
  if (filters.maxPe !== undefined) {
    filtered = filtered.filter(s => s.pe !== null && s.pe <= filters.maxPe);
  }
  if (filters.minVolumeRatio !== undefined) {
    filtered = filtered.filter(s => s.volumeRatio >= filters.minVolumeRatio);
  }
  if (filters.maxVolumeRatio !== undefined) {
    filtered = filtered.filter(s => s.volumeRatio <= filters.maxVolumeRatio);
  }

  return filtered;
}

/**
 * Sort results by specified field
 */
function sortResults(results, sortBy, sortOrder) {
  return results.sort((a, b) => {
    const aVal = a[sortBy] || 0;
    const bVal = b[sortBy] || 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Fetch scanner data based on preset or custom filters
 */
async function fetchScannerData(filters = {}, presetKey = null) {
  const cacheKey = `scanner_${presetKey || 'custom'}_${JSON.stringify(filters)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let results = [];
  const preset = presetKey ? PRESETS[presetKey] : null;

  try {
    // Use Yahoo Movers for gainers, losers, active presets
    if (preset?.useYahooMovers) {
      logger.info(`[Scanner] Using Yahoo Movers: ${preset.useYahooMovers}`);

      switch (preset.useYahooMovers) {
        case 'gainers':
          results = await yahooMovers.getTopGainers(50);
          break;
        case 'losers':
          results = await yahooMovers.getTopLosers(50);
          break;
        case 'active':
          results = await yahooMovers.getMostActive(50);
          break;
        default:
          results = await yahooMovers.getTopGainers(50);
      }

      results = results.map(formatYahooStock);
    }
    // Use FMP screener for custom filters and other presets
    else if (preset?.useFMPScreener || !preset) {
      const fmpParams = preset?.fmpParams || {};

      // Build FMP params from filters
      if (filters.minPrice) fmpParams.priceMoreThan = filters.minPrice;
      if (filters.maxPrice) fmpParams.priceLowerThan = filters.maxPrice;
      if (filters.minMarketCap) fmpParams.marketCapMoreThan = filters.minMarketCap;
      if (filters.maxMarketCap) fmpParams.marketCapLowerThan = filters.maxMarketCap;
      if (filters.minVolume) fmpParams.volumeMoreThan = filters.minVolume;
      if (filters.minDividendYield) fmpParams.dividendMoreThan = filters.minDividendYield;
      if (filters.maxPe) fmpParams.peRatioLowerThan = filters.maxPe;
      if (filters.minPe) fmpParams.peRatioMoreThan = filters.minPe;
      if (filters.sector && filters.sector !== 'All') fmpParams.sector = filters.sector;

      logger.info(`[Scanner] Using FMP Screener with params: ${JSON.stringify(fmpParams)}`);
      results = await fetchFMPScreener(fmpParams);
    }

    // Apply additional client-side filters
    results = applyFilters(results, filters);

    // Sort results
    const sortBy = filters.sortBy || preset?.sortBy || 'changePercent';
    const sortOrder = filters.sortOrder || preset?.sortOrder || 'desc';
    results = sortResults(results, sortBy, sortOrder);

    setCache(cacheKey, results);
    return results;

  } catch (err) {
    logger.error(`[Scanner] Error fetching data: ${err.message}`);
    return [];
  }
}

/**
 * GET /api/scanner/presets
 * List available scanner presets
 */
router.get('/presets', (req, res) => {
  res.json({
    success: true,
    presets: Object.entries(PRESETS).map(([key, preset]) => ({
      id: key,
      name: preset.name,
      description: preset.description
    }))
  });
});

/**
 * GET /api/scanner/scan
 * Run stock scanner with filters
 */
router.get('/scan', async (req, res) => {
  try {
    const {
      preset,
      sector,
      minPrice,
      maxPrice,
      minChange,
      maxChange,
      minRsi,
      maxRsi,
      minDividendYield,
      maxDividendYield,
      minMarketCap,
      maxMarketCap,
      minVolume,
      maxVolume,
      minVolumeRatio,
      maxVolumeRatio,
      minPe,
      maxPe,
      sortBy,
      sortOrder,
      limit
    } = req.query;

    // Build filters from query params
    let filters = {};

    // If preset exists, get its default filters
    if (preset && PRESETS[preset]) {
      const presetConfig = PRESETS[preset];
      if (presetConfig.fmpParams) {
        filters = { ...presetConfig.fmpParams };
      }
      filters.sortBy = presetConfig.sortBy;
      filters.sortOrder = presetConfig.sortOrder;
    }

    // Override with explicit filters
    if (sector) filters.sector = sector;
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice);
    if (minChange) filters.minChange = parseFloat(minChange);
    if (maxChange) filters.maxChange = parseFloat(maxChange);
    if (minRsi) filters.minRsi = parseFloat(minRsi);
    if (maxRsi) filters.maxRsi = parseFloat(maxRsi);
    if (minDividendYield) filters.minDividendYield = parseFloat(minDividendYield);
    if (maxDividendYield) filters.maxDividendYield = parseFloat(maxDividendYield);
    if (minMarketCap) filters.minMarketCap = parseFloat(minMarketCap);
    if (maxMarketCap) filters.maxMarketCap = parseFloat(maxMarketCap);
    if (minVolume) filters.minVolume = parseFloat(minVolume);
    if (maxVolume) filters.maxVolume = parseFloat(maxVolume);
    if (minVolumeRatio) filters.minVolumeRatio = parseFloat(minVolumeRatio);
    if (maxVolumeRatio) filters.maxVolumeRatio = parseFloat(maxVolumeRatio);
    if (minPe) filters.minPe = parseFloat(minPe);
    if (maxPe) filters.maxPe = parseFloat(maxPe);
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    // Fetch scanner results with real data
    let results = await fetchScannerData(filters, preset);

    // Apply limit
    const resultLimit = parseInt(limit) || 50;
    results = results.slice(0, resultLimit);

    logger.info(`[Scanner] Returning ${results.length} results for preset: ${preset || 'custom'}`);

    res.json({
      success: true,
      count: results.length,
      filters: {
        preset: preset || null,
        sector: filters.sector || 'All',
        priceRange: { min: filters.minPrice, max: filters.maxPrice },
        changeRange: { min: filters.minChange, max: filters.maxChange },
        rsiRange: { min: filters.minRsi, max: filters.maxRsi },
        volumeRange: { min: filters.minVolume, max: filters.maxVolume },
        volumeRatioRange: { min: filters.minVolumeRatio, max: filters.maxVolumeRatio },
        peRange: { min: filters.minPe, max: filters.maxPe },
        sortBy: filters.sortBy || 'changePercent',
        sortOrder: filters.sortOrder || 'desc'
      },
      results
    });
  } catch (error) {
    logger.error('Scanner error:', error);
    res.status(500).json({ success: false, error: 'Scanner failed' });
  }
});

/**
 * GET /api/scanner/movers
 * Get top market movers (gainers, losers, most active)
 */
router.get('/movers', async (req, res) => {
  try {
    const cacheKey = 'movers_all';
    const cached = getCached(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        ...cached
      });
    }

    logger.info('[Scanner] Fetching real market movers from Yahoo Finance');

    // Fetch all movers in parallel
    const [gainersRaw, losersRaw, activeRaw] = await Promise.all([
      yahooMovers.getTopGainers(10),
      yahooMovers.getTopLosers(10),
      yahooMovers.getMostActive(10)
    ]);

    // Format results
    const gainers = gainersRaw.map(formatYahooStock);
    const losers = losersRaw.map(formatYahooStock);
    const mostActive = activeRaw.map(formatYahooStock);

    const result = { gainers, losers, mostActive };
    setCache(cacheKey, result);

    logger.info(`[Scanner] Movers fetched - Gainers: ${gainers.length}, Losers: ${losers.length}, Active: ${mostActive.length}`);

    res.json({
      success: true,
      gainers,
      losers,
      mostActive
    });
  } catch (error) {
    logger.error('Movers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get movers',
      gainers: [],
      losers: [],
      mostActive: []
    });
  }
});

/**
 * POST /api/scanner/save
 * Save a custom scanner configuration
 */
router.post('/save', authenticate, async (req, res) => {
  try {
    const { name, filters } = req.body;

    // In a full implementation, this would save to database
    res.json({
      success: true,
      message: `Scanner "${name}" saved successfully`,
      scannerId: `custom_${Date.now()}`
    });
  } catch (error) {
    logger.error('Save scanner error:', error);
    res.status(500).json({ success: false, error: 'Failed to save scanner' });
  }
});

/**
 * GET /api/scanner/saved
 * Get user's saved scanners
 */
router.get('/saved', authenticate, async (req, res) => {
  try {
    // Mock saved scanners - in production, fetch from database
    const savedScanners = [
      { id: 'momentum', name: 'Momentum Plays', description: 'High volume gainers', filters: { minChange: 3, minVolumeRatio: 2 } },
      { id: 'value', name: 'Value Stocks', description: 'P/E < 15, Div > 2%', filters: { maxPe: 15, minDividendYield: 2 } },
      { id: 'smallcap', name: 'Small Cap Growth', description: '$300M-$2B market cap', filters: { minMarketCap: 300000000, maxMarketCap: 2000000000 } },
      { id: 'highdiv', name: 'Dividend Champions', description: 'Yield > 4%', filters: { minDividendYield: 4 } }
    ];

    res.json({
      success: true,
      scanners: savedScanners
    });
  } catch (error) {
    logger.error('Get saved scanners error:', error);
    res.status(500).json({ success: false, error: 'Failed to get saved scanners' });
  }
});

module.exports = router;
