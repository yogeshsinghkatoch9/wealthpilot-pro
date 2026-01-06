const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const reportGenerationService = require('./reportGenerationService');


// PDF storage directory
const PDF_DIR = path.join(__dirname, '../../pdfs');

class PDFGenerationService {
  /**
   * Initialize PDF directory
   */
  static async init() {
    try {
      await fs.mkdir(PDF_DIR, { recursive: true });
      logger.info('PDF directory initialized:', PDF_DIR);
    } catch (error) {
      logger.error('Error creating PDF directory:', error);
    }
  }

  /**
   * Generate PDF from report data
   * @param {string} userId - User ID
   * @param {string} portfolioId - Portfolio ID
   * @param {string} reportType - Report type
   * @param {object} options - PDF generation options
   * @returns {Promise<object>} - PDF file info
   */
  static async generatePDF(userId, portfolioId, reportType = 'comprehensive', options = {}) {
    let browser = null;

    try {
      logger.info(`Generating PDF for portfolio ${portfolioId}, type: ${reportType}`);

      // Generate report data
      const reportData = await reportGenerationService.generateClientReport(
        userId,
        portfolioId,
        reportType
      );

      // Generate comprehensive HTML for PDF
      const html = this.generatePDFHTML(reportData);

      // Launch headless browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      // Set viewport for consistent rendering
      await page.setViewport({
        width: 1200,
        height: 800,
        deviceScaleFactor: 2
      });

      // Set content
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      // Generate PDF filename
      const timestamp = Date.now();
      const filename = `report-${portfolioId.substring(0, 8)}-${timestamp}.pdf`;
      const filePath = path.join(PDF_DIR, filename);

      // Generate PDF
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width: 100%; font-size: 10px; text-align: center; color: #666; padding: 10px 0;">
            <span style="color: #f59e0b; font-weight: bold;">WealthPilot Pro</span> | Portfolio Report
          </div>
        `,
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; text-align: center; color: #999; padding: 10px 0;">
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            <span style="margin-left: 20px;">Generated: ${new Date().toLocaleDateString()}</span>
          </div>
        `
      });

      await browser.close();
      browser = null;

      // Get file stats
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Update database
      const reportId = reportData.reportId;
      const updateStmt = db.prepare(`
        UPDATE generated_reports
        SET file_path = ?, file_size = ?
        WHERE id = ?
      `);

      updateStmt.run(filePath, fileSize, reportId);

      logger.info(`PDF generated successfully: ${filename} (${fileSize} bytes)`);

