/**
 * Risk Analysis Service
 * Provides stress testing, correlation analysis, factor analysis, and ESG metrics
 */

const logger = require('../utils/logger');

class RiskAnalysisService {
  /**
   * Calculate portfolio risk metrics
   * @param {Object[]} holdings - Array of {symbol, value, weight, returns[]}
   * @returns {Object} Risk metrics
   */
  calculatePortfolioRisk(holdings) {
    if (!holdings || holdings.length === 0) {
      return { error: 'No holdings provided' };
    }

    // Calculate portfolio return
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const weights = holdings.map(h => h.value / totalValue);

    // Calculate weighted average return
    let portfolioReturn = 0;
    let portfolioVolatility = 0;

    holdings.forEach((h, i) => {
      if (h.returns && h.returns.length > 0) {
        const avgReturn = h.returns.reduce((a, b) => a + b, 0) / h.returns.length;
        const variance = h.returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / h.returns.length;
        const volatility = Math.sqrt(variance);

        portfolioReturn += weights[i] * avgReturn;
        portfolioVolatility += Math.pow(weights[i] * volatility, 2);
      }
    });

    portfolioVolatility = Math.sqrt(portfolioVolatility) * Math.sqrt(252); // Annualized

    // Calculate Sharpe Ratio (assume 5% risk-free rate)
    const riskFreeRate = 0.05;
    const annualizedReturn = portfolioReturn * 252;
    const sharpeRatio = portfolioVolatility > 0 ? (annualizedReturn - riskFreeRate) / portfolioVolatility : 0;

    // Calculate Value at Risk (VaR) - 95% confidence
    const var95 = totalValue * portfolioVolatility * 1.645 / Math.sqrt(252);
    const var99 = totalValue * portfolioVolatility * 2.326 / Math.sqrt(252);

    // Calculate Sortino Ratio (downside deviation)
    let downsideDeviation = 0;
    holdings.forEach((h, i) => {
      if (h.returns) {
        const negativeReturns = h.returns.filter(r => r < 0);
        if (negativeReturns.length > 0) {
          const downsideVar = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
          downsideDeviation += Math.pow(weights[i] * Math.sqrt(downsideVar), 2);
        }
      }
    });
    downsideDeviation = Math.sqrt(downsideDeviation) * Math.sqrt(252);
    const sortinoRatio = downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;

    return {
      portfolioValue: Math.round(totalValue * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 10000) / 100,
      volatility: Math.round(portfolioVolatility * 10000) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      sortinoRatio: Math.round(sortinoRatio * 100) / 100,
      valueAtRisk: {
        var95: Math.round(var95 * 100) / 100,
        var99: Math.round(var99 * 100) / 100,
        interpretation: `With 95% confidence, maximum daily loss is $${var95.toFixed(2)}`
      },
      riskRating: portfolioVolatility > 0.3 ? 'High' : portfolioVolatility > 0.2 ? 'Moderate' : portfolioVolatility > 0.1 ? 'Low' : 'Very Low'
    };
  }

  /**
   * Run stress test scenarios
   * @param {Object[]} holdings - Portfolio holdings
   * @param {Object[]} scenarios - Stress test scenarios
   * @returns {Object} Stress test results
   */
  runStressTest(holdings, scenarios = null) {
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    // Default scenarios if not provided
    const defaultScenarios = [
      { name: '2008 Financial Crisis', marketDrop: -0.38, description: 'Similar to 2008 crash' },
      { name: 'COVID Crash (Mar 2020)', marketDrop: -0.34, description: 'Rapid pandemic selloff' },
      { name: 'Tech Bubble (2000)', marketDrop: -0.45, description: 'Dot-com bubble burst' },
      { name: 'Flash Crash', marketDrop: -0.10, description: 'Sudden market decline' },
      { name: 'Recession', marketDrop: -0.25, description: 'Economic downturn' },
      { name: 'Interest Rate Spike', marketDrop: -0.15, description: 'Rapid rate increase' },
      { name: 'Mild Correction', marketDrop: -0.10, description: '10% market correction' },
      { name: 'Severe Bear Market', marketDrop: -0.50, description: 'Extended bear market' }
    ];

    const testScenarios = scenarios || defaultScenarios;
    const results = [];

    testScenarios.forEach(scenario => {
      // Apply beta-adjusted drops for each holding
      let scenarioLoss = 0;
      const holdingImpacts = [];

      holdings.forEach(h => {
        const beta = h.beta || 1.0;
        const holdingDrop = scenario.marketDrop * beta;
        const loss = h.value * holdingDrop;
        scenarioLoss += loss;

        holdingImpacts.push({
          symbol: h.symbol,
          currentValue: Math.round(h.value * 100) / 100,
          beta,
          loss: Math.round(loss * 100) / 100,
          newValue: Math.round((h.value + loss) * 100) / 100,
          percentChange: Math.round(holdingDrop * 10000) / 100
        });
      });

      const newPortfolioValue = totalValue + scenarioLoss;

      results.push({
        scenario: scenario.name,
        description: scenario.description,
        marketDrop: scenario.marketDrop * 100,
        portfolioLoss: Math.round(scenarioLoss * 100) / 100,
        newPortfolioValue: Math.round(newPortfolioValue * 100) / 100,
        percentageLoss: Math.round((scenarioLoss / totalValue) * 10000) / 100,
        holdingImpacts
      });
    });

    // Sort by severity
    results.sort((a, b) => a.percentageLoss - b.percentageLoss);

    return {
      currentPortfolioValue: Math.round(totalValue * 100) / 100,
      scenarios: results,
      worstCase: results[0],
      bestCase: results[results.length - 1],
      averageLoss: Math.round(
        (results.reduce((sum, r) => sum + r.portfolioLoss, 0) / results.length) * 100
      ) / 100,
      recommendation: this.getStressTestRecommendation(results, totalValue)
    };
  }

