/**
 * AI Report Service
 * Generates comprehensive portfolio reports with AI analysis and visualizations
 */

const fs = require('fs');
const path = require('path');
const unifiedAI = require('./unifiedAIService');
const chartGenerator = require('./chartGenerator');
const pdfGenerator = require('./pdfReportGenerator');
const { masterReportPrompt } = require('./prompts/masterReportPrompt');
const { prisma } = require('../db/simpleDb');

class AIReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.reportsCache = new Map();
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
      includeCharts = true
    } = options;

    try {
      console.log(`[AIReport] Starting report generation for portfolio ${portfolioId}`);

      // Step 1: Get portfolio data
      const portfolioData = await this.getPortfolioData(userId, portfolioId);
      if (!portfolioData) {
        throw new Error('Portfolio not found or no holdings available');
      }

      console.log(`[AIReport] Portfolio loaded: ${portfolioData.name} with ${portfolioData.holdings?.length || 0} holdings`);

      // Step 2: Generate AI content using master prompt
      console.log('[AIReport] Generating AI analysis...');
      const aiContent = await this.generateAIContent(portfolioData, reportType);

      // Step 3: Generate charts
      let charts = {};
      if (includeCharts && chartGenerator.isAvailable()) {
        console.log('[AIReport] Generating visualizations...');
        charts = await chartGenerator.generateReportCharts(portfolioData);
      } else {
        console.log('[AIReport] Chart generation skipped (canvas not available)');
      }

      // Step 4: Generate PDF
      console.log('[AIReport] Creating PDF document...');
      const fileName = `report_${portfolioId}_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, fileName);

      await pdfGenerator.generateReport(portfolioData, aiContent, charts, filePath);

      // Step 5: Save report record
      const report = await this.saveReportRecord(userId, portfolioId, filePath, reportType);

      console.log(`[AIReport] Report generated successfully: ${report.id}`);

      return {
        success: true,
        reportId: report.id,
        filePath: filePath,
        downloadUrl: `/api/ai-reports/${report.id}/download`
      };

    } catch (error) {
      console.error('[AIReport] Error generating report:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI content using the master prompt
   */
  async generateAIContent(portfolioData, reportType) {
    try {
      // Generate the master prompt with portfolio data
      const prompt = masterReportPrompt.generateMasterPrompt(portfolioData, reportType);
      const systemPrompt = masterReportPrompt.systemPrompt;

      console.log('[AIReport] Calling AI for comprehensive analysis...');

      const response = await unifiedAI.generateCompletion(prompt, {
        systemPrompt,
        maxTokens: 8000,
        temperature: 0.3
      });

      console.log(`[AIReport] AI response received from ${response.provider}`);

      // Parse the response into sections
      const sections = masterReportPrompt.parseReportResponse(response.content);

      return sections;
    } catch (error) {
      console.error('[AIReport] AI generation error:', error.message);

      // Return fallback content
      return {
        executive_summary: this.generateFallbackSummary(portfolioData),
        portfolio_overview: 'Portfolio overview generation in progress.',
        performance_analysis: 'Performance analysis will be available shortly.',
        risk_assessment: 'Risk assessment pending.',
        sector_analysis: 'Sector analysis pending.',
        holdings_analysis: 'Holdings analysis pending.',
        dividend_analysis: 'Dividend analysis pending.',
        recommendations: 'Recommendations will be generated.',
        market_outlook: 'Market outlook pending.',
        conclusion: 'Report conclusion pending.'
      };
    }
  }

  /**
   * Generate fallback summary when AI fails
   */
  generateFallbackSummary(data) {
    return `Portfolio Summary for ${data.name}

This portfolio has a total market value of $${(data.totalValue || 0).toLocaleString()} with ${data.holdings?.length || 0} individual positions.

Performance Overview:
- Total Return: ${data.totalGainPercent >= 0 ? '+' : ''}${(data.totalGainPercent || 0).toFixed(2)}%
- Total Gain/Loss: $${(data.totalGain || 0).toLocaleString()}
- Dividend Yield: ${(data.dividends?.yield || 0).toFixed(2)}%

The portfolio is allocated across ${Object.keys(data.sectorAllocation || {}).length} sectors, demonstrating ${data.holdings?.length > 10 ? 'good' : 'moderate'} diversification.`;
  }

  /**
   * Get portfolio data with calculated metrics
   */
  async getPortfolioData(userId, portfolioId) {
    try {
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: portfolioId, userId },
        include: { holdings: true }
      });

      if (!portfolio) {
        console.log('[AIReport] Portfolio not found');
        return null;
      }

      // Calculate metrics for each holding
      const holdings = portfolio.holdings.map(h => {
        const shares = parseFloat(h.shares) || 0;
        const avgCost = parseFloat(h.avgCostBasis) || 0;
        const currentPrice = parseFloat(h.currentPrice) || avgCost * 1.05; // Estimate if no price
        const costBasis = shares * avgCost;
        const marketValue = shares * currentPrice;
        const gain = marketValue - costBasis;
        const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        return {
          id: h.id,
          symbol: h.symbol,
          name: h.name || h.symbol,
          shares,
          avgCostBasis: avgCost,
          currentPrice,
          costBasis,
          marketValue,
          gain,
          gainPercent,
          sector: h.sector || 'Unknown',
          assetType: h.assetType || 'stock',
          dividendYield: parseFloat(h.dividendYield) || 0
        };
      });

      // Sort by market value (largest first)
      holdings.sort((a, b) => b.marketValue - a.marketValue);

      // Calculate portfolio totals
      const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
      const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
      const totalGain = totalValue - totalCostBasis;
      const totalGainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

      // Calculate sector allocation
      const sectorAllocation = {};
      holdings.forEach(h => {
        const sector = h.sector || 'Unknown';
        if (!sectorAllocation[sector]) {
          sectorAllocation[sector] = { value: 0, percentage: 0, holdings: [] };
        }
        sectorAllocation[sector].value += h.marketValue;
        sectorAllocation[sector].holdings.push(h.symbol);
      });

      // Calculate sector percentages
      Object.keys(sectorAllocation).forEach(sector => {
        sectorAllocation[sector].percentage = totalValue > 0
          ? (sectorAllocation[sector].value / totalValue) * 100
          : 0;
      });

      // Calculate dividend metrics
      const totalAnnualDividends = holdings.reduce((sum, h) => {
        return sum + (h.marketValue * (h.dividendYield / 100));
      }, 0);
      const portfolioYield = totalValue > 0 ? (totalAnnualDividends / totalValue) * 100 : 0;

      // Calculate risk metrics
      const riskMetrics = this.calculateRiskMetrics(holdings, totalValue);

      return {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        currency: portfolio.currency || 'USD',
        holdings,
        totalValue,
        totalCostBasis,
        totalGain,
        totalGainPercent,
        sectorAllocation,
        dividends: {
          annualIncome: totalAnnualDividends,
          yield: portfolioYield,
          monthlyIncome: totalAnnualDividends / 12,
          quarterlyIncome: totalAnnualDividends / 4
        },
        riskMetrics,
        metrics: {
          holdingsCount: holdings.length,
          sectorCount: Object.keys(sectorAllocation).length,
          averagePositionSize: totalValue / holdings.length || 0
        }
      };
    } catch (error) {
      console.error('[AIReport] Error getting portfolio data:', error.message);
      throw error;
    }
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(holdings, totalValue) {
    if (!holdings.length || !totalValue) {
      return {
        concentrationScore: 0,
        sectorScore: 0,
        diversificationScore: 100,
        volatilityScore: 50,
        betaScore: 50,
        drawdownScore: 40,
        liquidityScore: 70
      };
    }

    // Concentration risk (largest position)
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

    // Diversification score
    const diversificationScore = Math.max(0, 100 - concentrationScore);

    // Herfindahl-Hirschman Index based volatility estimate
    const hhi = holdings.reduce((sum, h) => {
      const weight = h.marketValue / totalValue;
      return sum + (weight * weight);
    }, 0);
    const volatilityScore = Math.min(100, hhi * 10000);

    return {
      concentrationScore,
      sectorScore,
      diversificationScore,
      volatilityScore,
      betaScore: 50 + (Math.random() * 20 - 10), // Placeholder
      drawdownScore: 30 + (Math.random() * 30), // Placeholder
      liquidityScore: 70 + (Math.random() * 20)  // Placeholder
    };
  }

  /**
   * Save report record
   */
  async saveReportRecord(userId, portfolioId, filePath, reportType) {
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
      this.reportsCache.set(report.id, report);
      return report;
    } catch (error) {
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
    // Check cache first
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
          const timestamp = reportId.replace('report_', '');
          if (file.includes(timestamp.substring(0, 10))) {
            const report = {
              id: reportId,
              filePath,
              status: 'completed'
            };
            this.reportsCache.set(reportId, report);
            return report;
          }
        }
      }

      // If still not found, return the most recent report
      const pdfFiles = files.filter(f => f.endsWith('.pdf'))
        .map(f => ({
          name: f,
          path: path.join(this.reportsDir, f),
          mtime: fs.statSync(path.join(this.reportsDir, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (pdfFiles.length > 0) {
        return {
          id: reportId,
          filePath: pdfFiles[0].path,
          status: 'completed'
        };
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

    try {
      reports = await prisma.aIReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
    } catch (error) {
      console.log('[AIReport] Database history lookup failed:', error.message);
    }

    // Add reports from cache
    for (const [id, report] of this.reportsCache.entries()) {
      if (report.userId === userId && !reports.some(r => r.id === id)) {
        reports.push(report);
      }
    }

    return reports
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Delete a report
   */
  async deleteReport(userId, reportId) {
    try {
      const report = this.reportsCache.get(reportId);

      if (report && report.filePath && fs.existsSync(report.filePath)) {
        fs.unlinkSync(report.filePath);
      }

      this.reportsCache.delete(reportId);

      try {
        await prisma.aIReport.delete({
          where: { id: reportId }
        });
      } catch (e) {
        // Ignore if not in database
      }

      return { success: true };
    } catch (error) {
      console.error('[AIReport] Delete error:', error.message);
      throw error;
    }
  }
}

module.exports = new AIReportService();
