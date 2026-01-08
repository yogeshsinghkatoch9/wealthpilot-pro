const express = require('express');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const HistoricalDataService = require('../services/historicalDataService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/portfolio-analytics/comprehensive
 * Get comprehensive analytics for a specific portfolio or all portfolios
 */
router.get('/comprehensive', async (req, res) => {
  try {
    const { portfolio_id, period = '1Y' } = req.query;
    const userId = req.user.id;

    // Get portfolios (specific one or all)
    let portfolios;
    if (portfolioId && portfolioId !== 'all') {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId },
        include: { holdings: true }
      });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      portfolios = [portfolio];
    } else {
      portfolios = await prisma.portfolios.findMany({
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
          portfolio_id: p.id,
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

    // Fetch historical data from database (5 years for heatmap)
    const historicalData = {};
    for (const symbol of symbols.slice(0, 50)) {
      try {
        const history = await HistoricalDataService.getHistoricalData(symbol, 1825); // 5 years
        if (history && history.length > 0) {
          historicalData[symbol] = history.map(h => ({
            date: h.date.toISOString().split('T')[0],
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.adjClose || h.close,
            volume: Number(h.volume)
          }));
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }
    }

    // Get benchmark data from database
    const benchmarkSymbols = HistoricalDataService.BENCHMARK_SYMBOLS;
    const benchmarks = {};
    let benchmarkHistory = [];

    for (const symbol of benchmarkSymbols) {
      try {
        const history = await HistoricalDataService.getHistoricalData(symbol, 1825);
        if (history && history.length > 0) {
          benchmarks[symbol] = {
            name: getBenchmarkName(symbol),
            history: history.map(h => ({
              date: h.date.toISOString().split('T')[0],
              close: h.adjClose || h.close
            }))
          };
          if (symbol === 'SPY') {
            benchmarkHistory = benchmarks[symbol].history;
          }
        }
      } catch (err) {
        logger.debug(`Failed to get ${symbol} benchmark:`, err.message);
      }
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

      // Calculate volatility from historical data
      let volatility = 0;
      if (historicalData[h.symbol] && historicalData[h.symbol].length > 20) {
        const returns = HistoricalDataService.calculateDailyReturns(
          historicalData[h.symbol].map(d => ({ date: new Date(d.date), adjClose: d.close }))
        );
        volatility = HistoricalDataService.calculateVolatility(returns);
      }

      // Sector allocation
      if (!sectorMap[sector]) {
        sectorMap[sector] = { value: 0, cost: 0, symbols: [], returns: [] };
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
        volatility,
        portfolio_id: h.portfolioId,
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

    // Generate historical chart data with all benchmarks
    const history = generateHistoryData(holdingsWithData, historicalData, benchmarks, totalCash, periodDays);

    // Calculate ROLLING RETURNS (30, 60, 90, 252 days)
    const rollingReturns = {
      '30': calculateRollingReturnsFromHistory(history, 30),
      '60': calculateRollingReturnsFromHistory(history, 60),
      '90': calculateRollingReturnsFromHistory(history, 90),
      '252': calculateRollingReturnsFromHistory(history, 252)
    };

    // Calculate MONTHLY RETURNS for heatmap (5 years)
    const monthlyReturns = calculateMonthlyReturnsHeatmap(history);

    // Calculate ANNUAL RETURNS
    const annualReturns = calculateAnnualReturns(history);

    // Calculate sector attribution with real returns
    const sectorAttribution = await calculateSectorAttribution(sectorMap, totalValue, historicalData, periodDays);

    // Calculate factor attribution with real data
    const factorAttribution = await calculateFactorAttribution(holdingsWithData, historicalData, metrics);

    // Calculate REAL correlation matrix
    const correlationMatrix = await calculateRealCorrelationMatrix(
      holdingsWithData.slice(0, 10).map(h => h.symbol),
      periodDays
    );

    // Calculate drawdown series with enhanced data
    const drawdownData = calculateEnhancedDrawdown(history);

    // Calculate returns distribution with normal curve data
    const returnsDistribution = calculateEnhancedReturnsDistribution(portfolioReturns);

    // Calculate daily, monthly, annual returns arrays
    const returnsData = {
      daily: portfolioReturns.slice(-30).map((r, i) => r * 100),
      monthly: monthlyReturns.flatReturns || [],
      annual: annualReturns.map(a => a.return)
    };

    res.json({
      portfolios: portfolios.map(p => ({ id: p.id, name: p.name, is_default: p.isDefault })),
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

      // Historical chart data (filtered to period)
      history: history.slice(-periodDays),

      // Full 5-year history for heatmap
      fullHistory: history,

      // Rolling returns data
      rollingReturns,

      // Monthly returns for heatmap (5 years)
      monthlyReturns: monthlyReturns.byYearMonth,

      // Annual returns
      annualReturns,

      // Returns arrays for chart
      returns: returnsData,

      // Available benchmarks
      benchmarkList: Object.entries(benchmarks).map(([symbol, data]) => ({
        symbol,
        name: data.name,
        return: data.history.length > 1
          ? ((data.history[data.history.length - 1].close - data.history[0].close) / data.history[0].close * 100).toFixed(2)
          : 0
      })),

      // Drawdown data with enhanced info
      drawdown: drawdownData,

      // Returns distribution with normal curve
      returnsDistribution,

      // Attribution
      attribution: {
        sectors: sectorAttribution,
        factors: factorAttribution,
        topContributors: holdingsWithData.filter(h => h.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 5),
        topDetractors: holdingsWithData.filter(h => h.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 5)
      },

      // Real correlation matrix
      correlation: correlationMatrix
    });

  } catch (err) {
    logger.error('Comprehensive analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics', details: err.message });
  }
});

/**
 * GET /api/portfolio-analytics/initialize-data
 * Initialize historical data for all symbols (run once)
 */
router.post('/initialize-data', async (req, res) => {
  try {
    logger.info('Starting historical data initialization...');

    // Initialize benchmarks first
    await HistoricalDataService.initializeBenchmarks();

    // Get all unique symbols from holdings
    const holdings = await prisma.holdings.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });

    let initialized = 0;
    for (const h of holdings) {
      const count = await HistoricalDataService.initializeSymbolHistory(h.symbol, 5);
      if (count > 0) initialized++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    res.json({
      success: true,
      message: `Initialized historical data for ${initialized} symbols`,
      benchmarksInitialized: HistoricalDataService.BENCHMARK_SYMBOLS.length
    });
  } catch (err) {
    logger.error('Data initialization error:', err);
    res.status(500).json({ error: 'Failed to initialize data' });
  }
});

/**
 * GET /api/portfolio-analytics/update-daily
 * Update historical data with latest prices
 */
router.post('/update-daily', async (req, res) => {
  try {
    const updated = await HistoricalDataService.updateAllHistoricalData();
    res.json({ success: true, symbolsUpdated: updated });
  } catch (err) {
    logger.error('Daily update error:', err);
    res.status(500).json({ error: 'Failed to update daily data' });
  }
});

/**
 * GET /api/portfolio-analytics/list
 * Get list of user's portfolios for selector
 */
router.get('/list', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: {
        holdings: true,
        _count: { select: { transactions: true } }
      },
      orderBy: { created_at: 'desc' }
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
        is_default: p.isDefault,
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

// ============== HELPER FUNCTIONS ==============

function getBenchmarkName(symbol) {
  const names = {
    'SPY': 'S&P 500',
    'QQQ': 'Nasdaq 100',
    'DIA': 'Dow Jones',
    'IWM': 'Russell 2000',
    'VTI': 'Total Market',
    'BND': 'Total Bond',
    'EFA': 'Intl Developed',
    'EEM': 'Emerging Markets',
    'AGG': 'Aggregate Bond',
    'TLT': '20+ Year Treasury'
  };
  return names[symbol] || symbol;
}

function getPeriodDays(period) {
  const periods = {
    '1W': 7, '1M': 30, '3M': 90, '6M': 180,
    'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
    '1Y': 365, '2Y': 730, '3Y': 1095, '5Y': 1825, 'ALL': 1825
  };
  return periods[period] || 365;
}

function calculatePortfolioReturns(holdings, historicalData, totalValue, totalCash) {
  const returns = [];
  const weights = {};

  for (const h of holdings) {
    weights[h.symbol] = totalValue > 0 ? h.value / totalValue : 0;
  }

  const lengths = Object.values(historicalData).map(d => d.length).filter(l => l > 0);
  if (lengths.length === 0) return [];
  const minLength = Math.min(...lengths);

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

  const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const variance = portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const annualizedVol = stdDev * Math.sqrt(252) * 100;

  const downsideReturns = portfolioReturns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252) * 100;

  let peak = 1;
  let maxDrawdown = 0;
  let cumulative = 1;
  for (const r of portfolioReturns) {
    cumulative *= (1 + r);
    if (cumulative > peak) peak = cumulative;
    const dd = (peak - cumulative) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const periodReturn = (cumulative - 1) * 100;

  const benchmarkN = benchmarkReturns.length;
  let benchmarkReturn = 0;
  if (benchmarkN > 0) {
    let bCumulative = 1;
    for (const r of benchmarkReturns) {
      bCumulative *= (1 + r);
    }
    benchmarkReturn = (bCumulative - 1) * 100;
  }

  const riskFreeDaily = 0.04 / 252;
  const excessReturn = avgReturn - riskFreeDaily;
  const sharpeRatio = stdDev > 0 ? (excessReturn / stdDev) * Math.sqrt(252) : 0;
  const sortinoRatio = downsideDeviation > 0 ? ((avgReturn * 252 * 100 - 4) / downsideDeviation) : 0;
  const calmarRatio = maxDrawdown > 0 ? (avgReturn * 252 * 100) / (maxDrawdown * 100) : 0;

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

    const correlation = (pVariance > 0 && bVariance > 0)
      ? covariance / (Math.sqrt(pVariance) * Math.sqrt(bVariance))
      : 0;
    rSquared = correlation * correlation;

    const activeReturns = pReturns.map((r, i) => r - bReturns[i]);
    const activeVar = activeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / minLen;
    trackingError = Math.sqrt(activeVar) * Math.sqrt(252) * 100;
  }

  const treynorRatio = beta !== 0 ? ((avgReturn - riskFreeDaily) * 252 * 100) / beta : 0;
  const informationRatio = trackingError > 0 ? (periodReturn - benchmarkReturn) / trackingError : 0;

  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const varIndex = Math.floor(n * 0.05);
  const var95 = sortedReturns[varIndex] * 100;

  const positiveReturns = portfolioReturns.filter(r => r > 0);
  const winRate = (positiveReturns.length / n) * 100;
  const bestDay = Math.max(...portfolioReturns) * 100;
  const worstDay = Math.min(...portfolioReturns) * 100;

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
    ytdReturn: Math.round(periodReturn * 100) / 100,
    benchmarkReturn: Math.round(benchmarkReturn * 100) / 100
  };
}

function generateHistoryData(holdings, historicalData, benchmarks, totalCash, periodDays) {
  const history = [];
  const weights = {};
  let totalValue = totalCash;

  for (const h of holdings) {
    weights[h.symbol] = h.value;
    totalValue += h.value;
  }

  const allDates = new Set();
  for (const [symbol, data] of Object.entries(historicalData)) {
    for (const d of data) {
      if (d.date) allDates.add(d.date);
    }
  }
  const sortedDates = [...allDates].sort();

  const benchmarkInitials = {};
  for (const [symbol, data] of Object.entries(benchmarks)) {
    if (data.history && data.history.length > 0) {
      benchmarkInitials[symbol] = data.history[0].close;
    }
  }

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
          portfolioValue += h.value;
        }
      } else {
        portfolioValue += h.value;
      }
    }

    const entry = {
      date,
      value: Math.round(portfolioValue * 100) / 100
    };

    for (const [symbol, data] of Object.entries(benchmarks)) {
      if (data.history) {
        const benchmarkDay = data.history.find(b => b.date === date);
        const initial = benchmarkInitials[symbol];
        if (benchmarkDay && initial > 0) {
          entry[symbol] = Math.round((Number(benchmarkDay.close) / initial) * totalValue * 0.95 * 100) / 100;
        }
      }
    }

    if (entry.SPY) {
      entry.benchmark = entry.SPY;
    }

    history.push(entry);
  }

  return history;
}

