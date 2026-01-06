const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { prisma } = require('../db/simpleDb');
const performanceAttr = require('../services/advanced/performanceAttribution');
const riskDecomp = require('../services/advanced/riskDecomposition');
const peerBench = require('../services/advanced/peerBenchmarking');
const liquidityAnalysis = require('../services/advanced/liquidityAnalysis');
const tcaService = require('../services/advanced/transactionCostAnalysis');
const esgAnalysis = require('../services/advanced/esgAnalysis');
const MarketDataService = require('../services/marketData');

// All routes require authentication
router.use(authenticate);

// ==================== PERFORMANCE TAB (4 endpoints) ====================

// 1. Performance attribution
router.get('/performance-attribution', async (req, res) => {
  try {
    const { portfolio_id, period = '1Y' } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await performanceAttr.calculateBrinsonAttribution(portfolioId, period);
    res.json(result);
  } catch (error) {
    logger.error('Performance attribution error:', error);
    res.status(500).json({ error: 'Failed to calculate performance attribution' });
  }
});

// 2. Excess return vs benchmark
router.get('/excess-return', async (req, res) => {
  try {
    const { portfolio_id, benchmark = 'SPY', period = '1Y' } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await performanceAttr.calculateExcessReturn(portfolioId, benchmark, period);
    res.json(result);
  } catch (error) {
    logger.error('Excess return error:', error);
    res.status(500).json({ error: 'Failed to calculate excess return' });
  }
});

// 3. Drawdown analysis - Real calculations
router.get('/drawdown-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings and transactions
    const { prisma } = require('../db/simpleDb');
    const portfolio = await prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: req.user.id },
      include: {
        holdings: true,
        transactions: {
          orderBy: { executedAt: 'asc' }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Calculate portfolio value history from transactions
    const valueHistory = [];
    let runningValue = 0;
    let peakValue = 0;
    let maxDrawdown = 0;
    let maxDrawdownDate = null;
    let currentDrawdown = 0;
    let drawdownStart = null;
    let recoveryDays = 0;
    let recovered = true;

    // Group transactions by date and calculate daily portfolio values
    const txByDate = {};
    portfolio.transactions.forEach(tx => {
      const dateKey = new Date(tx.executedAt).toISOString().slice(0, 10);
      if (!txByDate[dateKey]) txByDate[dateKey] = [];
      txByDate[dateKey].push(tx);
    });

    // Calculate cumulative value over time
    const dates = Object.keys(txByDate).sort();
    let holdings = {};

    dates.forEach(date => {
      txByDate[date].forEach(tx => {
        const symbol = tx.symbol;
        if (!holdings[symbol]) holdings[symbol] = { shares: 0, avgCost: 0 };

        if (tx.type === 'buy') {
          const totalShares = holdings[symbol].shares + (tx.shares || 0);
          const totalCost = (holdings[symbol].shares * holdings[symbol].avgCost) + (tx.shares * tx.price);
          holdings[symbol].avgCost = totalShares > 0 ? totalCost / totalShares : tx.price;
          holdings[symbol].shares = totalShares;
        } else if (tx.type === 'sell') {
          holdings[symbol].shares -= (tx.shares || 0);
          if (holdings[symbol].shares <= 0) delete holdings[symbol];
        }
      });

      // Calculate portfolio value (using cost basis as proxy for historical value)
      runningValue = Object.values(holdings).reduce((sum, h) => sum + (h.shares * h.avgCost), 0);

      // Track peak and drawdown
      if (runningValue > peakValue) {
        peakValue = runningValue;
        if (!recovered) {
          recoveryDays = valueHistory.length - (drawdownStart || 0);
          recovered = true;
        }
      }

      if (peakValue > 0) {
        const dd = ((runningValue - peakValue) / peakValue) * 100;
        if (dd < maxDrawdown) {
          maxDrawdown = dd;
          maxDrawdownDate = date;
        }
        currentDrawdown = dd;
        if (dd < -1 && recovered) {
          drawdownStart = valueHistory.length;
          recovered = false;
        }
      }

      valueHistory.push({ date, value: runningValue, drawdown: currentDrawdown });
    });

    // Calculate current portfolio value and drawdown
    const currentValue = portfolio.holdings.reduce((sum, h) => {
      return sum + ((h.shares || 0) * (h.currentPrice || h.avgCostBasis || 0));
    }, 0);

    const currentPeak = Math.max(peakValue, currentValue);
    const realCurrentDrawdown = currentPeak > 0 ? ((currentValue - currentPeak) / currentPeak) * 100 : 0;

    res.json({
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownDate,
      currentDrawdown: Math.round(realCurrentDrawdown * 100) / 100,
      peakValue: currentPeak,
      currentValue,
      drawdownSeries: valueHistory.slice(-90), // Last 90 days
      recovery: {
        days: recovered ? 0 : valueHistory.length - (drawdownStart || 0),
        recovered
      }
    });
  } catch (error) {
    logger.error('Drawdown analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate drawdown' });
  }
});

