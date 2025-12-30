/**
 * Stock Scanner Routes
 * Provides market scanning capabilities with presets and custom filters
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

// Popular stocks for scanning (when FMP API not available)
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
  'NFLX', 'ADBE', 'PYPL', 'SQ', 'SHOP', 'COIN', 'PLTR', 'SNOW', 'NET', 'DDOG',
  'ZM', 'DOCU', 'TWLO', 'OKTA', 'CRWD', 'ZS', 'MDB', 'TEAM', 'NOW', 'WDAY',
  'JPM', 'BAC', 'GS', 'MS', 'C', 'WFC', 'V', 'MA', 'AXP', 'BLK',
  'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'MRNA',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'OXY', 'HAL'
];

// Scanner presets
const PRESETS = {
  gainers: {
    name: 'Top Gainers',
    description: 'Stocks with highest daily gains',
    minChange: 5,
    sortBy: 'changePercent',
    sortOrder: 'desc'
  },
  losers: {
    name: 'Top Losers',
    description: 'Stocks with highest daily losses',
    maxChange: -5,
    sortBy: 'changePercent',
    sortOrder: 'asc'
  },
  volume: {
    name: 'High Volume',
    description: 'Unusual volume activity',
    minVolumeRatio: 2,
    sortBy: 'volumeRatio',
    sortOrder: 'desc'
  },
  breakout: {
    name: 'Breakouts',
    description: 'Stocks breaking 52-week highs',
    near52WeekHigh: true,
    sortBy: 'distanceFrom52High',
    sortOrder: 'desc'
  },
  oversold: {
    name: 'Oversold RSI',
    description: 'RSI below 30 (potential bounce)',
    maxRsi: 30,
    sortBy: 'rsi',
    sortOrder: 'asc'
  },
  overbought: {
    name: 'Overbought RSI',
    description: 'RSI above 70 (potential pullback)',
    minRsi: 70,
    sortBy: 'rsi',
    sortOrder: 'desc'
  },
  earnings: {
    name: 'Earnings Soon',
    description: 'Reporting earnings within 7 days',
    earningsWithin: 7,
    sortBy: 'earningsDate',
    sortOrder: 'asc'
  },
  dividend: {
    name: 'High Dividend',
    description: 'Dividend yield above 4%',
    minDividendYield: 4,
    sortBy: 'dividendYield',
    sortOrder: 'desc'
  }
};

/**
 * Generate mock scanner data (fallback when APIs unavailable)
 */