function calculateRollingReturnsFromHistory(history, windowDays) {
  if (history.length < windowDays + 1) return [];

  const rollingReturns = [];
  const annualizationFactor = 252 / windowDays;

  for (let i = windowDays; i < history.length; i++) {
    const startValue = history[i - windowDays].value;
    const endValue = history[i].value;

    if (startValue > 0) {
      const periodReturn = (endValue / startValue) - 1;
      const annualizedReturn = (Math.pow(1 + periodReturn, annualizationFactor) - 1) * 100;

      rollingReturns.push({
        date: history[i].date,
        return: Math.round(annualizedReturn * 100) / 100
      });
    }
  }

  return rollingReturns;
}

function calculateMonthlyReturnsHeatmap(history) {
  const monthlyData = {};
  const flatReturns = [];

  for (const h of history) {
    const date = new Date(h.date);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;

    if (!monthlyData[key]) {
      monthlyData[key] = { year, month, first: h.value, last: h.value };
    } else {
      monthlyData[key].last = h.value;
    }
  }

  const byYearMonth = {};

  for (const [key, data] of Object.entries(monthlyData)) {
    const monthReturn = data.first > 0 ? ((data.last - data.first) / data.first) * 100 : 0;

    if (!byYearMonth[data.year]) {
      byYearMonth[data.year] = {};
    }
    byYearMonth[data.year][data.month] = Math.round(monthReturn * 100) / 100;
    flatReturns.push(monthReturn);
  }

  return { byYearMonth, flatReturns };
}

