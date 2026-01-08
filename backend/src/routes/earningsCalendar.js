/**
 * Earnings Calendar Routes - Real data from FMP and Finnhub APIs
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication middleware to all routes
router.use(authenticate);

// Cache configuration
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const earningsCache = {
  data: null,
  timestamp: null,
  params: null
};

// API Keys from environment
const FMP_API_KEY = process.env.FMP_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if cache is still valid
 */
function isCacheValid(cacheKey) {
  if (!earningsCache.data || !earningsCache.timestamp) {
    return false;
  }
  if (earningsCache.params !== cacheKey) {
    return false;
  }
  const now = Date.now();
  return (now - earningsCache.timestamp) < CACHE_TTL_MS;
}

/**
 * Fetch earnings from FMP API (primary source)
 */
async function fetchFromFMP(fromDate, toDate) {
  if (!FMP_API_KEY) {
    logger.warn('FMP_API_KEY not configured');
    return null;
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;
    logger.debug(`Fetching earnings from FMP: ${fromDate} to ${toDate}`);

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data)) {
      logger.info(`FMP returned ${response.data.length} earnings events`);
      return response.data.map(item => ({
        symbol: item.symbol,
        companyName: item.symbol, // FMP doesn't always return company name in calendar
        date: item.date,
        time: mapFMPTime(item.time),
        epsEstimate: parseFloat(item.epsEstimated) || null,
        epsActual: item.eps !== null ? parseFloat(item.eps) : null,
        revenueEstimate: parseFloat(item.revenueEstimated) || null,
        revenueActual: item.revenue !== null ? parseFloat(item.revenue) : null,
        fiscalQuarter: item.fiscalDateEnding ? determineFiscalQuarter(item.fiscalDateEnding) : null,
        fiscalYear: item.fiscalDateEnding ? new Date(item.fiscalDateEnding).getFullYear() : null,
        reported: item.eps !== null && item.eps !== undefined,
        source: 'fmp'
      }));
    }

    return null;
  } catch (error) {
    logger.error('FMP API error:', error.message);
    return null;
  }
}

/**
 * Fetch earnings from Finnhub API (fallback source)
 */
async function fetchFromFinnhub(fromDate, toDate) {
  if (!FINNHUB_API_KEY) {
    logger.warn('FINNHUB_API_KEY not configured');
    return null;
  }

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
    logger.debug(`Fetching earnings from Finnhub: ${fromDate} to ${toDate}`);

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.earningsCalendar && Array.isArray(response.data.earningsCalendar)) {
      logger.info(`Finnhub returned ${response.data.earningsCalendar.length} earnings events`);
      return response.data.earningsCalendar.map(item => ({
        symbol: item.symbol,
        companyName: item.symbol,
        date: item.date,
        time: mapFinnhubTime(item.hour),
        epsEstimate: item.epsEstimate !== null ? parseFloat(item.epsEstimate) : null,
        epsActual: item.epsActual !== null ? parseFloat(item.epsActual) : null,
        revenueEstimate: item.revenueEstimate !== null ? parseFloat(item.revenueEstimate) : null,
        revenueActual: item.revenueActual !== null ? parseFloat(item.revenueActual) : null,
        fiscalQuarter: item.quarter ? `Q${item.quarter}` : null,
        fiscalYear: item.year || null,
        reported: item.epsActual !== null && item.epsActual !== undefined,
        source: 'finnhub'
      }));
    }

    return null;
  } catch (error) {
    logger.error('Finnhub API error:', error.message);
    return null;
  }
}

/**
 * Map FMP time format to BMO/AMC
 */
function mapFMPTime(time) {
  if (!time) return 'TBD';
  const t = time.toLowerCase();
  if (t === 'bmo' || t.includes('before')) return 'BMO';
  if (t === 'amc' || t.includes('after')) return 'AMC';
  return 'TBD';
}

/**
 * Map Finnhub hour to BMO/AMC
 */
function mapFinnhubTime(hour) {
  if (hour === null || hour === undefined) return 'TBD';
  // Finnhub returns hour in 24-hour format
  // Before market opens (before 9:30 AM ET) = BMO
  // After market closes (after 4:00 PM ET) = AMC
  if (hour < 10) return 'BMO';
  if (hour >= 16) return 'AMC';
  return 'TBD';
}

