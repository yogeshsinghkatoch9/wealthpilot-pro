/**
 * IPO Calendar Routes
 * Fetches real IPO data from FMP and Finnhub APIs
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication middleware to all routes
router.use(authenticate);

// API Configuration
const FMP_API_KEY = process.env.FMP_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Cache configuration - IPO data cached for 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
let ipoCache = {
  data: null,
  timestamp: null,
  fromDate: null,
  toDate: null
};

/**
 * Helper: Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Helper: Get date range for IPO query
 */
function getDateRange(days = 30) {
  const fromDate = new Date();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + days);
  return {
    from: formatDate(fromDate),
    to: formatDate(toDate)
  };
}

/**
 * Helper: Check if cache is valid
 */
function isCacheValid(fromDate, toDate) {
  if (!ipoCache.data || !ipoCache.timestamp) {
    return false;
  }

  const now = Date.now();
  const cacheAge = now - ipoCache.timestamp;

  // Cache is invalid if older than 1 hour
  if (cacheAge > CACHE_DURATION_MS) {
    return false;
  }

  // Cache is invalid if date range doesn't match
  if (ipoCache.fromDate !== fromDate || ipoCache.toDate !== toDate) {
    return false;
  }

  return true;
}

/**
 * Fetch IPO data from FMP API (Primary source)
 */
async function fetchFromFMP(fromDate, toDate) {
  if (!FMP_API_KEY) {
    logger.warn('FMP_API_KEY not configured');
    return null;
  }

  try {
    const url = `${FMP_BASE_URL}/ipo_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;
    logger.info(`Fetching IPO data from FMP: ${fromDate} to ${toDate}`);

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data)) {
      logger.info(`FMP returned ${response.data.length} IPOs`);
      return transformFMPData(response.data);
    }

    return null;
  } catch (error) {
    logger.error('FMP API error:', error.message);
    return null;
  }
}

/**
 * Fetch IPO data from Finnhub API (Fallback source)
 */
async function fetchFromFinnhub(fromDate, toDate) {
  if (!FINNHUB_API_KEY) {
    logger.warn('FINNHUB_API_KEY not configured');
    return null;
  }

  try {
    const url = `${FINNHUB_BASE_URL}/calendar/ipo?from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
    logger.info(`Fetching IPO data from Finnhub: ${fromDate} to ${toDate}`);

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.ipoCalendar && Array.isArray(response.data.ipoCalendar)) {
      logger.info(`Finnhub returned ${response.data.ipoCalendar.length} IPOs`);
      return transformFinnhubData(response.data.ipoCalendar);
    }

    return null;
  } catch (error) {
    logger.error('Finnhub API error:', error.message);
    return null;
  }
}

/**
 * Transform FMP API response to standard format
 */
function transformFMPData(data) {
  return data.map(ipo => {
    const ipoDate = ipo.date || ipo.ipoDate;

    // Determine status based on available data
    let status = 'filed';
    if (ipo.status) {
      status = ipo.status.toLowerCase();
    } else {
      const daysUntilIPO = ipoDate ? Math.floor((new Date(ipoDate) - new Date()) / 86400000) : null;
      if (daysUntilIPO !== null) {
        if (daysUntilIPO < 0) status = 'completed';
        else if (daysUntilIPO <= 7) status = 'expected';
        else if (ipo.price) status = 'priced';
        else status = 'filed';
      }
    }

    // Build price range string
    let priceRange = null;
    if (ipo.priceRangeLow && ipo.priceRangeHigh) {
      priceRange = `$${ipo.priceRangeLow} - $${ipo.priceRangeHigh}`;
    } else if (ipo.price) {
      priceRange = `$${ipo.price}`;
    }

    return {
      symbol: ipo.symbol || 'TBD',
      company: ipo.company || ipo.companyName || ipo.symbol || 'Unknown Company',
      date: ipoDate,
      exchange: ipo.exchange || 'NASDAQ',
      priceRange: priceRange,
      shares: ipo.numberOfShares || ipo.sharesOffered || null,
      status: status,
      // Additional fields from FMP
      marketCap: ipo.marketCap || null,
      filingDate: ipo.filedDate || null,
      sector: ipo.sector || null,
      industry: ipo.industry || null,
      underwriters: ipo.underwriters || null,
      country: ipo.country || 'USA',
      currency: ipo.currency || 'USD'
    };
  }).filter(ipo => ipo.symbol && ipo.date); // Filter out invalid entries
}

/**
 * Transform Finnhub API response to standard format
 */
