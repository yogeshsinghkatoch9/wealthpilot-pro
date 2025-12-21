/**
 * ETF Analyzer Routes
 * API endpoints for ETF analysis, holdings, overlap, and expenses
 */

const express = require('express');
const router = express.Router();
const ETFAnalyzerService = require('../services/etfAnalyzer');
const logger = require('../utils/logger');

/**
 * Search for ETFs
 * GET /api/etf-analyzer/search?query=SPY
 */
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    logger.info(`Searching for ETFs: ${query}`);
    const results = await ETFAnalyzerService.searchETFs(query);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    logger.error('ETF search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search ETFs'
    });
  }
});

/**
 * Get ETF profile/details
 * GET /api/etf-analyzer/profile/:symbol
 */
router.get('/profile/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    logger.info(`Fetching ETF profile: ${symbol}`);
    const profile = await ETFAnalyzerService.getETFProfile(symbol);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `ETF ${symbol} not found`
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('ETF profile fetch failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ETF profile'
    });
  }
});

/**
 * Get ETF holdings
 * GET /api/etf-analyzer/holdings/:symbol
 */
router.get('/holdings/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 50 } = req.query;

    logger.info(`Fetching LIVE ETF holdings: ${symbol}`);
    const result = await ETFAnalyzerService.getETFHoldings(symbol);

    // Handle both old array format and new object format
    const holdings = Array.isArray(result) ? result : result.holdings;
    const totalHoldings = Array.isArray(result) ? result.length : result.totalHoldings;

    res.json({
      success: true,
      data: {
        symbol,
        holdings: holdings.slice(0, parseInt(limit)),
        totalHoldings: totalHoldings,
        asOfDate: result.asOfDate || new Date().toISOString(),
        source: result.source || 'live'
      }
    });
  } catch (error) {
    logger.error('ETF holdings fetch failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ETF holdings'
    });
  }
});

/**
 * Get ETF sector allocation
 * GET /api/etf-analyzer/sectors/:symbol
 */
router.get('/sectors/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    logger.info(`Fetching sector allocation: ${symbol}`);
    const sectors = await ETFAnalyzerService.getSectorAllocation(symbol);

    res.json({
      success: true,
      data: {
        symbol,
        sectors
      }
    });
  } catch (error) {
    logger.error('Sector allocation fetch failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sector allocation'
    });
  }
});

/**
 * Calculate overlap between multiple ETFs
 * POST /api/etf-analyzer/overlap
 * Body: { symbols: ['SPY', 'VOO', 'IVV'] }
 */
router.post('/overlap', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 ETF symbols are required for overlap analysis'
      });
    }

    if (symbols.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 ETFs can be compared at once'
      });
    }

    logger.info(`Calculating overlap for: ${symbols.join(', ')}`);
    const overlap = await ETFAnalyzerService.calculateOverlap(symbols);

    res.json({
      success: true,
      data: overlap
    });
  } catch (error) {
    logger.error('Overlap calculation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate overlap'
    });
  }
});

/**
 * Compare expense ratios and fees
 * POST /api/etf-analyzer/compare-expenses
 * Body: { symbols: ['SPY', 'VOO', 'IVV'] }
 */
router.post('/compare-expenses', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 ETF symbols are required for expense comparison'
      });
    }

    logger.info(`Comparing expenses for: ${symbols.join(', ')}`);
    const comparison = await ETFAnalyzerService.compareExpenses(symbols);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    logger.error('Expense comparison failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to compare expenses'
    });
  }
});

/**
 * Get comprehensive ETF analysis
 * GET /api/etf-analyzer/analyze/:symbol
 */
router.get('/analyze/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    logger.info(`Running comprehensive analysis for: ${symbol}`);

    // Fetch all data in parallel
    const [profile, holdings, sectors] = await Promise.all([
      ETFAnalyzerService.getETFProfile(symbol),
      ETFAnalyzerService.getETFHoldings(symbol),
      ETFAnalyzerService.getSectorAllocation(symbol)
    ]);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `ETF ${symbol} not found`
      });
    }

    res.json({
      success: true,
      data: {
        profile,
        holdings: holdings.slice(0, 25), // Top 25 holdings
        sectors,
        analytics: {
          topHolding: holdings[0],
          top5Weight: holdings.slice(0, 5).reduce((sum, h) => sum + h.weight, 0).toFixed(2),
          top10Weight: holdings.slice(0, 10).reduce((sum, h) => sum + h.weight, 0).toFixed(2),
          diversificationScore: this.calculateDiversificationScore(holdings),
          dominantSector: sectors[0]
        }
      }
    });
  } catch (error) {
    logger.error('Comprehensive analysis failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze ETF'
    });
  }
});

/**
 * Helper: Calculate diversification score
 */
function calculateDiversificationScore(holdings) {
  if (!holdings || holdings.length === 0) return 0;

  // Simple Herfindahl-Hirschman Index (HHI)
  const hhi = holdings.reduce((sum, h) => sum + Math.pow(h.weight, 2), 0);

  // Normalize to 0-100 scale (lower HHI = better diversification)
  // Perfect diversification (equal weights) would be 1/n
  // High concentration would approach 100
  const score = Math.max(0, 100 - (hhi / 100) * 100);

  return score.toFixed(1);
}

/**
 * Clear cache
 * POST /api/etf-analyzer/clear-cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    ETFAnalyzerService.clearCache();
    logger.info('ETF analyzer cache cleared');

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('Cache clear failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;