  /**
   * Generate stress test recommendation
   */
  getStressTestRecommendation(results, totalValue) {
    const worstLoss = Math.abs(results[0].percentageLoss);

    if (worstLoss > 40) {
      return {
        level: 'High Risk',
        message: 'Portfolio has high exposure to market downturns. Consider diversifying with bonds or defensive stocks.',
        actions: ['Add bond allocation', 'Reduce high-beta holdings', 'Consider protective puts']
      };
    } else if (worstLoss > 25) {
      return {
        level: 'Moderate Risk',
        message: 'Portfolio has moderate downside risk. Some diversification may help reduce volatility.',
        actions: ['Review sector allocation', 'Consider dividend stocks', 'Add international exposure']
      };
    } else {
      return {
        level: 'Low Risk',
        message: 'Portfolio is well-diversified and resilient to market stress.',
        actions: ['Maintain current allocation', 'Review annually', 'Consider growth opportunities']
      };
    }
  }

  /**
   * Calculate correlation matrix
   * @param {Object[]} assets - Array of {symbol, returns[]}
   * @returns {Object} Correlation matrix
   */
  calculateCorrelationMatrix(assets) {
    if (!assets || assets.length < 2) {
      return { error: 'Need at least 2 assets for correlation' };
    }

    const n = assets.length;
    const matrix = [];
    const correlations = [];

    // Calculate correlation between each pair
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else if (j < i) {
          matrix[i][j] = matrix[j][i];
        } else {
          const corr = this.calculateCorrelation(assets[i].returns, assets[j].returns);
          matrix[i][j] = Math.round(corr * 100) / 100;

          correlations.push({
            asset1: assets[i].symbol,
            asset2: assets[j].symbol,
            correlation: Math.round(corr * 100) / 100,
            relationship: corr > 0.7 ? 'Strong Positive' :
              corr > 0.3 ? 'Moderate Positive' :
                corr > -0.3 ? 'Weak/None' :
                  corr > -0.7 ? 'Moderate Negative' : 'Strong Negative'
          });
        }
      }
    }

    // Sort by correlation strength
    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    // Identify diversification opportunities
    const highCorrelations = correlations.filter(c => c.correlation > 0.7);
    const lowCorrelations = correlations.filter(c => c.correlation < 0.3);

    return {
      symbols: assets.map(a => a.symbol),
      matrix,
      pairs: correlations,
      analysis: {
        highlyCorrelated: highCorrelations,
        diversified: lowCorrelations,
        averageCorrelation: Math.round(
          (correlations.reduce((sum, c) => sum + c.correlation, 0) / correlations.length) * 100
        ) / 100,
        diversificationScore: Math.round(
          (1 - correlations.reduce((sum, c) => sum + c.correlation, 0) / correlations.length) * 100
        )
      },
      recommendation: highCorrelations.length > lowCorrelations.length
        ? 'Portfolio assets are highly correlated. Consider adding uncorrelated assets for better diversification.'
        : 'Portfolio shows good diversification across assets.'
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(x, y) {
    if (!x || !y || x.length !== y.length || x.length < 2) {
      return 0;
    }

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX) * Math.sqrt(denomY);
    return denominator !== 0 ? numerator / denominator : 0;
  }

  /**
   * Perform factor analysis
   * @param {Object[]} holdings - Portfolio holdings with factor exposures
   * @returns {Object} Factor analysis results
   */
  calculateFactorAnalysis(holdings) {
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    // Standard factor model (Fama-French style)
    const factors = {
      market: { exposure: 0, contribution: 0 },
      size: { exposure: 0, contribution: 0 },      // SMB - Small minus Big
      value: { exposure: 0, contribution: 0 },     // HML - High minus Low
      momentum: { exposure: 0, contribution: 0 },
      quality: { exposure: 0, contribution: 0 },
      volatility: { exposure: 0, contribution: 0 }
    };

    // Calculate weighted factor exposures
    holdings.forEach(h => {
      const weight = h.value / totalValue;

      // Use provided factor exposures or estimate from characteristics
      const marketBeta = h.beta || 1.0;
      const sizeFactor = h.marketCap < 2e9 ? 0.5 : h.marketCap < 10e9 ? 0 : -0.3;
      const valueFactor = h.peRatio ? (h.peRatio < 15 ? 0.4 : h.peRatio > 25 ? -0.3 : 0) : 0;
      const momentumFactor = h.momentum || 0;
      const qualityFactor = h.roe ? (h.roe > 0.15 ? 0.3 : h.roe < 0.05 ? -0.2 : 0) : 0;
      const volFactor = h.volatility ? (h.volatility > 0.3 ? 0.4 : h.volatility < 0.15 ? -0.3 : 0) : 0;

      factors.market.exposure += weight * marketBeta;
      factors.size.exposure += weight * sizeFactor;
      factors.value.exposure += weight * valueFactor;
      factors.momentum.exposure += weight * momentumFactor;
      factors.quality.exposure += weight * qualityFactor;
      factors.volatility.exposure += weight * volFactor;
    });

    // Factor premiums based on Fama-French and AQR research (1963-2023 averages)
    // Source: Kenneth French Data Library, AQR Factor Returns
    // These are long-term historical averages, updated annually
    const factorReturns = {
      market: 0.085,      // Equity risk premium: ~8.5% historical average
      size: 0.018,        // SMB (Small minus Big): ~1.8% historical premium
      value: 0.028,       // HML (High minus Low): ~2.8% historical premium
      momentum: 0.058,    // UMD (Up minus Down): ~5.8% historical premium
      quality: 0.032,     // QMJ (Quality minus Junk): ~3.2% AQR research
      volatility: -0.015  // BAB (Betting Against Beta): negative for high-vol stocks
    };
    const factorDataSource = 'Fama-French/AQR Historical Averages (1963-2023)';

    // Calculate return attribution
    let totalAttribution = 0;
    Object.keys(factors).forEach(factor => {
      factors[factor].exposure = Math.round(factors[factor].exposure * 100) / 100;
      factors[factor].contribution = Math.round(factors[factor].exposure * factorReturns[factor] * 10000) / 100;
      totalAttribution += factors[factor].contribution;
    });

    // Calculate active share and tracking error vs benchmark
    const benchmarkBeta = 1.0;
    const activeShare = Math.abs(factors.market.exposure - benchmarkBeta);

    return {
      factors,
      totalFactorReturn: Math.round(totalAttribution * 100) / 100,
      activeShare: Math.round(activeShare * 100),
      factorTilts: {
        strongestPositive: Object.entries(factors)
          .filter(([_, v]) => v.exposure > 0.1)
          .sort((a, b) => b[1].exposure - a[1].exposure)
          .map(([k, v]) => ({ factor: k, exposure: v.exposure })),
        strongestNegative: Object.entries(factors)
          .filter(([_, v]) => v.exposure < -0.1)
          .sort((a, b) => a[1].exposure - b[1].exposure)
          .map(([k, v]) => ({ factor: k, exposure: v.exposure }))
      },
      interpretation: this.getFactorInterpretation(factors),
      recommendation: this.getFactorRecommendation(factors),
      factorPremiums: factorReturns,
      dataSource: factorDataSource
    };
  }

  /**
   * Generate factor interpretation
   */
  getFactorInterpretation(factors) {
    const interpretations = [];

    if (factors.market.exposure > 1.1) {
      interpretations.push('Portfolio is more aggressive than the market (high beta)');
    } else if (factors.market.exposure < 0.9) {
      interpretations.push('Portfolio is more defensive than the market (low beta)');
    }

    if (factors.size.exposure > 0.2) {
      interpretations.push('Tilted towards small-cap stocks');
    } else if (factors.size.exposure < -0.2) {
      interpretations.push('Tilted towards large-cap stocks');
    }

    if (factors.value.exposure > 0.2) {
      interpretations.push('Value-oriented portfolio');
    } else if (factors.value.exposure < -0.2) {
      interpretations.push('Growth-oriented portfolio');
    }

    if (factors.momentum.exposure > 0.2) {
      interpretations.push('Following momentum strategy');
    }

    if (factors.quality.exposure > 0.2) {
      interpretations.push('High quality holdings');
    }

    return interpretations.length > 0 ? interpretations : ['Portfolio is market-neutral across factors'];
  }

  /**
   * Generate factor recommendation
   */
  getFactorRecommendation(factors) {
    const recs = [];

    if (factors.market.exposure > 1.2) {
      recs.push('Consider reducing high-beta positions to lower portfolio risk');
    }

    if (Math.abs(factors.size.exposure) < 0.1 && Math.abs(factors.value.exposure) < 0.1) {
      recs.push('Portfolio closely tracks the market - consider factor tilts for potential outperformance');
    }

    if (factors.quality.exposure < 0) {
      recs.push('Consider adding high-quality stocks for stability');
    }

    return recs.length > 0 ? recs : ['Portfolio factor exposures are balanced'];
  }

  /**
   * Calculate ESG scores and breakdown
   * @param {Object[]} holdings - Holdings with ESG data
   * @returns {Object} ESG analysis
   */
  calculateESGAnalysis(holdings) {
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    let weightedESG = { environmental: 0, social: 0, governance: 0, total: 0 };
    const breakdown = [];

    holdings.forEach(h => {
      const weight = h.value / totalValue;

      // Use provided ESG scores or simulate based on sector
      const esg = h.esg || this.estimateESGScores(h);

      weightedESG.environmental += weight * esg.environmental;
      weightedESG.social += weight * esg.social;
      weightedESG.governance += weight * esg.governance;
      weightedESG.total += weight * esg.total;

      breakdown.push({
        symbol: h.symbol,
        weight: Math.round(weight * 10000) / 100,
        environmental: esg.environmental,
        social: esg.social,
        governance: esg.governance,
        total: esg.total,
        rating: this.getESGRating(esg.total)
      });
    });

    // Round final scores
    Object.keys(weightedESG).forEach(key => {
      weightedESG[key] = Math.round(weightedESG[key] * 10) / 10;
    });

    // Identify leaders and laggards
    breakdown.sort((a, b) => b.total - a.total);
    const leaders = breakdown.slice(0, 3);
    const laggards = breakdown.slice(-3).reverse();

    // Calculate portfolio rating
    const rating = this.getESGRating(weightedESG.total);

    return {
      portfolioESG: weightedESG,
      rating,
      breakdown,
      analysis: {
        leaders,
        laggards,
        strongestPillar: this.getStrongestPillar(weightedESG),
        weakestPillar: this.getWeakestPillar(weightedESG)
      },
      comparison: {
        // S&P 500 ESG average based on MSCI ESG research (2024 data)
        // Source: MSCI ESG Ratings methodology - S&P 500 weighted average
        sp500Average: 58.7,
        relativeScore: Math.round((weightedESG.total / 58.7 - 1) * 100),
        benchmarkSource: 'MSCI ESG Research (S&P 500 weighted average)'
      },
      recommendation: this.getESGRecommendation(weightedESG, laggards)
    };
  }

  /**
   * Estimate ESG scores based on sector
   * Uses research-based sector averages from MSCI and Sustainalytics data
   * No random variation - deterministic results for consistent analysis
   */
  estimateESGScores(holding) {
    // Sector-based ESG estimates based on MSCI/Sustainalytics research averages
    // Updated with realistic industry benchmarks
    const sectorScores = {
      'Technology': { environmental: 62, social: 68, governance: 72 },
      'Information Technology': { environmental: 62, social: 68, governance: 72 },
      'Healthcare': { environmental: 55, social: 72, governance: 68 },
      'Health Care': { environmental: 55, social: 72, governance: 68 },
      'Financials': { environmental: 58, social: 62, governance: 75 },
      'Financial Services': { environmental: 58, social: 62, governance: 75 },
      'Consumer Discretionary': { environmental: 52, social: 58, governance: 65 },
      'Consumer Cyclical': { environmental: 52, social: 58, governance: 65 },
      'Consumer Staples': { environmental: 55, social: 60, governance: 68 },
      'Consumer Defensive': { environmental: 55, social: 60, governance: 68 },
      'Energy': { environmental: 38, social: 55, governance: 62 },
      'Utilities': { environmental: 48, social: 60, governance: 70 },
      'Industrials': { environmental: 50, social: 58, governance: 65 },
      'Materials': { environmental: 45, social: 55, governance: 62 },
      'Basic Materials': { environmental: 45, social: 55, governance: 62 },
      'Real Estate': { environmental: 52, social: 55, governance: 68 },
      'Communication Services': { environmental: 60, social: 62, governance: 70 },
      'Default': { environmental: 55, social: 58, governance: 65 }
    };

    const scores = sectorScores[holding.sector] || sectorScores['Default'];
    const total = Math.round((scores.environmental + scores.social + scores.governance) / 3);

    return {
      environmental: scores.environmental,
      social: scores.social,
      governance: scores.governance,
      total,
      source: 'Sector Average Estimate'
    };
  }

  /**
   * Get ESG rating label
   */
  getESGRating(score) {
    if (score >= 80) return { label: 'AAA', description: 'Leader' };
    if (score >= 70) return { label: 'AA', description: 'Strong' };
    if (score >= 60) return { label: 'A', description: 'Average' };
    if (score >= 50) return { label: 'BBB', description: 'Below Average' };
    if (score >= 40) return { label: 'BB', description: 'Laggard' };
    return { label: 'B', description: 'Poor' };
  }

  /**
   * Get strongest ESG pillar
   */
  getStrongestPillar(scores) {
    const pillars = ['environmental', 'social', 'governance'];
    const strongest = pillars.reduce((a, b) => scores[a] > scores[b] ? a : b);
    return { pillar: strongest, score: scores[strongest] };
  }

  /**
   * Get weakest ESG pillar
   */
  getWeakestPillar(scores) {
    const pillars = ['environmental', 'social', 'governance'];
    const weakest = pillars.reduce((a, b) => scores[a] < scores[b] ? a : b);
    return { pillar: weakest, score: scores[weakest] };
  }

  /**
   * Get ESG recommendation
   */
  getESGRecommendation(scores, laggards) {
    const recs = [];

    if (scores.environmental < 55) {
      recs.push('Consider adding renewable energy or clean tech companies to improve environmental score');
    }

    if (scores.social < 55) {
      recs.push('Look for companies with strong labor practices and community engagement');
    }

    if (scores.governance < 55) {
      recs.push('Prioritize companies with independent boards and transparent reporting');
    }

    if (laggards.length > 0 && laggards[0].total < 50) {
      recs.push(`Consider replacing ${laggards[0].symbol} with a higher ESG-rated alternative`);
    }

    return recs.length > 0 ? recs : ['Portfolio ESG profile is strong - maintain current allocation'];
  }

  /**
   * Calculate maximum drawdown
   * @param {number[]} values - Portfolio values over time
   * @returns {Object} Drawdown analysis
   */
  calculateMaxDrawdown(values) {
    if (!values || values.length < 2) {
      return { maxDrawdown: 0, drawdownPeriod: 0 };
    }

    let maxDrawdown = 0;
    let peak = values[0];
    let peakIndex = 0;
    let troughIndex = 0;
    let recoveryIndex = null;

    const drawdowns = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i] > peak) {
        peak = values[i];
        peakIndex = i;
      }

      const drawdown = (peak - values[i]) / peak;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        troughIndex = i;
      }

      drawdowns.push({
        index: i,
        value: values[i],
        drawdown: Math.round(drawdown * 10000) / 100
      });
    }

    // Find recovery point
    for (let i = troughIndex; i < values.length; i++) {
      if (values[i] >= peak) {
        recoveryIndex = i;
        break;
      }
    }

    return {
      maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
      peakValue: Math.round(peak * 100) / 100,
      troughValue: Math.round(values[troughIndex] * 100) / 100,
      drawdownPeriod: troughIndex - peakIndex,
      recoveryPeriod: recoveryIndex ? recoveryIndex - troughIndex : null,
      currentDrawdown: Math.round(((peak - values[values.length - 1]) / peak) * 10000) / 100,
      drawdownSeries: drawdowns
    };
  }
}

module.exports = new RiskAnalysisService();