/**
 * Determine fiscal quarter from date
 */
function determineFiscalQuarter(fiscalDateEnding) {
  const date = new Date(fiscalDateEnding);
  const month = date.getMonth() + 1;
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

/**
 * Fetch real earnings data with FMP primary and Finnhub fallback
 */
async function fetchRealEarningsData(fromDate, toDate) {
  const cacheKey = `${fromDate}-${toDate}`;

  // Check cache first
  if (isCacheValid(cacheKey)) {
    logger.debug('Returning cached earnings data');
    return earningsCache.data;
  }

  // Try FMP first
  let earnings = await fetchFromFMP(fromDate, toDate);

  // If FMP fails, try Finnhub as fallback
  if (!earnings || earnings.length === 0) {
    logger.info('FMP returned no data, trying Finnhub fallback');
    earnings = await fetchFromFinnhub(fromDate, toDate);
  }

  // If both fail, return empty array
  if (!earnings) {
    logger.warn('Both FMP and Finnhub failed to return earnings data');
    return [];
  }

  // Update cache
  earningsCache.data = earnings;
  earningsCache.timestamp = Date.now();
  earningsCache.params = cacheKey;

  return earnings;
}

/**
 * Filter earnings by user's watchlist/holdings
 */
async function filterByUserSymbols(earnings, userId, Database) {
  try {
    // Get user's portfolio symbols
    const portfolios = Database.getPortfoliosByUser(userId);
    const holdingSymbols = new Set();

    for (const portfolio of portfolios) {
      const holdings = Database.getHoldingsByPortfolio(portfolio.id);
      holdings.forEach(h => holdingSymbols.add(h.symbol.toUpperCase()));
    }

    // Get user's watchlist symbols if available
    try {
      const watchlist = Database.getWatchlistByUser ? Database.getWatchlistByUser(userId) : [];
      watchlist.forEach(w => holdingSymbols.add(w.symbol.toUpperCase()));
    } catch (e) {
      // Watchlist might not be implemented
    }

    if (holdingSymbols.size === 0) {
      return earnings; // Return all if user has no holdings/watchlist
    }

    return earnings.filter(e => holdingSymbols.has(e.symbol.toUpperCase()));
  } catch (error) {
    logger.error('Error filtering by user symbols:', error.message);
    return earnings;
  }
}

/**
 * GET /api/earnings-calendar/upcoming
 * Get upcoming earnings
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 100;
    const filterByHoldings = req.query.filterByHoldings === 'true';
    const userId = req.user.id;
    const Database = req.app.get('database');

    // Calculate date range
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = formatDate(today);
    const toDate = formatDate(futureDate);

    // Fetch real earnings data
    let earnings = await fetchRealEarningsData(fromDate, toDate);

    // Filter by user's holdings/watchlist if requested
    if (filterByHoldings && earnings.length > 0) {
      earnings = await filterByUserSymbols(earnings, userId, Database);
    }

    // Sort by date and limit
    earnings = earnings
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, limit);

    // Also persist to database via service if available
    const earningsService = req.app.get('earningsCalendarService');
    if (earningsService && earnings.length > 0) {
      try {
        const dbEarnings = earnings.map(e => ({
          symbol: e.symbol,
          company_name: e.companyName,
          earnings_date: e.date,
          fiscal_quarter: e.fiscalQuarter,
          fiscal_year: e.fiscalYear,
          eps_estimate: e.epsEstimate,
          eps_actual: e.epsActual,
          revenue_estimate: e.revenueEstimate,
          revenue_actual: e.revenueActual,
          reported: e.reported,
          time_of_day: e.time,
          currency: 'USD',
          status: e.reported ? 'reported' : 'scheduled'
        }));
        earningsService.upsertEarnings(dbEarnings);
      } catch (e) {
        logger.debug('Could not persist earnings to database:', e.message);
      }
    }

    res.json({
      success: true,
      data: earnings,
      count: earnings.length,
      dateRange: { from: fromDate, to: toDate },
      cached: isCacheValid(`${fromDate}-${toDate}`)
    });
  } catch (error) {
    logger.error('Error fetching upcoming earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming earnings',
      data: [],
      count: 0
    });
  }
});

/**
 * GET /api/earnings-calendar/stats
 * Get earnings statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date();
    monthEnd.setDate(monthEnd.getDate() + 30);

    // Fetch earnings for the month to calculate stats
    const fromDate = formatDate(today);
    const toDate = formatDate(monthEnd);
    const earnings = await fetchRealEarningsData(fromDate, toDate);

    const todayStr = formatDate(today);
    const tomorrowStr = formatDate(tomorrow);
    const weekEndStr = formatDate(weekEnd);

    const stats = {
      today: earnings.filter(e => e.date === todayStr).length,
      tomorrow: earnings.filter(e => e.date === tomorrowStr).length,
      thisWeek: earnings.filter(e => {
        const d = new Date(e.date);
        return d >= today && d <= weekEnd;
      }).length,
      thisMonth: earnings.length,
      dataSource: earnings.length > 0 ? earnings[0].source : 'none'
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching earnings stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings stats',
      data: { today: 0, tomorrow: 0, thisWeek: 0, thisMonth: 0 }
    });
  }
});

/**
 * GET /api/earnings-calendar/symbol/:symbol
 * Get earnings for a specific symbol
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const days = parseInt(req.query.days) || 90;

    // Calculate date range - look back and forward
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = formatDate(pastDate);
    const toDate = formatDate(futureDate);

    const allEarnings = await fetchRealEarningsData(fromDate, toDate);
    const symbolEarnings = allEarnings
      .filter(e => e.symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    res.json({
      success: true,
      data: symbolEarnings,
      count: symbolEarnings.length
    });
  } catch (error) {
    logger.error('Error fetching symbol earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch symbol earnings',
      data: [],
      count: 0
    });
  }
});

/**
 * GET /api/earnings-calendar/date-range
 * Get earnings for a date range
 */
router.get('/date-range', async (req, res) => {
  try {
    const { start, end } = req.query;
    const limit = parseInt(req.query.limit) || 100;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end dates are required'
      });
    }

    const earnings = await fetchRealEarningsData(start, end);
    const limitedEarnings = earnings
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, limit);

    res.json({
      success: true,
      data: limitedEarnings,
      count: limitedEarnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by date range', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by date range',
      data: [],
      count: 0
    });
  }
});

