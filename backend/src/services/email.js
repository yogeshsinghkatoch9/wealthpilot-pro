/**
 * Email Service for WealthPilot Pro
 * Handles all email notifications using nodemailer
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

const logger = require('../utils/logger');
class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = {};
    this.defaultFrom = process.env.EMAIL_FROM || 'WealthPilot Pro <noreply@wealthpilot.com>';
    this.initialized = false;
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    if (this.initialized) return;

    const config = this.getTransportConfig();
    this.transporter = nodemailer.createTransport(config);

    // Verify connection
    try {
      await this.transporter.verify();
      logger.debug('📧 Email service connected successfully');
      this.initialized = true;
    } catch (error) {
      logger.error('📧 Email service connection failed:', error.message);
      // Create a test account for development
      if (process.env.NODE_ENV !== 'production') {
        await this.setupTestAccount();
      }
    }

    // Load email templates
    await this.loadTemplates();
  }

  /**
   * Get transport configuration based on environment
   */
  getTransportConfig() {
    const provider = process.env.EMAIL_PROVIDER || 'smtp';

    switch (provider) {
      case 'sendgrid':
        return {
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        };

      case 'ses':
        return {
          host: process.env.AWS_SES_HOST || 'email-smtp.us-east-1.amazonaws.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.AWS_SES_USER,
            pass: process.env.AWS_SES_PASS
          }
        };

      case 'mailgun':
        return {
          host: 'smtp.mailgun.org',
          port: 587,
          secure: false,
          auth: {
            user: process.env.MAILGUN_USER,
            pass: process.env.MAILGUN_PASS
          }
        };

      case 'smtp':
      default:
        return {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          } : undefined
        };
    }
  }

  /**
   * Setup test account for development using Ethereal
   */
  async setupTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      logger.debug('📧 Using Ethereal test email account');
      logger.debug('   Preview URL: https://ethereal.email/login');
      logger.debug(`   User: ${testAccount.user}`);
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to create test email account:', error);
    }
  }

  /**
   * Load email templates
   */
  async loadTemplates() {
    this.templates = {
      welcome: this.getWelcomeTemplate(),
      passwordReset: this.getPasswordResetTemplate(),
      alertTriggered: this.getAlertTriggeredTemplate(),
      portfolioSummary: this.getPortfolioSummaryTemplate(),
      transactionConfirmation: this.getTransactionConfirmationTemplate(),
      reportReady: this.getReportReadyTemplate(),
      accountActivity: this.getAccountActivityTemplate(),
      weeklyDigest: this.getWeeklyDigestTemplate(),
      securityAlert: this.getSecurityAlertTemplate(),
      dividendReceived: this.getDividendReceivedTemplate()
    };
  }

  /**
   * Send email
   */
  async send({ to, subject, template, data, attachments = [] }) {
    if (!this.initialized) {
      await this.initialize();
    }

    const templateFn = this.templates[template];
    if (!templateFn) {
      throw new Error(`Email template '${template}' not found`);
    }

    const { html, text } = templateFn(data);

    const mailOptions = {
      from: this.defaultFrom,
      to,
      subject,
      html,
      text,
      attachments
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // Log preview URL for test emails
      if (process.env.NODE_ENV !== 'production') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          logger.debug(`📧 Preview URL: ${previewUrl}`);
        }
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info)
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulk(emails) {
    const results = [];
    for (const email of emails) {
      const result = await this.send(email);
      results.push({ ...email, ...result });
      // Rate limiting - wait 100ms between emails
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
  }

  // ============ Email Templates ============

  getBaseTemplate(content, title) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .header .logo { font-size: 32px; margin-bottom: 10px; }
    .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button:hover { opacity: 0.9; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
    .stat-box { background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 10px 0; }
    .stat-label { color: #666; font-size: 12px; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 700; color: #333; }
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    .divider { border-top: 1px solid #eee; margin: 20px 0; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">📊</div>
      <h1>WealthPilot Pro</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} WealthPilot Pro. All rights reserved.</p>
      <p>You're receiving this email because you have an account with WealthPilot Pro.</p>
      <p><a href="{unsubscribe_url}">Manage email preferences</a> | <a href="{privacy_url}">Privacy Policy</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  getWelcomeTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>Welcome to WealthPilot Pro, ${data.name}! 🎉</h2>
        <p>We're excited to have you on board. Your account has been created successfully and you're ready to start managing your portfolios like a pro.</p>
        
        <div class="success-box">
          <strong>Account Created:</strong> ${data.email}
        </div>
        
        <h3>Get Started in 3 Easy Steps:</h3>
        <ol>
          <li><strong>Add Your First Portfolio</strong> - Create a portfolio to organize your investments</li>
          <li><strong>Import Your Holdings</strong> - Use CSV import or add manually</li>
          <li><strong>Set Up Alerts</strong> - Get notified about price movements</li>
        </ol>
        
        <p style="text-align: center;">
          <a href="${data.loginUrl}" class="button">Go to Dashboard</a>
        </p>
        
        <div class="divider"></div>
        
        <h3>Need Help?</h3>
        <p>Check out our <a href="${data.docsUrl}">documentation</a> or contact our support team at <a href="mailto:support@wealthpilot.com">support@wealthpilot.com</a></p>
      `, 'Welcome to WealthPilot Pro');

      const text = `
Welcome to WealthPilot Pro, ${data.name}!

Your account has been created successfully.

Get Started:
1. Add Your First Portfolio
2. Import Your Holdings
3. Set Up Alerts

Login at: ${data.loginUrl}

Need help? Contact support@wealthpilot.com
      `;

      return { html, text };
    };
  }

  getPasswordResetTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>Password Reset Request</h2>
        <p>Hi ${data.name},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        
        <p style="text-align: center;">
          <a href="${data.resetUrl}" class="button">Reset Password</a>
        </p>
        
        <div class="alert-box">
          <strong>⚠️ This link expires in ${data.expiresIn || '1 hour'}</strong>
        </div>
        
        <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        
        <div class="divider"></div>
        
        <p style="font-size: 12px; color: #888;">
          For security, this request was received from IP address ${data.ipAddress || 'unknown'} 
          on ${new Date().toLocaleString()}.
        </p>
      `, 'Password Reset - WealthPilot Pro');

      const text = `
Password Reset Request

Hi ${data.name},

Click here to reset your password: ${data.resetUrl}

This link expires in ${data.expiresIn || '1 hour'}.

If you didn't request this, ignore this email.
      `;

      return { html, text };
    };
  }

  getAlertTriggeredTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>🔔 Price Alert Triggered</h2>
        <p>Your alert for <strong>${data.symbol}</strong> has been triggered!</p>
        
        <div class="stat-box">
          <div class="stat-label">Symbol</div>
          <div class="stat-value">${data.symbol}</div>
        </div>
        
        <table>
          <tr>
            <td><strong>Alert Type:</strong></td>
            <td>${data.alertType}</td>
          </tr>
          <tr>
            <td><strong>Target Price:</strong></td>
            <td>$${data.targetPrice?.toFixed(2)}</td>
          </tr>
          <tr>
            <td><strong>Current Price:</strong></td>
            <td class="${data.currentPrice >= data.targetPrice ? 'positive' : 'negative'}">
              $${data.currentPrice?.toFixed(2)}
            </td>
          </tr>
          <tr>
            <td><strong>Change:</strong></td>
            <td class="${data.changePercent >= 0 ? 'positive' : 'negative'}">
              ${data.changePercent >= 0 ? '+' : ''}${data.changePercent?.toFixed(2)}%
            </td>
          </tr>
        </table>
        
        <p style="text-align: center;">
          <a href="${data.dashboardUrl}" class="button">View Details</a>
        </p>
      `, 'Alert Triggered - WealthPilot Pro');

      const text = `
