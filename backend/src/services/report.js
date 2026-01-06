/**
 * WealthPilot Pro - Report Service
 * PDF report generation for client deliverables
 */

const fs = require('fs');
const path = require('path');

class ReportService {
  
  /**
   * Generate HTML for portfolio report
   */
  static generatePortfolioReportHTML(data) {
    const {
      portfolio,
      holdings,
      performance,
      allocation,
      transactions,
      generatedAt = new Date()
    } = data;

    const formatMoney = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatPct = (v) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%';
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${portfolio.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; line-height: 1.5; }
    .page { width: 8.5in; min-height: 11in; padding: 0.75in; margin: 0 auto; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #1a1a2e; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .logo span { color: #3b82f6; }
    .report-info { text-align: right; color: #666; }
    .report-title { font-size: 20px; font-weight: 600; margin-bottom: 5px; }
    
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
    .summary-card { background: #f8fafc; padding: 15px; border-radius: 8px; }
    .summary-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 18px; font-weight: 600; margin-top: 5px; }
    .summary-value.positive { color: #10b981; }
    .summary-value.negative { color: #ef4444; }
    
    .section { margin-bottom: 30px; }
    .section-title { font-size: 14px; font-weight: 600; color: #1a1a2e; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 15px; }
    
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
    tr:hover { background: #fafafa; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    .muted { color: #94a3b8; }
    
    .allocation-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin-bottom: 15px; }
    .allocation-segment { display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 500; }
    .allocation-legend { display: flex; flex-wrap: wrap; gap: 15px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; }
    .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
    
    .chart-placeholder { background: #f8fafc; height: 200px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
    
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    .disclaimer { max-width: 60%; }
    
    @media print {
      .page { padding: 0.5in; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="logo">Wealth<span>Pilot</span></div>
        <div style="color: #666; margin-top: 5px;">Portfolio Management</div>
      </div>
      <div class="report-info">
        <div class="report-title">${portfolio.name}</div>
        <div>Generated: ${formatDate(generatedAt)}</div>
        <div>Period: ${formatDate(performance?.periodStart || new Date())} - ${formatDate(generatedAt)}</div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Total Value</div>
        <div class="summary-value">${formatMoney(portfolio.totalValue)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Gain/Loss</div>
        <div class="summary-value ${portfolio.totalGain >= 0 ? 'positive' : 'negative'}">
          ${formatMoney(portfolio.totalGain)} (${formatPct(portfolio.totalGainPct)})
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Annual Income</div>
        <div class="summary-value">${formatMoney(portfolio.annualDividends || 0)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Holdings</div>
        <div class="summary-value">${holdings.length}</div>
      </div>
    </div>

    <!-- Allocation Section -->
    <div class="section">
      <div class="section-title">Asset Allocation</div>
      <div class="allocation-bar">
        ${(allocation?.bySector || []).map((s, i) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return `<div class="allocation-segment" style="width: ${s.weight}%; background: ${colors[i % colors.length]}">${s.weight > 5 ? s.weight.toFixed(0) + '%' : ''}</div>`;
  }).join('')}
      </div>
      <div class="allocation-legend">
        ${(allocation?.bySector || []).map((s, i) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return `<div class="legend-item"><div class="legend-dot" style="background: ${colors[i % colors.length]}"></div>${s.sector}: ${s.weight.toFixed(1)}%</div>`;
  }).join('')}
      </div>
    </div>

    <!-- Holdings Table -->
    <div class="section">
      <div class="section-title">Holdings Detail</div>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th class="text-right">Shares</th>
            <th class="text-right">Price</th>
            <th class="text-right">Market Value</th>
            <th class="text-right">Cost Basis</th>
            <th class="text-right">Gain/Loss</th>
            <th class="text-right">Return</th>
            <th class="text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          ${holdings.map(h => `
            <tr>
              <td><strong>${h.symbol}</strong></td>
              <td class="muted">${h.name || h.symbol}</td>
              <td class="text-right">${h.shares.toLocaleString()}</td>
              <td class="text-right">${formatMoney(h.price)}</td>
              <td class="text-right">${formatMoney(h.marketValue)}</td>
              <td class="text-right">${formatMoney(h.costBasis)}</td>
              <td class="text-right ${h.gain >= 0 ? 'positive' : 'negative'}">${formatMoney(h.gain)}</td>
              <td class="text-right ${h.gainPct >= 0 ? 'positive' : 'negative'}">${formatPct(h.gainPct)}</td>
              <td class="text-right">${(h.weight || 0).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight: 600; background: #f8fafc;">
            <td colspan="4">Total</td>
            <td class="text-right">${formatMoney(portfolio.totalValue)}</td>
            <td class="text-right">${formatMoney(portfolio.totalCost)}</td>
            <td class="text-right ${portfolio.totalGain >= 0 ? 'positive' : 'negative'}">${formatMoney(portfolio.totalGain)}</td>
            <td class="text-right ${portfolio.totalGainPct >= 0 ? 'positive' : 'negative'}">${formatPct(portfolio.totalGainPct)}</td>
            <td class="text-right">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Performance Metrics -->
    ${performance ? `
    <div class="section">
      <div class="section-title">Performance Metrics</div>
      <table>
        <tr>
          <td>Period Return</td>
          <td class="text-right ${performance.periodReturn >= 0 ? 'positive' : 'negative'}">${formatPct(performance.periodReturnPct)}</td>
          <td>Sharpe Ratio</td>
          <td class="text-right">${(performance.sharpeRatio || 0).toFixed(2)}</td>
          <td>Volatility</td>
          <td class="text-right">${(performance.volatility || 0).toFixed(1)}%</td>
        </tr>
        <tr>
          <td>Benchmark (SPY)</td>
          <td class="text-right">${formatPct(performance.benchmarkReturn)}</td>
          <td>Beta</td>
          <td class="text-right">${(performance.beta || 1).toFixed(2)}</td>
          <td>Max Drawdown</td>
          <td class="text-right negative">${(performance.maxDrawdown || 0).toFixed(1)}%</td>
        </tr>
        <tr>
          <td>Alpha</td>
          <td class="text-right ${(performance.alpha || 0) >= 0 ? 'positive' : 'negative'}">${formatPct(performance.alpha)}</td>
          <td>Sortino Ratio</td>
          <td class="text-right">${(performance.sortinoRatio || 0).toFixed(2)}</td>
          <td>VaR (95%)</td>
          <td class="text-right">${formatMoney(performance.var95)}</td>
        </tr>
      </table>
    </div>
    ` : ''}

    <!-- Recent Transactions -->
    ${transactions && transactions.length > 0 ? `
    <div class="section">
      <div class="section-title">Recent Transactions</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Symbol</th>
            <th>Type</th>
            <th class="text-right">Shares</th>
            <th class="text-right">Price</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.slice(0, 10).map(t => `
            <tr>
              <td>${formatDate(t.executedAt)}</td>
              <td><strong>${t.symbol}</strong></td>
              <td><span style="color: ${t.type === 'buy' ? '#10b981' : t.type === 'sell' ? '#ef4444' : '#3b82f6'}">${t.type.toUpperCase()}</span></td>
              <td class="text-right">${t.shares ? t.shares.toLocaleString() : '-'}</td>
              <td class="text-right">${t.price ? formatMoney(t.price) : '-'}</td>
              <td class="text-right">${formatMoney(t.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
      <div class="disclaimer">
        This report is for informational purposes only and does not constitute investment advice. 
        Past performance does not guarantee future results. Please consult with a qualified financial 
        advisor before making investment decisions.
      </div>
      <div>
        WealthPilot Pro<br>
        Page 1 of 1
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate performance comparison report HTML
   */
  static generatePerformanceReportHTML(data) {
    const { portfolios, period, benchmarks, generatedAt = new Date() } = data;
    
    const formatMoney = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatPct = (v) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%';
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Performance Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; line-height: 1.5; }
    .page { width: 8.5in; min-height: 11in; padding: 0.75in; margin: 0 auto; background: white; }
    .header { display: flex; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #1a1a2e; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; }
    .logo span { color: #3b82f6; }
    
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; }
    th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 600; }
    td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    
    .section-title { font-size: 14px; font-weight: 600; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo">Wealth<span>Pilot</span></div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: 600;">Performance Report</div>
        <div style="color: #666;">Period: ${period || 'YTD'} | Generated: ${formatDate(generatedAt)}</div>
      </div>
    </div>

    <div class="section-title">Portfolio Performance Comparison</div>
    <table>
      <thead>
        <tr>
          <th>Portfolio</th>
          <th class="text-right">Total Value</th>
          <th class="text-right">Period Return</th>
          <th class="text-right">Total Return</th>
          <th class="text-right">Alpha</th>
          <th class="text-right">Sharpe</th>
          <th class="text-right">Beta</th>
        </tr>
      </thead>
      <tbody>
        ${portfolios.map(p => `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td class="text-right">${formatMoney(p.totalValue)}</td>
            <td class="text-right ${p.periodReturn >= 0 ? 'positive' : 'negative'}">${formatPct(p.periodReturn)}</td>
            <td class="text-right ${p.totalReturn >= 0 ? 'positive' : 'negative'}">${formatPct(p.totalReturn)}</td>
            <td class="text-right ${p.alpha >= 0 ? 'positive' : 'negative'}">${formatPct(p.alpha)}</td>
            <td class="text-right">${(p.sharpe || 0).toFixed(2)}</td>
            <td class="text-right">${(p.beta || 1).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">Benchmark Comparison</div>
    <table>
      <thead>
        <tr>
          <th>Benchmark</th>
          <th class="text-right">Period Return</th>
          <th class="text-right">YTD</th>
          <th class="text-right">1Y</th>
          <th class="text-right">3Y Ann.</th>
        </tr>
      </thead>
      <tbody>
        ${(benchmarks || []).map(b => `
          <tr>
            <td><strong>${b.symbol}</strong> - ${b.name}</td>
            <td class="text-right ${b.periodReturn >= 0 ? 'positive' : 'negative'}">${formatPct(b.periodReturn)}</td>
            <td class="text-right ${b.ytd >= 0 ? 'positive' : 'negative'}">${formatPct(b.ytd)}</td>
            <td class="text-right ${b.oneYear >= 0 ? 'positive' : 'negative'}">${formatPct(b.oneYear)}</td>
            <td class="text-right ${b.threeYear >= 0 ? 'positive' : 'negative'}">${formatPct(b.threeYear)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
  }

  /**
   * Generate tax lot report HTML
   */
  static generateTaxReportHTML(data) {
    const { taxLots, summary, year, generatedAt = new Date() } = data;
    
    const formatMoney = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Tax Report ${year}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; }
    .page { width: 8.5in; padding: 0.75in; margin: 0 auto; background: white; }
    .header { display: flex; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #1a1a2e; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; }
    .logo span { color: #3b82f6; }
    
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
    .summary-card { background: #f8fafc; padding: 15px; border-radius: 8px; }
    .summary-label { font-size: 10px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 16px; font-weight: 600; margin-top: 5px; }
    
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #f1f5f9; padding: 8px 6px; text-align: left; font-weight: 600; }
    td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    .long-term { background: #ecfdf5; }
    .short-term { background: #fef3c7; }
    
    .section-title { font-size: 14px; font-weight: 600; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; margin: 20px 0 15px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo">Wealth<span>Pilot</span></div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: 600;">Tax Report ${year}</div>
        <div style="color: #666;">Generated: ${formatDate(generatedAt)}</div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Long-Term Gains</div>
        <div class="summary-value positive">${formatMoney(summary.longTermGains)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Short-Term Gains</div>
        <div class="summary-value positive">${formatMoney(summary.shortTermGains)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Losses</div>
        <div class="summary-value negative">${formatMoney(summary.longTermLosses + summary.shortTermLosses)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Net Gain/Loss</div>
        <div class="summary-value ${summary.netGain >= 0 ? 'positive' : 'negative'}">${formatMoney(summary.netGain)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Estimated Tax</div>
        <div class="summary-value">${formatMoney(summary.estimatedTax)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Wash Sales</div>
        <div class="summary-value">${formatMoney(summary.washSales || 0)}</div>
      </div>
    </div>

    <div class="section-title">Tax Lot Detail</div>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Acquired</th>
          <th>Sold</th>
          <th>Term</th>
          <th class="text-right">Shares</th>
          <th class="text-right">Cost Basis</th>
          <th class="text-right">Proceeds</th>
          <th class="text-right">Gain/Loss</th>
        </tr>
      </thead>
      <tbody>
        ${taxLots.map(lot => `
          <tr class="${lot.isLongTerm ? 'long-term' : 'short-term'}">
            <td><strong>${lot.symbol}</strong></td>
            <td>${formatDate(lot.purchaseDate)}</td>
            <td>${lot.soldDate ? formatDate(lot.soldDate) : '-'}</td>
            <td>${lot.isLongTerm ? 'Long' : 'Short'}</td>
            <td class="text-right">${lot.shares}</td>
            <td class="text-right">${formatMoney(lot.totalCost)}</td>
            <td class="text-right">${formatMoney(lot.proceeds)}</td>
            <td class="text-right ${lot.gain >= 0 ? 'positive' : 'negative'}">${formatMoney(lot.gain)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top: 30px; padding: 15px; background: #fef3c7; border-radius: 8px; font-size: 10px;">
      <strong>Disclaimer:</strong> This report is for informational purposes only and should not be considered tax advice. 
      Please consult with a qualified tax professional for tax planning and preparation.
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Save HTML report to file
   */
  static saveHTMLReport(html, filename) {
    const reportsDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const filepath = path.join(reportsDir, filename);
    fs.writeFileSync(filepath, html);
    return filepath;
  }
}

module.exports = ReportService;
