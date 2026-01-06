/**
 * Secrets Management Routes
 * Admin-only endpoints for managing secrets and credentials
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const vaultService = require('../services/secrets/vaultService');

/**
 * GET /api/secrets/status
 * Get vault service status
 */
router.get('/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const status = vaultService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error getting vault status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/secrets/health
 * Health check for vault service
 */
router.get('/health', authenticate, requireAdmin, async (req, res) => {
  try {
    const health = await vaultService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({ success: health.status === 'healthy', data: health });
  } catch (error) {
    logger.error('Vault health check failed:', error);
    res.status(503).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/secrets/list
 * List all secrets (keys only, not values)
 */
router.get('/list', authenticate, requireAdmin, async (req, res) => {
  try {
    const { prefix } = req.query;
    const secrets = await vaultService.listSecrets(prefix);
    res.json({
      success: true,
      data: {
        secrets,
        count: secrets.length,
        prefix: prefix || ''
      }
    });
  } catch (error) {
    logger.error('Error listing secrets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/secrets/:key
 * Get a specific secret (admin only)
 */
router.get('/:key(*)', authenticate, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { version, skipCache } = req.query;

    const value = await vaultService.getSecret(key, {
      version,
      skipCache: skipCache === 'true'
    });

    if (!value) {
      return res.status(404).json({
        success: false,
        error: `Secret not found: ${key}`
      });
    }

    // Mask sensitive data for display
    const masked = typeof value === 'object'
      ? maskSensitiveFields(value)
      : '***MASKED***';

    res.json({
      success: true,
      data: {
        key,
        value: masked,
        note: 'Value is masked for security. Use API to retrieve actual value programmatically.'
      }
    });
  } catch (error) {
    logger.error('Error getting secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/secrets
 * Store a new secret
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { key, value, metadata } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }

    await vaultService.setSecret(key, value, { metadata });

    res.json({
      success: true,
      message: `Secret stored: ${key}`
    });
  } catch (error) {
    logger.error('Error storing secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/secrets/:key
 * Update an existing secret
 */
router.put('/:key(*)', authenticate, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, metadata } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    await vaultService.setSecret(key, value, { metadata });

    res.json({
      success: true,
      message: `Secret updated: ${key}`
    });
  } catch (error) {
    logger.error('Error updating secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/secrets/:key
 * Delete a secret
 */
router.delete('/:key(*)', authenticate, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;

    await vaultService.deleteSecret(key);

    res.json({
      success: true,
      message: `Secret deleted: ${key}`
    });
  } catch (error) {
    logger.error('Error deleting secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/secrets/cache/clear
 * Clear the secrets cache
 */
router.post('/cache/clear', authenticate, requireAdmin, async (req, res) => {
  try {
    vaultService.clearCache();
    res.json({
      success: true,
      message: 'Secrets cache cleared'
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BROKER CREDENTIALS ====================

/**
 * GET /api/secrets/brokers/:userId
 * List broker credentials for a user
 */
router.get('/brokers/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const credentials = await vaultService.listUserBrokerCredentials(userId);

    res.json({
      success: true,
      data: {
        userId,
        brokers: credentials.map(c => ({
          brokerId: c.brokerId,
          name: c.name
          // Don't expose actual credentials
        }))
      }
    });
  } catch (error) {
    logger.error('Error listing broker credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/secrets/brokers/:userId/:brokerId
 * Store broker credentials for a user
 */
router.post('/brokers/:userId/:brokerId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId, brokerId } = req.params;
    const credentials = req.body;

    await vaultService.storeBrokerCredentials(userId, brokerId, credentials);

    res.json({
      success: true,
      message: `Broker credentials stored for user ${userId}, broker ${brokerId}`
    });
  } catch (error) {
    logger.error('Error storing broker credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/secrets/brokers/:userId/:brokerId
 * Delete broker credentials
 */
router.delete('/brokers/:userId/:brokerId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId, brokerId } = req.params;

    await vaultService.deleteBrokerCredentials(userId, brokerId);

    res.json({
      success: true,
      message: `Broker credentials deleted for user ${userId}, broker ${brokerId}`
    });
  } catch (error) {
    logger.error('Error deleting broker credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== API KEYS ====================

/**
 * POST /api/secrets/apikeys/:service
 * Store API key for a service
 */
router.post('/apikeys/:service', authenticate, requireAdmin, async (req, res) => {
  try {
    const { service } = req.params;
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }

    await vaultService.storeApiKey(service, key, value);

    res.json({
      success: true,
      message: `API key stored for service ${service}`
    });
  } catch (error) {
    logger.error('Error storing API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HELPERS ====================

/**
 * Mask sensitive fields in an object
 */
function maskSensitiveFields(obj) {
  const sensitiveFields = [
    'password', 'secret', 'apiKey', 'api_key', 'token',
    'accessToken', 'refreshToken', 'privateKey', 'private_key'
  ];

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const masked = { ...obj };

  for (const key of Object.keys(masked)) {
    if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveFields(masked[key]);
    }
  }

  return masked;
}

module.exports = router;