Price Alert Triggered!

Symbol: ${data.symbol}
Alert Type: ${data.alertType}
Target: $${data.targetPrice?.toFixed(2)}
Current: $${data.currentPrice?.toFixed(2)}
Change: ${data.changePercent?.toFixed(2)}%

View details: ${data.dashboardUrl}
      `;

      return { html, text };
    };
  }

  getPortfolioSummaryTemplate() {
    return (data) => {
      const holdingsRows = data.holdings?.map(h => `
        <tr>
          <td><strong>${h.symbol}</strong></td>
          <td>${h.shares}</td>
          <td>$${h.currentValue?.toLocaleString()}</td>
          <td class="${h.gainLoss >= 0 ? 'positive' : 'negative'}">
            ${h.gainLoss >= 0 ? '+' : ''}$${h.gainLoss?.toLocaleString()}
          </td>
        </tr>
      `).join('') || '';

      const html = this.getBaseTemplate(`
        <h2>📊 Portfolio Summary: ${data.portfolioName}</h2>
        <p>Here's your portfolio performance as of ${new Date().toLocaleDateString()}:</p>
        
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          <div class="stat-box" style="flex: 1; min-width: 150px;">
            <div class="stat-label">Total Value</div>
            <div class="stat-value">$${data.totalValue?.toLocaleString()}</div>
          </div>
          <div class="stat-box" style="flex: 1; min-width: 150px;">
            <div class="stat-label">Total Gain/Loss</div>
            <div class="stat-value ${data.totalGainLoss >= 0 ? 'positive' : 'negative'}">
              ${data.totalGainLoss >= 0 ? '+' : ''}$${data.totalGainLoss?.toLocaleString()}
            </div>
          </div>
          <div class="stat-box" style="flex: 1; min-width: 150px;">
            <div class="stat-label">Return</div>
            <div class="stat-value ${data.returnPercent >= 0 ? 'positive' : 'negative'}">
              ${data.returnPercent >= 0 ? '+' : ''}${data.returnPercent?.toFixed(2)}%
            </div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <h3>Holdings</h3>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Shares</th>
              <th>Value</th>
              <th>Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            ${holdingsRows}
          </tbody>
        </table>
        
        <p style="text-align: center;">
          <a href="${data.portfolioUrl}" class="button">View Full Report</a>
        </p>
      `, 'Portfolio Summary - WealthPilot Pro');

      const text = `
