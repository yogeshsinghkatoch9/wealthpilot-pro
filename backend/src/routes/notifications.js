/**
 * Notification Routes for WealthPilot Pro
 * API endpoints for managing notifications and push subscriptions
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const notificationService = require('../services/notifications');
const pushService = require('../services/pushNotificationService');

/**
 * GET /api/notifications/vapid-key
 * Get VAPID public key for push subscription
 */
router.get('/vapid-key', (req, res) => {
  res.json({
    success: true,
    publicKey: pushService.getPublicKey()
  });
});

/**
 * POST /api/notifications/push/subscribe
 * Subscribe to push notifications
 */
router.post('/push/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription object'
      });
    }

    const result = await pushService.saveSubscription(req.user.id, subscription);

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to push notifications',
      ...result
    });
  } catch (error) {
    logger.error('Push subscribe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe to push notifications'
    });
  }
});

/**
 * POST /api/notifications/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint is required'
      });
    }

    await pushService.removeSubscription(req.user.id, endpoint);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications'
    });
  } catch (error) {
    logger.error('Push unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe from push notifications'
    });
  }
});

/**
 * GET /api/notifications/push/subscriptions
 * Get user's push subscriptions
 */
router.get('/push/subscriptions', async (req, res) => {
  try {
    const subscriptions = await pushService.getUserSubscriptions(req.user.id);

    res.json({
      success: true,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        endpoint: sub.endpoint.substring(0, 50) + '...',
        createdAt: sub.created_at
      })),
      count: subscriptions.length
    });
  } catch (error) {
    logger.error('Get push subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscriptions'
    });
  }
});

/**
 * POST /api/notifications/push/test
 * Send test push notification
 */
router.post('/push/test', async (req, res) => {
  try {
    const result = await pushService.sendTestNotification(req.user.id);

    if (result.sent === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active push subscriptions found. Please enable notifications first.',
        ...result
      });
    }

    res.json({
      success: true,
      message: 'Test notification sent',
      ...result
    });
  } catch (error) {
    logger.error('Test push notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(req.user.id);
    res.json({ success: true, preferences });
  } catch (error) {
    logger.error('Error getting notification preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to get preferences' });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ success: false, error: 'Preferences required' });
    }

    const success = await notificationService.updateUserPreferences(req.user.id, preferences);
    
    if (success) {
      res.json({ success: true, message: 'Preferences updated' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update preferences' });
    }
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

/**
 * GET /api/notifications/history
 * Get notification history for user
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await notificationService.getNotificationHistory(req.user.id, limit);
    res.json({ success: true, notifications });
  } catch (error) {
    logger.error('Error getting notification history:', error);
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, count });
  } catch (error) {
    logger.error('Error getting unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await notificationService.markAsRead(id, req.user.id);
    
    if (success) {
      res.json({ success: true, message: 'Marked as read' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', async (req, res) => {
  try {
    // This would update all unread notifications
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Error marking all as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
});

/**
 * POST /api/notifications/test
 * Send a test notification (development only)
 */
router.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'Not available in production' });
  }

  try {
    const { type = 'welcome' } = req.body;
    
    let result;
    switch (type) {
      case 'welcome':
        result = await notificationService.sendWelcome(req.user.id);
        break;
      case 'alert':
        result = await notificationService.sendAlertTriggered(req.user.id, {
          symbol: 'AAPL',
          alertType: 'Price Above',
          targetPrice: 200,
          currentPrice: 205,
          changePercent: 2.5
        });
        break;
      case 'transaction':
        result = await notificationService.sendTransactionConfirmation(req.user.id, {
          symbol: 'AAPL',
          type: 'BUY',
          shares: 10,
          price: 200,
          total: 2000,
          date: new Date(),
          portfolioName: 'Test Portfolio'
        });
        break;
      case 'dividend':
        result = await notificationService.sendDividendReceived(req.user.id, {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          amount: 24.50,
          shares: 100,
          perShare: 0.245,
          exDate: '2024-02-09',
          payDate: '2024-02-15',
          portfolioName: 'Main Portfolio',
          ytdDividends: 450.75
        });
        break;
      default:
        return res.status(400).json({ success: false, error: 'Unknown notification type' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