/**
 * GET /api/earnings-calendar/search
 * Search earnings by symbol or company name
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const days = parseInt(req.query.days) || 30;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = formatDate(today);
    const toDate = formatDate(futureDate);

    const allEarnings = await fetchRealEarningsData(fromDate, toDate);
    const searchLower = q.toLowerCase();

    const filteredEarnings = allEarnings
      .filter(e =>
        e.symbol.toLowerCase().includes(searchLower) ||
        (e.companyName && e.companyName.toLowerCase().includes(searchLower))
      )
      .slice(0, limit);

    res.json({
      success: true,
      data: filteredEarnings,
      count: filteredEarnings.length
    });
  } catch (error) {
    logger.error('Error searching earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search earnings',
      data: [],
      count: 0
    });
  }
});

/**
 * GET /api/earnings-calendar/my-earnings
 * Get user's tracked earnings (from holdings/watchlist)
 */
router.get('/my-earnings', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const days = parseInt(req.query.days) || 30;
    const Database = req.app.get('database');

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = formatDate(today);
    const toDate = formatDate(futureDate);

    // Fetch all earnings
    let earnings = await fetchRealEarningsData(fromDate, toDate);

    // Filter by user's holdings
    earnings = await filterByUserSymbols(earnings, userId, Database);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching user tracked earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracked earnings',
      data: [],
      count: 0
    });
  }
});

/**
 * POST /api/earnings-calendar/track
 * Track earnings for a symbol
 */
router.post('/track', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol, shares, alertBeforeDays, notes } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }

    const earningsService = req.app.get('earningsCalendarService');
    if (!earningsService) {
      return res.status(500).json({
        success: false,
        error: 'Earnings service not available'
      });
    }

    const result = earningsService.trackEarnings(
      userId,
      symbol.toUpperCase(),
      shares,
      alertBeforeDays,
      notes
    );

    res.json(result);
  } catch (error) {
    logger.error('Error tracking earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to track earnings'
    });
  }
});

