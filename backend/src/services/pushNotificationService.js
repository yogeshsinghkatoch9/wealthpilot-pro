/**
 * Push Notification Service
 * Handles web push notifications for alerts and updates
 */

const webpush = require('web-push');
const db = require('../db');

class PushNotificationService {
  constructor() {
    // Generate VAPID keys if not set (should be stored in env)
    this.vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      privateKey: process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-FbRouADVXc-hK3YPqB6gKI7AvBP9qpE_qXk'
    };

    this.configured = false;
    this.configure();
  }

  configure() {
    try {
      webpush.setVapidDetails(
        'mailto:notifications@wealthpilot.app',
        this.vapidKeys.publicKey,
        this.vapidKeys.privateKey
      );
      this.configured = true;
    } catch (error) {
      console.error('Failed to configure web-push:', error.message);
    }
  }

  /**
   * Get VAPID public key for frontend
   */
  getPublicKey() {
    return this.vapidKeys.publicKey;
  }

  /**
   * Save push subscription for a user
   */
  async saveSubscription(userId, subscription) {
    try {
      // Check if subscription already exists
      const existing = await db.query(
        `SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
        [userId, subscription.endpoint]
      );

      if (existing.rows.length > 0) {
        // Update existing subscription
        await db.query(
          `UPDATE push_subscriptions
           SET p256dh = $1, auth = $2, updated_at = NOW()
           WHERE user_id = $3 AND endpoint = $4`,
          [subscription.keys.p256dh, subscription.keys.auth, userId, subscription.endpoint]
        );
        return { id: existing.rows[0].id, updated: true };
      }

      // Insert new subscription
      const result = await db.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
      );

      return { id: result.rows[0].id, created: true };
    } catch (error) {
      console.error('Failed to save push subscription:', error.message);
      throw error;
    }
  }

  /**
   * Remove push subscription
   */
  async removeSubscription(userId, endpoint) {
    try {
      await db.query(
        `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
        [userId, endpoint]
      );
      return { removed: true };
    } catch (error) {
      console.error('Failed to remove push subscription:', error.message);
      throw error;
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId) {
    try {
      const result = await db.query(
        `SELECT * FROM push_subscriptions WHERE user_id = $1`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get user subscriptions:', error.message);
      return [];
    }
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(userId, notification) {
    if (!this.configured) {
      console.warn('Push notifications not configured');
      return { sent: 0, failed: 0 };
    }

    const subscriptions = await this.getUserSubscriptions(userId);
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(notification)
        );
        sent++;
      } catch (error) {
        failed++;
        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.removeSubscription(userId, sub.endpoint);
        }
      }
    }

    return { sent, failed };
  }

  /**
   * Send price alert notification
   */
  async sendPriceAlert(userId, alert) {
    const { symbol, type, price, targetPrice, message } = alert;

    const direction = type === 'price_above' ? 'above' : 'below';
    const emoji = type === 'price_above' ? '📈' : '📉';

    return this.sendToUser(userId, {
      title: `${emoji} ${symbol} Price Alert`,
      body: message || `${symbol} is now ${direction} $${targetPrice} (Current: $${price})`,
      url: `/stock/${symbol}`,
      data: { type: 'price_alert', symbol, price }
    });
  }

  /**
   * Send portfolio change notification
   */
  async sendPortfolioChange(userId, change) {
    const { portfolioName, changePercent, changeAmount } = change;

    const isPositive = changePercent >= 0;
    const emoji = isPositive ? '📈' : '📉';
    const sign = isPositive ? '+' : '';

    return this.sendToUser(userId, {
      title: `${emoji} Portfolio Update`,
      body: `${portfolioName}: ${sign}${changePercent.toFixed(2)}% (${sign}$${Math.abs(changeAmount).toFixed(2)})`,
      url: '/portfolios',
      data: { type: 'portfolio_change', changePercent }
    });
  }

  /**
   * Send dividend notification
   */
  async sendDividendNotification(userId, dividend) {
    const { symbol, amount, paymentDate } = dividend;

    return this.sendToUser(userId, {
      title: '💰 Dividend Payment',
      body: `${symbol} dividend of $${amount.toFixed(2)} on ${paymentDate}`,
      url: '/dividends',
      data: { type: 'dividend', symbol, amount }
    });
  }

  /**
   * Send earnings notification
   */
  async sendEarningsNotification(userId, earnings) {
    const { symbol, date, time } = earnings;

    return this.sendToUser(userId, {
      title: '📊 Earnings Report',
      body: `${symbol} reports earnings ${time === 'BMO' ? 'before market' : 'after market'} on ${date}`,
      url: `/stock/${symbol}`,
      data: { type: 'earnings', symbol }
    });
  }

  /**
   * Send general notification
   */
  async sendNotification(userId, title, body, url = '/dashboard') {
    return this.sendToUser(userId, {
      title,
      body,
      url,
      data: { type: 'general' }
    });
  }

  /**
   * Send test notification
   */
  async sendTestNotification(userId) {
    return this.sendToUser(userId, {
      title: '🔔 Test Notification',
      body: 'Push notifications are working! You will receive alerts here.',
      url: '/settings',
      data: { type: 'test' }
    });
  }

  /**
   * Broadcast to all users (for system announcements)
   */
  async broadcast(notification) {
    if (!this.configured) {
      console.warn('Push notifications not configured');
      return { sent: 0, failed: 0 };
    }

    try {
      const result = await db.query(
        `SELECT DISTINCT user_id FROM push_subscriptions`
      );

      let totalSent = 0;
      let totalFailed = 0;

      for (const row of result.rows) {
        const { sent, failed } = await this.sendToUser(row.user_id, notification);
        totalSent += sent;
        totalFailed += failed;
      }

      return { sent: totalSent, failed: totalFailed };
    } catch (error) {
      console.error('Failed to broadcast:', error.message);
      return { sent: 0, failed: 0 };
    }
  }
}

// Export singleton
module.exports = new PushNotificationService();