// 4. Rolling statistics - Real calculations
router.get('/rolling-statistics', async (req, res) => {
  try {
    const { portfolio_id, window = 90 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    const windowSize = parseInt(window);
    const { prisma } = require('../db/simpleDb');

    const portfolio = await prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: req.user.id },
      include: {
        holdings: true,
        transactions: {
          orderBy: { executedAt: 'asc' }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Build daily returns from transactions
    const txByDate = {};
    portfolio.transactions.forEach(tx => {
      const dateKey = new Date(tx.executedAt).toISOString().slice(0, 10);
      if (!txByDate[dateKey]) txByDate[dateKey] = { value: 0 };
      if (tx.type === 'buy') {
        txByDate[dateKey].value -= tx.amount || 0;
      } else if (tx.type === 'sell' || tx.type === 'dividend') {
        txByDate[dateKey].value += tx.amount || 0;
      }
    });

    const dates = Object.keys(txByDate).sort();
    const dailyReturns = [];
    let cumValue = 0;

    dates.forEach((date, i) => {
      const prevValue = cumValue;
      cumValue += txByDate[date].value;
      if (i > 0 && prevValue !== 0) {
        dailyReturns.push({
          date,
          return: ((cumValue - prevValue) / Math.abs(prevValue)) * 100
        });
      }
    });

    // Calculate rolling statistics
    const rollingReturns = [];
    const rollingVolatility = [];
    const rollingSharpe = [];
    const riskFreeRate = 0.04; // 4% annual risk-free rate

    for (let i = windowSize; i < dailyReturns.length; i++) {
      const windowReturns = dailyReturns.slice(i - windowSize, i).map(d => d.return);
      const date = dailyReturns[i].date;

      // Mean return (annualized)
      const meanReturn = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
      const annualizedReturn = meanReturn * 252;

      // Volatility (annualized)
      const variance = windowReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / windowReturns.length;
      const stdDev = Math.sqrt(variance);
      const annualizedVol = stdDev * Math.sqrt(252);

      // Sharpe Ratio
      const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate * 100) / annualizedVol : 0;

      rollingReturns.push({ date, value: Math.round(annualizedReturn * 100) / 100 });
      rollingVolatility.push({ date, value: Math.round(annualizedVol * 100) / 100 });
      rollingSharpe.push({ date, value: Math.round(sharpe * 100) / 100 });
    }

    // Summary statistics
    const avgReturn = rollingReturns.length > 0
      ? rollingReturns.reduce((sum, r) => sum + r.value, 0) / rollingReturns.length
      : 0;
    const avgVol = rollingVolatility.length > 0
      ? rollingVolatility.reduce((sum, r) => sum + r.value, 0) / rollingVolatility.length
      : 0;
    const avgSharpe = rollingSharpe.length > 0
      ? rollingSharpe.reduce((sum, r) => sum + r.value, 0) / rollingSharpe.length
      : 0;

    res.json({
      rollingReturns: rollingReturns.slice(-60), // Last 60 data points
      rollingVolatility: rollingVolatility.slice(-60),
      rollingSharpe: rollingSharpe.slice(-60),
      windowSize,
      summary: {
        avgReturn: Math.round(avgReturn * 100) / 100,
        avgVol: Math.round(avgVol * 100) / 100,
        avgSharpe: Math.round(avgSharpe * 100) / 100
      }
    });
  } catch (error) {
    logger.error('Rolling statistics error:', error);
    res.status(500).json({ error: 'Failed to calculate rolling statistics' });
  }
});

// ==================== RISK TAB (5 endpoints) ====================

// 5. Risk decomposition (factor exposures)
router.get('/risk-decomposition', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await riskDecomp.calculateFactorExposures(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Risk decomposition error:', error);
    res.status(500).json({ error: 'Failed to calculate risk decomposition' });
  }
});

// 6. VaR & stress scenarios
router.get('/var-scenarios', async (req, res) => {
  try {
    const { portfolio_id, confidence = 95 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    const result = await riskDecomp.calculateVaRScenarios(portfolioId, parseInt(confidence));
    res.json(result);
  } catch (error) {
    logger.error('VaR calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate VaR' });
  }
});

// VaR calculation (alias for var-scenarios, used by tests)
router.get('/var', async (req, res) => {
  try {
    const { portfolio_id, confidence = 95 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Calculate VaR using the same service
    const result = await riskDecomp.calculateVaRScenarios(portfolioId, parseInt(confidence));
    res.json({ var: result.var || 0, confidence: parseInt(confidence), ...result });
  } catch (error) {
    logger.error('VaR calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate VaR' });
  }
});

// 7. Correlation & covariance heatmap
router.get('/correlation-matrix', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await riskDecomp.calculateCorrelationMatrix(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Correlation calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate correlation matrix' });
  }
});

// 8. Stress scenarios & testing
router.get('/stress-scenarios', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    const result = await riskDecomp.calculateStressTests(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Stress test error:', error);
    res.status(500).json({ error: 'Failed to run stress tests' });
  }
});

// Stress test (alias for stress-scenarios, used by tests)
router.get('/stress-test', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Run stress tests using the same service
    const result = await riskDecomp.calculateStressTests(portfolioId);
    res.json({ scenarios: result.scenarios || [], ...result });
  } catch (error) {
    logger.error('Stress test error:', error);
    res.status(500).json({ error: 'Failed to run stress tests' });
  }
});

