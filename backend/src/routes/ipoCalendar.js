/**
 * IPO Calendar Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * GET /api/ipo-calendar/upcoming
 * Get upcoming IPOs
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const limit = parseInt(req.query.limit) || 100;
    const ipoService = req.app.get('ipoCalendarService');

    let ipos = ipoService.getUpcoming(days, limit);

    // If no IPO data exists, refresh from API/generate mock data
    if (ipos.length === 0) {
      logger.info('No IPO data in database, refreshing...');
      await ipoService.refreshIPOData(days);
      ipos = ipoService.getUpcoming(days, limit);
    }

    res.json({
      success: true,
      data: ipos,
      count: ipos.length
    });
  } catch (error) {
    logger.error('Error fetching upcoming IPOs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming IPOs'
    });
  }
});

/**
 * GET /api/ipo-calendar/stats
 * Get IPO statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const ipoService = req.app.get('ipoCalendarService');
    const stats = ipoService.getStats();

    res.json({
      success: true,
      data: stats
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
 * Get IPOs by status
 */
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const ipoService = req.app.get('ipoCalendarService');

    const ipos = ipoService.getByStatus(status, limit);

    res.json({
      success: true,
      data: ipos,
      count: ipos.length
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
    const ipoService = req.app.get('ipoCalendarService');

    const ipos = ipoService.getBySector(sector, limit);

    res.json({
      success: true,
      data: ipos,
      count: ipos.length
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
    const ipoService = req.app.get('ipoCalendarService');

    const ipo = ipoService.getBySymbol(symbol.toUpperCase());

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
 * Search IPOs
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

    const ipoService = req.app.get('ipoCalendarService');
    const results = ipoService.searchIPOs(q, limit);

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
 * Refresh IPO data from API
 */
router.post('/refresh', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const ipoService = req.app.get('ipoCalendarService');

    logger.info(`Refreshing IPO data for next ${days} days...`);
    const result = await ipoService.refreshIPOData(days);

    res.json(result);
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
 * Track an IPO
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
    const result = ipoService.trackIPO(userId, ipoId, interestLevel, notes);

    res.json(result);
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
 * Get user's tracked IPOs
 */
router.get('/tracked', async (req, res) => {
  try {
    const userId = req.user.id;
    const ipoService = req.app.get('ipoCalendarService');

    const tracked = ipoService.getUserTrackedIPOs(userId);

    res.json({
      success: true,
      data: tracked,
      count: tracked.length
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
