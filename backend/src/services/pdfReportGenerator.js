/**
 * Professional PDF Report Generator
 * Creates institutional-quality portfolio reports with charts and tables
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFReportGenerator {
  constructor() {
    this.colors = {
      primary: '#1E3A8A',      // Dark blue
      secondary: '#3B82F6',    // Blue
      success: '#059669',      // Green
      danger: '#DC2626',       // Red
      warning: '#F59E0B',      // Amber
      text: '#1F2937',         // Dark gray
      textLight: '#6B7280',    // Medium gray
      border: '#E5E7EB',       // Light gray
      background: '#F9FAFB',   // Very light gray
      white: '#FFFFFF'
    };

    this.fonts = {
      regular: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique'
    };
  }

  /**
   * Generate complete PDF report
   */
  async generateReport(portfolioData, aiContent, charts, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          info: {
            Title: `${portfolioData.name} - Portfolio Analysis Report`,
            Author: 'WealthPilot Pro',
            Subject: 'Investment Portfolio Analysis',
            Creator: 'WealthPilot AI Engine',
            Producer: 'WealthPilot Pro v4.0'
          },
          bufferPages: true
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Page 1: Cover
        this.renderCoverPage(doc, portfolioData);

        // Page 2: Table of Contents
        doc.addPage();
        this.renderTableOfContents(doc);

        // Page 3: Executive Summary
        doc.addPage();
        this.renderSection(doc, 'Executive Summary', aiContent.executive_summary || aiContent.executiveSummary || this.generateExecutiveSummary(portfolioData));

        // Page 4: Portfolio Overview with Key Metrics
        doc.addPage();
        this.renderPortfolioOverview(doc, portfolioData);

        // Page 5: Holdings Table
        doc.addPage();
        this.renderHoldingsTable(doc, portfolioData.holdings);

        // Page 6: Allocation Chart
        if (charts.allocation) {
          doc.addPage();
          this.renderChartPage(doc, 'Asset Allocation', charts.allocation, portfolioData.sectorAllocation);
        }

        // Page 7: Performance Analysis
        doc.addPage();
        this.renderSection(doc, 'Performance Analysis', aiContent.performance_analysis || aiContent.performanceAnalysis || this.generatePerformanceContent(portfolioData));
        if (charts.gainLoss) {
          this.renderChart(doc, charts.gainLoss, 400);
        }

        // Page 8: Risk Assessment
        doc.addPage();
        this.renderSection(doc, 'Risk Assessment', aiContent.risk_assessment || aiContent.riskAssessment || this.generateRiskContent(portfolioData));
        if (charts.risk) {
          this.renderChart(doc, charts.risk, 350);
        }

        // Page 9: Sector Analysis
        doc.addPage();
        this.renderSection(doc, 'Sector Analysis', aiContent.sector_analysis || aiContent.sectorAnalysis || this.generateSectorContent(portfolioData));
        if (charts.sectors) {
          this.renderChart(doc, charts.sectors, 400);
        }

        // Page 10: Holdings Analysis
        doc.addPage();
        this.renderSection(doc, 'Holdings Analysis', aiContent.individual_holdings_analysis || aiContent.holdingsAnalysis || this.generateHoldingsContent(portfolioData));

        // Page 11: Dividend Analysis
        doc.addPage();
        this.renderSection(doc, 'Dividend Analysis', aiContent.dividend_analysis || aiContent.dividendAnalysis || this.generateDividendContent(portfolioData));

        // Page 12: Recommendations
        doc.addPage();
        this.renderSection(doc, 'Recommendations', aiContent.recommendations || this.generateRecommendationsContent(portfolioData));

        // Page 13: Market Outlook
        doc.addPage();
        this.renderSection(doc, 'Market Outlook', aiContent.market_outlook || aiContent.marketOutlook || this.generateMarketOutlook(portfolioData));

        // Page 14: Disclaimer
        doc.addPage();
        this.renderDisclaimer(doc);

        // Add page numbers
        this.addPageNumbers(doc);

        doc.end();

        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Render cover page
   */
  renderCoverPage(doc, portfolioData) {
    // Header bar
    doc.rect(0, 0, 595, 100).fill(this.colors.primary);

    // Logo/Title
    doc.fillColor(this.colors.white)
       .font(this.fonts.bold)
       .fontSize(28)
       .text('WEALTHPILOT PRO', 50, 35);

    doc.fontSize(12)
       .font(this.fonts.regular)
       .text('AI-Powered Portfolio Intelligence', 50, 65);

    // Main title area
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(32)
       .text('Portfolio Analysis Report', 50, 180, { align: 'center', width: 495 });

    doc.fillColor(this.colors.text)
       .font(this.fonts.regular)
       .fontSize(20)
       .text(portfolioData.name || 'Investment Portfolio', 50, 230, { align: 'center', width: 495 });

    // Date
    doc.fillColor(this.colors.textLight)
       .fontSize(14)
       .text(new Date().toLocaleDateString('en-US', {
         year: 'numeric',
         month: 'long',
         day: 'numeric'
       }), 50, 270, { align: 'center', width: 495 });

    // Summary box
    const boxY = 340;
    doc.roundedRect(70, boxY, 455, 200, 10)
       .lineWidth(2)
       .strokeColor(this.colors.border)
       .stroke();

    // Summary metrics
    const metrics = [
      { label: 'Total Portfolio Value', value: `$${(portfolioData.totalValue || 0).toLocaleString()}`, color: this.colors.primary },
      { label: 'Total Return', value: `${portfolioData.totalGainPercent >= 0 ? '+' : ''}${(portfolioData.totalGainPercent || 0).toFixed(2)}%`, color: portfolioData.totalGainPercent >= 0 ? this.colors.success : this.colors.danger },
      { label: 'Number of Holdings', value: `${portfolioData.holdings?.length || 0} positions`, color: this.colors.text },
      { label: 'Dividend Yield', value: `${(portfolioData.dividends?.yield || 0).toFixed(2)}%`, color: this.colors.secondary }
    ];

    let metricY = boxY + 25;
    metrics.forEach((metric, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? 100 : 320;
      const y = metricY + (row * 85);

      doc.fillColor(this.colors.textLight)
         .font(this.fonts.regular)
         .fontSize(11)
         .text(metric.label, x, y);

      doc.fillColor(metric.color)
         .font(this.fonts.bold)
         .fontSize(22)
         .text(metric.value, x, y + 18);
    });

    // Footer
    doc.fillColor(this.colors.textLight)
       .font(this.fonts.italic)
       .fontSize(10)
       .text('Powered by AI Analysis', 50, 720, { align: 'center', width: 495 })
       .text('This report is for informational purposes only', 50, 735, { align: 'center', width: 495 });
  }

  /**
   * Render table of contents
   */
  renderTableOfContents(doc) {
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(24)
       .text('Table of Contents', 50, 50);

    doc.moveTo(50, 85).lineTo(545, 85).strokeColor(this.colors.border).lineWidth(1).stroke();

    const sections = [
      { title: 'Executive Summary', page: 3 },
      { title: 'Portfolio Overview', page: 4 },
      { title: 'Holdings Detail', page: 5 },
      { title: 'Asset Allocation', page: 6 },
      { title: 'Performance Analysis', page: 7 },
      { title: 'Risk Assessment', page: 8 },
      { title: 'Sector Analysis', page: 9 },
      { title: 'Holdings Analysis', page: 10 },
      { title: 'Dividend Analysis', page: 11 },
      { title: 'Recommendations', page: 12 },
      { title: 'Market Outlook', page: 13 },
      { title: 'Disclaimer', page: 14 }
    ];

    let y = 110;
    sections.forEach((section, i) => {
      doc.fillColor(this.colors.text)
         .font(this.fonts.regular)
         .fontSize(12)
         .text(`${i + 1}. ${section.title}`, 60, y);

      doc.fillColor(this.colors.textLight)
         .text(`${section.page}`, 500, y, { align: 'right', width: 40 });

      // Dotted line
      doc.moveTo(200, y + 8)
         .lineTo(490, y + 8)
         .dash(2, { space: 3 })
         .stroke()
         .undash();

      y += 35;
    });
  }

  /**
   * Render section with title and content
   */
  renderSection(doc, title, content) {
    // Section header
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(20)
       .text(title, 50, 50);

    doc.moveTo(50, 80).lineTo(545, 80).strokeColor(this.colors.secondary).lineWidth(2).stroke();

    // Content - handle markdown-style formatting
    const cleanContent = this.formatContent(content);

    // Split content into paragraphs for better handling
    const paragraphs = cleanContent.split('\n\n');
    let y = 100;

    paragraphs.forEach(para => {
      // Check if we need a new page
      const lineHeight = 14;
      const estimatedLines = Math.ceil(para.length / 80);
      const estimatedHeight = estimatedLines * lineHeight;

      if (y + estimatedHeight > 750) {
        doc.addPage();
        y = 50;
      }

      // Check for section separators
      if (para.includes('━━━')) {
        doc.fillColor(this.colors.primary)
           .font(this.fonts.bold)
           .fontSize(12)
           .text(para.replace(/━/g, ''), 50, y, { width: 495 });
        y = doc.y + 10;
      } else if (para.startsWith('▸')) {
        doc.fillColor(this.colors.secondary)
           .font(this.fonts.bold)
           .fontSize(11)
           .text(para.replace('▸ ', ''), 50, y, { width: 495 });
        y = doc.y + 8;
      } else {
        doc.fillColor(this.colors.text)
           .font(this.fonts.regular)
           .fontSize(10)
           .text(para, 50, y, {
             align: 'left',
             lineGap: 3,
             width: 495
           });
        y = doc.y + 10;
      }
    });
  }

  /**
   * Format content - convert markdown to plain text with structure
   */
  formatContent(content) {
    if (!content) return 'Content not available.';

    let result = content
      // Remove markdown headers but keep text with separator
      .replace(/^#{1,2}\s+(.+)$/gm, '\n━━━ $1 ━━━\n')
      .replace(/^#{3,6}\s+(.+)$/gm, '\n▸ $1\n')
      // Convert bold markdown
      .replace(/\*\*(.*?)\*\*/g, '$1')
      // Convert italic markdown
      .replace(/\*(.*?)\*/g, '$1')
      // Convert bullet points
      .replace(/^\s*[-*]\s+/gm, '  • ')
      // Convert numbered lists
      .replace(/^\s*\d+\.\s+/gm, (match) => `  ${match.trim()} `)
      // Clean up table formatting - convert to readable format
      .replace(/\|[^\n]+\|/g, (match) => {
        // Skip header separator rows
        if (match.match(/^\|[-:|\s]+\|$/)) return '';
        // Convert table row to formatted text
        const cells = match.split('|').filter(c => c.trim());
        return cells.map(c => c.trim()).join('  |  ');
      })
      // Remove empty lines from table processing
      .replace(/\n{3,}/g, '\n\n')
      // Clean up extra whitespace
      .trim();

    return result;
  }

  /**
   * Render portfolio overview with metrics
   */
  renderPortfolioOverview(doc, portfolioData) {
    // Header
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(20)
       .text('Portfolio Overview', 50, 50);

    doc.moveTo(50, 80).lineTo(545, 80).strokeColor(this.colors.secondary).lineWidth(2).stroke();

    // Key Metrics Grid
    const metrics = [
      { label: 'Total Value', value: `$${(portfolioData.totalValue || 0).toLocaleString()}` },
      { label: 'Cost Basis', value: `$${(portfolioData.totalCostBasis || 0).toLocaleString()}` },
      { label: 'Total Gain/Loss', value: `${portfolioData.totalGain >= 0 ? '+' : ''}$${(portfolioData.totalGain || 0).toLocaleString()}` },
      { label: 'Return %', value: `${portfolioData.totalGainPercent >= 0 ? '+' : ''}${(portfolioData.totalGainPercent || 0).toFixed(2)}%` },
      { label: 'Holdings', value: `${portfolioData.holdings?.length || 0}` },
      { label: 'Sectors', value: `${Object.keys(portfolioData.sectorAllocation || {}).length}` },
      { label: 'Dividend Yield', value: `${(portfolioData.dividends?.yield || 0).toFixed(2)}%` },
      { label: 'Annual Income', value: `$${(portfolioData.dividends?.annualIncome || 0).toLocaleString()}` }
    ];

    let y = 100;
    metrics.forEach((metric, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? 60 : 310;
      const boxY = y + (row * 60);

      // Metric box
      doc.roundedRect(x, boxY, 220, 50, 5)
         .fillColor(this.colors.background)
         .fill();

      doc.fillColor(this.colors.textLight)
         .font(this.fonts.regular)
         .fontSize(10)
         .text(metric.label, x + 15, boxY + 10);

      const valueColor = metric.label.includes('Gain') || metric.label.includes('Return')
        ? (metric.value.includes('+') ? this.colors.success : this.colors.danger)
        : this.colors.primary;

      doc.fillColor(valueColor)
         .font(this.fonts.bold)
         .fontSize(16)
         .text(metric.value, x + 15, boxY + 26);
    });

    // Sector allocation summary
    y = 360;
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(14)
       .text('Sector Allocation', 50, y);

    y += 30;
    const sectors = Object.entries(portfolioData.sectorAllocation || {})
      .sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0))
      .slice(0, 6);

    sectors.forEach(([sector, data], i) => {
      const percentage = data.percentage || 0;
      const barWidth = Math.min(percentage * 4, 400);

      doc.fillColor(this.colors.text)
         .font(this.fonts.regular)
         .fontSize(10)
         .text(sector, 60, y + (i * 35));

      doc.roundedRect(150, y + (i * 35) - 2, 400, 18, 3)
         .fillColor(this.colors.border)
         .fill();

      doc.roundedRect(150, y + (i * 35) - 2, barWidth, 18, 3)
         .fillColor(this.colors.secondary)
         .fill();

      doc.fillColor(this.colors.white)
         .font(this.fonts.bold)
         .fontSize(9)
         .text(`${percentage.toFixed(1)}%`, 155, y + (i * 35) + 2);
    });
  }

  /**
   * Render holdings table
   */
  renderHoldingsTable(doc, holdings) {
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(20)
       .text('Holdings Detail', 50, 50);

    doc.moveTo(50, 80).lineTo(545, 80).strokeColor(this.colors.secondary).lineWidth(2).stroke();

    // Table headers
    const headers = ['Symbol', 'Shares', 'Cost', 'Price', 'Value', 'Gain %'];
    const colWidths = [70, 60, 80, 80, 90, 70];
    let x = 55;
    let y = 100;

    // Header row
    doc.fillColor(this.colors.primary)
       .rect(50, y - 5, 500, 25)
       .fill();

    headers.forEach((header, i) => {
      doc.fillColor(this.colors.white)
         .font(this.fonts.bold)
         .fontSize(10)
         .text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    y += 30;

    // Data rows
    const displayHoldings = holdings?.slice(0, 20) || [];
    displayHoldings.forEach((holding, rowIndex) => {
      // Alternating row background
      if (rowIndex % 2 === 0) {
        doc.fillColor(this.colors.background)
           .rect(50, y - 5, 500, 22)
           .fill();
      }

      x = 55;
      const values = [
        holding.symbol || 'N/A',
        (holding.shares || 0).toFixed(2),
        `$${(holding.avgCostBasis || 0).toFixed(2)}`,
        `$${(holding.currentPrice || holding.avgCostBasis || 0).toFixed(2)}`,
        `$${(holding.marketValue || 0).toLocaleString()}`,
        `${(holding.gainPercent || 0).toFixed(2)}%`
      ];

      values.forEach((value, i) => {
        const color = i === 5
          ? (parseFloat(value) >= 0 ? this.colors.success : this.colors.danger)
          : this.colors.text;

        doc.fillColor(color)
           .font(this.fonts.regular)
           .fontSize(9)
           .text(value, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      y += 22;

      // Check for page break
      if (y > 700 && rowIndex < displayHoldings.length - 1) {
        doc.addPage();
        y = 60;
      }
    });

    if ((holdings?.length || 0) > 20) {
      doc.fillColor(this.colors.textLight)
         .font(this.fonts.italic)
         .fontSize(10)
         .text(`... and ${holdings.length - 20} additional holdings`, 50, y + 10);
    }
  }

  /**
   * Render chart page
   */
  renderChartPage(doc, title, chartBuffer, additionalData) {
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(20)
       .text(title, 50, 50);

    doc.moveTo(50, 80).lineTo(545, 80).strokeColor(this.colors.secondary).lineWidth(2).stroke();

    if (chartBuffer) {
      doc.image(chartBuffer, 50, 100, { width: 500 });
    } else {
      // Fallback: render data as table
      doc.fillColor(this.colors.textLight)
         .font(this.fonts.italic)
         .fontSize(12)
         .text('Chart visualization not available', 50, 150);
    }
  }

  /**
   * Render chart in current page
   */
  renderChart(doc, chartBuffer, maxWidth = 400) {
    if (chartBuffer) {
      const yPos = doc.y + 20;
      if (yPos < 600) {
        doc.image(chartBuffer, 75, yPos, { width: maxWidth });
      }
    }
  }

  /**
   * Render disclaimer page
   */
  renderDisclaimer(doc) {
    doc.fillColor(this.colors.primary)
       .font(this.fonts.bold)
       .fontSize(20)
       .text('Important Disclaimer', 50, 50);

    doc.moveTo(50, 80).lineTo(545, 80).strokeColor(this.colors.warning).lineWidth(2).stroke();

    const disclaimerText = `IMPORTANT NOTICE

This report is generated by WealthPilot Pro using artificial intelligence for educational and informational purposes only. It does not constitute financial advice, investment recommendations, or an offer to buy or sell any securities.

PAST PERFORMANCE WARNING
Past performance is not indicative of future results. All investments involve risk, including the potential loss of principal. The analysis and recommendations contained in this report are based on the data provided and may not account for all relevant factors.

BEFORE MAKING INVESTMENT DECISIONS
Before making any investment decisions, you should:
• Consult with a qualified financial advisor
• Consider your own financial situation and investment objectives
• Conduct your own due diligence
• Review the prospectus and other documents for any securities mentioned

AI-GENERATED CONTENT NOTICE
The AI-generated content in this report may contain errors or inaccuracies. WealthPilot Pro makes no warranties or representations regarding the accuracy, completeness, or timeliness of the information provided.

DATA LIMITATIONS
Market data and calculations are subject to delays and may not reflect current market conditions. Portfolio valuations are estimates based on available data.

NO WARRANTY
This report is provided "as is" without any warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.

LIMITATION OF LIABILITY
WealthPilot Pro shall not be liable for any damages arising from the use of this report.`;

    doc.fillColor(this.colors.text)
       .font(this.fonts.regular)
       .fontSize(10)
       .text(disclaimerText, 50, 100, {
         align: 'left',
         lineGap: 3,
         width: 495
       });

    doc.moveDown(3);

    doc.fillColor(this.colors.textLight)
       .fontSize(9)
       .text(`Report generated: ${new Date().toISOString()}`, 50, doc.y)
       .text('WealthPilot Pro - AI-Powered Portfolio Intelligence', 50, doc.y + 15);
  }

  /**
   * Add page numbers to all pages
   */
  addPageNumbers(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(this.colors.textLight)
         .font(this.fonts.regular)
         .fontSize(9)
         .text(
           `Page ${i + 1} of ${pages.count}`,
           50,
           780,
           { align: 'center', width: 495 }
         );
    }
  }

  // Fallback content generators
  generateExecutiveSummary(data) {
    const gainStatus = data.totalGainPercent >= 0 ? 'positive' : 'negative';
    return `This portfolio has a total market value of $${(data.totalValue || 0).toLocaleString()} with a ${gainStatus} total return of ${(data.totalGainPercent || 0).toFixed(2)}%. The portfolio contains ${data.holdings?.length || 0} positions across ${Object.keys(data.sectorAllocation || {}).length} sectors.

Key Highlights:
• Total portfolio return: ${data.totalGainPercent >= 0 ? '+' : ''}${(data.totalGainPercent || 0).toFixed(2)}%
• Dividend yield: ${(data.dividends?.yield || 0).toFixed(2)}% providing $${(data.dividends?.annualIncome || 0).toLocaleString()} annual income
• ${data.holdings?.length || 0} individual positions providing diversification

The portfolio demonstrates ${data.holdings?.length > 10 ? 'good' : 'moderate'} diversification across holdings.`;
  }

  generatePerformanceContent(data) {
    const topGainers = [...(data.holdings || [])].sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0)).slice(0, 3);
    const topLosers = [...(data.holdings || [])].sort((a, b) => (a.gainPercent || 0) - (b.gainPercent || 0)).slice(0, 3);

    return `Performance Analysis

Total Return: ${data.totalGainPercent >= 0 ? '+' : ''}${(data.totalGainPercent || 0).toFixed(2)}%
Total Gain/Loss: $${(data.totalGain || 0).toLocaleString()}

Top Performers:
${topGainers.map((h, i) => `${i + 1}. ${h.symbol}: +${(h.gainPercent || 0).toFixed(2)}%`).join('\n')}

Bottom Performers:
${topLosers.map((h, i) => `${i + 1}. ${h.symbol}: ${(h.gainPercent || 0).toFixed(2)}%`).join('\n')}`;
  }

  generateRiskContent(data) {
    const topPosition = data.holdings?.[0];
    const topWeight = topPosition ? ((topPosition.marketValue || 0) / (data.totalValue || 1) * 100) : 0;

    return `Risk Assessment

Concentration Risk:
• Largest position: ${topPosition?.symbol || 'N/A'} at ${topWeight.toFixed(1)}% of portfolio
• ${topWeight > 20 ? 'HIGH' : topWeight > 10 ? 'MEDIUM' : 'LOW'} concentration risk

Diversification:
• ${data.holdings?.length || 0} positions across ${Object.keys(data.sectorAllocation || {}).length} sectors
• Diversification score: ${(100 - topWeight).toFixed(0)}/100

Risk Metrics:
• Concentration Score: ${data.riskMetrics?.concentrationScore?.toFixed(0) || 'N/A'}
• Sector Score: ${data.riskMetrics?.sectorScore?.toFixed(0) || 'N/A'}`;
  }

  generateSectorContent(data) {
    const sectors = Object.entries(data.sectorAllocation || {})
      .sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0));

    return `Sector Allocation Analysis

${sectors.map(([sector, d]) => `• ${sector}: ${(d.percentage || 0).toFixed(1)}% ($${(d.value || 0).toLocaleString()})`).join('\n')}

The portfolio shows ${sectors.length > 5 ? 'good' : 'limited'} sector diversification.`;
  }

  generateHoldingsContent(data) {
    const top5 = (data.holdings || []).slice(0, 5);
    return `Holdings Analysis

Top Holdings:
${top5.map((h, i) => `${i + 1}. ${h.symbol}
   Value: $${(h.marketValue || 0).toLocaleString()}
   Return: ${(h.gainPercent || 0).toFixed(2)}%
   Weight: ${((h.marketValue || 0) / (data.totalValue || 1) * 100).toFixed(1)}%`).join('\n\n')}`;
  }

  generateDividendContent(data) {
    return `Dividend Analysis

Portfolio Dividend Yield: ${(data.dividends?.yield || 0).toFixed(2)}%
Annual Dividend Income: $${(data.dividends?.annualIncome || 0).toLocaleString()}
Monthly Income Estimate: $${((data.dividends?.annualIncome || 0) / 12).toLocaleString()}

${data.dividends?.yield > 2 ? 'The portfolio provides above-average dividend income.' : 'The portfolio has moderate dividend income.'}`;
  }

  generateRecommendationsContent(data) {
    return `Investment Recommendations

Based on the portfolio analysis:

1. Review concentration if any position exceeds 15% of portfolio
2. Consider rebalancing sectors that deviate significantly from benchmark
3. Monitor underperforming positions for potential tax-loss harvesting
4. Evaluate dividend sustainability for income-generating positions

Note: These are general observations. Consult a financial advisor for personalized advice.`;
  }

  generateMarketOutlook(data) {
    return `Market Outlook

Current market conditions suggest maintaining a balanced approach:

• Monitor macroeconomic indicators
• Stay diversified across sectors
• Review portfolio quarterly
• Rebalance as needed

Sector-specific considerations based on portfolio allocation should be reviewed with current market data.`;
  }
}

module.exports = new PDFReportGenerator();