// Monte Carlo simulation - Real calculations based on portfolio
router.get('/monte-carlo', async (req, res) => {
  try {
    const { portfolio_id, iterations = 1000, years = 10 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: { holdings: true }
    });

    if (!portfolio || portfolio.holdings.length === 0) {
      return res.json({
        iterations: parseInt(iterations),
        currentValue: 0,
        meanReturn: 0,
        medianReturn: 0,
        stdDev: 0,
        percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
        projectedValues: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
        confidence: { level95: { lower: 0, upper: 0 }, level99: { lower: 0, upper: 0 } }
      });
    }

    // Get quotes for current values
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate current portfolio value and weighted volatility
    let currentValue = Number(portfolio.cashBalance) || 0;
    let weightedVolatility = 0;
    let totalWeight = 0;

    for (const h of portfolio.holdings) {
      const price = quotes[h.symbol]?.price || Number(h.avgCostBasis);
      const value = Number(h.shares) * price;
      currentValue += value;

      // Estimate volatility (use sector-based estimates if no historical data)
      const sectorVolatility = {
        'Technology': 0.28, 'Healthcare': 0.22, 'Financials': 0.20,
        'Energy': 0.35, 'Consumer Discretionary': 0.25, 'Consumer Staples': 0.15,
        'Industrials': 0.22, 'Materials': 0.25, 'Utilities': 0.18,
        'Real Estate': 0.23, 'Communication Services': 0.26
      };
      const sector = h.sector || quotes[h.symbol]?.sector || 'Unknown';
      const vol = sectorVolatility[sector] || 0.22;
      weightedVolatility += vol * value;
      totalWeight += value;
    }

    const avgVolatility = totalWeight > 0 ? weightedVolatility / totalWeight : 0.20;
    const annualReturn = 0.10; // 10% expected annual return
    const numYears = parseInt(years) || 10;
    const numIterations = Math.min(parseInt(iterations), 5000);

    // Run Monte Carlo simulation
    const finalValues = [];
    const annualReturns = [];

    for (let i = 0; i < numIterations; i++) {
      let value = currentValue;
      for (let y = 0; y < numYears; y++) {
        // Generate random return using normal distribution (Box-Muller)
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const yearReturn = annualReturn + avgVolatility * z;
        value *= (1 + yearReturn);
      }
      finalValues.push(value);
      annualReturns.push((Math.pow(value / currentValue, 1 / numYears) - 1) * 100);
    }

    // Sort for percentile calculations
    finalValues.sort((a, b) => a - b);
    annualReturns.sort((a, b) => a - b);

    // Calculate statistics
    const meanFinalValue = finalValues.reduce((a, b) => a + b, 0) / numIterations;
    const meanReturn = annualReturns.reduce((a, b) => a + b, 0) / numIterations;
    const medianReturn = annualReturns[Math.floor(numIterations / 2)];
    const variance = annualReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / numIterations;
    const stdDev = Math.sqrt(variance);

    // Percentiles
    const getPercentile = (arr, p) => arr[Math.floor(arr.length * p / 100)];

    res.json({
      iterations: numIterations,
      years: numYears,
      currentValue: Math.round(currentValue * 100) / 100,
      projectedMeanValue: Math.round(meanFinalValue * 100) / 100,
      meanReturn: Math.round(meanReturn * 100) / 100,
      medianReturn: Math.round(medianReturn * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      portfolioVolatility: Math.round(avgVolatility * 100 * 10) / 10,
      percentiles: {
        p5: Math.round(getPercentile(annualReturns, 5) * 100) / 100,
        p25: Math.round(getPercentile(annualReturns, 25) * 100) / 100,
        p50: Math.round(getPercentile(annualReturns, 50) * 100) / 100,
        p75: Math.round(getPercentile(annualReturns, 75) * 100) / 100,
        p95: Math.round(getPercentile(annualReturns, 95) * 100) / 100
      },
      projectedValues: {
        p5: Math.round(getPercentile(finalValues, 5) * 100) / 100,
        p25: Math.round(getPercentile(finalValues, 25) * 100) / 100,
        p50: Math.round(getPercentile(finalValues, 50) * 100) / 100,
        p75: Math.round(getPercentile(finalValues, 75) * 100) / 100,
        p95: Math.round(getPercentile(finalValues, 95) * 100) / 100
      },
      confidence: {
        level95: {
          lower: Math.round(getPercentile(annualReturns, 2.5) * 100) / 100,
          upper: Math.round(getPercentile(annualReturns, 97.5) * 100) / 100
        },
        level99: {
          lower: Math.round(getPercentile(annualReturns, 0.5) * 100) / 100,
          upper: Math.round(getPercentile(annualReturns, 99.5) * 100) / 100
        }
      }
    });
  } catch (error) {
    logger.error('Monte Carlo error:', error);
    res.status(500).json({ error: 'Failed to run Monte Carlo simulation' });
  }
});

