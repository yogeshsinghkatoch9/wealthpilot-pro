/**
 * Excel Exporter - Export live data to Excel files
 * Allows user to see real-time data and modify calculations
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class ExcelExporter {
  constructor() {
    this.outputDir = path.join(__dirname, '../../exports/output');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Export Market Dashboard Data to Excel
   */
  async exportMarketDashboard(dashboardData) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WealthPilot Pro';
    workbook.created = new Date();

    // Sheet 1: Summary
    const summarySheet = workbook.addWorksheet('Summary');
    this.formatSummarySheet(summarySheet, dashboardData);

    // Sheet 2: Market Breadth
    if (dashboardData.components.marketBreadth?.data?.data) {
      const breadthSheet = workbook.addWorksheet('Market Breadth');
      this.formatMarketBreadthSheet(breadthSheet, dashboardData.components.marketBreadth.data.data);
    }

    // Sheet 3: Market Sentiment
    if (dashboardData.components.marketSentiment?.data?.data) {
      const sentimentSheet = workbook.addWorksheet('Market Sentiment');
      this.formatSentimentSheet(sentimentSheet, dashboardData.components.marketSentiment.data.data);
    }

    // Sheet 4: Sector Analysis
    if (dashboardData.components.sectorAnalysis?.data?.data) {
      const sectorSheet = workbook.addWorksheet('Sector Analysis');
      this.formatSectorSheet(sectorSheet, dashboardData.components.sectorAnalysis.data.data);
    }

    // Sheet 5: Sector Heatmap
    if (dashboardData.components.sectorHeatmap?.data?.data) {
      const heatmapSheet = workbook.addWorksheet('Sector Heatmap');
      this.formatSectorHeatmapSheet(heatmapSheet, dashboardData.components.sectorHeatmap.data.data);
    }

    // Sheet 6: Calculations & Formulas
    const calcSheet = workbook.addWorksheet('Calculations');
    this.formatCalculationsSheet(calcSheet);

    const filename = `market_dashboard_${new Date().toISOString().split('T')[0]}_${Date.now()}.xlsx`;
    const filepath = path.join(this.outputDir, filename);

    await workbook.xlsx.writeFile(filepath);
    return { filename, filepath };
  }

  /**
   * Format Summary Sheet
   */
  formatSummarySheet(sheet, data) {
    // Header
    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = '🔥 UNIFIED MARKET DASHBOARD - LIVE DATA';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFf59e0b' } };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0d1117' }
    };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Metadata
    sheet.getCell('A3').value = 'Generated:';
    sheet.getCell('B3').value = new Date().toLocaleString();
    sheet.getCell('A4').value = 'Timestamp:';
    sheet.getCell('B4').value = data.timestamp;
    sheet.getCell('A5').value = 'Components Online:';
    sheet.getCell('B5').value = `${data.summary.online}/${data.summary.total}`;
    sheet.getCell('B5').font = { bold: true, color: { argb: data.summary.online === data.summary.total ? 'FF10b981' : 'FFef4444' } };

    // Component Status Table
    sheet.getCell('A7').value = 'Component';
    sheet.getCell('B7').value = 'Status';
    sheet.getCell('C7').value = 'Data Available';
    sheet.getCell('D7').value = 'Last Updated';

    let row = 8;
    const componentNames = [
      'Market Breadth', 'Market Sentiment', 'Sector Analysis', 'Sector Rotation',
      'Sector Heatmap', 'ETF Analyzer', 'Economic Calendar', 'Earnings Calendar',
      'Dividend Calendar', 'IPO Tracker', 'SPAC Tracker'
    ];

    Object.keys(data.components).forEach((key, index) => {
      const comp = data.components[key];
      sheet.getCell(`A${row}`).value = componentNames[index] || key;
      sheet.getCell(`B${row}`).value = comp.status.toUpperCase();
      sheet.getCell(`B${row}`).font = { color: { argb: comp.status === 'online' ? 'FF10b981' : 'FFef4444' } };
      sheet.getCell(`C${row}`).value = comp.status === 'online' ? 'Yes' : 'No';
      sheet.getCell(`D${row}`).value = new Date().toLocaleString();
      row++;
    });

    // Style the header row
    sheet.getRow(7).font = { bold: true };
    sheet.getRow(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF30363d' }
    };

    // Auto-fit columns
    sheet.columns.forEach(column => {
      column.width = 25;
    });
  }

  /**
   * Format Market Breadth Sheet
   */
  formatMarketBreadthSheet(sheet, data) {
    sheet.getCell('A1').value = 'MARKET BREADTH & INTERNALS';
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = 'Index Symbol:';
    sheet.getCell('B3').value = data.indexSymbol;
    sheet.getCell('A4').value = 'Health Score:';
    sheet.getCell('B4').value = data.healthScore;
    sheet.getCell('A5').value = 'Signal:';
    sheet.getCell('B5').value = data.overallSignal;
    sheet.getCell('B5').font = { bold: true, color: { argb: data.overallSignal === 'BULLISH' ? 'FF10b981' : 'FFef4444' } };

    // Advance/Decline
    sheet.getCell('A7').value = 'ADVANCE/DECLINE INDICATORS';
    sheet.getCell('A7').font = { bold: true };
    sheet.getCell('A8').value = 'Advancing:';
    sheet.getCell('B8').value = data.indicators.advanceDecline.advancing;
    sheet.getCell('A9').value = 'Declining:';
    sheet.getCell('B9').value = data.indicators.advanceDecline.declining;
    sheet.getCell('A10').value = 'A/D Line:';
    sheet.getCell('B10').value = data.indicators.advanceDecline.currentADLine;

    // Moving Average Breadth
    sheet.getCell('A12').value = 'MOVING AVERAGE BREADTH';
    sheet.getCell('A12').font = { bold: true };
    sheet.getCell('A13').value = 'Above 50 MA:';
    sheet.getCell('B13').value = `${data.indicators.maBreath.ma50.aboveMA}/${data.indicators.maBreath.ma50.total}`;
    sheet.getCell('C13').value = `${data.indicators.maBreath.ma50.percentage.toFixed(1)}%`;
    sheet.getCell('A14').value = 'Above 200 MA:';
    sheet.getCell('B14').value = `${data.indicators.maBreath.ma200.aboveMA}/${data.indicators.maBreath.ma200.total}`;
    sheet.getCell('C14').value = `${data.indicators.maBreath.ma200.percentage.toFixed(1)}%`;

    sheet.columns.forEach(column => {
      column.width = 20;
    });
  }

  /**
   * Format Sentiment Sheet
   */
  formatSentimentSheet(sheet, data) {
    sheet.getCell('A1').value = 'MARKET SENTIMENT ANALYSIS';
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = 'Symbol:';
    sheet.getCell('B3').value = data.symbol;
    sheet.getCell('A4').value = 'Overall Score:';
    sheet.getCell('B4').value = data.overall.score.toFixed(2);
    sheet.getCell('A5').value = 'Sentiment:';
    sheet.getCell('B5').value = data.overall.sentiment;
    sheet.getCell('A6').value = 'Trend:';
    sheet.getCell('B6').value = data.overall.trend;

    // News Articles
    if (data.sources?.news?.articles?.length > 0) {
      sheet.getCell('A8').value = 'NEWS ARTICLES';
      sheet.getCell('A8').font = { bold: true };

      sheet.getCell('A9').value = 'Title';
      sheet.getCell('B9').value = 'Source';
      sheet.getCell('C9').value = 'Sentiment';
      sheet.getCell('D9').value = 'Score';
      sheet.getRow(9).font = { bold: true };

      let row = 10;
      data.sources.news.articles.slice(0, 20).forEach(article => {
        sheet.getCell(`A${row}`).value = article.title;
        sheet.getCell(`B${row}`).value = article.source;
        sheet.getCell(`C${row}`).value = article.sentiment;
        sheet.getCell(`D${row}`).value = article.sentimentScore;
        row++;
      });
    }

    sheet.getColumn('A').width = 50;
    sheet.getColumn('B').width = 20;
    sheet.getColumn('C').width = 15;
    sheet.getColumn('D').width = 10;
  }

  /**
   * Format Sector Analysis Sheet
   */
  formatSectorSheet(sheet, data) {
    sheet.getCell('A1').value = 'SECTOR ANALYSIS';
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = 'Sector';
    sheet.getCell('B3').value = 'Performance %';
    sheet.getCell('C3').value = 'Volume';
    sheet.getCell('D3').value = 'Status';
    sheet.getRow(3).font = { bold: true };

    let row = 4;
    if (data.sectors && Array.isArray(data.sectors)) {
      data.sectors.forEach(sector => {
        sheet.getCell(`A${row}`).value = sector.name;
        sheet.getCell(`B${row}`).value = sector.performance;
        sheet.getCell(`C${row}`).value = sector.volume;
        sheet.getCell(`D${row}`).value = sector.status || 'Active';
        row++;
      });
    }

    sheet.columns.forEach(column => {
      column.width = 20;
    });
  }

  /**
   * Format Sector Heatmap Sheet
   */
  formatSectorHeatmapSheet(sheet, data) {
    sheet.getCell('A1').value = 'SECTOR HEATMAP - LIVE DATA';
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = 'Sector';
    sheet.getCell('B3').value = 'Symbol';
    sheet.getCell('C3').value = 'Price';
    sheet.getCell('D3').value = 'Day Change %';
    sheet.getCell('E3').value = 'Week Change %';
    sheet.getCell('F3').value = 'Month Change %';
    sheet.getCell('G3').value = 'YTD Change %';
    sheet.getRow(3).font = { bold: true };

    let row = 4;
    if (data.sectors && Array.isArray(data.sectors)) {
      data.sectors.forEach(sector => {
        sheet.getCell(`A${row}`).value = sector.name;
        sheet.getCell(`B${row}`).value = sector.symbol;
        sheet.getCell(`C${row}`).value = sector.price;
        sheet.getCell(`D${row}`).value = sector.dayChange;
        sheet.getCell(`E${row}`).value = sector.weekChange;
        sheet.getCell(`F${row}`).value = sector.monthChange;
        sheet.getCell(`G${row}`).value = sector.ytdChange;

        // Color code based on performance
        ['D', 'E', 'F', 'G'].forEach(col => {
          const val = sheet.getCell(`${col}${row}`).value;
          if (val > 0) {
            sheet.getCell(`${col}${row}`).font = { color: { argb: 'FF10b981' } };
          } else if (val < 0) {
            sheet.getCell(`${col}${row}`).font = { color: { argb: 'FFef4444' } };
          }
        });

        row++;
      });
    }

    sheet.columns.forEach(column => {
      column.width = 18;
    });
  }

  /**
   * Format Calculations Sheet with Formulas
   */
  formatCalculationsSheet(sheet) {
    sheet.getCell('A1').value = 'CALCULATION FORMULAS & METHODS';
    sheet.getCell('A1').font = { size: 14, bold: true };

    const formulas = [
      { metric: 'Health Score', formula: '(Advancing / (Advancing + Declining)) * 100' },
      { metric: 'Sentiment Score', formula: 'Weighted average of news sentiment (0-100)' },
      { metric: 'A/D Line', formula: 'Cumulative (Advancing - Declining)' },
      { metric: 'MA Breadth %', formula: '(Stocks Above MA / Total Stocks) * 100' },
      { metric: 'Sector Performance', formula: '((Current Price - Previous Price) / Previous Price) * 100' },
      { metric: 'Risk-Adjusted Return', formula: 'Portfolio Return / Portfolio Volatility' },
      { metric: 'Sharpe Ratio', formula: '(Portfolio Return - Risk-Free Rate) / Portfolio Std Dev' },
      { metric: 'Beta', formula: 'Covariance(Portfolio, Market) / Variance(Market)' },
      { metric: 'Alpha', formula: 'Portfolio Return - (Risk-Free Rate + Beta * (Market Return - Risk-Free Rate))' },
      { metric: 'Maximum Drawdown', formula: 'Max((Peak - Trough) / Peak)' }
    ];

    sheet.getCell('A3').value = 'Metric';
    sheet.getCell('B3').value = 'Formula / Calculation Method';
    sheet.getRow(3).font = { bold: true };

    let row = 4;
    formulas.forEach(formula => {
      sheet.getCell(`A${row}`).value = formula.metric;
      sheet.getCell(`B${row}`).value = formula.formula;
      row++;
    });

    sheet.getCell('A' + (row + 1)).value = 'Data Sources:';
    sheet.getCell('A' + (row + 1)).font = { bold: true };
    sheet.getCell('A' + (row + 2)).value = '• Yahoo Finance - Real-time stock prices';
    sheet.getCell('A' + (row + 3)).value = '• Alpha Vantage - News sentiment analysis';
    sheet.getCell('A' + (row + 4)).value = '• Finnhub - Earnings, dividends, IPO data';
    sheet.getCell('A' + (row + 5)).value = '• FMP - Financial metrics and fundamentals';

    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 60;
  }

  /**
   * Export Portfolio Data
   */
  async exportPortfolio(portfolioData) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WealthPilot Pro';

    const sheet = workbook.addWorksheet('Portfolio');

    sheet.getCell('A1').value = 'PORTFOLIO: ' + (portfolioData.name || 'Untitled');
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = 'Holdings';
    sheet.getCell('A3').font = { bold: true };

    sheet.getCell('A4').value = 'Symbol';
    sheet.getCell('B4').value = 'Shares';
    sheet.getCell('C4').value = 'Avg Cost';
    sheet.getCell('D4').value = 'Current Price';
    sheet.getCell('E4').value = 'Market Value';
    sheet.getCell('F4').value = 'Total Gain/Loss';
    sheet.getCell('G4').value = 'Gain/Loss %';
    sheet.getRow(4).font = { bold: true };

    let row = 5;
    if (portfolioData.holdings) {
      portfolioData.holdings.forEach(holding => {
        sheet.getCell(`A${row}`).value = holding.symbol;
        sheet.getCell(`B${row}`).value = holding.shares;
        sheet.getCell(`C${row}`).value = holding.avg_cost;
        sheet.getCell(`D${row}`).value = holding.current_price;
        sheet.getCell(`E${row}`).value = holding.shares * holding.current_price;
        sheet.getCell(`F${row}`).value = (holding.current_price - holding.avg_cost) * holding.shares;
        sheet.getCell(`G${row}`).value = ((holding.current_price - holding.avg_cost) / holding.avg_cost) * 100;
        row++;
      });
    }

    sheet.columns.forEach(column => {
      column.width = 15;
    });

    const filename = `portfolio_${portfolioData.name || 'export'}_${Date.now()}.xlsx`;
    const filepath = path.join(this.outputDir, filename);

    await workbook.xlsx.writeFile(filepath);
    return { filename, filepath };
  }
}

module.exports = ExcelExporter;