function calculateAnnualReturns(history) {
  const annualData = {};

  for (const h of history) {
    const year = new Date(h.date).getFullYear();
    if (!annualData[year]) {
      annualData[year] = { first: h.value, last: h.value };
    } else {
      annualData[year].last = h.value;
    }
  }

  const returns = [];
  for (const [year, data] of Object.entries(annualData)) {
    const annualReturn = data.first > 0 ? ((data.last - data.first) / data.first) * 100 : 0;
    returns.push({
      year: parseInt(year),
      return: Math.round(annualReturn * 100) / 100
    });
  }

  return returns.sort((a, b) => a.year - b.year);
}

async function calculateSectorAttribution(sectorMap, totalValue, historicalData, periodDays) {
  const sectors = [];

  for (const [sector, data] of Object.entries(sectorMap)) {
    const weight = totalValue > 0 ? (data.value / totalValue) * 100 : 0;

    // Calculate sector return from holdings
    let totalReturn = 0;
    let validSymbols = 0;

    for (const symbol of data.symbols) {
      const history = historicalData[symbol];
      if (history && history.length > 1) {
        const periodHistory = history.slice(-periodDays);
        if (periodHistory.length > 1) {
          const startPrice = periodHistory[0].close;
          const endPrice = periodHistory[periodHistory.length - 1].close;
          if (startPrice > 0) {
            totalReturn += ((endPrice - startPrice) / startPrice) * 100;
            validSymbols++;
          }
        }
      }
    }

    const avgReturn = validSymbols > 0 ? totalReturn / validSymbols : 0;
    const contribution = weight * avgReturn / 100;

    sectors.push({
      name: sector,
      sector,
      value: data.value,
      weight: Math.round(weight * 100) / 100,
      return: Math.round(avgReturn * 100) / 100,
      contribution: Math.round(contribution * 100) / 100,
      holdings: data.symbols.length
    });
  }

  return sectors.sort((a, b) => b.value - a.value);
}

