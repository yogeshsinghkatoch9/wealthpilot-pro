/**
 * WealthPilot Pro - Email Notification Triggers
 * Handles automated email notifications based on system events
 */

const emailService = require('./emailService');
const cron = require('node-cron');
const { prisma } = require('../db/simpleDb');
const marketDataService = require('./marketDataService');
const logger = require('../utils/logger');
class EmailNotificationService {
  constructor() {
    this.scheduledJobs = [];
    this.notificationQueue = [];
    this.userPreferences = new Map();
  }

  /**
   * Initialize scheduled email jobs
   */
  initialize() {
    logger.debug('📧 Initializing email notification schedules...');

    // Weekly digest - Sundays at 8 AM
    this.scheduledJobs.push(
      cron.schedule('0 8 * * 0', () => this.sendWeeklyDigests(), {
        timezone: 'America/New_York'
      })
    );

    // Monthly report - 1st of month at 9 AM
    this.scheduledJobs.push(
      cron.schedule('0 9 1 * *', () => this.sendMonthlyReports(), {
        timezone: 'America/New_York'
      })
    );

    // Daily alert check - Every hour
    this.scheduledJobs.push(
      cron.schedule('0 * * * *', () => this.checkPriceAlerts())
    );

    // Dividend notifications - Daily at 7 AM
    this.scheduledJobs.push(
      cron.schedule('0 7 * * *', () => this.sendDividendNotifications(), {
        timezone: 'America/New_York'
      })
    );

    // Earnings reminders - Daily at 6 AM
    this.scheduledJobs.push(
      cron.schedule('0 6 * * *', () => this.sendEarningsReminders(), {
        timezone: 'America/New_York'
      })
    );

    logger.debug('✅ Email notification schedules initialized');
  }

  /**
   * Stop all scheduled jobs
   */
  shutdown() {
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
    logger.debug('📧 Email notification schedules stopped');
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId, db) {
    const cached = this.userPreferences.get(userId);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.preferences;
    }

