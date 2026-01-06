// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const path = require('path');
const logger = require('../utils/logger');


/**
 * Portfolio Data Helper
 * Provides portfolio, holdings, and snapshot data using direct SQL
 * Bypasses Prisma to avoid DateTime conversion issues
 */
class PortfolioDataHelper {
  /**
   * Get portfolios for a user
   * @param {string} userId - User ID
   * @param {string} portfolioId - Specific portfolio ID or 'all'
   * @returns {Array} Portfolios with holdings
   */
  static getPortfolios(userId, portfolioId = 'all') {
    try {
      let query;
      let params;

      if (portfolioId === 'all') {
        query = `
          SELECT * FROM portfolios
          WHERE user_id = ?
          ORDER BY created_at DESC
        `;
        params = [userId];
      } else {
        query = `
          SELECT * FROM portfolios
          WHERE id = ? AND user_id = ?
        `;
        params = [portfolioId, userId];
      }

      const portfolios = db.prepare(query).all(...params);

      // Get holdings for each portfolio
      return portfolios.map(portfolio => ({
        ...portfolio,
        holdings: this.getHoldings(portfolio.id)
      }));
    } catch (error) {
      logger.error('Error getting portfolios:', error);
      return [];
    }
  }

  /**
   * Get holdings for a portfolio
   * @param {string} portfolioId - Portfolio ID
   * @returns {Array} Holdings with current market data
   */
  static getHoldings(portfolioId) {
    try {
      const query = `
        SELECT h.*, sq.price as current_price, sq.change_percent, sq.high, sq.low, sq.sector as quote_sector
        FROM holdings h
        LEFT JOIN stock_quotes sq ON h.symbol = sq.symbol
        WHERE h.portfolio_id = ?
        ORDER BY h.created_at DESC
      `;

      const holdings = db.prepare(query).all(portfolioId);

      return holdings.map(h => ({
        id: h.id,
        portfolio_id: h.portfolio_id,
        symbol: h.symbol,
        shares: h.shares,
        avgCostBasis: h.avg_cost_basis,
        sector: h.sector || h.quote_sector || 'Other',
        assetType: h.asset_type || 'stock',
        currentPrice: h.current_price || h.avg_cost_basis,
        marketValue: h.shares * (h.current_price || h.avg_cost_basis),
        costBasis: h.shares * h.avg_cost_basis,
        gain: (h.shares * (h.current_price || h.avg_cost_basis)) - (h.shares * h.avg_cost_basis),
        gainPct: h.avg_cost_basis > 0
          ? ((h.current_price || h.avg_cost_basis) - h.avg_cost_basis) / h.avg_cost_basis
          : 0,
        changePct: h.change_percent || 0,
        dayHigh: h.high,
        dayLow: h.low
      }));
    } catch (error) {
      logger.error('Error getting holdings:', error);
      return [];
    }
  }

  /**
   * Get all holdings across multiple portfolios
   * @param {Array} portfolios - Array of portfolio objects
   * @returns {Array} Combined holdings
   */
  static getAllHoldings(portfolios) {
    const allHoldings = [];
    portfolios.forEach(portfolio => {
      const holdings = this.getHoldings(portfolio.id);
      allHoldings.push(...holdings);
    });
    return allHoldings;
  }

  /**
   * Get portfolio snapshots for a time period
   * @param {string} portfolioId - Portfolio ID
   * @param {string} period - Period (1M, 3M, 6M, 1Y, YTD)
   * @returns {Array} Snapshots ordered by date
   */
  static getSnapshots(portfolioId, period = '1Y') {
    try {
      const daysBack = this.periodToDays(period);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const query = `
        SELECT * FROM portfolio_snapshots
        WHERE portfolio_id = ?
          AND snapshot_date >= ?
        ORDER BY snapshot_date ASC
      `;

      const snapshots = db.prepare(query).all(
        portfolioId,
        cutoffDate.toISOString().split('T')[0]
      );

      return snapshots.map(s => ({
        id: s.id,
        portfolio_id: s.portfolio_id,
        snapshot_date: s.snapshot_date,
        total_value: s.total_value,
        total_cost: s.total_cost,
        cash_balance: s.cash_balance,
        total_gain: s.total_gain,
        total_gain_pct: s.total_gain_pct,
        day_change: s.day_change,
        day_change_pct: s.day_change_pct
      }));
    } catch (error) {
      logger.error('Error getting snapshots:', error);
      return [];
    }
  }