async function calculateFactorAttribution(holdings, historicalData, metrics) {
  // Calculate factor exposures based on actual holdings data
  let weightedBeta = 0;
  let weightedMomentum = 0;
  let totalWeight = 0;
  let weightedMarketCap = 0;
  let totalMarketCapWeight = 0;
  let weightedVolatility = 0;
  let totalVolWeight = 0;

  // Collect holding-level metrics for factor calculations
  for (const h of holdings) {
    const weight = h.weight || 0;
    totalWeight += weight;
    weightedBeta += (h.beta || 1) * weight;

    // Calculate 6-month momentum from historical data
    const history = historicalData[h.symbol];
    if (history && history.length > 126) {
      const momentum = ((history[history.length - 1].close / history[history.length - 126].close) - 1) * 100;
      weightedMomentum += momentum * weight;
    }

    // Calculate volatility from historical returns for each holding
    if (history && history.length > 20) {
      const returns = [];
      for (let i = 1; i < history.length; i++) {
        const prev = Number(history[i - 1].close);
        const curr = Number(history[i].close);
        if (prev > 0) {
          returns.push((curr - prev) / prev);
        }
      }
      if (returns.length > 0) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const annualizedVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
        weightedVolatility += annualizedVol * weight;
        totalVolWeight += weight;
      }
    }
  }

  const avgBeta = totalWeight > 0 ? weightedBeta / totalWeight : 1;
  const avgMomentum = totalWeight > 0 ? weightedMomentum / totalWeight : 0;
  const avgVolatility = totalVolWeight > 0 ? weightedVolatility / totalVolWeight : metrics.volatility;

  // Calculate size factor exposure based on portfolio composition
  // Negative exposure = large cap tilt, Positive exposure = small cap tilt
  // Use beta as a proxy - higher beta stocks tend to be smaller/riskier
  const sizeExposure = (avgBeta - 1) * 0.5; // Centered around market beta of 1

  // Calculate value factor exposure using price momentum as inverse proxy
  // High momentum stocks tend to be growth stocks (negative value exposure)
  // Low momentum stocks tend to be value stocks (positive value exposure)
  const valueExposure = -avgMomentum * 0.02; // Inverse relationship with momentum

  // Quality factor: inverse relationship with volatility
  // Lower volatility portfolios have higher quality exposure
  const qualityExposure = avgVolatility > 0 ? Math.max(0, (20 - avgVolatility) / 20) : 0.5;

  // Low volatility factor exposure
  // Benchmark volatility is typically around 15-20% annualized
  const benchmarkVol = 16; // S&P 500 long-term average
  const lowVolExposure = avgVolatility > 0 ? (benchmarkVol - avgVolatility) / benchmarkVol : 0;

  // Calculate contributions based on factor exposures and returns
  const marketContribution = metrics.beta * metrics.benchmarkReturn * 0.01;
  const sizeContribution = sizeExposure * 2; // Historical SMB premium ~2%
  const valueContribution = valueExposure * 3; // Historical HML premium ~3%
  const momentumContribution = avgMomentum * 0.03; // Momentum factor premium
  const qualityContribution = qualityExposure * 2.5; // Quality premium
  const lowVolContribution = lowVolExposure * 1.5; // Low vol premium

  return [
    {
      name: 'Market Beta',
      factor: 'Market',
      exposure: Math.round(avgBeta * 100) / 100,
      contribution: Math.round(marketContribution * 100) / 100
    },
    {
      name: 'Size (SMB)',
      factor: 'Size',
      exposure: Math.round(sizeExposure * 100) / 100,
      contribution: Math.round(sizeContribution * 100) / 100
    },
    {
      name: 'Value (HML)',
      factor: 'Value',
      exposure: Math.round(valueExposure * 100) / 100,
      contribution: Math.round(valueContribution * 100) / 100
    },
    {
      name: 'Momentum',
      factor: 'Momentum',
      exposure: Math.round((avgMomentum / 20) * 100) / 100,
      contribution: Math.round(momentumContribution * 100) / 100
    },
    {
      name: 'Quality',
      factor: 'Quality',
      exposure: Math.round(qualityExposure * 100) / 100,
      contribution: Math.round(qualityContribution * 100) / 100
    },
    {
      name: 'Low Volatility',
      factor: 'Low Vol',
      exposure: Math.round(lowVolExposure * 100) / 100,
      contribution: Math.round(lowVolContribution * 100) / 100
    }
  ];
}

