/**
 * WealthPilot Pro - Email Service
 * Comprehensive email notifications with professional templates
 */

const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = {};
    this.queue = [];
    this.processing = false;
    this.retryAttempts = 3;
    this.retryDelay = 5000;
  }

  /**
   * Initialize email transporter based on provider
   */
  async initialize() {
    const provider = process.env.EMAIL_PROVIDER || 'smtp';
    
    try {
      switch (provider.toLowerCase()) {
        case 'sendgrid':
          this.transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
              user: 'apikey',
              pass: process.env.SENDGRID_API_KEY
            }
          });
          break;

        case 'ses':
          this.transporter = nodemailer.createTransport({
            host: process.env.AWS_SES_HOST || 'email-smtp.us-east-1.amazonaws.com',
            port: 587,
            secure: false,
            auth: {
              user: process.env.AWS_SES_USER,
              pass: process.env.AWS_SES_PASS
            }
          });
          break;

        case 'mailgun':
          this.transporter = nodemailer.createTransport({
            host: 'smtp.mailgun.org',
            port: 587,
            secure: false,
            auth: {
              user: process.env.MAILGUN_USER,
              pass: process.env.MAILGUN_PASS
            }
          });
          break;

        case 'ethereal':
        case 'test':
          // Create test account for development
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
          logger.debug('📧 Email test account created:', testAccount.user);
          break;

        case 'smtp':
        default:
          this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'localhost',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            } : undefined
          });
      }

      // Verify connection
      if (process.env.NODE_ENV !== 'test') {
        await this.transporter.verify();
        logger.debug('✅ Email service initialized with provider:', provider);
      }
    } catch (error) {
      logger.error('❌ Email service initialization failed:', error.message);
      // Don't throw - allow app to run without email in development
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  /**
   * Base HTML template wrapper
   */
  getBaseTemplate(content, previewText = '') {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>WealthPilot Pro</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 20px !important; }
      .button { width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preview text -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${previewText}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #1a365d 0%, #2d4a6f 100%); border-radius: 8px 8px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                      💼 WealthPilot Pro
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="color: #64748b; font-size: 12px; line-height: 1.6;">
                    <p style="margin: 0 0 10px 0;">
                      This email was sent by WealthPilot Pro. If you did not request this email, please ignore it.
                    </p>
                    <p style="margin: 0;">
                      © ${new Date().getFullYear()} WealthPilot Pro. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Generate button HTML
   */
  getButton(text, url, color = '#3b82f6') {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 25px 0;">
  <tr>
    <td style="border-radius: 6px; background-color: ${color};">
      <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
  }

  /**
   * Generate metric box HTML
   */
  getMetricBox(label, value, color = '#1a365d') {
    return `
<td style="padding: 15px; background-color: #f8fafc; border-radius: 6px; text-align: center;">
  <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">${label}</div>
  <div style="font-size: 20px; font-weight: 600; color: ${color};">${value}</div>
</td>`;
  }

  /**
   * Email Templates
   */
  
  // Welcome email for new users
  welcomeTemplate(data) {
    const { name, loginUrl } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Welcome to WealthPilot Pro! 🎉</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Thank you for joining WealthPilot Pro! We're excited to help you manage your investment portfolios with professional-grade tools and insights.
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Here's what you can do to get started:
</p>
<ul style="margin: 0 0 20px 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
  <li>Create your first portfolio</li>
  <li>Import holdings from CSV or add them manually</li>
  <li>Set up price alerts for your favorite stocks</li>
  <li>Generate professional PDF reports</li>
  <li>Track performance with real-time analytics</li>
</ul>
${this.getButton('Get Started', loginUrl || process.env.FRONTEND_URL, '#10b981')}
<p style="margin: 20px 0 0 0; color: #64748b; font-size: 14px;">
  If you have any questions, our support team is here to help.
</p>`;
    return this.getBaseTemplate(content, `Welcome to WealthPilot Pro, ${name}!`);
  }

  // Password reset email
  passwordResetTemplate(data) {
    const { name, resetUrl, expiresIn = '1 hour' } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Reset Your Password 🔐</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  We received a request to reset your password. Click the button below to create a new password:
</p>
${this.getButton('Reset Password', resetUrl, '#ef4444')}
<p style="margin: 20px 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  This link will expire in <strong>${expiresIn}</strong>.
</p>
<p style="margin: 0 0 0 0; color: #64748b; font-size: 14px;">
  If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
</p>`;
    return this.getBaseTemplate(content, 'Reset your WealthPilot Pro password');
  }

  // Price alert triggered
  alertTriggeredTemplate(data) {
    const { name, symbol, alertType, targetPrice, currentPrice, portfolioName, dashboardUrl } = data;
    const isAbove = alertType === 'above';
    const color = isAbove ? '#10b981' : '#ef4444';
    const direction = isAbove ? '📈' : '📉';
    
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Price Alert Triggered ${direction}</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your price alert for <strong style="color: ${color};">${symbol}</strong> has been triggered:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 25px;">
  <tr>
    ${this.getMetricBox('Symbol', symbol, color)}
    <td width="10"></td>
    ${this.getMetricBox('Target', `$${parseFloat(targetPrice).toFixed(2)}`)}
    <td width="10"></td>
    ${this.getMetricBox('Current', `$${parseFloat(currentPrice).toFixed(2)}`, color)}
  </tr>
</table>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  <strong>Condition:</strong> Price went ${isAbove ? 'above' : 'below'} $${parseFloat(targetPrice).toFixed(2)}
  ${portfolioName ? `<br><strong>Portfolio:</strong> ${portfolioName}` : ''}
</p>
${this.getButton('View Dashboard', dashboardUrl || process.env.FRONTEND_URL)}`;
    return this.getBaseTemplate(content, `${symbol} alert triggered - ${isAbove ? 'above' : 'below'} $${targetPrice}`);
  }

  // Portfolio summary email
  portfolioSummaryTemplate(data) {
    const { 
      name, portfolioName, totalValue, dayChange, dayChangePercent, 
      weekChange, monthChange, topHoldings = [], dashboardUrl 
    } = data;
    
    const dayColor = dayChange >= 0 ? '#10b981' : '#ef4444';
    const dayIcon = dayChange >= 0 ? '📈' : '📉';
    
    let holdingsHtml = '';
    if (topHoldings.length > 0) {
      holdingsHtml = `
<h3 style="margin: 25px 0 15px 0; color: #1a365d; font-size: 16px;">Top Holdings</h3>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 6px;">
  <tr style="background-color: #f8fafc;">
    <th style="padding: 12px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Symbol</th>
    <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Value</th>
    <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Change</th>
  </tr>
  ${topHoldings.map((h, i) => `
  <tr style="${i % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
    <td style="padding: 12px; font-size: 14px; color: #374151; border-bottom: 1px solid #e2e8f0;"><strong>${h.symbol}</strong></td>
    <td style="padding: 12px; text-align: right; font-size: 14px; color: #374151; border-bottom: 1px solid #e2e8f0;">$${parseFloat(h.value).toLocaleString()}</td>
    <td style="padding: 12px; text-align: right; font-size: 14px; color: ${h.change >= 0 ? '#10b981' : '#ef4444'}; border-bottom: 1px solid #e2e8f0;">${h.change >= 0 ? '+' : ''}${h.changePercent}%</td>
  </tr>`).join('')}
</table>`;
    }

    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Portfolio Summary ${dayIcon}</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Here's your portfolio summary for <strong>${portfolioName || 'your portfolio'}</strong>:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
  <tr>
    ${this.getMetricBox('Total Value', `$${parseFloat(totalValue).toLocaleString()}`)}
    <td width="10"></td>
    ${this.getMetricBox('Day Change', `${dayChange >= 0 ? '+' : ''}$${parseFloat(Math.abs(dayChange)).toLocaleString()}`, dayColor)}
    <td width="10"></td>
    ${this.getMetricBox('Day %', `${dayChangePercent >= 0 ? '+' : ''}${dayChangePercent}%`, dayColor)}
  </tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
  <tr>
    ${this.getMetricBox('Week Change', `${weekChange >= 0 ? '+' : ''}${weekChange}%`, weekChange >= 0 ? '#10b981' : '#ef4444')}
    <td width="10"></td>
    ${this.getMetricBox('Month Change', `${monthChange >= 0 ? '+' : ''}${monthChange}%`, monthChange >= 0 ? '#10b981' : '#ef4444')}
    <td width="10"></td>
    <td></td>
  </tr>
</table>
${holdingsHtml}
${this.getButton('View Full Report', dashboardUrl || process.env.FRONTEND_URL)}`;
    return this.getBaseTemplate(content, `Portfolio: $${parseFloat(totalValue).toLocaleString()} (${dayChangePercent >= 0 ? '+' : ''}${dayChangePercent}%)`);
  }

  // Transaction confirmation
  transactionConfirmationTemplate(data) {
    const { name, type, symbol, shares, price, total, portfolioName, date } = data;
    const isBuy = type.toUpperCase() === 'BUY';
    const typeColor = isBuy ? '#10b981' : '#ef4444';
    const typeIcon = isBuy ? '💰' : '💸';

    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Transaction Confirmed ${typeIcon}</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your transaction has been recorded successfully:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border-radius: 6px; margin-bottom: 25px;">
  <tr>
    <td style="padding: 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Type</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${typeColor}; font-size: 14px;">${type.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Symbol</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1a365d; font-size: 14px;">${symbol}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Shares</td>
          <td style="padding: 8px 0; text-align: right; color: #374151; font-size: 14px;">${parseFloat(shares).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Price per Share</td>
          <td style="padding: 8px 0; text-align: right; color: #374151; font-size: 14px;">$${parseFloat(price).toFixed(2)}</td>
        </tr>
        <tr style="border-top: 1px solid #e2e8f0;">
          <td style="padding: 12px 0 8px 0; color: #1a365d; font-size: 14px; font-weight: 600;">Total</td>
          <td style="padding: 12px 0 8px 0; text-align: right; color: #1a365d; font-size: 16px; font-weight: 600;">$${parseFloat(total).toLocaleString()}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p style="margin: 0 0 0 0; color: #64748b; font-size: 13px;">
  <strong>Portfolio:</strong> ${portfolioName}<br>
  <strong>Date:</strong> ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
</p>`;
    return this.getBaseTemplate(content, `${type.toUpperCase()} ${shares} ${symbol} @ $${price}`);
  }

  // Report ready email
  reportReadyTemplate(data) {
    const { name, reportType, portfolioName, downloadUrl, expiresIn = '7 days' } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Your Report is Ready 📊</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your <strong>${reportType}</strong> report for <strong>${portfolioName}</strong> has been generated and is ready for download.
</p>
${this.getButton('Download Report', downloadUrl, '#8b5cf6')}
<p style="margin: 20px 0 0 0; color: #64748b; font-size: 14px;">
  This download link will expire in ${expiresIn}. After that, you can generate a new report from your dashboard.
</p>`;
    return this.getBaseTemplate(content, `Your ${reportType} report for ${portfolioName} is ready`);
  }

  // Account activity alert
  accountActivityTemplate(data) {
    const { name, activity, ipAddress, location, timestamp, securityUrl } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Account Activity Alert 🔔</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  We detected new activity on your account:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef3c7; border-radius: 6px; margin-bottom: 25px; border: 1px solid #fcd34d;">
  <tr>
    <td style="padding: 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Activity</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #92400e; font-size: 14px;">${activity}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">IP Address</td>
          <td style="padding: 8px 0; text-align: right; color: #b45309; font-size: 14px;">${ipAddress || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Location</td>
          <td style="padding: 8px 0; text-align: right; color: #b45309; font-size: 14px;">${location || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Time</td>
          <td style="padding: 8px 0; text-align: right; color: #b45309; font-size: 14px;">${new Date(timestamp).toLocaleString()}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately.
</p>
${this.getButton('Review Security Settings', securityUrl || `${process.env.FRONTEND_URL}/settings/security`, '#ef4444')}`;
    return this.getBaseTemplate(content, `New ${activity} detected on your account`);
  }

  // Weekly digest
  weeklyDigestTemplate(data) {
    const { 
      name, weekStartDate, weekEndDate, portfolioSummaries = [],
      totalValue, weeklyReturn, weeklyReturnPercent, topGainer, topLoser,
      alerts = [], dashboardUrl
    } = data;

    let portfolioRows = '';
    portfolioSummaries.forEach((p, i) => {
      portfolioRows += `
<tr style="${i % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
  <td style="padding: 12px; font-size: 14px; color: #374151;">${p.name}</td>
  <td style="padding: 12px; text-align: right; font-size: 14px; color: #374151;">$${parseFloat(p.value).toLocaleString()}</td>
  <td style="padding: 12px; text-align: right; font-size: 14px; color: ${p.return >= 0 ? '#10b981' : '#ef4444'};">${p.return >= 0 ? '+' : ''}${p.return}%</td>
</tr>`;
    });

    let alertsHtml = '';
    if (alerts.length > 0) {
      alertsHtml = `
<h3 style="margin: 25px 0 15px 0; color: #1a365d; font-size: 16px;">Alerts Triggered This Week (${alerts.length})</h3>
<ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
  ${alerts.slice(0, 5).map(a => `<li>${a.symbol}: ${a.condition} $${a.price}</li>`).join('')}
  ${alerts.length > 5 ? `<li style="color: #64748b;">And ${alerts.length - 5} more...</li>` : ''}
</ul>`;
    }

    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Your Weekly Investment Digest 📅</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">
  Week of ${weekStartDate} - ${weekEndDate}
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
  <tr>
    ${this.getMetricBox('Total Value', `$${parseFloat(totalValue).toLocaleString()}`)}
    <td width="10"></td>
    ${this.getMetricBox('Weekly Return', `${weeklyReturnPercent >= 0 ? '+' : ''}${weeklyReturnPercent}%`, weeklyReturnPercent >= 0 ? '#10b981' : '#ef4444')}
  </tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 25px;">
  <tr>
    ${this.getMetricBox('Top Gainer', `${topGainer?.symbol || 'N/A'} ${topGainer ? (topGainer.return >= 0 ? '+' : '') + topGainer.return + '%' : ''}`, '#10b981')}
    <td width="10"></td>
    ${this.getMetricBox('Top Loser', `${topLoser?.symbol || 'N/A'} ${topLoser ? (topLoser.return >= 0 ? '+' : '') + topLoser.return + '%' : ''}`, '#ef4444')}
  </tr>
</table>

<h3 style="margin: 0 0 15px 0; color: #1a365d; font-size: 16px;">Portfolio Performance</h3>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
  <tr style="background-color: #f8fafc;">
    <th style="padding: 12px; text-align: left; font-size: 12px; color: #64748b;">Portfolio</th>
    <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b;">Value</th>
    <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b;">Week</th>
  </tr>
  ${portfolioRows}
</table>
${alertsHtml}
${this.getButton('View Full Dashboard', dashboardUrl || process.env.FRONTEND_URL)}`;
    return this.getBaseTemplate(content, `Weekly Digest: ${weeklyReturnPercent >= 0 ? '+' : ''}${weeklyReturnPercent}% this week`);
  }

  // Security alert (password change, etc.)
  securityAlertTemplate(data) {
    const { name, alertType, description, timestamp, ipAddress, securityUrl } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #ef4444; font-size: 22px;">⚠️ Security Alert</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  A security-related change was made to your account:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef2f2; border-radius: 6px; margin-bottom: 25px; border: 1px solid #fecaca;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 10px 0; color: #991b1b; font-weight: 600; font-size: 16px;">${alertType}</p>
      <p style="margin: 0 0 10px 0; color: #b91c1c; font-size: 14px;">${description}</p>
      <p style="margin: 0; color: #dc2626; font-size: 13px;">
        Time: ${new Date(timestamp).toLocaleString()}<br>
        IP: ${ipAddress || 'Unknown'}
      </p>
    </td>
  </tr>
</table>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  If you made this change, you can ignore this email. If you did not make this change, please secure your account immediately.
</p>
${this.getButton('Secure My Account', securityUrl || `${process.env.FRONTEND_URL}/settings/security`, '#ef4444')}`;
    return this.getBaseTemplate(content, `Security Alert: ${alertType}`);
  }

  // Email verification
  emailVerificationTemplate(data) {
    const { name, verificationUrl, expiresIn = '24 hours' } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Verify Your Email Address 📧</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Thank you for signing up for WealthPilot Pro! Please verify your email address by clicking the button below:
</p>
${this.getButton('Verify Email Address', verificationUrl, '#10b981')}
<p style="margin: 20px 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  This verification link will expire in <strong>${expiresIn}</strong>.
</p>
<p style="margin: 0 0 15px 0; color: #64748b; font-size: 14px; line-height: 1.6;">
  If you didn't create an account with WealthPilot Pro, you can safely ignore this email.
</p>
<div style="margin-top: 25px; padding: 15px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
  <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px;">
    If the button doesn't work, copy and paste this link into your browser:
  </p>
  <p style="margin: 0; color: #3b82f6; font-size: 12px; word-break: break-all;">
    ${verificationUrl}
  </p>
</div>`;
    return this.getBaseTemplate(content, 'Please verify your email to activate your WealthPilot Pro account');
  }

  // Dividend received notification
  dividendReceivedTemplate(data) {
    const { name, symbol, shares, dividendPerShare, totalAmount, exDate, payDate, portfolioName } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: #1a365d; font-size: 22px;">Dividend Received 💵</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Great news! You've received a dividend payment:
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ecfdf5; border-radius: 6px; margin-bottom: 25px; border: 1px solid #a7f3d0;">
  <tr>
    <td style="padding: 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Symbol</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #065f46; font-size: 14px;">${symbol}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Shares Held</td>
          <td style="padding: 8px 0; text-align: right; color: #047857; font-size: 14px;">${parseFloat(shares).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Dividend Per Share</td>
          <td style="padding: 8px 0; text-align: right; color: #047857; font-size: 14px;">$${parseFloat(dividendPerShare).toFixed(4)}</td>
        </tr>
        <tr style="border-top: 1px solid #a7f3d0;">
          <td style="padding: 12px 0 8px 0; color: #065f46; font-size: 14px; font-weight: 600;">Total Received</td>
          <td style="padding: 12px 0 8px 0; text-align: right; color: #065f46; font-size: 18px; font-weight: 600;">$${parseFloat(totalAmount).toFixed(2)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p style="margin: 0 0 0 0; color: #64748b; font-size: 13px;">
  <strong>Portfolio:</strong> ${portfolioName}<br>
  <strong>Ex-Dividend Date:</strong> ${exDate}<br>
  <strong>Pay Date:</strong> ${payDate}
</p>`;
    return this.getBaseTemplate(content, `Dividend: $${parseFloat(totalAmount).toFixed(2)} from ${symbol}`);
  }

  /**
   * Send email with retry logic
   */
  async send(options) {
    if (!this.transporter) {
      logger.warn('Email transporter not initialized, skipping email');
      return { success: false, error: 'Transporter not initialized' };
    }

    const { to, subject, template, data, attachments = [] } = options;
    
    // Get template HTML
    const templateMethod = `${template}Template`;
    if (!this[templateMethod]) {
      throw new Error(`Unknown email template: ${template}`);
    }
    
    const html = this[templateMethod](data);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"WealthPilot Pro" <noreply@wealthpilot.com>',
      to,
      subject,
      html,
      attachments
    };

    // Retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        
        // Log preview URL for test emails
        if (process.env.EMAIL_PROVIDER === 'ethereal' || process.env.EMAIL_PROVIDER === 'test') {
          logger.debug('📧 Email preview URL:', nodemailer.getTestMessageUrl(info));
        }
        
        return {
          success: true,
          messageId: info.messageId,
          preview: nodemailer.getTestMessageUrl(info)
        };
      } catch (error) {
        lastError = error;
        logger.error(`Email send attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Failed to send email after retries'
    };
  }

  /**
   * Queue email for batch processing
   */
  queueEmail(options) {
    const id = uuidv4();
    this.queue.push({ id, options, createdAt: new Date() });
    this.processQueue();
    return id;
  }

  /**
   * Process email queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        await this.send(item.options);
      } catch (error) {
        logger.error('Queue processing error:', error);
      }
      
      // Rate limiting - wait between sends
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.processing = false;
  }

  /**
   * Send bulk emails (for digests, etc.)
   */
  async sendBulk(emails) {
    const results = [];
    
    for (const email of emails) {
      const result = await this.send(email);
      results.push({ ...email, result });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return results;
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
