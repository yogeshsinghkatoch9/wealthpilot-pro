/**
 * Monitoring & Metrics Routes
 * Provides endpoints for health checks, metrics, and monitoring dashboards
 */

const express = require('express');
const router = express.Router();
const { monitoringService } = require('../services/monitoringService');

/**
 * @swagger
 * /api/monitoring/health:
 *   get:
 *     tags: [Monitoring]
 *     summary: Detailed health check
 *     responses:
 *       200:
 *         description: System health status
 */
router.get('/health', (req, res) => {
  res.json(monitoringService.getSystemHealth());
});

/**
 * @swagger
 * /api/monitoring/metrics:
 *   get:
 *     tags: [Monitoring]
 *     summary: Request metrics
 *     responses:
 *       200:
 *         description: Request statistics
 */
router.get('/metrics', (req, res) => {
  res.json(monitoringService.getRequestMetrics());
});

/**
 * @swagger
 * /api/monitoring/dashboard:
 *   get:
 *     tags: [Monitoring]
 *     summary: Full monitoring dashboard
 *     responses:
 *       200:
 *         description: Complete monitoring data
 */
router.get('/dashboard', (req, res) => {
  res.json(monitoringService.getDashboard());
});

/**
 * @swagger
 * /api/monitoring/errors:
 *   get:
 *     tags: [Monitoring]
 *     summary: Recent errors
 *     responses:
 *       200:
 *         description: List of recent errors
 */
router.get('/errors', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(monitoringService.getRecentErrors(limit));
});

/**
 * @swagger
 * /api/monitoring/prometheus:
 *   get:
 *     tags: [Monitoring]
 *     summary: Prometheus-compatible metrics
 *     produces:
 *       - text/plain
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 */
router.get('/prometheus', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(monitoringService.getPrometheusMetrics());
});

module.exports = router;
