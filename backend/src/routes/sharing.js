/**
 * Portfolio Sharing Routes
 * API endpoints for sharing portfolios publicly
 */

const express = require('express');
const router = express.Router();
const sharingService = require('../services/sharingService');
const { authenticate: auth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/sharing/:portfolioId/create
 * Create or update share link for a portfolio
 */
router.post('/:portfolioId/create', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const { isPublic, expiresAt, allowedFields, showValues, showQuantities } = req.body;

    const result = await sharingService.createShareLink(req.user.id, portfolioId, {
      isPublic,
      expiresAt,
      allowedFields,
      showValues,
      showQuantities
    });

    res.status(201).json({
      success: true,
      message: 'Share link created',
      ...result
    });
  } catch (error) {
    logger.error('Create share link error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to create share link'
    });
  }
});

/**
 * GET /api/sharing/:portfolioId/settings
 * Get share settings for a portfolio
 */
router.get('/:portfolioId/settings', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const settings = await sharingService.getShareSettings(req.user.id, portfolioId);

    if (!settings) {
      return res.json({
        success: true,
        shared: false,
        message: 'Portfolio is not shared'
      });
    }

    res.json({
      success: true,
      shared: true,
      ...settings
    });
  } catch (error) {
    logger.error('Get share settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get share settings'
    });
  }
});

/**
 * DELETE /api/sharing/:portfolioId
 * Disable sharing for a portfolio
 */
router.delete('/:portfolioId', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    await sharingService.disableSharing(req.user.id, portfolioId);

    res.json({
      success: true,
      message: 'Sharing disabled'
    });
  } catch (error) {
    logger.error('Disable sharing error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to disable sharing'
    });
  }
});

/**
 * GET /api/sharing/:portfolioId/analytics
 * Get share analytics for a portfolio
 */
router.get('/:portfolioId/analytics', auth, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const analytics = await sharingService.getShareAnalytics(req.user.id, portfolioId);

    res.json({
      success: true,
      ...analytics
    });
  } catch (error) {
    logger.error('Get share analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get share analytics'
    });
  }
});

/**
 * GET /api/shared/:shareToken
 * Get shared portfolio data (PUBLIC - no auth required)
 */
router.get('/public/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const portfolio = await sharingService.getSharedPortfolio(shareToken);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Shared portfolio not found'
      });
    }

    if (portfolio.expired) {
      return res.status(410).json({
        success: false,
        error: 'This share link has expired'
      });
    }

    res.json({
      success: true,
      portfolio
    });
  } catch (error) {
    logger.error('Get shared portfolio error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load shared portfolio'
    });
  }
});

module.exports = router;
