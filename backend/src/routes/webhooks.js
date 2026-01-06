/**
 * Webhook Management API Routes
 * Endpoints for managing webhook subscriptions
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const webhookService = require('../services/webhookService');
const { WebhookService } = require('../services/webhookService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// All webhook routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: List all webhooks
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', async (req, res) => {
  try {
    const webhooks = await webhookService.getUserWebhooks(req.user.id);

    res.json({
      success: true,
      data: webhooks
    });
  } catch (error) {
    logger.error('[WebhookAPI] List webhooks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list webhooks'
    });
  }
});

/**
 * @swagger
 * /api/webhooks/events:
 *   get:
 *     tags: [Webhooks]
 *     summary: List all available event types
 *     security: [{ bearerAuth: [] }]
 */
router.get('/events', (req, res) => {
  res.json({
    success: true,
    data: WebhookService.EVENTS
  });
});

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     tags: [Webhooks]
 *     summary: Create a new webhook
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', [
  body('url').isURL({ protocols: ['http', 'https'] }).withMessage('Valid URL required'),
  body('events').isArray({ min: 1 }).withMessage('At least one event required'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { url, events, description, headers } = req.body;

    const webhook = await webhookService.createWebhook(req.user.id, {
      url,
      events,
      description,
      headers
    });

    res.status(201).json({
      success: true,
      message: 'Webhook created successfully',
      data: webhook
    });
  } catch (error) {
    logger.error('[WebhookAPI] Create webhook error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}:
 *   get:
 *     tags: [Webhooks]
 *     summary: Get webhook details
 */
router.get('/:id', async (req, res) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.id, req.user.id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found'
      });
    }

    res.json({
      success: true,
      data: webhook
    });
  } catch (error) {
    logger.error('[WebhookAPI] Get webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook'
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}:
 *   put:
 *     tags: [Webhooks]
 *     summary: Update a webhook
 */
router.put('/:id', [
  body('url').optional().isURL({ protocols: ['http', 'https'] }),
  body('events').optional().isArray({ min: 1 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const webhook = await webhookService.updateWebhook(
      req.params.id,
      req.user.id,
      req.body
    );

    res.json({
      success: true,
      message: 'Webhook updated successfully',
      data: webhook
    });
  } catch (error) {
    logger.error('[WebhookAPI] Update webhook error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}:
 *   delete:
 *     tags: [Webhooks]
 *     summary: Delete a webhook
 */
router.delete('/:id', async (req, res) => {
  try {
    await webhookService.deleteWebhook(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  } catch (error) {
    logger.error('[WebhookAPI] Delete webhook error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}/secret:
 *   post:
 *     tags: [Webhooks]
 *     summary: Regenerate webhook secret
 */
router.post('/:id/secret', async (req, res) => {
  try {
    const result = await webhookService.regenerateSecret(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Secret regenerated successfully',
      data: result
    });
  } catch (error) {
    logger.error('[WebhookAPI] Regenerate secret error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}/test:
 *   post:
 *     tags: [Webhooks]
 *     summary: Send a test webhook
 */
router.post('/:id/test', async (req, res) => {
  try {
    const result = await webhookService.testWebhook(req.params.id, req.user.id);

    res.json({
      success: true,
      message: result.success ? 'Test webhook delivered' : 'Test webhook delivery failed',
      data: result
    });
  } catch (error) {
    logger.error('[WebhookAPI] Test webhook error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}/deliveries:
 *   get:
 *     tags: [Webhooks]
 *     summary: Get webhook delivery history
 */
router.get('/:id/deliveries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const deliveries = await webhookService.getDeliveryHistory(
      req.params.id,
      req.user.id,
      limit
    );

    res.json({
      success: true,
      data: deliveries
    });
  } catch (error) {
    logger.error('[WebhookAPI] Get deliveries error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/webhooks/{id}/stats:
 *   get:
 *     tags: [Webhooks]
 *     summary: Get webhook statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await webhookService.getWebhookStats(req.params.id, req.user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[WebhookAPI] Get stats error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
