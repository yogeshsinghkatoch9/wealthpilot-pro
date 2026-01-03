/**
 * Dividend Calendar API Routes
 * Handles all dividend calendar operations
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * GET /api/dividend-calendar/upcoming
 * Get upcoming dividends
 */
router.get('/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const dividendService = req.app.get('dividendCalendarService');

    const dividends = await dividendService.getUpcomingDividends(limit);

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching upcoming dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/range
 * Get dividends by date range
 */
router.get('/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const dividendService = req.app.get('dividendCalendarService');
    const dividends = await dividendService.getDividendsByDateRange(startDate, endDate);

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching dividends by date range', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/symbol/:symbol
 * Get dividends for specific symbol
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const dividendService = req.app.get('dividendCalendarService');

    const dividends = await dividendService.getDividendsBySymbol(symbol.toUpperCase());

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching dividends by symbol', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/today
 * Get today's dividends
 */
router.get('/today', async (req, res) => {
  try {
    const dividendService = req.app.get('dividendCalendarService');
    const dividends = await dividendService.getTodaysDividends();

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching today\'s dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/this-week
 * Get this week's dividends
 */
router.get('/this-week', async (req, res) => {
  try {
    const dividendService = req.app.get('dividendCalendarService');
    const dividends = await dividendService.getCurrentWeekDividends();

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching this week\'s dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/this-month
 * Get this month's dividends
 */
router.get('/this-month', async (req, res) => {
  try {
    const dividendService = req.app.get('dividendCalendarService');
    const dividends = await dividendService.getCurrentMonthDividends();

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching this month\'s dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/stats
 * Get dividend statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const dividendService = req.app.get('dividendCalendarService');
    const stats = await dividendService.getDividendStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching dividend stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/search
 * Search dividends by company name or symbol
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const dividendService = req.app.get('dividendCalendarService');
    const dividends = await dividendService.searchDividends(q);

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error searching dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/my-dividends
 * Get user's tracked dividends (from portfolio holdings)
 */
router.get('/my-dividends', async (req, res) => {
  try {
    const userId = req.user.userId;
    const dividendService = req.app.get('dividendCalendarService');

    const dividends = await dividendService.getUserTrackedDividends(userId);

    res.json({
      success: true,
      data: dividends
    });
  } catch (error) {
    logger.error('Error fetching user tracked dividends', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dividend-calendar/projected-income
 * Get projected dividend income for user
 */
router.get('/projected-income', async (req, res) => {
  try {
    const userId = req.user.userId;
    const months = parseInt(req.query.months) || 12;
    const dividendService = req.app.get('dividendCalendarService');

    const projection = await dividendService.getProjectedDividendIncome(userId, months);

    res.json({
      success: true,
      data: projection
    });
  } catch (error) {
    logger.error('Error calculating projected income', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dividend-calendar/refresh
 * Refresh dividend data
 */
router.post('/refresh', async (req, res) => {
  try {
    const dividendService = req.app.get('dividendCalendarService');
    const result = await dividendService.refreshDividendData();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error refreshing dividend data', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