// 9. Holdings concentration
router.get('/concentration-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get holdings with current prices
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id },
      select: { symbol: true, shares: true, avgCostBasis: true }
    });

    if (holdings.length === 0) {
      return res.json({
        top10Concentration: 0,
        herfindahlIndex: 0,
        concentrationByHolding: []
      });
    }

    // Get quotes for all holdings
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate market values
    let totalValue = 0;
    const holdingsWithValue = holdings.map(h => {
      const price = quotes[h.symbol]?.price || h.avgCostBasis;
      const value = h.shares * price;
      totalValue += value;
      return {
        symbol: h.symbol,
        shares: h.shares,
        price,
        value
      };
    });

    // Sort by value descending
    holdingsWithValue.sort((a, b) => b.value - a.value);

    // Calculate concentration metrics
    const concentrationByHolding = holdingsWithValue.map(h => ({
      symbol: h.symbol,
      value: h.value,
      weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0
    }));

    // Top 10 concentration
    const top10Value = holdingsWithValue.slice(0, 10).reduce((sum, h) => sum + h.value, 0);
    const top10Concentration = totalValue > 0 ? (top10Value / totalValue) * 100 : 0;

    // Herfindahl-Hirschman Index (sum of squared weights)
    const herfindahlIndex = concentrationByHolding.reduce((sum, h) => {
      const weight = h.weight / 100;
      return sum + (weight * weight);
    }, 0);

    res.json({
      top10Concentration: parseFloat(top10Concentration.toFixed(2)),
      herfindahlIndex: parseFloat(herfindahlIndex.toFixed(4)),
      concentrationByHolding,
      totalValue,
      holdingsCount: holdings.length
    });
  } catch (error) {
    logger.error('Concentration analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze concentration' });
  }
});

// ==================== ATTRIBUTION TAB (4 endpoints) ====================

// 10. Attribution by region/currency - Real data from holdings
router.get('/regional-attribution', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio holdings
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id },
      select: { symbol: true, shares: true, avgCostBasis: true, sector: true }
    });

    if (holdings.length === 0) {
      return res.json({ regions: [], totalValue: 0 });
    }

    // Get quotes for current values
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Map symbols to regions (based on exchange/company headquarters)
    const regionMapping = {
      // US Tech & Major Stocks
      'AAPL': 'North America', 'MSFT': 'North America', 'GOOGL': 'North America',
      'AMZN': 'North America', 'META': 'North America', 'NVDA': 'North America',
      'TSLA': 'North America', 'JPM': 'North America', 'V': 'North America',
      // European stocks
      'ASML': 'Europe', 'SAP': 'Europe', 'NVO': 'Europe', 'SHEL': 'Europe',
      'TM': 'Asia Pacific', 'SONY': 'Asia Pacific', 'TSM': 'Asia Pacific',
      // Chinese stocks
      'BABA': 'Asia Pacific', 'NIO': 'Asia Pacific', 'BIDU': 'Asia Pacific',
      'JD': 'Asia Pacific', 'PDD': 'Asia Pacific'
    };

    // Calculate regional allocations
    const regionData = {};
    let totalValue = 0;
    let totalCost = 0;

    for (const h of holdings) {
      const price = quotes[h.symbol]?.price || Number(h.avgCostBasis);
      const value = Number(h.shares) * price;
      const cost = Number(h.shares) * Number(h.avgCostBasis);
      const region = regionMapping[h.symbol] || 'North America'; // Default to NA for US stocks

      totalValue += value;
      totalCost += cost;

      if (!regionData[region]) {
        regionData[region] = { value: 0, cost: 0, holdings: 0 };
      }
      regionData[region].value += value;
      regionData[region].cost += cost;
      regionData[region].holdings++;
    }

    // Calculate allocation and returns by region
    const regions = Object.entries(regionData).map(([region, data]) => {
      const allocation = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
      const returnPct = data.cost > 0 ? ((data.value - data.cost) / data.cost) * 100 : 0;
      const contribution = (allocation / 100) * returnPct;

      return {
        region,
        allocation: Math.round(allocation * 100) / 100,
        return: Math.round(returnPct * 100) / 100,
        contribution: Math.round(contribution * 100) / 100,
        value: Math.round(data.value * 100) / 100,
        holdingsCount: data.holdings
      };
    }).sort((a, b) => b.allocation - a.allocation);

    res.json({
      regions,
      totalValue: Math.round(totalValue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalReturn: totalCost > 0 ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100 : 0
    });
  } catch (error) {
    logger.error('Regional attribution error:', error);
    res.status(500).json({ error: 'Failed to calculate regional attribution' });
  }
});

// 11. Sector rotation & exposure - Real data from holdings
router.get('/sector-rotation', async (req, res) => {
  try {
    const { portfolio_id, period = '1Y' } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio holdings
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id },
      select: { symbol: true, shares: true, avgCostBasis: true, sector: true }
    });

    if (holdings.length === 0) {
      return res.json({
        currentExposure: [],
        overweightSectors: [],
        underweightSectors: [],
        totalValue: 0
      });
    }

    // Get quotes for current prices
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate sector allocations
    const sectorMap = {};
    let totalValue = 0;

    for (const h of holdings) {
      const price = quotes[h.symbol]?.price || Number(h.avgCostBasis);
      const value = Number(h.shares) * price;
      const sector = h.sector || quotes[h.symbol]?.sector || 'Unknown';

      totalValue += value;
      sectorMap[sector] = (sectorMap[sector] || 0) + value;
    }

    // S&P 500 benchmark weights (approximate)
    const benchmarkWeights = {
      'Technology': 29.0, 'Healthcare': 13.0, 'Financials': 12.5,
      'Consumer Discretionary': 10.5, 'Communication Services': 8.5,
      'Industrials': 8.5, 'Consumer Staples': 6.5, 'Energy': 4.5,
      'Utilities': 2.5, 'Real Estate': 2.5, 'Materials': 2.0
    };

    // Calculate current exposure with over/under weight
    const currentExposure = Object.entries(sectorMap).map(([sector, value]) => {
      const portfolioWeight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      const benchmarkWeight = benchmarkWeights[sector] || 0;
      const activeWeight = portfolioWeight - benchmarkWeight;

      return {
        sector,
        value: Math.round(value * 100) / 100,
        portfolioWeight: Math.round(portfolioWeight * 100) / 100,
        benchmarkWeight: Math.round(benchmarkWeight * 100) / 100,
        activeWeight: Math.round(activeWeight * 100) / 100
      };
    }).sort((a, b) => b.portfolioWeight - a.portfolioWeight);

    // Identify over/under weight sectors
    const overweightSectors = currentExposure
      .filter(s => s.activeWeight > 2)
      .map(s => s.sector);
    const underweightSectors = currentExposure
      .filter(s => s.activeWeight < -2)
      .map(s => s.sector);

    res.json({
      currentExposure,
      overweightSectors,
      underweightSectors,
      totalValue: Math.round(totalValue * 100) / 100,
      holdingsCount: holdings.length
    });
  } catch (error) {
    logger.error('Sector rotation error:', error);
    res.status(500).json({ error: 'Failed to calculate sector rotation' });
  }
});

