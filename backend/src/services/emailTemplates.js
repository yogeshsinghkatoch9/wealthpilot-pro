/**
 * WealthPilot Pro - Email Templates
 * Professional HTML email templates for all notifications
 */

class EmailTemplates {
  constructor() {
    this.brandColor = '#1a365d';
    this.accentColor = '#3b82f6';
    this.successColor = '#10b981';
    this.warningColor = '#f59e0b';
    this.dangerColor = '#ef4444';
  }

  /**
   * Base HTML wrapper for all emails
   */
  baseTemplate(content, previewText = '') {
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
      .metric-box { display: block !important; width: 100% !important; margin-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preview text -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${previewText}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, ${this.brandColor} 0%, #2d4a6f 100%); border-radius: 8px 8px 0 0;">
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
                    <p style="margin: 0 0 10px 0;">
                      <a href="{{{unsubscribeUrl}}}" style="color: #64748b; text-decoration: underline;">Manage email preferences</a> |
                      <a href="{{{helpUrl}}}" style="color: #64748b; text-decoration: underline;">Help Center</a>
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
   * Button component
   */
  button(text, url, color = this.accentColor) {
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
   * Metric box component
   */
  metricBox(label, value, color = this.brandColor) {
    return `
<td class="metric-box" style="padding: 15px; background-color: #f8fafc; border-radius: 6px; text-align: center; width: 48%;">
  <div style="font-size: 12px; color: #64748b; margin-bottom: 5px; text-transform: uppercase;">${label}</div>
  <div style="font-size: 22px; font-weight: 700; color: ${color};">${value}</div>
</td>`;
  }

  /**
   * Alert box component
   */
  alertBox(type, title, message) {
    const colors = {
      success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
      warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
      error: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
      info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' }
    };
    const c = colors[type] || colors.info;

    return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${c.bg}; border-radius: 6px; margin: 20px 0; border: 1px solid ${c.border};">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 8px 0; color: ${c.text}; font-weight: 600; font-size: 16px;">${title}</p>
      <p style="margin: 0; color: ${c.text}; font-size: 14px;">${message}</p>
    </td>
  </tr>
</table>`;
  }

  /**
   * Data table component
   */
  dataTable(headers, rows) {
    const headerHtml = headers.map(h => 
      `<th style="padding: 12px; text-align: ${h.align || 'left'}; font-size: 12px; color: #64748b; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">${h.label}</th>`
    ).join('');

    const rowsHtml = rows.map(row => 
      `<tr>${row.map((cell, i) => 
        `<td style="padding: 12px; text-align: ${headers[i]?.align || 'left'}; font-size: 14px; color: #374151; border-bottom: 1px solid #e2e8f0;">${cell}</td>`
      ).join('')}</tr>`
    ).join('');

    return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0;">
  <tr>${headerHtml}</tr>
  ${rowsHtml}
</table>`;
  }

  // =============================================
  // EMAIL TEMPLATES
  // =============================================

  /**
   * Welcome email for new users
   */
  welcome(data) {
    const { name, loginUrl, quickStartUrl } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 24px;">Welcome to WealthPilot Pro! 🎉</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Thank you for joining WealthPilot Pro! We're excited to help you take control of your investment portfolio.
</p>

<h3 style="margin: 25px 0 15px 0; color: ${this.brandColor}; font-size: 16px;">Get Started in 3 Steps:</h3>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td style="padding: 15px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 10px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding-right: 15px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background-color: ${this.accentColor}; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">1</span>
          </td>
          <td>
            <strong style="color: #374151;">Create your first portfolio</strong>
            <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">Organize your investments by account type</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="height: 10px;"></td></tr>
  <tr>
    <td style="padding: 15px; background-color: #f8fafc; border-radius: 6px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding-right: 15px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background-color: ${this.accentColor}; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">2</span>
          </td>
          <td>
            <strong style="color: #374151;">Add your holdings</strong>
            <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">Import from CSV or add manually</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="height: 10px;"></td></tr>
  <tr>
    <td style="padding: 15px; background-color: #f8fafc; border-radius: 6px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding-right: 15px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background-color: ${this.accentColor}; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">3</span>
          </td>
          <td>
            <strong style="color: #374151;">Set up alerts</strong>
            <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">Get notified on price changes and dividends</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

${this.button('Start Quick Setup', quickStartUrl || loginUrl)}

<p style="margin: 25px 0 0 0; color: #64748b; font-size: 14px;">
  Questions? Reply to this email or visit our <a href="#" style="color: ${this.accentColor};">Help Center</a>.
</p>`;

    return this.baseTemplate(content, 'Welcome to WealthPilot Pro - Get started with your portfolio');
  }

  /**
   * Password reset email
   */
  passwordReset(data) {
    const { name, resetUrl, expiresIn } = data;
    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">Reset Your Password</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  We received a request to reset your password. Click the button below to create a new password:
</p>

${this.button('Reset Password', resetUrl)}

${this.alertBox('warning', 'Link expires soon', `This password reset link will expire in ${expiresIn || '1 hour'}.`)}

<p style="margin: 20px 0 0 0; color: #64748b; font-size: 14px;">
  If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
</p>`;

    return this.baseTemplate(content, 'Reset your WealthPilot Pro password');
  }

  /**
   * Price alert triggered email
   */
  priceAlert(data) {
    const { name, symbol, currentPrice, targetPrice, direction, changePercent, dashboardUrl } = data;
    const isUp = direction === 'above';
    const color = isUp ? this.successColor : this.dangerColor;
    const arrow = isUp ? '↑' : '↓';

    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">
  📈 Price Alert: ${symbol}
</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your price alert for <strong>${symbol}</strong> has been triggered:
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 25px;">
  <tr>
    ${this.metricBox('Current Price', `$${currentPrice}`)}
    <td width="10"></td>
    ${this.metricBox('Target Price', `$${targetPrice}`, '#64748b')}
  </tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${isUp ? '#ecfdf5' : '#fef2f2'}; border-radius: 6px; margin-bottom: 25px;">
  <tr>
    <td style="padding: 20px; text-align: center;">
      <span style="font-size: 32px; font-weight: 700; color: ${color};">
        ${arrow} ${Math.abs(changePercent)}%
      </span>
      <p style="margin: 5px 0 0 0; color: ${isUp ? '#065f46' : '#991b1b'}; font-size: 14px;">
        ${isUp ? 'Above' : 'Below'} your target price
      </p>
    </td>
  </tr>
</table>

${this.button('View Details', dashboardUrl)}`;

    return this.baseTemplate(content, `${symbol} is now $${currentPrice} - Price alert triggered`);
  }

  /**
   * Weekly digest email
   */
  weeklyDigest(data) {
    const { 
      name, weekStartDate, weekEndDate, totalValue, weeklyReturn, 
      weeklyReturnPercent, topGainer, topLoser, portfolios, alerts, dashboardUrl 
    } = data;
    
    const returnColor = weeklyReturnPercent >= 0 ? this.successColor : this.dangerColor;
    const returnSign = weeklyReturnPercent >= 0 ? '+' : '';

    const portfolioRows = portfolios?.map(p => [
      p.name,
      `$${parseFloat(p.value).toLocaleString()}`,
      `<span style="color: ${p.weekReturn >= 0 ? this.successColor : this.dangerColor}">${p.weekReturn >= 0 ? '+' : ''}${p.weekReturn}%</span>`
    ]) || [];

    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">Your Weekly Portfolio Digest 📊</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">
  Week of ${weekStartDate} - ${weekEndDate}
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
  <tr>
    ${this.metricBox('Total Value', `$${parseFloat(totalValue).toLocaleString()}`)}
    <td width="10"></td>
    ${this.metricBox('Weekly Return', `${returnSign}${weeklyReturnPercent}%`, returnColor)}
  </tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 25px;">
  <tr>
    ${this.metricBox('Top Gainer', `${topGainer?.symbol || 'N/A'} ${topGainer ? `${topGainer.return >= 0 ? '+' : ''}${topGainer.return}%` : ''}`, this.successColor)}
    <td width="10"></td>
    ${this.metricBox('Top Loser', `${topLoser?.symbol || 'N/A'} ${topLoser ? `${topLoser.return >= 0 ? '+' : ''}${topLoser.return}%` : ''}`, this.dangerColor)}
  </tr>
</table>

<h3 style="margin: 0 0 15px 0; color: ${this.brandColor}; font-size: 16px;">Portfolio Performance</h3>
${this.dataTable(
    [
      { label: 'Portfolio', align: 'left' },
      { label: 'Value', align: 'right' },
      { label: 'Week', align: 'right' }
    ],
    portfolioRows
  )}

${alerts?.length > 0 ? `
<h3 style="margin: 25px 0 15px 0; color: ${this.brandColor}; font-size: 16px;">Alerts This Week</h3>
${alerts.map(a => this.alertBox('info', a.title, a.message)).join('')}
` : ''}

${this.button('View Full Dashboard', dashboardUrl)}`;

    return this.baseTemplate(content, `Weekly Digest: ${returnSign}${weeklyReturnPercent}% this week`);
  }

  /**
   * Dividend notification email
   */
  dividendReceived(data) {
    const { name, symbol, shares, dividendPerShare, totalAmount, exDate, payDate, portfolioName } = data;
    
    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">Dividend Received 💵</h2>
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
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #065f46; font-size: 16px;">${symbol}</td>
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
          <td style="padding: 12px 0 8px 0; text-align: right; color: #065f46; font-size: 20px; font-weight: 700;">$${parseFloat(totalAmount).toFixed(2)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin: 0; color: #64748b; font-size: 13px;">
  <strong>Portfolio:</strong> ${portfolioName}<br>
  <strong>Ex-Dividend Date:</strong> ${exDate}<br>
  <strong>Pay Date:</strong> ${payDate}
</p>`;

    return this.baseTemplate(content, `Dividend: $${parseFloat(totalAmount).toFixed(2)} from ${symbol}`);
  }

  /**
   * Security alert email
   */
  securityAlert(data) {
    const { name, alertType, description, timestamp, ipAddress, securityUrl } = data;
    
    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.dangerColor}; font-size: 22px;">⚠️ Security Alert</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  A security-related change was made to your account:
</p>

${this.alertBox('error', alertType, description)}

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
  <tr>
    <td style="padding: 8px 0; color: #64748b; font-size: 13px;">
      <strong>Time:</strong> ${new Date(timestamp).toLocaleString()}<br>
      <strong>IP Address:</strong> ${ipAddress || 'Unknown'}
    </td>
  </tr>
</table>

<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  If you made this change, you can ignore this email. If you did not make this change, please secure your account immediately.
</p>

${this.button('Secure My Account', securityUrl, this.dangerColor)}`;

    return this.baseTemplate(content, `Security Alert: ${alertType}`);
  }

  /**
   * Transaction confirmation email
   */
  transactionConfirmation(data) {
    const { name, transactionType, symbol, shares, price, amount, fees, executedAt, portfolioName, dashboardUrl } = data;
    
    const typeLabels = {
      buy: { label: 'Purchase', color: this.successColor, icon: '📈' },
      sell: { label: 'Sale', color: this.dangerColor, icon: '📉' },
      dividend: { label: 'Dividend', color: this.accentColor, icon: '💵' }
    };
    const type = typeLabels[transactionType] || typeLabels.buy;

    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">${type.icon} Transaction Confirmed</h2>
<p style="margin: 0 0 15px 0; color: #374141; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your transaction has been recorded:
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border-radius: 6px; margin-bottom: 25px;">
  <tr>
    <td style="padding: 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Type</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${type.color}; font-size: 14px;">${type.label}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Symbol</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #374151; font-size: 14px;">${symbol}</td>
        </tr>
        ${shares ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Shares</td>
          <td style="padding: 8px 0; text-align: right; color: #374151; font-size: 14px;">${shares}</td>
        </tr>
        ` : ''}
        ${price ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Price</td>
          <td style="padding: 8px 0; text-align: right; color: #374151; font-size: 14px;">$${parseFloat(price).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${fees > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Fees</td>
          <td style="padding: 8px 0; text-align: right; color: #374151; font-size: 14px;">$${parseFloat(fees).toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr style="border-top: 1px solid #e2e8f0;">
          <td style="padding: 12px 0 8px 0; color: #374151; font-size: 14px; font-weight: 600;">Total Amount</td>
          <td style="padding: 12px 0 8px 0; text-align: right; color: #374151; font-size: 18px; font-weight: 700;">$${parseFloat(amount).toFixed(2)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin: 0; color: #64748b; font-size: 13px;">
  <strong>Portfolio:</strong> ${portfolioName}<br>
  <strong>Executed:</strong> ${executedAt}
</p>

${this.button('View Transaction', dashboardUrl)}`;

    return this.baseTemplate(content, `${type.label} confirmed: ${symbol}`);
  }

  /**
   * Report ready notification
   */
  reportReady(data) {
    const { name, reportType, generatedAt, downloadUrl, expiresAt, dashboardUrl } = data;
    
    const content = `
<h2 style="margin: 0 0 20px 0; color: ${this.brandColor}; font-size: 22px;">📄 Your Report is Ready</h2>
<p style="margin: 0 0 15px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Hi ${name || 'there'},
</p>
<p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
  Your <strong>${reportType}</strong> report has been generated and is ready for download.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border-radius: 6px; margin-bottom: 25px;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 5px 0; color: #64748b; font-size: 13px;">Report Type</p>
      <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; font-weight: 600;">${reportType}</p>
      <p style="margin: 0 0 5px 0; color: #64748b; font-size: 13px;">Generated</p>
      <p style="margin: 0; color: #374151; font-size: 14px;">${generatedAt}</p>
    </td>
  </tr>
</table>

${this.button('Download Report', downloadUrl)}

${expiresAt ? this.alertBox('warning', 'Download link expires', `This download link will expire on ${expiresAt}.`) : ''}`;

    return this.baseTemplate(content, `Your ${reportType} report is ready`);
  }
}

module.exports = new EmailTemplates();
