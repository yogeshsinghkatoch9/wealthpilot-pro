/**
 * Tax-Loss Harvesting API Routes
 * Comprehensive endpoints for tax-loss harvesting with ETF alternatives
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const taxLossHarvesting = require('../services/taxLossHarvesting');
const etfAlternatives = require('../services/etfAlternatives');
const logger = require('../utils/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// ==================== TAX DASHBOARD ====================

/**
 * GET /api/tax/dashboard/:portfolioId
 * Get comprehensive tax dashboard data
 */
router.get('/dashboard/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.userId;

    const dashboard = await taxLossHarvesting.getTaxDashboard(userId, portfolioId);

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Tax dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get tax dashboard'
    });
  }
});

// ==================== OPPORTUNITIES ====================

/**
 * GET /api/tax/opportunities/:portfolioId
 * Get tax-loss harvesting opportunities with ETF alternatives
 */
router.get('/opportunities/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.userId;
    const { minThreshold = 5 } = req.query;

    const opportunities = await taxLossHarvesting.findOpportunitiesWithETFs(
      portfolioId,
      userId,
      parseFloat(minThreshold)
    );

    res.json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    logger.error('Opportunities error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get opportunities'
    });
  }
});

/**
 * GET /api/tax/alternatives/:symbol
 * Get ETF alternatives for a specific symbol
 */
router.get('/alternatives/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { sector } = req.query;

    const alternatives = await etfAlternatives.getAlternatives(symbol, sector);

    res.json({
      success: true,
      data: alternatives
    });
  } catch (error) {
    logger.error('Alternatives error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get alternatives'
    });
  }
});

/**
 * GET /api/tax/sector-etfs/:sector
 * Get ETFs for a specific sector
 */
router.get('/sector-etfs/:sector', async (req, res) => {
  try {
    const { sector } = req.params;

    const etfs = await etfAlternatives.getETFsForSector(sector);

    res.json({
      success: true,
      data: etfs
    });
  } catch (error) {
    logger.error('Sector ETFs error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get sector ETFs'
    });
  }
});

/**
 * GET /api/tax/all-sectors
 * Get all sector ETF mappings
 */
router.get('/all-sectors', async (req, res) => {
  try {
    const sectors = await etfAlternatives.getAllSectorMappings();

    res.json({
      success: true,
      data: sectors
    });
  } catch (error) {
    logger.error('All sectors error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get sector mappings'
    });
  }
});

// ==================== USER PREFERENCES ====================

/**
 * GET /api/tax/preferences
 * Get user's tax preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user.userId;

    const preferences = taxLossHarvesting.getUserTaxPreferences(userId);

    res.json({
      success: true,
      data: preferences || {
        federal_tax_bracket: 32,
        state: null,
        state_tax_rate: 0,
        default_lot_method: 'tax_efficient',
        min_harvest_threshold: 100,
        auto_harvest_enabled: false,
        short_term_rate: 37,
        long_term_rate: 20
      }
    });
  } catch (error) {
    logger.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get preferences'
    });
  }
});

/**
 * PUT /api/tax/preferences
 * Update user's tax preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const userId = req.user.userId;
    const preferences = req.body;

    // Validate inputs
    if (preferences.federal_tax_bracket !== undefined) {
      const bracket = parseFloat(preferences.federal_tax_bracket);
      if (isNaN(bracket) || bracket < 0 || bracket > 50) {
        return res.status(400).json({
          success: false,
          error: 'Federal tax bracket must be between 0 and 50'
        });
      }
    }

    if (preferences.state_tax_rate !== undefined) {
      const rate = parseFloat(preferences.state_tax_rate);
      if (isNaN(rate) || rate < 0 || rate > 15) {
        return res.status(400).json({
          success: false,
          error: 'State tax rate must be between 0 and 15'
        });
      }
    }

    const updated = taxLossHarvesting.updateUserTaxPreferences(userId, preferences);

    res.json({
      success: true,
      data: updated,
      message: 'Tax preferences updated successfully'
    });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update preferences'
    });
  }
});

// ==================== WASH SALES ====================

/**
 * GET /api/tax/wash-sales/:portfolioId
 * Get active wash sale windows
 */
router.get('/wash-sales/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.userId;

    const washSales = taxLossHarvesting.getWashSaleWindows(userId, portfolioId);

    res.json({
      success: true,
      data: washSales
    });
  } catch (error) {
    logger.error('Wash sales error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wash sales'
    });
  }
});

/**
 * POST /api/tax/wash-sale-check
 * Check if a replacement would trigger wash sale
 */