Portfolio Summary: ${data.portfolioName}

Total Value: $${data.totalValue?.toLocaleString()}
Total Gain/Loss: ${data.totalGainLoss >= 0 ? '+' : ''}$${data.totalGainLoss?.toLocaleString()}
Return: ${data.returnPercent?.toFixed(2)}%

View full report: ${data.portfolioUrl}
      `;

      return { html, text };
    };
  }

  getTransactionConfirmationTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>✅ Transaction Confirmed</h2>
        <p>Your transaction has been recorded successfully.</p>
        
        <div class="success-box">
          <strong>${data.type?.toUpperCase()}</strong> - ${data.symbol}
        </div>
        
        <table>
          <tr>
            <td><strong>Symbol:</strong></td>
            <td>${data.symbol}</td>
          </tr>
          <tr>
            <td><strong>Type:</strong></td>
            <td>${data.type}</td>
          </tr>
          <tr>
            <td><strong>Shares:</strong></td>
            <td>${data.shares}</td>
          </tr>
          <tr>
            <td><strong>Price:</strong></td>
            <td>$${data.price?.toFixed(2)}</td>
          </tr>
          <tr>
            <td><strong>Total:</strong></td>
            <td><strong>$${data.total?.toLocaleString()}</strong></td>
          </tr>
          <tr>
            <td><strong>Date:</strong></td>
            <td>${new Date(data.date).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td><strong>Portfolio:</strong></td>
            <td>${data.portfolioName}</td>
          </tr>
        </table>
        
        <p style="text-align: center;">
          <a href="${data.transactionUrl}" class="button">View Transaction</a>
        </p>
      `, 'Transaction Confirmed - WealthPilot Pro');

      const text = `
Transaction Confirmed

${data.type?.toUpperCase()} - ${data.symbol}
Shares: ${data.shares}
Price: $${data.price?.toFixed(2)}
Total: $${data.total?.toLocaleString()}
Date: ${new Date(data.date).toLocaleDateString()}
Portfolio: ${data.portfolioName}

View transaction: ${data.transactionUrl}
      `;

      return { html, text };
    };
  }

  getReportReadyTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>📄 Your Report is Ready</h2>
        <p>The report you requested has been generated and is ready for download.</p>
        
        <div class="stat-box">
          <div class="stat-label">Report Type</div>
          <div class="stat-value">${data.reportType}</div>
        </div>
        
        <table>
          <tr>
            <td><strong>Generated:</strong></td>
            <td>${new Date().toLocaleString()}</td>
          </tr>
          <tr>
            <td><strong>Period:</strong></td>
            <td>${data.period || 'All time'}</td>
          </tr>
          <tr>
            <td><strong>Format:</strong></td>
            <td>${data.format || 'PDF'}</td>
          </tr>
        </table>
        
        <p style="text-align: center;">
          <a href="${data.downloadUrl}" class="button">Download Report</a>
        </p>
        
        <p style="font-size: 12px; color: #888; text-align: center;">
          This download link expires in 24 hours.
        </p>
      `, 'Report Ready - WealthPilot Pro');

      const text = `
