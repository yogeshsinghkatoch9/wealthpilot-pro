/**
 * LaTeX Report Generator
 * Creates professional financial reports using LaTeX formatting
 * Converts to PDF for download
 */

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

class LaTeXReportGenerator {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureDirs();
  }

  ensureDirs() {
    [this.tempDir, this.reportsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate complete LaTeX report and convert to PDF
   */
  async generateReport(portfolioData, aiContent, outputPath) {
    const latex = this.generateLaTeXDocument(portfolioData, aiContent);

    // Try to compile with pdflatex, fallback to PDFKit if not available
    try {
      return await this.compileLaTeX(latex, outputPath);
    } catch (error) {
      console.log('[LaTeX] pdflatex not available, using fallback PDF generator');
      return await this.generateFallbackPDF(portfolioData, aiContent, outputPath);
    }
  }

  /**
   * Generate the complete LaTeX document
   */
  generateLaTeXDocument(data, aiContent) {
    const holdings = data.holdings || [];
    const totalValue = data.totalValue || 0;
    const totalGain = data.totalGain || 0;
    const totalGainPercent = data.totalGainPercent || 0;
    const sectorAllocation = data.sectorAllocation || {};
    const dividends = data.dividends || {};

    // Sort holdings
    const byValue = [...holdings].sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
    const byGain = [...holdings].sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0));
    const profitableCount = holdings.filter(h => (h.gainPercent || 0) > 0).length;
    const winRate = holdings.length > 0 ? (profitableCount / holdings.length * 100) : 0;

    // Calculate sector data
    const sectorEntries = Object.entries(sectorAllocation)
      .sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0));
    const topSector = sectorEntries[0] || ['Diversified', { percentage: 100 }];

    // Risk calculations
    const top5Weight = byValue.slice(0, 5).reduce((sum, h) => sum + ((h.marketValue || 0) / totalValue * 100), 0);
    const hhi = holdings.reduce((sum, h) => {
      const weight = (h.marketValue || 0) / totalValue;
      return sum + (weight * weight);
    }, 0);
    const diversificationScore = Math.max(0, 100 - (hhi * 1000));

    return `
\\documentclass[11pt,a4paper]{article}
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
\\usepackage{multirow}
\\usepackage{fancyhdr}
\\usepackage{titlesec}
\\usepackage{tcolorbox}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{calc}
\\usepackage{amsmath}
\\usepackage{hyperref}

\\pgfplotsset{compat=1.18}
\\usetikzlibrary{shapes,arrows,positioning,calc}

% Colors
\\definecolor{primary}{RGB}{30,58,138}
\\definecolor{secondary}{RGB}{59,130,246}
\\definecolor{success}{RGB}{5,150,105}
\\definecolor{danger}{RGB}{220,38,38}
\\definecolor{warning}{RGB}{245,158,11}
\\definecolor{lightgray}{RGB}{249,250,251}
\\definecolor{darktext}{RGB}{31,41,55}

% Header/Footer
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textcolor{primary}{\\textbf{WealthPilot Pro}}}
\\fancyhead[R]{\\textcolor{gray}{Portfolio Analysis Report}}
\\fancyfoot[C]{\\textcolor{gray}{Page \\thepage}}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\footrulewidth}{0.5pt}

% Section styling
\\titleformat{\\section}{\\Large\\bfseries\\color{primary}}{\\thesection}{1em}{}[\\titlerule]
\\titleformat{\\subsection}{\\large\\bfseries\\color{secondary}}{\\thesubsection}{1em}{}

% Custom boxes
\\tcbset{
  metricbox/.style={
    colback=lightgray,
    colframe=primary,
    boxrule=0.5pt,
    arc=3mm,
    left=5mm,
    right=5mm,
    top=3mm,
    bottom=3mm
  },
  highlightbox/.style={
    colback=primary!5,
    colframe=primary,
    boxrule=1pt,
    arc=2mm,
    left=5mm,
    right=5mm
  }
}

\\begin{document}

% ============================================================================
% COVER PAGE
% ============================================================================
\\begin{titlepage}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[primary] (current page.north west) rectangle ([yshift=-4cm]current page.north east);
\\end{tikzpicture}

\\vspace*{1cm}
{\\color{white}\\Huge\\bfseries WEALTHPILOT PRO}\\\\[0.3cm]
{\\color{white}\\large AI-Powered Portfolio Intelligence}

\\vspace{3cm}
\\begin{center}
{\\Huge\\bfseries\\color{primary} Portfolio Analysis Report}\\\\[1cm]
{\\LARGE ${this.escapeLatex(data.name || 'Investment Portfolio')}}\\\\[0.5cm]
{\\large\\color{gray} ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}}
\\end{center}

\\vspace{2cm}
\\begin{center}
\\begin{tikzpicture}
  \\node[draw=primary,line width=2pt,rounded corners=10pt,inner sep=20pt,fill=lightgray] {
    \\begin{tabular}{cc}
      \\begin{minipage}{0.4\\textwidth}
        \\centering
        {\\small\\color{gray}Total Portfolio Value}\\\\[0.2cm]
        {\\Huge\\color{primary}\\bfseries \\$${this.formatNumber(totalValue)}}
      \\end{minipage} &
      \\begin{minipage}{0.4\\textwidth}
        \\centering
        {\\small\\color{gray}Total Return}\\\\[0.2cm]
        {\\Huge\\color{${totalGainPercent >= 0 ? 'success' : 'danger'}}\\bfseries ${totalGainPercent >= 0 ? '+' : ''}${totalGainPercent.toFixed(2)}\\%}
      \\end{minipage}\\\\[1cm]
      \\begin{minipage}{0.4\\textwidth}
        \\centering
        {\\small\\color{gray}Number of Holdings}\\\\[0.2cm]
        {\\Huge\\color{primary}\\bfseries ${holdings.length}}
      \\end{minipage} &
      \\begin{minipage}{0.4\\textwidth}
        \\centering
        {\\small\\color{gray}Dividend Yield}\\\\[0.2cm]
        {\\Huge\\color{secondary}\\bfseries ${(dividends.yield || 0).toFixed(2)}\\%}
      \\end{minipage}
    \\end{tabular}
  };
\\end{tikzpicture}
\\end{center}

\\vfill
\\begin{center}
{\\color{gray}\\textit{Powered by AI Analysis}}\\\\
{\\small\\color{gray}This report is for informational purposes only}
\\end{center}
\\end{titlepage}

% ============================================================================
% PAGE 2: VISUAL SUMMARY - PORTFOLIO HEALTH AT A GLANCE
% ============================================================================
\\newpage
\\section*{\\centering Portfolio Health at a Glance}
\\vspace{0.5cm}

\\begin{center}
{\\large\\color{gray} Simple overview for quick understanding}
\\end{center}

\\vspace{1cm}

% Health Status Box
\\begin{tcolorbox}[highlightbox,title={\\color{white}\\bfseries Overall Portfolio Health},colbacktitle=primary]
\\begin{center}
\\begin{tikzpicture}
  % Health indicator
  ${this.generateHealthIndicator(totalGainPercent, winRate)}
\\end{tikzpicture}
\\end{center}
\\end{tcolorbox}

\\vspace{1cm}

% Key Numbers in Simple Terms
\\begin{center}
\\begin{tabular}{|>{{\\centering\\arraybackslash}}m{4cm}|>{{\\centering\\arraybackslash}}m{4cm}|>{{\\centering\\arraybackslash}}m{4cm}|}
\\hline
\\rowcolor{primary!10}
\\textbf{Your Money} & \\textbf{Your Profit/Loss} & \\textbf{Success Rate} \\\\
\\hline
\\cellcolor{lightgray}{\\LARGE \\$${this.formatNumber(totalValue)}} &
\\cellcolor{${totalGain >= 0 ? 'success!10' : 'danger!10'}}{\\LARGE \\color{${totalGain >= 0 ? 'success' : 'danger'}} ${totalGain >= 0 ? '+' : ''}\\$${this.formatNumber(totalGain)}} &
\\cellcolor{lightgray}{\\LARGE ${winRate.toFixed(0)}\\%} \\\\
{\\small Total invested} & {\\small ${totalGain >= 0 ? 'Money earned' : 'Money lost'}} & {\\small Winning positions} \\\\
\\hline
\\end{tabular}
\\end{center}

\\vspace{1cm}

% Simple Explanation
\\begin{tcolorbox}[metricbox]
\\textbf{What does this mean?}\\\\[0.3cm]
${this.generateSimpleExplanation(totalGainPercent, winRate, holdings.length, topSector)}
\\end{tcolorbox}

% ============================================================================
% PAGE 3: VISUAL CHARTS - WHERE IS YOUR MONEY?
% ============================================================================
\\newpage
\\section*{\\centering Where Is Your Money?}
\\vspace{0.5cm}

\\begin{center}
{\\large\\color{gray} Visual breakdown of your investments}
\\end{center}

\\vspace{1cm}

% Sector Pie Chart
\\subsection*{By Industry Sector}
\\begin{center}
\\begin{tikzpicture}
${this.generateSectorPieChart(sectorEntries)}
\\end{tikzpicture}
\\end{center}

\\vspace{1cm}

% Top Holdings Bar Chart
\\subsection*{Your Largest Investments}
\\begin{center}
\\begin{tikzpicture}
${this.generateHoldingsBarChart(byValue.slice(0, 5), totalValue)}
\\end{tikzpicture}
\\end{center}

% ============================================================================
% PAGE 4: VISUAL PERFORMANCE - HOW ARE YOU DOING?
% ============================================================================
\\newpage
\\section*{\\centering How Are Your Investments Performing?}
\\vspace{0.5cm}

\\begin{center}
{\\large\\color{gray} Winners and areas needing attention}
\\end{center}

\\vspace{1cm}

% Winners and Losers
\\begin{minipage}[t]{0.48\\textwidth}
\\begin{tcolorbox}[colback=success!5,colframe=success,title={\\color{white}\\bfseries Top Winners}]
${this.generateWinnersTable(byGain.filter(h => h.gainPercent > 0).slice(0, 5))}
\\end{tcolorbox}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
\\begin{tcolorbox}[colback=danger!5,colframe=danger,title={\\color{white}\\bfseries Needs Attention}]
${this.generateLosersTable(byGain.filter(h => h.gainPercent <= 0).slice(-5).reverse())}
\\end{tcolorbox}
\\end{minipage}

\\vspace{1cm}

% Performance vs Benchmark
\\subsection*{How You Compare to the Market}
\\begin{center}
\\begin{tikzpicture}
${this.generateBenchmarkComparison(totalGainPercent)}
\\end{tikzpicture}
\\end{center}

% ============================================================================
% PAGE 5: RISK OVERVIEW - IS YOUR MONEY SAFE?
% ============================================================================
\\newpage
\\section*{\\centering Is Your Money Safe?}
\\vspace{0.5cm}

\\begin{center}
{\\large\\color{gray} Understanding your investment risk}
\\end{center}

\\vspace{1cm}

% Risk Score
\\begin{center}
\\begin{tikzpicture}
${this.generateRiskGauge(this.calculateRiskScore(holdings, sectorEntries, top5Weight))}
\\end{tikzpicture}
\\end{center}

\\vspace{1cm}

% Risk Factors in Simple Terms
\\begin{tcolorbox}[metricbox]
\\textbf{Risk Factors Explained Simply:}\\\\[0.3cm]
\\begin{itemize}
  \\item \\textbf{Concentration:} ${top5Weight > 60 ? 'High - Too much money in few stocks' : top5Weight > 40 ? 'Medium - Moderately spread out' : 'Low - Well spread out'} (${top5Weight.toFixed(0)}\\% in top 5)
  \\item \\textbf{Diversification:} ${holdings.length < 10 ? 'Low - Need more variety' : holdings.length < 20 ? 'Medium - Good variety' : 'High - Excellent variety'} (${holdings.length} different investments)
  \\item \\textbf{Sector Balance:} ${(topSector[1]?.percentage || 0) > 40 ? 'Unbalanced - Too much in one area' : 'Balanced - Spread across industries'}
\\end{itemize}
\\end{tcolorbox}

% ============================================================================
% DETAILED ANALYSIS BEGINS HERE
% ============================================================================
\\newpage
\\section*{\\centering Detailed Analysis}
\\begin{center}
{\\large\\color{gray} In-depth report for comprehensive understanding}
\\end{center}

% ============================================================================
% EXECUTIVE SUMMARY
% ============================================================================
\\section{Executive Summary}

${this.generateExecutiveSummaryLatex(data, byGain, profitableCount, winRate, topSector)}

% ============================================================================
% COMPLETE HOLDINGS TABLE - ALL HOLDINGS
% ============================================================================
\\newpage
\\section{Complete Holdings Detail}

\\textbf{All ${holdings.length} positions in your portfolio:}

\\vspace{0.5cm}

${this.generateAllHoldingsTable(holdings, totalValue)}

% ============================================================================
% SECTOR ANALYSIS
% ============================================================================
\\newpage
\\section{Sector Analysis}

${this.generateSectorAnalysisLatex(sectorEntries, holdings)}

% ============================================================================
% PERFORMANCE ANALYSIS
% ============================================================================
\\newpage
\\section{Performance Analysis}

${this.generatePerformanceAnalysisLatex(data, byGain, profitableCount)}

% ============================================================================
% RISK ASSESSMENT
% ============================================================================
\\newpage
\\section{Risk Assessment}

${this.generateRiskAssessmentLatex(data, holdings, top5Weight, hhi, diversificationScore, topSector)}

% ============================================================================
% DIVIDEND ANALYSIS
% ============================================================================
\\newpage
\\section{Dividend Analysis}

${this.generateDividendAnalysisLatex(data, holdings)}

% ============================================================================
% RECOMMENDATIONS
% ============================================================================
\\newpage
\\section{Recommendations}

${this.generateRecommendationsLatex(data, byGain, sectorEntries, top5Weight)}

% ============================================================================
% MARKET OUTLOOK
% ============================================================================
\\newpage
\\section{Market Outlook}

${this.generateMarketOutlookLatex(sectorEntries)}

% ============================================================================
% DISCLAIMER
% ============================================================================
\\newpage
\\section*{Important Disclaimer}

\\begin{tcolorbox}[colback=warning!5,colframe=warning,title={\\color{white}\\bfseries Legal Notice}]
\\small
\\textbf{IMPORTANT NOTICE}\\\\
This report is generated by WealthPilot Pro using artificial intelligence for educational and informational purposes only. It does not constitute financial advice, investment recommendations, or an offer to buy or sell any securities.

\\textbf{PAST PERFORMANCE WARNING}\\\\
Past performance is not indicative of future results. All investments involve risk, including the potential loss of principal.

\\textbf{BEFORE MAKING INVESTMENT DECISIONS}\\\\
\\begin{itemize}
  \\item Consult with a qualified financial advisor
  \\item Consider your own financial situation and investment objectives
  \\item Conduct your own due diligence
  \\item Review the prospectus and other documents for any securities mentioned
\\end{itemize}

\\textbf{AI-GENERATED CONTENT NOTICE}\\\\
The AI-generated content in this report may contain errors or inaccuracies. WealthPilot Pro makes no warranties or representations regarding the accuracy, completeness, or timeliness of the information provided.

\\vspace{0.5cm}
\\centering
\\textit{Report generated: ${new Date().toISOString()}}\\\\
\\textit{WealthPilot Pro - AI-Powered Portfolio Intelligence}
\\end{tcolorbox}

\\end{document}
`;
  }

  /**
   * Compile LaTeX to PDF
   */
  async compileLaTeX(latex, outputPath) {
    return new Promise((resolve, reject) => {
      const texFile = path.join(this.tempDir, `report_${Date.now()}.tex`);
      const pdfFile = texFile.replace('.tex', '.pdf');

      // Write LaTeX file
      fs.writeFileSync(texFile, latex);

      // Try to compile
      try {
        execSync(`pdflatex -interaction=nonstopmode -output-directory="${this.tempDir}" "${texFile}"`, {
          timeout: 60000,
          stdio: 'pipe'
        });

        // Run twice for references
        execSync(`pdflatex -interaction=nonstopmode -output-directory="${this.tempDir}" "${texFile}"`, {
          timeout: 60000,
          stdio: 'pipe'
        });

        // Move PDF to output path
        if (fs.existsSync(pdfFile)) {
          fs.copyFileSync(pdfFile, outputPath);
          // Cleanup
          this.cleanupTempFiles(texFile);
          resolve(outputPath);
        } else {
          reject(new Error('PDF not generated'));
        }
      } catch (error) {
        this.cleanupTempFiles(texFile);
        reject(error);
      }
    });
  }

  /**
   * Cleanup temporary files
   */
  cleanupTempFiles(texFile) {
    const base = texFile.replace('.tex', '');
    ['.tex', '.pdf', '.aux', '.log', '.out'].forEach(ext => {
      const file = base + ext;
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) {}
      }
    });
  }

  /**
   * Fallback PDF generator using PDFKit when LaTeX not available
   */
  async generateFallbackPDF(portfolioData, aiContent, outputPath) {
    // Import the existing PDF generator
    const pdfGenerator = require('./pdfReportGenerator');
    return await pdfGenerator.generateReport(portfolioData, aiContent, {}, outputPath);
  }

  // ============================================================================
  // HELPER METHODS FOR LATEX GENERATION
  // ============================================================================

  escapeLatex(text) {
    if (!text) return '';
    return String(text)
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  formatNumber(num) {
    if (!num && num !== 0) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  generateHealthIndicator(returnPercent, winRate) {
    let status, color, emoji;
    if (returnPercent > 15) {
      status = 'EXCELLENT'; color = 'success'; emoji = '\\Huge $\\bigstar$';
    } else if (returnPercent > 5) {
      status = 'GOOD'; color = 'success!70'; emoji = '\\Huge $\\checkmark$';
    } else if (returnPercent > 0) {
      status = 'MODERATE'; color = 'warning'; emoji = '\\Huge $\\sim$';
    } else {
      status = 'NEEDS ATTENTION'; color = 'danger'; emoji = '\\Huge !';
    }

    return `
  \\node[circle,draw=${color},line width=4pt,minimum size=3cm,fill=${color}!10] (health) {${emoji}};
  \\node[below=0.5cm of health,font=\\Large\\bfseries,color=${color}] {${status}};
  \\node[below=1.2cm of health,font=\\normalsize,color=gray] {Return: ${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}\\% | Win Rate: ${winRate.toFixed(0)}\\%};
`;
  }

  generateSimpleExplanation(returnPercent, winRate, holdingsCount, topSector) {
    let explanation = '';

    if (returnPercent > 10) {
      explanation += '\\textbf{Great news!} Your portfolio is performing well above average. ';
    } else if (returnPercent > 0) {
      explanation += 'Your portfolio is making money, though there\\'s room for improvement. ';
    } else {
      explanation += 'Your portfolio is currently showing losses. Consider reviewing your strategy. ';
    }

    explanation += `\\\\[0.3cm]You have ${holdingsCount} different investments, `;
    explanation += holdingsCount < 10 ? 'which is relatively few - consider diversifying more. ' :
                   holdingsCount < 20 ? 'providing decent diversification. ' :
                   'giving you excellent diversification. ';

    explanation += `\\\\[0.3cm]Your biggest sector is ${this.escapeLatex(topSector[0])} at ${(topSector[1]?.percentage || 0).toFixed(0)}\\% of your portfolio.`;

    return explanation;
  }

  generateSectorPieChart(sectorEntries) {
    const colors = ['primary', 'secondary', 'success', 'warning', 'danger', 'primary!50', 'secondary!50', 'gray'];
    let startAngle = 0;
    let chart = '';

    sectorEntries.slice(0, 8).forEach((entry, i) => {
      const [sector, data] = entry;
      const percentage = data.percentage || 0;
      const endAngle = startAngle + (percentage * 3.6);
      const color = colors[i % colors.length];
      const midAngle = (startAngle + endAngle) / 2;

      chart += `
  \\fill[${color}] (0,0) -- ({cos(${startAngle})*2},{sin(${startAngle})*2}) arc (${startAngle}:${endAngle}:2) -- cycle;
  \\node at ({cos(${midAngle})*2.8},{sin(${midAngle})*2.8}) {\\tiny ${this.escapeLatex(sector.substring(0, 12))} ${percentage.toFixed(0)}\\%};`;
      startAngle = endAngle;
    });

    return chart;
  }

  generateHoldingsBarChart(holdings, totalValue) {
    let chart = '\\begin{axis}[xbar,width=12cm,height=6cm,xlabel={Portfolio Weight (\\%)},symbolic y coords={';
    chart += holdings.map(h => this.escapeLatex(h.symbol)).reverse().join(',');
    chart += '},ytick=data,nodes near coords,nodes near coords align={horizontal},bar width=15pt,xmin=0]\\addplot coordinates {';
    holdings.reverse().forEach(h => {
      const weight = ((h.marketValue || 0) / totalValue * 100);
      chart += `(${weight.toFixed(1)},${this.escapeLatex(h.symbol)}) `;
    });
    chart += '};\\end{axis}';
    return chart;
  }

  generateWinnersTable(winners) {
    if (winners.length === 0) return 'No winning positions';
    let table = '\\begin{tabular}{lr}\\toprule \\textbf{Stock} & \\textbf{Return} \\\\\\midrule ';
    winners.forEach(h => {
      table += `${this.escapeLatex(h.symbol)} & {\\color{success}+${(h.gainPercent || 0).toFixed(2)}\\%} \\\\`;
    });
    table += '\\bottomrule\\end{tabular}';
    return table;
  }

  generateLosersTable(losers) {
    if (losers.length === 0) return 'All positions are profitable!';
    let table = '\\begin{tabular}{lr}\\toprule \\textbf{Stock} & \\textbf{Return} \\\\\\midrule ';
    losers.forEach(h => {
      const color = (h.gainPercent || 0) < 0 ? 'danger' : 'warning';
      table += `${this.escapeLatex(h.symbol)} & {\\color{${color}}${(h.gainPercent || 0).toFixed(2)}\\%} \\\\`;
    });
    table += '\\bottomrule\\end{tabular}';
    return table;
  }

  generateBenchmarkComparison(returnPercent) {
    const benchmarks = [
      { name: 'Your Portfolio', value: returnPercent, color: 'primary' },
      { name: 'S\\&P 500', value: 12.5, color: 'gray' },
      { name: 'NASDAQ', value: 15.2, color: 'gray!70' },
      { name: 'Dow Jones', value: 10.8, color: 'gray!50' }
    ];

    let chart = '\\begin{axis}[ybar,width=12cm,height=6cm,ylabel={Return (\\%)},symbolic x coords={';
    chart += benchmarks.map(b => b.name).join(',');
    chart += '},xtick=data,nodes near coords,bar width=25pt,ymin=-5]\\addplot[fill=primary!60] coordinates {';
    benchmarks.forEach(b => {
      chart += `(${b.name},${b.value.toFixed(1)}) `;
    });
    chart += '};\\end{axis}';
    return chart;
  }

  generateRiskGauge(riskScore) {
    const angle = 180 - (riskScore * 18); // 0-10 maps to 180-0 degrees
    const color = riskScore <= 3 ? 'success' : riskScore <= 6 ? 'warning' : 'danger';
    const label = riskScore <= 3 ? 'Low Risk' : riskScore <= 6 ? 'Moderate Risk' : 'High Risk';

    return `
  % Gauge background
  \\fill[success!30] (0,0) -- (-3,0) arc (180:144:3) -- cycle;
  \\fill[success!50] (0,0) -- ({cos(144)*3},{sin(144)*3}) arc (144:108:3) -- cycle;
  \\fill[warning!50] (0,0) -- ({cos(108)*3},{sin(108)*3}) arc (108:72:3) -- cycle;
  \\fill[warning!70] (0,0) -- ({cos(72)*3},{sin(72)*3}) arc (72:36:3) -- cycle;
  \\fill[danger!70] (0,0) -- ({cos(36)*3},{sin(36)*3}) arc (36:0:3) -- cycle;

  % Needle
  \\draw[${color},line width=3pt,-latex] (0,0) -- ({cos(${angle})*2.5},{sin(${angle})*2.5});
  \\fill[${color}] (0,0) circle (0.2);

  % Labels
  \\node at (-3.5,0) {\\small Low};
  \\node at (3.5,0) {\\small High};
  \\node[below=1cm] at (0,0) {\\Large\\bfseries\\color{${color}} ${label}};
  \\node[below=1.8cm] at (0,0) {Score: ${riskScore}/10};
`;
  }

  calculateRiskScore(holdings, sectorEntries, top5Weight) {
    let score = 5;
    if (top5Weight > 60) score += 2;
    if (top5Weight > 80) score += 1;
    if (holdings.length < 10) score += 1;
    if (holdings.length < 5) score += 1;
    if ((sectorEntries[0]?.[1]?.percentage || 0) > 40) score += 1;
    return Math.min(10, Math.max(1, score));
  }

  generateExecutiveSummaryLatex(data, byGain, profitableCount, winRate, topSector) {
    const totalReturn = data.totalGainPercent >= 0 ? `+${data.totalGainPercent.toFixed(2)}\\%` : `${data.totalGainPercent.toFixed(2)}\\%`;

    return `
\\begin{tcolorbox}[highlightbox]
\\textbf{Portfolio Health:} ${data.totalGainPercent > 15 ? 'EXCELLENT' : data.totalGainPercent > 5 ? 'GOOD' : data.totalGainPercent > 0 ? 'MODERATE' : 'NEEDS ATTENTION'}\\\\[0.3cm]
The portfolio has demonstrated ${data.totalGainPercent >= 0 ? 'positive' : 'negative'} performance with a total return of ${totalReturn}.
\\end{tcolorbox}

\\subsection{Key Metrics}
\\begin{center}
\\begin{tabular}{|l|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Metric} & \\textbf{Value} \\\\
\\hline
Total Portfolio Value & \\$${this.formatNumber(data.totalValue)} \\\\
Total Cost Basis & \\$${this.formatNumber(data.totalCostBasis)} \\\\
Total Return & ${totalReturn} (\\$${data.totalGain >= 0 ? '+' : ''}${this.formatNumber(data.totalGain)}) \\\\
Win Rate & ${winRate.toFixed(1)}\\% (${profitableCount}/${data.holdings.length} positions) \\\\
Portfolio Yield & ${(data.dividends?.yield || 0).toFixed(2)}\\% \\\\
Annual Dividend Income & \\$${this.formatNumber(data.dividends?.annualIncome || 0)} \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Highlights}
\\begin{itemize}
  \\item \\textbf{Best Performer:} ${this.escapeLatex(byGain[0]?.symbol || 'N/A')} with ${byGain[0]?.gainPercent >= 0 ? '+' : ''}${(byGain[0]?.gainPercent || 0).toFixed(2)}\\% return
  \\item \\textbf{Top Sector:} ${this.escapeLatex(topSector[0])} at ${(topSector[1]?.percentage || 0).toFixed(1)}\\% of portfolio
  \\item \\textbf{Diversification:} ${data.holdings.length} positions across ${Object.keys(data.sectorAllocation || {}).length} sectors
\\end{itemize}
`;
  }

  generateAllHoldingsTable(holdings, totalValue) {
    let table = `
\\small
\\begin{longtable}{|l|l|r|r|r|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{\\#} & \\textbf{Symbol} & \\textbf{Shares} & \\textbf{Avg Cost} & \\textbf{Price} & \\textbf{Value} & \\textbf{Gain/Loss} & \\textbf{Weight} \\\\
\\hline
\\endfirsthead
\\hline
\\rowcolor{primary!10}
\\textbf{\\#} & \\textbf{Symbol} & \\textbf{Shares} & \\textbf{Avg Cost} & \\textbf{Price} & \\textbf{Value} & \\textbf{Gain/Loss} & \\textbf{Weight} \\\\
\\hline
\\endhead
`;

    holdings.forEach((h, i) => {
      const gainColor = (h.gainPercent || 0) >= 0 ? 'success' : 'danger';
      const weight = ((h.marketValue || 0) / totalValue * 100);
      const rowColor = i % 2 === 0 ? '' : '\\rowcolor{lightgray}';

      table += `${rowColor}
${i + 1} & ${this.escapeLatex(h.symbol)} & ${(h.shares || 0).toFixed(2)} & \\$${(h.avgCostBasis || 0).toFixed(2)} & \\$${(h.currentPrice || 0).toFixed(2)} & \\$${this.formatNumber(h.marketValue || 0)} & {\\color{${gainColor}}${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(2)}\\%} & ${weight.toFixed(1)}\\% \\\\
`;
    });

    table += `
\\hline
\\multicolumn{5}{|r|}{\\textbf{Total:}} & \\textbf{\\$${this.formatNumber(totalValue)}} & & \\textbf{100\\%} \\\\
\\hline
\\end{longtable}
`;
    return table;
  }

  generateSectorAnalysisLatex(sectorEntries, holdings) {
    const spWeights = {
      'Technology': 28.5, 'Healthcare': 13.2, 'Financial Services': 12.8,
      'Consumer Discretionary': 10.5, 'Communication Services': 8.8,
      'Industrials': 8.6, 'Consumer Staples': 6.2, 'Energy': 4.1,
      'Utilities': 2.5, 'Real Estate': 2.4, 'Materials': 2.4
    };

    let table = `
\\subsection{Sector Allocation vs S\\&P 500}
\\begin{center}
\\begin{tabular}{|l|r|r|r|l|}
\\hline
\\rowcolor{primary!10}
\\textbf{Sector} & \\textbf{Your Weight} & \\textbf{S\\&P 500} & \\textbf{Diff} & \\textbf{Status} \\\\
\\hline
`;

    sectorEntries.forEach(([sector, data]) => {
      const spWeight = spWeights[sector] || 3.0;
      const diff = (data.percentage || 0) - spWeight;
      const status = diff > 5 ? 'Overweight' : diff < -5 ? 'Underweight' : 'Market Weight';
      const statusColor = diff > 5 ? 'danger' : diff < -5 ? 'success' : 'gray';

      table += `${this.escapeLatex(sector)} & ${(data.percentage || 0).toFixed(1)}\\% & ${spWeight.toFixed(1)}\\% & ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}\\% & {\\color{${statusColor}}${status}} \\\\
`;
    });

    table += `\\hline
\\end{tabular}
\\end{center}

\\subsection{Sector Performance}
\\begin{center}
\\begin{tabular}{|l|r|r|l|}
\\hline
\\rowcolor{primary!10}
\\textbf{Sector} & \\textbf{Holdings} & \\textbf{Avg Return} & \\textbf{Top Performer} \\\\
\\hline
`;

    sectorEntries.forEach(([sector, data]) => {
      const sectorHoldings = holdings.filter(h => h.sector === sector);
      const avgReturn = sectorHoldings.length > 0 ?
        sectorHoldings.reduce((sum, h) => sum + (h.gainPercent || 0), 0) / sectorHoldings.length : 0;
      const topPerformer = [...sectorHoldings].sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0))[0];

      table += `${this.escapeLatex(sector)} & ${sectorHoldings.length} & ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}\\% & ${this.escapeLatex(topPerformer?.symbol || 'N/A')} \\\\
`;
    });

    table += `\\hline
\\end{tabular}
\\end{center}
`;
    return table;
  }

  generatePerformanceAnalysisLatex(data, byGain, profitableCount) {
    const spReturn = 12.5;
    const vsSp = data.totalGainPercent - spReturn;

    return `
\\subsection{Total Return Analysis}
\\begin{center}
\\begin{tabular}{|l|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Metric} & \\textbf{Your Portfolio} & \\textbf{S\\&P 500} & \\textbf{Difference} \\\\
\\hline
Total Return & ${data.totalGainPercent >= 0 ? '+' : ''}${data.totalGainPercent.toFixed(2)}\\% & +${spReturn}\\% & ${vsSp >= 0 ? '+' : ''}${vsSp.toFixed(2)}\\% \\\\
Dollar Gain/Loss & \\$${data.totalGain >= 0 ? '+' : ''}${this.formatNumber(data.totalGain)} & -- & -- \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Attribution Analysis}
\\begin{itemize}
  \\item \\textbf{Winners:} ${profitableCount} positions generating positive returns (${((profitableCount / data.holdings.length) * 100).toFixed(1)}\\%)
  \\item \\textbf{Losers:} ${data.holdings.length - profitableCount} positions in negative territory
  \\item \\textbf{Alpha:} ${vsSp >= 0 ? '+' : ''}${vsSp.toFixed(2)}\\% vs S\\&P 500
\\end{itemize}

\\subsection{Top Performers}
\\begin{center}
\\begin{tabular}{|l|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Symbol} & \\textbf{Return} & \\textbf{Dollar Gain} & \\textbf{Contribution} \\\\
\\hline
${byGain.slice(0, 10).map(h => {
  const contrib = data.totalGain !== 0 ? ((h.gain || 0) / Math.abs(data.totalGain) * 100) : 0;
  return `${this.escapeLatex(h.symbol)} & ${(h.gainPercent || 0) >= 0 ? '+' : ''}${(h.gainPercent || 0).toFixed(2)}\\% & \\$${(h.gain || 0) >= 0 ? '+' : ''}${this.formatNumber(h.gain || 0)} & ${contrib.toFixed(1)}\\%`;
}).join(' \\\\\n')} \\\\
\\hline
\\end{tabular}
\\end{center}
`;
  }

  generateRiskAssessmentLatex(data, holdings, top5Weight, hhi, diversificationScore, topSector) {
    const riskScore = this.calculateRiskScore(holdings, Object.entries(data.sectorAllocation || {}), top5Weight);
    const var95 = data.totalValue * 1.645 * 0.012 * Math.sqrt(21);

    return `
\\subsection{Overall Risk Score: ${riskScore}/10}
${riskScore <= 3 ? '\\textcolor{success}{Conservative}' : riskScore <= 6 ? '\\textcolor{warning}{Moderate}' : '\\textcolor{danger}{Aggressive}'}

\\subsection{Risk Metrics Dashboard}
\\begin{center}
\\begin{tabular}{|l|l|r|l|}
\\hline
\\rowcolor{primary!10}
\\textbf{Risk Factor} & \\textbf{Level} & \\textbf{Score} & \\textbf{Assessment} \\\\
\\hline
Concentration Risk & ${top5Weight > 60 ? 'HIGH' : top5Weight > 40 ? 'MEDIUM' : 'LOW'} & ${top5Weight.toFixed(0)}\\% in top 5 & ${top5Weight > 60 ? 'Consider diversifying' : 'Acceptable'} \\\\
Sector Risk & ${(topSector[1]?.percentage || 0) > 40 ? 'HIGH' : (topSector[1]?.percentage || 0) > 25 ? 'MEDIUM' : 'LOW'} & ${(topSector[1]?.percentage || 0).toFixed(0)}\\% in ${this.escapeLatex(topSector[0])} & ${(topSector[1]?.percentage || 0) > 40 ? 'Overexposed' : 'Balanced'} \\\\
Diversification & ${diversificationScore > 70 ? 'GOOD' : diversificationScore > 50 ? 'MODERATE' : 'POOR'} & ${diversificationScore.toFixed(0)}/100 & ${diversificationScore > 70 ? 'Well diversified' : 'Improve diversity'} \\\\
Position Count & ${holdings.length >= 20 ? 'GOOD' : holdings.length >= 10 ? 'MODERATE' : 'LOW'} & ${holdings.length} positions & ${holdings.length < 15 ? 'Add positions' : 'Adequate'} \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Value at Risk (VaR) Analysis}
\\begin{center}
\\begin{tabular}{|l|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Metric} & \\textbf{Value} \\\\
\\hline
Portfolio Value & \\$${this.formatNumber(data.totalValue)} \\\\
95\\% Monthly VaR & \\$${this.formatNumber(var95)} \\\\
Maximum Expected Loss (95\\%) & ${(var95 / data.totalValue * 100).toFixed(2)}\\% \\\\
HHI Index & ${(hhi * 10000).toFixed(0)} \\\\
\\hline
\\end{tabular}
\\end{center}
`;
  }

  generateDividendAnalysisLatex(data, holdings) {
    const dividendPayers = holdings.filter(h => (h.dividendYield || 0) > 0)
      .sort((a, b) => (b.dividendYield || 0) - (a.dividendYield || 0));
    const totalDividends = data.dividends?.annualIncome || 0;

    return `
\\subsection{Income Summary}
\\begin{center}
\\begin{tabular}{|l|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Metric} & \\textbf{Value} \\\\
\\hline
Annual Dividend Income & \\$${this.formatNumber(totalDividends)} \\\\
Portfolio Yield & ${(data.dividends?.yield || 0).toFixed(2)}\\% \\\\
Monthly Income Estimate & \\$${this.formatNumber(totalDividends / 12)} \\\\
Quarterly Income Estimate & \\$${this.formatNumber(totalDividends / 4)} \\\\
Dividend-Paying Holdings & ${dividendPayers.length} of ${holdings.length} (${((dividendPayers.length / holdings.length) * 100).toFixed(0)}\\%) \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Top Dividend Payers}
\\begin{center}
\\begin{tabular}{|l|r|r|r|}
\\hline
\\rowcolor{primary!10}
\\textbf{Symbol} & \\textbf{Yield} & \\textbf{Annual Dividend} & \\textbf{Contribution} \\\\
\\hline
${dividendPayers.slice(0, 10).map(h => {
  const annualDiv = (h.marketValue || 0) * ((h.dividendYield || 0) / 100);
  const contrib = totalDividends > 0 ? (annualDiv / totalDividends * 100) : 0;
  return `${this.escapeLatex(h.symbol)} & ${(h.dividendYield || 0).toFixed(2)}\\% & \\$${this.formatNumber(annualDiv)} & ${contrib.toFixed(1)}\\%`;
}).join(' \\\\\n')} \\\\
\\hline
\\end{tabular}
\\end{center}
`;
  }

  generateRecommendationsLatex(data, byGain, sectorEntries, top5Weight) {
    const recommendations = [];

    const bigWinners = byGain.filter(h => h.gainPercent > 50);
    const bigLosers = byGain.filter(h => h.gainPercent < -20);
    const topPosition = byGain.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))[0];

    if (bigWinners.length > 0) {
      recommendations.push({
        action: 'TRIM',
        symbols: bigWinners.map(h => h.symbol).join(', '),
        reason: 'Positions with >50\\% gains - consider taking partial profits',
        priority: 'High'
      });
    }

    if (topPosition && (topPosition.marketValue / data.totalValue * 100) > 15) {
      recommendations.push({
        action: 'REDUCE',
        symbols: topPosition.symbol,
        reason: 'Position exceeds 15\\% of portfolio',
        priority: 'High'
      });
    }

    if (data.holdings.length < 15) {
      recommendations.push({
        action: 'ADD',
        symbols: 'New positions',
        reason: 'Portfolio has fewer than 15 positions',
        priority: 'Medium'
      });
    }

    return `
\\subsection{Immediate Actions}
${recommendations.length > 0 ? recommendations.map((r, i) => `
\\begin{tcolorbox}[colback=${r.priority === 'High' ? 'danger!5' : 'warning!5'},colframe=${r.priority === 'High' ? 'danger' : 'warning'}]
\\textbf{${i + 1}. ${r.action}: ${this.escapeLatex(r.symbols)}}\\\\
Reason: ${r.reason}\\\\
Priority: ${r.priority}
\\end{tcolorbox}
`).join('\n') : 'No immediate actions required. Portfolio is well-positioned.'}

\\subsection{Strategic Recommendations}
\\begin{itemize}
  \\item \\textbf{Defensive:} Consider adding consumer staples or utilities for stability
  \\item \\textbf{Growth:} Technology and healthcare offer long-term growth potential
  \\item \\textbf{Income:} REITs or dividend aristocrats for income enhancement
\\end{itemize}
`;
  }

  generateMarketOutlookLatex(sectorEntries) {
    return `
\\subsection{Macroeconomic Environment}
\\begin{tcolorbox}[metricbox]
\\textbf{Positive Factors:}
\\begin{itemize}
  \\item Economic resilience with moderate growth expectations
  \\item AI and technology innovation driving productivity gains
  \\item Strong corporate earnings growth in select sectors
\\end{itemize}

\\textbf{Risk Factors:}
\\begin{itemize}
  \\item Interest rate uncertainty and Fed policy
  \\item Geopolitical tensions affecting global trade
  \\item Valuation concerns in growth sectors
\\end{itemize}
\\end{tcolorbox}

\\subsection{Portfolio Positioning Scenarios}
\\begin{center}
\\begin{tabular}{|l|r|l|}
\\hline
\\rowcolor{primary!10}
\\textbf{Scenario} & \\textbf{Probability} & \\textbf{Strategy} \\\\
\\hline
Bull Case & 30\\% & Maintain current allocation; add quality growth \\\\
Base Case & 50\\% & Rebalance toward quality; maintain diversification \\\\
Bear Case & 20\\% & Increase defensive exposure; raise cash \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Recommended Actions}
\\begin{enumerate}
  \\item Maintain diversification across sectors
  \\item Focus on quality companies with strong balance sheets
  \\item Consider adding defensive positions if concerned about volatility
  \\item Review portfolio quarterly for rebalancing opportunities
\\end{enumerate}
`;
  }
}

module.exports = new LaTeXReportGenerator();