router.post('/wash-sale-check', async (req, res) => {
  try {
    const { symbol, replacementSymbol } = req.body;

    if (!symbol || !replacementSymbol) {
      return res.status(400).json({
        success: false,
        error: 'Both symbol and replacementSymbol are required'
      });
    }

    const result = await etfAlternatives.checkWashSaleRisk(symbol, replacementSymbol);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Wash sale check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check wash sale risk'
    });
  }
});

// ==================== HARVEST EXECUTION ====================

/**
 * POST /api/tax/harvest/preview
 * Preview a tax harvest execution (dry run)
 */
router.post('/harvest/preview', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { portfolioId, symbol, replacementSymbol } = req.body;

    if (!portfolioId || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId and symbol are required'
      });
    }

    const preview = await taxLossHarvesting.previewHarvest(
      portfolioId,
      userId,
      symbol,
      replacementSymbol
    );

    res.json({
      success: true,
      data: preview
    });
  } catch (error) {
    logger.error('Preview harvest error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to preview harvest'
    });
  }
});

/**
 * POST /api/tax/harvest/execute
 * Execute a tax-loss harvest trade
 */
router.post('/harvest/execute', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { portfolioId, symbol, replacementSymbol, lotMethod } = req.body;

    if (!portfolioId || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId and symbol are required'
      });
    }

    // Execute the harvest
    const result = await taxLossHarvesting.executeTaxLossHarvest(
      portfolioId,
      userId,
      symbol,
      replacementSymbol
    );

    // Record in harvest history
    if (result.success) {
      taxLossHarvesting.recordHarvestHistory(userId, portfolioId, {
        symbol,
        sharesSold: result.sellTransaction.shares,
        salePrice: result.sellTransaction.price,
        costBasis: result.sellTransaction.price, // TODO: get actual cost basis
        realizedLoss: result.realizedLoss,
        taxSavings: result.realizedLoss * 0.30, // Approximate
        holdingPeriod: 'short-term',
        lotMethod: lotMethod || 'fifo',
        replacementSymbol: replacementSymbol,
        replacementShares: result.buyTransaction?.shares,
        replacementPrice: result.buyTransaction?.price,
        washSaleSafe: true
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Execute harvest error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute harvest'
    });
  }
});

// ==================== REPORTS & HISTORY ====================

/**
 * GET /api/tax/history/:portfolioId
 * Get tax harvest history
 */
router.get('/history/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.userId;
    const { limit = 50 } = req.query;

    const history = taxLossHarvesting.getHarvestHistory(
      userId,
      portfolioId,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('History error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get history'
    });
  }
});

/**
 * GET /api/tax/carryforward
 * Get loss carryforward balance
 */
router.get('/carryforward', async (req, res) => {
  try {
    const userId = req.user.userId;

    const carryforward = taxLossHarvesting.getCarryforwardBalance(userId);

    res.json({
      success: true,
      data: carryforward
    });
  } catch (error) {
    logger.error('Carryforward error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get carryforward'
    });
  }
});

/**
 * POST /api/tax/carryforward
 * Update loss carryforward
 */
router.post('/carryforward', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taxYear, shortTermLoss, longTermLoss, notes } = req.body;

    if (!taxYear) {
      return res.status(400).json({
        success: false,
        error: 'taxYear is required'
      });
    }

    const result = taxLossHarvesting.updateCarryforward(userId, taxYear, {
      shortTermLoss: parseFloat(shortTermLoss) || 0,
      longTermLoss: parseFloat(longTermLoss) || 0,
      notes
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Update carryforward error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update carryforward'
    });
  }
});

/**
 * GET /api/tax/year-end/:portfolioId
 * Get year-end tax report
 */
router.get('/year-end/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { year } = req.query;
    const taxYear = year ? parseInt(year) : new Date().getFullYear();

    const report = await taxLossHarvesting.generateYearEndReport(portfolioId, taxYear);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Year-end report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate year-end report'
    });
  }
});

/**
 * GET /api/tax/recommendation/:portfolioId/:symbol
 * Get replacement recommendation for a specific holding
 */
router.get('/recommendation/:portfolioId/:symbol', async (req, res) => {
  try {
    const { portfolioId, symbol } = req.params;
    const userId = req.user.userId;

    // Get wash sale windows to exclude
    const washSaleWindows = taxLossHarvesting.getWashSaleWindows(userId, portfolioId);
    const excludeSymbols = washSaleWindows
      .filter(ws => ws.status === 'active')
      .map(ws => ws.symbol);

    const recommendation = await etfAlternatives.recommendReplacement(
      symbol,
      null, // Will look up sector
      excludeSymbols
    );

    res.json({
      success: true,
      data: recommendation
    });
  } catch (error) {
    logger.error('Recommendation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get recommendation'
    });
  }
});

module.exports = router;
