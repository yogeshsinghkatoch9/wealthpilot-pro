/**
 * Fundamental Analysis Service
 * Calculates financial ratios and metrics for company analysis
 */

const logger = require('../utils/logger');

class FundamentalAnalysisService {
  /**
   * Calculate Gross Margin
   * @param {number} revenue - Total revenue
   * @param {number} cogs - Cost of goods sold
   * @returns {Object} Gross margin metrics
   */
  calculateGrossMargin(revenue, cogs) {
    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      rating: grossMargin > 50 ? 'Excellent' : grossMargin > 30 ? 'Good' : grossMargin > 20 ? 'Average' : 'Poor',
      interpretation: `Company retains ${grossMargin.toFixed(1)}% of revenue after direct costs`
    };
  }

  /**
   * Calculate Operating Margin
   * @param {number} operatingIncome - Operating income
   * @param {number} revenue - Total revenue
   * @returns {Object} Operating margin metrics
   */
  calculateOperatingMargin(operatingIncome, revenue) {
    const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;

    return {
      operatingIncome: Math.round(operatingIncome * 100) / 100,
      operatingMargin: Math.round(operatingMargin * 100) / 100,
      rating: operatingMargin > 20 ? 'Excellent' : operatingMargin > 10 ? 'Good' : operatingMargin > 5 ? 'Average' : 'Poor',
      interpretation: `Company earns ${operatingMargin.toFixed(1)}% from core operations`
    };
  }

  /**
   * Calculate Net Profit Margin
   * @param {number} netIncome - Net income
   * @param {number} revenue - Total revenue
   * @returns {Object} Net margin metrics
   */
  calculateNetMargin(netIncome, revenue) {
    const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

    return {
      netIncome: Math.round(netIncome * 100) / 100,
      netMargin: Math.round(netMargin * 100) / 100,
      rating: netMargin > 15 ? 'Excellent' : netMargin > 8 ? 'Good' : netMargin > 3 ? 'Average' : 'Poor',
      interpretation: `Company keeps ${netMargin.toFixed(1)}% of revenue as profit`
    };
  }

  /**
   * Calculate Margin Expansion
   * @param {Object[]} historicalData - Array of {period, grossMargin, operatingMargin, netMargin}
   * @returns {Object} Margin expansion analysis
   */
  calculateMarginExpansion(historicalData) {
    if (historicalData.length < 2) {
      return { error: 'Need at least 2 periods for comparison' };
    }

    const latest = historicalData[historicalData.length - 1];
    const oldest = historicalData[0];
    const periodsCount = historicalData.length;

    const grossMarginExpansion = latest.grossMargin - oldest.grossMargin;
    const operatingMarginExpansion = latest.operatingMargin - oldest.operatingMargin;
    const netMarginExpansion = latest.netMargin - oldest.netMargin;

    // Calculate CAGR for margins
    const years = periodsCount / 4; // Assuming quarterly data
    const grossCAGR = years > 0 && oldest.grossMargin > 0
      ? (Math.pow(latest.grossMargin / oldest.grossMargin, 1 / years) - 1) * 100
      : 0;

    return {
      grossMarginExpansion: Math.round(grossMarginExpansion * 100) / 100,
      operatingMarginExpansion: Math.round(operatingMarginExpansion * 100) / 100,
      netMarginExpansion: Math.round(netMarginExpansion * 100) / 100,
      periods: periodsCount,
      trend: netMarginExpansion > 0 ? 'Expanding' : netMarginExpansion < 0 ? 'Contracting' : 'Stable',
      grossMarginCAGR: Math.round(grossCAGR * 100) / 100,
      historicalData
    };
  }

  /**
   * Calculate Revenue Per Employee
   * @param {number} revenue - Total revenue
   * @param {number} employees - Number of employees
   * @returns {Object} Revenue per employee metrics
   */
  calculateRevenuePerEmployee(revenue, employees) {
    const revPerEmployee = employees > 0 ? revenue / employees : 0;

    return {
      revenue,
      employees,
      revenuePerEmployee: Math.round(revPerEmployee),
      revenuePerEmployeeK: Math.round(revPerEmployee / 1000),
      rating: revPerEmployee > 500000 ? 'Excellent' : revPerEmployee > 250000 ? 'Good' : revPerEmployee > 100000 ? 'Average' : 'Below Average',
      interpretation: `Each employee generates $${(revPerEmployee / 1000).toFixed(0)}K in revenue`
    };
  }

  /**
   * Calculate Price to Sales Ratio
   * @param {number} marketCap - Market capitalization
   * @param {number} revenue - Total revenue (TTM)
   * @returns {Object} P/S ratio metrics
   */
  calculatePriceToSales(marketCap, revenue) {
    const psRatio = revenue > 0 ? marketCap / revenue : 0;

    return {
      marketCap,
      revenue,
      psRatio: Math.round(psRatio * 100) / 100,
      rating: psRatio < 1 ? 'Undervalued' : psRatio < 3 ? 'Fair' : psRatio < 10 ? 'Growth Premium' : 'Expensive',
      interpretation: `Investors pay $${psRatio.toFixed(2)} for every $1 of sales`
    };
  }

  /**
   * Calculate Debt Maturity Schedule
   * @param {Object[]} debtData - Array of {maturityDate, amount, type, interestRate}
   * @returns {Object} Debt maturity analysis
   */
  calculateDebtMaturity(debtData) {
    const now = new Date();
    const oneYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const threeYears = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());
    const fiveYears = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());

    let shortTerm = 0; // < 1 year
    let mediumTerm = 0; // 1-3 years
    let longTerm = 0; // 3-5 years
    let extended = 0; // > 5 years

    const schedule = [];

    debtData.forEach(debt => {
      const maturity = new Date(debt.maturityDate);
      const item = {
        ...debt,
        yearsToMaturity: Math.round((maturity - now) / (365 * 24 * 60 * 60 * 1000) * 10) / 10
      };

      if (maturity < oneYear) {
        shortTerm += debt.amount;
        item.category = 'Short-term';
      } else if (maturity < threeYears) {
        mediumTerm += debt.amount;
        item.category = 'Medium-term';
      } else if (maturity < fiveYears) {
        longTerm += debt.amount;
        item.category = 'Long-term';
      } else {
        extended += debt.amount;
        item.category = 'Extended';
      }

      schedule.push(item);
    });

    const totalDebt = shortTerm + mediumTerm + longTerm + extended;
    const weightedAvgMaturity = schedule.reduce((sum, d) => sum + (d.yearsToMaturity * d.amount), 0) / (totalDebt || 1);

    return {
      totalDebt,
      shortTerm: { amount: shortTerm, percent: totalDebt > 0 ? (shortTerm / totalDebt) * 100 : 0 },
      mediumTerm: { amount: mediumTerm, percent: totalDebt > 0 ? (mediumTerm / totalDebt) * 100 : 0 },
      longTerm: { amount: longTerm, percent: totalDebt > 0 ? (longTerm / totalDebt) * 100 : 0 },
      extended: { amount: extended, percent: totalDebt > 0 ? (extended / totalDebt) * 100 : 0 },
      weightedAvgMaturity: Math.round(weightedAvgMaturity * 10) / 10,
      schedule: schedule.sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate)),
      riskLevel: shortTerm / totalDebt > 0.4 ? 'High' : shortTerm / totalDebt > 0.2 ? 'Moderate' : 'Low'
    };
  }

  /**
   * Calculate Interest Coverage Ratio
   * @param {number} ebit - Earnings before interest and taxes
   * @param {number} interestExpense - Total interest expense
   * @returns {Object} Interest coverage metrics
   */
  calculateInterestCoverage(ebit, interestExpense) {
    const ratio = interestExpense > 0 ? ebit / interestExpense : ebit > 0 ? Infinity : 0;

    return {
      ebit,
      interestExpense,
      interestCoverage: ratio === Infinity ? 'N/A (No Debt)' : Math.round(ratio * 100) / 100,
      rating: ratio > 5 ? 'Excellent' : ratio > 3 ? 'Good' : ratio > 1.5 ? 'Adequate' : ratio > 1 ? 'Weak' : 'Critical',
      interpretation: ratio === Infinity
        ? 'Company has no interest-bearing debt'
        : `Company can cover interest payments ${ratio.toFixed(1)}x with operating earnings`
    };
  }

  /**
   * Calculate Working Capital Metrics
   * @param {number} currentAssets - Total current assets
   * @param {number} currentLiabilities - Total current liabilities
   * @param {number} inventory - Inventory value
   * @param {number} receivables - Accounts receivable
   * @param {number} payables - Accounts payable
   * @param {number} revenue - Annual revenue
   * @param {number} cogs - Cost of goods sold
   * @returns {Object} Working capital analysis
   */
  calculateWorkingCapital(currentAssets, currentLiabilities, inventory, receivables, payables, revenue, cogs) {
    const workingCapital = currentAssets - currentLiabilities;
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    const cashRatio = currentLiabilities > 0 ? (currentAssets - inventory - receivables) / currentLiabilities : 0;

    // Days calculations
    const dailyRevenue = revenue / 365;
    const dailyCOGS = cogs / 365;

    const daysReceivables = dailyRevenue > 0 ? receivables / dailyRevenue : 0;
    const daysInventory = dailyCOGS > 0 ? inventory / dailyCOGS : 0;
    const daysPayables = dailyCOGS > 0 ? payables / dailyCOGS : 0;

    const cashConversionCycle = daysReceivables + daysInventory - daysPayables;

    return {
      workingCapital,
      currentRatio: Math.round(currentRatio * 100) / 100,
      quickRatio: Math.round(quickRatio * 100) / 100,
      cashRatio: Math.round(cashRatio * 100) / 100,
      daysReceivables: Math.round(daysReceivables),
      daysInventory: Math.round(daysInventory),
      daysPayables: Math.round(daysPayables),
      cashConversionCycle: Math.round(cashConversionCycle),
      liquidity: {
        rating: currentRatio > 2 ? 'Strong' : currentRatio > 1.5 ? 'Good' : currentRatio > 1 ? 'Adequate' : 'Weak',
        interpretation: `Company has $${(currentRatio).toFixed(2)} in current assets for every $1 of current liabilities`
      },
      efficiency: {
        rating: cashConversionCycle < 30 ? 'Excellent' : cashConversionCycle < 60 ? 'Good' : cashConversionCycle < 90 ? 'Average' : 'Poor',
        interpretation: `Company takes ${Math.round(cashConversionCycle)} days to convert investments to cash`
      }
    };
  }

  /**
   * Calculate all fundamental metrics for a company
   * @param {Object} financials - Company financial data
   * @returns {Object} Comprehensive fundamental analysis
   */
  getFullAnalysis(financials) {
    const {
      revenue, cogs, operatingIncome, netIncome, employees, marketCap,
      currentAssets, currentLiabilities, inventory, receivables, payables,
      ebit, interestExpense, totalDebt, debtSchedule, historicalMargins
    } = financials;

    return {
      profitability: {
        grossMargin: this.calculateGrossMargin(revenue, cogs),
        operatingMargin: this.calculateOperatingMargin(operatingIncome, revenue),
        netMargin: this.calculateNetMargin(netIncome, revenue)
      },
      valuation: {
        priceToSales: this.calculatePriceToSales(marketCap, revenue),
        revenuePerEmployee: this.calculateRevenuePerEmployee(revenue, employees)
      },
      liquidity: this.calculateWorkingCapital(
        currentAssets, currentLiabilities, inventory, receivables, payables, revenue, cogs
      ),
      leverage: {
        interestCoverage: this.calculateInterestCoverage(ebit, interestExpense),
        debtMaturity: debtSchedule ? this.calculateDebtMaturity(debtSchedule) : null,
        debtToEquity: totalDebt && marketCap ? Math.round((totalDebt / marketCap) * 100) / 100 : null
      },
      trends: historicalMargins ? this.calculateMarginExpansion(historicalMargins) : null,
      overallScore: this.calculateOverallScore(financials)
    };
  }

  /**
   * Calculate overall fundamental score
   */
  calculateOverallScore(financials) {
    let score = 0;
    let factors = 0;

    // Profitability (40% weight)
    const grossMargin = (financials.revenue - financials.cogs) / financials.revenue * 100;
    if (grossMargin > 40) score += 40;
    else if (grossMargin > 30) score += 32;
    else if (grossMargin > 20) score += 24;
    else score += 16;
    factors++;

    // Liquidity (20% weight)
    const currentRatio = financials.currentAssets / financials.currentLiabilities;
    if (currentRatio > 2) score += 20;
    else if (currentRatio > 1.5) score += 16;
    else if (currentRatio > 1) score += 12;
    else score += 8;
    factors++;

    // Leverage (20% weight)
    if (financials.ebit && financials.interestExpense) {
      const coverage = financials.ebit / financials.interestExpense;
      if (coverage > 5) score += 20;
      else if (coverage > 3) score += 16;
      else if (coverage > 1.5) score += 12;
      else score += 8;
      factors++;
    }

    // Efficiency (20% weight)
    if (financials.revenue && financials.employees) {
      const revPerEmp = financials.revenue / financials.employees;
      if (revPerEmp > 400000) score += 20;
      else if (revPerEmp > 250000) score += 16;
      else if (revPerEmp > 150000) score += 12;
      else score += 8;
      factors++;
    }

    const avgScore = factors > 0 ? Math.round(score / factors * 10) / 10 : 0;

    return {
      score: avgScore,
      maxScore: 100,
      rating: avgScore >= 80 ? 'Excellent' : avgScore >= 60 ? 'Good' : avgScore >= 40 ? 'Fair' : 'Poor',
      factors
    };
  }
}

module.exports = new FundamentalAnalysisService();