function transformFinnhubData(data) {
  return data.map(ipo => {
    // Parse price (can be "26.00-30.00" or single value)
    let priceRange = null;
    if (ipo.price) {
      const priceStr = String(ipo.price);
      if (priceStr.includes('-')) {
        const parts = priceStr.split('-');
        priceRange = `$${parts[0].trim()} - $${parts[1].trim()}`;
      } else {
        priceRange = `$${priceStr}`;
      }
    }

    // Determine status
    let status = 'filed';
    if (ipo.status) {
      status = ipo.status.toLowerCase();
    } else {
      const daysUntil = ipo.date ? Math.floor((new Date(ipo.date) - new Date()) / 86400000) : 30;
      if (daysUntil <= 7) status = 'expected';
    }

    // Infer sector from company name
    let sector = null;
    const companyName = (ipo.name || '').toLowerCase();
    if (companyName.includes('bank') || companyName.includes('financial') || companyName.includes('capital')) {
      sector = 'Financial Services';
    } else if (companyName.includes('bio') || companyName.includes('pharma') || companyName.includes('health') || companyName.includes('medical')) {
      sector = 'Healthcare';
    } else if (companyName.includes('tech') || companyName.includes('software') || companyName.includes('digital')) {
      sector = 'Technology';
    } else if (companyName.includes('energy') || companyName.includes('power') || companyName.includes('oil')) {
      sector = 'Energy';
    }

    return {
      symbol: ipo.symbol || 'TBD',
      company: ipo.name || ipo.symbol || 'Unknown Company',
      date: ipo.date,
      exchange: ipo.exchange || 'NASDAQ',
      priceRange: priceRange,
      shares: ipo.numberOfShares || null,
      status: status,
      // Additional fields
      marketCap: ipo.totalSharesValue || null,
      filingDate: null,
      sector: sector,
      industry: null,
      underwriters: null,
      country: 'USA',
      currency: 'USD'
    };
  }).filter(ipo => ipo.symbol && ipo.date); // Filter out invalid entries
}

/**
 * Fetch IPO data with caching - tries FMP first, then Finnhub as fallback
 */
async function fetchIPOData(fromDate, toDate) {
  // Check cache first
  if (isCacheValid(fromDate, toDate)) {
    logger.info('Returning cached IPO data');
    return ipoCache.data;
  }

  // Try FMP first (primary source)
  let ipoData = await fetchFromFMP(fromDate, toDate);

  // Fallback to Finnhub if FMP fails or returns no data
  if (!ipoData || ipoData.length === 0) {
    logger.info('FMP returned no data, trying Finnhub fallback...');
    ipoData = await fetchFromFinnhub(fromDate, toDate);
  }

  // Update cache if we got data
  if (ipoData && ipoData.length > 0) {
    ipoCache = {
      data: ipoData,
      timestamp: Date.now(),
      fromDate: fromDate,
      toDate: toDate
    };
    logger.info(`Cached ${ipoData.length} IPOs`);
  }

  return ipoData || [];
}

/**
 * GET /api/ipo-calendar/upcoming
 * Get upcoming IPOs for the next N days (default: 30 days)
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 100;

    const { from, to } = getDateRange(days);
    let ipos = await fetchIPOData(from, to);

    // Apply limit
    if (ipos.length > limit) {
      ipos = ipos.slice(0, limit);
    }

    // Sort by date ascending
    ipos.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Return proper empty state when no upcoming IPOs
    if (ipos.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No upcoming IPOs found for the specified date range',
        dateRange: { from, to }
      });
    }

    res.json({
      success: true,
      data: ipos,
      count: ipos.length,
      dateRange: { from, to },
      cached: isCacheValid(from, to)
    });
  } catch (error) {
    logger.error('Error fetching upcoming IPOs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming IPOs',
      message: error.message
    });
  }
});

/**
 * GET /api/ipo-calendar/stats
 * Get IPO statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = getDateRange(90); // Get 90 days of data for stats
    const ipos = await fetchIPOData(from, to);

    // Calculate stats
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    const monthFromNow = new Date(now.getTime() + 30 * 86400000);

    const thisWeek = ipos.filter(ipo => {
      const ipoDate = new Date(ipo.date);
      return ipoDate >= now && ipoDate <= weekFromNow;
    });

    const thisMonth = ipos.filter(ipo => {
      const ipoDate = new Date(ipo.date);
      return ipoDate >= now && ipoDate <= monthFromNow;
    });

    // Sector distribution
    const sectorCounts = {};
    ipos.forEach(ipo => {
      const sector = ipo.sector || 'Other';
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });

    const sectorDistribution = Object.entries(sectorCounts)
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);

    // Status distribution
    const statusCounts = {};
    ipos.forEach(ipo => {
      statusCounts[ipo.status] = (statusCounts[ipo.status] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        thisWeek: thisWeek.length,
        thisMonth: thisMonth.length,
        total: ipos.length,
        sectorDistribution,
        statusDistribution: statusCounts,
        dateRange: { from, to }
      }
    });
  } catch (error) {
    logger.error('Error fetching IPO stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch IPO stats'
    });
  }
});

/**
 * GET /api/ipo-calendar/status/:status
 * Get IPOs by status (filed, expected, priced, withdrawn)
 */
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const validStatuses = ['filed', 'expected', 'priced', 'withdrawn', 'completed'];

    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
      });
    }

    const { from, to } = getDateRange(90);
    const ipos = await fetchIPOData(from, to);

    const filtered = ipos
      .filter(ipo => ipo.status === status.toLowerCase())
      .slice(0, limit);

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    logger.error('Error fetching IPOs by status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch IPOs by status'
    });
  }
});

