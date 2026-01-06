/**
 * Dividend Analysis Service
 * Provides dividend calculations, DRIP projections, yield analysis, and payout ratio metrics
 */

const logger = require('../utils/logger');

class DividendAnalysisService {
  /**
   * Calculate DRIP (Dividend Reinvestment Plan) projections
   * @param {number} initialShares - Initial number of shares
   * @param {number} sharePrice - Current share price
   * @param {number} annualDividend - Annual dividend per share
   * @param {number} dividendGrowthRate - Expected annual dividend growth rate (decimal)
   * @param {number} priceGrowthRate - Expected annual price growth rate (decimal)
   * @param {number} years - Number of years to project
   * @returns {Object} DRIP projection results
   */
  calculateDRIPProjection(initialShares, sharePrice, annualDividend, dividendGrowthRate, priceGrowthRate, years) {
    const projections = [];
    let currentShares = initialShares;
    let currentPrice = sharePrice;
    let currentDividend = annualDividend;
    let totalDividendsReceived = 0;
    let totalSharesFromDRIP = 0;

    const quarterlyDividend = annualDividend / 4;
    const quarterlyGrowth = Math.pow(1 + dividendGrowthRate, 0.25) - 1;
    const quarterlyPriceGrowth = Math.pow(1 + priceGrowthRate, 0.25) - 1;

    for (let year = 1; year <= years; year++) {
      let yearDividends = 0;
      let yearNewShares = 0;

      for (let q = 1; q <= 4; q++) {
        // Apply quarterly dividend
        const qDividend = currentShares * (currentDividend / 4);
        yearDividends += qDividend;
        totalDividendsReceived += qDividend;

        // Reinvest dividends (DRIP)
        const newShares = qDividend / currentPrice;
        currentShares += newShares;
        yearNewShares += newShares;
        totalSharesFromDRIP += newShares;

        // Apply quarterly growth
        currentDividend *= (1 + quarterlyGrowth);
        currentPrice *= (1 + quarterlyPriceGrowth);
      }

      const portfolioValue = currentShares * currentPrice;
      const costBasis = initialShares * sharePrice;
      const totalGain = portfolioValue - costBasis;

      projections.push({
        year,
        shares: Math.round(currentShares * 100) / 100,
        sharePrice: Math.round(currentPrice * 100) / 100,
        dividendPerShare: Math.round(currentDividend * 100) / 100,
        yearDividends: Math.round(yearDividends * 100) / 100,
        newSharesFromDRIP: Math.round(yearNewShares * 100) / 100,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        totalGain: Math.round(totalGain * 100) / 100,
        yieldOnCost: Math.round((currentDividend * currentShares / costBasis) * 10000) / 100
      });
    }

    const finalValue = currentShares * currentPrice;
    const initialValue = initialShares * sharePrice;
    const totalReturn = ((finalValue - initialValue) / initialValue) * 100;
    const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;

    return {
      summary: {
        initialInvestment: Math.round(initialValue * 100) / 100,
        finalValue: Math.round(finalValue * 100) / 100,
        totalReturn: Math.round(totalReturn * 100) / 100,
        cagr: Math.round(cagr * 100) / 100,
        totalDividendsReceived: Math.round(totalDividendsReceived * 100) / 100,
        totalSharesFromDRIP: Math.round(totalSharesFromDRIP * 100) / 100,
        finalShares: Math.round(currentShares * 100) / 100,
        shareGrowth: Math.round(((currentShares - initialShares) / initialShares) * 10000) / 100
      },
      assumptions: {
        dividendGrowthRate: dividendGrowthRate * 100,
        priceGrowthRate: priceGrowthRate * 100,
        years
      },
      projections
    };
  }

  /**
   * Calculate Dividend Yield
   * @param {number} annualDividend - Annual dividend per share
   * @param {number} sharePrice - Current share price
   * @returns {Object} Yield metrics
   */
  calculateDividendYield(annualDividend, sharePrice) {
    const yield_pct = sharePrice > 0 ? (annualDividend / sharePrice) * 100 : 0;

    return {
      annualDividend,
      sharePrice,
      yield: Math.round(yield_pct * 100) / 100,
      rating: yield_pct > 5 ? 'High Yield' : yield_pct > 3 ? 'Above Average' : yield_pct > 1.5 ? 'Average' : yield_pct > 0 ? 'Low Yield' : 'No Dividend',
      monthlyIncome: Math.round((annualDividend / 12) * 100) / 100,
      quarterlyIncome: Math.round((annualDividend / 4) * 100) / 100
    };
  }