  /**
   * Calculate portfolio returns for a period
   * @param {Array} holdings - Portfolio holdings
   * @param {string} period - Time period
   * @returns {number} Return percentage
   */
  static calculateReturn(holdings, period = '1Y') {
    if (!holdings || holdings.length === 0) return 0;

    const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);

    if (totalCostBasis === 0) return 0;

    return (totalMarketValue - totalCostBasis) / totalCostBasis;
  }

  /**
   * Get sector allocation from holdings
   * @param {Array} holdings - Portfolio holdings
   * @returns {Object} Sector allocation with weights and returns
   */
  static getSectorAllocation(holdings) {
    const allocation = {};
    const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);

    if (totalValue === 0) return allocation;

    // Group by sector
    const sectors = {};
    holdings.forEach(h => {
      const sector = h.sector || 'Other';
      if (!sectors[sector]) {
        sectors[sector] = { value: 0, gains: [], count: 0 };
      }
      sectors[sector].value += h.marketValue;
      sectors[sector].gains.push(h.gainPct);
      sectors[sector].count++;
    });

    // Calculate weights and average returns
    for (const [sector, data] of Object.entries(sectors)) {
      allocation[sector] = {
        weight: data.value / totalValue,
        return: data.gains.reduce((a, b) => a + b, 0) / data.count,
        value: data.value,
        count: data.count
      };
    }

    return allocation;
  }

  /**
   * Get stock quote from database
   * @param {string} symbol - Stock symbol
   * @returns {Object} Stock quote data
   */
  static getStockQuote(symbol) {
    try {
      const query = `
        SELECT * FROM stock_quotes
        WHERE symbol = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      const quote = db.prepare(query).get(symbol);
      return quote ? {
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePct: quote.change_pct,
        dayHigh: quote.day_high,
        dayLow: quote.day_low,
        volume: quote.volume,
        marketCap: quote.market_cap
      } : null;
    } catch (error) {
      logger.error(`Error getting quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Convert period string to days
   * @param {string} period - Period string (1M, 3M, 6M, 1Y, YTD)
   * @returns {number} Number of days
   */
  static periodToDays(period) {
    const periodMap = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
      '3Y': 1095,
      '5Y': 1825,
      '10Y': 3650
    };
    return periodMap[period] || 365;
  }

  /**
   * Get date range for period
   * @param {string} period - Period string
   * @returns {Object} Start and end dates
   */
  static getPeriodDates(period) {
    const endDate = new Date();
    const startDate = new Date();

    if (period === 'YTD') {
      startDate.setMonth(0, 1); // January 1st of current year
    } else {
      const days = this.periodToDays(period);
      startDate.setDate(startDate.getDate() - days);
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * Calculate portfolio statistics
   * @param {Array} snapshots - Portfolio snapshots
   * @returns {Object} Statistics (volatility, Sharpe, max drawdown)
   */
  static calculateStatistics(snapshots) {
    if (!snapshots || snapshots.length < 2) {
      return {
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        avgReturn: 0
      };
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].total_value;
      const currValue = snapshots[i].total_value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    if (returns.length === 0) {
      return { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, avgReturn: 0 };
    }

    // Average return
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Volatility (standard deviation)
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Sharpe ratio (assuming risk-free rate of 2%)
    const riskFreeRate = 0.02;
    const annualizedReturn = avgReturn * 252;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

    // Max drawdown
    let peak = snapshots[0].total_value;
    let maxDrawdown = 0;

    for (const snapshot of snapshots) {
      if (snapshot.total_value > peak) {
        peak = snapshot.total_value;
      }
      const drawdown = (peak - snapshot.total_value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      volatility,
      sharpeRatio,
      maxDrawdown,
      avgReturn: annualizedReturn
    };
  }
}

module.exports = PortfolioDataHelper;
