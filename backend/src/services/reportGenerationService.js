// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Import analytics services
const AnalyticsService = require('./analytics');
const AdvancedAnalyticsService = require('./advanced/analyticsAdvanced');


class ReportGenerationService {
  /**
   * Generate comprehensive client report with all 20 analytics
   * @param {string} userId - User ID
   * @param {string} portfolioId - Portfolio ID
   * @param {string} reportType - Type of report (comprehensive, performance, risk, etc.)
   * @returns {Promise<object>} - Report data
   */
  static async generateClientReport(userId, portfolioId, reportType = 'comprehensive') {
    try {
      logger.info(`Generating ${reportType} report for portfolio ${portfolioId}`);

      // Verify portfolio ownership
      const portfolio = db.prepare(`
        SELECT p.*, u.email, u.first_name, u.last_name
        FROM portfolios p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ? AND p.user_id = ?
      `).get(portfolioId, userId);

      if (!portfolio) {
        throw new Error('Portfolio not found or access denied');
      }

      // Get portfolio holdings
      const holdings = db.prepare(`
        SELECT * FROM holdings WHERE portfolio_id = ? ORDER BY symbol
      `).all(portfolioId);

      // Initialize report data
      const reportData = {
        reportId: uuidv4(),
        generatedAt: new Date().toISOString(),
        reportType,
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          description: portfolio.description,
          portfolioType: portfolio.portfolio_type,
          clientName: portfolio.client_name,
          createdAt: portfolio.created_at
        },
        client: {
          name: `${portfolio.first_name} ${portfolio.last_name}`,
          email: portfolio.email
        },
        summary: {
          totalHoldings: holdings.length,
          totalValue: 0,
          totalCost: 0,
          totalGain: 0,
          totalGainPct: 0
        },
        analytics: {}
      };

      // Calculate summary
      holdings.forEach(h => {
        const currentValue = (h.current_price || h.cost_basis) * h.quantity;
        const costValue = h.cost_basis * h.quantity;
        reportData.summary.totalValue += currentValue;
        reportData.summary.totalCost += costValue;
      });

      reportData.summary.totalGain = reportData.summary.totalValue - reportData.summary.totalCost;
      reportData.summary.totalGainPct = ((reportData.summary.totalGain / reportData.summary.totalCost) * 100) || 0;

      // Fetch analytics based on report type
      if (reportType === 'comprehensive' || reportType === 'performance') {
        reportData.analytics.performance = await this.fetchPerformanceAnalytics(portfolioId);
      }

      if (reportType === 'comprehensive' || reportType === 'risk') {
        reportData.analytics.risk = await this.fetchRiskAnalytics(portfolioId);
      }

      if (reportType === 'comprehensive' || reportType === 'attribution') {
        reportData.analytics.attribution = await this.fetchAttributionAnalytics(portfolioId);
      }

      if (reportType === 'comprehensive' || reportType === 'construction') {
        reportData.analytics.construction = await this.fetchConstructionAnalytics(portfolioId);
      }

      if (reportType === 'comprehensive' || reportType === 'specialized') {
        reportData.analytics.specialized = await this.fetchSpecializedAnalytics(portfolioId);
      }

      // Save report metadata to database
      const reportId = this.saveReportMetadata(userId, portfolioId, reportType, reportData);

      reportData.reportId = reportId;
      logger.info(`Report ${reportId} generated successfully`);

      return reportData;

    } catch (error) {
      logger.error('Error generating client report:', error);
      throw error;
    }
  }

  /**
   * Fetch Performance Analytics (4 analyses)
   */
  static async fetchPerformanceAnalytics(portfolioId) {
    const analytics = {};

    try {
      // 1. Performance Attribution
      const attribution = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculatePerformanceAttribution(portfolioId, '1Y')
      );
      analytics.performanceAttribution = attribution;

      // 2. Excess Return vs Benchmark
      const excessReturn = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateExcessReturn(portfolioId, 'SPY', '1Y')
      );
      analytics.excessReturn = excessReturn;

      // 3. Drawdown Analysis
      const drawdown = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateDrawdownAnalysis(portfolioId, '1Y')
      );
      analytics.drawdown = drawdown;

      // 4. Rolling Statistics
      const rollingStats = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateRollingStatistics(portfolioId, 90)
      );
      analytics.rollingStatistics = rollingStats;

    } catch (error) {
      logger.error('Error fetching performance analytics:', error);
    }

    return analytics;
  }

  /**
   * Fetch Risk Analytics (5 analyses)
   */
  static async fetchRiskAnalytics(portfolioId) {
    const analytics = {};

    try {
      // 5. Risk Decomposition (Factor Exposures)
      const riskDecomp = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateRiskDecomposition(portfolioId)
      );
      analytics.riskDecomposition = riskDecomp;

      // 6. VaR & Stress Scenarios
      const varScenarios = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateVaRScenarios(portfolioId, 95)
      );
      analytics.varScenarios = varScenarios;

      // 7. Correlation Matrix
      const correlation = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateCorrelationMatrix(portfolioId, '1Y')
      );
      analytics.correlationMatrix = correlation;

      // 8. Stress Testing
      const stressTests = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateStressScenarios(portfolioId)
      );
      analytics.stressTests = stressTests;

      // 9. Concentration Analysis
      const concentration = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateConcentrationAnalysis(portfolioId)
      );
      analytics.concentration = concentration;

    } catch (error) {
      logger.error('Error fetching risk analytics:', error);
    }

    return analytics;
  }

  /**
   * Fetch Attribution Analytics (4 analyses)
   */
  static async fetchAttributionAnalytics(portfolioId) {
    const analytics = {};

    try {
      // 10. Regional Attribution
      const regional = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateRegionalAttribution(portfolioId, '1Y')
      );
      analytics.regionalAttribution = regional;

      // 11. Sector Rotation
      const sectorRotation = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateSectorRotation(portfolioId, '1Y')
      );
      analytics.sectorRotation = sectorRotation;

      // 12. Peer Benchmarking
      const peerBench = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculatePeerBenchmarking(portfolioId)
      );
      analytics.peerBenchmarking = peerBench;

      // 13. Alpha Decay
      const alphaDecay = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateAlphaDecay(portfolioId, '1Y')
      );
      analytics.alphaDecay = alphaDecay;

    } catch (error) {
      logger.error('Error fetching attribution analytics:', error);
    }

    return analytics;
  }

  /**
   * Fetch Construction Analytics (4 analyses)
   */
  static async fetchConstructionAnalytics(portfolioId) {
    const analytics = {};

    try {
      // 14. Efficient Frontier
      const efficientFrontier = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateEfficientFrontier(portfolioId)
      );
      analytics.efficientFrontier = efficientFrontier;

      // 15. Turnover Analysis
      const turnover = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateTurnoverAnalysis(portfolioId, '1Y')
      );
      analytics.turnover = turnover;

      // 16. Liquidity Analysis
      const liquidity = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateLiquidityAnalysis(portfolioId)
      );
      analytics.liquidity = liquidity;

      // 17. Transaction Cost Analysis
      const tca = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateTransactionCostAnalysis(portfolioId, '1Y')
      );
      analytics.transactionCostAnalysis = tca;

    } catch (error) {
      logger.error('Error fetching construction analytics:', error);
    }

    return analytics;
  }

  /**
   * Fetch Specialized Analytics (3 analyses)
   */
  static async fetchSpecializedAnalytics(portfolioId) {
    const analytics = {};

    try {
      // 18. Alternatives Attribution
      const alternatives = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateAlternativesAttribution(portfolioId)
      );
      analytics.alternativesAttribution = alternatives;

      // 19. ESG Analysis
      const esg = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateESGAnalysis(portfolioId)
      );
      analytics.esgAnalysis = esg;

      // 20. Client Reporting Metrics
      const clientMetrics = await this.safeAnalyticsFetch(
        () => AdvancedAnalyticsService.calculateClientReporting(portfolioId)
      );
      analytics.clientMetrics = clientMetrics;

    } catch (error) {
      logger.error('Error fetching specialized analytics:', error);
    }

    return analytics;
  }

  /**
   * Safely fetch analytics with error handling
   */
  static async safeAnalyticsFetch(fetchFn) {
    try {
      const result = await fetchFn();
      return result || { error: 'No data available' };
    } catch (error) {
      logger.warn('Analytics fetch failed:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Save report metadata to database
   */
  static saveReportMetadata(userId, portfolioId, reportType, reportData) {
    const reportId = uuidv4();

    try {
      const stmt = db.prepare(`
        INSERT INTO generated_reports (
          id, portfolio_id, user_id, report_type,
          generated_at, analytics_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        reportId,
        portfolioId,
        userId,
        reportType,
        new Date().toISOString(),
        JSON.stringify({
          summary: reportData.summary,
          analyticsCount: Object.keys(reportData.analytics).length,
          generatedAt: reportData.generatedAt
        })
      );

      logger.info(`Saved report metadata: ${reportId}`);
      return reportId;

    } catch (error) {
      logger.error('Error saving report metadata:', error);
      throw error;
    }
  }

  /**
   * Get report by ID
   */
  static getReport(reportId, userId) {
    const stmt = db.prepare(`
      SELECT r.*, p.name as portfolio_name
      FROM generated_reports r
      JOIN portfolios p ON r.portfolio_id = p.id
      WHERE r.id = ? AND r.user_id = ?
    `);

    const report = stmt.get(reportId, userId);

    if (report && report.analytics_snapshot) {
      report.analytics_snapshot = JSON.parse(report.analytics_snapshot);
    }

    return report;
  }

  /**
   * Get all reports for user
   */
  static getUserReports(userId, limit = 50) {
    const stmt = db.prepare(`
      SELECT r.*, p.name as portfolio_name
      FROM generated_reports r
      JOIN portfolios p ON r.portfolio_id = p.id
      WHERE r.user_id = ?
      ORDER BY r.generated_at DESC
      LIMIT ?
    `);

    const reports = stmt.all(userId, limit);

    return reports.map(r => ({
      ...r,
      analytics_snapshot: r.analytics_snapshot ? JSON.parse(r.analytics_snapshot) : null
    }));
  }

  /**
   * Get portfolio reports
   */
  static getPortfolioReports(portfolioId, userId, limit = 20) {
    const stmt = db.prepare(`
      SELECT r.*, p.name as portfolio_name
      FROM generated_reports r
      JOIN portfolios p ON r.portfolio_id = p.id
      WHERE r.portfolio_id = ? AND r.user_id = ?
      ORDER BY r.generated_at DESC
      LIMIT ?
    `);

    const reports = stmt.all(portfolioId, userId, limit);

    return reports.map(r => ({
      ...r,
      analytics_snapshot: r.analytics_snapshot ? JSON.parse(r.analytics_snapshot) : null
    }));
  }

  /**
   * Delete report
   */
  static deleteReport(reportId, userId) {
    const stmt = db.prepare(`
      DELETE FROM generated_reports
      WHERE id = ? AND user_id = ?
    `);

    const result = stmt.run(reportId, userId);
    return result.changes > 0;
  }

  /**
   * Generate HTML summary for email/preview
   */
  static generateHTMLSummary(reportData) {
    const { portfolio, client, summary, generatedAt } = reportData;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${portfolio.name}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { margin: 0; color: #0d1117; font-size: 28px; }
    .header .subtitle { color: #666; margin-top: 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 30px 0; }
    .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; }
    .summary-card .label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
    .summary-card .value { font-size: 24px; font-weight: bold; color: #0d1117; }
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Portfolio Performance Report</h1>
      <div class="subtitle">${portfolio.name} | ${client.name}</div>
      <div class="subtitle">Generated: ${new Date(generatedAt).toLocaleString()}</div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Value</div>
        <div class="value">$${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>

      <div class="summary-card">
        <div class="label">Total Cost</div>
        <div class="value">$${summary.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>

      <div class="summary-card">
        <div class="label">Total Gain/Loss</div>
        <div class="value ${summary.totalGain >= 0 ? 'positive' : 'negative'}">
          ${summary.totalGain >= 0 ? '+' : ''}$${summary.totalGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div class="summary-card">
        <div class="label">Return %</div>
        <div class="value ${summary.totalGainPct >= 0 ? 'positive' : 'negative'}">
          ${summary.totalGainPct >= 0 ? '+' : ''}${summary.totalGainPct.toFixed(2)}%
        </div>
      </div>
    </div>

    <div class="summary-card">
      <div class="label">Holdings Count</div>
      <div class="value">${summary.totalHoldings}</div>
    </div>

    <div class="footer">
      <p>Generated by WealthPilot Pro | Comprehensive Portfolio Analytics Platform</p>
      <p>This report includes ${Object.keys(reportData.analytics || {}).length} categories of advanced analytics</p>
    </div>
  </div>
</body>
</html>
`;
  }
}

module.exports = ReportGenerationService;
