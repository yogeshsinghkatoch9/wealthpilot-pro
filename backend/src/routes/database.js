/**
 * Database Management Routes
 * Admin endpoints for monitoring and managing database performance
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const dbOptimization = require('../services/databaseOptimization');

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
 * GET /api/database/status
 * Get comprehensive database status
 */
router.get('/status', authenticate, adminOnly, async (req, res) => {
  try {
    const status = await dbOptimization.getDatabaseStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error fetching database status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/health
 * Database health check
 */
router.get('/health', authenticate, adminOnly, async (req, res) => {
  try {
    const health = await dbOptimization.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({ success: true, data: health });
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/queries
 * Get query performance statistics
 */
router.get('/queries', authenticate, adminOnly, (req, res) => {
  try {
    const stats = dbOptimization.getQueryStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error fetching query stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/slow-queries
 * Get slow query log
 */
router.get('/slow-queries', authenticate, adminOnly, (req, res) => {
  try {
    const stats = dbOptimization.getQueryStats();
    res.json({
      success: true,
      data: {
        threshold: dbOptimization.CONFIG.slowQueryThreshold,
        queries: stats.slowQueries
      }
    });
  } catch (error) {
    logger.error('Error fetching slow queries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/connections
 * Get connection pool status
 */
router.get('/connections', authenticate, adminOnly, async (req, res) => {
  try {
    const poolStatus = await dbOptimization.getConnectionPoolStatus();
    res.json({ success: true, data: poolStatus });
  } catch (error) {
    logger.error('Error fetching connection pool status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/indexes
 * Analyze database indexes
 */
router.get('/indexes', authenticate, adminOnly, async (req, res) => {
  try {
    const analysis = await dbOptimization.analyzeIndexes();
    res.json({ success: true, data: analysis });
  } catch (error) {
    logger.error('Error analyzing indexes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/cache
 * Get cache statistics
 */
router.get('/cache', authenticate, adminOnly, (req, res) => {
  try {
    const stats = dbOptimization.getQueryStats();
    res.json({ success: true, data: stats.cacheStats });
  } catch (error) {
    logger.error('Error fetching cache stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/database/cache
 * Clear query cache
 */
router.delete('/cache', authenticate, adminOnly, (req, res) => {
  try {
    const cleared = dbOptimization.clearCache();
    logger.info(`Cache cleared by ${req.user.email}: ${cleared} entries`);
    res.json({
      success: true,
      message: `Cleared ${cleared} cache entries`
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/database/cache/:pattern
 * Invalidate cache entries by pattern
 */
router.delete('/cache/:pattern', authenticate, adminOnly, (req, res) => {
  try {
    const pattern = new RegExp(req.params.pattern, 'i');
    const invalidated = dbOptimization.invalidateCache(pattern);
    logger.info(`Cache invalidated by ${req.user.email}: ${invalidated} entries matching ${req.params.pattern}`);
    res.json({
      success: true,
      message: `Invalidated ${invalidated} cache entries`
    });
  } catch (error) {
    logger.error('Error invalidating cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/database/maintenance
 * Run database maintenance (VACUUM ANALYZE)
 */
router.post('/maintenance', authenticate, adminOnly, async (req, res) => {
  try {
    const { table } = req.body;

    // Safety check for production
    if (process.env.NODE_ENV === 'production' && !req.body.confirm) {
      return res.status(400).json({
        success: false,
        error: 'Production maintenance requires confirmation',
        confirmRequired: true
      });
    }

    const result = await dbOptimization.runMaintenance(table || null);
    logger.info(`Database maintenance run by ${req.user.email}: ${table || 'full database'}`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error running maintenance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/database/reset-stats
 * Reset query statistics
 */
router.post('/reset-stats', authenticate, adminOnly, (req, res) => {
  try {
    const result = dbOptimization.resetStats();
    logger.info(`Query stats reset by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error resetting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/config
 * Get current database configuration
 */
router.get('/config', authenticate, adminOnly, (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        ...dbOptimization.CONFIG,
        databaseUrl: process.env.DATABASE_URL ? '[configured]' : '[not set]',
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error) {
    logger.error('Error fetching config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/database/tables
 * Get table statistics
 */
router.get('/tables', authenticate, adminOnly, async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');

    // Get counts for major tables
    const [
      users,
      portfolios,
      holdings,
      transactions,
      sessions,
      alerts,
      watchlists,
      notifications
    ] = await Promise.all([
      prisma.users.count(),
      prisma.portfolios.count(),
      prisma.holdings.count(),
      prisma.transactions.count(),
      prisma.sessions.count(),
      prisma.alerts.count(),
      prisma.watchlist.count(),
      prisma.notification.count()
    ]);

    res.json({
      success: true,
      data: {
        users,
        portfolios,
        holdings,
        transactions,
        sessions,
        alerts,
        watchlists,
        notifications,
        total: users + portfolios + holdings + transactions + sessions + alerts + watchlists + notifications
      }
    });
  } catch (error) {
    logger.error('Error fetching table stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
