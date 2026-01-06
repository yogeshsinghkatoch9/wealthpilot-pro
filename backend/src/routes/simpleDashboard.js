/**
 * Simple Dashboard Route - PostgreSQL compatible
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available, using mock database for simple dashboard routes');
  Database = {
    all: () => [],
    get: () => null
  };
}

router.use(authenticate);

/**
 * Calculate annual dividend income from holdings
 * Uses dividend yield from quotes or estimates from transactions
 */
function calculateDividendIncome(userId, holdings, quotes) {
  let annualDividends = 0;

  for (const holding of holdings) {
    const quote = quotes[holding.symbol] || {};
    const shares = parseFloat(holding.shares) || 0;
    const price = parseFloat(quote.price) || parseFloat(holding.avg_cost_basis) || 0;
    const dividendYield = parseFloat(quote.dividendYield) || 0;

    // Calculate annual dividend from yield
    if (dividendYield > 0 && price > 0) {
      const annualDividendPerShare = (dividendYield / 100) * price;
      annualDividends += annualDividendPerShare * shares;
    }
  }

  // Also check dividend transactions from past year
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const dividendTransactions = Database.all(`
      SELECT SUM(total_amount) as total
      FROM transactions
      WHERE user_id = ? AND type = 'dividend' AND executed_at >= ?
    `, [userId, oneYearAgo.toISOString()]);

    if (dividendTransactions?.[0]?.total) {
      // Use actual dividends if available and higher
      const actualDividends = parseFloat(dividendTransactions[0].total) || 0;
      if (actualDividends > annualDividends) {
        annualDividends = actualDividends;
      }
    }
  } catch (e) {
    // If transaction query fails, use estimate from yields
  }

  return annualDividends;
}

/**
 * Calculate portfolio risk metrics
 * Beta, Sharpe Ratio, Volatility, Max Drawdown
 */
function calculateRiskMetrics(holdings, quotes, totalValue, totalGainPct) {
  // Default values if calculation not possible
  const defaults = {
    beta: 1.0,
    sharpe: 0,
    volatility: 0,
    maxDrawdown: 0
  };

  if (!holdings.length || totalValue <= 0) {
    return defaults;
  }

  // Calculate weighted average beta from holdings
  let weightedBeta = 0;
  let totalWeight = 0;

  for (const holding of holdings) {
    const quote = quotes[holding.symbol] || {};
    const shares = parseFloat(holding.shares) || 0;
    const price = parseFloat(quote.price) || parseFloat(holding.avg_cost_basis) || 0;
    const marketValue = shares * price;
    const weight = marketValue / totalValue;

    // Use stock beta if available, default to 1.0
    const stockBeta = parseFloat(quote.beta) || 1.0;
    weightedBeta += stockBeta * weight;
    totalWeight += weight;
  }

  // Normalize beta
  const beta = totalWeight > 0 ? weightedBeta / totalWeight : 1.0;

  // Estimate portfolio volatility from individual stock volatilities
  // Using simplified calculation based on day change percentages
  let weightedVolatility = 0;
  for (const holding of holdings) {
    const quote = quotes[holding.symbol] || {};
    const shares = parseFloat(holding.shares) || 0;
    const price = parseFloat(quote.price) || 0;
    const marketValue = shares * price;
    const weight = marketValue / totalValue;

    // Estimate daily volatility from change percent (annualize with sqrt(252))
    const dailyChange = Math.abs(parseFloat(quote.changePercent) || 0);
    const estimatedAnnualVol = dailyChange * Math.sqrt(252) / 100;
    weightedVolatility += estimatedAnnualVol * weight;
  }

  // Portfolio volatility (simplified - doesn't account for correlations)
  const volatility = Math.min(weightedVolatility * 100, 100); // Cap at 100%

  // Calculate Sharpe Ratio: (Return - Risk-Free Rate) / Volatility
  // Using 5% as risk-free rate approximation
  const riskFreeRate = 5;
  const annualReturn = totalGainPct; // Simplified - using total gain as return
  const sharpe = volatility > 0 ? (annualReturn - riskFreeRate) / volatility : 0;

  // Estimate max drawdown from volatility (simplified approximation)
  // Typical max drawdown ~ 2-3x annual volatility for diversified portfolios
  const maxDrawdown = Math.min(volatility * 2.5, 100);

  return {
    beta: parseFloat(beta.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    volatility: parseFloat(volatility.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2))
  };
}