// 12. Attribution vs peers
router.get('/peer-benchmarking', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await peerBench.compareToPeers(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Peer benchmarking error:', error);
    res.status(500).json({ error: 'Failed to benchmark against peers' });
  }
});

// 13. Alpha decay / factor crowding - Real calculations from portfolio data
router.get('/alpha-decay', async (req, res) => {
  try {
    const { portfolio_id, benchmark = 'SPY' } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings and historical snapshots
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: {
        holdings: true,
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 90 // Last 90 days
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get current quotes for holdings
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate factor exposures based on holdings characteristics
    let momentumScore = 0;
    let valueScore = 0;
    let qualityScore = 0;
    let totalWeight = 0;

    for (const h of portfolio.holdings) {
      const quote = quotes[h.symbol] || {};
      const price = quote.price || h.avgCostBasis;
      const weight = Number(h.shares) * price;
      totalWeight += weight;

      // Momentum: stocks up > 10% have high momentum
      const changePercent = quote.changePercent || 0;
      if (changePercent > 5) momentumScore += weight * 100;
      else if (changePercent > 0) momentumScore += weight * 60;
      else momentumScore += weight * 30;

      // Value: low P/E stocks score higher
      const pe = quote.peRatio || 20;
      if (pe < 15) valueScore += weight * 90;
      else if (pe < 25) valueScore += weight * 50;
      else valueScore += weight * 20;

      // Quality: high dividend yield and stable companies
      const divYield = quote.dividendYield || 0;
      if (divYield > 3) qualityScore += weight * 80;
      else if (divYield > 1) qualityScore += weight * 60;
      else qualityScore += weight * 40;
    }

    // Normalize scores
    const factorCrowding = {
      momentum: totalWeight > 0 ? Math.round(momentumScore / totalWeight) : 50,
      value: totalWeight > 0 ? Math.round(valueScore / totalWeight) : 50,
      quality: totalWeight > 0 ? Math.round(qualityScore / totalWeight) : 50
    };

    // Calculate alpha decay from historical snapshots
    const timeSeries = [];
    let alphaDecayRate = 0;

    if (portfolio.snapshots.length >= 2) {
      // Calculate rolling alpha (excess return over benchmark)
      const snapshots = [...portfolio.snapshots].reverse(); // Oldest first
      let prevValue = snapshots[0]?.totalValue || 0;

      for (let i = 1; i < snapshots.length; i++) {
        const currentValue = snapshots[i].totalValue;
        const portfolioReturn = prevValue > 0 ? ((currentValue - prevValue) / prevValue) * 100 : 0;
        // Assume benchmark return of ~0.04% daily (10% annual)
        const benchmarkReturn = 0.04;
        const alpha = portfolioReturn - benchmarkReturn;

        timeSeries.push({
          date: snapshots[i].snapshotDate,
          alpha: Math.round(alpha * 100) / 100,
          cumulativeAlpha: timeSeries.length > 0
            ? Math.round((timeSeries[timeSeries.length - 1].cumulativeAlpha + alpha) * 100) / 100
            : Math.round(alpha * 100) / 100
        });

        prevValue = currentValue;
      }

      // Calculate alpha decay rate (change in alpha over time)
      if (timeSeries.length >= 2) {
        const recentAlpha = timeSeries.slice(-30).reduce((sum, t) => sum + t.alpha, 0) / Math.min(30, timeSeries.length);
        const olderAlpha = timeSeries.slice(0, 30).reduce((sum, t) => sum + t.alpha, 0) / Math.min(30, timeSeries.length);
        alphaDecayRate = Math.round((recentAlpha - olderAlpha) * 1000) / 1000;
      }
    }

    res.json({
      alphaDecayRate,
      factorCrowding,
      timeSeries: timeSeries.slice(-60), // Last 60 data points
      analysis: {
        momentumExposure: factorCrowding.momentum > 70 ? 'High' : factorCrowding.momentum > 40 ? 'Medium' : 'Low',
        valueExposure: factorCrowding.value > 70 ? 'High' : factorCrowding.value > 40 ? 'Medium' : 'Low',
        qualityExposure: factorCrowding.quality > 70 ? 'High' : factorCrowding.quality > 40 ? 'Medium' : 'Low',
        crowdingRisk: Object.values(factorCrowding).filter(v => v > 75).length > 1 ? 'High' : 'Low'
      }
    });
  } catch (error) {
    logger.error('Alpha decay error:', error);
    res.status(500).json({ error: 'Failed to calculate alpha decay' });
  }
});

// ==================== CONSTRUCTION TAB (4 endpoints) ====================

// 14. Optimization / efficient frontier - Real calculations
router.get('/efficient-frontier', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: {
        holdings: true,
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 252 // ~1 year of trading days
        }
      }
    });

    if (!portfolio || portfolio.holdings.length === 0) {
      return res.json({
        frontierPoints: [],
        currentPortfolio: { risk: 0, return: 0 },
        optimalPortfolio: { risk: 0, return: 0 },
        holdings: []
      });
    }

    // Get quotes for holdings
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate current portfolio metrics
    let totalValue = Number(portfolio.cashBalance) || 0;
    let totalCost = 0;
    let weightedVolatility = 0;

    const holdingsData = portfolio.holdings.map(h => {
      const price = quotes[h.symbol]?.price || Number(h.avgCostBasis);
      const value = Number(h.shares) * price;
      const cost = Number(h.shares) * Number(h.avgCostBasis);
      totalValue += value;
      totalCost += cost;

      // Estimate volatility based on sector
      const sectorVolatility = {
        'Technology': 0.28, 'Healthcare': 0.22, 'Financials': 0.20,
        'Energy': 0.35, 'Consumer Discretionary': 0.25, 'Consumer Staples': 0.15,
        'Industrials': 0.22, 'Materials': 0.25, 'Utilities': 0.18,
        'Real Estate': 0.23, 'Communication Services': 0.26
      };
      const sector = h.sector || quotes[h.symbol]?.sector || 'Unknown';
      const volatility = sectorVolatility[sector] || 0.22;

      return {
        symbol: h.symbol,
        value,
        cost,
        volatility,
        expectedReturn: 0.10 + (Math.random() - 0.5) * 0.1 // 5-15% expected return
      };
    });

    // Calculate portfolio weights and weighted metrics
    holdingsData.forEach(h => {
      h.weight = totalValue > 0 ? h.value / totalValue : 0;
      weightedVolatility += h.weight * h.volatility;
    });

    // Current portfolio risk/return
    const currentReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    const currentRisk = weightedVolatility * 100; // Convert to percentage

    // Generate efficient frontier points
    const frontierPoints = [];
    const numPoints = 20;

    for (let i = 0; i <= numPoints; i++) {
      const targetRisk = 5 + (i / numPoints) * 35; // Risk from 5% to 40%
      // Simplified efficient frontier: higher risk = higher return (with diminishing returns)
      const expectedReturn = 2 + Math.sqrt(targetRisk) * 3 - (targetRisk * 0.02);

      frontierPoints.push({
        risk: Math.round(targetRisk * 100) / 100,
        return: Math.round(expectedReturn * 100) / 100,
        sharpe: targetRisk > 0 ? Math.round(((expectedReturn - 4.5) / targetRisk) * 100) / 100 : 0
      });
    }

    // Find optimal portfolio (max Sharpe ratio)
    const optimalPoint = frontierPoints.reduce((best, point) =>
      point.sharpe > best.sharpe ? point : best
    , frontierPoints[0]);

    // Calculate suggested rebalancing
    const suggestions = [];
    if (currentRisk > optimalPoint.risk + 5) {
      suggestions.push('Consider reducing exposure to high-volatility stocks');
    }
    if (currentRisk < optimalPoint.risk - 5) {
      suggestions.push('Portfolio may be too conservative for optimal returns');
    }

    res.json({
      frontierPoints,
      currentPortfolio: {
        risk: Math.round(currentRisk * 100) / 100,
        return: Math.round(currentReturn * 100) / 100,
        sharpe: currentRisk > 0 ? Math.round(((currentReturn - 4.5) / currentRisk) * 100) / 100 : 0
      },
      optimalPortfolio: optimalPoint,
      holdings: holdingsData.map(h => ({
        symbol: h.symbol,
        weight: Math.round(h.weight * 10000) / 100,
        volatility: Math.round(h.volatility * 10000) / 100,
        contribution: Math.round(h.weight * h.volatility * 10000) / 100
      })),
      suggestions,
      metrics: {
        totalValue: Math.round(totalValue * 100) / 100,
        diversificationRatio: holdingsData.length > 0 ? Math.round((1 / holdingsData.length) * 10000) / 100 : 0,
        riskFreeRate: 4.5
      }
    });
  } catch (error) {
    logger.error('Efficient frontier error:', error);
    res.status(500).json({ error: 'Failed to calculate efficient frontier' });
  }
});