      return {
        reportId,
        filename,
        filePath,
        fileSize,
        relativePath: `/pdfs/${filename}`
      };

    } catch (error) {
      logger.error('Error generating PDF:', error);

      if (browser) {
        await browser.close();
      }

      throw error;
    }
  }

  /**
   * Generate comprehensive HTML for PDF with all analytics
   */
  static generatePDFHTML(reportData) {
    const { portfolio, client, summary, analytics, generatedAt, reportType } = reportData;

    // Helper function to format numbers
    const fmt = {
      money: (val, decimals = 2) => {
        const num = parseFloat(val) || 0;
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      },
      pct: (val) => {
        const num = parseFloat(val) || 0;
        return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
      }
    };

    // Build analytics sections HTML
    let analyticsHTML = '';

    if (analytics.performance) {
      analyticsHTML += this.generatePerformanceSection(analytics.performance);
    }

    if (analytics.risk) {
      analyticsHTML += this.generateRiskSection(analytics.risk);
    }

    if (analytics.attribution) {
      analyticsHTML += this.generateAttributionSection(analytics.attribution);
    }

    if (analytics.construction) {
      analyticsHTML += this.generateConstructionSection(analytics.construction);
    }

    if (analytics.specialized) {
      analyticsHTML += this.generateSpecializedSection(analytics.specialized);
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${portfolio.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.6;
    }
    .container { max-width: 100%; padding: 0; }

    /* Cover Page */
    .cover-page {
      page-break-after: always;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, #0d1117 0%, #1e293b 100%);
      color: white;
      text-align: center;
      padding: 40px;
    }
    .cover-title {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 20px;
      color: #f59e0b;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .cover-subtitle {
      font-size: 28px;
      margin-bottom: 40px;
      color: #e2e8f0;
    }
    .cover-info {
      font-size: 18px;
      color: #94a3b8;
      margin: 10px 0;
    }
    .cover-divider {
      width: 200px;
      height: 3px;
      background: #f59e0b;
      margin: 30px auto;
    }

    /* Summary Page */
    .summary-page {
      page-break-after: always;
      padding: 40px;
    }
    .page-title {
      font-size: 32px;
      font-weight: bold;
      color: #0d1117;
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 15px;
      margin-bottom: 30px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .metric-card {
      background: #f8fafc;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      border-radius: 8px;
    }
    .metric-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .metric-value {
      font-size: 28px;
      font-weight: bold;
      color: #0d1117;
    }
    .metric-value.positive { color: #10b981; }
    .metric-value.negative { color: #ef4444; }

    /* Analytics Sections */
    .analytics-section {
      page-break-inside: avoid;
      margin: 40px 0;
      padding: 30px;
      background: #f8fafc;
      border-radius: 8px;
    }
    .section-title {
      font-size: 24px;
      font-weight: bold;
      color: #f59e0b;
      margin-bottom: 20px;
      text-transform: uppercase;
    }
    .analysis-item {
      margin: 20px 0;
      padding: 15px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .analysis-title {
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 10px;
    }
    .analysis-data {
      font-size: 14px;
      color: #475569;
      line-height: 1.8;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    .data-table th {
      background: #f1f5f9;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
    }
    .data-table tr:hover {
      background: #f8fafc;
    }

    /* Key Metrics */
    .key-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .key-metric {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .key-metric-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .key-metric-value {
      font-size: 20px;
      font-weight: bold;
      color: #0d1117;
    }

    /* Footer */
    .report-footer {
      margin-top: 60px;
      padding: 30px;
      background: #f8fafc;
      border-radius: 8px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .disclaimer {
      margin-top: 20px;
      font-size: 10px;
      color: #94a3b8;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-title">Portfolio Report</div>
    <div class="cover-divider"></div>
    <div class="cover-subtitle">${portfolio.name}</div>
    <div class="cover-info">Client: ${client.name}</div>
    <div class="cover-info">Report Type: ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}</div>
    <div class="cover-info">Generated: ${new Date(generatedAt).toLocaleString()}</div>
  </div>

  <!-- Executive Summary -->
  <div class="summary-page">
    <h1 class="page-title">Executive Summary</h1>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Portfolio Value</div>
        <div class="metric-value">${fmt.money(summary.totalValue)}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Total Cost Basis</div>
        <div class="metric-value">${fmt.money(summary.totalCost)}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Total Gain/Loss</div>
        <div class="metric-value ${summary.totalGain >= 0 ? 'positive' : 'negative'}">
          ${summary.totalGain >= 0 ? '+' : ''}${fmt.money(summary.totalGain)}
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Return Percentage</div>
        <div class="metric-value ${summary.totalGainPct >= 0 ? 'positive' : 'negative'}">
          ${fmt.pct(summary.totalGainPct)}
        </div>
      </div>
    </div>

    <div class="analysis-item">
      <div class="analysis-title">Portfolio Information</div>
      <div class="analysis-data">
        <strong>Portfolio Name:</strong> ${portfolio.name}<br>
        <strong>Description:</strong> ${portfolio.description || 'N/A'}<br>
        <strong>Type:</strong> ${portfolio.portfolioType || 'Standard'}<br>
        <strong>Total Holdings:</strong> ${summary.totalHoldings}<br>
        <strong>Created:</strong> ${new Date(portfolio.createdAt).toLocaleDateString()}
      </div>
    </div>
  </div>

  <!-- Analytics Sections -->
  <div class="container">
    ${analyticsHTML}
  </div>

  <!-- Footer -->
  <div class="report-footer">
    <strong>Generated by WealthPilot Pro</strong><br>
    Advanced Portfolio Analytics Platform<br>
    Report ID: ${reportData.reportId}

    <div class="disclaimer">
      This report is for informational purposes only and should not be considered as investment advice.
      Past performance is not indicative of future results. Please consult with a qualified financial advisor
      before making investment decisions.
    </div>
  </div>
</body>
</html>
`;
  }

  /**
   * Generate Performance Analytics Section
   */
  static generatePerformanceSection(performanceData) {
    return `
    <div class="analytics-section">
      <h2 class="section-title">Performance Analytics</h2>

      <div class="analysis-item">
        <div class="analysis-title">1. Performance Attribution</div>
        <div class="analysis-data">
          ${performanceData.performanceAttribution ?
    `<strong>Status:</strong> ${performanceData.performanceAttribution.error ? 'Error: ' + performanceData.performanceAttribution.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">2. Excess Return vs Benchmark</div>
        <div class="analysis-data">
          ${performanceData.excessReturn ?
    `<strong>Status:</strong> ${performanceData.excessReturn.error ? 'Error: ' + performanceData.excessReturn.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">3. Drawdown Analysis</div>
        <div class="analysis-data">
          ${performanceData.drawdown ?
    `<strong>Status:</strong> ${performanceData.drawdown.error ? 'Error: ' + performanceData.drawdown.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">4. Rolling Statistics</div>
        <div class="analysis-data">
          ${performanceData.rollingStatistics ?
    `<strong>Status:</strong> ${performanceData.rollingStatistics.error ? 'Error: ' + performanceData.rollingStatistics.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Generate Risk Analytics Section
   */
  static generateRiskSection(riskData) {
    return `
    <div class="analytics-section">
      <h2 class="section-title">Risk Analytics</h2>

      <div class="analysis-item">
        <div class="analysis-title">5. Risk Decomposition (Factor Exposures)</div>
        <div class="analysis-data">
          ${riskData.riskDecomposition ?
    `<strong>Status:</strong> ${riskData.riskDecomposition.error ? 'Error: ' + riskData.riskDecomposition.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">6. VaR & Stress Scenarios</div>
        <div class="analysis-data">
          ${riskData.varScenarios ?
    `<strong>Status:</strong> ${riskData.varScenarios.error ? 'Error: ' + riskData.varScenarios.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">7. Correlation Matrix</div>
        <div class="analysis-data">
          ${riskData.correlationMatrix ?
    `<strong>Status:</strong> ${riskData.correlationMatrix.error ? 'Error: ' + riskData.correlationMatrix.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">8. Stress Testing</div>
        <div class="analysis-data">
          ${riskData.stressTests ?
    `<strong>Status:</strong> ${riskData.stressTests.error ? 'Error: ' + riskData.stressTests.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">9. Concentration Analysis</div>
        <div class="analysis-data">
          ${riskData.concentration ?
    `<strong>Status:</strong> ${riskData.concentration.error ? 'Error: ' + riskData.concentration.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Generate Attribution Analytics Section
   */
  static generateAttributionSection(attributionData) {
    return `
    <div class="analytics-section">
      <h2 class="section-title">Attribution Analytics</h2>

      <div class="analysis-item">
        <div class="analysis-title">10. Regional Attribution</div>
        <div class="analysis-data">
          ${attributionData.regionalAttribution ?
    `<strong>Status:</strong> ${attributionData.regionalAttribution.error ? 'Error: ' + attributionData.regionalAttribution.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">11. Sector Rotation</div>
        <div class="analysis-data">
          ${attributionData.sectorRotation ?
    `<strong>Status:</strong> ${attributionData.sectorRotation.error ? 'Error: ' + attributionData.sectorRotation.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">12. Peer Benchmarking</div>
        <div class="analysis-data">
          ${attributionData.peerBenchmarking ?
    `<strong>Status:</strong> ${attributionData.peerBenchmarking.error ? 'Error: ' + attributionData.peerBenchmarking.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">13. Alpha Decay</div>
        <div class="analysis-data">
          ${attributionData.alphaDecay ?
    `<strong>Status:</strong> ${attributionData.alphaDecay.error ? 'Error: ' + attributionData.alphaDecay.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Generate Construction Analytics Section
   */
  static generateConstructionSection(constructionData) {
    return `
    <div class="analytics-section">
      <h2 class="section-title">Portfolio Construction Analytics</h2>

      <div class="analysis-item">
        <div class="analysis-title">14. Efficient Frontier</div>
        <div class="analysis-data">
          ${constructionData.efficientFrontier ?
    `<strong>Status:</strong> ${constructionData.efficientFrontier.error ? 'Error: ' + constructionData.efficientFrontier.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">15. Turnover Analysis</div>
        <div class="analysis-data">
          ${constructionData.turnover ?
    `<strong>Status:</strong> ${constructionData.turnover.error ? 'Error: ' + constructionData.turnover.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">16. Liquidity Analysis</div>
        <div class="analysis-data">
          ${constructionData.liquidity ?
    `<strong>Status:</strong> ${constructionData.liquidity.error ? 'Error: ' + constructionData.liquidity.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">17. Transaction Cost Analysis</div>
        <div class="analysis-data">
          ${constructionData.transactionCostAnalysis ?
    `<strong>Status:</strong> ${constructionData.transactionCostAnalysis.error ? 'Error: ' + constructionData.transactionCostAnalysis.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Generate Specialized Analytics Section
   */
  static generateSpecializedSection(specializedData) {
    return `
    <div class="analytics-section">
      <h2 class="section-title">Specialized Analytics</h2>

      <div class="analysis-item">
        <div class="analysis-title">18. Alternatives Attribution</div>
        <div class="analysis-data">
          ${specializedData.alternativesAttribution ?
    `<strong>Status:</strong> ${specializedData.alternativesAttribution.error ? 'Error: ' + specializedData.alternativesAttribution.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">19. ESG Analysis</div>
        <div class="analysis-data">
          ${specializedData.esgAnalysis ?
    `<strong>Status:</strong> ${specializedData.esgAnalysis.error ? 'Error: ' + specializedData.esgAnalysis.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>

      <div class="analysis-item">
        <div class="analysis-title">20. Client Reporting Metrics</div>
        <div class="analysis-data">
          ${specializedData.clientMetrics ?
    `<strong>Status:</strong> ${specializedData.clientMetrics.error ? 'Error: ' + specializedData.clientMetrics.error : 'Analysis completed'}` :
    'Data not available'}
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Get PDF file
   */
  static async getPDF(reportId, userId) {
    try {
      const report = db.prepare(`
        SELECT r.*, p.name as portfolio_name
        FROM generated_reports r
        JOIN portfolios p ON r.portfolio_id = p.id
        WHERE r.id = ? AND r.user_id = ?
      `).get(reportId, userId);

      if (!report) {
        throw new Error('Report not found');
      }

      if (!report.file_path) {
        throw new Error('PDF not yet generated for this report');
      }

      // Check if file exists
      try {
        await fs.access(report.file_path);
      } catch {
        throw new Error('PDF file not found on disk');
      }

      // Update download count
      db.prepare(`
        UPDATE generated_reports
        SET download_count = download_count + 1,
            last_downloaded_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), reportId);

      return {
        filePath: report.file_path,
        filename: path.basename(report.file_path),
        fileSize: report.file_size,
        portfolioName: report.portfolio_name
      };

    } catch (error) {
      logger.error('Error getting PDF:', error);
      throw error;
    }
  }

  /**
   * Delete PDF file
   */
  static async deletePDF(reportId, userId) {
    try {
      const report = db.prepare(`
        SELECT file_path FROM generated_reports
        WHERE id = ? AND user_id = ?
      `).get(reportId, userId);

      if (report && report.file_path) {
        try {
          await fs.unlink(report.file_path);
          logger.info(`Deleted PDF file: ${report.file_path}`);
        } catch (error) {
          logger.warn('PDF file already deleted or not found:', error.message);
        }

        // Update database
        db.prepare(`
          UPDATE generated_reports
          SET file_path = NULL, file_size = NULL
          WHERE id = ?
        `).run(reportId);
      }

      return true;

    } catch (error) {
      logger.error('Error deleting PDF:', error);
      throw error;
    }
  }

  /**
   * Clean up old PDFs (older than 30 days)
   */
  static async cleanupOldPDFs() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const oldReports = db.prepare(`
        SELECT id, file_path FROM generated_reports
        WHERE generated_at < ? AND file_path IS NOT NULL
      `).all(thirtyDaysAgo.toISOString());

      let deletedCount = 0;

      for (const report of oldReports) {
        try {
          await fs.unlink(report.file_path);

          db.prepare(`
            UPDATE generated_reports
            SET file_path = NULL, file_size = NULL
            WHERE id = ?
          `).run(report.id);

          deletedCount++;
        } catch (error) {
          logger.warn(`Failed to delete old PDF: ${report.file_path}`, error.message);
        }
      }

      logger.info(`Cleaned up ${deletedCount} old PDF files`);
      return deletedCount;

    } catch (error) {
      logger.error('Error cleaning up old PDFs:', error);
      throw error;
    }
  }
}

// Initialize PDF directory on module load
PDFGenerationService.init();

module.exports = PDFGenerationService;
