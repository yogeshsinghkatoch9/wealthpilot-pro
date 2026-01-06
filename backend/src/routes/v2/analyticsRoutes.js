/**
 * WealthPilot Pro - Advanced Analytics Routes (V2 API)
 * Comprehensive analytics endpoints
 */

const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const analyticsAdvanced = require('../../services/advanced/analyticsAdvanced');
const taxOptimization = require('../../services/advanced/taxOptimization');
const portfolioOptimization = require('../../services/advanced/portfolioOptimization');

// Apply authentication to all routes
router.use(authenticate);

// ============================================
// Portfolio Analytics
// ============================================

/**
 * GET /api/v2/analytics/portfolio/:portfolioId
 * Get comprehensive portfolio metrics
 */
router.get('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Portfolio analytics error:', error);
    res.status(error.message === 'Portfolio not found' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/analytics/performance/:portfolioId
 * Get detailed performance metrics
 */
router.get('/performance/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { period = '1Y', benchmark = 'SPY' } = req.query;
    
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: {
        performance: metrics.performance,
        period,
        benchmark
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/risk/:portfolioId
 * Get risk analysis
 */
router.get('/risk/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: metrics.risk
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/allocation/:portfolioId
 * Get allocation breakdown
 */
router.get('/allocation/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: metrics.allocation
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/concentration/:portfolioId
 * Get concentration metrics
 */
router.get('/concentration/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: metrics.concentration
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Tax Optimization
// ============================================

/**
 * GET /api/v2/analytics/tax/:portfolioId
 * Get tax analysis
 */
router.get('/tax/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { year = new Date().getFullYear() } = req.query;
    
    const analysis = await taxOptimization.getTaxAnalysis(portfolioId, req.user.id, parseInt(year));
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/tax/:portfolioId/harvesting
 * Get tax-loss harvesting opportunities
 */
router.get('/tax/:portfolioId/harvesting', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const analysis = await taxOptimization.getTaxAnalysis(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: analysis.harvestingOpportunities
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/tax/:portfolioId/wash-sales
 * Check wash sale risks
 */
router.get('/tax/:portfolioId/wash-sales', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const analysis = await taxOptimization.getTaxAnalysis(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: analysis.washSaleRisks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/analytics/tax/:portfolioId/lot-selection
 * Get optimal lot selection for selling
 */
router.post('/tax/:portfolioId/lot-selection', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { symbol, shares, strategy = 'tax_efficient' } = req.body;
    
    if (!symbol || !shares) {
      return res.status(400).json({
        success: false,
        error: 'Symbol and shares are required'
      });
    }
    
    const result = await taxOptimization.getOptimalLotSelection(
      portfolioId, 
      symbol, 
      parseFloat(shares), 
      strategy
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Portfolio Optimization
// ============================================

/**
 * POST /api/v2/analytics/optimize/rebalance/:portfolioId
 * Calculate rebalancing trades
 */
router.post('/optimize/rebalance/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { targetAllocation } = req.body;
    
    if (!targetAllocation || typeof targetAllocation !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Target allocation is required'
      });
    }
    
    const trades = await portfolioOptimization.calculateRebalanceTrades(
      portfolioId, 
      req.user.id, 
      targetAllocation
    );
    
    res.json({
      success: true,
      data: trades
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/analytics/optimize/portfolio
 * Optimize portfolio allocation
 */
router.post('/optimize/portfolio', async (req, res) => {
  try {
    const { symbols, constraints = {} } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      });
    }
    
    const optimized = await portfolioOptimization.optimizePortfolio(symbols, constraints);
    
    res.json({
      success: true,
      data: optimized
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/optimize/models
 * Get available model portfolios
 */
router.get('/optimize/models', async (req, res) => {
  try {
    const models = portfolioOptimization.getModelPortfolios();
    
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/analytics/optimize/apply-model/:portfolioId
 * Apply model portfolio
 */
router.post('/optimize/apply-model/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json({
        success: false,
        error: 'Model ID is required'
      });
    }
    
    const trades = await portfolioOptimization.applyModelPortfolio(
      portfolioId, 
      req.user.id, 
      modelId
    );
    
    res.json({
      success: true,
      data: trades
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/analytics/optimize/drift/:portfolioId
 * Calculate drift from target allocation
 */
router.post('/optimize/drift/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { targetAllocation } = req.body;
    
    if (!targetAllocation) {
      return res.status(400).json({
        success: false,
        error: 'Target allocation is required'
      });
    }
    
    const drift = await portfolioOptimization.calculateDrift(
      portfolioId, 
      req.user.id, 
      targetAllocation
    );
    
    res.json({
      success: true,
      data: drift
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/optimize/rebalance-schedules
 * Get rebalancing schedule options
 */
router.get('/optimize/rebalance-schedules', async (req, res) => {
  try {
    const { strategy = 'threshold' } = req.query;
    const schedule = portfolioOptimization.generateRebalanceSchedule(strategy);
    
    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Recommendations
// ============================================

/**
 * GET /api/v2/analytics/recommendations/:portfolioId
 * Get portfolio recommendations
 */
router.get('/recommendations/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    const taxAnalysis = await taxOptimization.getTaxAnalysis(portfolioId, req.user.id);
    
    // Combine all recommendations
    const allRecommendations = [
      ...metrics.recommendations,
      ...taxAnalysis.recommendations
    ].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    res.json({
      success: true,
      data: {
        recommendations: allRecommendations,
        qualityScore: metrics.quality,
        riskLevel: metrics.risk.riskLevel
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Comparison & Benchmarking
// ============================================

/**
 * POST /api/v2/analytics/compare
 * Compare multiple portfolios
 */
router.post('/compare', async (req, res) => {
  try {
    const { portfolio_ids } = req.body;
    
    if (!portfolioIds || !Array.isArray(portfolioIds) || portfolioIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 portfolio IDs are required'
      });
    }
    
    const comparisons = await Promise.all(
      portfolioIds.map(id => analyticsAdvanced.getPortfolioMetrics(id, req.user.id))
    );
    
    res.json({
      success: true,
      data: {
        portfolios: comparisons.map((metrics, i) => ({
          portfolio_id: portfolioIds[i],
          summary: metrics.summary,
          performance: metrics.performance,
          risk: metrics.risk,
          quality: metrics.quality
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/analytics/benchmark/:portfolioId
 * Compare portfolio to benchmark
 */
router.get('/benchmark/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { benchmark = 'SPY', period = '1Y' } = req.query;
    
    const metrics = await analyticsAdvanced.getPortfolioMetrics(portfolioId, req.user.id);
    
    res.json({
      success: true,
      data: {
        portfolio: {
          return: metrics.performance.yearReturn,
          volatility: metrics.performance.volatility,
          sharpe: metrics.performance.sharpeRatio
        },
        benchmark: {
          symbol: benchmark,
          return: 10.5, // Would come from market data
          volatility: 15.2,
          sharpe: 0.7
        },
        comparison: {
          alpha: metrics.performance.alpha,
          beta: metrics.performance.beta,
          correlation: metrics.performance.correlation,
          trackingError: metrics.performance.trackingError,
          informationRatio: metrics.performance.informationRatio
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
