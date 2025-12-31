/**
 * ESG Analysis Routes
 * API endpoints for comprehensive ESG (Environmental, Social, Governance) analysis
 * Uses real API data with automatic caching and fallback to static data
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const esgService = require('../services/advanced/esgAnalysis');
const esgDataProvider = require('../services/esg/esgDataProvider');

// ==================== STOCK ESG DATA ====================

/**
 * GET /api/esg/stock/:symbol
 * Get ESG data for a single stock (uses real API with caching)
 */
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { forceRefresh, provider } = req.query;

    // Use async API-based method
    const esgData = await esgService.getStockESGAsync(req.params.symbol, {
      forceRefresh: forceRefresh === 'true',
      preferredProvider: provider
    });

    res.json({ success: true, data: esgData });
  } catch (error) {
    logger.error('Error fetching stock ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/stock/:symbol/raw
 * Get raw ESG data directly from API provider
 */
router.get('/stock/:symbol/raw', async (req, res) => {
  try {
    const { provider } = req.query;
    const rawData = await esgDataProvider.getESGData(req.params.symbol, {
      forceRefresh: true,
      preferredProvider: provider
    });

    res.json({ success: true, data: rawData });
  } catch (error) {
    logger.error('Error fetching raw ESG data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/esg/stocks/bulk
 * Get ESG data for multiple stocks in a single request
 */
router.post('/stocks/bulk', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of symbols'
      });
    }

    const { results, errors } = await esgService.getBulkStockESG(symbols.slice(0, 50));

    res.json({
      success: true,
      data: {
        results,
        errors,
        count: Object.keys(results).length,
        failedCount: Object.keys(errors).length
      }
    });
  } catch (error) {
    logger.error('Error fetching bulk ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/stock/:symbol/environmental
 * Get detailed environmental metrics for a stock
 */
router.get('/stock/:symbol/environmental', async (req, res) => {
  try {
    const metrics = esgService.getEnvironmentalMetrics(req.params.symbol);
    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error('Error fetching environmental metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/stock/:symbol/sdg
 * Get UN SDG alignment for a stock
 */
router.get('/stock/:symbol/sdg', async (req, res) => {
  try {
    const sdgData = esgService.getSDGAlignment(req.params.symbol);
    res.json({ success: true, data: sdgData });
  } catch (error) {
    logger.error('Error fetching SDG alignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/stock/:symbol/controversies
 * Get controversy data for a stock
 */
router.get('/stock/:symbol/controversies', async (req, res) => {
  try {
    const controversies = esgService.getControversies(req.params.symbol);
    res.json({ success: true, data: controversies });
  } catch (error) {
    logger.error('Error fetching controversies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PORTFOLIO ESG ANALYSIS ====================

/**
 * GET /api/esg/portfolio/:portfolioId
 * Get portfolio ESG analysis
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const esgData = await esgService.calculatePortfolioESG(req.params.portfolioId);
    res.json({ success: true, data: esgData });
  } catch (error) {
    logger.error('Error calculating portfolio ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/report
 * Get comprehensive ESG report for portfolio
 */
router.get('/portfolio/:portfolioId/report', authenticate, async (req, res) => {
  try {
    const report = await esgService.getComprehensiveReport(req.params.portfolioId);
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error generating ESG report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/sdg
 * Get portfolio UN SDG alignment
 */
router.get('/portfolio/:portfolioId/sdg', authenticate, async (req, res) => {
  try {
    const sdgAlignment = await esgService.getPortfolioSDGAlignment(req.params.portfolioId);
    res.json({ success: true, data: sdgAlignment });
  } catch (error) {
    logger.error('Error calculating portfolio SDG alignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/controversies
 * Get portfolio controversy exposure
 */
router.get('/portfolio/:portfolioId/controversies', authenticate, async (req, res) => {
  try {
    const controversies = await esgService.getPortfolioControversies(req.params.portfolioId);
    res.json({ success: true, data: controversies });
  } catch (error) {
    logger.error('Error calculating controversy exposure:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/benchmark
 * Compare portfolio ESG with benchmarks
 */
router.get('/portfolio/:portfolioId/benchmark', authenticate, async (req, res) => {
  try {
    const comparison = await esgService.compareToBenchmarks(req.params.portfolioId);
    res.json({ success: true, data: comparison });
  } catch (error) {
    logger.error('Error comparing to benchmarks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/recommendations
 * Get ESG improvement recommendations for portfolio
 */
router.get('/portfolio/:portfolioId/recommendations', authenticate, async (req, res) => {
  try {
    const esgData = await esgService.calculatePortfolioESG(req.params.portfolioId);
    const recommendations = esgService.getRecommendations(esgData);
    res.json({ success: true, data: { recommendations, currentScores: esgData.componentScores } });
  } catch (error) {
    logger.error('Error generating recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ESG SCREENING ====================

/**
 * POST /api/esg/screen
 * Screen stocks by ESG criteria
 */
router.post('/screen', async (req, res) => {
  try {
    const {
      minESGScore,
      minEnvironmental,
      minSocial,
      minGovernance,
      maxCarbonIntensity,
      excludeSectors,
      excludeControversies,
      requireSDGs
    } = req.body;

    const results = esgService.screenStocks({
      minESGScore: minESGScore || 0,
      minEnvironmental: minEnvironmental || 0,
      minSocial: minSocial || 0,
      minGovernance: minGovernance || 0,
      maxCarbonIntensity: maxCarbonIntensity || Infinity,
      excludeSectors: excludeSectors || [],
      excludeControversies: excludeControversies || false,
      requireSDGs: requireSDGs || []
    });

    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        criteria: req.body
      }
    });
  } catch (error) {
    logger.error('Error screening stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/leaders
 * Get top ESG-rated stocks
 */
router.get('/leaders', async (req, res) => {
  try {
    const { limit, sector } = req.query;
    const criteria = {
      minESGScore: 70,
      excludeControversies: true
    };

    if (sector) {
      // Only include specified sector
      criteria.excludeSectors = ['Energy', 'Utilities', 'Materials', 'Industrials', 'Financials',
        'Technology', 'Health Care', 'Consumer Staples', 'Consumer Discretionary',
        'Communication Services', 'Real Estate'].filter(s => s !== sector);
    }

    let results = esgService.screenStocks(criteria);

    if (limit) {
      results = results.slice(0, parseInt(limit));
    }

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Error fetching ESG leaders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/laggards
 * Get lowest ESG-rated stocks (for exclusion screening)
 */
router.get('/laggards', async (req, res) => {
  try {
    const { limit } = req.query;
    const results = esgService.screenStocks({ minESGScore: 0 })
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, parseInt(limit) || 20);

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Error fetching ESG laggards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/low-carbon
 * Get stocks with low carbon intensity
 */
router.get('/low-carbon', async (req, res) => {
  try {
    const { maxIntensity, limit } = req.query;
    const results = esgService.screenStocks({
      maxCarbonIntensity: parseFloat(maxIntensity) || 15
    }).slice(0, parseInt(limit) || 30);

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Error fetching low-carbon stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== UN SDG ENDPOINTS ====================

/**
 * GET /api/esg/sdg/goals
 * Get list of all UN SDG goals
 */
router.get('/sdg/goals', (req, res) => {
  const goals = Object.entries(esgService.constructor.SDG_NAMES).map(([id, name]) => ({
    id: parseInt(id),
    name,
    icon: `sdg-${id}`
  }));
  res.json({ success: true, data: goals });
});

/**
 * GET /api/esg/sdg/coverage/:sdgId
 * Get stocks aligned with a specific SDG
 */
router.get('/sdg/coverage/:sdgId', async (req, res) => {
  try {
    const sdgId = parseInt(req.params.sdgId);
    const results = esgService.screenStocks({
      requireSDGs: [sdgId]
    });

    res.json({
      success: true,
      data: {
        sdg: {
          id: sdgId,
          name: esgService.constructor.SDG_NAMES[sdgId]
        },
        stocks: results,
        count: results.length
      }
    });
  } catch (error) {
    logger.error('Error fetching SDG coverage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SECTOR ANALYSIS ====================

/**
 * GET /api/esg/sectors
 * Get ESG breakdown by sector
 */
router.get('/sectors', async (req, res) => {
  try {
    const sectors = {};
    const allStocks = esgService.screenStocks({ minESGScore: 0 });

    allStocks.forEach(stock => {
      const sector = stock.sector || 'Other';
      if (!sectors[sector]) {
        sectors[sector] = {
          name: sector,
          stocks: [],
          avgESG: 0,
          avgEnvironmental: 0,
          avgSocial: 0,
          avgGovernance: 0,
          avgCarbon: 0
        };
      }
      sectors[sector].stocks.push(stock);
    });

    // Calculate averages
    Object.values(sectors).forEach(sector => {
      const count = sector.stocks.length;
      sector.avgESG = Math.round(sector.stocks.reduce((sum, s) => sum + s.overallScore, 0) / count * 10) / 10;
      sector.avgEnvironmental = Math.round(sector.stocks.reduce((sum, s) => sum + s.environmental, 0) / count * 10) / 10;
      sector.avgSocial = Math.round(sector.stocks.reduce((sum, s) => sum + s.social, 0) / count * 10) / 10;
      sector.avgGovernance = Math.round(sector.stocks.reduce((sum, s) => sum + s.governance, 0) / count * 10) / 10;
      sector.avgCarbon = Math.round(sector.stocks.reduce((sum, s) => sum + s.carbonIntensity, 0) / count * 10) / 10;
      sector.stockCount = count;
      delete sector.stocks; // Remove individual stocks from summary
    });

    const sectorData = Object.values(sectors).sort((a, b) => b.avgESG - a.avgESG);

    res.json({ success: true, data: sectorData });
  } catch (error) {
    logger.error('Error fetching sector ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/sectors/:sector
 * Get ESG data for stocks in a specific sector
 */
router.get('/sectors/:sector', async (req, res) => {
  try {
    const allStocks = esgService.screenStocks({ minESGScore: 0 });
    const sectorStocks = allStocks.filter(s =>
      s.sector?.toLowerCase() === req.params.sector.toLowerCase()
    );

    res.json({ success: true, data: sectorStocks });
  } catch (error) {
    logger.error('Error fetching sector stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COMPARISON ====================

/**
 * POST /api/esg/compare
 * Compare ESG data for multiple stocks
 */
router.post('/compare', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least 2 symbols to compare'
      });
    }

    // Use async API-based comparison for real-time data
    const comparisonPromises = symbols.slice(0, 10).map(async (symbol) => {
      const esg = await esgService.getStockESGAsync(symbol);
      const sdg = esgService.getSDGAlignment(symbol);
      const controversies = esgService.getControversies(symbol);

      return {
        ...esg,
        overallScore: Math.round((esg.environmental + esg.social + esg.governance) / 3 * 10) / 10,
        sdgAlignment: sdg.alignmentScore,
        controversyLevel: controversies.level
      };
    });

    const comparison = await Promise.all(comparisonPromises);

    res.json({ success: true, data: comparison });
  } catch (error) {
    logger.error('Error comparing stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PROVIDER MANAGEMENT ====================

/**
 * GET /api/esg/providers
 * Get status of all ESG data providers
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = esgDataProvider.getProviderStatus();
    res.json({
      success: true,
      data: {
        providers,
        primaryProvider: providers.find(p => p.enabled && p.priority === 1)?.name || 'none',
        availableProviders: providers.filter(p => p.enabled).map(p => p.name)
      }
    });
  } catch (error) {
    logger.error('Error fetching provider status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/providers/:provider/test
 * Test a specific ESG provider with a sample symbol
 */
router.get('/providers/:provider/test', authenticate, async (req, res) => {
  try {
    const testSymbol = req.query.symbol || 'AAPL';
    const startTime = Date.now();

    const data = await esgDataProvider.getESGData(testSymbol, {
      forceRefresh: true,
      preferredProvider: req.params.provider
    });

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        provider: req.params.provider,
        testSymbol,
        responseTimeMs: responseTime,
        dataReceived: !!data,
        sampleData: data ? {
          scores: data.scores,
          rating: data.rating,
          provider: data.provider
        } : null
      }
    });
  } catch (error) {
    logger.error('Error testing provider:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: req.params.provider
    });
  }
});

/**
 * GET /api/esg/ratings/:symbol
 * Get unified ESG rating for a symbol
 */
router.get('/ratings/:symbol', async (req, res) => {
  try {
    const esgData = await esgService.getStockESGAsync(req.params.symbol);
    const overallScore = (esgData.environmental + esgData.social + esgData.governance) / 3;
    const rating = esgDataProvider.getUnifiedRating(overallScore);

    res.json({
      success: true,
      data: {
        symbol: req.params.symbol.toUpperCase(),
        overallScore: Math.round(overallScore * 10) / 10,
        rating: rating.label,
        ratingColor: rating.color,
        componentScores: {
          environmental: esgData.environmental,
          social: esgData.social,
          governance: esgData.governance
        },
        source: esgData.source,
        dataQuality: esgData.dataQuality
      }
    });
  } catch (error) {
    logger.error('Error fetching ESG rating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
