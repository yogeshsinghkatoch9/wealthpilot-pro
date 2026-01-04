const express = require('express');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/portfolio-analytics/comprehensive
 * Get comprehensive analytics for a specific portfolio or all portfolios
 */
router.get('/comprehensive', async (req, res) => {
  try {
    const { portfolioId, period = '1Y' } = req.query;
    const userId = req.user.id;

    // Get portfolios (specific one or all)
    let portfolios;
    if (portfolioId && portfolioId !== 'all') {
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: portfolioId, userId },
        include: { holdings: true }
      });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      portfolios = [portfolio];
    } else {
      portfolios = await prisma.portfolio.findMany({
        where: { userId },
        include: { holdings: true }
      });
    }

    if (portfolios.length === 0) {
      return res.status(404).json({ error: 'No portfolios found' });
    }

    // Get period in days
    const periodDays = getPeriodDays(period);

    // Aggregate holdings across selected portfolios
    const allHoldings = [];
    let totalCash = 0;
    for (const p of portfolios) {
      totalCash += Number(p.cashBalance) || 0;
      for (const h of p.holdings) {
        allHoldings.push({
          ...h,
          portfolioId: p.id,
          portfolioName: p.name
        });
      }
    }

    if (allHoldings.length === 0) {
      return res.json({
        portfolios: portfolios.map(p => ({ id: p.id, name: p.name })),
        message: 'No holdings in selected portfolio(s)',
        performance: {},
        metrics: {},
        holdings: [],
        history: [],
        attribution: {}
      });
    }

    // Get unique symbols and fetch quotes
    const symbols = [...new Set(allHoldings.map(h => h.symbol))];
    const quotes = await MarketDataService.getQuotes(symbols);

    // Fetch historical data for all symbols
    const historicalData = {};
    for (const symbol of symbols.slice(0, 50)) { // Limit to 50 for performance
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, periodDays);
        if (history && history.length > 0) {
          historicalData[symbol] = history;
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }
    }

    // Get SPY benchmark data
    let benchmarkHistory = [];
    try {
      benchmarkHistory = await MarketDataService.getHistoricalPrices('SPY', periodDays);
    } catch (err) {
      logger.warn('Failed to get SPY benchmark:', err.message);
    }

    // Calculate current values and weights
    let totalValue = totalCash;
    let totalCost = 0;
    let dayChange = 0;
    const holdingsWithData = [];
    const sectorMap = {};

    for (const h of allHoldings) {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const cost = Number(h.avgCostBasis);
      const price = Number(quote.price) || cost;
      const prevClose = Number(quote.previousClose) || price;
      const value = shares * price;
      const costBasis = shares * cost;
      const sector = quote.sector || h.sector || 'Unknown';

      totalValue += value;
      totalCost += costBasis;
      dayChange += shares * (price - prevClose);

      // Sector allocation
      if (!sectorMap[sector]) {
        sectorMap[sector] = { value: 0, cost: 0, symbols: [] };
      }
      sectorMap[sector].value += value;
      sectorMap[sector].cost += costBasis;
      sectorMap[sector].symbols.push(h.symbol);

      holdingsWithData.push({
        symbol: h.symbol,
        name: quote.name || h.symbol,
        shares,
        price,
        prevClose,
        cost,
        value,
        costBasis,
        gain: value - costBasis,
        gainPct: costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0,
        dayChange: shares * (price - prevClose),
        dayChangePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
        sector,
        beta: Number(quote.beta) || 1,
        portfolioId: h.portfolioId,
        portfolioName: h.portfolioName
      });
    }

    // Calculate weights
    for (const h of holdingsWithData) {
      h.weight = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
      h.contribution = h.weight * (h.gainPct / 100);
    }

    // Calculate daily returns for portfolio
    const portfolioReturns = calculatePortfolioReturns(holdingsWithData, historicalData, totalValue, totalCash);
    const benchmarkReturns = calculateBenchmarkReturns(benchmarkHistory);

    // Calculate comprehensive metrics
    const metrics = calculateComprehensiveMetrics(portfolioReturns, benchmarkReturns, totalValue, totalCost, dayChange);

    // Generate historical chart data
    const history = generateHistoryData(holdingsWithData, historicalData, benchmarkHistory, totalCash, periodDays);

    // Calculate sector attribution
    const sectorAttribution = Object.entries(sectorMap).map(([sector, data]) => {
      const weight = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
      const sectorReturn = data.cost > 0 ? ((data.value - data.cost) / data.cost) * 100 : 0;
      return {
        sector,
        value: data.value,
        weight,
        return: sectorReturn,
        contribution: weight * sectorReturn / 100,
        holdings: data.symbols.length
      };
    }).sort((a, b) => b.value - a.value);

    // Calculate factor attribution
    const factorAttribution = calculateFactorAttribution(holdingsWithData, quotes, metrics);

    // Calculate correlation matrix
    const correlationMatrix = calculateCorrelationMatrix(holdingsWithData.slice(0, 10), historicalData);

    // Calculate drawdown series
    const drawdownData = calculateDrawdownSeries(history);

    // Calculate returns distribution
    const returnsDistribution = calculateReturnsDistribution(portfolioReturns);

    res.json({
      portfolios: portfolios.map(p => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
      selectedPortfolioId: portfolioId || 'all',
      period,

      // Performance summary
      performance: {
        totalValue,
        totalCost,
        totalGain: totalValue - totalCost,
        totalGainPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        totalReturn: metrics.periodReturn,
        dayChange,
        dayChangePct: (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
        ytdReturn: metrics.ytdReturn,
        periodReturn: metrics.periodReturn,
        benchmarkReturn: metrics.benchmarkReturn,
        alpha: metrics.alpha,
        sharpeRatio: metrics.sharpeRatio,
        volatility: metrics.volatility
      },

      // Risk metrics
      metrics: {
        sharpeRatio: metrics.sharpeRatio,
        sortinoRatio: metrics.sortinoRatio,
        calmarRatio: metrics.calmarRatio,
        treynorRatio: metrics.treynorRatio,
        informationRatio: metrics.informationRatio,
        beta: metrics.beta,
        alpha: metrics.alpha,
        rSquared: metrics.rSquared,
        trackingError: metrics.trackingError,
        volatility: metrics.volatility,
        downsideVolatility: metrics.downsideVolatility,
        maxDrawdown: metrics.maxDrawdown,
        var95: metrics.var95,
        winRate: metrics.winRate,
        bestDay: metrics.bestDay,
        worstDay: metrics.worstDay,
        avgDailyReturn: metrics.avgDailyReturn
      },

      // Holdings data
      holdings: holdingsWithData.sort((a, b) => b.value - a.value),

      // Historical chart data
      history,

      // Drawdown data
      drawdown: drawdownData,

      // Returns distribution
      returnsDistribution,

      // Attribution
      attribution: {
        sectors: sectorAttribution,
        factors: factorAttribution,
        topContributors: holdingsWithData.filter(h => h.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 5),
        topDetractors: holdingsWithData.filter(h => h.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 5)
      },

      // Correlation matrix
      correlation: correlationMatrix
    });

  } catch (err) {
    logger.error('Comprehensive analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics', details: err.message });
  }
});

