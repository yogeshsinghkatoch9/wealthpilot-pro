/**
 * WealthPilot Pro - Notification Service
 * Manages user notification preferences and delivery
 */

const { v4: uuidv4 } = require('uuid');
const emailService = require('./emailService');

const logger = require('../utils/logger');
class NotificationService {
  constructor() {
    this.db = null;
    this.defaultPreferences = {
      email: {
        enabled: true,
        alerts: true,
        transactions: true,
        reports: true,
        weeklyDigest: true,
        security: true,
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
  }

  /**
   * Initialize with database connection
   */
  initialize(db) {
    this.db = db;
    logger.debug('✅ Notification service initialized');
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userId) {
    if (!this.db) {
      return this.defaultPreferences;
    }

    try {
      const user = await this.db.users.findById(userId);
      if (!user || !user.preferences?.notifications) {
        return this.defaultPreferences;
      }
      return { ...this.defaultPreferences, ...user.preferences.notifications };
    } catch (error) {
      logger.error('Error getting notification preferences:', error);
      return this.defaultPreferences;
    }
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId, preferences) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const user = await this.db.users.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const currentPrefs = user.preferences || {};
      const updatedPrefs = {
        ...currentPrefs,
        notifications: {
          ...this.defaultPreferences,
          ...currentPrefs.notifications,
          ...preferences
        }
      };

      await this.db.users.update(userId, { preferences: updatedPrefs });
      return updatedPrefs.notifications;
    } catch (error) {
      logger.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Check if notification should be sent based on preferences and quiet hours
   */
  shouldSendNotification(preferences, type) {
    // Check if type is enabled
    if (!preferences.email?.enabled) return false;
    if (preferences.email[type] === false) return false;

    // Check quiet hours
    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: preferences.quietHours.timezone || 'America/New_York'
      });

      const start = preferences.quietHours.start;
      const end = preferences.quietHours.end;

      // Handle overnight quiet hours (e.g., 22:00 - 08:00)
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          return false;
        }
      } else {
        if (currentTime >= start && currentTime <= end) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Log notification to database
   */
  async logNotification(data) {
    if (!this.db) return null;

    const log = {
      id: uuidv4(),
      userId: data.userId,
      type: data.type,
      template: data.template,
      subject: data.subject,
      recipient: data.recipient,
      status: data.status,
      error: data.error,
      metadata: data.metadata,
      createdAt: new Date().toISOString()
    };

    try {
      // Store in notification_logs table if it exists
      if (this.db.notificationLogs) {
        await this.db.notificationLogs.create(log);
      }
      return log;
    } catch (error) {
      logger.error('Error logging notification:', error);
      return null;
    }
  }

  /**
   * Get notification history for user
   */
  async getHistory(userId, options = {}) {
    if (!this.db) return [];

    const { limit = 50, offset = 0, type } = options;

    try {
      if (this.db.notificationLogs) {
        const logs = await this.db.notificationLogs.findByUser(userId, { limit, offset, type });
        return logs;
      }
      return [];
    } catch (error) {
      logger.error('Error getting notification history:', error);
      return [];
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    if (!this.db) return 0;

    try {
      if (this.db.notificationLogs) {
        return await this.db.notificationLogs.countUnread(userId);
      }
      return 0;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId, notificationId) {
    if (!this.db) return false;

    try {
      if (this.db.notificationLogs) {
        await this.db.notificationLogs.markRead(notificationId, userId);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcome(user) {
    const preferences = await this.getPreferences(user.id);
    
    const result = await emailService.send({
      to: user.email,
      subject: 'Welcome to WealthPilot Pro! 🎉',
      template: 'welcome',
      data: {
        name: user.name || user.email.split('@')[0],
        loginUrl: `${process.env.FRONTEND_URL}/login`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'welcome',
      template: 'welcome',
      subject: 'Welcome to WealthPilot Pro!',
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error
    });

    return result;
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const result = await emailService.send({
      to: user.email,
      subject: 'Reset Your Password - WealthPilot Pro',
      template: 'passwordReset',
      data: {
        name: user.name || user.email.split('@')[0],
        resetUrl,
        expiresIn: '1 hour'
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'security',
      template: 'passwordReset',
      subject: 'Reset Your Password',
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error
    });

    return result;
  }

  /**
   * Send price alert notification
   */
  async sendAlertTriggered(user, alert, currentPrice) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'alerts')) {
      return { success: false, reason: 'alerts_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: `🔔 Price Alert: ${alert.symbol} ${alert.type === 'above' ? '📈' : '📉'} $${currentPrice}`,
      template: 'alertTriggered',
      data: {
        name: user.name || user.email.split('@')[0],
        symbol: alert.symbol,
        alertType: alert.type,
        targetPrice: alert.targetPrice,
        currentPrice,
        portfolioName: alert.portfolioName,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'alert',
      template: 'alertTriggered',
      subject: `Price Alert: ${alert.symbol}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { alertId: alert.id, symbol: alert.symbol, price: currentPrice }
    });

    return result;
  }

  /**
   * Send portfolio summary email
   */
  async sendPortfolioSummary(user, portfolio, metrics) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'reports')) {
      return { success: false, reason: 'reports_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: `📊 Portfolio Summary: ${portfolio.name}`,
      template: 'portfolioSummary',
      data: {
        name: user.name || user.email.split('@')[0],
        portfolioName: portfolio.name,
        totalValue: metrics.totalValue,
        dayChange: metrics.dayChange,
        dayChangePercent: metrics.dayChangePercent,
        weekChange: metrics.weekChangePercent,
        monthChange: metrics.monthChangePercent,
        topHoldings: metrics.topHoldings || [],
        dashboardUrl: `${process.env.FRONTEND_URL}/portfolios/${portfolio.id}`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'report',
      template: 'portfolioSummary',
      subject: `Portfolio Summary: ${portfolio.name}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { portfolioId: portfolio.id }
    });

    return result;
  }

  /**
   * Send transaction confirmation
   */
  async sendTransactionConfirmation(user, transaction) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'transactions')) {
      return { success: false, reason: 'transactions_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: `✅ ${transaction.type.toUpperCase()} Confirmed: ${transaction.shares} ${transaction.symbol}`,
      template: 'transactionConfirmation',
      data: {
        name: user.name || user.email.split('@')[0],
        type: transaction.type,
        symbol: transaction.symbol,
        shares: transaction.shares,
        price: transaction.price,
        total: transaction.shares * transaction.price,
        portfolioName: transaction.portfolioName,
        date: transaction.date || new Date()
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'transaction',
      template: 'transactionConfirmation',
      subject: `Transaction Confirmed: ${transaction.symbol}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { transactionId: transaction.id, symbol: transaction.symbol }
    });

    return result;
  }

  /**
   * Send report ready notification
   */
  async sendReportReady(user, report) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'reports')) {
      return { success: false, reason: 'reports_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: `📄 Your ${report.type} Report is Ready`,
      template: 'reportReady',
      data: {
        name: user.name || user.email.split('@')[0],
        reportType: report.type,
        portfolioName: report.portfolioName,
        downloadUrl: report.downloadUrl,
        expiresIn: '7 days'
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'report',
      template: 'reportReady',
      subject: `Report Ready: ${report.type}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { reportId: report.id, reportType: report.type }
    });

    return result;
  }

  /**
   * Send account activity alert
   */
  async sendAccountActivity(user, activity) {
    const preferences = await this.getPreferences(user.id);
    
    // Security notifications always sent
    const result = await emailService.send({
      to: user.email,
      subject: `🔔 Account Activity: ${activity.type}`,
      template: 'accountActivity',
      data: {
        name: user.name || user.email.split('@')[0],
        activity: activity.type,
        ipAddress: activity.ipAddress,
        location: activity.location,
        timestamp: activity.timestamp || new Date(),
        securityUrl: `${process.env.FRONTEND_URL}/settings/security`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'security',
      template: 'accountActivity',
      subject: `Account Activity: ${activity.type}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { activityType: activity.type }
    });

    return result;
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(user, alert) {
    // Security alerts always sent
    const result = await emailService.send({
      to: user.email,
      subject: `⚠️ Security Alert: ${alert.type}`,
      template: 'securityAlert',
      data: {
        name: user.name || user.email.split('@')[0],
        alertType: alert.type,
        description: alert.description,
        timestamp: alert.timestamp || new Date(),
        ipAddress: alert.ipAddress,
        securityUrl: `${process.env.FRONTEND_URL}/settings/security`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'security',
      template: 'securityAlert',
      subject: `Security Alert: ${alert.type}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { alertType: alert.type }
    });

    return result;
  }

  /**
   * Send weekly digest to user
   */
  async sendWeeklyDigest(user, data) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'weeklyDigest')) {
      return { success: false, reason: 'weeklyDigest_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: '📅 Your Weekly Investment Digest',
      template: 'weeklyDigest',
      data: {
        name: user.name || user.email.split('@')[0],
        ...data,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'digest',
      template: 'weeklyDigest',
      subject: 'Weekly Investment Digest',
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error
    });

    return result;
  }

  /**
   * Send dividend received notification
   */
  async sendDividendReceived(user, dividend) {
    const preferences = await this.getPreferences(user.id);
    
    if (!this.shouldSendNotification(preferences, 'transactions')) {
      return { success: false, reason: 'transactions_disabled' };
    }

    const result = await emailService.send({
      to: user.email,
      subject: `💵 Dividend Received: $${dividend.totalAmount.toFixed(2)} from ${dividend.symbol}`,
      template: 'dividendReceived',
      data: {
        name: user.name || user.email.split('@')[0],
        symbol: dividend.symbol,
        shares: dividend.shares,
        dividendPerShare: dividend.dividendPerShare,
        totalAmount: dividend.totalAmount,
        exDate: dividend.exDate,
        payDate: dividend.payDate,
        portfolioName: dividend.portfolioName
      }
    });

    await this.logNotification({
      userId: user.id,
      type: 'dividend',
      template: 'dividendReceived',
      subject: `Dividend Received: ${dividend.symbol}`,
      recipient: user.email,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: { symbol: dividend.symbol, amount: dividend.totalAmount }
    });

    return result;
  }

  /**
   * Send bulk weekly digests to all users
   */
  async sendBulkWeeklyDigests(usersWithData) {
    const results = [];

    for (const { user, data } of usersWithData) {
      try {
        const result = await this.sendWeeklyDigest(user, data);
        results.push({ userId: user.id, success: result.success });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        results.push({ userId: user.id, success: false, error: error.message });
      }
    }

    return {
      total: results.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Test email delivery (development only)
   */
  async sendTestEmail(email, template = 'welcome') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test emails not allowed in production');
    }

    const testData = {
      welcome: {
        name: 'Test User',
        loginUrl: `${process.env.FRONTEND_URL}/login`
      },
      passwordReset: {
        name: 'Test User',
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=test123`,
        expiresIn: '1 hour'
      },
      alertTriggered: {
        name: 'Test User',
        symbol: 'AAPL',
        alertType: 'above',
        targetPrice: 175.00,
        currentPrice: 178.50,
        portfolioName: 'Growth Portfolio'
      },
      portfolioSummary: {
        name: 'Test User',
        portfolioName: 'Growth Portfolio',
        totalValue: 125000,
        dayChange: 1250,
        dayChangePercent: 1.01,
        weekChange: 2.35,
        monthChange: 5.67,
        topHoldings: [
          { symbol: 'AAPL', value: 45000, change: 1.5, changePercent: 1.5 },
          { symbol: 'MSFT', value: 35000, change: -0.8, changePercent: -0.8 },
          { symbol: 'GOOGL', value: 25000, change: 2.1, changePercent: 2.1 }
        ]
      },
      transactionConfirmation: {
        name: 'Test User',
        type: 'BUY',
        symbol: 'NVDA',
        shares: 10,
        price: 450.00,
        total: 4500.00,
        portfolioName: 'Tech Portfolio',
        date: new Date()
      },
      reportReady: {
        name: 'Test User',
        reportType: 'Quarterly Performance',
        portfolioName: 'Main Portfolio',
        downloadUrl: `${process.env.FRONTEND_URL}/reports/test123`,
        expiresIn: '7 days'
      },
      accountActivity: {
        name: 'Test User',
        activity: 'New Login',
        ipAddress: '192.168.1.1',
        location: 'New York, NY',
        timestamp: new Date()
      },
      securityAlert: {
        name: 'Test User',
        alertType: 'Password Changed',
        description: 'Your password was successfully changed.',
        timestamp: new Date(),
        ipAddress: '192.168.1.1'
      },
      weeklyDigest: {
        name: 'Test User',
        weekStartDate: 'Dec 1, 2024',
        weekEndDate: 'Dec 7, 2024',
        portfolioSummaries: [
          { name: 'Growth Portfolio', value: 125000, return: 2.5 },
          { name: 'Income Portfolio', value: 75000, return: 1.2 }
        ],
        totalValue: 200000,
        weeklyReturn: 4200,
        weeklyReturnPercent: 2.15,
        topGainer: { symbol: 'NVDA', return: 8.5 },
        topLoser: { symbol: 'INTC', return: -3.2 },
        alerts: [
          { symbol: 'AAPL', condition: 'above', price: 175 }
        ]
      },
      dividendReceived: {
        name: 'Test User',
        symbol: 'JNJ',
        shares: 100,
        dividendPerShare: 1.19,
        totalAmount: 119.00,
        exDate: 'Nov 20, 2024',
        payDate: 'Dec 10, 2024',
        portfolioName: 'Dividend Portfolio'
      }
    };

    const data = testData[template] || testData.welcome;

    return await emailService.send({
      to: email,
      subject: `[TEST] ${template} Email`,
      template,
      data
    });
  }
}

// Singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