Your Report is Ready

Report Type: ${data.reportType}
Generated: ${new Date().toLocaleString()}
Period: ${data.period || 'All time'}

Download: ${data.downloadUrl}

Link expires in 24 hours.
      `;

      return { html, text };
    };
  }

  getAccountActivityTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>🔐 Account Activity Alert</h2>
        <p>We detected new activity on your account:</p>
        
        <div class="alert-box">
          <strong>${data.activityType}</strong>
          <p style="margin: 5px 0 0 0;">${data.description}</p>
        </div>
        
        <table>
          <tr>
            <td><strong>Time:</strong></td>
            <td>${new Date(data.timestamp).toLocaleString()}</td>
          </tr>
          <tr>
            <td><strong>IP Address:</strong></td>
            <td>${data.ipAddress || 'Unknown'}</td>
          </tr>
          <tr>
            <td><strong>Location:</strong></td>
            <td>${data.location || 'Unknown'}</td>
          </tr>
          <tr>
            <td><strong>Device:</strong></td>
            <td>${data.device || 'Unknown'}</td>
          </tr>
        </table>
        
        <p>If this wasn't you, please secure your account immediately:</p>
        
        <p style="text-align: center;">
          <a href="${data.securityUrl}" class="button">Review Security Settings</a>
        </p>
      `, 'Account Activity - WealthPilot Pro');

      const text = `
Account Activity Alert

${data.activityType}
${data.description}

Time: ${new Date(data.timestamp).toLocaleString()}
IP: ${data.ipAddress || 'Unknown'}
Location: ${data.location || 'Unknown'}

If this wasn't you, secure your account: ${data.securityUrl}
      `;

      return { html, text };
    };
  }

  getWeeklyDigestTemplate() {
    return (data) => {
      const portfolioRows = data.portfolios?.map(p => `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td>$${p.value?.toLocaleString()}</td>
          <td class="${p.weeklyChange >= 0 ? 'positive' : 'negative'}">
            ${p.weeklyChange >= 0 ? '+' : ''}${p.weeklyChange?.toFixed(2)}%
          </td>
        </tr>
      `).join('') || '';

      const alertsHtml = data.triggeredAlerts?.length > 0 ? `
        <h3>🔔 Alerts Triggered This Week</h3>
        <ul>
          ${data.triggeredAlerts.map(a => `<li>${a.symbol}: ${a.message}</li>`).join('')}
        </ul>
      ` : '';

      const html = this.getBaseTemplate(`
        <h2>📈 Your Weekly Investment Digest</h2>
        <p>Here's how your investments performed this week (${data.weekStart} - ${data.weekEnd}):</p>
        
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          <div class="stat-box" style="flex: 1; min-width: 150px;">
            <div class="stat-label">Total Portfolio Value</div>
            <div class="stat-value">$${data.totalValue?.toLocaleString()}</div>
          </div>
          <div class="stat-box" style="flex: 1; min-width: 150px;">
            <div class="stat-label">Weekly Change</div>
            <div class="stat-value ${data.weeklyChange >= 0 ? 'positive' : 'negative'}">
              ${data.weeklyChange >= 0 ? '+' : ''}${data.weeklyChange?.toFixed(2)}%
            </div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <h3>Portfolio Performance</h3>
        <table>
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Value</th>
              <th>Weekly Change</th>
            </tr>
          </thead>
          <tbody>
            ${portfolioRows}
          </tbody>
        </table>
        
        ${alertsHtml}
        
        <div class="divider"></div>
        
        <h3>Top Movers</h3>
        <p><span class="positive">📈 Best: ${data.bestPerformer?.symbol} (+${data.bestPerformer?.change?.toFixed(2)}%)</span></p>
        <p><span class="negative">📉 Worst: ${data.worstPerformer?.symbol} (${data.worstPerformer?.change?.toFixed(2)}%)</span></p>
        
        <p style="text-align: center;">
          <a href="${data.dashboardUrl}" class="button">View Full Dashboard</a>
        </p>
      `, 'Weekly Digest - WealthPilot Pro');

      const text = `
Your Weekly Investment Digest
${data.weekStart} - ${data.weekEnd}

Total Value: $${data.totalValue?.toLocaleString()}
Weekly Change: ${data.weeklyChange >= 0 ? '+' : ''}${data.weeklyChange?.toFixed(2)}%

Best: ${data.bestPerformer?.symbol} (+${data.bestPerformer?.change?.toFixed(2)}%)
Worst: ${data.worstPerformer?.symbol} (${data.worstPerformer?.change?.toFixed(2)}%)

View dashboard: ${data.dashboardUrl}
      `;

      return { html, text };
    };
  }

  getSecurityAlertTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>🚨 Security Alert</h2>
        <p>We detected a potentially suspicious activity on your account:</p>
        
        <div class="alert-box" style="background: #fee2e2; border-color: #ef4444;">
          <strong>${data.alertType}</strong>
          <p style="margin: 5px 0 0 0;">${data.description}</p>
        </div>
        
        <table>
          <tr>
            <td><strong>Time:</strong></td>
            <td>${new Date(data.timestamp).toLocaleString()}</td>
          </tr>
          <tr>
            <td><strong>IP Address:</strong></td>
            <td>${data.ipAddress}</td>
          </tr>
          <tr>
            <td><strong>Location:</strong></td>
            <td>${data.location || 'Unknown'}</td>
          </tr>
        </table>
        
        <h3>Recommended Actions:</h3>
        <ol>
          <li>Change your password immediately</li>
          <li>Enable two-factor authentication</li>
          <li>Review recent account activity</li>
          <li>Contact support if you notice unauthorized changes</li>
        </ol>
        
        <p style="text-align: center;">
          <a href="${data.securityUrl}" class="button" style="background: #ef4444;">Secure My Account</a>
        </p>
      `, 'Security Alert - WealthPilot Pro');

      const text = `