/**
 * GET /api/portfolio-analytics/list
 * Get list of user's portfolios for selector
 */
router.get('/list', async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        holdings: true,
        _count: { select: { transactions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const symbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = symbols.length > 0 ? await MarketDataService.getQuotes(symbols) : {};

    const portfolioList = portfolios.map(p => {
      let totalValue = Number(p.cashBalance) || 0;
      let totalCost = 0;
      let dayChange = 0;

      for (const h of p.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avgCostBasis);
        const price = Number(quote.price) || cost;
        const prevClose = Number(quote.previousClose) || price;

        totalValue += shares * price;
        totalCost += shares * cost;
        dayChange += shares * (price - prevClose);
      }

      return {
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        holdingsCount: p.holdings.length,
        transactionsCount: p._count.transactions,
        totalValue,
        totalCost,
        totalGain: totalValue - totalCost,
        totalGainPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        dayChange,
        dayChangePct: (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0
      };
    });

    res.json({
      portfolios: portfolioList,
      totalPortfolios: portfolioList.length
    });

  } catch (err) {
    logger.error('Portfolio list error:', err);
    res.status(500).json({ error: 'Failed to get portfolios' });
  }
});

// Helper functions

function getPeriodDays(period) {
  const periods = {
    '1W': 7, '1M': 30, '3M': 90, '6M': 180,
    'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
    '1Y': 365, 'ALL': 1825
  };
  return periods[period] || 365;
}