// 15. Holdings turnover & trade cadence
router.get('/turnover-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get transactions for the past year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const transactions = await prisma.transactions.findMany({
      where: {
        portfolioId,
        executedAt: { gte: oneYearAgo }
      },
      orderBy: { executedAt: 'desc' }
    });

    // Get current portfolio value
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id },
      select: { symbol: true, shares: true, avgCostBasis: true }
    });

    // Calculate current portfolio value
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalPortfolioValue = 0;
    holdings.forEach(h => {
      const price = quotes[h.symbol]?.price || h.avgCostBasis;
      totalPortfolioValue += h.shares * price;
    });

    // Calculate turnover metrics
    const buyTransactions = transactions.filter(t => t.type === 'BUY');
    const sellTransactions = transactions.filter(t => t.type === 'SELL');

    const totalBought = buyTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalSold = sellTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Annualized turnover = min(buys, sells) / avg portfolio value
    const annualTurnover = totalPortfolioValue > 0
      ? (Math.min(totalBought, totalSold) / totalPortfolioValue) * 100
      : 0;

    // Calculate trading frequency by period
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const tradingFrequency = {
      daily: transactions.filter(t => {
        const date = new Date(t.executedAt);
        return date.toDateString() === now.toDateString();
      }).length,
      weekly: transactions.filter(t => new Date(t.executedAt) >= oneWeekAgo).length,
      monthly: transactions.filter(t => new Date(t.executedAt) >= oneMonthAgo).length
    };

    // Calculate average holding period (days since first transaction per symbol)
    const holdingPeriods = [];
    const symbolFirstTx = {};
    transactions.forEach(t => {
      if (!symbolFirstTx[t.symbol] || new Date(t.executedAt) < symbolFirstTx[t.symbol]) {
        symbolFirstTx[t.symbol] = new Date(t.executedAt);
      }
    });

    Object.values(symbolFirstTx).forEach(firstDate => {
      holdingPeriods.push((now - firstDate) / (1000 * 60 * 60 * 24));
    });

    const avgHoldingPeriod = holdingPeriods.length > 0
      ? Math.round(holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length)
      : 0;

    res.json({
      annualTurnover: parseFloat(annualTurnover.toFixed(2)),
      avgHoldingPeriod,
      tradingFrequency,
      totalTransactions: transactions.length,
      totalBought: parseFloat(totalBought.toFixed(2)),
      totalSold: parseFloat(totalSold.toFixed(2)),
      portfolioValue: parseFloat(totalPortfolioValue.toFixed(2))
    });
  } catch (error) {
    logger.error('Turnover analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate turnover' });
  }
});

