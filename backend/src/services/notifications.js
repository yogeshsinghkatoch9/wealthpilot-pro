/**
 * Notification Service for WealthPilot Pro
 * Manages notification preferences, queuing, and delivery
 */

const emailService = require('./email');

const logger = require('../utils/logger');
class NotificationService {
  constructor() {
    this.db = null;
    this.queue = [];
    this.processing = false;
    this.batchSize = 10;
    this.batchInterval = 5000; // 5 seconds
  }

  /**
   * Initialize notification service with database
   */
  initialize(database) {
    this.db = database;
    this.startQueueProcessor();
    logger.debug('🔔 Notification service initialized');
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    const defaultPrefs = {
      email: {
        enabled: true,
        alerts: true,
        transactions: true,
        reports: true,
        weeklyDigest: true,
        security: true,
        dividends: true,
        marketing: false
      },
      push: {
        enabled: false,
        alerts: true,
        transactions: false
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'America/New_York'
      }
    };

    if (!this.db) return defaultPrefs;

    try {
      const user = await this.db.get('SELECT notification_preferences FROM users WHERE id = ?', [userId]);
      if (user?.notification_preferences) {
        return { ...defaultPrefs, ...JSON.parse(user.notification_preferences) };
      }
    } catch (error) {
      logger.error('Error getting notification preferences:', error);
    }

    return defaultPrefs;
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId, preferences) {
    if (!this.db) return false;

    try {
      await this.db.run(
        'UPDATE users SET notification_preferences = ? WHERE id = ?',
        [JSON.stringify(preferences), userId]
      );
      return true;
    } catch (error) {
      logger.error('Error updating notification preferences:', error);
      return false;
    }
  }

  /**
   * Check if notification should be sent based on preferences
   */
  async shouldSendNotification(userId, type, channel = 'email') {
    const prefs = await this.getUserPreferences(userId);
    
    // Check if channel is enabled
    if (!prefs[channel]?.enabled) return false;

    // Check specific notification type
    const typeMapping = {
      'welcome': 'enabled',
      'password_reset': 'security',
      'alert_triggered': 'alerts',
      'portfolio_summary': 'reports',
      'transaction_confirmation': 'transactions',
      'report_ready': 'reports',
      'account_activity': 'security',
      'weekly_digest': 'weeklyDigest',
      'security_alert': 'security',
      'dividend_received': 'dividends'
    };

    const prefKey = typeMapping[type] || 'enabled';
    if (!prefs[channel][prefKey]) return false;

    // Check quiet hours
    if (prefs.quietHours?.enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const { start, end } = prefs.quietHours;
      
      // Simple quiet hours check (doesn't handle timezone properly - would need moment-timezone)
      if (start < end) {
        if (currentTime >= start && currentTime < end) return false;
      } else {
        if (currentTime >= start || currentTime < end) return false;
      }
    }

    return true;
  }

  /**
   * Queue a notification for delivery
   */
  async queueNotification(notification) {
    this.queue.push({
      ...notification,
      queuedAt: new Date(),
      attempts: 0,
      maxAttempts: 3
    });

    // Log to database for tracking
    await this.logNotification(notification, 'queued');
  }

  /**
   * Send notification immediately (bypasses queue)
   */
  async sendImmediate(notification) {
    const { userId, type, data } = notification;
    
    // Get user info
    const user = await this.getUser(userId);
    if (!user) {
      logger.error('User not found for notification:', userId);
      return { success: false, error: 'User not found' };
    }

    // Check preferences
    const shouldSend = await this.shouldSendNotification(userId, type);
    if (!shouldSend) {
      await this.logNotification(notification, 'skipped', 'User preferences');
      return { success: true, skipped: true, reason: 'User preferences' };
    }

    // Send email
    const result = await emailService.send({
      to: user.email,
      subject: this.getSubjectForType(type, data),
      template: this.getTemplateForType(type),
      data: {
        ...data,
        name: user.name || user.email.split('@')[0],
        email: user.email
      }
    });

    await this.logNotification(notification, result.success ? 'sent' : 'failed', result.error);
    return result;
  }

  /**
   * Get user by ID
   */
  async getUser(userId) {
    if (!this.db) return null;
    try {
      return await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
    } catch (error) {
      logger.error('Error getting user:', error);
      return null;
    }
  }