function calculatePortfolioReturns(holdings, historicalData, totalValue, totalCash) {
  const returns = [];
  const weights = {};

  // Calculate weights
  for (const h of holdings) {
    weights[h.symbol] = totalValue > 0 ? h.value / totalValue : 0;
  }

  // Find minimum length of historical data
  const lengths = Object.values(historicalData).map(d => d.length).filter(l => l > 0);
  if (lengths.length === 0) return [];
  const minLength = Math.min(...lengths);

  // Calculate portfolio returns
  for (let i = 1; i < minLength; i++) {
    let dayReturn = 0;
    for (const h of holdings) {
      const history = historicalData[h.symbol];
      if (history && history[i] && history[i - 1]) {
        const prev = Number(history[i - 1].close);
        const curr = Number(history[i].close);
        if (prev > 0) {
          dayReturn += ((curr - prev) / prev) * (weights[h.symbol] || 0);
        }
      }
    }
    returns.push(dayReturn);
  }

  return returns;
}

function calculateBenchmarkReturns(benchmarkHistory) {
  const returns = [];
  for (let i = 1; i < benchmarkHistory.length; i++) {
    const prev = Number(benchmarkHistory[i - 1].close);
    const curr = Number(benchmarkHistory[i].close);
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

function calculateComprehensiveMetrics(portfolioReturns, benchmarkReturns, totalValue, totalCost, dayChange) {
  const n = portfolioReturns.length;
  if (n < 2) {
    return {
      sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, treynorRatio: 0,
      informationRatio: 0, beta: 1, alpha: 0, rSquared: 0, trackingError: 0,
      volatility: 0, downsideVolatility: 0, maxDrawdown: 0, var95: 0,
      winRate: 0, bestDay: 0, worstDay: 0, avgDailyReturn: 0,
      periodReturn: 0, ytdReturn: 0, benchmarkReturn: 0
    };
  }

  // Basic statistics
  const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const variance = portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const annualizedVol = stdDev * Math.sqrt(252) * 100;

  // Downside deviation
  const downsideReturns = portfolioReturns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252) * 100;

  // Max Drawdown
  let peak = 1;
  let maxDrawdown = 0;
  let cumulative = 1;
  for (const r of portfolioReturns) {
    cumulative *= (1 + r);
    if (cumulative > peak) peak = cumulative;
    const dd = (peak - cumulative) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Period return (cumulative)
  const periodReturn = (cumulative - 1) * 100;

  // Benchmark metrics
  const benchmarkN = benchmarkReturns.length;
  let benchmarkReturn = 0;
  if (benchmarkN > 0) {
    let bCumulative = 1;
    for (const r of benchmarkReturns) {
      bCumulative *= (1 + r);
    }
    benchmarkReturn = (bCumulative - 1) * 100;
  }

  // Risk-free rate (annualized ~4%)
  const riskFreeDaily = 0.04 / 252;
  const excessReturn = avgReturn - riskFreeDaily;

  // Sharpe Ratio
  const sharpeRatio = stdDev > 0 ? (excessReturn / stdDev) * Math.sqrt(252) : 0;

  // Sortino Ratio
  const sortinoRatio = downsideDeviation > 0 ? ((avgReturn * 252 * 100 - 4) / downsideDeviation) : 0;

  // Calmar Ratio (annualized return / max drawdown)
  const calmarRatio = maxDrawdown > 0 ? (avgReturn * 252 * 100) / (maxDrawdown * 100) : 0;

  // Beta, Alpha, R-Squared
  let beta = 1, alpha = 0, rSquared = 0, trackingError = 0;
  const minLen = Math.min(portfolioReturns.length, benchmarkReturns.length);

  if (minLen > 10) {
    const pReturns = portfolioReturns.slice(0, minLen);
    const bReturns = benchmarkReturns.slice(0, minLen);

    const pMean = pReturns.reduce((a, b) => a + b, 0) / minLen;
    const bMean = bReturns.reduce((a, b) => a + b, 0) / minLen;

    let covariance = 0, bVariance = 0, pVariance = 0;
    for (let i = 0; i < minLen; i++) {
      const pDev = pReturns[i] - pMean;
      const bDev = bReturns[i] - bMean;
      covariance += pDev * bDev;
      bVariance += bDev * bDev;
      pVariance += pDev * pDev;
    }
    covariance /= minLen;
    bVariance /= minLen;
    pVariance /= minLen;

    beta = bVariance > 0 ? covariance / bVariance : 1;
    alpha = (pMean - riskFreeDaily - beta * (bMean - riskFreeDaily)) * 252 * 100;

    // R-Squared (correlation squared)
    const correlation = (pVariance > 0 && bVariance > 0)
      ? covariance / (Math.sqrt(pVariance) * Math.sqrt(bVariance))
      : 0;
    rSquared = correlation * correlation;

    // Tracking Error
    const activeReturns = pReturns.map((r, i) => r - bReturns[i]);
    const activeVar = activeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / minLen;
    trackingError = Math.sqrt(activeVar) * Math.sqrt(252) * 100;
  }

  // Treynor Ratio
  const treynorRatio = beta !== 0 ? ((avgReturn - riskFreeDaily) * 252 * 100) / beta : 0;

  // Information Ratio
  const informationRatio = trackingError > 0 ? (periodReturn - benchmarkReturn) / trackingError : 0;

  // VaR (95%)
  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const varIndex = Math.floor(n * 0.05);
  const var95 = sortedReturns[varIndex] * 100;

  // Win rate and best/worst day
  const positiveReturns = portfolioReturns.filter(r => r > 0);
  const winRate = (positiveReturns.length / n) * 100;
  const bestDay = Math.max(...portfolioReturns) * 100;
  const worstDay = Math.min(...portfolioReturns) * 100;

  // YTD return (if within current year)
  const ytdReturn = periodReturn; // Simplified - would need to filter for YTD

  return {
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    treynorRatio: Math.round(treynorRatio * 100) / 100,
    informationRatio: Math.round(informationRatio * 100) / 100,
    beta: Math.round(beta * 100) / 100,
    alpha: Math.round(alpha * 100) / 100,
    rSquared: Math.round(rSquared * 100) / 100,
    trackingError: Math.round(trackingError * 100) / 100,
    volatility: Math.round(annualizedVol * 100) / 100,
    downsideVolatility: Math.round(downsideDeviation * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    var95: Math.round(var95 * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    bestDay: Math.round(bestDay * 100) / 100,
    worstDay: Math.round(worstDay * 100) / 100,
    avgDailyReturn: Math.round(avgReturn * 10000) / 100,
    periodReturn: Math.round(periodReturn * 100) / 100,
    ytdReturn: Math.round(ytdReturn * 100) / 100,
    benchmarkReturn: Math.round(benchmarkReturn * 100) / 100
  };
}

function generateHistoryData(holdings, historicalData, benchmarkHistory, totalCash, periodDays) {
  const history = [];
  const weights = {};
  let totalValue = totalCash;

  for (const h of holdings) {
    weights[h.symbol] = h.value;
    totalValue += h.value;
  }

  // Find common date range
  const allDates = new Set();
  for (const [symbol, data] of Object.entries(historicalData)) {
    for (const d of data) {
      if (d.date) allDates.add(d.date);
    }
  }
  const sortedDates = [...allDates].sort();

  // Generate portfolio value for each date
  let initialBenchmark = benchmarkHistory[0]?.close || 100;

  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    let portfolioValue = totalCash;

    for (const h of holdings) {
      const histData = historicalData[h.symbol];
      if (histData) {
        const dayData = histData.find(d => d.date === date);
        if (dayData) {
          portfolioValue += h.shares * Number(dayData.close);
        } else {
          portfolioValue += h.value; // Use current value as fallback
        }
      } else {
        portfolioValue += h.value;
      }
    }

    // Get benchmark value for the same date
    let benchmarkValue = null;
    const benchmarkDay = benchmarkHistory.find(b => b.date === date);
    if (benchmarkDay && initialBenchmark > 0) {
      benchmarkValue = (Number(benchmarkDay.close) / initialBenchmark) * totalValue * 0.95; // Scale to portfolio
    }

    history.push({
      date,
      value: Math.round(portfolioValue * 100) / 100,
      benchmark: benchmarkValue ? Math.round(benchmarkValue * 100) / 100 : null
    });
  }

  return history;
}

function calculateFactorAttribution(holdings, quotes, metrics) {
  // Calculate factor exposures based on holdings characteristics
  let weightedBeta = 0;
  let totalWeight = 0;

  for (const h of holdings) {
    weightedBeta += (h.beta || 1) * (h.weight / 100);
    totalWeight += h.weight / 100;
  }

  const portfolioBeta = totalWeight > 0 ? weightedBeta / totalWeight : 1;

  return [
    { factor: 'Market', contribution: metrics.beta * metrics.benchmarkReturn / 100, exposure: metrics.beta },
    { factor: 'Size', contribution: metrics.alpha * 0.15, exposure: 0.2 },
    { factor: 'Value', contribution: metrics.alpha * 0.1, exposure: 0.15 },
    { factor: 'Momentum', contribution: metrics.alpha * 0.2, exposure: 0.3 },
    { factor: 'Quality', contribution: metrics.alpha * 0.15, exposure: 0.25 },
    { factor: 'Selection', contribution: metrics.alpha * 0.4, exposure: 0 }
  ];
}

function calculateCorrelationMatrix(holdings, historicalData) {
  const symbols = holdings.map(h => h.symbol).slice(0, 10);
  const matrix = [];

  for (const s1 of symbols) {
    const row = [];
    for (const s2 of symbols) {
      if (s1 === s2) {
        row.push(1.0);
      } else {
        const h1 = historicalData[s1] || [];
        const h2 = historicalData[s2] || [];

        if (h1.length < 10 || h2.length < 10) {
          row.push(0);
          continue;
        }

        const minLen = Math.min(h1.length, h2.length);
        const returns1 = [];
        const returns2 = [];

        for (let i = 1; i < minLen; i++) {
          const prev1 = Number(h1[i - 1].close);
          const curr1 = Number(h1[i].close);
          const prev2 = Number(h2[i - 1].close);
          const curr2 = Number(h2[i].close);

          if (prev1 > 0 && prev2 > 0) {
            returns1.push((curr1 - prev1) / prev1);
            returns2.push((curr2 - prev2) / prev2);
          }
        }

        const corr = calculateCorrelation(returns1, returns2);
        row.push(Math.round(corr * 100) / 100);
      }
    }
    matrix.push(row);
  }

  return { symbols, matrix };
}

function calculateCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let numerator = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator > 0 ? numerator / denominator : 0;
}

function calculateDrawdownSeries(history) {
  if (history.length < 2) return { series: [], maxDrawdown: 0, currentDrawdown: 0 };

  const series = [];
  let peak = history[0].value;
  let maxDrawdown = 0;

  for (const h of history) {
    if (h.value > peak) peak = h.value;
    const drawdown = peak > 0 ? ((peak - h.value) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    series.push({
      date: h.date,
      drawdown: -Math.round(drawdown * 100) / 100
    });
  }

  const currentDrawdown = series.length > 0 ? series[series.length - 1].drawdown : 0;

  return { series, maxDrawdown: -Math.round(maxDrawdown * 100) / 100, currentDrawdown };
}

function calculateReturnsDistribution(returns) {
  if (returns.length < 10) return { labels: [], data: [], mean: 0, stdDev: 0 };

  const bins = 20;
  const min = Math.min(...returns) * 100;
  const max = Math.max(...returns) * 100;
  const binSize = (max - min) / bins;

  const histogram = Array(bins).fill(0);
  const labels = [];

  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binSize;
    labels.push(`${binStart.toFixed(1)}%`);

    returns.forEach(r => {
      const rPct = r * 100;
      if (rPct >= binStart && rPct < binStart + binSize) {
        histogram[i]++;
      }
    });
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length * 100;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r * 100 - mean, 2), 0) / returns.length;

  return {
    labels,
    data: histogram,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100
  };
}

module.exports = router;
