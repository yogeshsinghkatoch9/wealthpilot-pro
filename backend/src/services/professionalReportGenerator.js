/**
 * Professional Report Generator
 * Creates LaTeX code AND professional PDF reports
 * Compiles LaTeX to PDF when pdflatex is available, falls back to PDFKit
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class ProfessionalReportGenerator {
  constructor() {
    // Check if LaTeX is available
    this.latexAvailable = this.checkLatexAvailable();
    console.log(`[ReportGenerator] LaTeX available: ${this.latexAvailable}`);

    // Professional color scheme
    this.colors = {
      primary: '#0F172A',      // Dark navy
      secondary: '#1E40AF',    // Royal blue
      accent: '#3B82F6',       // Bright blue
      success: '#059669',      // Emerald
      danger: '#DC2626',       // Red
      warning: '#D97706',      // Amber
      text: '#1F2937',         // Dark gray
      textLight: '#6B7280',    // Medium gray
      textMuted: '#9CA3AF',    // Light gray
      border: '#E5E7EB',
      background: '#F8FAFC',
      white: '#FFFFFF',
      gold: '#B8860B'
    };
  }

  /**
   * Check if LaTeX (pdflatex) is available on the system
   */
  checkLatexAvailable() {
    try {
      execSync('which pdflatex', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate both LaTeX and PDF reports
   * Uses pdflatex if available, otherwise falls back to PDFKit
   */
  async generateReport(portfolioData, outputDir) {
    const data = this.prepareData(portfolioData);
    const timestamp = Date.now();

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate LaTeX file
    const texPath = path.join(outputDir, `portfolio_report_${timestamp}.tex`);
    const latexCode = this.generateLatexCode(data);
    fs.writeFileSync(texPath, latexCode);
    console.log('[ReportGenerator] LaTeX code saved to:', texPath);

    // PDF path
    const pdfPath = path.join(outputDir, `portfolio_report_${timestamp}.pdf`);

    // Try to compile with LaTeX if available
    if (this.latexAvailable) {
      console.log('[ReportGenerator] Compiling LaTeX to PDF...');
      const compiled = await this.compileLatex(texPath, outputDir);

      if (compiled && fs.existsSync(pdfPath)) {
        console.log('[ReportGenerator] LaTeX PDF generated successfully:', pdfPath);
        // Clean up auxiliary files
        this.cleanupLatexFiles(outputDir, `portfolio_report_${timestamp}`);
        return { texPath, pdfPath, method: 'latex' };
      }
      console.log('[ReportGenerator] LaTeX compilation failed, falling back to PDFKit');
    }

    // Fallback to PDFKit
    console.log('[ReportGenerator] Generating PDF with PDFKit...');
    await this.generatePDF(data, pdfPath);
    console.log('[ReportGenerator] PDFKit PDF generated:', pdfPath);

    return { texPath, pdfPath, method: 'pdfkit' };
  }

  /**
   * Compile LaTeX to PDF using pdflatex
   */
  async compileLatex(texPath, outputDir) {
    return new Promise((resolve) => {
      try {
        // Run pdflatex twice for proper cross-references
        const options = {
          cwd: outputDir,
          stdio: 'pipe',
          timeout: 60000 // 60 second timeout
        };

        // First pass
        execSync(`pdflatex -interaction=nonstopmode -output-directory="${outputDir}" "${texPath}"`, options);

        // Second pass for cross-references
        execSync(`pdflatex -interaction=nonstopmode -output-directory="${outputDir}" "${texPath}"`, options);

        resolve(true);
      } catch (error) {
        console.error('[ReportGenerator] LaTeX compilation error:', error.message);
        resolve(false);
      }
    });
  }

  /**
   * Clean up LaTeX auxiliary files
   */
  cleanupLatexFiles(outputDir, baseName) {
    const extensions = ['.aux', '.log', '.out', '.toc', '.lof', '.lot'];
    extensions.forEach(ext => {
      const filePath = path.join(outputDir, baseName + ext);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  }

  /**
   * Prepare all data calculations
   */
  prepareData(portfolioData) {
    const holdings = portfolioData.holdings || [];
    const totalValue = portfolioData.totalValue || 0;

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
      diversificationScore: Math.max(0, 100 - (hhi * 1000)),
      generatedAt: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    };
  }

  /**
   * Generate LaTeX code
   */
  generateLatexCode(data) {
    const escapeLatex = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/&/g, '\\&')
        .replace(/%/g, '\\%')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/_/g, '\\_')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
    };

    const formatCurrency = (val) => `\\$${(val || 0).toLocaleString()}`;
    const formatPercent = (val) => `${(val || 0) >= 0 ? '+' : ''}${(val || 0).toFixed(2)}\\%`;

    let healthStatus = data.totalGainPercent > 15 ? 'EXCELLENT' :
                       data.totalGainPercent > 5 ? 'GOOD' :
                       data.totalGainPercent > 0 ? 'MODERATE' : 'NEEDS ATTENTION';

    const healthColor = data.totalGainPercent > 15 ? 'green!70!black' :
                        data.totalGainPercent > 5 ? 'green!50!black' :
                        data.totalGainPercent > 0 ? 'orange!80!black' : 'red!70!black';

    return `%% WealthPilot Pro - Portfolio Analysis Report
%% Generated: ${data.generatedAt}
%% LaTeX Code - Compile with pdflatex

\\documentclass[11pt,a4paper]{article}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage{fancyhdr}
\\usepackage{titlesec}
\\usepackage{hyperref}
\\usepackage{fontawesome5}
\\usepackage{tcolorbox}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{multirow}

\\pgfplotsset{compat=1.18}
\\usetikzlibrary{patterns,shadows,positioning,calc}

% Colors
\\definecolor{primary}{HTML}{0F172A}
\\definecolor{secondary}{HTML}{1E40AF}
\\definecolor{accent}{HTML}{3B82F6}
\\definecolor{success}{HTML}{059669}
\\definecolor{danger}{HTML}{DC2626}
\\definecolor{warning}{HTML}{D97706}
\\definecolor{lightbg}{HTML}{F8FAFC}
\\definecolor{border}{HTML}{E5E7EB}

% Page style
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textcolor{primary}{\\textbf{WealthPilot Pro}}}
\\fancyhead[R]{\\textcolor{gray}{Portfolio Analysis Report}}
\\fancyfoot[C]{\\textcolor{gray}{Page \\thepage}}
\\renewcommand{\\headrulewidth}{0.5pt}

% Title formatting
\\titleformat{\\section}{\\Large\\bfseries\\color{primary}}{\\thesection}{1em}{}[\\titlerule]
\\titleformat{\\subsection}{\\large\\bfseries\\color{secondary}}{\\thesubsection}{1em}{}

\\begin{document}

% ============================================================
% COVER PAGE
% ============================================================
\\begin{titlepage}
\\centering
\\vspace*{2cm}

{\\Huge\\bfseries\\textcolor{primary}{WealthPilot Pro}}\\\\[0.5cm]
{\\Large\\textcolor{secondary}{AI-Powered Portfolio Intelligence}}\\\\[2cm]

\\begin{tikzpicture}
\\draw[primary, line width=2pt] (0,0) -- (12,0);
\\end{tikzpicture}\\\\[1cm]

{\\LARGE\\bfseries Portfolio Analysis Report}\\\\[0.5cm]
{\\Large ${escapeLatex(data.name || 'Investment Portfolio')}}\\\\[1cm]

{\\large ${data.generatedAt}}\\\\[2cm]

\\begin{tcolorbox}[colback=lightbg,colframe=border,width=0.8\\textwidth,arc=3mm]
\\centering
\\begin{tabular}{cc}
\\textbf{Total Portfolio Value} & \\textbf{Total Return} \\\\[0.3cm]
{\\LARGE\\textcolor{primary}{${formatCurrency(data.totalValue)}}} &
{\\LARGE\\textcolor{${data.totalGainPercent >= 0 ? 'success' : 'danger'}}{${formatPercent(data.totalGainPercent)}}} \\\\[0.5cm]
\\textbf{Holdings} & \\textbf{Dividend Yield} \\\\[0.3cm]
{\\LARGE\\textcolor{primary}{${data.holdings?.length || 0}}} &
{\\LARGE\\textcolor{secondary}{${(data.dividends?.yield || 0).toFixed(2)}\\%}} \\\\
\\end{tabular}
\\end{tcolorbox}

\\vfill
{\\small\\textcolor{gray}{Powered by AI Analysis $\\bullet$ For Informational Purposes Only}}
\\end{titlepage}

% ============================================================
% EXECUTIVE SUMMARY
% ============================================================
\\section{Executive Summary}

\\begin{tcolorbox}[colback=${healthColor}!10,colframe=${healthColor},title={\\textbf{Portfolio Health: ${healthStatus}}},fonttitle=\\large\\bfseries]
Your portfolio has delivered a total return of \\textbf{${formatPercent(data.totalGainPercent)}} with \\textbf{${data.winRate.toFixed(0)}\\%} of positions profitable. The portfolio contains ${data.holdings?.length || 0} holdings across ${data.sectorEntries?.length || 0} sectors.
\\end{tcolorbox}

\\subsection{Key Metrics}

\\begin{center}
\\begin{tabular}{|l|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Metric} & \\textbf{Value} \\\\
\\hline
Total Portfolio Value & ${formatCurrency(data.totalValue)} \\\\
Total Cost Basis & ${formatCurrency(data.totalCostBasis)} \\\\
Total Gain/Loss & ${formatCurrency(data.totalGain)} (${formatPercent(data.totalGainPercent)}) \\\\
Win Rate & ${data.winRate.toFixed(1)}\\% (${data.profitableCount}/${data.holdings?.length || 0} positions) \\\\
Portfolio Yield & ${(data.dividends?.yield || 0).toFixed(2)}\\% \\\\
Annual Dividend Income & ${formatCurrency(data.dividends?.annualIncome || 0)} \\\\
\\hline
\\end{tabular}
\\end{center}

% ============================================================
% PORTFOLIO ALLOCATION
% ============================================================
\\section{Portfolio Allocation}

\\subsection{Sector Breakdown}

\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
    ybar,
    width=14cm,
    height=8cm,
    bar width=0.6cm,
    ylabel={Allocation (\\%)},
    symbolic x coords={${data.sectorEntries?.slice(0, 8).map(([s]) => escapeLatex(s)).join(',')}},
    xtick=data,
    x tick label style={rotate=45,anchor=east,font=\\small},
    ymin=0,
    ymax=${Math.ceil(Math.max(...data.sectorEntries?.map(([,d]) => d.percentage) || [50]) / 10) * 10 + 10},
    nodes near coords,
    nodes near coords style={font=\\scriptsize},
    every axis plot/.append style={fill=accent!70},
    axis lines*=left,
    ymajorgrids=true,
    grid style={dashed,gray!30},
]
\\addplot coordinates {${data.sectorEntries?.slice(0, 8).map(([s, d]) => `(${escapeLatex(s)},${(d.percentage || 0).toFixed(1)})`).join(' ')}};
\\end{axis}
\\end{tikzpicture}
\\end{center}

\\subsection{Top 10 Holdings}

\\begin{center}
\\begin{tabular}{|c|l|r|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{\\#} & \\textbf{Symbol} & \\textbf{Value} & \\textbf{Weight} & \\textbf{Return} & \\textbf{Sector} \\\\
\\hline
${data.byValue?.slice(0, 10).map((h, i) => {
  const weight = ((h.marketValue || 0) / data.totalValue * 100).toFixed(1);
  const returnColor = (h.gainPercent || 0) >= 0 ? 'success' : 'danger';
  return `${i + 1} & ${escapeLatex(h.symbol)} & ${formatCurrency(h.marketValue)} & ${weight}\\% & \\textcolor{${returnColor}}{${formatPercent(h.gainPercent)}} & ${escapeLatex((h.sector || 'N/A').substring(0, 15))} \\\\\\hline`;
}).join('\n')}
\\end{tabular}
\\end{center}

% ============================================================
% PERFORMANCE ANALYSIS
% ============================================================
\\section{Performance Analysis}

\\subsection{Benchmark Comparison}

\\begin{center}
\\begin{tabular}{|l|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Index} & \\textbf{Return} & \\textbf{Your Portfolio} & \\textbf{Difference} \\\\
\\hline
S\\&P 500 & +12.50\\% & ${formatPercent(data.totalGainPercent)} & ${formatPercent(data.totalGainPercent - 12.5)} \\\\
NASDAQ & +15.20\\% & ${formatPercent(data.totalGainPercent)} & ${formatPercent(data.totalGainPercent - 15.2)} \\\\
Dow Jones & +10.80\\% & ${formatPercent(data.totalGainPercent)} & ${formatPercent(data.totalGainPercent - 10.8)} \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Top Performers}

\\begin{center}
\\begin{tabular}{|l|r|r|}
\\hline
\\rowcolor{success!20}
\\textbf{Symbol} & \\textbf{Return} & \\textbf{Gain} \\\\
\\hline
${data.byGain?.filter(h => (h.gainPercent || 0) > 0).slice(0, 5).map(h =>
  `${escapeLatex(h.symbol)} & \\textcolor{success}{${formatPercent(h.gainPercent)}} & ${formatCurrency(h.gain)} \\\\\\hline`
).join('\n')}
\\end{tabular}
\\end{center}

\\subsection{Underperformers}

\\begin{center}
\\begin{tabular}{|l|r|r|}
\\hline
\\rowcolor{danger!20}
\\textbf{Symbol} & \\textbf{Return} & \\textbf{Loss} \\\\
\\hline
${data.byGain?.filter(h => (h.gainPercent || 0) < 0).slice(-5).reverse().map(h =>
  `${escapeLatex(h.symbol)} & \\textcolor{danger}{${formatPercent(h.gainPercent)}} & ${formatCurrency(h.gain)} \\\\\\hline`
).join('\n') || '\\textit{No losing positions} & - & - \\\\\\hline'}
\\end{tabular}
\\end{center}

% ============================================================
% RISK ASSESSMENT
% ============================================================
\\section{Risk Assessment}

\\begin{tcolorbox}[colback=lightbg,colframe=primary,title={\\textbf{Risk Score: ${data.riskScore}/10 (${data.riskScore <= 3 ? 'Conservative' : data.riskScore <= 6 ? 'Moderate' : 'Aggressive'})}},fonttitle=\\large\\bfseries]
\\begin{itemize}
\\item \\textbf{Concentration Risk:} ${data.top5Weight > 60 ? 'HIGH' : data.top5Weight > 40 ? 'MEDIUM' : 'LOW'} - Top 5 holdings represent ${data.top5Weight.toFixed(1)}\\% of portfolio
\\item \\textbf{Sector Risk:} ${(data.topSector[1]?.percentage || 0) > 40 ? 'HIGH' : 'MEDIUM'} - ${escapeLatex(data.topSector[0])} at ${(data.topSector[1]?.percentage || 0).toFixed(1)}\\%
\\item \\textbf{Diversification Score:} ${data.diversificationScore.toFixed(0)}/100
\\item \\textbf{HHI Index:} ${(data.hhi * 10000).toFixed(0)} (lower is more diversified)
\\end{itemize}
\\end{tcolorbox}

% ============================================================
% COMPLETE HOLDINGS
% ============================================================
\\section{Complete Holdings Detail}

\\begin{center}
\\small
\\begin{longtable}{|c|l|r|r|r|r|r|l|}
\\hline
\\rowcolor{primary!10}
\\textbf{\\#} & \\textbf{Symbol} & \\textbf{Shares} & \\textbf{Avg Cost} & \\textbf{Price} & \\textbf{Value} & \\textbf{Return} & \\textbf{Sector} \\\\
\\hline
\\endhead
${data.holdings?.map((h, i) => {
  const returnColor = (h.gainPercent || 0) >= 0 ? 'success' : 'danger';
  return `${i + 1} & ${escapeLatex(h.symbol)} & ${(h.shares || 0).toFixed(2)} & \\$${(h.avgCostBasis || 0).toFixed(2)} & \\$${(h.currentPrice || 0).toFixed(2)} & ${formatCurrency(h.marketValue)} & \\textcolor{${returnColor}}{${formatPercent(h.gainPercent)}} & ${escapeLatex((h.sector || 'N/A').substring(0, 12))} \\\\\\hline`;
}).join('\n')}
\\hline
\\rowcolor{primary!20}
\\multicolumn{5}{|r|}{\\textbf{TOTAL}} & \\textbf{${formatCurrency(data.totalValue)}} & \\textbf{${formatPercent(data.totalGainPercent)}} & \\\\
\\hline
\\end{longtable}
\\end{center}

% ============================================================
% DIVIDEND ANALYSIS
% ============================================================
\\section{Dividend Analysis}

\\subsection{Income Summary}

\\begin{center}
\\begin{tabular}{|l|r|}
\\hline
\\rowcolor{secondary!10}
\\textbf{Metric} & \\textbf{Value} \\\\
\\hline
Annual Dividend Income & ${formatCurrency(data.dividends?.annualIncome || 0)} \\\\
Portfolio Yield & ${(data.dividends?.yield || 0).toFixed(2)}\\% \\\\
Monthly Income & ${formatCurrency((data.dividends?.annualIncome || 0) / 12)} \\\\
Quarterly Income & ${formatCurrency((data.dividends?.annualIncome || 0) / 4)} \\\\
Dividend-Paying Holdings & ${data.byDividend?.length || 0} of ${data.holdings?.length || 0} \\\\
\\hline
\\end{tabular}
\\end{center}

% ============================================================
% RECOMMENDATIONS
% ============================================================
\\section{Recommendations}

\\begin{tcolorbox}[colback=accent!5,colframe=accent,title={\\textbf{Action Items}},fonttitle=\\large\\bfseries]
\\begin{enumerate}
${data.top5Weight > 50 ? '\\item \\textbf{Reduce Concentration:} Consider trimming top positions to reduce risk' : '\\item \\textbf{Concentration:} Position sizing is acceptable'}
${(data.topSector[1]?.percentage || 0) > 35 ? `\\item \\textbf{Sector Rebalancing:} Reduce ${escapeLatex(data.topSector[0])} exposure below 30\\%` : '\\item \\textbf{Sector Balance:} Allocation is well-balanced'}
${data.holdings?.length < 15 ? '\\item \\textbf{Diversify:} Consider adding 5-10 more positions' : '\\item \\textbf{Diversification:} Position count is adequate'}
${data.byGain?.filter(h => h.gainPercent > 50).length > 0 ? '\\item \\textbf{Take Profits:} Consider trimming positions with >50\\% gains' : ''}
\\end{enumerate}
\\end{tcolorbox}

% ============================================================
% DISCLAIMER
% ============================================================
\\section*{Important Disclaimer}

\\begin{tcolorbox}[colback=warning!10,colframe=warning]
\\small
This report is generated by WealthPilot Pro for \\textbf{informational purposes only}. It does not constitute financial advice, investment recommendations, or an offer to buy or sell securities.

\\textbf{Past performance is not indicative of future results.} All investments involve risk, including the potential loss of principal. Before making investment decisions, consult with a qualified financial advisor.

\\vspace{0.3cm}
\\textit{Report generated: ${data.generatedAt}}
\\end{tcolorbox}

\\end{document}
`;
  }

  /**
   * Generate Professional PDF
   */
  async generatePDF(data, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          bufferPages: true,
          info: {
            Title: `${data.name} - Portfolio Analysis Report`,
            Author: 'WealthPilot Pro',
            Subject: 'Investment Portfolio Analysis'
          }
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Generate all pages
        this.renderCoverPage(doc, data);
        doc.addPage();
        this.renderExecutiveSummary(doc, data);
        doc.addPage();
        this.renderPortfolioHealth(doc, data);
        doc.addPage();
        this.renderAllocationPage(doc, data);
        doc.addPage();
        this.renderPerformancePage(doc, data);
        doc.addPage();
        this.renderRiskPage(doc, data);
        doc.addPage();
        this.renderHoldingsPage(doc, data);
        doc.addPage();
        this.renderDividendsPage(doc, data);
        doc.addPage();
        this.renderRecommendationsPage(doc, data);
        doc.addPage();
        this.renderDisclaimerPage(doc, data);

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

  // ============================================================
  // COVER PAGE
  // ============================================================
  renderCoverPage(doc, data) {
    // Header bar
    doc.rect(0, 0, 595, 120).fill(this.colors.primary);

    // Logo area
    doc.fillColor(this.colors.white)
       .font('Helvetica-Bold')
       .fontSize(32)
       .text('WEALTHPILOT PRO', 50, 40);

    doc.fontSize(14)
       .font('Helvetica')
       .text('AI-Powered Portfolio Intelligence', 50, 80);

    // Main title area
    doc.fillColor(this.colors.primary)
       .font('Helvetica-Bold')
       .fontSize(36)
       .text('Portfolio Analysis', 50, 200, { align: 'center', width: 495 })
       .fontSize(36)
       .text('Report', 50, 245, { align: 'center', width: 495 });

    // Decorative line
    doc.moveTo(150, 300).lineTo(445, 300)
       .strokeColor(this.colors.secondary).lineWidth(3).stroke();

    // Portfolio name
    doc.fillColor(this.colors.text)
       .font('Helvetica')
       .fontSize(20)
       .text(data.name || 'Investment Portfolio', 50, 330, { align: 'center', width: 495 });

    // Date
    doc.fillColor(this.colors.textLight)
       .fontSize(14)
       .text(data.generatedAt, 50, 360, { align: 'center', width: 495 });

    // Metrics boxes
    const boxY = 420;
    const boxWidth = 220;
    const boxHeight = 100;
    const gap = 55;

    // Left box - Total Value
    doc.roundedRect(50, boxY, boxWidth, boxHeight, 8)
       .fillAndStroke(this.colors.background, this.colors.border);
    doc.fillColor(this.colors.textLight).fontSize(11)
       .text('TOTAL PORTFOLIO VALUE', 50, boxY + 20, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(28)
       .text(`$${(data.totalValue || 0).toLocaleString()}`, 50, boxY + 45, { align: 'center', width: boxWidth });

    // Right box - Total Return
    doc.roundedRect(50 + boxWidth + gap, boxY, boxWidth, boxHeight, 8)
       .fillAndStroke(this.colors.background, this.colors.border);
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(11)
       .text('TOTAL RETURN', 50 + boxWidth + gap, boxY + 20, { align: 'center', width: boxWidth });
    const returnColor = data.totalGainPercent >= 0 ? this.colors.success : this.colors.danger;
    doc.fillColor(returnColor).font('Helvetica-Bold').fontSize(28)
       .text(`${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`,
             50 + boxWidth + gap, boxY + 45, { align: 'center', width: boxWidth });

    // Bottom row boxes
    const box2Y = boxY + boxHeight + 20;

    // Holdings box
    doc.roundedRect(50, box2Y, boxWidth, boxHeight, 8)
       .fillAndStroke(this.colors.background, this.colors.border);
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(11)
       .text('HOLDINGS', 50, box2Y + 20, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.secondary).font('Helvetica-Bold').fontSize(28)
       .text(`${data.holdings?.length || 0}`, 50, box2Y + 45, { align: 'center', width: boxWidth });

    // Dividend Yield box
    doc.roundedRect(50 + boxWidth + gap, box2Y, boxWidth, boxHeight, 8)
       .fillAndStroke(this.colors.background, this.colors.border);
    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(11)
       .text('DIVIDEND YIELD', 50 + boxWidth + gap, box2Y + 20, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.secondary).font('Helvetica-Bold').fontSize(28)
       .text(`${(data.dividends?.yield || 0).toFixed(2)}%`,
             50 + boxWidth + gap, box2Y + 45, { align: 'center', width: boxWidth });

    // Footer
    doc.fillColor(this.colors.textMuted)
       .font('Helvetica-Oblique')
       .fontSize(10)
       .text('Powered by AI Analysis', 50, 750, { align: 'center', width: 495 });
  }

  // ============================================================
  // EXECUTIVE SUMMARY
  // ============================================================
  renderExecutiveSummary(doc, data) {
    this.renderHeader(doc, 'Executive Summary');
    let y = 100;

    // Health status box
    let healthStatus, healthColor, healthBg;
    if (data.totalGainPercent > 15) {
      healthStatus = 'EXCELLENT'; healthColor = this.colors.success; healthBg = '#ECFDF5';
    } else if (data.totalGainPercent > 5) {
      healthStatus = 'GOOD'; healthColor = this.colors.success; healthBg = '#ECFDF5';
    } else if (data.totalGainPercent > 0) {
      healthStatus = 'MODERATE'; healthColor = this.colors.warning; healthBg = '#FFFBEB';
    } else {
      healthStatus = 'NEEDS ATTENTION'; healthColor = this.colors.danger; healthBg = '#FEF2F2';
    }

    doc.roundedRect(50, y, 495, 80, 8).fillAndStroke(healthBg, healthColor);
    doc.fillColor(healthColor).font('Helvetica-Bold').fontSize(16)
       .text(`Portfolio Health: ${healthStatus}`, 70, y + 20);
    doc.fillColor(this.colors.text).font('Helvetica').fontSize(11)
       .text(`Your portfolio has delivered a total return of ${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}% ` +
             `with ${data.winRate.toFixed(0)}% of positions profitable. ` +
             `The portfolio contains ${data.holdings?.length || 0} holdings across ${data.sectorEntries?.length || 0} sectors.`,
             70, y + 45, { width: 455 });

    y += 110;

    // Key Metrics Table
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Key Performance Metrics', 50, y);

    y += 30;

    // Table header
    doc.rect(50, y, 495, 28).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Metric', 60, y + 9);
    doc.text('Value', 350, y + 9);

    y += 32;

    const metrics = [
      ['Total Portfolio Value', `$${(data.totalValue || 0).toLocaleString()}`],
      ['Total Cost Basis', `$${(data.totalCostBasis || 0).toLocaleString()}`],
      ['Total Gain/Loss', `$${data.totalGain >= 0 ? '+' : ''}${(data.totalGain || 0).toLocaleString()} (${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%)`],
      ['Win Rate', `${data.winRate.toFixed(1)}% (${data.profitableCount} of ${data.holdings?.length || 0} profitable)`],
      ['Portfolio Yield', `${(data.dividends?.yield || 0).toFixed(2)}%`],
      ['Annual Dividend Income', `$${(data.dividends?.annualIncome || 0).toLocaleString()}`],
      ['Number of Holdings', `${data.holdings?.length || 0}`],
      ['Number of Sectors', `${data.sectorEntries?.length || 0}`]
    ];

    metrics.forEach((m, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 2, 495, 26).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(m[0], 60, y + 5);
      doc.font('Helvetica-Bold').text(m[1], 350, y + 5);
      y += 26;
    });
  }

  // ============================================================
  // PORTFOLIO HEALTH - Simple Visual Page
  // ============================================================
  renderPortfolioHealth(doc, data) {
    this.renderHeader(doc, 'Portfolio Health at a Glance');

    doc.fillColor(this.colors.textLight).font('Helvetica').fontSize(12)
       .text('Simple overview for quick understanding', 50, 85, { align: 'center', width: 495 });

    let y = 130;

    // Large health indicator
    let healthStatus, healthColor, healthBg;
    if (data.totalGainPercent > 15) {
      healthStatus = 'EXCELLENT'; healthColor = this.colors.success; healthBg = '#ECFDF5';
    } else if (data.totalGainPercent > 5) {
      healthStatus = 'GOOD'; healthColor = this.colors.success; healthBg = '#ECFDF5';
    } else if (data.totalGainPercent > 0) {
      healthStatus = 'MODERATE'; healthColor = this.colors.warning; healthBg = '#FFFBEB';
    } else {
      healthStatus = 'NEEDS ATTENTION'; healthColor = this.colors.danger; healthBg = '#FEF2F2';
    }

    doc.roundedRect(150, y, 295, 120, 10).fillAndStroke(healthBg, healthColor);
    doc.fillColor(healthColor).font('Helvetica-Bold').fontSize(42)
       .text(healthStatus, 150, y + 30, { align: 'center', width: 295 });
    doc.fillColor(this.colors.text).font('Helvetica').fontSize(14)
       .text(`Return: ${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`, 150, y + 85, { align: 'center', width: 295 });

    y += 150;

    // Three metric boxes
    const boxWidth = 150;
    const boxHeight = 90;
    const boxGap = 22;

    // Your Money
    doc.roundedRect(50, y, boxWidth, boxHeight, 8).fill('#EFF6FF');
    doc.fillColor(this.colors.textLight).fontSize(10).text('YOUR MONEY', 50, y + 15, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.secondary).font('Helvetica-Bold').fontSize(20)
       .text(`$${(data.totalValue || 0).toLocaleString()}`, 50, y + 38, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textMuted).font('Helvetica').fontSize(9)
       .text('Total portfolio value', 50, y + 65, { align: 'center', width: boxWidth });

    // Your Profit/Loss
    const plBg = data.totalGain >= 0 ? '#ECFDF5' : '#FEF2F2';
    const plColor = data.totalGain >= 0 ? this.colors.success : this.colors.danger;
    doc.roundedRect(50 + boxWidth + boxGap, y, boxWidth, boxHeight, 8).fill(plBg);
    doc.fillColor(this.colors.textLight).fontSize(10).text('YOUR PROFIT/LOSS', 50 + boxWidth + boxGap, y + 15, { align: 'center', width: boxWidth });
    doc.fillColor(plColor).font('Helvetica-Bold').fontSize(20)
       .text(`${data.totalGain >= 0 ? '+' : ''}$${Math.abs(data.totalGain || 0).toLocaleString()}`, 50 + boxWidth + boxGap, y + 38, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textMuted).font('Helvetica').fontSize(9)
       .text(data.totalGain >= 0 ? 'Money earned' : 'Money lost', 50 + boxWidth + boxGap, y + 65, { align: 'center', width: boxWidth });

    // Success Rate
    doc.roundedRect(50 + (boxWidth + boxGap) * 2, y, boxWidth, boxHeight, 8).fill('#EFF6FF');
    doc.fillColor(this.colors.textLight).fontSize(10).text('SUCCESS RATE', 50 + (boxWidth + boxGap) * 2, y + 15, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.secondary).font('Helvetica-Bold').fontSize(20)
       .text(`${data.winRate.toFixed(0)}%`, 50 + (boxWidth + boxGap) * 2, y + 38, { align: 'center', width: boxWidth });
    doc.fillColor(this.colors.textMuted).font('Helvetica').fontSize(9)
       .text('Winning positions', 50 + (boxWidth + boxGap) * 2, y + 65, { align: 'center', width: boxWidth });

    y += 120;

    // Explanation box
    doc.roundedRect(50, y, 495, 180, 8).fillAndStroke(this.colors.background, this.colors.border);
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('What does this mean?', 70, y + 20);

    let explanation = '';
    if (data.totalGainPercent > 15) {
      explanation = 'Excellent news! Your portfolio is significantly outperforming the market. Your investment strategy is paying off well.';
    } else if (data.totalGainPercent > 5) {
      explanation = 'Great news! Your portfolio is performing well above average. Keep monitoring your investments.';
    } else if (data.totalGainPercent > 0) {
      explanation = 'Your portfolio is making money, though there\'s room for improvement. Consider reviewing underperforming positions.';
    } else {
      explanation = 'Your portfolio is currently showing losses. This might be a good time to review your investment strategy and holdings.';
    }

    explanation += `\n\nYou have ${data.holdings?.length || 0} different investments, `;
    explanation += data.holdings?.length < 10 ? 'which is relatively few - consider adding more for better diversification.' :
                   data.holdings?.length < 20 ? 'providing decent diversification across the market.' :
                   'giving you excellent diversification and reduced risk.';

    explanation += `\n\nYour biggest sector is ${data.topSector[0]} at ${(data.topSector[1]?.percentage || 0).toFixed(0)}% of your portfolio.`;

    if (data.dividends?.yield > 0) {
      explanation += ` Your investments generate approximately $${((data.dividends?.annualIncome || 0) / 12).toFixed(0)} per month in dividend income.`;
    }

    doc.fillColor(this.colors.text).font('Helvetica').fontSize(11)
       .text(explanation, 70, y + 45, { width: 455, lineGap: 4 });
  }

  // ============================================================
  // ALLOCATION PAGE
  // ============================================================
  renderAllocationPage(doc, data) {
    this.renderHeader(doc, 'Portfolio Allocation');
    let y = 100;

    // Sector breakdown
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Sector Breakdown', 50, y);

    y += 30;

    const sectorColors = [this.colors.secondary, this.colors.accent, this.colors.success,
                          this.colors.warning, this.colors.danger, '#8B5CF6', '#EC4899', '#6B7280'];

    data.sectorEntries?.slice(0, 8).forEach((entry, i) => {
      const [sector, sData] = entry;
      const percentage = sData.percentage || 0;
      const barWidth = Math.min(percentage * 4.5, 420);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(sector, 60, y, { width: 120 });

      doc.roundedRect(190, y - 2, 350, 22, 3).fill(this.colors.border);
      doc.roundedRect(190, y - 2, barWidth, 22, 3).fill(sectorColors[i % sectorColors.length]);

      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9)
         .text(`${percentage.toFixed(1)}%`, 195, y + 3);

      y += 35;
    });

    y += 20;

    // Top holdings table
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Top 10 Holdings by Value', 50, y);

    y += 25;

    doc.rect(50, y, 495, 28).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('#', 60, y + 9);
    doc.text('Symbol', 90, y + 9);
    doc.text('Value', 200, y + 9);
    doc.text('Weight', 300, y + 9);
    doc.text('Return', 380, y + 9);
    doc.text('Sector', 460, y + 9);

    y += 32;

    data.byValue?.slice(0, 10).forEach((h, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 2, 495, 24).fill(rowBg);

      const weight = ((h.marketValue || 0) / data.totalValue * 100);
      const returnColor = (h.gainPercent || 0) >= 0 ? this.colors.success : this.colors.danger;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(`${i + 1}`, 60, y + 4);
      doc.font('Helvetica-Bold').text(h.symbol, 90, y + 4);
      doc.font('Helvetica').text(`$${(h.marketValue || 0).toLocaleString()}`, 200, y + 4);
      doc.text(`${weight.toFixed(1)}%`, 300, y + 4);
      doc.fillColor(returnColor).text(`${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(1)}%`, 380, y + 4);
      doc.fillColor(this.colors.textLight).fontSize(8).text((h.sector || 'N/A').substring(0, 12), 460, y + 4);

      y += 24;
    });
  }

  // ============================================================
  // PERFORMANCE PAGE
  // ============================================================
  renderPerformancePage(doc, data) {
    this.renderHeader(doc, 'Performance Analysis');
    let y = 100;

    // Benchmark comparison
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Benchmark Comparison', 50, y);

    y += 30;

    const benchmarks = [
      { name: 'Your Portfolio', value: data.totalGainPercent, isYours: true },
      { name: 'S&P 500', value: 12.5, isYours: false },
      { name: 'NASDAQ', value: 15.2, isYours: false },
      { name: 'Dow Jones', value: 10.8, isYours: false }
    ];

    benchmarks.forEach(b => {
      const barWidth = Math.max(10, Math.min((b.value + 10) * 12, 350));
      const barColor = b.isYours ?
        (b.value >= 0 ? this.colors.success : this.colors.danger) :
        this.colors.textLight;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(b.name, 60, y, { width: 100 });

      doc.roundedRect(170, y - 2, 370, 22, 3).fill(this.colors.border);
      doc.roundedRect(170, y - 2, barWidth, 22, 3).fill(barColor);

      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9)
         .text(`${b.value >= 0 ? '+' : ''}${b.value.toFixed(1)}%`, 175, y + 3);

      y += 35;
    });

    y += 20;

    // Winners and Losers side by side
    const colWidth = 235;
    const tableY = y;

    // Winners
    doc.fillColor(this.colors.success).font('Helvetica-Bold').fontSize(12)
       .text('Top Winners', 50, tableY);

    doc.rect(50, tableY + 20, colWidth, 25).fill(this.colors.success);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9);
    doc.text('Symbol', 60, tableY + 28);
    doc.text('Return', 150, tableY + 28);
    doc.text('Gain', 210, tableY + 28);

    let wy = tableY + 50;
    data.byGain?.filter(h => h.gainPercent > 0).slice(0, 5).forEach((h, i) => {
      const rowBg = i % 2 === 0 ? '#ECFDF5' : this.colors.white;
      doc.rect(50, wy - 3, colWidth, 22).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(h.symbol, 60, wy + 2);
      doc.fillColor(this.colors.success).text(`+${h.gainPercent.toFixed(1)}%`, 150, wy + 2);
      doc.fillColor(this.colors.text).text(`$${(h.gain || 0).toLocaleString()}`, 210, wy + 2);
      wy += 22;
    });

    // Losers
    doc.fillColor(this.colors.danger).font('Helvetica-Bold').fontSize(12)
       .text('Underperformers', 310, tableY);

    doc.rect(310, tableY + 20, colWidth, 25).fill(this.colors.danger);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9);
    doc.text('Symbol', 320, tableY + 28);
    doc.text('Return', 410, tableY + 28);
    doc.text('Loss', 470, tableY + 28);

    let ly = tableY + 50;
    const losers = data.byGain?.filter(h => h.gainPercent < 0).slice(-5).reverse() || [];
    if (losers.length > 0) {
      losers.forEach((h, i) => {
        const rowBg = i % 2 === 0 ? '#FEF2F2' : this.colors.white;
        doc.rect(310, ly - 3, colWidth, 22).fill(rowBg);
        doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
        doc.text(h.symbol, 320, ly + 2);
        doc.fillColor(this.colors.danger).text(`${h.gainPercent.toFixed(1)}%`, 410, ly + 2);
        doc.fillColor(this.colors.text).text(`$${(h.gain || 0).toLocaleString()}`, 470, ly + 2);
        ly += 22;
      });
    } else {
      doc.fillColor(this.colors.success).font('Helvetica-Oblique').fontSize(10)
         .text('All positions profitable!', 320, ly + 10);
    }
  }

  // ============================================================
  // RISK PAGE
  // ============================================================
  renderRiskPage(doc, data) {
    this.renderHeader(doc, 'Risk Assessment');
    let y = 100;

    // Risk score
    const riskColor = data.riskScore <= 3 ? this.colors.success :
                      data.riskScore <= 6 ? this.colors.warning : this.colors.danger;
    const riskLabel = data.riskScore <= 3 ? 'Conservative' :
                      data.riskScore <= 6 ? 'Moderate' : 'Aggressive';
    const riskBg = data.riskScore <= 3 ? '#ECFDF5' :
                   data.riskScore <= 6 ? '#FFFBEB' : '#FEF2F2';

    doc.roundedRect(150, y, 295, 100, 10).fillAndStroke(riskBg, riskColor);
    doc.fillColor(riskColor).font('Helvetica-Bold').fontSize(48)
       .text(`${data.riskScore}/10`, 150, y + 20, { align: 'center', width: 295 });
    doc.fontSize(18).text(riskLabel, 150, y + 70, { align: 'center', width: 295 });

    y += 130;

    // Risk metrics
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Risk Metrics', 50, y);

    y += 25;

    doc.rect(50, y, 495, 28).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
    doc.text('Risk Factor', 60, y + 9);
    doc.text('Level', 200, y + 9);
    doc.text('Value', 280, y + 9);
    doc.text('Assessment', 400, y + 9);

    y += 32;

    const riskMetrics = [
      ['Concentration', data.top5Weight > 60 ? 'HIGH' : data.top5Weight > 40 ? 'MEDIUM' : 'LOW',
       `${data.top5Weight.toFixed(0)}% in top 5`, data.top5Weight > 60 ? 'Consider diversifying' : 'Acceptable'],
      ['Sector Exposure', (data.topSector[1]?.percentage || 0) > 40 ? 'HIGH' : 'MEDIUM',
       `${(data.topSector[1]?.percentage || 0).toFixed(0)}% in ${data.topSector[0]}`,
       (data.topSector[1]?.percentage || 0) > 40 ? 'Overexposed' : 'Balanced'],
      ['Diversification', data.diversificationScore > 70 ? 'GOOD' : data.diversificationScore > 50 ? 'MODERATE' : 'POOR',
       `${data.diversificationScore.toFixed(0)}/100`, data.diversificationScore > 70 ? 'Well diversified' : 'Needs improvement'],
      ['Position Count', data.holdings?.length >= 20 ? 'GOOD' : data.holdings?.length >= 10 ? 'MODERATE' : 'LOW',
       `${data.holdings?.length || 0} positions`, data.holdings?.length < 15 ? 'Add positions' : 'Adequate']
    ];

    riskMetrics.forEach((rm, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      const levelColor = rm[1] === 'HIGH' || rm[1] === 'POOR' || rm[1] === 'LOW' ? this.colors.danger :
                         rm[1] === 'GOOD' ? this.colors.success : this.colors.warning;

      doc.rect(50, y - 2, 495, 26).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(9);
      doc.text(rm[0], 60, y + 5);
      doc.fillColor(levelColor).font('Helvetica-Bold').text(rm[1], 200, y + 5);
      doc.fillColor(this.colors.text).font('Helvetica').text(rm[2], 280, y + 5);
      doc.fillColor(this.colors.textLight).text(rm[3], 400, y + 5);
      y += 26;
    });

    y += 30;

    // Value at Risk
    const var95 = data.totalValue * 1.645 * 0.012 * Math.sqrt(21);

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Value at Risk (VaR) Analysis', 50, y);

    y += 25;

    [
      ['Portfolio Value', `$${(data.totalValue || 0).toLocaleString()}`],
      ['95% Monthly VaR', `$${var95.toLocaleString()}`],
      ['Max Expected Loss (95%)', `${(var95 / data.totalValue * 100).toFixed(2)}%`],
      ['HHI Concentration Index', `${(data.hhi * 10000).toFixed(0)}`]
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 2, 350, 24).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(row[0], 60, y + 4);
      doc.font('Helvetica-Bold').text(row[1], 250, y + 4);
      y += 24;
    });
  }

  // ============================================================
  // ALL HOLDINGS PAGE
  // ============================================================
  renderHoldingsPage(doc, data) {
    this.renderHeader(doc, `Complete Holdings (${data.holdings?.length || 0} Positions)`);
    let y = 100;

    const renderHeader = (yPos) => {
      doc.rect(50, yPos, 495, 25).fill(this.colors.primary);
      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(8);
      doc.text('#', 55, yPos + 8);
      doc.text('Symbol', 75, yPos + 8);
      doc.text('Shares', 130, yPos + 8);
      doc.text('Avg Cost', 175, yPos + 8);
      doc.text('Price', 225, yPos + 8);
      doc.text('Value', 280, yPos + 8);
      doc.text('Gain/Loss', 345, yPos + 8);
      doc.text('Return', 415, yPos + 8);
      doc.text('Sector', 470, yPos + 8);
      return yPos + 28;
    };

    y = renderHeader(y);

    data.holdings?.forEach((h, i) => {
      if (y > 720) {
        doc.addPage();
        this.renderHeader(doc, 'Complete Holdings (continued)');
        y = renderHeader(100);
      }

      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 2, 495, 20).fill(rowBg);

      const gainColor = (h.gainPercent || 0) >= 0 ? this.colors.success : this.colors.danger;

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(8);
      doc.text(`${i + 1}`, 55, y + 3);
      doc.font('Helvetica-Bold').text(h.symbol, 75, y + 3);
      doc.font('Helvetica').text((h.shares || 0).toFixed(2), 130, y + 3);
      doc.text(`$${(h.avgCostBasis || 0).toFixed(2)}`, 175, y + 3);
      doc.text(`$${(h.currentPrice || 0).toFixed(2)}`, 225, y + 3);
      doc.text(`$${(h.marketValue || 0).toLocaleString()}`, 280, y + 3);
      doc.fillColor(gainColor).text(`$${(h.gain || 0) >= 0 ? '+' : ''}${(h.gain || 0).toLocaleString()}`, 345, y + 3);
      doc.text(`${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(1)}%`, 415, y + 3);
      doc.fillColor(this.colors.textLight).fontSize(7).text((h.sector || 'N/A').substring(0, 10), 470, y + 3);

      y += 20;
    });

    // Total row
    y += 5;
    doc.rect(50, y, 495, 25).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', 75, y + 8);
    doc.text(`$${(data.totalValue || 0).toLocaleString()}`, 280, y + 8);
    doc.text(`$${data.totalGain >= 0 ? '+' : ''}${(data.totalGain || 0).toLocaleString()}`, 345, y + 8);
    doc.text(`${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}%`, 415, y + 8);
  }

  // ============================================================
  // DIVIDENDS PAGE
  // ============================================================
  renderDividendsPage(doc, data) {
    this.renderHeader(doc, 'Dividend Analysis');
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
      ['Dividend-Paying Holdings', `${data.byDividend?.length || 0} of ${data.holdings?.length || 0}`]
    ].forEach((row, i) => {
      const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
      doc.rect(50, y - 2, 350, 26).fill(rowBg);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
      doc.text(row[0], 60, y + 5);
      doc.font('Helvetica-Bold').text(row[1], 250, y + 5);
      y += 26;
    });

    y += 30;

    // Top dividend payers
    if (data.byDividend?.length > 0) {
      doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
         .text('Top Dividend Payers', 50, y);

      y += 25;

      doc.rect(50, y, 495, 25).fill(this.colors.secondary);
      doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10);
      doc.text('Symbol', 60, y + 7);
      doc.text('Yield', 150, y + 7);
      doc.text('Annual Dividend', 250, y + 7);
      doc.text('Contribution', 400, y + 7);

      y += 28;

      data.byDividend?.slice(0, 10).forEach((h, i) => {
        const annualDiv = (h.marketValue || 0) * ((h.dividendYield || 0) / 100);
        const contrib = totalDividends > 0 ? (annualDiv / totalDividends * 100) : 0;

        const rowBg = i % 2 === 0 ? this.colors.background : this.colors.white;
        doc.rect(50, y - 2, 495, 24).fill(rowBg);

        doc.fillColor(this.colors.text).font('Helvetica').fontSize(10);
        doc.font('Helvetica-Bold').text(h.symbol, 60, y + 4);
        doc.font('Helvetica').text(`${(h.dividendYield || 0).toFixed(2)}%`, 150, y + 4);
        doc.text(`$${annualDiv.toLocaleString()}`, 250, y + 4);
        doc.text(`${contrib.toFixed(1)}%`, 400, y + 4);

        y += 24;
      });
    }
  }

  // ============================================================
  // RECOMMENDATIONS PAGE
  // ============================================================
  renderRecommendationsPage(doc, data) {
    this.renderHeader(doc, 'Recommendations');
    let y = 100;

    const recommendations = [];

    const bigWinners = data.byGain?.filter(h => h.gainPercent > 50) || [];
    if (bigWinners.length > 0) {
      recommendations.push({
        action: 'TAKE PROFITS',
        symbols: bigWinners.map(h => h.symbol).join(', '),
        reason: 'Positions with >50% gains - consider locking in some profits',
        priority: 'High',
        color: this.colors.warning
      });
    }

    const topPosition = data.byValue?.[0];
    if (topPosition && (topPosition.marketValue / data.totalValue * 100) > 15) {
      recommendations.push({
        action: 'REDUCE CONCENTRATION',
        symbols: topPosition.symbol,
        reason: `Position exceeds 15% of portfolio (${((topPosition.marketValue / data.totalValue) * 100).toFixed(1)}%)`,
        priority: 'High',
        color: this.colors.danger
      });
    }

    if ((data.topSector[1]?.percentage || 0) > 35) {
      recommendations.push({
        action: 'SECTOR REBALANCE',
        symbols: data.topSector[0],
        reason: `Sector weight ${(data.topSector[1]?.percentage || 0).toFixed(1)}% exceeds target 30%`,
        priority: 'Medium',
        color: this.colors.secondary
      });
    }

    if (data.holdings?.length < 15) {
      recommendations.push({
        action: 'INCREASE DIVERSIFICATION',
        symbols: 'Add positions',
        reason: 'Portfolio has fewer than 15 holdings - consider adding 5-10 more',
        priority: 'Medium',
        color: this.colors.accent
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        action: 'MAINTAIN COURSE',
        symbols: 'Current allocation',
        reason: 'Portfolio is well-balanced with no immediate actions required',
        priority: 'Low',
        color: this.colors.success
      });
    }

    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Action Items', 50, y);

    y += 25;

    recommendations.forEach((r, i) => {
      doc.roundedRect(50, y, 495, 70, 8).fillAndStroke(this.colors.background, r.color);

      doc.fillColor(r.color).font('Helvetica-Bold').fontSize(12)
         .text(`${i + 1}. ${r.action}: ${r.symbols}`, 70, y + 15);

      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(`Reason: ${r.reason}`, 70, y + 35);

      doc.fillColor(this.colors.textLight).fontSize(9)
         .text(`Priority: ${r.priority}`, 70, y + 52);

      y += 85;
    });

    y += 20;

    // Strategic recommendations
    doc.fillColor(this.colors.primary).font('Helvetica-Bold').fontSize(14)
       .text('Strategic Recommendations', 50, y);

    y += 25;

    const strategic = [
      'Review portfolio quarterly for rebalancing opportunities',
      'Consider adding defensive positions for market volatility protection',
      'Monitor sector weightings against target allocations',
      'Evaluate dividend-paying stocks for income enhancement'
    ];

    strategic.forEach(s => {
      doc.fillColor(this.colors.secondary).fontSize(10).text('•', 60, y);
      doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
         .text(s, 75, y);
      y += 20;
    });
  }

  // ============================================================
  // DISCLAIMER PAGE
  // ============================================================
  renderDisclaimerPage(doc, data) {
    this.renderHeader(doc, 'Important Disclaimer');
    let y = 100;

    doc.roundedRect(50, y, 495, 600, 8).fillAndStroke('#FFFBEB', this.colors.warning);

    const disclaimer = `IMPORTANT NOTICE

This report is generated by WealthPilot Pro using artificial intelligence for educational and informational purposes only. It does not constitute financial advice, investment recommendations, or an offer to buy or sell any securities.

PAST PERFORMANCE WARNING

Past performance is not indicative of future results. All investments involve risk, including the potential loss of principal. The analysis and recommendations contained in this report are based on the data provided and may not account for all relevant factors.

BEFORE MAKING INVESTMENT DECISIONS

Before making any investment decisions, you should:
• Consult with a qualified financial advisor
• Consider your own financial situation and objectives
• Conduct your own due diligence
• Review prospectus and documents for any securities

AI-GENERATED CONTENT

The AI-generated content in this report may contain errors or inaccuracies. WealthPilot Pro makes no warranties regarding the accuracy, completeness, or timeliness of the information provided.

DATA LIMITATIONS

Market data and calculations are subject to delays and may not reflect current market conditions. Portfolio valuations are estimates based on available data.

NO WARRANTY

This report is provided "as is" without any warranties of any kind, either express or implied.`;

    doc.fillColor(this.colors.text).font('Helvetica').fontSize(10)
       .text(disclaimer, 70, y + 20, { width: 455, lineGap: 4 });

    doc.fillColor(this.colors.textLight).font('Helvetica-Oblique').fontSize(9)
       .text(`Report generated: ${data.generatedAt}`, 70, y + 560)
       .text('WealthPilot Pro - AI-Powered Portfolio Intelligence', 70, y + 575);
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================
  renderHeader(doc, title) {
    doc.rect(0, 0, 595, 60).fill(this.colors.primary);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(10)
       .text('WEALTHPILOT PRO', 50, 15);
    doc.fillColor(this.colors.white).font('Helvetica-Bold').fontSize(18)
       .text(title, 50, 32);
  }

  addPageNumbers(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(this.colors.textMuted)
         .font('Helvetica')
         .fontSize(9)
         .text(`Page ${i + 1} of ${pages.count}`, 50, 780, { align: 'center', width: 495 });
    }
  }
}

module.exports = new ProfessionalReportGenerator();
