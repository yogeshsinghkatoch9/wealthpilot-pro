/**
 * Export Routes
 * Download data as Excel, CSV, and PDF files
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ExcelExporter = require('../exports/excelExporter');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const exporter = new ExcelExporter();
const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const outputDir = path.join(__dirname, '../../exports/output');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * GET /api/exports/market-dashboard
 * Export current market dashboard data to Excel
 */
router.get('/market-dashboard', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Fetch live dashboard data
    const response = await axios.get(`${BASE_URL}/api/market-dashboard/all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const dashboardData = response.data;

    // Generate Excel file
    const { filename, filepath } = await exporter.exportMarketDashboard(dashboardData);

    // Send file for download
    res.download(filepath, filename, (err) => {
      if (err) {
        logger.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    logger.error('[Excel Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export dashboard',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/portfolio/:id
 * Export portfolio data to Excel
 */
router.get('/portfolio/:id', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const portfolioId = req.params.id;

    // Fetch portfolio data
    const response = await axios.get(`${BASE_URL}/api/portfolios/${portfolioId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const portfolioData = response.data;

    // Generate Excel file
    const { filename, filepath } = await exporter.exportPortfolio(portfolioData);

    // Send file for download
    res.download(filepath, filename);
  } catch (error) {
    logger.error('[Excel Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export portfolio',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/portfolio/:id/csv
 * Export portfolio data to CSV
 */
router.get('/portfolio/:id/csv', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const portfolioId = req.params.id;

    // Fetch portfolio data
    const response = await axios.get(`${BASE_URL}/api/portfolios/${portfolioId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const portfolioData = response.data;
    const holdings = portfolioData.holdings || [];

    // Generate CSV content
    const headers = ['Symbol', 'Name', 'Shares', 'Avg Cost', 'Current Price', 'Market Value', 'Gain/Loss', 'Gain/Loss %', 'Sector'];
    const rows = holdings.map(h => [
      h.symbol,
      h.name || '',
      h.shares || h.quantity || 0,
      h.avg_cost || h.avgCost || 0,
      h.current_price || h.currentPrice || 0,
      ((h.shares || h.quantity || 0) * (h.current_price || h.currentPrice || 0)).toFixed(2),
      (((h.current_price || h.currentPrice || 0) - (h.avg_cost || h.avgCost || 0)) * (h.shares || h.quantity || 0)).toFixed(2),
      h.avg_cost > 0 ? ((((h.current_price || h.currentPrice || 0) - (h.avg_cost || h.avgCost || 0)) / (h.avg_cost || h.avgCost || 1)) * 100).toFixed(2) : '0.00',
      h.sector || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

    const filename = `portfolio_${portfolioData.name || 'export'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('[CSV Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export portfolio as CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/transactions/csv
 * Export user transactions to CSV
 */
router.get('/transactions/csv', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Fetch transactions data
    const response = await axios.get(`${BASE_URL}/api/transactions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const transactions = response.data.transactions || response.data || [];

    // Generate CSV content
    const headers = ['Date', 'Type', 'Symbol', 'Shares', 'Price', 'Total', 'Fees', 'Notes'];
    const rows = transactions.map(t => [
      new Date(t.date || t.created_at).toLocaleDateString(),
      t.type || t.transaction_type || 'N/A',
      t.symbol || '',
      t.shares || t.quantity || 0,
      t.price || t.price_per_share || 0,
      ((t.shares || t.quantity || 0) * (t.price || t.price_per_share || 0)).toFixed(2),
      t.fees || t.commission || 0,
      t.notes || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

    const filename = `transactions_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('[CSV Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export transactions as CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/dividends/csv
 * Export dividends data to CSV
 */
router.get('/dividends/csv', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Fetch dividends data
    const response = await axios.get(`${BASE_URL}/api/dividends`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const dividends = response.data.dividends || response.data || [];

    // Generate CSV content
    const headers = ['Date', 'Symbol', 'Amount', 'Type', 'Reinvested', 'Status'];
    const rows = dividends.map(d => [
      new Date(d.ex_date || d.date || d.created_at).toLocaleDateString(),
      d.symbol || '',
      d.amount || d.dividend_amount || 0,
      d.type || 'Cash',
      d.reinvested ? 'Yes' : 'No',
      d.status || 'Received'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

    const filename = `dividends_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('[CSV Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export dividends as CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/portfolio/:id/pdf
 * Export portfolio report as PDF
 */
router.get('/portfolio/:id/pdf', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const portfolioId = req.params.id;

    // Fetch portfolio data
    const response = await axios.get(`${BASE_URL}/api/portfolios/${portfolioId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const portfolioData = response.data;
    const holdings = portfolioData.holdings || [];

    // Calculate summary
    let totalValue = 0;
    let totalCost = 0;
    holdings.forEach(h => {
      const shares = h.shares || h.quantity || 0;
      const price = h.current_price || h.currentPrice || 0;
      const cost = h.avg_cost || h.avgCost || price;
      totalValue += shares * price;
      totalCost += shares * cost;
    });
    const totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;

    // Generate HTML for PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${portfolioData.name || 'Portfolio'}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px; }
    h2 { color: #2c5282; margin-top: 30px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-box { background: #f7fafc; padding: 15px; border-radius: 8px; flex: 1; }
    .summary-box h3 { margin: 0 0 5px 0; font-size: 14px; color: #718096; }
    .summary-box p { margin: 0; font-size: 24px; font-weight: bold; }
    .positive { color: #48bb78; }
    .negative { color: #f56565; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #edf2f7; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <h1>Portfolio Report: ${portfolioData.name || 'Portfolio'}</h1>
  <p>Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>

  <div class="summary">
    <div class="summary-box">
      <h3>Total Value</h3>
      <p>$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>
    <div class="summary-box">
      <h3>Total Cost</h3>
      <p>$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>
    <div class="summary-box">
      <h3>Total Gain/Loss</h3>
      <p class="${totalGain >= 0 ? 'positive' : 'negative'}">
        ${totalGain >= 0 ? '+' : ''}$${totalGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        (${gainPercent >= 0 ? '+' : ''}${gainPercent.toFixed(2)}%)
      </p>
    </div>
    <div class="summary-box">
      <h3>Holdings</h3>
      <p>${holdings.length}</p>
    </div>
  </div>

  <h2>Holdings</h2>
  <table>
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Name</th>
        <th>Shares</th>
        <th>Avg Cost</th>
        <th>Current Price</th>
        <th>Market Value</th>
        <th>Gain/Loss</th>
      </tr>
    </thead>
    <tbody>
      ${holdings.map(h => {
        const shares = h.shares || h.quantity || 0;
        const price = h.current_price || h.currentPrice || 0;
        const cost = h.avg_cost || h.avgCost || price;
        const value = shares * price;
        const gain = (price - cost) * shares;
        const gainPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;
        return `
          <tr>
            <td><strong>${h.symbol}</strong></td>
            <td>${h.name || '-'}</td>
            <td>${shares.toLocaleString()}</td>
            <td>$${cost.toFixed(2)}</td>
            <td>$${price.toFixed(2)}</td>
            <td>$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="${gain >= 0 ? 'positive' : 'negative'}">
              ${gain >= 0 ? '+' : ''}$${gain.toFixed(2)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%)
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated by WealthPilot Pro | This report is for informational purposes only.</p>
  </div>
</body>
</html>`;

    const filename = `portfolio_report_${portfolioData.name || 'export'}_${Date.now()}.html`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (error) {
    logger.error('[PDF Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export portfolio as PDF',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/all-portfolios/csv
 * Export all portfolios summary to CSV
 */
router.get('/all-portfolios/csv', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Fetch all portfolios
    const response = await axios.get(`${BASE_URL}/api/portfolios`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const portfolios = Array.isArray(response.data) ? response.data : (response.data.portfolios || []);

    // Generate CSV content
    const headers = ['Portfolio Name', 'Type', 'Holdings Count', 'Total Value', 'Total Cost', 'Gain/Loss', 'Gain/Loss %'];
    const rows = portfolios.map(p => [
      p.name || 'Untitled',
      p.portfolio_type || p.type || 'General',
      p.holdings_count || (p.holdings ? p.holdings.length : 0),
      (p.total_value || 0).toFixed(2),
      (p.total_cost || 0).toFixed(2),
      ((p.total_value || 0) - (p.total_cost || 0)).toFixed(2),
      p.total_cost > 0 ? ((((p.total_value || 0) - (p.total_cost || 0)) / p.total_cost) * 100).toFixed(2) : '0.00'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

    const filename = `all_portfolios_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('[CSV Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export portfolios as CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/watchlist/csv
 * Export watchlist to CSV
 */
router.get('/watchlist/csv', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Fetch watchlist data
    const response = await axios.get(`${BASE_URL}/api/watchlists`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const watchlists = response.data.watchlists || response.data || [];
    const allSymbols = [];

    watchlists.forEach(w => {
      if (w.symbols && Array.isArray(w.symbols)) {
        w.symbols.forEach(s => {
          allSymbols.push({
            watchlist: w.name,
            symbol: typeof s === 'string' ? s : s.symbol,
            price: s.price || 'N/A',
            change: s.change || 'N/A'
          });
        });
      }
    });

    // Generate CSV content
    const headers = ['Watchlist', 'Symbol', 'Price', 'Change'];
    const rows = allSymbols.map(s => [
      s.watchlist,
      s.symbol,
      s.price,
      s.change
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

    const filename = `watchlist_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('[CSV Export] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export watchlist as CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/exports/formats
 * Get available export formats
 */
router.get('/formats', authenticate, (req, res) => {
  res.json({
    success: true,
    formats: [
      { id: 'xlsx', name: 'Excel', extension: '.xlsx', description: 'Microsoft Excel workbook with formatting' },
      { id: 'csv', name: 'CSV', extension: '.csv', description: 'Comma-separated values, compatible with all spreadsheet apps' },
      { id: 'pdf', name: 'PDF Report', extension: '.html', description: 'Printable HTML report (can be saved as PDF from browser)' },
      { id: 'json', name: 'JSON', extension: '.json', description: 'Raw JSON data for developers' }
    ],
    exportTypes: [
      { id: 'portfolio', name: 'Portfolio', endpoints: ['/api/exports/portfolio/:id', '/api/exports/portfolio/:id/csv', '/api/exports/portfolio/:id/pdf'] },
      { id: 'all-portfolios', name: 'All Portfolios', endpoints: ['/api/exports/all-portfolios/csv'] },
      { id: 'transactions', name: 'Transactions', endpoints: ['/api/exports/transactions/csv'] },
      { id: 'dividends', name: 'Dividends', endpoints: ['/api/exports/dividends/csv'] },
      { id: 'watchlist', name: 'Watchlist', endpoints: ['/api/exports/watchlist/csv'] },
      { id: 'market-dashboard', name: 'Market Dashboard', endpoints: ['/api/exports/market-dashboard'] }
    ]
  });
});

module.exports = router;