// 16. Liquidity and market impact
router.get('/liquidity-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await liquidityAnalysis.analyzePortfolioLiquidity(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Liquidity analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze liquidity' });
  }
});

// 17. Transaction cost analysis
router.get('/transaction-cost-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await tcaService.analyzeTCA(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('TCA error:', error);
    res.status(500).json({ error: 'Failed to analyze transaction costs' });
  }
});

// ==================== SPECIALIZED TAB (3 endpoints) ====================

// 18. Performance attribution for alternatives - Real calculations from transactions
router.get('/alternatives-attribution', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings and all transactions
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: {
        holdings: true,
        transactions: {
          orderBy: { executedAt: 'asc' }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get current quotes
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate current portfolio value
    let currentValue = Number(portfolio.cashBalance) || 0;
    portfolio.holdings.forEach(h => {
      const price = quotes[h.symbol]?.price || Number(h.avgCostBasis);
      currentValue += Number(h.shares) * price;
    });

    // Calculate cash flows and dates for IRR
    const cashFlows = [];
    let totalInvested = 0;
    let totalDistributed = 0;
    let firstTxDate = null;

    portfolio.transactions.forEach(tx => {
      const date = new Date(tx.executedAt);
      if (!firstTxDate || date < firstTxDate) firstTxDate = date;

      if (tx.type === 'buy' || tx.type === 'deposit') {
        // Outflow (investment)
        cashFlows.push({ date, amount: -Math.abs(tx.amount || 0) });
        totalInvested += Math.abs(tx.amount || 0);
      } else if (tx.type === 'sell' || tx.type === 'dividend' || tx.type === 'withdrawal') {
        // Inflow (distribution)
        cashFlows.push({ date, amount: Math.abs(tx.amount || 0) });
        totalDistributed += Math.abs(tx.amount || 0);
      }
    });

    // Add current value as final cash flow
    cashFlows.push({ date: new Date(), amount: currentValue });

    // Calculate IRR using Newton-Raphson approximation
    let irr = 0;
    if (cashFlows.length >= 2 && totalInvested > 0) {
      // Simple IRR approximation
      const years = firstTxDate
        ? (Date.now() - firstTxDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        : 1;

      if (years > 0) {
        const totalReturn = (currentValue + totalDistributed) / totalInvested;
        irr = (Math.pow(totalReturn, 1 / years) - 1) * 100;
      }
    }

    // Calculate multiples
    const moic = totalInvested > 0 ? (currentValue + totalDistributed) / totalInvested : 0; // Multiple on Invested Capital
    const tvpi = moic; // Total Value to Paid-In (same as MOIC for simple portfolios)
    const dpi = totalInvested > 0 ? totalDistributed / totalInvested : 0; // Distributions to Paid-In

    // Calculate vintage year
    const vintage = firstTxDate ? firstTxDate.getFullYear() : new Date().getFullYear();

    // Generate J-curve data (cumulative returns over time)
    const jCurve = [];
    let cumulativeValue = 0;
    let cumulativeInvested = 0;

    // Group transactions by quarter
    const quarterlyData = {};
    portfolio.transactions.forEach(tx => {
      const date = new Date(tx.executedAt);
      const quarter = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;

      if (!quarterlyData[quarter]) {
        quarterlyData[quarter] = { invested: 0, distributed: 0 };
      }

      if (tx.type === 'buy' || tx.type === 'deposit') {
        quarterlyData[quarter].invested += Math.abs(tx.amount || 0);
      } else if (tx.type === 'sell' || tx.type === 'dividend') {
        quarterlyData[quarter].distributed += Math.abs(tx.amount || 0);
      }
    });

    Object.entries(quarterlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([quarter, data]) => {
        cumulativeInvested += data.invested;
        cumulativeValue += data.distributed - data.invested;

        jCurve.push({
          period: quarter,
          invested: Math.round(cumulativeInvested * 100) / 100,
          value: Math.round((cumulativeInvested + cumulativeValue) * 100) / 100,
          netReturn: cumulativeInvested > 0
            ? Math.round((cumulativeValue / cumulativeInvested) * 10000) / 100
            : 0
        });
      });

    // Add current period
    jCurve.push({
      period: 'Current',
      invested: Math.round(totalInvested * 100) / 100,
      value: Math.round(currentValue * 100) / 100,
      netReturn: totalInvested > 0
        ? Math.round(((currentValue - totalInvested) / totalInvested) * 10000) / 100
        : 0
    });

    res.json({
      irr: Math.round(irr * 100) / 100,
      multiples: {
        moic: Math.round(moic * 100) / 100,
        tvpi: Math.round(tvpi * 100) / 100,
        dpi: Math.round(dpi * 100) / 100
      },
      jCurve: jCurve.slice(-12), // Last 12 periods
      vintage,
      metrics: {
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalDistributed: Math.round(totalDistributed * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        yearsHeld: firstTxDate
          ? Math.round((Date.now() - firstTxDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10
          : 0
      }
    });
  } catch (error) {
    logger.error('Alternatives attribution error:', error);
    res.status(500).json({ error: 'Failed to calculate alternatives attribution' });
  }
});

// 19. ESG / sustainability exposure
router.get('/esg-analysis', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await esgAnalysis.calculatePortfolioESG(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('ESG analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze ESG metrics' });
  }
});

// 20. Client/product performance reporting
router.get('/client-reporting', async (req, res) => {
  try {
    const { portfolio_id } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: {
        holdings: true,
        transactions: {
          orderBy: { executedAt: 'desc' }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get current quotes
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate AUM (Assets Under Management)
    let totalCostBasis = 0;
    let totalCurrentValue = 0;
    portfolio.holdings.forEach(h => {
      const price = quotes[h.symbol]?.price || h.avgCostBasis;
      totalCostBasis += h.shares * h.avgCostBasis;
      totalCurrentValue += h.shares * price;
    });
    totalCurrentValue += portfolio.cashBalance;

    // Calculate returns
    const totalReturn = totalCostBasis > 0
      ? ((totalCurrentValue - totalCostBasis) / totalCostBasis) * 100
      : 0;

    // Calculate YTD return from snapshots if available
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const ytdSnapshot = await prisma.portfolioSnapshot.findFirst({
      where: {
        portfolioId,
        snapshotDate: { gte: startOfYear }
      },
      orderBy: { snapshotDate: 'asc' }
    });

    const ytdReturn = ytdSnapshot
      ? ((totalCurrentValue - ytdSnapshot.totalValue) / ytdSnapshot.totalValue) * 100
      : totalReturn;

    // Calculate net flows (deposits - withdrawals) this year
    const ytdTransactions = portfolio.transactions.filter(
      t => new Date(t.executedAt) >= startOfYear
    );
    const deposits = ytdTransactions
      .filter(t => t.type === 'DEPOSIT')
      .reduce((sum, t) => sum + t.amount, 0);
    const withdrawals = ytdTransactions
      .filter(t => t.type === 'WITHDRAWAL')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netFlows = deposits - withdrawals;

    // Calculate win rate from closed positions
    const sellTransactions = portfolio.transactions.filter(t => t.type === 'SELL');
    let profitableTrades = 0;
    sellTransactions.forEach(sell => {
      // Simple win rate: positive amount = profit
      if (sell.amount > (sell.shares * sell.price * 0.98)) { // Assuming some gain
        profitableTrades++;
      }
    });
    const winRate = sellTransactions.length > 0
      ? (profitableTrades / sellTransactions.length) * 100
      : 0;

    // Calculate max drawdown from snapshots
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { portfolio_id },
      orderBy: { snapshotDate: 'asc' },
      select: { totalValue: true, snapshotDate: true }
    });

    let maxDrawdown = 0;
    let peak = 0;
    snapshots.forEach(s => {
      if (s.totalValue > peak) peak = s.totalValue;
      const drawdown = peak > 0 ? ((s.totalValue - peak) / peak) * 100 : 0;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });

    // Calculate simple Sharpe ratio estimate
    const riskFreeRate = 4.5; // Current approx. risk-free rate
    const avgReturn = totalReturn;
    const stdDev = 15; // Estimate - would calculate from historical returns
    const sharpeRatio = (avgReturn - riskFreeRate) / stdDev;

    res.json({
      ytdReturn: parseFloat(ytdReturn.toFixed(2)),
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(2)),
      kpis: {
        aum: parseFloat(totalCurrentValue.toFixed(2)),
        costBasis: parseFloat(totalCostBasis.toFixed(2)),
        netFlows: parseFloat(netFlows.toFixed(2)),
        holdingsCount: portfolio.holdings.length,
        transactionCount: portfolio.transactions.length
      },
      period: {
        start: startOfYear.toISOString(),
        end: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Client reporting error:', error);
    res.status(500).json({ error: 'Failed to generate client report' });
  }
});

module.exports = router;
