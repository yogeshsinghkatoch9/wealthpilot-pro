/**
 * Security Management Routes
 * Admin endpoints for monitoring and managing security features
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const ddos = require('../middleware/ddosProtection');

// Admin check middleware
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

/**
 * GET /api/security/status
 * Get current security/protection status
 */
router.get('/status', authenticate, adminOnly, (req, res) => {
  try {
    const status = ddos.getProtectionStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error fetching security status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/security/config
 * Get current DDoS protection configuration
 */
router.get('/config', authenticate, adminOnly, (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        ...ddos.CONFIG,
        // Hide sensitive patterns
        botUserAgents: ddos.CONFIG.botUserAgents.length,
        suspiciousPaths: ddos.CONFIG.suspiciousPaths.length
      }
    });
  } catch (error) {
    logger.error('Error fetching security config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/security/blacklist
 * Add IP to blacklist
 */
router.post('/blacklist', authenticate, adminOnly, (req, res) => {
  try {
    const { ip, reason } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address required'
      });
    }

    // Validate IP format
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$|^[a-fA-F0-9:]+$/;
    if (!ipRegex.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    ddos.manualBlacklist(ip, reason || 'Manual blacklist by admin');
    logger.info(`IP manually blacklisted by ${req.user.email}: ${ip}`);

    res.json({
      success: true,
      message: `IP ${ip} has been blacklisted`
    });
  } catch (error) {
    logger.error('Error blacklisting IP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/security/blacklist/:ip
 * Remove IP from blacklist
 */
router.delete('/blacklist/:ip', authenticate, adminOnly, (req, res) => {
  try {
    const ip = decodeURIComponent(req.params.ip);
    const removed = ddos.removeFromBlacklist(ip);

    if (removed) {
      logger.info(`IP removed from blacklist by ${req.user.email}: ${ip}`);
      res.json({
        success: true,
        message: `IP ${ip} has been removed from blacklist`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'IP not found in blacklist'
      });
    }
  } catch (error) {
    logger.error('Error removing IP from blacklist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/security/whitelist
 * Add IP to whitelist
 */
router.post('/whitelist', authenticate, adminOnly, (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address required'
      });
    }

    ddos.manualWhitelist(ip);
    logger.info(`IP manually whitelisted by ${req.user.email}: ${ip}`);

    res.json({
      success: true,
      message: `IP ${ip} has been whitelisted`
    });
  } catch (error) {
    logger.error('Error whitelisting IP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/security/whitelist/:ip
 * Remove IP from whitelist
 */
router.delete('/whitelist/:ip', authenticate, adminOnly, (req, res) => {
  try {
    const ip = decodeURIComponent(req.params.ip);
    const removed = ddos.removeFromWhitelist(ip);

    if (removed) {
      logger.info(`IP removed from whitelist by ${req.user.email}: ${ip}`);
      res.json({
        success: true,
        message: `IP ${ip} has been removed from whitelist`
      });
    } else {
      res.json({
        success: false,
        error: 'Cannot remove localhost from whitelist'
      });
    }
  } catch (error) {
    logger.error('Error removing IP from whitelist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/security/ip/:ip
 * Check if IP is blocked/whitelisted
 */
router.get('/ip/:ip', authenticate, adminOnly, (req, res) => {
  try {
    const ip = decodeURIComponent(req.params.ip);

    res.json({
      success: true,
      data: {
        ip,
        blacklisted: ddos.isBlacklisted(ip),
        whitelisted: ddos.isWhitelisted(ip)
      }
    });
  } catch (error) {
    logger.error('Error checking IP status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/security/metrics
 * Get security metrics for monitoring dashboard
 */
router.get('/metrics', authenticate, adminOnly, async (req, res) => {
  try {
    const status = ddos.getProtectionStatus();

    // Security metrics - set to 0 when no monitoring data available
    const metrics = {
      current: status,
      history: {
        blockedRequestsToday: 0,
        suspiciousIPsToday: 0,
        attacksDetected: 0
      },
      topThreats: [], // Would come from logging aggregation
      rateLimitStats: {
        apiLimit: { triggered: 0, blocked: 0 },
        authLimit: { triggered: 0, blocked: 0 },
        marketLimit: { triggered: 0, blocked: 0 }
      }
    };

    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error('Error fetching security metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/security/test-protection
 * Test DDoS protection (development only)
 */
router.post('/test-protection', authenticate, adminOnly, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Not available in production'
    });
  }

  const { testType } = req.body;

  logger.info(`Security test initiated by ${req.user.email}: ${testType}`);

  res.json({
    success: true,
    message: `Test ${testType} acknowledged`,
    note: 'Security tests should be run carefully'
  });
});

module.exports = router;
