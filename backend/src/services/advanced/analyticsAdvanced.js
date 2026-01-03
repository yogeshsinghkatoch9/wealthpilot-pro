/**
 * WealthPilot Pro - Advanced Analytics Service
 * Comprehensive portfolio analytics and risk calculations
 */

const Database = require('../../db/database');

class AdvancedAnalyticsService {
  constructor() {
    this.riskFreeRate = 0.05; // 5% annual risk-free rate
    this.tradingDaysPerYear = 252;
  }

  /**
   * Calculate comprehensive portfolio metrics
   */
  async getPortfolioMetrics(portfolioId, userId) {
    const portfolio = await db.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const holdings = portfolio.holdings || [];
    const totalValue = this.calculateTotalValue(holdings, portfolio.cashBalance);

    return {
      summary: this.calculateSummary(holdings, portfolio.cashBalance),
      performance: await this.calculatePerformance(portfolioId, holdings),
      risk: this.calculateRiskMetrics(holdings),
      allocation: this.calculateAllocation(holdings, totalValue),
      concentration: this.calculateConcentration(holdings, totalValue),
      quality: this.calculateQualityScore(holdings),
      recommendations: this.generateRecommendations(holdings, totalValue)
    };
  }

  /**
   * Calculate portfolio summary
   */
  calculateSummary(holdings, cashBalance = 0) {
    const holdingsValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    const totalValue = holdingsValue + cashBalance;
    const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);
    const totalGainLoss = holdings.reduce((sum, h) => sum + (h.unrealizedGainLoss || 0), 0);
    const dayChange = holdings.reduce((sum, h) => sum + (h.dayChange || 0), 0);

