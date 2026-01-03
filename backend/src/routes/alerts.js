const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const alertService = require('../services/alertService');
const logger = require('../utils/logger');
const { paginationMiddleware, paginateArray, buildPaginationMeta } = require('../middleware/pagination');

/**
 * GET /api/alerts
 * Get all alerts for the current user with pagination
 * Query params: page, limit, isActive, isTriggered, symbol
 */
router.get('/', authenticate, paginationMiddleware('alerts'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { isActive, isTriggered, symbol } = req.query;
    const { page, limit, offset } = req.pagination;

    const options = {};
    if (isActive !== undefined) options.isActive = isActive === 'true';
    if (isTriggered !== undefined) options.isTriggered = isTriggered === 'true';
    if (symbol) options.symbol = symbol;

    const allAlerts = await alertService.getUserAlerts(userId, options);

    // Parse condition JSON for each alert
    const alertsWithParsedCondition = allAlerts.map(alert => ({
      ...alert,
      condition: JSON.parse(alert.condition)
    }));

    // Apply pagination
    const total = alertsWithParsedCondition.length;
    const paginatedAlerts = alertsWithParsedCondition.slice(offset, offset + limit);
    const pagination = buildPaginationMeta(total, page, limit);

    res.json({
      success: true,
      data: paginatedAlerts,
      pagination,
      // Legacy field for backwards compatibility
      alerts: paginatedAlerts,
      total
    });

  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/alerts
 * Create a new alert
 *
 * Supports two formats:
 * 1. Complex format: { type: 'price_above', condition: { targetPrice: 100 }, symbol, message }
 * 2. Simple format:  { condition: 'above', targetPrice: 100, symbol, message }
 */
router.post('/', [
  authenticate,
  body('symbol').optional().isString(),
  body('message').optional().isString()
], async (req, res) => {
  try {
    const userId = req.user.id;
    let { type, symbol, condition, message, targetPrice } = req.body;

    // Handle simplified frontend format
    // Convert { condition: 'above', targetPrice: 100 } to { type: 'price_above', condition: { targetPrice: 100 } }
    if (typeof condition === 'string' && ['above', 'below'].includes(condition)) {
      type = condition === 'above' ? 'price_above' : 'price_below';
      condition = { targetPrice: parseFloat(targetPrice) };
    }

    // Validate type
    const validTypes = [
      'price_above', 'price_below', 'price_change',
      'portfolio_value', 'portfolio_gain', 'portfolio_loss',
      'dividend', 'earnings'
    ];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid alert type. Use: ' + validTypes.join(', ')
      });
    }

    // Ensure condition is an object
    if (!condition || typeof condition !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Condition must be an object with targetPrice or threshold'
      });
    }

    // Validate condition based on type
    const validationError = validateAlertCondition(type, condition);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const alert = await alertService.createAlert(userId, {
      type,
      symbol,
      condition,
      message
    });

    res.json({
      success: true,
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition)
      }
    });

  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/alerts/:id
 * Update an alert
 *
 * Supports both complex and simplified formats (see POST endpoint)
 */
