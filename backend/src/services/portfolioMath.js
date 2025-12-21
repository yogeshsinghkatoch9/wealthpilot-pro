/**
 * Portfolio Math Engine
 * Institutional-grade financial calculations for portfolio management
 */

const logger = require('../utils/logger');

class PortfolioMath {
  /**
   * Calculate weighted average of a metric across holdings
   * @param {Array} holdings - Array of { allocation, metricValue }
   * @param {string} metricKey - Key to weight
   * @returns {number} Weighted average
   */
  static weightedAverage(holdings, metricKey) {
    if (!holdings || holdings.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    holdings.forEach(h => {
      const weight = parseFloat(h.allocation) || 0;
      const value = parseFloat(h[metricKey]) || 0;

      if (weight > 0 && !isNaN(value)) {
        weightedSum += weight * value;
        totalWeight += weight;
      }
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate portfolio beta (weighted average of individual betas)
   */
  static calculatePortfolioBeta(holdings) {
    return this.weightedAverage(holdings, 'beta');
  }

  /**
   * Calculate portfolio yield (weighted average dividend yield)
   */
  static calculatePortfolioYield(holdings) {
    return this.weightedAverage(holdings, 'dividendYield');
  }

  /**
   * Calculate projected annual income
   * @param {Array} holdings - Holdings with allocation, dividendYield
   * @param {number} totalInvestment - Total portfolio value
   */
  static calculateProjectedIncome(holdings, totalInvestment) {
    if (!holdings || holdings.length === 0) return 0;

    return holdings.reduce((total, h) => {
      const allocation = parseFloat(h.allocation) || 0;
      const yield_ = parseFloat(h.dividendYield) || 0;
      const invested = (allocation / 100) * totalInvestment;
      return total + (yield_ / 100) * invested;
    }, 0);
  }

  /**
   * Calculate individual holding income
   */
  static calculateHoldingIncome(allocation, dividendYield, totalInvestment) {
    const invested = (allocation / 100) * totalInvestment;
    return (dividendYield / 100) * invested;
  }

  /**
   * Calculate shares from allocation and price
   */
  static calculateShares(allocation, price, totalInvestment) {
    if (!price || price <= 0) return 0;
    const invested = (allocation / 100) * totalInvestment;
    return invested / price;
  }

  /**
   * Calculate allocation breakdown by asset class
   */
  static calculateAssetClassAllocation(holdings) {
    const allocation = {
      equity: 0,
      fixedIncome: 0,
      alternatives: 0,
      cash: 0
    };

    holdings.forEach(h => {
      const alloc = parseFloat(h.allocation) || 0;
      const assetClass = (h.assetClass || '').toLowerCase();
      const symbol = (h.symbol || '').toUpperCase();

      // Bond ETFs and fixed income
      if (assetClass.includes('bond') || assetClass.includes('fixed') ||
          symbol.includes('BND') || symbol.includes('AGG') || symbol.includes('TLT') ||
          symbol.includes('LQD') || symbol.includes('HYG') || symbol.includes('VCIT')) {
        allocation.fixedIncome += alloc;
      }
      // Alternatives (gold, commodities, real estate)
      else if (assetClass.includes('alt') || assetClass.includes('commodity') ||
               symbol.includes('GLD') || symbol.includes('SLV') || symbol.includes('USO') ||
               symbol.includes('VNQ') || symbol.includes('REIT') || symbol.includes('DBC')) {
        allocation.alternatives += alloc;
      }
      // Cash equivalents
      else if (assetClass.includes('cash') || assetClass.includes('money market') ||
               symbol.includes('SHV') || symbol.includes('BIL') || symbol.includes('SGOV')) {
        allocation.cash += alloc;
      }
      // Default to equity
      else {
        allocation.equity += alloc;
      }
    });

    return allocation;
  }

  /**
   * Calculate sector allocation
   */
  static calculateSectorAllocation(holdings) {
    const sectors = {};

    holdings.forEach(h => {
      const sector = h.sector || 'Unknown';
      const alloc = parseFloat(h.allocation) || 0;

      if (!sectors[sector]) {
        sectors[sector] = { allocation: 0, holdings: [] };
      }
      sectors[sector].allocation += alloc;
      sectors[sector].holdings.push(h.symbol);
    });

    // Convert to array and sort by allocation
    return Object.entries(sectors)
      .map(([name, data]) => ({
        name,
        allocation: data.allocation,
        holdings: data.holdings
      }))
      .sort((a, b) => b.allocation - a.allocation);
  }

  /**
   * Calculate weighted historical returns
   * @param {Array} holdings - Holdings with returns data
   * @returns {Object} Weighted returns for different periods
   */
  static calculatePortfolioReturns(holdings) {
    const periods = ['year1', 'year3', 'year5', 'year10'];
    const returns = {};

    periods.forEach(period => {
      let weightedSum = 0;
      let totalWeight = 0;

      holdings.forEach(h => {
        const weight = parseFloat(h.allocation) || 0;
        const returnVal = h.returns?.[period];

        if (weight > 0 && returnVal !== null && returnVal !== undefined && !isNaN(returnVal)) {
          weightedSum += weight * parseFloat(returnVal);
          totalWeight += weight;
        }
      });

      returns[period] = totalWeight > 0 ? weightedSum / totalWeight : null;
    });

    return returns;
  }

  /**
   * Calculate portfolio variance (for risk metrics)
   * Simplified version using weighted beta as proxy
   */
  static calculatePortfolioVariance(holdings, marketVariance = 0.04) {
    const beta = this.calculatePortfolioBeta(holdings);
    return Math.pow(beta, 2) * marketVariance;
  }

  /**
   * Calculate portfolio standard deviation
   */
  static calculatePortfolioStdDev(holdings, marketStdDev = 0.2) {
    const beta = this.calculatePortfolioBeta(holdings);
    return Math.abs(beta) * marketStdDev;
  }

  /**
   * Calculate Sharpe Ratio
   * @param {number} portfolioReturn - Expected portfolio return
   * @param {number} riskFreeRate - Risk-free rate (default 5%)
   * @param {number} portfolioStdDev - Portfolio standard deviation
   */
  static calculateSharpeRatio(portfolioReturn, riskFreeRate = 0.05, portfolioStdDev) {
    if (!portfolioStdDev || portfolioStdDev === 0) return null;
    return (portfolioReturn - riskFreeRate) / portfolioStdDev;
  }

  /**
   * Calculate rebalancing deltas
   * @param {Array} currentHoldings - Current holdings with allocations
   * @param {Array} targetAllocations - Target allocations
   * @param {number} totalValue - Total portfolio value
   */
  static calculateRebalancingDeltas(currentHoldings, targetAllocations, totalValue) {
    const deltas = [];
    const currentMap = new Map(currentHoldings.map(h => [h.symbol, h]));
    const targetMap = new Map(targetAllocations.map(t => [t.symbol, t]));

    // Calculate deltas for existing holdings
    currentMap.forEach((current, symbol) => {
      const target = targetMap.get(symbol) || { allocation: 0 };
      const currentAlloc = parseFloat(current.allocation) || 0;
      const targetAlloc = parseFloat(target.allocation) || 0;
      const delta = targetAlloc - currentAlloc;

      if (Math.abs(delta) > 0.01) {
        deltas.push({
          symbol,
          currentAllocation: currentAlloc,
          targetAllocation: targetAlloc,
          delta,
          deltaValue: (delta / 100) * totalValue,
          action: delta > 0 ? 'BUY' : 'SELL'
        });
      }
    });

    // Add new positions from target
    targetMap.forEach((target, symbol) => {
      if (!currentMap.has(symbol) && target.allocation > 0) {
        deltas.push({
          symbol,
          currentAllocation: 0,
          targetAllocation: target.allocation,
          delta: target.allocation,
          deltaValue: (target.allocation / 100) * totalValue,
          action: 'BUY'
        });
      }
    });

    return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  /**
   * Calculate portfolio drift from target
   */
  static calculateDrift(currentHoldings, targetAllocations) {
    const currentMap = new Map(currentHoldings.map(h => [h.symbol, parseFloat(h.allocation) || 0]));
    const targetMap = new Map(targetAllocations.map(t => [t.symbol, parseFloat(t.allocation) || 0]));

    let totalDrift = 0;
    const allSymbols = new Set([...currentMap.keys(), ...targetMap.keys()]);

    allSymbols.forEach(symbol => {
      const current = currentMap.get(symbol) || 0;
      const target = targetMap.get(symbol) || 0;
      totalDrift += Math.abs(current - target);
    });

    return totalDrift / 2; // Divide by 2 since we count each deviation twice
  }

  /**
   * Validate allocation totals to 100%
   */
  static validateAllocation(holdings, tolerance = 0.01) {
    const total = holdings.reduce((sum, h) => sum + (parseFloat(h.allocation) || 0), 0);
    const isValid = Math.abs(total - 100) <= tolerance;

    return {
      isValid,
      total,
      difference: 100 - total,
      message: isValid ? 'Allocation is valid' : `Allocation must total 100% (current: ${total.toFixed(2)}%)`
    };
  }

  /**
   * Calculate correlation coefficient between two return series
   */
  static calculateCorrelation(returns1, returns2) {
    if (!returns1 || !returns2 || returns1.length !== returns2.length || returns1.length === 0) {
      return null;
    }

    const n = returns1.length;
    const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? null : numerator / denominator;
  }

  /**
   * Calculate correlation matrix for portfolio holdings
   */
  static calculateCorrelationMatrix(holdingsReturns) {
    const symbols = Object.keys(holdingsReturns);
    const matrix = {};

    symbols.forEach(symbol1 => {
      matrix[symbol1] = {};
      symbols.forEach(symbol2 => {
        if (symbol1 === symbol2) {
          matrix[symbol1][symbol2] = 1;
        } else {
          matrix[symbol1][symbol2] = this.calculateCorrelation(
            holdingsReturns[symbol1],
            holdingsReturns[symbol2]
          );
        }
      });
    });

    return matrix;
  }

  /**
   * Calculate Value at Risk (VaR) using parametric method
   * @param {number} portfolioValue - Total portfolio value
   * @param {number} portfolioStdDev - Portfolio standard deviation
   * @param {number} confidenceLevel - Confidence level (default 95%)
   * @param {number} timePeriod - Time period in days (default 1)
   */
  static calculateVaR(portfolioValue, portfolioStdDev, confidenceLevel = 0.95, timePeriod = 1) {
    // Z-scores for common confidence levels
    const zScores = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326
    };

    const z = zScores[confidenceLevel] || 1.645;
    const dailyStdDev = portfolioStdDev / Math.sqrt(252); // Annualized to daily
    const periodStdDev = dailyStdDev * Math.sqrt(timePeriod);

    return portfolioValue * z * periodStdDev;
  }

  /**
   * Calculate portfolio concentration metrics
   */
  static calculateConcentration(holdings) {
    if (!holdings || holdings.length === 0) return { hhi: 0, top5: 0, diversification: 'N/A' };

    const allocations = holdings.map(h => parseFloat(h.allocation) || 0);

    // Herfindahl-Hirschman Index (sum of squared allocations)
    const hhi = allocations.reduce((sum, alloc) => sum + Math.pow(alloc / 100, 2), 0);

    // Top 5 concentration
    const sortedAllocs = [...allocations].sort((a, b) => b - a);
    const top5 = sortedAllocs.slice(0, 5).reduce((sum, alloc) => sum + alloc, 0);

    // Diversification rating
    let diversification;
    if (hhi < 0.1) diversification = 'Highly Diversified';
    else if (hhi < 0.18) diversification = 'Diversified';
    else if (hhi < 0.25) diversification = 'Moderately Concentrated';
    else diversification = 'Concentrated';

    return {
      hhi: hhi * 10000, // Express as standard HHI (0-10000)
      top5,
      holdingCount: holdings.length,
      diversification
    };
  }

  /**
   * Calculate optimal weights using mean-variance optimization (simplified)
   * @param {Array} expectedReturns - Expected returns for each asset
   * @param {Array} risks - Risk (std dev) for each asset
   * @param {number} targetReturn - Target portfolio return
   */
  static optimizeWeights(expectedReturns, risks, targetReturn = 0.08) {
    // Simplified equal risk contribution approach
    const n = expectedReturns.length;
    if (n === 0) return [];

    // Calculate inverse volatility weights
    const invVols = risks.map(r => r > 0 ? 1 / r : 0);
    const totalInvVol = invVols.reduce((a, b) => a + b, 0);

    return invVols.map(iv => totalInvVol > 0 ? (iv / totalInvVol) * 100 : 100 / n);
  }

  /**
   * Calculate annualized return from period returns
   */
  static annualizeReturn(periodReturn, periodsPerYear) {
    return Math.pow(1 + periodReturn, periodsPerYear) - 1;
  }

  /**
   * Calculate CAGR (Compound Annual Growth Rate)
   */
  static calculateCAGR(beginningValue, endingValue, years) {
    if (beginningValue <= 0 || years <= 0) return null;
    return Math.pow(endingValue / beginningValue, 1 / years) - 1;
  }

  /**
   * Format number as percentage
   */
  static formatPercent(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '--';
    const formatted = Number(value).toFixed(decimals);
    return `${value >= 0 ? '+' : ''}${formatted}%`;
  }

  /**
   * Format number as currency
   */
  static formatCurrency(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return '$' + Number(value).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
}

module.exports = PortfolioMath;
