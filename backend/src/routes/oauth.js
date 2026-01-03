/**
 * OAuth2 Routes
 * Handles OAuth authentication flows for broker integrations
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const oauth2Service = require('../services/auth/oauth2Service');

/**
 * GET /api/oauth/providers
 * Get list of supported OAuth providers
 */
router.get('/providers', (req, res) => {
  try {
    const providers = oauth2Service.getSupportedProviders();
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    logger.error('Error fetching OAuth providers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/oauth/authorize/:provider
 * Start OAuth authorization flow
 */
router.get('/authorize/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;
    const { redirect_uri } = req.query;

    const result = await oauth2Service.startAuthFlow(
      req.user.id,
      provider,
      { redirectUri: redirect_uri }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('OAuth authorization error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/oauth/callback/:provider
 * Handle OAuth callback from provider
 */
router.get('/callback/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error, error_description } = req.query;

    // Handle provider errors
    if (error) {
      logger.error(`OAuth callback error for ${provider}:`, error_description || error);
      return res.redirect(
        `${process.env.FRONTEND_URL || ''}/settings/brokers?error=${encodeURIComponent(error_description || error)}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${process.env.FRONTEND_URL || ''}/settings/brokers?error=Missing authorization code or state`
      );
    }

    // Exchange code for tokens
    const result = await oauth2Service.handleCallback(provider, code, state);

    // Redirect to frontend success page
    res.redirect(
      `${process.env.FRONTEND_URL || ''}/settings/brokers?success=true&provider=${encodeURIComponent(result.provider)}`
    );
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect(
      `${process.env.FRONTEND_URL || ''}/settings/brokers?error=${encodeURIComponent(error.message)}`
    );
  }
});

/**
 * POST /api/oauth/callback/:provider
 * Alternative callback handler for POST requests (some providers use POST)
 */
router.post('/callback/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error, error_description } = req.body;

    if (error) {
      return res.status(400).json({
        success: false,
        error: error_description || error
      });
    }

    const result = await oauth2Service.handleCallback(provider, code, state);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/oauth/refresh/:provider
 * Refresh access token
 */
router.post('/refresh/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;

    const tokens = await oauth2Service.refreshTokens(req.user.id, provider);

    res.json({
      success: true,
      data: {
        provider,
        expiresIn: tokens.expires_in
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/oauth/revoke/:provider
 * Revoke tokens and disconnect provider
 */
router.delete('/revoke/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;

    await oauth2Service.revokeTokens(req.user.id, provider);

    res.json({
      success: true,
      message: `Disconnected from ${provider}`
    });
  } catch (error) {
    logger.error('Token revoke error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/oauth/connections
 * Get all connected OAuth providers for current user
 */
router.get('/connections', authenticate, async (req, res) => {
  try {
    const connections = await oauth2Service.getConnectedProviders(req.user.id);

    res.json({
      success: true,
      data: connections
    });
  } catch (error) {
    logger.error('Error fetching OAuth connections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/oauth/status/:provider
 * Check if user has valid token for provider
 */
router.get('/status/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;

    try {
      const accessToken = await oauth2Service.getValidAccessToken(req.user.id, provider);
      res.json({
        success: true,
        data: {
          connected: true,
          provider,
          hasValidToken: !!accessToken
        }
      });
    } catch (e) {
      res.json({
        success: true,
        data: {
          connected: false,
          provider,
          hasValidToken: false,
          error: e.message
        }
      });
    }
  } catch (error) {
    logger.error('Error checking OAuth status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