function generateMockScannerData(filters = {}, preset = null) {
  const mockStocks = [
    { symbol: 'SMCI', name: 'Super Micro Computer', sector: 'Technology', price: 42.85, change: 7.89, changePercent: 18.4, volume: 45200000, avgVolume: 15000000, marketCap: 25000000000, rsi: 58, pe: 22.5, dividendYield: 0 },
    { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Technology', price: 71.24, change: 8.09, changePercent: 12.8, volume: 89400000, avgVolume: 45000000, marketCap: 158000000000, rsi: 78, pe: 180, dividendYield: 0 },
    { symbol: 'RIVN', name: 'Rivian Automotive', sector: 'Consumer Cyclical', price: 14.87, change: 1.25, changePercent: 9.2, volume: 67800000, avgVolume: 25000000, marketCap: 15000000000, rsi: 42, pe: -5, dividendYield: 0 },
    { symbol: 'MARA', name: 'Marathon Digital', sector: 'Financial Services', price: 24.56, change: 1.96, changePercent: 8.7, volume: 52100000, avgVolume: 20000000, marketCap: 7800000000, rsi: 55, pe: -10, dividendYield: 0 },
    { symbol: 'SOUN', name: 'SoundHound AI', sector: 'Technology', price: 8.42, change: 0.59, changePercent: 7.5, volume: 38900000, avgVolume: 18000000, marketCap: 2800000000, rsi: 62, pe: -15, dividendYield: 0 },
    { symbol: 'IONQ', name: 'IonQ Inc', sector: 'Technology', price: 42.18, change: 2.72, changePercent: 6.9, volume: 24500000, avgVolume: 12000000, marketCap: 9200000000, rsi: 72, pe: -25, dividendYield: 0 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', price: 138.85, change: 6.42, changePercent: 4.8, volume: 312000000, avgVolume: 280000000, marketCap: 3400000000000, rsi: 65, pe: 65, dividendYield: 0.03 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', price: 125.50, change: 5.25, changePercent: 4.4, volume: 58000000, avgVolume: 45000000, marketCap: 203000000000, rsi: 58, pe: 120, dividendYield: 0 },
    { symbol: 'COIN', name: 'Coinbase Global', sector: 'Financial Services', price: 278.90, change: 10.50, changePercent: 3.9, volume: 8500000, avgVolume: 6000000, marketCap: 70000000000, rsi: 68, pe: 45, dividendYield: 0 },
    { symbol: 'TSLA', name: 'Tesla Inc', sector: 'Consumer Cyclical', price: 421.06, change: 14.23, changePercent: 3.5, volume: 95000000, avgVolume: 85000000, marketCap: 1350000000000, rsi: 61, pe: 115, dividendYield: 0 },
    { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', price: 254.49, change: 4.12, changePercent: 1.6, volume: 42000000, avgVolume: 55000000, marketCap: 3900000000000, rsi: 52, pe: 32, dividendYield: 0.44 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', price: 438.23, change: 5.87, changePercent: 1.4, volume: 18000000, avgVolume: 22000000, marketCap: 3260000000000, rsi: 55, pe: 37, dividendYield: 0.72 },
    { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services', price: 242.50, change: 2.10, changePercent: 0.9, volume: 8500000, avgVolume: 9000000, marketCap: 698000000000, rsi: 58, pe: 13, dividendYield: 2.1 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', price: 145.80, change: -1.20, changePercent: -0.8, volume: 6200000, avgVolume: 7500000, marketCap: 350000000000, rsi: 45, pe: 15, dividendYield: 3.2 },
    { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', price: 108.45, change: -2.35, changePercent: -2.1, volume: 15000000, avgVolume: 18000000, marketCap: 480000000000, rsi: 38, pe: 14, dividendYield: 3.5 },
    { symbol: 'VZ', name: 'Verizon Communications', sector: 'Communication Services', price: 40.12, change: -1.88, changePercent: -4.5, volume: 22000000, avgVolume: 18000000, marketCap: 169000000000, rsi: 28, pe: 9, dividendYield: 6.5 },
    { symbol: 'T', name: 'AT&T Inc', sector: 'Communication Services', price: 22.45, change: -1.15, changePercent: -4.9, volume: 35000000, avgVolume: 28000000, marketCap: 161000000000, rsi: 25, pe: 11, dividendYield: 5.0 },
    { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology', price: 19.85, change: -1.45, changePercent: -6.8, volume: 68000000, avgVolume: 45000000, marketCap: 85000000000, rsi: 22, pe: -8, dividendYield: 2.5 }
  ];

  let results = [...mockStocks];

  // Apply filters
  if (filters.minChange !== undefined) {
    results = results.filter(s => s.changePercent >= filters.minChange);
  }
  if (filters.maxChange !== undefined) {
    results = results.filter(s => s.changePercent <= filters.maxChange);
  }
  if (filters.minRsi !== undefined) {
    results = results.filter(s => s.rsi >= filters.minRsi);
  }
  if (filters.maxRsi !== undefined) {
    results = results.filter(s => s.rsi <= filters.maxRsi);
  }
  if (filters.minDividendYield !== undefined) {
    results = results.filter(s => s.dividendYield >= filters.minDividendYield);
  }
  if (filters.sector && filters.sector !== 'All') {
    results = results.filter(s => s.sector === filters.sector);
  }
  if (filters.minPrice !== undefined) {
    results = results.filter(s => s.price >= filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    results = results.filter(s => s.price <= filters.maxPrice);
  }
  if (filters.minMarketCap !== undefined) {
    results = results.filter(s => s.marketCap >= filters.minMarketCap);
  }
  if (filters.maxMarketCap !== undefined) {
    results = results.filter(s => s.marketCap <= filters.maxMarketCap);
  }

  // Calculate additional fields
  results = results.map(stock => ({
    ...stock,
    volumeRatio: (stock.volume / stock.avgVolume).toFixed(2),
    week52High: stock.price * (1 + Math.random() * 0.1),
    week52Low: stock.price * (1 - Math.random() * 0.3),
    signal: determineSignal(stock)
  }));

  // Sort
  const sortBy = filters.sortBy || 'changePercent';
  const sortOrder = filters.sortOrder || 'desc';
  results.sort((a, b) => {
    const aVal = a[sortBy] || 0;
    const bVal = b[sortBy] || 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return results;
}

/**
 * Determine signal based on technical indicators
 */
function determineSignal(stock) {
  if (stock.changePercent > 10) return { type: 'BREAKOUT', color: 'emerald' };
  if (stock.changePercent > 5) return { type: '52W HIGH', color: 'emerald' };
  if (stock.rsi < 30) return { type: 'OVERSOLD', color: 'amber' };
  if (stock.rsi > 70) return { type: 'OVERBOUGHT', color: 'red' };
  if (stock.volume / stock.avgVolume > 2) return { type: 'VOLUME', color: 'sky' };
  if (stock.dividendYield > 4) return { type: 'DIVIDEND', color: 'purple' };
  if (stock.changePercent < -5) return { type: 'SELLOFF', color: 'red' };
  return { type: 'NEUTRAL', color: 'slate' };
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
      minMarketCap,
      maxMarketCap,
      minVolume,
      sortBy,
      sortOrder,
      limit
    } = req.query;

    // Build filters from query params or preset
    let filters = {};

    if (preset && PRESETS[preset]) {
      filters = { ...PRESETS[preset] };
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
    if (minMarketCap) filters.minMarketCap = parseFloat(minMarketCap);
    if (maxMarketCap) filters.maxMarketCap = parseFloat(maxMarketCap);
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    // Get scanner results (mock data for now)
    let results = generateMockScannerData(filters, preset);

    // Apply limit
    const resultLimit = parseInt(limit) || 50;
    results = results.slice(0, resultLimit);

    res.json({
      success: true,
      count: results.length,
      filters: {
        preset: preset || null,
        sector: filters.sector || 'All',
        priceRange: { min: filters.minPrice, max: filters.maxPrice },
        changeRange: { min: filters.minChange, max: filters.maxChange },
        rsiRange: { min: filters.minRsi, max: filters.maxRsi },
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
 * Get top market movers (gainers and losers)
 */
router.get('/movers', async (req, res) => {
  try {
    const allStocks = generateMockScannerData({});

    const gainers = allStocks
      .filter(s => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);

    const losers = allStocks
      .filter(s => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 10);

    const mostActive = allStocks
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    res.json({
      success: true,
      gainers,
      losers,
      mostActive
    });
  } catch (error) {
    logger.error('Movers error:', error);
    res.status(500).json({ success: false, error: 'Failed to get movers' });
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
    // Mock saved scanners
    const savedScanners = [
      { id: 'momentum', name: 'Momentum Plays', description: 'RSI > 60, Vol > 2x', filters: { minRsi: 60, minVolumeRatio: 2 } },
      { id: 'value', name: 'Value Stocks', description: 'P/E < 15, Div > 2%', filters: { maxPe: 15, minDividendYield: 2 } },
      { id: 'smallcap', name: 'Small Cap Growth', description: '$300M-$2B, +50% YoY', filters: { minMarketCap: 300000000, maxMarketCap: 2000000000 } },
      { id: 'squeeze', name: 'Short Squeeze', description: 'SI > 20%, Days < 5', filters: { minShortInterest: 20 } }
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
