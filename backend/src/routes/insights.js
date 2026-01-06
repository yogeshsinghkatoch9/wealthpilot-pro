/**
 * AI Insights Routes
 * API endpoints for AI-powered portfolio analysis and recommendations
 */

const express = require('express');
const router = express.Router();
const aiInsightsService = require('../services/aiInsightsService');
const { authenticate: auth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/insights/portfolio/:portfolioId
 * Generate comprehensive AI insights for a portfolio
 */
router.get('/portfolio/:portfolioId', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const result = await aiInsightsService.generatePortfolioInsights(portfolioId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Portfolio insights error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to generate portfolio insights'
    });
  }
});

/**
 * GET /api/insights/portfolio/:portfolioId/trade-ideas
 * Generate AI-powered trade ideas for a portfolio
 */
router.get('/portfolio/:portfolioId/trade-ideas', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const result = await aiInsightsService.generateTradeIdeas(portfolioId);

    res.json(result);
  } catch (error) {
    logger.error('Trade ideas error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to generate trade ideas'
    });
  }
});

/**
 * GET /api/insights/portfolio/:portfolioId/risk
 * Generate risk warnings for a portfolio
 */
router.get('/portfolio/:portfolioId/risk', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const result = await aiInsightsService.generateRiskWarnings(portfolioId);

    res.json(result);
  } catch (error) {
    logger.error('Risk warnings error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to generate risk warnings'
    });
  }
});

/**
 * GET /api/insights/daily-summary
 * Generate daily portfolio summary for current user
 */
router.get('/daily-summary', auth, async (req, res) => {
  try {
    const result = await aiInsightsService.generateDailySummary(req.user.id);

    res.json(result);
  } catch (error) {
    logger.error('Daily summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate daily summary'
    });
  }
});

/**
 * GET /api/insights/market-sentiment
 * Generate market sentiment summary
 */
router.get('/market-sentiment', auth, async (req, res) => {
  try {
    const result = await aiInsightsService.generateMarketSentimentSummary();

    res.json(result);
  } catch (error) {
    logger.error('Market sentiment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate market sentiment'
    });
  }
});

/**
 * GET /api/insights/market
 * Generate market trend insights
 */
router.get('/market', auth, async (req, res) => {
  try {
    const result = await aiInsightsService.generateMarketInsights();

    res.json({
      success: true,
      insights: result
    });
  } catch (error) {
    logger.error('Market insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate market insights'
    });
  }
});

/**
 * GET /api/insights/watchlist-recommendations
 * Generate personalized watchlist recommendations
 */
router.get('/watchlist-recommendations', auth, async (req, res) => {
  try {
    const result = await aiInsightsService.generateWatchlistRecommendations(req.user.id);

    res.json(result);
  } catch (error) {
    logger.error('Watchlist recommendations error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate watchlist recommendations'
    });
  }
});

/**
 * GET /api/insights/portfolio/:portfolioId/latest
 * Get latest cached insights for a portfolio
 */
router.get('/portfolio/:portfolioId/latest', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const result = aiInsightsService.getLatestInsights(portfolioId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No insights found for this portfolio'
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Get latest insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get insights'
    });
  }
});

module.exports = router;