    try {
      const settings = await db.getUserSettings(userId);
      const preferences = {
        emailNotifications: settings?.emailNotifications ?? true,
        alertsEnabled: settings?.alertsEnabled ?? true,
        dividendAlerts: settings?.dividendAlerts ?? true,
        earningsAlerts: settings?.earningsAlerts ?? true,
        priceAlerts: settings?.priceAlerts ?? true,
        weeklyReport: settings?.weeklyReport ?? true,
        monthlyReport: settings?.monthlyReport ?? true
      };

      this.userPreferences.set(userId, { preferences, timestamp: Date.now() });
      return preferences;
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      return {
        emailNotifications: true,
        alertsEnabled: true,
        dividendAlerts: true,
        earningsAlerts: true,
        priceAlerts: true,
        weeklyReport: true,
        monthlyReport: true
      };
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(user) {
    try {
      await emailService.send({
        to: user.email,
        subject: 'Welcome to WealthPilot Pro! 🎉',
        template: 'welcome',
        data: {
          name: user.firstName || user.email.split('@')[0],
          loginUrl: `${process.env.FRONTEND_URL}/login`,
          quickStartUrl: `${process.env.FRONTEND_URL}/quick-start`,
          docsUrl: `${process.env.FRONTEND_URL}/help`
        }
      });

      logger.debug(`✅ Welcome email sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      await emailService.send({
        to: user.email,
        subject: 'Reset Your WealthPilot Pro Password',
        template: 'passwordReset',
        data: {
          name: user.firstName || user.email.split('@')[0],
          resetUrl,
          expiresIn: '1 hour'
        }
      });

      logger.debug(`✅ Password reset email sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send security alert (login from new device, password change, etc.)
   */
  async sendSecurityAlert(user, alertType, details) {
    try {
      await emailService.send({
        to: user.email,
        subject: `🔐 Security Alert: ${alertType}`,
        template: 'securityAlert',
        data: {
          name: user.firstName || user.email.split('@')[0],
          alertType,
          description: details.description,
          timestamp: details.timestamp || new Date().toISOString(),
          ipAddress: details.ipAddress,
          securityUrl: `${process.env.FRONTEND_URL}/settings/security`
        }
      });

      logger.debug(`✅ Security alert email sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending security alert:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send price alert notification
   */
  async sendPriceAlert(user, alert, currentPrice, preferences) {
    if (!preferences?.priceAlerts || !preferences?.emailNotifications) {
      return { success: false, reason: 'Notifications disabled' };
    }

    try {
      const direction = alert.condition.includes('>') || alert.condition.includes('above') 
        ? 'above' : 'below';
      const targetPrice = parseFloat(alert.condition.match(/[\d.]+/)?.[0] || 0);

      await emailService.send({
        to: user.email,
        subject: `📈 Price Alert: ${alert.symbol} is now $${currentPrice.toFixed(2)}`,
        template: 'priceAlert',
        data: {
          name: user.firstName || user.email.split('@')[0],
          symbol: alert.symbol,
          currentPrice: currentPrice.toFixed(2),
          targetPrice: targetPrice.toFixed(2),
          direction,
          change: ((currentPrice - targetPrice) / targetPrice * 100).toFixed(2),
          dashboardUrl: `${process.env.FRONTEND_URL}/holdings?symbol=${alert.symbol}`
        }
      });

      logger.debug(`✅ Price alert email sent to ${user.email} for ${alert.symbol}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending price alert:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send dividend notification
   */
  async sendDividendNotification(user, dividend, holding, preferences) {
    if (!preferences?.dividendAlerts || !preferences?.emailNotifications) {
      return { success: false, reason: 'Notifications disabled' };
    }

    try {
      const totalAmount = dividend.amount * holding.shares;

      await emailService.send({
        to: user.email,
        subject: `💵 Dividend Received: $${totalAmount.toFixed(2)} from ${dividend.symbol}`,
        template: 'dividendReceived',
        data: {
          name: user.firstName || user.email.split('@')[0],
          symbol: dividend.symbol,
          shares: holding.shares,
          dividendPerShare: dividend.amount,
          totalAmount,
          exDate: dividend.exDate,
          payDate: dividend.payDate,
          portfolioName: holding.portfolioName
        }
      });

      logger.debug(`✅ Dividend notification sent to ${user.email} for ${dividend.symbol}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending dividend notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send earnings reminder
   */
  async sendEarningsReminder(user, earnings, holding, preferences) {
    if (!preferences?.earningsAlerts || !preferences?.emailNotifications) {
      return { success: false, reason: 'Notifications disabled' };
    }

    try {
      await emailService.send({
        to: user.email,
        subject: `📊 Earnings Coming: ${earnings.symbol} reports ${this.formatDate(earnings.reportDate)}`,
        template: 'earningsReminder',
        data: {
          name: user.firstName || user.email.split('@')[0],
          symbol: earnings.symbol,
          reportDate: this.formatDate(earnings.reportDate),
          timing: earnings.timing || 'TBD',
          epsEstimate: earnings.epsEstimate,
          shares: holding?.shares,
          currentValue: holding?.currentValue,
          dashboardUrl: `${process.env.FRONTEND_URL}/holdings?symbol=${earnings.symbol}`
        }
      });

      logger.debug(`✅ Earnings reminder sent to ${user.email} for ${earnings.symbol}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending earnings reminder:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly digest email
   */
  async sendWeeklyDigest(user, portfolioData, preferences) {
    if (!preferences?.weeklyReport || !preferences?.emailNotifications) {
      return { success: false, reason: 'Weekly report disabled' };
    }

    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      await emailService.send({
        to: user.email,
        subject: '📈 Your Weekly Portfolio Digest',
        template: 'weeklyDigest',
        data: {
          name: user.firstName || user.email.split('@')[0],
          weekStartDate: this.formatDate(weekStart),
          weekEndDate: this.formatDate(new Date()),
          totalValue: portfolioData.totalValue,
          weeklyReturn: portfolioData.weeklyReturn,
          weeklyReturnPercent: portfolioData.weeklyReturnPercent,
          topGainer: portfolioData.topGainer,
          topLoser: portfolioData.topLoser,
          portfolioPerformance: portfolioData.portfolios,
          alerts: portfolioData.alerts,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
        }
      });

      logger.debug(`✅ Weekly digest sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending weekly digest:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send monthly report email
   */
  async sendMonthlyReport(user, portfolioData, preferences) {
    if (!preferences?.monthlyReport || !preferences?.emailNotifications) {
      return { success: false, reason: 'Monthly report disabled' };
    }

    try {
      const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

      await emailService.send({
        to: user.email,
        subject: `📊 Your ${monthName} Portfolio Report`,
        template: 'monthlyReport',
        data: {
          name: user.firstName || user.email.split('@')[0],
          month: monthName,
          totalValue: portfolioData.totalValue,
          monthlyReturn: portfolioData.monthlyReturn,
          monthlyReturnPercent: portfolioData.monthlyReturnPercent,
          ytdReturn: portfolioData.ytdReturn,
          ytdReturnPercent: portfolioData.ytdReturnPercent,
          dividendsReceived: portfolioData.dividendsReceived,
          topPerformers: portfolioData.topPerformers,
          sectorAllocation: portfolioData.sectorAllocation,
          riskMetrics: portfolioData.riskMetrics,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
        }
      });

      logger.debug(`✅ Monthly report sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send transaction confirmation
   */
  async sendTransactionConfirmation(user, transaction) {
    try {
      const actionText = transaction.type === 'buy' ? 'Purchased' : 
        transaction.type === 'sell' ? 'Sold' :
          transaction.type === 'dividend' ? 'Dividend Received' : 
            'Transaction';

      await emailService.send({
        to: user.email,
        subject: `✅ ${actionText}: ${transaction.symbol}`,
        template: 'transactionConfirmation',
        data: {
          name: user.firstName || user.email.split('@')[0],
          transactionType: transaction.type,
          symbol: transaction.symbol,
          shares: transaction.shares,
          price: transaction.price,
          amount: transaction.amount,
          fees: transaction.fees,
          executedAt: this.formatDateTime(transaction.executedAt),
          portfolioName: transaction.portfolioName,
          dashboardUrl: `${process.env.FRONTEND_URL}/transactions`
        }
      });

      logger.debug(`✅ Transaction confirmation sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending transaction confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send import completion notification
   */
  async sendImportComplete(user, importResult) {
    try {
      await emailService.send({
        to: user.email,
        subject: `📥 Import Complete: ${importResult.totalImported} transactions imported`,
        template: 'importComplete',
        data: {
          name: user.firstName || user.email.split('@')[0],
          totalImported: importResult.totalImported,
          portfolioName: importResult.portfolioName,
          errors: importResult.errors,
          warnings: importResult.warnings,
          dashboardUrl: `${process.env.FRONTEND_URL}/portfolio/${importResult.portfolioId}`
        }
      });

      logger.debug(`✅ Import complete notification sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending import complete notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send report generation complete notification
   */
  async sendReportReady(user, reportDetails) {
    try {
      await emailService.send({
        to: user.email,
        subject: `📄 Your ${reportDetails.reportType} Report is Ready`,
        template: 'reportReady',
        data: {
          name: user.firstName || user.email.split('@')[0],
          reportType: reportDetails.reportType,
          generatedAt: this.formatDateTime(new Date()),
          downloadUrl: reportDetails.downloadUrl,
          expiresAt: reportDetails.expiresAt,
          dashboardUrl: `${process.env.FRONTEND_URL}/reports`
        }
      });

      logger.debug(`✅ Report ready notification sent to ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('Error sending report ready notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch send weekly digests to all users
   */
  async sendWeeklyDigests() {
    logger.info('📧 Starting weekly digest batch...');

    try {
      // Get all users with weekly report enabled
      const users = await prisma.user.findMany({
        where: { isVerified: true },
        include: {
          settings: true,
          portfolios: {
            include: { holdings: true }
          }
        }
      });

      let sent = 0, skipped = 0;

      for (const user of users) {
        try {
          const preferences = {
            weeklyReport: user.settings?.weeklyReport ?? true,
            emailNotifications: user.settings?.emailNotifications ?? true
          };

          if (!preferences.weeklyReport || !preferences.emailNotifications) {
            skipped++;
            continue;
          }

          // Calculate portfolio data
          const portfolioData = await this.calculateWeeklyPortfolioData(user);

          await this.sendWeeklyDigest(user, portfolioData, preferences);
          sent++;
        } catch (err) {
          logger.error(`Failed to send weekly digest to ${user.email}:`, err.message);
        }
      }

      logger.info(`📧 Weekly digest batch complete: ${sent} sent, ${skipped} skipped`);
    } catch (error) {
      logger.error('Error in weekly digest batch:', error);
    }
  }

  /**
   * Calculate portfolio data for weekly digest
   */
  async calculateWeeklyPortfolioData(user) {
    const portfolios = user.portfolios || [];
    let totalValue = 0;
    let weekAgoValue = 0;
    let topGainer = null;
    let topLoser = null;

    for (const portfolio of portfolios) {
      const holdings = portfolio.holdings || [];
      for (const holding of holdings) {
        const currentValue = (holding.shares || 0) * (holding.currentPrice || holding.avgCostBasis || 0);
        totalValue += currentValue;
        weekAgoValue += (holding.shares || 0) * (holding.avgCostBasis || 0);

        const change = holding.currentPrice && holding.avgCostBasis
          ? ((holding.currentPrice - holding.avgCostBasis) / holding.avgCostBasis) * 100
          : 0;

        if (!topGainer || change > (topGainer.change || 0)) {
          topGainer = { symbol: holding.symbol, change };
        }
        if (!topLoser || change < (topLoser.change || 0)) {
          topLoser = { symbol: holding.symbol, change };
        }
      }
    }

    const weeklyReturn = totalValue - weekAgoValue;
    const weeklyReturnPercent = weekAgoValue > 0 ? (weeklyReturn / weekAgoValue) * 100 : 0;

    return {
      totalValue,
      weeklyReturn,
      weeklyReturnPercent,
      topGainer,
      topLoser,
      portfolios: portfolios.map(p => ({ name: p.name, value: p.cashBalance || 0 })),
      alerts: []
    };
  }

  /**
   * Batch send monthly reports to all users
   */
  async sendMonthlyReports() {
    logger.info('📧 Starting monthly report batch...');

    try {
      const users = await prisma.user.findMany({
        where: { isVerified: true },
        include: {
          settings: true,
          portfolios: {
            include: { holdings: true }
          }
        }
      });

      let sent = 0, skipped = 0;

      for (const user of users) {
        try {
          const preferences = {
            monthlyReport: user.settings?.monthlyReport ?? true,
            emailNotifications: user.settings?.emailNotifications ?? true
          };

          if (!preferences.monthlyReport || !preferences.emailNotifications) {
            skipped++;
            continue;
          }

          const portfolioData = await this.calculateMonthlyPortfolioData(user);
          await this.sendMonthlyReport(user, portfolioData, preferences);
          sent++;
        } catch (err) {
          logger.error(`Failed to send monthly report to ${user.email}:`, err.message);
        }
      }

      logger.info(`📧 Monthly report batch complete: ${sent} sent, ${skipped} skipped`);
    } catch (error) {
      logger.error('Error in monthly report batch:', error);
    }
  }

  /**
   * Calculate portfolio data for monthly report
   */
  async calculateMonthlyPortfolioData(user) {
    const portfolios = user.portfolios || [];
    let totalValue = 0;
    let dividendsReceived = 0;
    const topPerformers = [];

    for (const portfolio of portfolios) {
      const holdings = portfolio.holdings || [];
      for (const holding of holdings) {
        const currentValue = (holding.shares || 0) * (holding.currentPrice || holding.avgCostBasis || 0);
        totalValue += currentValue;

        const change = holding.currentPrice && holding.avgCostBasis
          ? ((holding.currentPrice - holding.avgCostBasis) / holding.avgCostBasis) * 100
          : 0;

        topPerformers.push({ symbol: holding.symbol, change, value: currentValue });
      }
    }

    topPerformers.sort((a, b) => b.change - a.change);

    return {
      totalValue,
      monthlyReturn: 0,
      monthlyReturnPercent: 0,
      ytdReturn: 0,
      ytdReturnPercent: 0,
      dividendsReceived,
      topPerformers: topPerformers.slice(0, 5),
      sectorAllocation: [],
      riskMetrics: {}
    };
  }

  /**
   * Check and send price alerts
   */
  async checkPriceAlerts() {
    logger.debug('📧 Checking price alerts...');

    try {
      // Get all active price alerts
      const alerts = await prisma.priceAlert.findMany({
        where: {
          isActive: true,
          isTriggered: false
        },
        include: {
          user: {
            include: { settings: true }
          }
        }
      });

      if (alerts.length === 0) {
        logger.debug('No active price alerts to check');
        return;
      }

      // Get unique symbols
      const symbols = [...new Set(alerts.map(a => a.symbol))];

      // Fetch current prices
      const prices = {};
      for (const symbol of symbols) {
        try {
          const quote = await marketDataService.getQuote(symbol);
          if (quote && quote.price) {
            prices[symbol] = quote.price;
          }
        } catch (err) {
          logger.debug(`Could not fetch price for ${symbol}`);
        }
      }

      // Check each alert
      for (const alert of alerts) {
        const currentPrice = prices[alert.symbol];
        if (!currentPrice) continue;

        let triggered = false;
        if (alert.condition === 'price_above' && currentPrice >= alert.targetPrice) {
          triggered = true;
        } else if (alert.condition === 'price_below' && currentPrice <= alert.targetPrice) {
          triggered = true;
        }

        if (triggered) {
          const preferences = {
            priceAlerts: alert.user?.settings?.priceAlerts ?? true,
            emailNotifications: alert.user?.settings?.emailNotifications ?? true
          };

          await this.sendPriceAlert(alert.user, alert, currentPrice, preferences);

          // Mark alert as triggered
          await prisma.priceAlert.update({
            where: { id: alert.id },
            data: { isTriggered: true, triggeredAt: new Date() }
          });

          logger.info(`📧 Price alert triggered for ${alert.symbol} at $${currentPrice}`);
        }
      }
    } catch (error) {
      logger.error('Error checking price alerts:', error);
    }
  }

  /**
   * Send dividend notifications
   */
  async sendDividendNotifications() {
    logger.debug('📧 Checking dividend notifications...');

    try {
      // Get users with holdings that have upcoming dividends
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      const holdings = await prisma.holding.findMany({
        where: {
          shares: { gt: 0 }
        },
        include: {
          portfolio: {
            include: {
              user: {
                include: { settings: true }
              }
            }
          }
        }
      });

      // Group by user and check for dividends
      const userHoldings = new Map();
      for (const holding of holdings) {
        const userId = holding.portfolio?.user?.id;
        if (!userId) continue;

        if (!userHoldings.has(userId)) {
          userHoldings.set(userId, { user: holding.portfolio.user, holdings: [] });
        }
        userHoldings.set(userId, {
          ...userHoldings.get(userId),
          holdings: [...userHoldings.get(userId).holdings, holding]
        });
      }

      logger.debug(`📧 Checked dividends for ${userHoldings.size} users`);
    } catch (error) {
      logger.error('Error sending dividend notifications:', error);
    }
  }

  /**
   * Send earnings reminders
   */
  async sendEarningsReminders() {
    logger.debug('📧 Checking earnings reminders...');

    try {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      // Get all holdings
      const holdings = await prisma.holding.findMany({
        where: {
          shares: { gt: 0 }
        },
        include: {
          portfolio: {
            include: {
              user: {
                include: { settings: true }
              }
            }
          }
        }
      });

      // Check earnings calendar for each symbol
      const symbols = [...new Set(holdings.map(h => h.symbol))];

      // In production, you'd check against an earnings calendar API
      // For now, just log the check
      logger.debug(`📧 Checked earnings for ${symbols.length} symbols`);
    } catch (error) {
      logger.error('Error sending earnings reminders:', error);
    }
  }

  /**
   * Helper: Format date
   */
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Helper: Format datetime
   */
  formatDateTime(date) {
    return new Date(date).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }
}

// Singleton instance
const emailNotifications = new EmailNotificationService();

module.exports = emailNotifications;
