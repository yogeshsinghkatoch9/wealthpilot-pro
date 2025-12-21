const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');
const { broadcastToUser } = require('./websocket');


class AlertService {
  constructor() {
    this.checkInterval = null;
    this.isRunning = false;
  }

  /**
   * Start the alert monitoring service
   */
  start() {
    if (this.isRunning) {
      logger.warn('Alert service is already running');
      return;
    }

    logger.info('Starting alert monitoring service...');
    this.isRunning = true;

    // Check alerts every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAllAlerts().catch(err => {
        logger.error('Error checking alerts:', err);
      });
    }, 30000);

    // Run initial check
    this.checkAllAlerts();

    logger.info('Alert monitoring service started');
  }

  /**
   * Stop the alert monitoring service
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('Alert monitoring service stopped');
  }

  /**
   * Check all active alerts
   */
  async checkAllAlerts() {
    try {
      const alerts = await prisma.alert.findMany({
        where: {
          isActive: true,
          isTriggered: false
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (alerts.length === 0) {
        return;
      }

      logger.info(`Checking ${alerts.length} active alerts...`);

      for (const alert of alerts) {
        await this.checkAlert(alert);
      }
    } catch (error) {
      logger.error('Error in checkAllAlerts:', error);
    }
  }

  /**
   * Check a single alert
   */
  async checkAlert(alert) {
    try {
      let shouldTrigger = false;
      let currentValue = null;
      let message = alert.message || '';

      switch (alert.type) {
        case 'price_above':
        case 'price_below':
        case 'price_change':
          ({ shouldTrigger, currentValue, message } = await this.checkPriceAlert(alert));
          break;

        case 'portfolio_value':
        case 'portfolio_gain':
        case 'portfolio_loss':
          ({ shouldTrigger, currentValue, message } = await this.checkPortfolioAlert(alert));
          break;

        case 'dividend':
          ({ shouldTrigger, currentValue, message } = await this.checkDividendAlert(alert));
          break;

        case 'earnings':
          ({ shouldTrigger, currentValue, message } = await this.checkEarningsAlert(alert));
          break;

        default:
          logger.warn(`Unknown alert type: ${alert.type}`);
      }

      if (shouldTrigger) {
        await this.triggerAlert(alert, currentValue, message);
      }
    } catch (error) {
      logger.error(`Error checking alert ${alert.id}:`, error);
    }
  }

  /**
   * Check price-based alerts
   */
  async checkPriceAlert(alert) {
    if (!alert.symbol) {
      return { shouldTrigger: false };
    }

    // Get current price from stock quotes
    const quote = await prisma.stockQuote.findUnique({
      where: { symbol: alert.symbol }
    });

    if (!quote) {
      return { shouldTrigger: false };
    }

    const currentPrice = quote.price;
    const condition = JSON.parse(alert.condition);
    let shouldTrigger = false;
    let message = '';

    switch (alert.type) {
      case 'price_above':
        shouldTrigger = currentPrice >= condition.targetPrice;
        if (shouldTrigger) {
          message = `${alert.symbol} reached $${currentPrice.toFixed(2)} (target: $${condition.targetPrice})`;
        }
        break;

      case 'price_below':
        shouldTrigger = currentPrice <= condition.targetPrice;
        if (shouldTrigger) {
          message = `${alert.symbol} dropped to $${currentPrice.toFixed(2)} (target: $${condition.targetPrice})`;
        }
        break;

      case 'price_change':
        const changePercent = quote.changePercent || 0;
        if (condition.direction === 'up') {
          shouldTrigger = changePercent >= condition.threshold;
          if (shouldTrigger) {
            message = `${alert.symbol} up ${changePercent.toFixed(2)}% today (threshold: ${condition.threshold}%)`;
          }
        } else if (condition.direction === 'down') {
          shouldTrigger = changePercent <= -condition.threshold;
          if (shouldTrigger) {
            message = `${alert.symbol} down ${Math.abs(changePercent).toFixed(2)}% today (threshold: ${condition.threshold}%)`;
          }
        }
        break;
    }

    return { shouldTrigger, currentValue: currentPrice, message };
  }

  /**
   * Check portfolio-based alerts
   */
  async checkPortfolioAlert(alert) {
    const condition = JSON.parse(alert.condition);
    const portfolioId = condition.portfolioId;

    if (!portfolioId) {
      return { shouldTrigger: false };
    }

    // Get latest portfolio snapshot
    const snapshot = await prisma.portfolioSnapshot.findFirst({
      where: { portfolioId },
      orderBy: { snapshotDate: 'desc' }
    });

    if (!snapshot) {
      return { shouldTrigger: false };
    }

    let shouldTrigger = false;
    let message = '';
    let currentValue = null;

    switch (alert.type) {
      case 'portfolio_value':
        currentValue = snapshot.totalValue;
        if (condition.direction === 'above') {
          shouldTrigger = currentValue >= condition.threshold;
          if (shouldTrigger) {
            message = `Portfolio value reached $${currentValue.toFixed(2)} (target: $${condition.threshold})`;
          }
        } else if (condition.direction === 'below') {
          shouldTrigger = currentValue <= condition.threshold;
          if (shouldTrigger) {
            message = `Portfolio value dropped to $${currentValue.toFixed(2)} (target: $${condition.threshold})`;
          }
        }
        break;

      case 'portfolio_gain':
        currentValue = snapshot.totalGainPct;
        shouldTrigger = currentValue >= condition.threshold;
        if (shouldTrigger) {
          message = `Portfolio gain reached ${currentValue.toFixed(2)}% (target: ${condition.threshold}%)`;
        }
        break;

      case 'portfolio_loss':
        currentValue = snapshot.totalGainPct;
        shouldTrigger = currentValue <= -condition.threshold;
        if (shouldTrigger) {
          message = `Portfolio loss reached ${Math.abs(currentValue).toFixed(2)}% (threshold: ${condition.threshold}%)`;
        }
        break;
    }

    return { shouldTrigger, currentValue, message };
  }

  /**
   * Check dividend alerts
   */
  async checkDividendAlert(alert) {
    if (!alert.symbol) {
      return { shouldTrigger: false };
    }

    // Check for upcoming dividend in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingDividend = await prisma.dividendHistory.findFirst({
      where: {
        symbol: alert.symbol,
        exDate: {
          gte: new Date(),
          lte: sevenDaysFromNow
        }
      },
      orderBy: { exDate: 'asc' }
    });

    if (upcomingDividend) {
      const message = `${alert.symbol} dividend: $${upcomingDividend.amount} ex-date ${upcomingDividend.exDate.toISOString().split('T')[0]}`;
      return { shouldTrigger: true, currentValue: upcomingDividend.amount, message };
    }

    return { shouldTrigger: false };
  }

  /**
   * Check earnings alerts
   */
  async checkEarningsAlert(alert) {
    if (!alert.symbol) {
      return { shouldTrigger: false };
    }

    // Check for earnings in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingEarnings = await prisma.earningsCalendar.findFirst({
      where: {
        symbol: alert.symbol,
        reportDate: {
          gte: new Date(),
          lte: sevenDaysFromNow
        }
      },
      orderBy: { reportDate: 'asc' }
    });

    if (upcomingEarnings) {
      const message = `${alert.symbol} earnings ${upcomingEarnings.timing || ''} on ${upcomingEarnings.reportDate.toISOString().split('T')[0]}`;
      return { shouldTrigger: true, currentValue: null, message };
    }

    return { shouldTrigger: false };
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alert, currentValue, message) {
    try {
      logger.info(`Triggering alert ${alert.id}: ${message}`);

      // Update alert in database
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          isTriggered: true,
          triggeredAt: new Date(),
          message: message || alert.message
        }
      });

      // Send real-time notification via WebSocket
      const notification = {
        type: 'alert_triggered',
        alertId: alert.id,
        alertType: alert.type,
        symbol: alert.symbol,
        message,
        currentValue,
        triggeredAt: new Date().toISOString()
      };

      broadcastToUser(alert.userId, 'alert', notification);

      // Send email notification if user has email notifications enabled
      await this.sendAlertEmail(alert, currentValue, message);

      logger.info(`Alert ${alert.id} triggered successfully`);
    } catch (error) {
      logger.error(`Error triggering alert ${alert.id}:`, error);
    }
  }

  /**
   * Send email notification for triggered alert
   */
  async sendAlertEmail(alert, currentValue, message) {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: alert.userId },
        select: { email: true, firstName: true, emailNotifications: true }
      });

      // Check if user has email notifications enabled
      if (!user || !user.email || user.emailNotifications === false) {
        logger.debug(`Skipping email notification for alert ${alert.id} - user notifications disabled`);
        return;
      }

      // Format the alert type for display
      const alertTypeDisplay = {
        'price_above': 'Price Above Target',
        'price_below': 'Price Below Target',
        'price_change': 'Price Change Alert',
        'portfolio_value': 'Portfolio Value Alert',
        'portfolio_gain': 'Portfolio Gain Alert',
        'portfolio_loss': 'Portfolio Loss Alert',
        'dividend': 'Dividend Alert',
        'earnings': 'Earnings Alert'
      }[alert.type] || alert.type;

      // Build email content
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">🔔 Alert Triggered</h1>
          </div>
          <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef;">
            <p>Hi ${user.firstName || 'Investor'},</p>
            <p>Your price alert has been triggered:</p>

            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea;">
              <p style="margin: 5px 0;"><strong>Alert Type:</strong> ${alertTypeDisplay}</p>
              ${alert.symbol ? `<p style="margin: 5px 0;"><strong>Symbol:</strong> ${alert.symbol}</p>` : ''}
              ${currentValue ? `<p style="margin: 5px 0;"><strong>Current Value:</strong> $${parseFloat(currentValue).toFixed(2)}</p>` : ''}
              <p style="margin: 5px 0;"><strong>Message:</strong> ${message}</p>
            </div>

            <p><a href="https://wealthpilot-pro.vercel.app/alerts" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Alerts</a></p>

            <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
              You received this email because you have alert notifications enabled.
              <a href="https://wealthpilot-pro.vercel.app/settings">Manage notification settings</a>
            </p>
          </div>
        </div>
      `;

      // Use job queue to send email asynchronously
      const jobQueue = require('./jobQueue');
      await jobQueue.addJob('send-email', {
        to: user.email,
        subject: `🔔 Alert Triggered: ${alert.symbol ? alert.symbol + ' - ' : ''}${alertTypeDisplay}`,
        html: emailHtml,
        text: `Alert Triggered\n\nType: ${alertTypeDisplay}\n${alert.symbol ? 'Symbol: ' + alert.symbol + '\n' : ''}${currentValue ? 'Current Value: $' + parseFloat(currentValue).toFixed(2) + '\n' : ''}Message: ${message}\n\nView your alerts at https://wealthpilot-pro.vercel.app/alerts`
      });

      logger.info(`Email notification queued for alert ${alert.id} to ${user.email}`);
    } catch (error) {
      // Don't throw - email failure shouldn't break alert triggering
      logger.error(`Failed to send email for alert ${alert.id}:`, error.message);
    }
  }

  /**
   * Create a new alert
   */
  async createAlert(userId, alertData) {
    try {
      const alert = await prisma.alert.create({
        data: {
          userId,
          symbol: alertData.symbol || null,
          type: alertData.type,
          condition: JSON.stringify(alertData.condition),
          message: alertData.message || null,
          isActive: true,
          isTriggered: false
        }
      });

      logger.info(`Created alert ${alert.id} for user ${userId}`);
      return alert;
    } catch (error) {
      logger.error('Error creating alert:', error);
      throw error;
    }
  }

  /**
   * Get all alerts for a user
   */
  async getUserAlerts(userId, options = {}) {
    try {
      const where = { userId };

      if (options.isActive !== undefined) {
        where.isActive = options.isActive;
      }

      if (options.isTriggered !== undefined) {
        where.isTriggered = options.isTriggered;
      }

      if (options.symbol) {
        where.symbol = options.symbol;
      }

      const alerts = await prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      return alerts;
    } catch (error) {
      logger.error('Error getting user alerts:', error);
      throw error;
    }
  }

  /**
   * Update an alert
   */
  async updateAlert(alertId, userId, updateData) {
    try {
      // Verify ownership
      const existing = await prisma.alert.findFirst({
        where: { id: alertId, userId }
      });

      if (!existing) {
        throw new Error('Alert not found');
      }

      const alert = await prisma.alert.update({
        where: { id: alertId },
        data: {
          symbol: updateData.symbol !== undefined ? updateData.symbol : existing.symbol,
          type: updateData.type || existing.type,
          condition: updateData.condition ? JSON.stringify(updateData.condition) : existing.condition,
          message: updateData.message !== undefined ? updateData.message : existing.message,
          isActive: updateData.isActive !== undefined ? updateData.isActive : existing.isActive
        }
      });

      logger.info(`Updated alert ${alertId}`);
      return alert;
    } catch (error) {
      logger.error('Error updating alert:', error);
      throw error;
    }
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId, userId) {
    try {
      // Verify ownership
      const existing = await prisma.alert.findFirst({
        where: { id: alertId, userId }
      });

      if (!existing) {
        throw new Error('Alert not found');
      }

      await prisma.alert.delete({
        where: { id: alertId }
      });

      logger.info(`Deleted alert ${alertId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting alert:', error);
      throw error;
    }
  }

  /**
   * Reset a triggered alert
   */
  async resetAlert(alertId, userId) {
    try {
      const alert = await prisma.alert.update({
        where: { id: alertId },
        data: {
          isTriggered: false,
          triggeredAt: null
        }
      });

      logger.info(`Reset alert ${alertId}`);
      return alert;
    } catch (error) {
      logger.error('Error resetting alert:', error);
      throw error;
    }
  }
}

// Export singleton instance
const alertService = new AlertService();
module.exports = alertService;