/**
 * DELETE /api/earnings-calendar/track/:symbol
 * Untrack earnings for a symbol
 */
router.delete('/track/:symbol', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol } = req.params;

    const earningsService = req.app.get('earningsCalendarService');
    if (!earningsService) {
      return res.status(500).json({
        success: false,
        error: 'Earnings service not available'
      });
    }

    const result = earningsService.untrackEarnings(userId, symbol.toUpperCase());

    res.json(result);
  } catch (error) {
    logger.error('Error untracking earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to untrack earnings'
    });
  }
});

/**
 * POST /api/earnings-calendar/refresh
 * Force refresh earnings data from API (clears cache)
 */
router.post('/refresh', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Clear cache to force fresh data
    earningsCache.data = null;
    earningsCache.timestamp = null;
    earningsCache.params = null;

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = formatDate(today);
    const toDate = formatDate(futureDate);

    logger.info(`Force refreshing earnings data for next ${days} days...`);
    const earnings = await fetchRealEarningsData(fromDate, toDate);

    // Also update database if service available
    const earningsService = req.app.get('earningsCalendarService');
    if (earningsService && earnings.length > 0) {
      try {
        const dbEarnings = earnings.map(e => ({
          symbol: e.symbol,
          company_name: e.companyName,
          earnings_date: e.date,
          fiscal_quarter: e.fiscalQuarter,
          fiscal_year: e.fiscalYear,
          eps_estimate: e.epsEstimate,
          eps_actual: e.epsActual,
          revenue_estimate: e.revenueEstimate,
          revenue_actual: e.revenueActual,
          reported: e.reported,
          time_of_day: e.time,
          currency: 'USD',
          status: e.reported ? 'reported' : 'scheduled'
        }));
        earningsService.upsertEarnings(dbEarnings);
      } catch (e) {
        logger.debug('Could not persist refreshed earnings to database:', e.message);
      }
    }

    res.json({
      success: true,
      message: `Refreshed ${earnings.length} earnings events`,
      count: earnings.length,
      source: earnings.length > 0 ? earnings[0].source : 'none'
    });
  } catch (error) {
    logger.error('Error refreshing earnings data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh earnings data'
    });
  }
});

/**
 * GET /api/earnings-calendar/fiscal-quarter/:quarter/:year
 * Get earnings by fiscal quarter
 */
router.get('/fiscal-quarter/:quarter/:year', async (req, res) => {
  try {
    const { quarter, year } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    // Map quarter to approximate date range
    const quarterMap = {
      'Q1': { start: `${year}-01-01`, end: `${year}-04-15` },
      'Q2': { start: `${year}-04-01`, end: `${year}-07-15` },
      'Q3': { start: `${year}-07-01`, end: `${year}-10-15` },
      'Q4': { start: `${year}-10-01`, end: `${parseInt(year) + 1}-01-15` }
    };

    const range = quarterMap[quarter.toUpperCase()];
    if (!range) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quarter. Use Q1, Q2, Q3, or Q4'
      });
    }

    const earnings = await fetchRealEarningsData(range.start, range.end);
    const filteredEarnings = earnings
      .filter(e => e.fiscalQuarter === quarter.toUpperCase() && e.fiscalYear === parseInt(year))
      .slice(0, limit);

    res.json({
      success: true,
      data: filteredEarnings,
      count: filteredEarnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by fiscal quarter', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by fiscal quarter',
      data: [],
      count: 0
    });
  }
});

/**
 * GET /api/earnings-calendar/status/:status
 * Get earnings by status (scheduled/reported)
 */
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const days = parseInt(req.query.days) || 30;

    if (!['scheduled', 'reported'].includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Use "scheduled" or "reported"'
      });
    }

    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = status === 'reported' ? formatDate(pastDate) : formatDate(today);
    const toDate = formatDate(futureDate);

    const earnings = await fetchRealEarningsData(fromDate, toDate);
    const isReported = status.toLowerCase() === 'reported';

    const filteredEarnings = earnings
      .filter(e => e.reported === isReported)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    res.json({
      success: true,
      data: filteredEarnings,
      count: filteredEarnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by status',
      data: [],
      count: 0
    });
  }
});

module.exports = router;