async function calculateRealCorrelationMatrix(symbols, days) {
  try {
    const result = await HistoricalDataService.calculateCorrelationMatrix(symbols, days);
    return {
      symbols: result.symbols,
      matrix: result.matrix.map(row => row.map(v => Math.round(v * 100) / 100))
    };
  } catch (err) {
    logger.error('Correlation matrix error:', err);
    // Fallback to identity matrix
    return {
      symbols,
      matrix: symbols.map((s1, i) => symbols.map((s2, j) => i === j ? 1.0 : 0))
    };
  }
}

function calculateEnhancedDrawdown(history) {
  if (history.length < 2) return { series: [], maxDrawdown: 0, currentDrawdown: 0, recoveryDays: 0 };

  const series = [];
  let peak = history[0].value;
  let maxDrawdown = 0;
  let maxDrawdownDate = null;
  let peakDate = history[0].date;
  let drawdownPeriods = [];
  let currentPeriod = null;

  for (const h of history) {
    if (h.value > peak) {
      if (currentPeriod) {
        currentPeriod.end = h.date;
        currentPeriod.recovered = true;
        drawdownPeriods.push(currentPeriod);
        currentPeriod = null;
      }
      peak = h.value;
      peakDate = h.date;
    }

    const drawdown = peak > 0 ? ((peak - h.value) / peak) * 100 : 0;

    if (drawdown > 0 && !currentPeriod) {
      currentPeriod = { start: h.date, peakValue: peak, maxDrawdown: 0 };
    }

    if (currentPeriod && drawdown > currentPeriod.maxDrawdown) {
      currentPeriod.maxDrawdown = drawdown;
      currentPeriod.troughDate = h.date;
      currentPeriod.troughValue = h.value;
    }

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = h.date;
    }

    series.push({
      date: h.date,
      drawdown: -Math.round(drawdown * 100) / 100,
      value: h.value,
      peak,
      peakDate
    });
  }

  const currentDrawdown = series.length > 0 ? series[series.length - 1].drawdown : 0;

  // Calculate average recovery time
  const recoveredPeriods = drawdownPeriods.filter(p => p.recovered);
  let avgRecoveryDays = 0;
  if (recoveredPeriods.length > 0) {
    const totalDays = recoveredPeriods.reduce((sum, p) => {
      return sum + Math.floor((new Date(p.end) - new Date(p.start)) / (1000 * 60 * 60 * 24));
    }, 0);
    avgRecoveryDays = Math.round(totalDays / recoveredPeriods.length);
  }

  return {
    series,
    maxDrawdown: -Math.round(maxDrawdown * 100) / 100,
    currentDrawdown,
    maxDrawdownDate,
    recoveryDays: avgRecoveryDays,
    drawdownPeriods: drawdownPeriods.length
  };
}

function calculateEnhancedReturnsDistribution(returns) {
  if (returns.length < 10) return { labels: [], data: [], mean: 0, stdDev: 0, normalCurve: [] };

  const bins = 25;
  const values = returns.map(r => r * 100);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const binSize = range / bins;

  const histogram = Array(bins).fill(0);
  const labels = [];

  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binSize;
    labels.push(`${binStart.toFixed(2)}%`);

    values.forEach(v => {
      if (v >= binStart && v < binStart + binSize) {
        histogram[i]++;
      }
    });
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate normal curve overlay
  const normalCurve = labels.map((label, i) => {
    const x = min + (i + 0.5) * binSize;
    const z = (x - mean) / stdDev;
    const normalDensity = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    return Math.round(normalDensity * values.length * binSize * 100) / 100;
  });

  // Calculate skewness and kurtosis
  const skewness = values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 3), 0) / values.length;
  const kurtosis = values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 4), 0) / values.length - 3;

  return {
    labels,
    data: histogram,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    normalCurve,
    skewness: Math.round(skewness * 100) / 100,
    kurtosis: Math.round(kurtosis * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100
  };
}

module.exports = router;