SECURITY ALERT

${data.alertType}
${data.description}

Time: ${new Date(data.timestamp).toLocaleString()}
IP: ${data.ipAddress}

Secure your account immediately: ${data.securityUrl}
      `;

      return { html, text };
    };
  }

  getDividendReceivedTemplate() {
    return (data) => {
      const html = this.getBaseTemplate(`
        <h2>💰 Dividend Received</h2>
        <p>Great news! You've received a dividend payment.</p>
        
        <div class="success-box">
          <strong>$${data.amount?.toFixed(2)}</strong> from <strong>${data.symbol}</strong>
        </div>
        
        <table>
          <tr>
            <td><strong>Symbol:</strong></td>
            <td>${data.symbol}</td>
          </tr>
          <tr>
            <td><strong>Company:</strong></td>
            <td>${data.companyName || data.symbol}</td>
          </tr>
          <tr>
            <td><strong>Amount:</strong></td>
            <td class="positive">$${data.amount?.toFixed(2)}</td>
          </tr>
          <tr>
            <td><strong>Shares Held:</strong></td>
            <td>${data.shares}</td>
          </tr>
          <tr>
            <td><strong>Per Share:</strong></td>
            <td>$${data.perShare?.toFixed(4)}</td>
          </tr>
          <tr>
            <td><strong>Ex-Date:</strong></td>
            <td>${data.exDate}</td>
          </tr>
          <tr>
            <td><strong>Pay Date:</strong></td>
            <td>${data.payDate}</td>
          </tr>
          <tr>
            <td><strong>Portfolio:</strong></td>
            <td>${data.portfolioName}</td>
          </tr>
        </table>
        
        <div class="stat-box">
          <div class="stat-label">Year-to-Date Dividends</div>
          <div class="stat-value positive">$${data.ytdDividends?.toLocaleString()}</div>
        </div>
        
        <p style="text-align: center;">
          <a href="${data.dividendsUrl}" class="button">View All Dividends</a>
        </p>
      `, 'Dividend Received - WealthPilot Pro');

      const text = `
Dividend Received!

$${data.amount?.toFixed(2)} from ${data.symbol}

Shares: ${data.shares}
Per Share: $${data.perShare?.toFixed(4)}
Pay Date: ${data.payDate}
Portfolio: ${data.portfolioName}

YTD Dividends: $${data.ytdDividends?.toLocaleString()}

View details: ${data.dividendsUrl}
      `;

      return { html, text };
    };
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