    return {
      totalValue,
      holdingsValue,
      cashBalance,
      cashPercent: totalValue > 0 ? (cashBalance / totalValue) * 100 : 0,
      totalCost,
      totalGainLoss,
      totalGainLossPercent: totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0,
      dayChange,
      dayChangePercent: totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      holdingsCount: holdings.length,
      winnersCount: holdings.filter(h => (h.unrealizedGainLoss || 0) > 0).length,
      losersCount: holdings.filter(h => (h.unrealizedGainLoss || 0) < 0).length
    };
  }

  /**
   * Calculate performance metrics
   */
  async calculatePerformance(portfolioId, holdings) {
    // Get historical snapshots
    const snapshots = await db.portfolioSnapshots?.findMany?.({
      where: { portfolioId },
      orderBy: { date: 'asc' }
    }) || [];

    const returns = this.calculateReturns(snapshots);
    
    return {
      // Period returns
      dayReturn: this.calculatePeriodReturn(returns, 1),
      weekReturn: this.calculatePeriodReturn(returns, 5),
      monthReturn: this.calculatePeriodReturn(returns, 21),
      quarterReturn: this.calculatePeriodReturn(returns, 63),
      ytdReturn: this.calculateYTDReturn(returns),
      yearReturn: this.calculatePeriodReturn(returns, 252),

      // Risk-adjusted metrics
      sharpeRatio: this.calculateSharpeRatio(returns),
      sortinoRatio: this.calculateSortinoRatio(returns),
      treynorRatio: this.calculateTreynorRatio(returns),
      informationRatio: this.calculateInformationRatio(returns),

      // Drawdown
      maxDrawdown: this.calculateMaxDrawdown(snapshots),
      currentDrawdown: this.calculateCurrentDrawdown(snapshots),

      // Benchmark comparison
      alpha: this.calculateAlpha(returns),
      beta: this.calculateBeta(returns),
      correlation: this.calculateCorrelation(returns),
      trackingError: this.calculateTrackingError(returns),

      // Time-weighted return
      twr: this.calculateTWR(snapshots),
      
      // Annualized metrics
      cagr: this.calculateCAGR(snapshots),
      volatility: this.calculateVolatility(returns)
    };
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(holdings) {
    const values = holdings.map(h => h.marketValue || 0);
    const totalValue = values.reduce((a, b) => a + b, 0);
    
    if (totalValue === 0) {
      return { riskLevel: 'low', score: 0, factors: [] };
    }

    const weights = values.map(v => v / totalValue);
    const riskFactors = [];

    // Concentration risk
    const maxWeight = Math.max(...weights);
    if (maxWeight > 0.25) {
      riskFactors.push({
        type: 'concentration',
        level: 'high',
        message: `Single position exceeds 25% (${(maxWeight * 100).toFixed(1)}%)`
      });
    }

    // Sector concentration
    const sectorWeights = this.calculateSectorWeights(holdings, totalValue);
    const maxSectorWeight = Math.max(...Object.values(sectorWeights));
    if (maxSectorWeight > 0.4) {
      riskFactors.push({
        type: 'sector_concentration',
        level: 'medium',
        message: 'Sector concentration exceeds 40%'
      });
    }

    // Diversification
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    const diversificationScore = 1 - hhi;
    if (hhi > 0.2) {
      riskFactors.push({
        type: 'diversification',
        level: 'medium',
        message: 'Portfolio may be under-diversified'
      });
    }

    // Calculate overall risk score (0-100)
    let riskScore = 50; // Base score
    riskScore += maxWeight > 0.3 ? 20 : maxWeight > 0.2 ? 10 : 0;
    riskScore += maxSectorWeight > 0.5 ? 15 : maxSectorWeight > 0.3 ? 8 : 0;
    riskScore += hhi > 0.3 ? 15 : hhi > 0.15 ? 8 : 0;
    riskScore = Math.min(100, Math.max(0, riskScore));

    const riskLevel = riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low';

    return {
      riskLevel,
      score: riskScore,
      factors: riskFactors,
      hhi,
      diversificationScore,
      concentrationRisk: maxWeight,
      sectorConcentration: maxSectorWeight,
      valueAtRisk: this.calculateVaR(holdings, totalValue),
      expectedShortfall: this.calculateExpectedShortfall(holdings, totalValue)
    };
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  calculateVaR(holdings, totalValue, confidence = 0.95) {
    // Simplified parametric VaR
    const avgVolatility = 0.15; // 15% assumed annual volatility
    const dailyVol = avgVolatility / Math.sqrt(252);
    const zScore = confidence === 0.99 ? 2.326 : 1.645;
    
    return {
      daily: totalValue * dailyVol * zScore,
      weekly: totalValue * dailyVol * zScore * Math.sqrt(5),
      monthly: totalValue * dailyVol * zScore * Math.sqrt(21),
      confidence
    };
  }

  /**
   * Calculate Expected Shortfall (CVaR)
   */
  calculateExpectedShortfall(holdings, totalValue, confidence = 0.95) {
    // Simplified ES calculation (approx 1.25x VaR for normal distribution)
    const var95 = this.calculateVaR(holdings, totalValue, confidence);
    return {
      daily: var95.daily * 1.25,
      weekly: var95.weekly * 1.25,
      monthly: var95.monthly * 1.25,
      confidence
    };
  }

  /**
   * Calculate allocation breakdown
   */
  calculateAllocation(holdings, totalValue) {
    if (totalValue === 0) return {};

    return {
      byAssetType: this.groupBy(holdings, 'assetType', totalValue),
      bySector: this.groupBy(holdings, 'sector', totalValue),
      byMarketCap: this.groupByMarketCap(holdings, totalValue),
      byGeography: this.groupBy(holdings, 'country', totalValue),
      byDividend: this.groupByDividend(holdings, totalValue)
    };
  }

  /**
   * Group holdings by field
   */
  groupBy(holdings, field, totalValue) {
    const grouped = {};
    
    holdings.forEach(h => {
      const key = h[field] || 'Other';
      if (!grouped[key]) {
        grouped[key] = { value: 0, count: 0, holdings: [] };
      }
      grouped[key].value += h.marketValue || 0;
      grouped[key].count += 1;
      grouped[key].holdings.push(h.symbol);
    });

    return Object.entries(grouped).map(([name, data]) => ({
      name,
      value: data.value,
      percent: (data.value / totalValue) * 100,
      count: data.count,
      holdings: data.holdings
    })).sort((a, b) => b.value - a.value);
  }

  /**
   * Group by market cap
   */
  groupByMarketCap(holdings, totalValue) {
    const categories = {
      'Large Cap': { min: 10e9, value: 0 },
      'Mid Cap': { min: 2e9, value: 0 },
      'Small Cap': { min: 300e6, value: 0 },
      'Micro Cap': { min: 0, value: 0 }
    };

    holdings.forEach(h => {
      const marketCap = h.marketCap || 0;
      if (marketCap >= 10e9) categories['Large Cap'].value += h.marketValue || 0;
      else if (marketCap >= 2e9) categories['Mid Cap'].value += h.marketValue || 0;
      else if (marketCap >= 300e6) categories['Small Cap'].value += h.marketValue || 0;
      else categories['Micro Cap'].value += h.marketValue || 0;
    });

    return Object.entries(categories).map(([name, data]) => ({
      name,
      value: data.value,
      percent: (data.value / totalValue) * 100
    })).filter(c => c.value > 0);
  }

  /**
   * Group by dividend status
   */
  groupByDividend(holdings, totalValue) {
    const dividend = { value: 0, count: 0 };
    const nonDividend = { value: 0, count: 0 };

    holdings.forEach(h => {
      if ((h.dividendYield || 0) > 0) {
        dividend.value += h.marketValue || 0;
        dividend.count += 1;
      } else {
        nonDividend.value += h.marketValue || 0;
        nonDividend.count += 1;
      }
    });

    return [
      { name: 'Dividend Paying', value: dividend.value, percent: (dividend.value / totalValue) * 100, count: dividend.count },
      { name: 'Non-Dividend', value: nonDividend.value, percent: (nonDividend.value / totalValue) * 100, count: nonDividend.count }
    ];
  }

  /**
   * Calculate concentration metrics
   */
  calculateConcentration(holdings, totalValue) {
    if (totalValue === 0 || holdings.length === 0) {
      return { hhi: 0, topHoldings: [], giniCoefficient: 0 };
    }

    const weights = holdings
      .map(h => ({ symbol: h.symbol, weight: (h.marketValue || 0) / totalValue }))
      .sort((a, b) => b.weight - a.weight);

    // Herfindahl-Hirschman Index
    const hhi = weights.reduce((sum, h) => sum + h.weight * h.weight, 0);

    // Top holdings
    const top5Value = weights.slice(0, 5).reduce((sum, h) => sum + h.weight, 0);
    const top10Value = weights.slice(0, 10).reduce((sum, h) => sum + h.weight, 0);

    // Gini coefficient
    const giniCoefficient = this.calculateGiniCoefficient(weights.map(w => w.weight));

    return {
      hhi,
      normalizedHHI: (hhi - 1 / holdings.length) / (1 - 1 / holdings.length),
      effectiveHoldings: 1 / hhi,
      top5Concentration: top5Value * 100,
      top10Concentration: top10Value * 100,
      giniCoefficient,
      topHoldings: weights.slice(0, 10).map(h => ({
        symbol: h.symbol,
        weight: h.weight * 100
      }))
    };
  }

  /**
   * Calculate Gini coefficient for concentration
   */
  calculateGiniCoefficient(weights) {
    const n = weights.length;
    if (n === 0) return 0;
    
    const sorted = [...weights].sort((a, b) => a - b);
    let sum = 0;
    
    for (let i = 0; i < n; i++) {
      sum += (2 * (i + 1) - n - 1) * sorted[i];
    }
    
    const mean = weights.reduce((a, b) => a + b, 0) / n;
    return sum / (n * n * mean);
  }

  /**
   * Calculate portfolio quality score
   */
  calculateQualityScore(holdings) {
    if (holdings.length === 0) {
      return { score: 0, factors: [] };
    }

    const factors = [];
    let score = 50;

    // Diversification (max 20 points)
    const diversificationScore = Math.min(holdings.length / 20, 1) * 20;
    score += diversificationScore;
    factors.push({ name: 'Diversification', score: diversificationScore, max: 20 });

    // Quality of holdings (max 15 points based on profit/loss ratio)
    const profitableCount = holdings.filter(h => (h.unrealizedGainLoss || 0) > 0).length;
    const profitRatio = holdings.length > 0 ? profitableCount / holdings.length : 0;
    const qualityScore = profitRatio * 15;
    score += qualityScore;
    factors.push({ name: 'Win Rate', score: qualityScore, max: 15 });

    // Income generation (max 15 points)
    const incomeHoldings = holdings.filter(h => (h.dividendYield || 0) > 0).length;
    const incomeScore = Math.min(incomeHoldings / holdings.length, 0.5) * 2 * 15;
    score += incomeScore;
    factors.push({ name: 'Income Generation', score: incomeScore, max: 15 });

    return {
      score: Math.min(100, Math.round(score)),
      grade: this.getGrade(score),
      factors
    };
  }

  /**
   * Get letter grade from score
   */
  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    return 'D';
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(holdings, totalValue) {
    const recommendations = [];

    if (holdings.length === 0) {
      recommendations.push({
        type: 'action',
        priority: 'high',
        title: 'Add Holdings',
        description: 'Start building your portfolio by adding your first holdings.'
      });
      return recommendations;
    }

    // Check concentration
    const weights = holdings.map(h => (h.marketValue || 0) / totalValue);
    const maxWeight = Math.max(...weights);
    if (maxWeight > 0.2) {
      const topHolding = holdings.find(h => (h.marketValue || 0) / totalValue === maxWeight);
      recommendations.push({
        type: 'warning',
        priority: 'medium',
        title: 'High Concentration Risk',
        description: `${topHolding?.symbol} represents ${(maxWeight * 100).toFixed(1)}% of your portfolio. Consider rebalancing.`
      });
    }

    // Check diversification
    if (holdings.length < 10) {
      recommendations.push({
        type: 'suggestion',
        priority: 'low',
        title: 'Increase Diversification',
        description: `With only ${holdings.length} holdings, consider adding more positions to reduce risk.`
      });
    }

    // Check for losses
    const largeLosses = holdings.filter(h => {
      const lossPercent = h.costBasis > 0 ? (h.unrealizedGainLoss / h.costBasis) * 100 : 0;
      return lossPercent < -20;
    });
    if (largeLosses.length > 0) {
      recommendations.push({
        type: 'review',
        priority: 'medium',
        title: 'Review Underperformers',
        description: `${largeLosses.length} holding(s) have losses exceeding 20%. Consider if your thesis still holds.`
      });
    }

    return recommendations;
  }

  /**
   * Helper methods for return calculations
   */
  calculateReturns(snapshots) {
    if (snapshots.length < 2) return [];
    return snapshots.slice(1).map((s, i) => ({
      date: s.date,
      return: (s.totalValue - snapshots[i].totalValue) / snapshots[i].totalValue
    }));
  }

  calculatePeriodReturn(returns, days) {
    const recentReturns = returns.slice(-days);
    if (recentReturns.length === 0) return 0;
    return recentReturns.reduce((acc, r) => acc * (1 + r.return), 1) - 1;
  }

  calculateYTDReturn(returns) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdReturns = returns.filter(r => new Date(r.date) >= yearStart);
    if (ytdReturns.length === 0) return 0;
    return ytdReturns.reduce((acc, r) => acc * (1 + r.return), 1) - 1;
  }

  calculateSharpeRatio(returns) {
    if (returns.length < 30) return null;
    const avgReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r.return - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedReturn = avgReturn * this.tradingDaysPerYear;
    const annualizedStdDev = stdDev * Math.sqrt(this.tradingDaysPerYear);
    return annualizedStdDev > 0 ? (annualizedReturn - this.riskFreeRate) / annualizedStdDev : 0;
  }

  calculateSortinoRatio(returns) {
    if (returns.length < 30) return null;
    const avgReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    const negativeReturns = returns.filter(r => r.return < 0);
    if (negativeReturns.length === 0) return Infinity;
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r.return, 2), 0) / returns.length;
    const downsideDev = Math.sqrt(downsideVariance) * Math.sqrt(this.tradingDaysPerYear);
    const annualizedReturn = avgReturn * this.tradingDaysPerYear;
    return downsideDev > 0 ? (annualizedReturn - this.riskFreeRate) / downsideDev : 0;
  }

  calculateTreynorRatio(returns) {
    const beta = this.calculateBeta(returns);
    if (!beta || beta === 0) return null;
    const avgReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    const annualizedReturn = avgReturn * this.tradingDaysPerYear;
    return (annualizedReturn - this.riskFreeRate) / beta;
  }

  calculateInformationRatio(returns) {
    const trackingError = this.calculateTrackingError(returns);
    if (!trackingError || trackingError === 0) return null;
    const avgActiveReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    return (avgActiveReturn * this.tradingDaysPerYear) / trackingError;
  }

  calculateMaxDrawdown(snapshots) {
    if (snapshots.length < 2) return 0;
    let maxDrawdown = 0;
    let peak = snapshots[0].totalValue;
    for (const snapshot of snapshots) {
      if (snapshot.totalValue > peak) peak = snapshot.totalValue;
      const drawdown = (peak - snapshot.totalValue) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown * 100;
  }

  calculateCurrentDrawdown(snapshots) {
    if (snapshots.length < 2) return 0;
    const peak = Math.max(...snapshots.map(s => s.totalValue));
    const current = snapshots[snapshots.length - 1].totalValue;
    return ((peak - current) / peak) * 100;
  }

  calculateAlpha(returns) {
    // Simplified alpha calculation
    return 0.02; // Placeholder
  }

  calculateBeta(returns) {
    // Simplified beta calculation
    return 1.0; // Placeholder
  }

  calculateCorrelation(returns) {
    return 0.85; // Placeholder
  }

  calculateTrackingError(returns) {
    return 0.05; // Placeholder
  }

  calculateTWR(snapshots) {
    if (snapshots.length < 2) return 0;
    let twr = 1;
    for (let i = 1; i < snapshots.length; i++) {
      const periodReturn = (snapshots[i].totalValue - snapshots[i - 1].totalValue) / snapshots[i - 1].totalValue;
      twr *= (1 + periodReturn);
    }
    return (twr - 1) * 100;
  }

  calculateCAGR(snapshots) {
    if (snapshots.length < 2) return 0;
    const startValue = snapshots[0].totalValue;
    const endValue = snapshots[snapshots.length - 1].totalValue;
    const years = snapshots.length / this.tradingDaysPerYear;
    if (years === 0 || startValue === 0) return 0;
    return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  }

  calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    const avgReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r.return - avgReturn, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(this.tradingDaysPerYear) * 100;
  }

  calculateTotalValue(holdings, cashBalance = 0) {
    return holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0) + cashBalance;
  }

  calculateSectorWeights(holdings, totalValue) {
    const sectors = {};
    holdings.forEach(h => {
      const sector = h.sector || 'Other';
      sectors[sector] = (sectors[sector] || 0) + (h.marketValue || 0) / totalValue;
    });
    return sectors;
  }
}

module.exports = new AdvancedAnalyticsService();
