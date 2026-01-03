const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const rebalancingService = require('../services/portfolioRebalancing');
const taxLossService = require('../services/taxLossHarvesting');
const dividendService = require('../services/dividendForecasting');

// All routes require authentication
router.use(authenticate);

// ==================== PORTFOLIO REBALANCING ====================

// Get rebalancing analysis
router.get('/rebalancing/analyze', async (req, res) => {
  try {
    const { portfolioId, strategy = 'target_weights' } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const targetAllocations = req.query.targets ? JSON.parse(req.query.targets) : null;
    const result = await rebalancingService.calculateRebalancing(portfolioId, targetAllocations, strategy);
    
    res.json(result);
  } catch (error) {
    logger.error('Rebalancing analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze rebalancing' });
  }
});

// Get all rebalancing strategies
router.get('/rebalancing/strategies', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const strategies = await rebalancingService.getRebalancingStrategies(portfolioId);
    res.json(strategies);
  } catch (error) {
    logger.error('Rebalancing strategies error:', error);
    res.status(500).json({ error: 'Failed to get rebalancing strategies' });
  }
});

// Execute rebalancing
router.post('/rebalancing/execute', async (req, res) => {
  try {
    const { portfolioId, trades } = req.body;
    const userId = req.user.id;
    
    if (!portfolioId || !trades) {
      return res.status(400).json({ error: 'Portfolio ID and trades required' });
    }

    const result = await rebalancingService.executeRebalancing(portfolioId, trades, userId);
    res.json(result);
  } catch (error) {
    logger.error('Execute rebalancing error:', error);
    res.status(500).json({ error: 'Failed to execute rebalancing' });
  }
});

// ==================== TAX LOSS HARVESTING ====================

// Find tax loss harvesting opportunities
router.get('/tax-loss-harvesting/opportunities', async (req, res) => {
  try {
    const { portfolioId, minLossThreshold = 5 } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const opportunities = await taxLossService.findOpportunities(portfolioId, parseFloat(minLossThreshold));
    res.json(opportunities);
  } catch (error) {
    logger.error('Tax loss harvesting opportunities error:', error);
    res.status(500).json({ error: 'Failed to find tax loss harvesting opportunities' });
  }
});

// Generate year-end tax report
router.get('/tax-loss-harvesting/year-end-report', async (req, res) => {
  try {
    const { portfolioId, taxYear } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const year = taxYear ? parseInt(taxYear) : new Date().getFullYear();
    const report = await taxLossService.generateYearEndReport(portfolioId, year);
    res.json(report);
  } catch (error) {
    logger.error('Year-end report error:', error);
    res.status(500).json({ error: 'Failed to generate year-end report' });
  }
});

// Execute tax loss harvest
router.post('/tax-loss-harvesting/execute', async (req, res) => {
  try {
    const { portfolioId, symbol, replaceWith } = req.body;
    const userId = req.user.id;
    
    if (!portfolioId || !symbol) {
      return res.status(400).json({ error: 'Portfolio ID and symbol required' });
    }

    const result = await taxLossService.executeTaxLossHarvest(portfolioId, userId, symbol, replaceWith);
    res.json(result);
  } catch (error) {
    logger.error('Execute tax loss harvest error:', error);
    res.status(500).json({ error: 'Failed to execute tax loss harvest' });
  }
});

// ==================== DIVIDEND FORECASTING ====================

// Get dividend forecast
router.get('/dividends/forecast', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const forecast = await dividendService.forecastDividends(portfolioId);
    res.json(forecast);
  } catch (error) {
    logger.error('Dividend forecast error:', error);
    res.status(500).json({ error: 'Failed to forecast dividends' });
  }
});

// Get dividend growth analysis
router.get('/dividends/growth-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const analysis = await dividendService.getDividendGrowthAnalysis(portfolioId);
    res.json(analysis);
  } catch (error) {
    logger.error('Dividend growth analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze dividend growth' });
  }
});

// Get upcoming dividends
router.get('/dividends/upcoming', async (req, res) => {
  try {
    const { portfolioId, days = 30 } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const upcoming = await dividendService.getUpcomingDividends(portfolioId, parseInt(days));
    res.json(upcoming);
  } catch (error) {
    logger.error('Upcoming dividends error:', error);
    res.status(500).json({ error: 'Failed to get upcoming dividends' });
  }
});

// ==================== COMBINED PORTFOLIO OPTIMIZER ====================

// Get comprehensive portfolio optimization recommendations
router.get('/optimize/all', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    // Fetch all optimization data in parallel
    const [rebalancing, taxLoss, dividends] = await Promise.all([
      rebalancingService.calculateRebalancing(portfolioId, null, 'equal_weight'),
      taxLossService.findOpportunities(portfolioId, 5),
      dividendService.forecastDividends(portfolioId)
    ]);

    res.json({
      rebalancing,
      taxLossHarvesting: taxLoss,
      dividendForecast: dividends,
      summary: {
        rebalancingTrades: rebalancing.recommendedTrades.filter(t => t.action !== 'none').length,
        taxLossOpportunities: taxLoss.summary.totalOpportunities,
        estimatedTaxSavings: taxLoss.summary.estimatedTaxBenefit,
        annualDividendIncome: dividends.summary.totalAnnualIncome,
        portfolioDividendYield: dividends.metrics.portfolioYield
      }
    });
  } catch (error) {
    logger.error('Portfolio optimization error:', error);
    res.status(500).json({ error: 'Failed to generate portfolio optimization' });
  }
});

module.exports = router;
