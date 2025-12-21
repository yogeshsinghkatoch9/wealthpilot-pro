const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const sectorRotationService = require('../services/sectorRotation');

/**
 * @route   GET /api/sector-rotation/current
 * @desc    Get current sector rotation data with money flow analysis
 * @access  Private
 */
router.get('/current', authenticate, async (req, res) => {
  try {
    logger.info('[GET /sector-rotation/current] Fetching live sector rotation data...');

    const rotationData = await sectorRotationService.getSectorRotationData();

    // Save to database for historical tracking
    await sectorRotationService.saveSectorRotationData(rotationData);

    res.json({
      success: true,
      data: rotationData
    });
  } catch (error) {
    logger.error('[GET /sector-rotation/current] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sector rotation data',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/sector-rotation/history
 * @desc    Get historical sector rotation patterns
 * @access  Private
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    logger.debug(`[GET /sector-rotation/history] Fetching ${days} days of rotation history...`);

    const history = await sectorRotationService.getHistoricalRotations(days);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('[GET /sector-rotation/history] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rotation history',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/sector-rotation/sector/:sectorName
 * @desc    Get detailed data for a specific sector
 * @access  Private
 */
router.get('/sector/:sectorName', authenticate, async (req, res) => {
  try {
    const { sectorName } = req.params;
    logger.debug(`[GET /sector-rotation/sector/${sectorName}] Fetching sector details...`);

    const rotationData = await sectorRotationService.getSectorRotationData();
    const sectorData = rotationData.sectors.find(s =>
      s.sectorName.toLowerCase() === sectorName.toLowerCase()
    );

    if (!sectorData) {
      return res.status(404).json({
        success: false,
        error: 'Sector not found'
      });
    }

    res.json({
      success: true,
      data: sectorData
    });
  } catch (error) {
    logger.error(`[GET /sector-rotation/sector/${req.params.sectorName}] Error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sector data',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/sector-rotation/refresh
 * @desc    Force refresh sector rotation data
 * @access  Private
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    logger.info('[POST /sector-rotation/refresh] Force refreshing sector data...');

    const rotationData = await sectorRotationService.getSectorRotationData();
    await sectorRotationService.saveSectorRotationData(rotationData);

    res.json({
      success: true,
      message: 'Sector rotation data refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[POST /sector-rotation/refresh] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh sector data',
      message: error.message
    });
  }
});

module.exports = router;
