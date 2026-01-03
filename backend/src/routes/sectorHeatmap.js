/**
 * Sector Heatmap API Routes
 * Provides endpoints for sector performance heatmap data
 */

const express = require('express');
const router = express.Router();
const SectorHeatmapService = require('../services/sectorHeatmapFast'); // Using fast Yahoo Finance version
const logger = require('../utils/logger');

/**
 * GET /api/sector-heatmap/current
 * Get current sector performance data
 */
router.get('/current', async (req, res) => {
  try {
    logger.info('Fetching sector heatmap data');

    const sectorData = await SectorHeatmapService.getSectorPerformance();

    res.json({
      success: true,
      data: {
        sectors: sectorData,
        timestamp: new Date().toISOString(),
        source: sectorData[0]?.source || 'Unknown'
      }
    });
  } catch (error) {
    logger.error('Error fetching sector heatmap data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sector heatmap data',
      message: error.message
    });
  }
});

/**
 * POST /api/sector-heatmap/refresh
 * Force refresh sector data (clear cache)
 */
router.post('/refresh', async (req, res) => {
  try {
    logger.info('Forcing sector heatmap refresh');

    SectorHeatmapService.clearCache();
    const sectorData = await SectorHeatmapService.getSectorPerformance();

    res.json({
      success: true,
      data: {
        sectors: sectorData,
        timestamp: new Date().toISOString(),
        source: sectorData[0]?.source || 'Unknown'
      },
      message: 'Cache cleared and data refreshed'
    });
  } catch (error) {
    logger.error('Error refreshing sector heatmap data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh sector heatmap data',
      message: error.message
    });
  }
});

/**
 * GET /api/sector-heatmap/historical/:symbol
 * Get historical performance for a specific sector ETF
 */
router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1M' } = req.query;

    logger.info(`Fetching historical data for ${symbol}`);

    // This would fetch historical data from FMP
    // For now, returning a placeholder
    res.json({
      success: true,
      data: {
        symbol,
        period,
        historical: []
      },
      message: 'Historical data endpoint - to be implemented'
    });
  } catch (error) {
    logger.error('Error fetching historical data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
});

module.exports = router;
