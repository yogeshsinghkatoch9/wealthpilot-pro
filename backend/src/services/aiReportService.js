/**
 * AI Report Service
 * Generates comprehensive portfolio reports with AI analysis and charts
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const unifiedAI = require('./unifiedAIService');
const chartGenerator = require('./chartGenerator');
const { prisma } = require('../db/simpleDb');

class AIReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.reportsCache = new Map(); // In-memory cache for reports when DB not available
    this.ensureReportsDir();
  }

  ensureReportsDir() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate a comprehensive portfolio report
   */
  async generateReport(userId, portfolioId, options = {}) {
    const {
      reportType = 'comprehensive',
      includeCharts = true,
      sections = ['executiveSummary', 'portfolioOverview', 'performanceAnalysis',
                  'riskAssessment', 'sectorAnalysis', 'holdingsAnalysis',
                  'dividendAnalysis', 'recommendations', 'marketOutlook']
    } = options;

    try {
      // Get portfolio data
      const portfolioData = await this.getPortfolioData(userId, portfolioId);

      if (!portfolioData) {
        throw new Error('Portfolio not found');
      }

      // Generate AI content for each section
      console.log('[AIReport] Generating AI content...');
      const aiContent = await unifiedAI.generateReport(portfolioData, { sections });

      // Generate charts
      let charts = {};
      if (includeCharts) {
        console.log('[AIReport] Generating charts...');
        charts = await chartGenerator.generateReportCharts(portfolioData);
      }

      // Generate PDF
      console.log('[AIReport] Generating PDF...');
      const pdfPath = await this.createPDF(portfolioData, aiContent, charts, reportType);

      // Save report record
      const report = await this.saveReportRecord(userId, portfolioId, pdfPath, reportType);

      return {
        success: true,
        reportId: report.id,
        filePath: pdfPath,
        downloadUrl: `/api/ai-reports/${report.id}/download`
      };

    } catch (error) {
      console.error('[AIReport] Error generating report:', error.message);
      throw error;
    }
  }

  /**
   * Get portfolio data for report
   */
  async getPortfolioData(userId, portfolioId) {
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) return null;

    // Calculate metrics
    const holdings = portfolio.holdings.map(h => {
      const shares = parseFloat(h.shares) || 0;
      const avgCost = parseFloat(h.avgCostBasis) || 0;
      const currentPrice = parseFloat(h.currentPrice) || avgCost;
      const costBasis = shares * avgCost;
      const marketValue = shares * currentPrice;
      const gain = marketValue - costBasis;
      const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

      return {
        ...h,
        shares,
        avgCostBasis: avgCost,
        currentPrice,
        costBasis,
        marketValue,
        gain,
        gainPercent,
        dividendYield: parseFloat(h.dividendYield) || 0
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    const totalGain = totalValue - totalCostBasis;
    const totalGainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

    // Calculate sector allocation
    const sectorAllocation = {};
    holdings.forEach(h => {
      const sector = h.sector || 'Unknown';
      if (!sectorAllocation[sector]) {
        sectorAllocation[sector] = { value: 0, percentage: 0 };
      }
      sectorAllocation[sector].value += h.marketValue;
    });

    Object.keys(sectorAllocation).forEach(sector => {
      sectorAllocation[sector].percentage = (sectorAllocation[sector].value / totalValue) * 100;
    });

    // Calculate dividends
    const totalAnnualDividends = holdings.reduce((sum, h) => {
      return sum + (h.marketValue * (h.dividendYield / 100));
    }, 0);

    const portfolioYield = totalValue > 0 ? (totalAnnualDividends / totalValue) * 100 : 0;

    // Risk metrics (simplified)
    const riskMetrics = this.calculateRiskMetrics(holdings, totalValue);

    return {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      currency: portfolio.currency,
      holdings: holdings.sort((a, b) => b.marketValue - a.marketValue),
      totalValue,
      totalCostBasis,
      totalGain,
      totalGainPercent,
      sectorAllocation,
      dividends: {
        annualIncome: totalAnnualDividends,
        yield: portfolioYield
      },
      riskMetrics,
      metrics: {
        holdingsCount: holdings.length,
        sectorCount: Object.keys(sectorAllocation).length
      }
    };
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(holdings, totalValue) {
    // Concentration risk
    const maxPosition = Math.max(...holdings.map(h => h.marketValue));
    const concentrationScore = Math.min(100, (maxPosition / totalValue) * 100 * 2);

    // Sector concentration
    const sectorValues = {};
    holdings.forEach(h => {
      const sector = h.sector || 'Unknown';
      sectorValues[sector] = (sectorValues[sector] || 0) + h.marketValue;
    });
    const maxSector = Math.max(...Object.values(sectorValues));
    const sectorScore = Math.min(100, (maxSector / totalValue) * 100 * 1.5);

    // Diversification score (inverse of concentration)
    const diversificationScore = Math.max(0, 100 - concentrationScore);

    // Simplified volatility estimate based on holdings
    const volatilityScore = Math.random() * 30 + 20; // Placeholder

    return {
      concentrationScore,
      sectorScore,
      diversificationScore,
      volatilityScore,
      betaScore: 50,
      drawdownScore: 40,
      liquidityScore: 70
    };
  }

  /**
   * Create the PDF document
   */
  async createPDF(portfolioData, aiContent, charts, reportType) {
    return new Promise((resolve, reject) => {
      const fileName = `report_${portfolioData.id}_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, fileName);

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `${portfolioData.name} - Portfolio Report`,
          Author: 'WealthPilot Pro',
          Subject: 'Investment Portfolio Analysis',
          Creator: 'WealthPilot AI'
        }
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Cover Page
      this.addCoverPage(doc, portfolioData);

      // Table of Contents
      doc.addPage();
      this.addTableOfContents(doc);

      // Executive Summary
      if (aiContent.executiveSummary) {
        doc.addPage();
        this.addSection(doc, 'Executive Summary', aiContent.executiveSummary);
      }

      // Portfolio Overview
      if (aiContent.portfolioOverview) {
        doc.addPage();
        this.addSection(doc, 'Portfolio Overview', aiContent.portfolioOverview);

        // Add allocation chart
        if (charts.allocation) {
          doc.moveDown();
          doc.image(charts.allocation, { width: 500, align: 'center' });
        }
      }

      // Holdings Table
      doc.addPage();
      this.addHoldingsTable(doc, portfolioData.holdings);

      // Add holdings chart
      if (charts.holdings) {
        doc.addPage();
        doc.image(charts.holdings, { width: 500, align: 'center' });
      }

      // Performance Analysis
      if (aiContent.performanceAnalysis) {
        doc.addPage();
        this.addSection(doc, 'Performance Analysis', aiContent.performanceAnalysis);

        if (charts.gainLoss) {
          doc.moveDown();
          doc.image(charts.gainLoss, { width: 500, align: 'center' });
        }
      }

      // Risk Assessment
      if (aiContent.riskAssessment) {
        doc.addPage();
        this.addSection(doc, 'Risk Assessment', aiContent.riskAssessment);

        if (charts.risk) {
          doc.moveDown();
          doc.image(charts.risk, { width: 400, align: 'center' });
        }
      }

      // Sector Analysis
      if (aiContent.sectorAnalysis) {
        doc.addPage();
        this.addSection(doc, 'Sector Analysis', aiContent.sectorAnalysis);

        if (charts.sectors) {
          doc.moveDown();
          doc.image(charts.sectors, { width: 500, align: 'center' });
        }
      }

      // Holdings Analysis
      if (aiContent.holdingsAnalysis) {
        doc.addPage();
        this.addSection(doc, 'Holdings Analysis', aiContent.holdingsAnalysis);
      }

      // Dividend Analysis
      if (aiContent.dividendAnalysis) {
        doc.addPage();
        this.addSection(doc, 'Dividend Analysis', aiContent.dividendAnalysis);

        if (charts.dividends) {
          doc.moveDown();
          doc.image(charts.dividends, { width: 500, align: 'center' });
        }
      }

      // Recommendations
      if (aiContent.recommendations) {
        doc.addPage();
        this.addSection(doc, 'Recommendations', aiContent.recommendations);
      }

      // Market Outlook
      if (aiContent.marketOutlook) {
        doc.addPage();
        this.addSection(doc, 'Market Outlook', aiContent.marketOutlook);
      }

      // Disclaimer
      doc.addPage();
      this.addDisclaimer(doc);

      // Finalize
      doc.end();

      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  /**
   * Add cover page
   */
  addCoverPage(doc, portfolioData) {
    doc.fontSize(32)
       .fillColor('#1E3A8A')
       .text('WealthPilot Pro', { align: 'center' });

    doc.moveDown(2);

    doc.fontSize(24)
       .fillColor('#1F2937')
       .text('Portfolio Analysis Report', { align: 'center' });

    doc.moveDown(3);

    doc.fontSize(20)
       .text(portfolioData.name, { align: 'center' });

    doc.moveDown(4);

    // Summary box
    const summaryY = doc.y;
    doc.rect(100, summaryY, 400, 150)
       .strokeColor('#E5E7EB')
       .stroke();

    doc.fontSize(12)
       .fillColor('#4B5563')
       .text('Portfolio Value:', 120, summaryY + 20)
       .fontSize(16)
       .fillColor('#059669')
       .text(`$${portfolioData.totalValue?.toLocaleString()}`, 120, summaryY + 40);

    doc.fontSize(12)
       .fillColor('#4B5563')
       .text('Total Return:', 320, summaryY + 20)
       .fontSize(16)
       .fillColor(portfolioData.totalGainPercent >= 0 ? '#059669' : '#DC2626')
       .text(`${portfolioData.totalGainPercent?.toFixed(2)}%`, 320, summaryY + 40);

    doc.fontSize(12)
       .fillColor('#4B5563')
       .text('Holdings:', 120, summaryY + 80)
       .fontSize(16)
       .fillColor('#1F2937')
       .text(`${portfolioData.holdings?.length || 0} positions`, 120, summaryY + 100);

    doc.fontSize(12)
       .fillColor('#4B5563')
       .text('Dividend Yield:', 320, summaryY + 80)
       .fontSize(16)
       .fillColor('#1F2937')
       .text(`${portfolioData.dividends?.yield?.toFixed(2) || 0}%`, 320, summaryY + 100);

    doc.moveDown(10);

    doc.fontSize(12)
       .fillColor('#6B7280')
       .text(`Generated: ${new Date().toLocaleDateString('en-US', {
         year: 'numeric',
         month: 'long',
         day: 'numeric'
       })}`, { align: 'center' });

    doc.text('Powered by AI Analysis', { align: 'center' });
  }

  /**
   * Add table of contents
   */
  addTableOfContents(doc) {
    doc.fontSize(20)
       .fillColor('#1E3A8A')
       .text('Table of Contents', { align: 'left' });

    doc.moveDown(2);

    const sections = [
      { title: 'Executive Summary', page: 3 },
      { title: 'Portfolio Overview', page: 4 },
      { title: 'Holdings Detail', page: 5 },
      { title: 'Performance Analysis', page: 6 },
      { title: 'Risk Assessment', page: 7 },
      { title: 'Sector Analysis', page: 8 },
      { title: 'Holdings Analysis', page: 9 },
      { title: 'Dividend Analysis', page: 10 },
      { title: 'Recommendations', page: 11 },
      { title: 'Market Outlook', page: 12 },
      { title: 'Disclaimer', page: 13 }
    ];

    doc.fontSize(12)
       .fillColor('#1F2937');

    sections.forEach(section => {
      doc.text(`${section.title}`, 50, doc.y, { continued: true })
         .text(`${section.page}`, { align: 'right' });
      doc.moveDown(0.5);
    });
  }

  /**
   * Add a section with content
   */
  addSection(doc, title, content) {
    doc.fontSize(18)
       .fillColor('#1E3A8A')
       .text(title);

    doc.moveDown();

    doc.fontSize(11)
       .fillColor('#374151')
       .text(content, {
         align: 'justify',
         lineGap: 4
       });
  }

  /**
   * Add holdings table
   */
  addHoldingsTable(doc, holdings) {
    doc.fontSize(18)
       .fillColor('#1E3A8A')
       .text('Holdings Detail');

    doc.moveDown();

    // Table headers
    const tableTop = doc.y;
    const colWidths = [60, 120, 60, 70, 70, 70];
    const headers = ['Symbol', 'Name', 'Shares', 'Cost', 'Value', 'Gain %'];

    doc.fontSize(10)
       .fillColor('#1F2937');

    let x = 50;
    headers.forEach((header, i) => {
      doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    doc.moveTo(50, tableTop + 15)
       .lineTo(550, tableTop + 15)
       .strokeColor('#E5E7EB')
       .stroke();

    // Table rows
    let y = tableTop + 25;
    doc.fontSize(9)
       .fillColor('#4B5563');

    holdings.slice(0, 15).forEach(holding => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      x = 50;
      const values = [
        holding.symbol,
        (holding.name || 'N/A').substring(0, 18),
        holding.shares?.toFixed(2) || '0',
        `$${holding.costBasis?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}`,
        `$${holding.marketValue?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}`,
        `${holding.gainPercent?.toFixed(1) || 0}%`
      ];

      values.forEach((val, i) => {
        const color = i === 5 ? (parseFloat(val) >= 0 ? '#059669' : '#DC2626') : '#4B5563';
        doc.fillColor(color)
           .text(val, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      y += 18;
    });

    if (holdings.length > 15) {
      doc.moveDown()
         .fontSize(9)
         .fillColor('#6B7280')
         .text(`... and ${holdings.length - 15} more holdings`);
    }
  }

  /**
   * Add disclaimer
   */
  addDisclaimer(doc) {
    doc.fontSize(18)
       .fillColor('#1E3A8A')
       .text('Important Disclaimer');

    doc.moveDown();

    doc.fontSize(10)
       .fillColor('#6B7280')
       .text(`This report is generated by WealthPilot Pro using artificial intelligence for educational and informational purposes only. It does not constitute financial advice, investment recommendations, or an offer to buy or sell any securities.

Past performance is not indicative of future results. All investments involve risk, including the potential loss of principal. The analysis and recommendations contained in this report are based on the data provided and may not account for all relevant factors.

Before making any investment decisions, you should:
- Consult with a qualified financial advisor
- Consider your own financial situation and investment objectives
- Conduct your own due diligence
- Review the prospectus and other documents for any securities mentioned

The AI-generated content in this report may contain errors or inaccuracies. WealthPilot Pro makes no warranties or representations regarding the accuracy, completeness, or timeliness of the information provided.

Market data and calculations are subject to delays and may not reflect current market conditions.`, {
         align: 'justify',
         lineGap: 4
       });

    doc.moveDown(2);

    doc.fontSize(10)
       .text(`Report generated on ${new Date().toISOString()}`, { align: 'center' });
    doc.text('WealthPilot Pro - AI-Powered Portfolio Analysis', { align: 'center' });
  }

  /**
   * Save report record to database
   */
  async saveReportRecord(userId, portfolioId, filePath, reportType) {
    // Note: Requires AIReport model in Prisma schema
    try {
      const report = await prisma.aIReport.create({
        data: {
          userId,
          portfolioId,
          reportType,
          status: 'completed',
          filePath,
          metadata: JSON.stringify({ generatedAt: new Date().toISOString() })
        }
      });
      // Also cache it
      this.reportsCache.set(report.id, report);
      return report;
    } catch (error) {
      // If model doesn't exist yet, use in-memory cache
      console.log('[AIReport] Database model not available, using in-memory cache');
      const report = {
        id: `report_${Date.now()}`,
        userId,
        portfolioId,
        reportType,
        status: 'completed',
        filePath,
        createdAt: new Date().toISOString()
      };
      this.reportsCache.set(report.id, report);
      return report;
    }
  }

  /**
   * Get report by ID
   */
  async getReport(reportId) {
    // First check in-memory cache
    if (this.reportsCache.has(reportId)) {
      return this.reportsCache.get(reportId);
    }

    // Try database
    try {
      const report = await prisma.aIReport.findUnique({
        where: { id: reportId }
      });
      if (report) {
        this.reportsCache.set(reportId, report);
        return report;
      }
    } catch (error) {
      console.log('[AIReport] Database lookup failed:', error.message);
    }

    // Try to find by scanning reports directory
    try {
      const files = fs.readdirSync(this.reportsDir);
      for (const file of files) {
        if (file.endsWith('.pdf')) {
          const filePath = path.join(this.reportsDir, file);
          // Check if this file was created around the time in the reportId
          const timestamp = reportId.replace('report_', '');
          if (file.includes(timestamp.substring(0, 10))) {
            return {
              id: reportId,
              filePath,
              status: 'completed'
            };
          }
        }
      }
    } catch (error) {
      console.log('[AIReport] Directory scan failed:', error.message);
    }

    return null;
  }

  /**
   * Get user's report history
   */
  async getReportHistory(userId, limit = 10) {
    let reports = [];

    // Try database first
    try {
      reports = await prisma.aIReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
    } catch (error) {
      console.log('[AIReport] Database history lookup failed:', error.message);
    }

    // Add reports from cache for this user
    for (const [id, report] of this.reportsCache.entries()) {
      if (report.userId === userId) {
        const exists = reports.some(r => r.id === id);
        if (!exists) {
          reports.push(report);
        }
      }
    }

    // Sort by createdAt and limit
    return reports
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Delete a report
   */
  async deleteReport(userId, reportId) {
    try {
      const report = await prisma.aIReport.findFirst({
        where: { id: reportId, userId }
      });

      if (!report) {
        throw new Error('Report not found');
      }

      // Delete file
      if (report.filePath && fs.existsSync(report.filePath)) {
        fs.unlinkSync(report.filePath);
      }

      // Delete record
      await prisma.aIReport.delete({
        where: { id: reportId }
      });

      return { success: true };
    } catch (error) {
      console.error('[AIReport] Delete error:', error.message);
      throw error;
    }
  }
}

module.exports = new AIReportService();
