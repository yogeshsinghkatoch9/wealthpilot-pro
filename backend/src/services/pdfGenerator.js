/**
 * PDF Report Generator Service
 * Generates portfolio reports, performance reports, and tax reports
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../db/simpleDb');

const logger = require('../utils/logger');

// Check if we're in PostgreSQL mode (Railway) - skip canvas entirely
const isPostgresMode = process.env.DATABASE_TYPE === 'postgresql' ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres'));

class PDFGeneratorService {
  constructor() {
    this.chartJSNodeCanvas = null;

    // Skip canvas on Railway/PostgreSQL environments (native module issues)
    if (isPostgresMode) {
      logger.info('PDF charts disabled in PostgreSQL mode (native canvas not available)');
      return;
    }

    // Try to load chartjs-node-canvas only in local/SQLite mode
    try {
      const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
      this.chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: 800,
        height: 400,
        backgroundColour: 'white'
      });
      logger.info('ChartJS canvas initialized successfully');
    } catch (error) {
      logger.warn('ChartJS canvas not available - PDF charts will be disabled');
    }
  }

  /**
   * Generate Portfolio Summary Report
   */
  async generatePortfolioReport(userId, portfolioId, options = {}) {
    const portfolio = await prisma.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: {
        holdings: true,
        transactions: {
          orderBy: { executedAt: 'desc' },
          take: 20
        }
      }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    // Calculate portfolio metrics
    const metrics = await this.calculatePortfolioMetrics(portfolio);

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      // Add content
      this.addHeader(doc, 'Portfolio Summary Report');
      this.addPortfolioOverview(doc, portfolio, metrics);
      this.addHoldingsTable(doc, portfolio.holdings, metrics);
      this.addRecentTransactions(doc, portfolio.transactions);
      this.addFooter(doc);

      doc.end();
    });
  }

  /**
   * Generate Performance Report
   */
  async generatePerformanceReport(userId, portfolioId, period = '1Y') {
    const portfolio = await prisma.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: {
        holdings: true,
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 365 // Last year of snapshots
        }
      }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const performanceData = await this.calculatePerformanceMetrics(portfolio, period);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    return new Promise(async (resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      // Add content
      this.addHeader(doc, 'Performance Report');
      this.addPerformanceOverview(doc, portfolio, performanceData);

      // Add performance chart
      const chartBuffer = await this.generatePerformanceChart(performanceData);
      if (chartBuffer) {
        doc.image(chartBuffer, 50, doc.y, { width: 500 });
        doc.moveDown(2);
      }

      this.addPerformanceMetrics(doc, performanceData);
      this.addFooter(doc);

      doc.end();
    });
  }

  /**
   * Generate Tax Report
   */
  async generateTaxReport(userId, portfolioId, year) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const transactions = await prisma.transactions.findMany({
      where: {
        userId,
        portfolioId,
        type: { in: ['BUY', 'SELL'] },
        executedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { executedAt: 'asc' }
    });

    const taxData = this.calculateTaxData(transactions, year);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      this.addHeader(doc, `Tax Report - ${year}`);
      this.addTaxSummary(doc, taxData);
      this.addCapitalGainsTable(doc, taxData.capitalGains);
      this.addFooter(doc);

      doc.end();
    });
  }

  /**
   * Generate Client Report
   */
  async generateClientReport(userId, portfolioId, options = {}) {
    const portfolio = await prisma.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: {
        holdings: true,
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 90
        }
      }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const metrics = await this.calculatePortfolioMetrics(portfolio);
    const performanceData = await this.calculatePerformanceMetrics(portfolio, '3M');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    return new Promise(async (resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      this.addHeader(doc, 'Client Portfolio Report', true);
      this.addExecutiveSummary(doc, portfolio, metrics, performanceData);

      // Add chart
      const chartBuffer = await this.generateAllocationChart(portfolio.holdings);
      if (chartBuffer) {
        doc.image(chartBuffer, 50, doc.y, { width: 500 });
        doc.moveDown(2);
      }

      this.addTopHoldings(doc, portfolio.holdings, metrics);
      this.addFooter(doc);

      doc.end();
    });
  }

  // ============================================
  // PDF CONTENT BUILDERS
  // ============================================

  addHeader(doc, title, isClientReport = false) {
    doc.fontSize(24)
      .fillColor('#f59e0b')
      .text(title, 50, 50, { align: 'center' });

    doc.fontSize(10)
      .fillColor('#666')
      .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });

    if (isClientReport) {
      doc.fontSize(12)
        .fillColor('#333')
        .text('WealthPilot Pro', { align: 'center' });
    }

    doc.moveDown(2);
  }

  addPortfolioOverview(doc, portfolio, metrics) {
    doc.fontSize(16)
      .fillColor('#333')
      .text('Portfolio Overview', 50, doc.y);

    doc.moveDown();

    doc.fontSize(12)
      .fillColor('#666')
      .text(`Portfolio Name: ${portfolio.name}`)
      .text(`Currency: ${portfolio.currency}`)
      .text(`Benchmark: ${portfolio.benchmark}`)
      .text(`Total Value: ${this.formatCurrency(metrics.totalValue)}`)
      .text(`Total Gain/Loss: ${this.formatCurrency(metrics.totalGain)} (${metrics.totalGainPct.toFixed(2)}%)`)
      .text(`Number of Holdings: ${metrics.holdingsCount}`)
      .text(`Cash Balance: ${this.formatCurrency(portfolio.cashBalance)}`);

    doc.moveDown(2);
  }

  addHoldingsTable(doc, holdings, metrics) {
    doc.fontSize(14)
      .fillColor('#333')
      .text('Current Holdings', 50, doc.y);

    doc.moveDown();

    const tableTop = doc.y;
    const symbolX = 50;
    const sharesX = 150;
    const priceX = 250;
    const valueX = 350;
    const gainX = 450;

    // Table headers
    doc.fontSize(10)
      .fillColor('#999')
      .text('Symbol', symbolX, tableTop)
      .text('Shares', sharesX, tableTop)
      .text('Price', priceX, tableTop)
      .text('Value', valueX, tableTop)
      .text('Gain/Loss', gainX, tableTop);

    doc.moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke('#ddd');

    let y = tableTop + 25;

    holdings.slice(0, 15).forEach(holding => {
      const shares = Number(holding.shares);
      const costBasis = Number(holding.avgCostBasis);
      const currentPrice = metrics.prices[holding.symbol] || costBasis;
      const value = shares * currentPrice;
      const gain = shares * (currentPrice - costBasis);
      const gainPct = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0;

      doc.fontSize(9)
        .fillColor('#333')
        .text(holding.symbol, symbolX, y)
        .text(shares.toFixed(2), sharesX, y)
        .text(this.formatCurrency(currentPrice), priceX, y)
        .text(this.formatCurrency(value), valueX, y)
        .fillColor(gain >= 0 ? '#10b981' : '#ef4444')
        .text(`${this.formatCurrency(gain)} (${gainPct.toFixed(1)}%)`, gainX, y);

      y += 20;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown(3);
  }

  addRecentTransactions(doc, transactions) {
    if (doc.y > 600) {
      doc.addPage();
    }

    doc.fontSize(14)
      .fillColor('#333')
      .text('Recent Transactions', 50, doc.y);

    doc.moveDown();

    const tableTop = doc.y;
    transactions.slice(0, 10).forEach((txn, index) => {
      const y = tableTop + (index * 25);

      doc.fontSize(9)
        .fillColor('#666')
        .text(new Date(txn.executedAt).toLocaleDateString(), 50, y)
        .text(txn.type, 130, y)
        .text(txn.symbol, 200, y)
        .text(txn.shares ? `${Number(txn.shares).toFixed(2)} shares` : '-', 270, y)
        .text(this.formatCurrency(Number(txn.amount)), 400, y);
    });

    doc.moveDown(2);
  }

  addPerformanceOverview(doc, portfolio, performanceData) {
    doc.fontSize(16)
      .fillColor('#333')
      .text('Performance Summary', 50, doc.y);

    doc.moveDown();

    doc.fontSize(12)
      .fillColor('#666')
      .text(`Period Return: ${performanceData.totalReturn.toFixed(2)}%`)
      .text(`Annualized Return: ${performanceData.annualizedReturn.toFixed(2)}%`)
      .text(`Volatility: ${performanceData.volatility.toFixed(2)}%`)
      .text(`Sharpe Ratio: ${performanceData.sharpeRatio.toFixed(2)}`)
      .text(`Max Drawdown: ${performanceData.maxDrawdown.toFixed(2)}%`)
      .text(`Best Day: ${performanceData.bestDay.toFixed(2)}%`)
      .text(`Worst Day: ${performanceData.worstDay.toFixed(2)}%`);

    doc.moveDown(2);
  }

  addPerformanceMetrics(doc, performanceData) {
    doc.fontSize(14)
      .fillColor('#333')
      .text('Key Metrics', 50, doc.y);

    doc.moveDown();

    const metrics = [
      { label: 'Total Return', value: `${performanceData.totalReturn.toFixed(2)}%` },
      { label: 'Alpha', value: performanceData.alpha.toFixed(2) },
      { label: 'Beta', value: performanceData.beta.toFixed(2) },
      { label: 'Win Rate', value: `${performanceData.winRate.toFixed(1)}%` }
    ];

    metrics.forEach(metric => {
      doc.fontSize(11)
        .fillColor('#666')
        .text(`${metric.label}: `, 50, doc.y, { continued: true })
        .fillColor('#333')
        .text(metric.value);
    });

    doc.moveDown();
  }

  addTaxSummary(doc, taxData) {
    doc.fontSize(16)
      .fillColor('#333')
      .text('Tax Summary', 50, doc.y);

    doc.moveDown();

    doc.fontSize(12)
      .fillColor('#666')
      .text(`Total Short-Term Gains: ${this.formatCurrency(taxData.shortTermGains)}`)
      .text(`Total Long-Term Gains: ${this.formatCurrency(taxData.longTermGains)}`)
      .text(`Total Capital Gains: ${this.formatCurrency(taxData.totalGains)}`)
      .text(`Wash Sales: ${this.formatCurrency(taxData.washSales)}`);

    doc.moveDown(2);
  }

  addCapitalGainsTable(doc, capitalGains) {
    doc.fontSize(14)
      .fillColor('#333')
      .text('Realized Capital Gains', 50, doc.y);

    doc.moveDown();

    const tableTop = doc.y;

    doc.fontSize(10)
      .fillColor('#999')
      .text('Date', 50, tableTop)
      .text('Symbol', 130, tableTop)
      .text('Type', 210, tableTop)
      .text('Proceeds', 290, tableTop)
      .text('Cost Basis', 380, tableTop)
      .text('Gain/Loss', 470, tableTop);

    doc.moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke('#ddd');

    let y = tableTop + 25;

    capitalGains.forEach(gain => {
      doc.fontSize(9)
        .fillColor('#333')
        .text(gain.date, 50, y)
        .text(gain.symbol, 130, y)
        .text(gain.type, 210, y)
        .text(this.formatCurrency(gain.proceeds), 290, y)
        .text(this.formatCurrency(gain.costBasis), 380, y)
        .fillColor(gain.gainLoss >= 0 ? '#10b981' : '#ef4444')
        .text(this.formatCurrency(gain.gainLoss), 470, y);

      y += 20;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown();
  }

  addExecutiveSummary(doc, portfolio, metrics, performanceData) {
    doc.fontSize(16)
      .fillColor('#333')
      .text('Executive Summary', 50, doc.y);

    doc.moveDown();

    doc.fontSize(12)
      .fillColor('#666')
      .text(`Portfolio: ${portfolio.name}`)
      .text(`Current Value: ${this.formatCurrency(metrics.totalValue)}`)
      .text(`3-Month Return: ${performanceData.totalReturn.toFixed(2)}%`)
      .text(`Number of Positions: ${metrics.holdingsCount}`)
      .text(`Largest Position: ${metrics.largestPosition.symbol} (${metrics.largestPosition.pct.toFixed(1)}%)`);

    doc.moveDown(2);
  }

  addTopHoldings(doc, holdings, metrics) {
    doc.fontSize(14)
      .fillColor('#333')
      .text('Top 10 Holdings', 50, doc.y);

    doc.moveDown();

    const sortedHoldings = holdings
      .map(h => ({
        ...h,
        value: Number(h.shares) * (metrics.prices[h.symbol] || Number(h.avgCostBasis))
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    sortedHoldings.forEach((holding, index) => {
      const pct = (holding.value / metrics.totalValue) * 100;

      doc.fontSize(11)
        .fillColor('#333')
        .text(`${index + 1}. ${holding.symbol}`, 50, doc.y, { continued: true })
        .fillColor('#666')
        .text(` - ${this.formatCurrency(holding.value)} (${pct.toFixed(1)}%)`);
    });

    doc.moveDown();
  }

  addFooter(doc) {
    const pages = doc.bufferedPageRange();

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      doc.fontSize(8)
        .fillColor('#999')
        .text(
          `Page ${i + 1} of ${pages.count} | WealthPilot Pro | This report is for informational purposes only`,
          50,
          doc.page.height - 30,
          { align: 'center' }
        );
    }
  }

  // ============================================
  // CHART GENERATORS
  // ============================================

  async generatePerformanceChart(performanceData) {
    try {
      const configuration = {
        type: 'line',
        data: {
          labels: performanceData.dates,
          datasets: [{
            label: 'Portfolio Value',
            data: performanceData.values,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: 'Performance Over Time' }
          },
          scales: {
            y: { beginAtZero: false }
          }
        }
      };

      return await this.chartJSNodeCanvas.renderToBuffer(configuration);
    } catch (error) {
      logger.error('Error generating performance chart:', error);
      return null;
    }
  }

  async generateAllocationChart(holdings) {
    try {
      const labels = holdings.slice(0, 10).map(h => h.symbol);
      const data = holdings.slice(0, 10).map(h => Number(h.shares) * Number(h.avgCostBasis));

      const configuration = {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [
              '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6',
              '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
            ]
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true, position: 'right' },
            title: { display: true, text: 'Portfolio Allocation' }
          }
        }
      };

      return await this.chartJSNodeCanvas.renderToBuffer(configuration);
    } catch (error) {
      logger.error('Error generating allocation chart:', error);
      return null;
    }
  }

  // ============================================
  // CALCULATION HELPERS
  // ============================================

  async calculatePortfolioMetrics(portfolio) {
    // Simplified metrics calculation
    let totalValue = Number(portfolio.cashBalance);
    let totalCost = 0;
    const prices = {};

    // In a real implementation, fetch current prices from market data service
    portfolio.holdings.forEach(holding => {
      const shares = Number(holding.shares);
      const costBasis = Number(holding.avgCostBasis);
      prices[holding.symbol] = costBasis; // Use cost basis as current price for now

      totalValue += shares * costBasis;
      totalCost += shares * costBasis;
    });

    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    const sortedHoldings = portfolio.holdings
      .map(h => ({
        symbol: h.symbol,
        value: Number(h.shares) * prices[h.symbol],
        pct: 0
      }))
      .sort((a, b) => b.value - a.value);

    sortedHoldings.forEach(h => {
      h.pct = (h.value / totalValue) * 100;
    });

    return {
      totalValue,
      totalGain,
      totalGainPct,
      holdingsCount: portfolio.holdings.length,
      prices,
      largestPosition: sortedHoldings[0] || { symbol: 'N/A', pct: 0 }
    };
  }

  async calculatePerformanceMetrics(portfolio, period) {
    // Simplified performance calculation
    const snapshots = portfolio.snapshots || [];

    if (snapshots.length < 2) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        bestDay: 0,
        worstDay: 0,
        alpha: 0,
        beta: 1,
        winRate: 0,
        dates: [],
        values: []
      };
    }

    const values = snapshots.map(s => s.totalValue).reverse();
    const dates = snapshots.map(s => new Date(s.snapshotDate).toLocaleDateString()).reverse();

    const returns = [];
    for (let i = 1; i < values.length; i++) {
      returns.push(((values[i] - values[i - 1]) / values[i - 1]) * 100);
    }

    const totalReturn = ((values[values.length - 1] - values[0]) / values[0]) * 100;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    const maxDrawdown = this.calculateMaxDrawdown(values);
    const bestDay = Math.max(...returns);
    const worstDay = Math.min(...returns);
    const winRate = (returns.filter(r => r > 0).length / returns.length) * 100;

    return {
      totalReturn,
      annualizedReturn: totalReturn, // Simplified
      volatility,
      sharpeRatio: volatility > 0 ? (avgReturn * 252) / volatility : 0,
      maxDrawdown,
      bestDay,
      worstDay,
      alpha: 0, // Placeholder
      beta: 1, // Placeholder
      winRate,
      dates,
      values
    };
  }

  calculateMaxDrawdown(values) {
    let maxDrawdown = 0;
    let peak = values[0];

    for (let i = 1; i < values.length; i++) {
      if (values[i] > peak) {
        peak = values[i];
      }
      const drawdown = ((peak - values[i]) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  calculateTaxData(transactions, year) {
    const sells = transactions.filter(t => t.type === 'SELL');
    const buys = transactions.filter(t => t.type === 'BUY');

    const capitalGains = [];
    let shortTermGains = 0;
    let longTermGains = 0;

    sells.forEach(sell => {
      // Find matching buy (FIFO)
      const matchingBuy = buys.find(b => b.symbol === sell.symbol && b.executedAt < sell.executedAt);

      if (matchingBuy) {
        const proceeds = Number(sell.amount);
        const costBasis = Number(matchingBuy.amount);
        const gainLoss = proceeds - costBasis;

        const buyDate = new Date(matchingBuy.executedAt);
        const sellDate = new Date(sell.executedAt);
        const daysDiff = (sellDate - buyDate) / (1000 * 60 * 60 * 24);
        const type = daysDiff > 365 ? 'Long-Term' : 'Short-Term';

        if (type === 'Short-Term') {
          shortTermGains += gainLoss;
        } else {
          longTermGains += gainLoss;
        }

        capitalGains.push({
          date: sell.executedAt,
          symbol: sell.symbol,
          type,
          proceeds,
          costBasis,
          gainLoss
        });
      }
    });

    return {
      shortTermGains,
      longTermGains,
      totalGains: shortTermGains + longTermGains,
      washSales: 0, // Placeholder
      capitalGains
    };
  }

  formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }
}

module.exports = new PDFGeneratorService();