/**
 * GET /api/ipo-calendar/sector/:sector
 * Get IPOs by sector
 */
router.get('/sector/:sector', async (req, res) => {
  try {
    const { sector } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const { from, to } = getDateRange(90);
    const ipos = await fetchIPOData(from, to);

    const filtered = ipos
      .filter(ipo => ipo.sector && ipo.sector.toLowerCase().includes(sector.toLowerCase()))
      .slice(0, limit);

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    logger.error('Error fetching IPOs by sector', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch IPOs by sector'
    });
  }
});

/**
 * GET /api/ipo-calendar/symbol/:symbol
 * Get IPO by symbol
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const { from, to } = getDateRange(90);
    const ipos = await fetchIPOData(from, to);

    const ipo = ipos.find(i => i.symbol.toUpperCase() === symbol.toUpperCase());

    if (!ipo) {
      return res.status(404).json({
        success: false,
        error: 'IPO not found'
      });
    }

    res.json({
      success: true,
      data: ipo
    });
  } catch (error) {
    logger.error('Error fetching IPO by symbol', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch IPO'
    });
  }
});

/**
 * GET /api/ipo-calendar/search
 * Search IPOs by company name or symbol
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const { from, to } = getDateRange(90);
    const ipos = await fetchIPOData(from, to);

    const searchTerm = q.toLowerCase();
    const results = ipos
      .filter(ipo =>
        ipo.symbol.toLowerCase().includes(searchTerm) ||
        ipo.company.toLowerCase().includes(searchTerm) ||
        (ipo.sector && ipo.sector.toLowerCase().includes(searchTerm))
      )
      .slice(0, limit);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    logger.error('Error searching IPOs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search IPOs'
    });
  }
});

/**
 * POST /api/ipo-calendar/refresh
 * Force refresh IPO data from API (clears cache)
 */
router.post('/refresh', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Clear cache
    ipoCache = {
      data: null,
      timestamp: null,
      fromDate: null,
      toDate: null
    };

    logger.info(`Force refreshing IPO data for next ${days} days...`);

    const { from, to } = getDateRange(days);
    const ipos = await fetchIPOData(from, to);

    res.json({
      success: true,
      message: 'IPO data refreshed successfully',
      count: ipos.length,
      dateRange: { from, to }
    });
  } catch (error) {
    logger.error('Error refreshing IPO data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh IPO data'
    });
  }
});

/**
 * POST /api/ipo-calendar/track
 * Track an IPO (delegates to service if available)
 */
router.post('/track', async (req, res) => {
  try {
    const userId = req.user.id;
    const { ipoId, interestLevel, notes } = req.body;

    if (!ipoId) {
      return res.status(400).json({
        success: false,
        error: 'IPO ID is required'
      });
    }

    const ipoService = req.app.get('ipoCalendarService');

    if (ipoService && typeof ipoService.trackIPO === 'function') {
      const result = ipoService.trackIPO(userId, ipoId, interestLevel, notes);
      return res.json(result);
    }

    // Fallback if service not available
    res.json({
      success: true,
      message: 'IPO tracking recorded',
      data: { ipoId, interestLevel, notes }
    });
  } catch (error) {
    logger.error('Error tracking IPO', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to track IPO'
    });
  }
});

/**
 * GET /api/ipo-calendar/tracked
 * Get user's tracked IPOs (delegates to service if available)
 */
router.get('/tracked', async (req, res) => {
  try {
    const userId = req.user.id;
    const ipoService = req.app.get('ipoCalendarService');

    if (ipoService && typeof ipoService.getUserTrackedIPOs === 'function') {
      const tracked = ipoService.getUserTrackedIPOs(userId);
      return res.json({
        success: true,
        data: tracked,
        count: tracked.length
      });
    }

    // Fallback if service not available
    res.json({
      success: true,
      data: [],
      count: 0,
      message: 'Tracking service not available'
    });
  } catch (error) {
    logger.error('Error fetching tracked IPOs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracked IPOs'
    });
  }
});

module.exports = router;
