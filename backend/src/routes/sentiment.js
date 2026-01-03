/**
 * Sentiment Analysis API Routes
 * Provides endpoints for sentiment data, social media mentions, and trending topics
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const sentimentService = require('../services/sentimentService');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/sentiment/analysis/:symbol
 * Get comprehensive sentiment analysis for a symbol
 */
router.get('/analysis/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const analysis = await sentimentService.getSentimentAnalysis(symbol.toUpperCase());

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('Error in /sentiment/analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment analysis',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/social/:symbol
 * Get social media sentiment breakdown
 */
router.get('/social/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const socialData = await sentimentService.getSocialMediaSentiment(symbol.toUpperCase());

    res.json({
      success: true,
      data: socialData
    });
  } catch (error) {
    logger.error('Error in /sentiment/social:', error);
    res.status(500).json({
      error: 'Failed to fetch social media sentiment',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/news/:symbol
 * Get news sentiment
 */
router.get('/news/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const newsData = await sentimentService.getNewsSentiment(symbol.toUpperCase());

    res.json({
      success: true,
      data: newsData
    });
  } catch (error) {
    logger.error('Error in /sentiment/news:', error);
    res.status(500).json({
      error: 'Failed to fetch news sentiment',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/analyst/:symbol
 * Get analyst sentiment
 */
router.get('/analyst/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const analystData = await sentimentService.getAnalystSentiment(symbol.toUpperCase());

    res.json({
      success: true,
      data: analystData
    });
  } catch (error) {
    logger.error('Error in /sentiment/analyst:', error);
    res.status(500).json({
      error: 'Failed to fetch analyst sentiment',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/trending/:symbol
 * Get trending topics for symbol
 */
router.get('/trending/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const topics = await sentimentService.getTrendingTopics(symbol.toUpperCase());

    res.json({
      success: true,
      data: topics
    });
  } catch (error) {
    logger.error('Error in /sentiment/trending:', error);
    res.status(500).json({
      error: 'Failed to fetch trending topics',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/history/:symbol
 * Get sentiment history for trend chart
 */
router.get('/history/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days) || 30;

    const history = await sentimentService.getSentimentHistory(symbol.toUpperCase(), days);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Error in /sentiment/history:', error);
    res.status(500).json({
      error: 'Failed to fetch sentiment history',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/volume/:symbol
 * Get mention volume breakdown by day
 */
router.get('/volume/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days) || 7;

    const volume = await sentimentService.getMentionVolumeByDay(symbol.toUpperCase(), days);

    res.json({
      success: true,
      data: volume
    });
  } catch (error) {
    logger.error('Error in /sentiment/volume:', error);
    res.status(500).json({
      error: 'Failed to fetch mention volume',
      message: error.message
    });
  }
});

/**
 * GET /api/sentiment/correlation/:symbol
 * Get sentiment-price correlation data
 */
router.get('/correlation/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const correlation = await sentimentService.calculatePriceCorrelation(symbol.toUpperCase());

    res.json({
      success: true,
      data: correlation
    });
  } catch (error) {
    logger.error('Error in /sentiment/correlation:', error);
    res.status(500).json({
      error: 'Failed to fetch correlation data',
      message: error.message
    });
  }
});

module.exports = router;
