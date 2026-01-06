/**
 * Visual PDF Report Generator
 * Creates professional portfolio reports with visual summary pages first
 * Followed by detailed analysis with ALL holdings
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class VisualPDFGenerator {
  constructor() {
    this.colors = {
      primary: '#1E3A8A',
      secondary: '#3B82F6',
      success: '#059669',
      danger: '#DC2626',
      warning: '#F59E0B',
      text: '#1F2937',
      textLight: '#6B7280',
      border: '#E5E7EB',
      background: '#F9FAFB',
      white: '#FFFFFF',
      lightBlue: '#EFF6FF',
      lightGreen: '#ECFDF5',
      lightRed: '#FEF2F2'
    };
  }

  /**
   * Generate complete visual PDF report
   */
  async generateReport(portfolioData, aiContent, charts, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          bufferPages: true,
          info: {
            Title: `${portfolioData.name} - Portfolio Analysis Report`,
            Author: 'WealthPilot Pro',
            Subject: 'Investment Portfolio Analysis'
          }
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        const data = this.prepareData(portfolioData);

        // ============================================================
        // SECTION 1: COVER PAGE
        // ============================================================
        this.renderCoverPage(doc, data);

        // ============================================================
        // SECTION 2: VISUAL SUMMARY - PORTFOLIO AT A GLANCE (Page 2)
        // ============================================================
        doc.addPage();
        this.renderVisualSummary(doc, data);

        // ============================================================
        // SECTION 3: WHERE IS YOUR MONEY? (Page 3)
        // ============================================================
        doc.addPage();
        this.renderWhereIsYourMoney(doc, data);

        // ============================================================
        // SECTION 4: HOW ARE YOU DOING? (Page 4)
        // ============================================================
        doc.addPage();
        this.renderPerformanceVisual(doc, data);

        // ============================================================
        // SECTION 5: IS YOUR MONEY SAFE? (Page 5)
        // ============================================================
        doc.addPage();
        this.renderRiskVisual(doc, data);

        // ============================================================
        // DETAILED ANALYSIS BEGINS
        // ============================================================
        doc.addPage();
        this.renderDetailedSectionHeader(doc);

        // ============================================================
        // EXECUTIVE SUMMARY
        // ============================================================
        doc.addPage();
        this.renderExecutiveSummary(doc, data);

        // ============================================================
        // ALL HOLDINGS - COMPLETE LIST
        // ============================================================
        doc.addPage();
        this.renderAllHoldings(doc, data);

        // ============================================================
        // SECTOR ANALYSIS
        // ============================================================
        doc.addPage();
        this.renderSectorAnalysis(doc, data);

        // ============================================================
        // PERFORMANCE ANALYSIS
        // ============================================================
        doc.addPage();
        this.renderPerformanceAnalysis(doc, data);

        // ============================================================
        // RISK ASSESSMENT
        // ============================================================
        doc.addPage();
        this.renderRiskAssessment(doc, data);

        // ============================================================
        // DIVIDEND ANALYSIS
        // ============================================================
        doc.addPage();
        this.renderDividendAnalysis(doc, data);

        // ============================================================
        // RECOMMENDATIONS
        // ============================================================
        doc.addPage();
        this.renderRecommendations(doc, data);

        // ============================================================
        // MARKET OUTLOOK
        // ============================================================
        doc.addPage();
        this.renderMarketOutlook(doc, data);

        // ============================================================
        // DISCLAIMER
        // ============================================================
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
   * Prepare all data calculations
   */
  prepareData(portfolioData) {
    const holdings = portfolioData.holdings || [];
    const totalValue = portfolioData.totalValue || 0;

    // Sort holdings by various metrics
    const byValue = [...holdings].sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
    const byGain = [...holdings].sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0));
    const byDividend = [...holdings].filter(h => h.dividendYield > 0)
      .sort((a, b) => (b.dividendYield || 0) - (a.dividendYield || 0));

    const profitableCount = holdings.filter(h => (h.gainPercent || 0) > 0).length;
    const winRate = holdings.length > 0 ? (profitableCount / holdings.length * 100) : 0;

    const sectorEntries = Object.entries(portfolioData.sectorAllocation || {})
      .sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0));
    const topSector = sectorEntries[0] || ['Diversified', { percentage: 100 }];

    const top5Weight = byValue.slice(0, 5).reduce((sum, h) =>
      sum + ((h.marketValue || 0) / totalValue * 100), 0);

    const hhi = holdings.reduce((sum, h) => {
      const weight = (h.marketValue || 0) / totalValue;
      return sum + (weight * weight);
    }, 0);

    let riskScore = 5;
    if (top5Weight > 60) riskScore += 2;
    if (holdings.length < 10) riskScore += 1;
    if ((topSector[1]?.percentage || 0) > 40) riskScore += 1;
    riskScore = Math.min(10, Math.max(1, riskScore));

    return {
      ...portfolioData,
      byValue,
      byGain,
      byDividend,
      profitableCount,
      winRate,
      sectorEntries,
      topSector,
      top5Weight,
      hhi,
      riskScore,
      diversificationScore: Math.max(0, 100 - (hhi * 1000))
    };
  }

  // ============================================================
  // COVER PAGE
  // ============================================================
  renderCoverPage(doc, data) {
    // Header bar
    doc.rect(0, 0, 595, 100).fill(this.colors.primary);

    doc.fillColor(this.colors.white)
       .font('Helvetica-Bold')
       .fontSize(28)
       .text('WEALTHPILOT PRO', 50, 35);

    doc.fontSize(12)
       .font('Helvetica')
       .text('AI-Powered Portfolio Intelligence', 50, 65);

    // Main title
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(32)
       .text('Portfolio Analysis Report', 50, 180, { align: 'center', width: 495 });

    doc.fillColor(this.colors.text)
       .fontSize(20)
       .text(data.name || 'Investment Portfolio', 50, 230, { align: 'center', width: 495 });

    doc.fillColor(this.colors.textLight)
       .fontSize(14)
       .text(new Date().toLocaleDateString('en-US', {
         year: 'numeric', month: 'long', day: 'numeric'
       }), 50, 270, { align: 'center', width: 495 });

    // Summary metrics box
    this.drawRoundedRect(doc, 70, 340, 455, 200, 10, this.colors.border, 2);

    const metrics = [
      { label: 'Total Portfolio Value', value: `$${(data.totalValue || 0).toLocaleString()}`, color: this.colors.primary },
      { label: 'Total Return', value: `${data.totalGainPercent >= 0 ? '+' : ''}${(data.totalGainPercent || 0).toFixed(2)}%`, color: data.totalGainPercent >= 0 ? this.colors.success : this.colors.danger },
      { label: 'Number of Holdings', value: `${data.holdings?.length || 0}`, color: this.colors.text },
      { label: 'Dividend Yield', value: `${(data.dividends?.yield || 0).toFixed(2)}%`, color: this.colors.secondary }
    ];

    let metricY = 365;
    metrics.forEach((metric, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? 100 : 320;
      const y = metricY + (row * 85);

      doc.fillColor(this.colors.textLight).fontSize(11).text(metric.label, x, y);
      doc.fillColor(metric.color).font('Helvetica-Bold').fontSize(22).text(metric.value, x, y + 18);
      doc.font('Helvetica');
    });

    // Footer
    doc.fillColor(this.colors.textLight)
       .font('Helvetica-Oblique')
       .fontSize(10)
       .text('Powered by AI Analysis', 50, 720, { align: 'center', width: 495 })
       .text('This report is for informational purposes only', 50, 735, { align: 'center', width: 495 });
  }

  // ============================================================
  // VISUAL SUMMARY PAGE - SIMPLE FOR CLIENTS
  // ============================================================
  renderVisualSummary(doc, data) {
    // Title
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(24)
       .text('Portfolio Health at a Glance', 50, 50, { align: 'center', width: 495 });

    doc.fillColor(this.colors.textLight)
       .font('Helvetica')
       .fontSize(12)
       .text('Simple overview for quick understanding', 50, 80, { align: 'center', width: 495 });

    // Health status circle
    let healthStatus, healthColor, healthBg;
    if (data.totalGainPercent > 15) {
      healthStatus = 'EXCELLENT'; healthColor = this.colors.success; healthBg = this.colors.lightGreen;
    } else if (data.totalGainPercent > 5) {
      healthStatus = 'GOOD'; healthColor = this.colors.success; healthBg = this.colors.lightGreen;
    } else if (data.totalGainPercent > 0) {
      healthStatus = 'MODERATE'; healthColor = this.colors.warning; healthBg = '#FEF3C7';
    } else {
      healthStatus = 'NEEDS ATTENTION'; healthColor = this.colors.danger; healthBg = this.colors.lightRed;
    }

    // Health box
    doc.roundedRect(150, 120, 295, 150, 10).fillAndStroke(healthBg, healthColor);

    doc.fillColor(healthColor)
       .font('Helvetica-Bold')
       .fontSize(36)
       .text(healthStatus, 150, 160, { align: 'center', width: 295 });

    doc.fillColor(this.colors.text)
       .font('Helvetica')
       .fontSize(14)
       .text(`Return: ${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`, 150, 210, { align: 'center', width: 295 })
       .text(`Win Rate: ${data.winRate.toFixed(0)}%`, 150, 230, { align: 'center', width: 295 });

    // Key numbers in simple terms
    const boxY = 300;
    const boxWidth = 150;
    const boxHeight = 80;

    // Your Money
    doc.roundedRect(60, boxY, boxWidth, boxHeight, 5).fill(this.colors.lightBlue);
    doc.fillColor(this.colors.textLight).fontSize(10).text('YOUR MONEY', 60, boxY + 10, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(18)
       .text(`$${(data.totalValue || 0).toLocaleString()}`, 60, boxY + 30, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(9)
       .text('Total invested', 60, boxY + 55, { align: 'center', width: boxWidth });

    // Your Profit/Loss
    const plBg = data.totalGain >= 0 ? this.colors.lightGreen : this.colors.lightRed;
    const plColor = data.totalGain >= 0 ? this.colors.success : this.colors.danger;
    doc.roundedRect(225, boxY, boxWidth, boxHeight, 5).fill(plBg);
    doc.fillColor(this.colors.textLight).fontSize(10).text('YOUR PROFIT/LOSS', 225, boxY + 10, { align: 'center', width: boxWidth });
    doc.fillColor(plColor).font('Helvetica-Bold').fontSize(18)
       .text(`${data.totalGain >= 0 ? '+' : ''}$${(data.totalGain || 0).toLocaleString()}`, 225, boxY + 30, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(9)
       .text(data.totalGain >= 0 ? 'Money earned' : 'Money lost', 225, boxY + 55, { align: 'center', width: boxWidth });

    // Success Rate
    doc.roundedRect(390, boxY, boxWidth, boxHeight, 5).fill(this.colors.lightBlue);
    doc.fillColor(this.colors.textLight).fontSize(10).text('SUCCESS RATE', 390, boxY + 10, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(18)
       .text(`${data.winRate.toFixed(0)}%`, 390, boxY + 30, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(9)
       .text('Winning positions', 390, boxY + 55, { align: 'center', width: boxWidth });

    // Simple explanation box
    doc.roundedRect(50, 420, 495, 200, 5).fillAndStroke(this.colors.background, this.colors.border);

    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('What does this mean?', 70, 440);

    let explanation = '';
    if (data.totalGainPercent > 10) {
      explanation = 'Great news! Your portfolio is performing well above average. Your investments are growing nicely.';
    } else if (data.totalGainPercent > 0) {
      explanation = 'Your portfolio is making money, though there\'s room for improvement. Consider reviewing underperforming positions.';
    } else {
      explanation = 'Your portfolio is currently showing losses. This might be a good time to review your investment strategy.';
    }

    explanation += `\n\nYou have ${data.holdings.length} different investments, `;
    explanation += data.holdings.length < 10 ? 'which is relatively few - consider diversifying more.' :
                   data.holdings.length < 20 ? 'providing decent diversification.' :
                   'giving you excellent diversification.';

    explanation += `\n\nYour biggest sector is ${data.topSector[0]} at ${(data.topSector[1]?.percentage || 0).toFixed(0)}% of your portfolio.`;

    if (data.dividends?.yield > 0) {
      explanation += `\n\nYour portfolio generates about $${((data.dividends?.annualIncome || 0) / 12).toFixed(0)} per month in dividend income.`;
    }

    doc.fillColor(this.colors.text)
       .font('Helvetica')
       .fontSize(11)
       .text(explanation, 70, 470, { width: 455, lineGap: 4 });
  }

  // ============================================================
  // WHERE IS YOUR MONEY PAGE
  // ============================================================
  renderWhereIsYourMoney(doc, data) {
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(24)
       .text('Where Is Your Money?', 50, 50, { align: 'center', width: 495 });

    doc.fillColor(this.colors.textLight)
       .font('Helvetica')
       .fontSize(12)
       .text('Visual breakdown of your investments', 50, 80, { align: 'center', width: 495 });

    // Sector allocation bars
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(16)
       .text('By Industry Sector', 50, 120);

    const sectorColors = [this.colors.primary, this.colors.secondary, this.colors.success,
                          this.colors.warning, this.colors.danger, '#8B5CF6', '#EC4899', '#6B7280'];

    let y = 150;
    data.sectorEntries.slice(0, 8).forEach((entry, i) => {
      const [sector, sData] = entry;
      const percentage = sData.percentage || 0;
      const barWidth = Math.min(percentage * 4, 400);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(sector, 60, y, { width: 120 });

      doc.roundedRect(190, y - 2, 350, 20, 3).fill(this.colors.border);
      doc.roundedRect(190, y - 2, barWidth, 20, 3).fill(sectorColors[i % sectorColors.length]);

      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9)
         .text(`${percentage.toFixed(1)}%`, 195, y + 2);

      y += 35;
    });

    // Top holdings
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(16)
       .text('Your Largest Investments', 50, y + 30);

    y += 60;

    // Table header
    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Rank', 60, y + 7);
    doc.text('Symbol', 100, y + 7);
    doc.text('Value', 200, y + 7);
    doc.text('Weight', 300, y + 7);
    doc.text('Return', 400, y + 7);

    y += 30;

    data.byValue.slice(0, 10).forEach((h, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 25).fill(rowBg);

      const weight = ((h.marketValue || 0) / data.totalValue * 100);
      const returnColor = (h.gainPercent || 0) >= 0 ? this.colors.success : this.colors.danger;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(`${i + 1}`, 60, y);
      doc.text(h.symbol, 100, y);
      doc.text(`$${(h.marketValue || 0).toLocaleString()}`, 200, y);
      doc.text(`${weight.toFixed(1)}%`, 300, y);
      doc.fillColor(returnColor).text(`${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(2)}%`, 400, y);

      y += 25;
    });

    if (data.holdings.length > 10) {
      doc.fillColor(this.colors.textLight)
         .font('Helvetica-Oblique')
         .fontSize(9)
         .text(`... and ${data.holdings.length - 10} more holdings (see detailed section)`, 50, y + 10);
    }
  }

  // ============================================================
  // PERFORMANCE VISUAL PAGE
  // ============================================================
  renderPerformanceVisual(doc, data) {
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(24)
       .text('How Are Your Investments Performing?', 50, 50, { align: 'center', width: 495 });

    doc.fillColor(this.colors.textLight)
       .font('Helvetica')
       .fontSize(12)
       .text('Winners and areas needing attention', 50, 80, { align: 'center', width: 495 });

    // Winners box
    doc.roundedRect(50, 120, 230, 200, 5).fillAndStroke(this.colors.lightGreen, this.colors.success);
    doc.fillColor(this.colors.success).font('Helvetica-Bold').fontSize(14)
       .text('Top Winners', 60, 135);

    let y = 160;
    const winners = data.byGain.filter(h => (h.gainPercent || 0) > 0).slice(0, 5);
    winners.forEach(h => {
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(11)
         .text(h.symbol, 70, y)
         .fillColor(this.colors.success)
         .text(`+${(h.gainPercent || 0).toFixed(2)}%`, 180, y);
      y += 25;
    });
    if (winners.length === 0) {
      doc.fillColor(this.colors.textLight).text('No winners yet', 70, y);
    }

    // Needs attention box
    doc.roundedRect(315, 120, 230, 200, 5).fillAndStroke(this.colors.lightRed, this.colors.danger);
    doc.fillColor(this.colors.danger).font('Helvetica-Bold').fontSize(14)
       .text('Needs Attention', 325, 135);

    y = 160;
    const losers = data.byGain.filter(h => (h.gainPercent || 0) <= 0).slice(-5).reverse();
    losers.forEach(h => {
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(11)
         .text(h.symbol, 335, y)
         .fillColor(this.colors.danger)
         .text(`${(h.gainPercent || 0).toFixed(2)}%`, 445, y);
      y += 25;
    });
    if (losers.length === 0) {
      doc.fillColor(this.colors.success).text('All positions profitable!', 335, y);
    }

    // Benchmark comparison
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(16)
       .text('How You Compare to the Market', 50, 350);

    const benchmarks = [
      { name: 'Your Portfolio', value: data.totalGainPercent, color: this.colors.primary },
      { name: 'S&P 500', value: 12.5, color: this.colors.textLight },
      { name: 'NASDAQ', value: 15.2, color: this.colors.textLight },
      { name: 'Dow Jones', value: 10.8, color: this.colors.textLight }
    ];

    y = 380;
    benchmarks.forEach(b => {
      const barWidth = Math.max(10, Math.min((b.value + 10) * 15, 350));
      const barColor = b.value === data.totalGainPercent ?
        (b.value >= 0 ? this.colors.success : this.colors.danger) : b.color;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(b.name, 60, y, { width: 100 });

      doc.roundedRect(170, y - 2, 350, 20, 3).fill(this.colors.border);
      doc.roundedRect(170, y - 2, barWidth, 20, 3).fill(barColor);

      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9)
         .text(`${b.value >= 0 ? '+' : ''}${b.value.toFixed(1)}%`, 175, y + 2);

      y += 35;
    });

    // Simple interpretation
    const vsSp = data.totalGainPercent - 12.5;
    let interpretation = vsSp >= 0 ?
      `You're outperforming the S&P 500 by ${vsSp.toFixed(1)}%!` :
      `You're underperforming the S&P 500 by ${Math.abs(vsSp).toFixed(1)}%.`;

    doc.roundedRect(50, 540, 495, 60, 5).fill(this.colors.lightBlue);
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(12)
       .text(interpretation, 70, 555, { width: 455 });
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(10)
       .text('The S&P 500 is a common benchmark representing the overall US stock market.', 70, 575, { width: 455 });
  }

  // ============================================================
  // RISK VISUAL PAGE
  // ============================================================
  renderRiskVisual(doc, data) {
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(24)
       .text('Is Your Money Safe?', 50, 50, { align: 'center', width: 495 });

    doc.fillColor(this.colors.textLight)
       .font('Helvetica')
       .fontSize(12)
       .text('Understanding your investment risk', 50, 80, { align: 'center', width: 495 });

    // Risk score visual
    const riskColor = data.riskScore <= 3 ? this.colors.success :
                      data.riskScore <= 6 ? this.colors.warning : this.colors.danger;
    const riskLabel = data.riskScore <= 3 ? 'Low Risk' :
                      data.riskScore <= 6 ? 'Moderate Risk' : 'High Risk';
    const riskBg = data.riskScore <= 3 ? this.colors.lightGreen :
                   data.riskScore <= 6 ? '#FEF3C7' : this.colors.lightRed;

    doc.roundedRect(170, 120, 255, 100, 10).fillAndStroke(riskBg, riskColor);

    doc.fillColor(riskColor)
       .font('Helvetica-Bold')
       .fontSize(48)
       .text(`${data.riskScore}/10`, 170, 140, { align: 'center', width: 255 });

    doc.fontSize(18)
       .text(riskLabel, 170, 190, { align: 'center', width: 255 });

    // Risk factors explained
    doc.roundedRect(50, 250, 495, 250, 5).fillAndStroke(this.colors.background, this.colors.border);

    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('Risk Factors Explained Simply:', 70, 270);

    const riskFactors = [
      {
        label: 'Concentration',
        level: data.top5Weight > 60 ? 'High' : data.top5Weight > 40 ? 'Medium' : 'Low',
        color: data.top5Weight > 60 ? this.colors.danger : data.top5Weight > 40 ? this.colors.warning : this.colors.success,
        explanation: data.top5Weight > 60 ? 'Too much money in few stocks' :
                     data.top5Weight > 40 ? 'Moderately spread out' : 'Well spread out',
        value: `${data.top5Weight.toFixed(0)}% in top 5`
      },
      {
        label: 'Diversification',
        level: data.holdings.length < 10 ? 'Low' : data.holdings.length < 20 ? 'Medium' : 'High',
        color: data.holdings.length < 10 ? this.colors.danger : data.holdings.length < 20 ? this.colors.warning : this.colors.success,
        explanation: data.holdings.length < 10 ? 'Need more variety' :
                     data.holdings.length < 20 ? 'Good variety' : 'Excellent variety',
        value: `${data.holdings.length} investments`
      },
      {
        label: 'Sector Balance',
        level: (data.topSector[1]?.percentage || 0) > 40 ? 'Low' : 'Good',
        color: (data.topSector[1]?.percentage || 0) > 40 ? this.colors.danger : this.colors.success,
        explanation: (data.topSector[1]?.percentage || 0) > 40 ? 'Too much in one area' : 'Spread across industries',
        value: `${(data.topSector[1]?.percentage || 0).toFixed(0)}% in ${data.topSector[0]}`
      }
    ];

    let y = 310;
    riskFactors.forEach(rf => {
      doc.fillColor(this.colors.text).font('Helvetica-Bold').fontSize(11)
         .text(rf.label + ':', 70, y);

      doc.roundedRect(180, y - 3, 60, 20, 3).fill(rf.color);
      doc.fillColor(this.colors.white).fontSize(10)
         .text(rf.level, 180, y, { align: 'center', width: 60 });

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(`${rf.explanation} (${rf.value})`, 250, y);

      y += 50;
    });

    // Simple advice
    doc.roundedRect(50, 530, 495, 80, 5).fill(this.colors.lightBlue);
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(12)
       .text('What Should You Do?', 70, 550);

    let advice = '';
    if (data.riskScore <= 3) {
      advice = 'Your portfolio is conservatively positioned. This is good for stability but may limit growth potential.';
    } else if (data.riskScore <= 6) {
      advice = 'Your portfolio has moderate risk. Consider if this matches your investment goals and time horizon.';
    } else {
      advice = 'Your portfolio has higher risk. Consider diversifying more or reducing concentration in top positions.';
    }

    doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
       .text(advice, 70, 570, { width: 455 });
  }

  // ============================================================
  // DETAILED SECTION HEADER
  // ============================================================
  renderDetailedSectionHeader(doc) {
    doc.rect(0, 0, 595, 842).fill(this.colors.primary);

    doc.fillColor(this.colors.white)
       .font('Helvetica-Bold')
       .fontSize(36)
       .text('Detailed Analysis', 50, 350, { align: 'center', width: 495 });

    doc.fontSize(16)
       .font('Helvetica')
       .text('In-depth report for comprehensive understanding', 50, 400, { align: 'center', width: 495 });

    doc.fontSize(12)
       .text('The following pages contain detailed data and analysis', 50, 450, { align: 'center', width: 495 });
  }

  // ============================================================
  // EXECUTIVE SUMMARY
  // ============================================================
  renderExecutiveSummary(doc, data) {
    this.renderSectionHeader(doc, 'Executive Summary');

    let y = 100;

    // Health assessment
    let healthStatus = data.totalGainPercent > 15 ? 'EXCELLENT' :
                       data.totalGainPercent > 5 ? 'GOOD' :
                       data.totalGainPercent > 0 ? 'MODERATE' : 'NEEDS ATTENTION';

    doc.roundedRect(50, y, 495, 60, 5).fill(this.colors.lightBlue);
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(12)
       .text(`Portfolio Health: ${healthStatus}`, 70, y + 15);
    doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
       .text(`Total return of ${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}% with ${data.winRate.toFixed(0)}% of positions profitable.`, 70, y + 35);

    y += 80;

    // Key metrics table
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Key Metrics', 50, y);

    y += 25;

    const metrics = [
      ['Total Portfolio Value', `$${(data.totalValue || 0).toLocaleString()}`],
      ['Total Cost Basis', `$${(data.totalCostBasis || 0).toLocaleString()}`],
      ['Total Return', `${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}% ($${data.totalGain >= 0 ? '+' : ''}${(data.totalGain || 0).toLocaleString()})`],
      ['Win Rate', `${data.winRate.toFixed(1)}% (${data.profitableCount}/${data.holdings.length} positions)`],
      ['Portfolio Yield', `${(data.dividends?.yield || 0).toFixed(2)}%`],
      ['Annual Dividend Income', `$${(data.dividends?.annualIncome || 0).toLocaleString()}`],
      ['Number of Holdings', `${data.holdings.length}`],
      ['Number of Sectors', `${Object.keys(data.sectorAllocation || {}).length}`]
    ];

    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Metric', 60, y + 7);
    doc.text('Value', 300, y + 7);

    y += 30;

    metrics.forEach((m, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(m[0], 60, y);
      doc.text(m[1], 300, y);
      y += 22;
    });
  }

  // ============================================================
  // ALL HOLDINGS - COMPLETE LIST
  // ============================================================
  renderAllHoldings(doc, data) {
    this.renderSectionHeader(doc, `Complete Holdings Detail (${data.holdings.length} positions)`);

    let y = 100;
    let pageNum = 1;

    // Table header
    const renderHeader = (yPos) => {
      doc.rect(50, yPos, 495, 25).fill(this.colors.primary);
      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(8);
      doc.text('#', 55, yPos + 8);
      doc.text('Symbol', 75, yPos + 8);
      doc.text('Shares', 130, yPos + 8);
      doc.text('Avg Cost', 180, yPos + 8);
      doc.text('Price', 235, yPos + 8);
      doc.text('Value', 290, yPos + 8);
      doc.text('Gain/Loss', 360, yPos + 8);
      doc.text('Weight', 430, yPos + 8);
      doc.text('Sector', 480, yPos + 8);
      return yPos + 30;
    };

    y = renderHeader(y);

    data.holdings.forEach((h, i) => {
      // Check for page break
      if (y > 720) {
        doc.addPage();
        y = 50;
        y = renderHeader(y);
      }

      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 20).fill(rowBg);

      const weight = ((h.marketValue || 0) / data.totalValue * 100);
      const gainColor = (h.gainPercent || 0) >= 0 ? this.colors.success : this.colors.danger;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(8);
      doc.text(`${i + 1}`, 55, y);
      doc.text(h.symbol, 75, y);
      doc.text((h.shares || 0).toFixed(2), 130, y);
      doc.text(`$${(h.avgCostBasis || 0).toFixed(2)}`, 180, y);
      doc.text(`$${(h.currentPrice || 0).toFixed(2)}`, 235, y);
      doc.text(`$${(h.marketValue || 0).toLocaleString()}`, 290, y);
      doc.fillColor(gainColor).text(`${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(2)}%`, 360, y);
      doc.fillColor(this.colors.text).text(`${weight.toFixed(1)}%`, 430, y);
      doc.fontSize(7).text((h.sector || 'N/A').substring(0, 12), 480, y);

      y += 20;
    });

    // Total row
    y += 5;
    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', 75, y + 8);
    doc.text(`$${(data.totalValue || 0).toLocaleString()}`, 290, y + 8);
    doc.text(`${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`, 360, y + 8);
    doc.text('100%', 430, y + 8);
  }

  // ============================================================
  // SECTOR ANALYSIS
  // ============================================================
  renderSectorAnalysis(doc, data) {
    this.renderSectionHeader(doc, 'Sector Analysis');

    const spWeights = {
      'Technology': 28.5, 'Healthcare': 13.2, 'Financial Services': 12.8,
      'Consumer Discretionary': 10.5, 'Communication Services': 8.8,
      'Industrials': 8.6, 'Consumer Staples': 6.2, 'Energy': 4.1,
      'Utilities': 2.5, 'Real Estate': 2.4, 'Materials': 2.4
    };

    let y = 100;

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Sector Allocation vs S&P 500', 50, y);

    y += 30;

    // Table header
    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9);
    doc.text('Sector', 60, y + 8);
    doc.text('Your Weight', 180, y + 8);
    doc.text('S&P 500', 260, y + 8);
    doc.text('Difference', 340, y + 8);
    doc.text('Status', 430, y + 8);

    y += 30;

    data.sectorEntries.forEach((entry, i) => {
      const [sector, sData] = entry;
      const spWeight = spWeights[sector] || 3.0;
      const diff = (sData.percentage || 0) - spWeight;
      const status = diff > 5 ? 'Overweight' : diff < -5 ? 'Underweight' : 'Market Weight';
      const statusColor = diff > 5 ? this.colors.danger : diff < -5 ? this.colors.success : this.colors.textLight;

      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(sector, 60, y);
      doc.text(`${(sData.percentage || 0).toFixed(1)}%`, 180, y);
      doc.text(`${spWeight.toFixed(1)}%`, 260, y);
      doc.text(`${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, 340, y);
      doc.fillColor(statusColor).text(status, 430, y);

      y += 22;
    });
  }

  // ============================================================
  // PERFORMANCE ANALYSIS
  // ============================================================
  renderPerformanceAnalysis(doc, data) {
    this.renderSectionHeader(doc, 'Performance Analysis');

    let y = 100;

    // Benchmark comparison
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Total Return vs Benchmarks', 50, y);

    y += 30;

    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Metric', 60, y + 7);
    doc.text('Your Portfolio', 200, y + 7);
    doc.text('S&P 500', 300, y + 7);
    doc.text('Difference', 400, y + 7);

    y += 30;

    const spReturn = 12.5;
    const vsSp = data.totalGainPercent - spReturn;

    [
      ['Total Return', `${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`, `+${spReturn}%`, `${vsSp >= 0 ? '+' : ''}${vsSp.toFixed(2)}%`],
      ['Dollar Gain/Loss', `$${data.totalGain >= 0 ? '+' : ''}${(data.totalGain || 0).toLocaleString()}`, '-', '-']
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      row.forEach((cell, j) => {
        const x = [60, 200, 300, 400][j];
        doc.text(cell, x, y);
      });
      y += 22;
    });

    y += 30;

    // Top performers
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Top Performers', 50, y);

    y += 25;

    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Symbol', 60, y + 7);
    doc.text('Return', 150, y + 7);
    doc.text('Dollar Gain', 250, y + 7);
    doc.text('Contribution', 380, y + 7);

    y += 30;

    data.byGain.slice(0, 10).forEach((h, i) => {
      const contrib = data.totalGain !== 0 ? ((h.gain || 0) / Math.abs(data.totalGain) * 100) : 0;

      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(h.symbol, 60, y);
      doc.fillColor((h.gainPercent || 0) >= 0 ? this.colors.success : this.colors.danger)
         .text(`${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(2)}%`, 150, y);
      doc.fillColor(this.colors.text)
         .text(`$${(h.gain || 0) >= 0 ? '+' : ''}${(h.gain || 0).toLocaleString()}`, 250, y);
      doc.text(`${contrib.toFixed(1)}%`, 380, y);

      y += 22;
    });
  }

  // ============================================================
  // RISK ASSESSMENT
  // ============================================================
  renderRiskAssessment(doc, data) {
    this.renderSectionHeader(doc, 'Risk Assessment');

    let y = 100;

    // Risk score
    const riskColor = data.riskScore <= 3 ? this.colors.success :
                      data.riskScore <= 6 ? this.colors.warning : this.colors.danger;
    const riskLabel = data.riskScore <= 3 ? 'Conservative' :
                      data.riskScore <= 6 ? 'Moderate' : 'Aggressive';

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text(`Overall Risk Score: ${data.riskScore}/10 (${riskLabel})`, 50, y);

    y += 40;

    // Risk metrics table
    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Risk Factor', 60, y + 7);
    doc.text('Level', 200, y + 7);
    doc.text('Score', 280, y + 7);
    doc.text('Assessment', 380, y + 7);

    y += 30;

    const riskMetrics = [
      ['Concentration Risk', data.top5Weight > 60 ? 'HIGH' : data.top5Weight > 40 ? 'MEDIUM' : 'LOW',
       `${data.top5Weight.toFixed(0)}% in top 5`, data.top5Weight > 60 ? 'Consider diversifying' : 'Acceptable'],
      ['Sector Risk', (data.topSector[1]?.percentage || 0) > 40 ? 'HIGH' : 'MEDIUM',
       `${(data.topSector[1]?.percentage || 0).toFixed(0)}% in ${data.topSector[0]}`,
       (data.topSector[1]?.percentage || 0) > 40 ? 'Overexposed' : 'Balanced'],
      ['Diversification', data.diversificationScore > 70 ? 'GOOD' : data.diversificationScore > 50 ? 'MODERATE' : 'POOR',
       `${data.diversificationScore.toFixed(0)}/100`, data.diversificationScore > 70 ? 'Well diversified' : 'Improve diversity'],
      ['Position Count', data.holdings.length >= 20 ? 'GOOD' : data.holdings.length >= 10 ? 'MODERATE' : 'LOW',
       `${data.holdings.length} positions`, data.holdings.length < 15 ? 'Add positions' : 'Adequate']
    ];

    riskMetrics.forEach((rm, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(rm[0], 60, y);
      doc.text(rm[1], 200, y);
      doc.text(rm[2], 280, y);
      doc.text(rm[3], 380, y);
      y += 22;
    });

    y += 30;

    // VaR
    const var95 = data.totalValue * 1.645 * 0.012 * Math.sqrt(21);

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Value at Risk (VaR) Analysis', 50, y);

    y += 25;

    [
      ['Portfolio Value', `$${(data.totalValue || 0).toLocaleString()}`],
      ['95% Monthly VaR', `$${var95.toLocaleString()}`],
      ['Maximum Expected Loss (95%)', `${(var95 / data.totalValue * 100).toFixed(2)}%`],
      ['HHI Index', `${(data.hhi * 10000).toFixed(0)}`]
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 300, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(row[0], 60, y);
      doc.text(row[1], 220, y);
      y += 22;
    });
  }

  // ============================================================
  // DIVIDEND ANALYSIS
  // ============================================================
  renderDividendAnalysis(doc, data) {
    this.renderSectionHeader(doc, 'Dividend Analysis');

    let y = 100;

    // Income summary
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Income Summary', 50, y);

    y += 25;

    const totalDividends = data.dividends?.annualIncome || 0;

    [
      ['Annual Dividend Income', `$${totalDividends.toLocaleString()}`],
      ['Portfolio Yield', `${(data.dividends?.yield || 0).toFixed(2)}%`],
      ['Monthly Income Estimate', `$${(totalDividends / 12).toLocaleString()}`],
      ['Quarterly Income Estimate', `$${(totalDividends / 4).toLocaleString()}`],
      ['Dividend-Paying Holdings', `${data.byDividend.length} of ${data.holdings.length} (${((data.byDividend.length / data.holdings.length) * 100).toFixed(0)}%)`]
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 350, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(row[0], 60, y);
      doc.text(row[1], 250, y);
      y += 22;
    });

    y += 30;

    // Top dividend payers
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Top Dividend Payers', 50, y);

    y += 25;

    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Symbol', 60, y + 7);
    doc.text('Yield', 150, y + 7);
    doc.text('Annual Dividend', 250, y + 7);
    doc.text('Contribution', 400, y + 7);

    y += 30;

    data.byDividend.slice(0, 10).forEach((h, i) => {
      const annualDiv = (h.marketValue || 0) * ((h.dividendYield || 0) / 100);
      const contrib = totalDividends > 0 ? (annualDiv / totalDividends * 100) : 0;

      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(h.symbol, 60, y);
      doc.text(`${(h.dividendYield || 0).toFixed(2)}%`, 150, y);
      doc.text(`$${annualDiv.toLocaleString()}`, 250, y);
      doc.text(`${contrib.toFixed(1)}%`, 400, y);

      y += 22;
    });
  }

  // ============================================================
  // RECOMMENDATIONS
  // ============================================================
  renderRecommendations(doc, data) {
    this.renderSectionHeader(doc, 'Recommendations');

    let y = 100;

    const recommendations = [];

    const bigWinners = data.byGain.filter(h => h.gainPercent > 50);
    if (bigWinners.length > 0) {
      recommendations.push({
        action: 'TRIM',
        symbols: bigWinners.map(h => h.symbol).join(', '),
        reason: 'Positions with >50% gains - consider taking partial profits',
        priority: 'High',
        color: this.colors.warning
      });
    }

    const topPosition = data.byValue[0];
    if (topPosition && (topPosition.marketValue / data.totalValue * 100) > 15) {
      recommendations.push({
        action: 'REDUCE',
        symbols: topPosition.symbol,
        reason: 'Position exceeds 15% of portfolio',
        priority: 'High',
        color: this.colors.danger
      });
    }

    if (data.holdings.length < 15) {
      recommendations.push({
        action: 'ADD',
        symbols: 'New positions',
        reason: 'Portfolio has fewer than 15 positions - diversify more',
        priority: 'Medium',
        color: this.colors.secondary
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        action: 'MAINTAIN',
        symbols: 'Current allocation',
        reason: 'Portfolio is well-positioned',
        priority: 'Low',
        color: this.colors.success
      });
    }

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Immediate Actions', 50, y);

    y += 25;

    recommendations.forEach((r, i) => {
      doc.roundedRect(50, y, 495, 60, 5).fillAndStroke(`${r.color}10`, r.color);

      doc.fillColor(r.color).font('Helvetica-Bold').fontSize(12)
         .text(`${i + 1}. ${r.action}: ${r.symbols}`, 70, y + 15);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(`Reason: ${r.reason}`, 70, y + 35);

      y += 75;
    });

    y += 20;

    // Strategic recommendations
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Strategic Recommendations', 50, y);

    y += 25;

    const strategic = [
      'Consider adding consumer staples or utilities for stability',
      'Technology and healthcare offer long-term growth potential',
      'REITs or dividend aristocrats can enhance income',
      'Review portfolio quarterly for rebalancing opportunities'
    ];

    strategic.forEach(s => {
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(`• ${s}`, 60, y);
      y += 18;
    });
  }

  // ============================================================
  // MARKET OUTLOOK
  // ============================================================
  renderMarketOutlook(doc, data) {
    this.renderSectionHeader(doc, 'Market Outlook');

    let y = 100;

    doc.roundedRect(50, y, 495, 180, 5).fill(this.colors.lightBlue);

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(12)
       .text('Macroeconomic Environment', 70, y + 15);

    doc.fillColor(this.colors.text).font('Helvetica-Bold').fontSize(10)
       .text('Positive Factors:', 70, y + 40);

    const positives = [
      'Economic resilience with moderate growth expectations',
      'AI and technology innovation driving productivity gains',
      'Strong corporate earnings growth in select sectors'
    ];

    let py = y + 55;
    positives.forEach(p => {
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9)
         .text(`• ${p}`, 80, py);
      py += 15;
    });

    doc.fillColor(this.colors.text).font('Helvetica-Bold').fontSize(10)
       .text('Risk Factors:', 70, py + 10);

    const risks = [
      'Interest rate uncertainty and Fed policy',
      'Geopolitical tensions affecting global trade',
      'Valuation concerns in growth sectors'
    ];

    py += 25;
    risks.forEach(r => {
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9)
         .text(`• ${r}`, 80, py);
      py += 15;
    });

    y += 200;

    // Scenarios table
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Portfolio Positioning Scenarios', 50, y);

    y += 25;

    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Scenario', 60, y + 7);
    doc.text('Probability', 180, y + 7);
    doc.text('Strategy', 280, y + 7);

    y += 30;

    [
      ['Bull Case', '30%', 'Maintain current allocation; add quality growth'],
      ['Base Case', '50%', 'Rebalance toward quality; maintain diversification'],
      ['Bear Case', '20%', 'Increase defensive exposure; raise cash']
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 5, 495, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(row[0], 60, y);
      doc.text(row[1], 180, y);
      doc.text(row[2], 280, y);
      y += 22;
    });
  }

  // ============================================================
  // DISCLAIMER
  // ============================================================
  renderDisclaimer(doc) {
    this.renderSectionHeader(doc, 'Important Disclaimer');

    let y = 100;

    doc.roundedRect(50, y, 495, 500, 5).fillAndStroke('#FEF3C7', this.colors.warning);

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

This report is provided "as is" without any warranties of any kind, either express or implied.`;

    doc.fillColor(this.colors.text).font('Helvetica').fontSize(9)
       .text(disclaimerText, 70, y + 20, { width: 455, lineGap: 3 });

    doc.fillColor(this.colors.textLight).font('Helvetica-Oblique').fontSize(9)
       .text(`Report generated: ${new Date().toISOString()}`, 70, y + 460)
       .text('WealthPilot Pro - AI-Powered Portfolio Intelligence', 70, y + 475);
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  renderSectionHeader(doc, title) {
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(20)
       .text(title, 50, 50);

    doc.moveTo(50, 80)
       .lineTo(545, 80)
       .strokeColor(this.colors.secondary)
       .lineWidth(2)
       .stroke();
  }

  drawRoundedRect(doc, x, y, width, height, radius, strokeColor, strokeWidth) {
    doc.roundedRect(x, y, width, height, radius)
       .lineWidth(strokeWidth)
       .strokeColor(strokeColor)
       .stroke();
  }

  addPageNumbers(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(this.colors.textLight)
         .font('Helvetica')
         .fontSize(9)
         .text(`Page ${i + 1} of ${pages.count}`, 50, 780, { align: 'center', width: 495 });
    }
  }
}

module.exports = new VisualPDFGenerator();
