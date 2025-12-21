/**
 * Earnings Calendar Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * GET /api/earnings-calendar/upcoming
 * Get upcoming earnings
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 100;
    const userId = req.user.id;
    const earningsService = req.app.get('earningsCalendarService');
    const Database = req.app.get('database');

    let earnings = earningsService.getUpcoming(days, limit);

    // If no earnings data exists, refresh from API/generate mock data
    if (earnings.length === 0) {
      logger.info('No earnings data in database, refreshing...');

      // Get user's portfolio symbols for mock data
      const portfolios = Database.getPortfoliosByUser(userId);
      let symbols = [];
      for (const portfolio of portfolios) {
        const holdings = Database.getHoldingsByPortfolio(portfolio.id);
        symbols.push(...holdings.map(h => h.symbol));
      }
      symbols = [...new Set(symbols)];

      // Refresh data
      await earningsService.refreshEarningsData(days, symbols);

      // Fetch again
      earnings = earningsService.getUpcoming(days, limit);
    }

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching upcoming earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming earnings'
    });
  }
});

/**
 * GET /api/earnings-calendar/stats
 * Get earnings statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const earningsService = req.app.get('earningsCalendarService');
    const stats = earningsService.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching earnings stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings stats'
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
    const earningsService = req.app.get('earningsCalendarService');

    const earnings = earningsService.getBySymbol(symbol.toUpperCase(), limit);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching symbol earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch symbol earnings'
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

    const earningsService = req.app.get('earningsCalendarService');
    const earnings = earningsService.getByDateRange(start, end, limit);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by date range', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by date range'
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

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const earningsService = req.app.get('earningsCalendarService');
    const earnings = earningsService.search(q, limit);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error searching earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search earnings'
    });
  }
});

/**
 * GET /api/earnings-calendar/my-earnings
 * Get user's tracked earnings
 */
router.get('/my-earnings', async (req, res) => {
  try {
    const userId = req.user.userId;
    const earningsService = req.app.get('earningsCalendarService');

    const earnings = earningsService.getUserTrackedEarnings(userId);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching user tracked earnings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracked earnings'
    });
  }
});

/**
 * POST /api/earnings-calendar/track
 * Track earnings for a symbol
 */
router.post('/track', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { symbol, shares, alertBeforeDays, notes } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }

    const earningsService = req.app.get('earningsCalendarService');
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
    const userId = req.user.userId;
    const { symbol } = req.params;

    const earningsService = req.app.get('earningsCalendarService');
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
 * Refresh earnings data from API
 */
router.post('/refresh', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const userId = req.user.id;
    const earningsService = req.app.get('earningsCalendarService');
    const Database = req.app.get('database');

    // Get user's portfolio symbols to use for mock data if needed
    const portfolios = Database.getPortfoliosByUser(userId);
    let symbols = [];
    for (const portfolio of portfolios) {
      const holdings = Database.getHoldingsByPortfolio(portfolio.id);
      symbols.push(...holdings.map(h => h.symbol));
    }
    symbols = [...new Set(symbols)];

    logger.info(`Refreshing earnings data for next ${days} days...`);
    const result = await earningsService.refreshEarningsData(days, symbols);

    res.json(result);
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

    const earningsService = req.app.get('earningsCalendarService');
    const earnings = earningsService.getByFiscalQuarter(quarter, parseInt(year), limit);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by fiscal quarter', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by fiscal quarter'
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

    const earningsService = req.app.get('earningsCalendarService');
    const earnings = earningsService.getByStatus(status, limit);

    res.json({
      success: true,
      data: earnings,
      count: earnings.length
    });
  } catch (error) {
    logger.error('Error fetching earnings by status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings by status'
    });
  }
});

module.exports = router;