  /**
   * Get subject line for notification type
   */
  getSubjectForType(type, data) {
    const subjects = {
      'welcome': 'Welcome to WealthPilot Pro! 🎉',
      'password_reset': 'Password Reset Request - WealthPilot Pro',
      'alert_triggered': `🔔 Alert: ${data?.symbol || 'Price'} target reached`,
      'portfolio_summary': `📊 Portfolio Summary: ${data?.portfolioName || 'Your Portfolio'}`,
      'transaction_confirmation': `✅ ${data?.type || 'Transaction'} Confirmed: ${data?.symbol || ''}`,
      'report_ready': `📄 Your ${data?.reportType || 'Report'} is Ready`,
      'account_activity': '🔐 Account Activity Alert',
      'weekly_digest': '📈 Your Weekly Investment Digest',
      'security_alert': '🚨 Security Alert - Action Required',
      'dividend_received': `💰 Dividend Received: ${data?.symbol || ''}`
    };

    return subjects[type] || 'Notification from WealthPilot Pro';
  }

  /**
   * Map notification type to email template
   */
  getTemplateForType(type) {
    const templates = {
      'welcome': 'welcome',
      'password_reset': 'passwordReset',
      'alert_triggered': 'alertTriggered',
      'portfolio_summary': 'portfolioSummary',
      'transaction_confirmation': 'transactionConfirmation',
      'report_ready': 'reportReady',
      'account_activity': 'accountActivity',
      'weekly_digest': 'weeklyDigest',
      'security_alert': 'securityAlert',
      'dividend_received': 'dividendReceived'
    };

    return templates[type] || 'welcome';
  }

  /**
   * Log notification to database
   */
  async logNotification(notification, status, error = null) {
    if (!this.db) return;

    try {
      await this.db.run(`
        INSERT INTO notification_logs (user_id, type, status, error, data, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `, [
        notification.userId,
        notification.type,
        status,
        error,
        JSON.stringify(notification.data)
      ]);
    } catch (err) {
      logger.error('Error logging notification:', err);
    }
  }

  /**
   * Process notification queue
   */
  startQueueProcessor() {
    setInterval(async () => {
      if (this.processing || this.queue.length === 0) return;

      this.processing = true;

      try {
        const batch = this.queue.splice(0, this.batchSize);
        
        for (const notification of batch) {
          try {
            const result = await this.sendImmediate(notification);
            
            if (!result.success && notification.attempts < notification.maxAttempts) {
              notification.attempts++;
              this.queue.push(notification);
            }
          } catch (error) {
            logger.error('Error processing notification:', error);
            if (notification.attempts < notification.maxAttempts) {
              notification.attempts++;
              this.queue.push(notification);
            }
          }
        }
      } finally {
        this.processing = false;
      }
    }, this.batchInterval);
  }

  // ============ Notification Helpers ============