  /**
   * Calculate Payout Ratio
   * @param {number} dividendPerShare - Dividend per share
   * @param {number} earningsPerShare - Earnings per share
   * @returns {Object} Payout ratio metrics
   */
  calculatePayoutRatio(dividendPerShare, earningsPerShare) {
    const payoutRatio = earningsPerShare > 0 ? (dividendPerShare / earningsPerShare) * 100 : 0;
    const retentionRatio = 100 - payoutRatio;

    return {
      dividendPerShare,
      earningsPerShare,
      payoutRatio: Math.round(payoutRatio * 100) / 100,
      retentionRatio: Math.round(retentionRatio * 100) / 100,
      sustainability: payoutRatio > 100 ? 'Unsustainable' : payoutRatio > 75 ? 'Stretched' : payoutRatio > 50 ? 'Moderate' : payoutRatio > 25 ? 'Conservative' : 'Very Conservative',
      interpretation: payoutRatio > 100
        ? 'Dividend exceeds earnings - may be cut'
        : payoutRatio > 75
        ? 'High payout - limited room for growth'
        : payoutRatio > 50
        ? 'Balanced between dividends and reinvestment'
        : 'Conservative payout - room for dividend growth'
    };
  }

  /**
   * Calculate Dividend Growth Analysis
   * @param {Object[]} dividendHistory - Array of {date, amount}
   * @returns {Object} Dividend growth metrics
   */
  calculateDividendGrowth(dividendHistory) {
    if (dividendHistory.length < 2) {
      return { error: 'Need at least 2 dividends for growth analysis' };
    }

    // Sort by date
    const sorted = [...dividendHistory].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate growth rates
    const growthRates = [];
    for (let i = 1; i < sorted.length; i++) {
      const growth = ((sorted[i].amount - sorted[i - 1].amount) / sorted[i - 1].amount) * 100;
      growthRates.push({
        period: sorted[i].date,
        growth: Math.round(growth * 100) / 100
      });
    }

    // Calculate averages
    const avgGrowth = growthRates.reduce((sum, g) => sum + g.growth, 0) / growthRates.length;

    // Calculate CAGR
    const firstDividend = sorted[0].amount;
    const lastDividend = sorted[sorted.length - 1].amount;
    const firstDate = new Date(sorted[0].date);
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const years = (lastDate - firstDate) / (365 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? (Math.pow(lastDividend / firstDividend, 1 / years) - 1) * 100 : 0;

    // Consecutive years of growth
    let consecutiveGrowth = 0;
    for (let i = growthRates.length - 1; i >= 0; i--) {
      if (growthRates[i].growth > 0) consecutiveGrowth++;
      else break;
    }

    return {
      currentDividend: lastDividend,
      firstDividend,
      averageGrowth: Math.round(avgGrowth * 100) / 100,
      cagr: Math.round(cagr * 100) / 100,
      consecutiveGrowthPeriods: consecutiveGrowth,
      dividendAristocrat: consecutiveGrowth >= 25,
      dividendKing: consecutiveGrowth >= 50,
      history: sorted,
      growthRates
    };
  }

  /**
   * Calculate Yield Curve comparison for dividend stocks
   * @param {Object[]} stocks - Array of {symbol, yield, rating, sector}
   * @returns {Object} Yield curve analysis
   */
  calculateYieldCurve(stocks) {
    // Sort by yield
    const sorted = [...stocks].sort((a, b) => b.yield - a.yield);

    // Calculate percentiles
    const yields = sorted.map(s => s.yield);
    const avgYield = yields.reduce((a, b) => a + b, 0) / yields.length;
    const medianYield = yields[Math.floor(yields.length / 2)];

    // Group by yield buckets
    const buckets = {
      high: sorted.filter(s => s.yield >= 5),
      aboveAvg: sorted.filter(s => s.yield >= 3 && s.yield < 5),
      average: sorted.filter(s => s.yield >= 1.5 && s.yield < 3),
      low: sorted.filter(s => s.yield > 0 && s.yield < 1.5),
      none: sorted.filter(s => s.yield === 0)
    };

    // Group by sector
    const bySector = {};
    sorted.forEach(s => {
      const sector = s.sector || 'Unknown';
      if (!bySector[sector]) bySector[sector] = { stocks: [], totalYield: 0 };
      bySector[sector].stocks.push(s);
      bySector[sector].totalYield += s.yield;
    });

    Object.keys(bySector).forEach(sector => {
      bySector[sector].avgYield = Math.round((bySector[sector].totalYield / bySector[sector].stocks.length) * 100) / 100;
    });

    return {
      summary: {
        totalStocks: stocks.length,
        avgYield: Math.round(avgYield * 100) / 100,
        medianYield: Math.round(medianYield * 100) / 100,
        highestYield: sorted[0],
        lowestYield: sorted[sorted.length - 1]
      },
      distribution: {
        high: { count: buckets.high.length, percent: Math.round((buckets.high.length / stocks.length) * 100) },
        aboveAvg: { count: buckets.aboveAvg.length, percent: Math.round((buckets.aboveAvg.length / stocks.length) * 100) },
        average: { count: buckets.average.length, percent: Math.round((buckets.average.length / stocks.length) * 100) },
        low: { count: buckets.low.length, percent: Math.round((buckets.low.length / stocks.length) * 100) }
      },
      bySector,
      rankedStocks: sorted
    };
  }

  /**
   * Project future dividend income
   * @param {Object[]} holdings - Array of {symbol, shares, dividend, frequency}
   * @param {number} years - Years to project
   * @param {number} growthRate - Expected dividend growth rate
   * @returns {Object} Income projections
   */
  projectDividendIncome(holdings, years, growthRate = 0.05) {
    const projections = [];
    let currentHoldings = JSON.parse(JSON.stringify(holdings));

    for (let year = 0; year <= years; year++) {
      let yearIncome = 0;
      const breakdown = [];

      currentHoldings.forEach(h => {
        const annualDividend = h.shares * h.dividend;
        yearIncome += annualDividend;
        breakdown.push({
          symbol: h.symbol,
          shares: h.shares,
          dividend: h.dividend,
          income: Math.round(annualDividend * 100) / 100
        });

        // Apply growth for next year
        h.dividend *= (1 + growthRate);
      });

      projections.push({
        year: year === 0 ? 'Current' : `Year ${year}`,
        totalIncome: Math.round(yearIncome * 100) / 100,
        monthlyIncome: Math.round((yearIncome / 12) * 100) / 100,
        breakdown: year === 0 ? breakdown : undefined
      });
    }

    const currentIncome = projections[0].totalIncome;
    const finalIncome = projections[projections.length - 1].totalIncome;
    const incomeGrowth = ((finalIncome - currentIncome) / currentIncome) * 100;

    return {
      assumptions: {
        growthRate: growthRate * 100,
        years
      },
      summary: {
        currentAnnualIncome: currentIncome,
        projectedFinalIncome: Math.round(finalIncome * 100) / 100,
        incomeGrowth: Math.round(incomeGrowth * 100) / 100,
        totalIncomeOverPeriod: Math.round(projections.reduce((sum, p) => sum + p.totalIncome, 0) * 100) / 100
      },
      projections,
      currentBreakdown: projections[0].breakdown
    };
  }

  /**
   * Screen dividend stocks
   * @param {Object[]} stocks - Array of stock data
   * @param {Object} criteria - Screening criteria
   * @returns {Object[]} Filtered stocks
   */
  screenDividendStocks(stocks, criteria = {}) {
    const {
      minYield = 0,
      maxYield = 100,
      minPayoutRatio = 0,
      maxPayoutRatio = 100,
      minGrowthRate = -100,
      consecutiveYears = 0
    } = criteria;

    return stocks.filter(stock => {
      if (stock.yield < minYield || stock.yield > maxYield) return false;
      if (stock.payoutRatio < minPayoutRatio || stock.payoutRatio > maxPayoutRatio) return false;
      if (stock.dividendGrowth < minGrowthRate) return false;
      if (stock.consecutiveYears < consecutiveYears) return false;
      return true;
    }).sort((a, b) => b.yield - a.yield);
  }
}

module.exports = new DividendAnalysisService();
