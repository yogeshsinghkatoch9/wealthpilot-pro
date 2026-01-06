const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const sectorService = require('../services/advanced/sectorAnalysis');
const { prisma } = require('../db/simpleDb');


/**
 * GET /api/sector-analysis/sectors
 * Get all available sectors with current data
 */
router.get('/sectors', authenticate, async (req, res) => {
  try {
    const sectors = await sectorService.getAllSectors();
    res.json({ success: true, data: sectors });
  } catch (error) {
    logger.error('Error fetching sectors:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis/performance
 * Get sector performance comparison for a given period
 * Query params: period (1D, 1W, 1M, 3M, 1Y)
 */
router.get('/performance', authenticate, async (req, res) => {
  try {
    const { period = '1M' } = req.query;
    const performance = await sectorService.getSectorPerformanceComparison(period);
    res.json({ success: true, data: performance, period });
  } catch (error) {
    logger.error('Error fetching sector performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis/portfolio/:portfolioId
 * Get sector allocation for a specific portfolio
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;

    // Verify user owns this portfolio
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId }
    });

    if (!portfolio || portfolio.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const allocation = await sectorService.calculatePortfolioSectorAllocation(portfolioId);
    res.json({ success: true, data: allocation });
  } catch (error) {
    logger.error('Error fetching portfolio sector allocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis/portfolio/:portfolioId/history
 * Get historical sector allocation for a portfolio
 * Query params: days (default: 30)
 */
router.get('/portfolio/:portfolioId/history', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { days = 30 } = req.query;

    // Verify user owns this portfolio
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId }
    });

    if (!portfolio || portfolio.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const history = await prisma.portfolioSectorAllocation.findMany({
      where: {
        portfolioId,
        date: { gte: startDate }
      },
      orderBy: { date: 'asc' }
    });

    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Error fetching portfolio sector history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis/rotation
 * Get sector rotation analysis
 * Query params: days (default: 30)
 */
router.get('/rotation', authenticate, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const rotation = await sectorService.getSectorRotation(parseInt(days));
    res.json({ success: true, data: rotation });
  } catch (error) {
    logger.error('Error fetching sector rotation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sector-analysis/update
 * Manually trigger sector data update
 * Admin only
 */
router.post('/update', authenticate, async (req, res) => {
  try {
    const result = await sectorService.updateAllSectorData();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error updating sector data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sector-analysis/update-history
 * Manually trigger sector performance history update
 * Admin only
 */
router.post('/update-history', authenticate, async (req, res) => {
  try {
    const { days = 90 } = req.body;
    const result = await sectorService.updateSectorPerformanceHistory(parseInt(days));
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error updating sector history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis/alpha-vantage
 * Get real-time sector performance from Alpha Vantage
 */
router.get('/alpha-vantage', authenticate, async (req, res) => {
  try {
    const data = await sectorService.fetchAlphaVantageSectorPerformance();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching Alpha Vantage data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