  /**
   * Send welcome email to new user
   */
  async sendWelcome(userId, loginUrl = 'http://localhost:3000/login') {
    return this.sendImmediate({
      userId,
      type: 'welcome',
      data: {
        loginUrl,
        docsUrl: 'http://localhost:3000/docs'
      }
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(userId, resetToken, ipAddress = null) {
    return this.sendImmediate({
      userId,
      type: 'password_reset',
      data: {
        resetUrl: `http://localhost:3000/reset-password?token=${resetToken}`,
        expiresIn: '1 hour',
        ipAddress
      }
    });
  }

  /**
   * Send alert triggered notification
   */
  async sendAlertTriggered(userId, alertData) {
    return this.queueNotification({
      userId,
      type: 'alert_triggered',
      data: {
        ...alertData,
        dashboardUrl: 'http://localhost:3000/alerts'
      }
    });
  }

  /**
   * Send portfolio summary
   */
  async sendPortfolioSummary(userId, portfolioData) {
    return this.queueNotification({
      userId,
      type: 'portfolio_summary',
      data: {
        ...portfolioData,
        portfolioUrl: `http://localhost:3000/portfolios/${portfolioData.portfolioId}`
      }
    });
  }

  /**
   * Send transaction confirmation
   */
  async sendTransactionConfirmation(userId, transactionData) {
    return this.queueNotification({
      userId,
      type: 'transaction_confirmation',
      data: {
        ...transactionData,
        transactionUrl: `http://localhost:3000/transactions/${transactionData.transactionId}`
      }
    });
  }

  /**
   * Send report ready notification
   */
  async sendReportReady(userId, reportData) {
    return this.queueNotification({
      userId,
      type: 'report_ready',
      data: reportData
    });
  }

  /**
   * Send account activity alert
   */
  async sendAccountActivity(userId, activityData) {
    return this.sendImmediate({
      userId,
      type: 'account_activity',
      data: {
        ...activityData,
        securityUrl: 'http://localhost:3000/settings/security'
      }
    });
  }

  /**
   * Send weekly digest
   */
  async sendWeeklyDigest(userId, digestData) {
    return this.queueNotification({
      userId,
      type: 'weekly_digest',
      data: {
        ...digestData,
        dashboardUrl: 'http://localhost:3000/dashboard'
      }
    });
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(userId, alertData) {
    return this.sendImmediate({
      userId,
      type: 'security_alert',
      data: {
        ...alertData,
        securityUrl: 'http://localhost:3000/settings/security'
      }
    });
  }

  /**
   * Send dividend received notification
   */
  async sendDividendReceived(userId, dividendData) {
    return this.queueNotification({
      userId,
      type: 'dividend_received',
      data: {
        ...dividendData,
        dividendsUrl: 'http://localhost:3000/dividends'
      }
    });
  }

  /**
   * Send bulk weekly digests to all users
   */
  async sendBulkWeeklyDigests() {
    if (!this.db) return { success: false, error: 'Database not initialized' };

    try {
      const users = await this.db.all('SELECT id FROM users WHERE is_active = 1');
      const results = [];

      for (const user of users) {
        // Check if user wants weekly digest
        const shouldSend = await this.shouldSendNotification(user.id, 'weekly_digest');
        if (!shouldSend) continue;

        // Get user's portfolio data for digest
        const digestData = await this.generateWeeklyDigestData(user.id);
        if (digestData) {
          await this.sendWeeklyDigest(user.id, digestData);
          results.push({ userId: user.id, status: 'queued' });
        }
      }

      return { success: true, count: results.length };
    } catch (error) {
      logger.error('Error sending bulk digests:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate weekly digest data for a user
   */
  async generateWeeklyDigestData(userId) {
    if (!this.db) return null;

    try {
      // Get user's portfolios
      const portfolios = await this.db.all(`
        SELECT p.*, 
          (SELECT SUM(h.shares * h.current_price) FROM holdings h WHERE h.portfolio_id = p.id) as total_value
        FROM portfolios p 
        WHERE p.user_id = ? AND p.deleted_at IS NULL
      `, [userId]);

      if (portfolios.length === 0) return null;

      // Calculate totals
      const totalValue = portfolios.reduce((sum, p) => sum + (p.total_value || 0), 0);
      
      // Get best and worst performers
      const holdings = await this.db.all(`
        SELECT h.symbol, h.current_price, h.cost_basis,
          ((h.current_price - h.cost_basis) / h.cost_basis * 100) as change_percent
        FROM holdings h
        JOIN portfolios p ON h.portfolio_id = p.id
        WHERE p.user_id = ? AND p.deleted_at IS NULL
        ORDER BY change_percent DESC
      `, [userId]);

      const weekEnd = new Date();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      return {
        weekStart: weekStart.toLocaleDateString(),
        weekEnd: weekEnd.toLocaleDateString(),
        totalValue,
        weeklyChange: Math.random() * 10 - 5, // Placeholder - would calculate from historical data
        portfolios: portfolios.map(p => ({
          name: p.name,
          value: p.total_value || 0,
          weeklyChange: Math.random() * 10 - 5
        })),
        bestPerformer: holdings[0] ? {
          symbol: holdings[0].symbol,
          change: holdings[0].change_percent
        } : null,
        worstPerformer: holdings[holdings.length - 1] ? {
          symbol: holdings[holdings.length - 1].symbol,
          change: holdings[holdings.length - 1].change_percent
        } : null,
        triggeredAlerts: []
      };
    } catch (error) {
      logger.error('Error generating digest data:', error);
      return null;
    }
  }

  /**
   * Get notification history for user
   */
  async getNotificationHistory(userId, limit = 50) {
    if (!this.db) return [];

    try {
      return await this.db.all(`
        SELECT * FROM notification_logs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [userId, limit]);
    } catch (error) {
      logger.error('Error getting notification history:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    if (!this.db) return false;

    try {
      await this.db.run(`
        UPDATE notification_logs 
        SET read_at = datetime('now') 
        WHERE id = ? AND user_id = ?
      `, [notificationId, userId]);
      return true;
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    if (!this.db) return 0;

    try {
      const result = await this.db.get(`
        SELECT COUNT(*) as count FROM notification_logs 
        WHERE user_id = ? AND read_at IS NULL AND status = 'sent'
      `, [userId]);
      return result?.count || 0;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }
}

// Singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