router.put('/:id', [
  authenticate,
  body('symbol').optional().isString(),
  body('message').optional().isString(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;
    let { type, condition, targetPrice, message, isActive } = req.body;

    // Handle simplified frontend format for updates
    if (typeof condition === 'string' && ['above', 'below'].includes(condition)) {
      type = condition === 'above' ? 'price_above' : 'price_below';
      condition = { targetPrice: parseFloat(targetPrice) };
    }

    const updateData = {};
    if (type) updateData.type = type;
    if (condition && typeof condition === 'object') updateData.condition = condition;
    if (message !== undefined) updateData.message = message;
    if (isActive !== undefined) updateData.isActive = isActive;

    const alert = await alertService.updateAlert(alertId, userId, updateData);

    res.json({
      success: true,
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition)
      }
    });

  } catch (error) {
    logger.error('Error updating alert:', error);
    res.status(error.message === 'Alert not found' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete an alert
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;

    await alertService.deleteAlert(alertId, userId);

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting alert:', error);
    res.status(error.message === 'Alert not found' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/alerts/:id/reset
 * Reset a triggered alert
 */
router.post('/:id/reset', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;

    const alert = await alertService.resetAlert(alertId, userId);

    res.json({
      success: true,
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition)
      }
    });

  } catch (error) {
    logger.error('Error resetting alert:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/triggered
 * Get all triggered alerts for the current user
 */
router.get('/triggered', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const alerts = await alertService.getUserAlerts(userId, {
      isTriggered: true
    });

    const alertsWithParsedCondition = alerts.map(alert => ({
      ...alert,
      condition: JSON.parse(alert.condition)
    }));

    res.json({
      success: true,
      alerts: alertsWithParsedCondition
    });

  } catch (error) {
    logger.error('Error getting triggered alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/templates
 * Get alert templates/presets
 */
router.get('/templates', authenticate, (req, res) => {
  try {
    const templates = [
      {
        id: 'price_above',
        name: 'Price Above',
        description: 'Alert when a stock price goes above a target',
        icon: '📈',
        type: 'price_above',
        requiresSymbol: true,
        fields: [
          {
            name: 'targetPrice',
            label: 'Target Price',
            type: 'number',
            required: true,
            placeholder: '100.00',
            min: 0,
            step: 0.01
          }
        ]
      },
      {
        id: 'price_below',
        name: 'Price Below',
        description: 'Alert when a stock price drops below a target',
        icon: '📉',
        type: 'price_below',
        requiresSymbol: true,
        fields: [
          {
            name: 'targetPrice',
            label: 'Target Price',
            type: 'number',
            required: true,
            placeholder: '50.00',
            min: 0,
            step: 0.01
          }
        ]
      },
      {
        id: 'price_change_up',
        name: 'Price Up %',
        description: 'Alert when a stock rises by a percentage',
        icon: '🚀',
        type: 'price_change',
        requiresSymbol: true,
        fields: [
          {
            name: 'threshold',
            label: 'Percentage Threshold',
            type: 'number',
            required: true,
            placeholder: '5',
            min: 0,
            max: 100,
            step: 0.1
          },
          {
            name: 'direction',
            type: 'hidden',
            value: 'up'
          }
        ]
      },
      {
        id: 'price_change_down',
        name: 'Price Down %',
        description: 'Alert when a stock falls by a percentage',
        icon: '⚠️',
        type: 'price_change',
        requiresSymbol: true,
        fields: [
          {
            name: 'threshold',
            label: 'Percentage Threshold',
            type: 'number',
            required: true,
            placeholder: '5',
            min: 0,
            max: 100,
            step: 0.1
          },
          {
            name: 'direction',
            type: 'hidden',
            value: 'down'
          }
        ]
      },
      {
        id: 'portfolio_value_above',
        name: 'Portfolio Value Above',
        description: 'Alert when portfolio value exceeds a threshold',
        icon: '💰',
        type: 'portfolio_value',
        requiresSymbol: false,
        fields: [
          {
            name: 'portfolioId',
            label: 'Portfolio',
            type: 'portfolio',
            required: true
          },
          {
            name: 'threshold',
            label: 'Target Value',
            type: 'number',
            required: true,
            placeholder: '100000',
            min: 0,
            step: 100
          },
          {
            name: 'direction',
            type: 'hidden',
            value: 'above'
          }
        ]
      },
      {
        id: 'portfolio_gain',
        name: 'Portfolio Gain %',
        description: 'Alert when portfolio gains reach a percentage',
        icon: '📊',
        type: 'portfolio_gain',
        requiresSymbol: false,
        fields: [
          {
            name: 'portfolioId',
            label: 'Portfolio',
            type: 'portfolio',
            required: true
          },
          {
            name: 'threshold',
            label: 'Gain Percentage',
            type: 'number',
            required: true,
            placeholder: '10',
            min: 0,
            max: 1000,
            step: 0.1
          }
        ]
      },
      {
        id: 'dividend',
        name: 'Dividend Alert',
        description: 'Alert for upcoming dividend payments',
        icon: '💵',
        type: 'dividend',
        requiresSymbol: true,
        fields: []
      },
      {
        id: 'earnings',
        name: 'Earnings Alert',
        description: 'Alert for upcoming earnings reports',
        icon: '📅',
        type: 'earnings',
        requiresSymbol: true,
        fields: []
      }
    ];

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    logger.error('Error getting alert templates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Validate alert condition based on type
 */
function validateAlertCondition(type, condition) {
  switch (type) {
    case 'price_above':
    case 'price_below':
      if (!condition.targetPrice || typeof condition.targetPrice !== 'number') {
        return 'targetPrice is required and must be a number';
      }
      break;

    case 'price_change':
      if (!condition.threshold || typeof condition.threshold !== 'number') {
        return 'threshold is required and must be a number';
      }
      if (!condition.direction || !['up', 'down'].includes(condition.direction)) {
        return 'direction must be either "up" or "down"';
      }
      break;

    case 'portfolio_value':
      if (!condition.portfolioId) {
        return 'portfolioId is required';
      }
      if (!condition.threshold || typeof condition.threshold !== 'number') {
        return 'threshold is required and must be a number';
      }
      if (!condition.direction || !['above', 'below'].includes(condition.direction)) {
        return 'direction must be either "above" or "below"';
      }
      break;

    case 'portfolio_gain':
    case 'portfolio_loss':
      if (!condition.portfolioId) {
        return 'portfolioId is required';
      }
      if (!condition.threshold || typeof condition.threshold !== 'number') {
        return 'threshold is required and must be a number';
      }
      break;

    case 'dividend':
    case 'earnings':
      // No special validation needed
      break;

    default:
      return 'Invalid alert type';
  }

  return null;
}

/**
 * PUT /api/alerts/:id/dismiss
 * Dismiss a triggered alert (deactivate it)
 */
router.put('/:id/dismiss', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;

    const alert = await alertService.updateAlert(alertId, userId, { isActive: false });

    res.json({
      success: true,
      message: 'Alert dismissed',
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition)
      }
    });

  } catch (error) {
    logger.error('Error dismissing alert:', error);
    res.status(error.message === 'Alert not found' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/alerts/:id/reenable
 * Re-enable a dismissed alert
 */
router.put('/:id/reenable', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;

    const alert = await alertService.updateAlert(alertId, userId, {
      isActive: true,
      isTriggered: false
    });

    res.json({
      success: true,
      message: 'Alert re-enabled',
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition)
      }
    });

  } catch (error) {
    logger.error('Error re-enabling alert:', error);
    res.status(error.message === 'Alert not found' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