/**
 * GET /api/simple-dashboard
 * Get dashboard data using raw database
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get portfolios
    const portfolios = Database.all(`
      SELECT * FROM portfolios WHERE user_id = ?
    `, [userId]);

    // Get all holdings across all portfolios
    const holdings = Database.all(`
      SELECT h.*, p.name as portfolio_name
      FROM holdings h
      JOIN portfolios p ON h.portfolio_id = p.id
      WHERE p.user_id = ?
    `, [userId]);

    // Get recent transactions
    const recentTransactions = Database.all(`
      SELECT * FROM transactions
      WHERE user_id = ?
      ORDER BY executed_at DESC
      LIMIT 10
    `, [userId]);

    // Get active alerts
    const alerts = Database.all(`
      SELECT * FROM alerts
      WHERE user_id = ? AND is_active = 1
      LIMIT 5
    `, [userId]);

    // Calculate totals
    const symbols = [...new Set(holdings.map(h => h.symbol))];
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;
    const sectorAllocation = {};

    for (const holding of holdings) {
      const quote = quotes[holding.symbol] || {};
      const shares = parseFloat(holding.shares) || 0;
      const costBasis = parseFloat(holding.avg_cost_basis) || 0;
      const price = parseFloat(quote.price) || costBasis;
      const prevClose = parseFloat(quote.previousClose) || price;

      const marketValue = shares * price;
      const cost = shares * costBasis;

      totalValue += marketValue;
      totalCost += cost;
      dayChange += shares * (price - prevClose);

      // Sector allocation
      const sector = holding.sector || 'Unknown';
      if (!sectorAllocation[sector]) {
        sectorAllocation[sector] = 0;
      }
      sectorAllocation[sector] += marketValue;
    }

    // Add cash to total value
    const totalCash = portfolios.reduce((sum, p) => sum + (parseFloat(p.cash_balance) || 0), 0);
    totalValue += totalCash;

    // Calculate sectors array
    const sectors = Object.keys(sectorAllocation).map(sector => ({
      name: sector,
      value: sectorAllocation[sector],
      percent: totalValue > 0 ? ((sectorAllocation[sector] / totalValue) * 100).toFixed(2) : '0.00'
    })).sort((a, b) => b.value - a.value);

    // Calculate totals
    const totalGain = totalValue - totalCost - totalCash;
    const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
    const dayChangePct = totalValue > 0 ? ((dayChange / (totalValue - dayChange)) * 100) : 0;

    // Get latest snapshot for YTD calculation
    const latestSnapshot = Database.get(`
      SELECT * FROM portfolio_snapshots
      WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id = ?)
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [userId]);

    const ytdReturn = latestSnapshot ? parseFloat(latestSnapshot.total_gain_pct) || 0 : 0;

    // Calculate dividend income from transactions and holdings
    const dividendIncome = calculateDividendIncome(userId, holdings, quotes);

    // Calculate risk metrics
    const riskMetrics = calculateRiskMetrics(holdings, quotes, totalValue, totalGainPct);

    res.json({
      totals: {
        value: totalValue,
        gain: totalGain,
        cost: totalCost,
        dayChange: dayChange,
        ytdReturn: ytdReturn,
        income: dividendIncome,
        cash: totalCash,
        holdingsCount: holdings.length
      },
      sectors: sectors,
      risk: riskMetrics,
      recentTransactions: recentTransactions.map(t => ({
        ...t,
        executedAt: t.executed_at
      })),
      portfolios: portfolios,
      holdings: holdings,
      alerts: alerts
    });

  } catch (error) {
    logger.error('Simple dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

module.exports = router;
