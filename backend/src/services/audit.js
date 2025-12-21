/**
 * WealthPilot Pro - Audit Service
 * Compliance logging for all sensitive operations
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AuditService {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs/audit');
    this.ensureLogDir();
    this.buffer = [];
    this.bufferSize = 100;
    this.flushInterval = 30000; // 30 seconds
    
    // Start periodic flush
    setInterval(() => this.flush(), this.flushInterval);
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log an audit event
   */
  log(event) {
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event
    };

    this.buffer.push(entry);

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }

    return entry.id;
  }

  /**
   * Flush buffer to disk
   */
  flush() {
    if (this.buffer.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const filename = `audit-${today}.jsonl`;
    const filepath = path.join(this.logDir, filename);

    const lines = this.buffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    fs.appendFileSync(filepath, lines);
    this.buffer = [];
  }

  /**
   * Authentication events
   */
  logLogin(userId, email, success, ip, userAgent) {
    return this.log({
      category: 'auth',
      action: 'login',
      userId,
      email,
      success,
      ip,
      userAgent
    });
  }

  logLogout(userId, email) {
    return this.log({
      category: 'auth',
      action: 'logout',
      userId,
      email
    });
  }

  logFailedLogin(email, ip, reason) {
    return this.log({
      category: 'auth',
      action: 'login_failed',
      email,
      ip,
      reason
    });
  }

  logPasswordChange(userId, email) {
    return this.log({
      category: 'auth',
      action: 'password_change',
      userId,
      email
    });
  }

  /**
   * Portfolio events
   */
  logPortfolioCreate(userId, portfolioId, name) {
    return this.log({
      category: 'portfolio',
      action: 'create',
      userId,
      portfolioId,
      details: { name }
    });
  }

  logPortfolioUpdate(userId, portfolioId, changes) {
    return this.log({
      category: 'portfolio',
      action: 'update',
      userId,
      portfolioId,
      details: { changes }
    });
  }

  logPortfolioDelete(userId, portfolioId, name) {
    return this.log({
      category: 'portfolio',
      action: 'delete',
      userId,
      portfolioId,
      details: { name }
    });
  }

  /**
   * Transaction events
   */
  logTransaction(userId, portfolioId, transaction) {
    return this.log({
      category: 'transaction',
      action: transaction.type,
      userId,
      portfolioId,
      details: {
        symbol: transaction.symbol,
        shares: transaction.shares,
        price: transaction.price,
        amount: transaction.amount
      }
    });
  }

  logTransactionDelete(userId, transactionId, details) {
    return this.log({
      category: 'transaction',
      action: 'delete',
      userId,
      transactionId,
      details
    });
  }

  /**
   * Holding events
   */
  logHoldingAdd(userId, portfolioId, holding) {
    return this.log({
      category: 'holding',
      action: 'add',
      userId,
      portfolioId,
      details: {
        symbol: holding.symbol,
        shares: holding.shares,
        costBasis: holding.costBasis
      }
    });
  }

  logHoldingSell(userId, portfolioId, holdingId, details) {
    return this.log({
      category: 'holding',
      action: 'sell',
      userId,
      portfolioId,
      holdingId,
      details
    });
  }

  /**
   * Data access events
   */
  logDataExport(userId, exportType) {
    return this.log({
      category: 'data',
      action: 'export',
      userId,
      details: { type: exportType }
    });
  }

  logDataImport(userId, importType, rowCount) {
    return this.log({
      category: 'data',
      action: 'import',
      userId,
      details: { type: importType, rows: rowCount }
    });
  }

  logReportGenerated(userId, reportType, portfolioId) {
    return this.log({
      category: 'report',
      action: 'generate',
      userId,
      portfolioId,
      details: { type: reportType }
    });
  }

  /**
   * Settings events
   */
  logSettingsChange(userId, changes) {
    return this.log({
      category: 'settings',
      action: 'update',
      userId,
      details: { changes }
    });
  }

  /**
   * Alert events
   */
  logAlertCreate(userId, alert) {
    return this.log({
      category: 'alert',
      action: 'create',
      userId,
      details: {
        symbol: alert.symbol,
        type: alert.type,
        condition: alert.condition
      }
    });
  }

  logAlertTriggered(userId, alertId, details) {
    return this.log({
      category: 'alert',
      action: 'triggered',
      userId,
      alertId,
      details
    });
  }

  /**
   * Query audit logs
   */
  query(options = {}) {
    const {
      userId,
      category,
      action,
      startDate,
      endDate,
      limit = 100
    } = options;

    const results = [];
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      const fileDate = file.replace('audit-', '').replace('.jsonl', '');
      
      if (startDate && fileDate < startDate) continue;
      if (endDate && fileDate > endDate) continue;

      const filepath = path.join(this.logDir, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (userId && entry.userId !== userId) continue;
          if (category && entry.category !== category) continue;
          if (action && entry.action !== action) continue;

          results.push(entry);

          if (results.length >= limit) {
            return results;
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    return results;
  }

  /**
   * Get user activity summary
   */
  getUserActivity(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = this.query({
      userId,
      startDate: startDate.toISOString().split('T')[0],
      limit: 1000
    });

    const summary = {
      totalActions: logs.length,
      byCategory: {},
      byAction: {},
      byDay: {},
      recentActions: logs.slice(0, 20)
    };

    for (const log of logs) {
      // By category
      summary.byCategory[log.category] = (summary.byCategory[log.category] || 0) + 1;
      
      // By action
      const actionKey = `${log.category}:${log.action}`;
      summary.byAction[actionKey] = (summary.byAction[actionKey] || 0) + 1;
      
      // By day
      const day = log.timestamp.split('T')[0];
      summary.byDay[day] = (summary.byDay[day] || 0) + 1;
    }

    return summary;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(startDate, endDate) {
    const logs = this.query({ startDate, endDate, limit: 10000 });

    const report = {
      period: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: logs.length,
        uniqueUsers: new Set(logs.map(l => l.userId).filter(Boolean)).size,
        categories: {}
      },
      authEvents: {
        logins: 0,
        failedLogins: 0,
        passwordChanges: 0
      },
      dataEvents: {
        exports: 0,
        imports: 0,
        reports: 0
      },
      transactionEvents: {
        buys: 0,
        sells: 0,
        dividends: 0
      },
      securityConcerns: []
    };

    for (const log of logs) {
      report.summary.categories[log.category] = (report.summary.categories[log.category] || 0) + 1;

      // Auth events
      if (log.category === 'auth') {
        if (log.action === 'login' && log.success) report.authEvents.logins++;
        if (log.action === 'login_failed') {
          report.authEvents.failedLogins++;
          // Flag multiple failed logins from same IP
          const failedFromIp = logs.filter(l => 
            l.category === 'auth' && 
            l.action === 'login_failed' && 
            l.ip === log.ip
          );
          if (failedFromIp.length >= 5) {
            report.securityConcerns.push({
              type: 'multiple_failed_logins',
              ip: log.ip,
              count: failedFromIp.length
            });
          }
        }
        if (log.action === 'password_change') report.authEvents.passwordChanges++;
      }

      // Data events
      if (log.category === 'data') {
        if (log.action === 'export') report.dataEvents.exports++;
        if (log.action === 'import') report.dataEvents.imports++;
      }
      if (log.category === 'report') {
        report.dataEvents.reports++;
      }

      // Transaction events
      if (log.category === 'transaction') {
        if (log.action === 'buy') report.transactionEvents.buys++;
        if (log.action === 'sell') report.transactionEvents.sells++;
        if (log.action === 'dividend') report.transactionEvents.dividends++;
      }
    }

    // Dedupe security concerns
    report.securityConcerns = [...new Map(
      report.securityConcerns.map(c => [c.ip || c.userId, c])
    ).values()];

    return report;
  }

  /**
   * Retention policy - delete old logs
   */
  applyRetentionPolicy(retentionDays = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const files = fs.readdirSync(this.logDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.startsWith('audit-')) continue;
      
      const fileDate = file.replace('audit-', '').replace('.jsonl', '');
      if (fileDate < cutoffStr) {
        fs.unlinkSync(path.join(this.logDir, file));
        deletedCount++;
      }
    }

    return { deletedFiles: deletedCount, cutoffDate: cutoffStr };
  }
}

// Export singleton instance
const auditService = new AuditService();
module.exports = { AuditService, auditService };
