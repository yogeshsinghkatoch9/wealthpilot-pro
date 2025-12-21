const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const performanceAttr = require('../services/advanced/performanceAttribution');
const riskDecomp = require('../services/advanced/riskDecomposition');
const peerBench = require('../services/advanced/peerBenchmarking');
const liquidityAnalysis = require('../services/advanced/liquidityAnalysis');
const tcaService = require('../services/advanced/transactionCostAnalysis');
const esgAnalysis = require('../services/advanced/esgAnalysis');

// All routes require authentication
router.use(authenticate);

// ==================== PERFORMANCE TAB (4 endpoints) ====================

// 1. Performance attribution
router.get('/performance-attribution', async (req, res) => {
  try {
    const { portfolioId, period = '1Y' } = req.query;
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
    const { portfolioId, benchmark = 'SPY', period = '1Y' } = req.query;
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
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Get portfolio with holdings and transactions
    const { prisma } = require('../db/simpleDb');
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: req.user.id },
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
    const { portfolioId, window = 90 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    const windowSize = parseInt(window);
    const { prisma } = require('../db/simpleDb');

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: req.user.id },
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
    const { portfolioId } = req.query;
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
    const { portfolioId, confidence = 95 } = req.query;
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
    const { portfolioId, confidence = 95 } = req.query;
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
    const { portfolioId } = req.query;
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
    const { portfolioId } = req.query;
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
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Run stress tests using the same service
    const result = await riskDecomp.calculateStressTests(portfolioId);
    res.json({ scenarios: result.scenarios || [], ...result });
  } catch (error) {
    logger.error('Stress test error:', error);
    res.status(500).json({ error: 'Failed to run stress tests' });
  }
});

// Monte Carlo simulation
router.get('/monte-carlo', async (req, res) => {
  try {
    const { portfolioId, iterations = 1000 } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Mock Monte Carlo simulation
    res.json({
      iterations: parseInt(iterations),
      meanReturn: 12.5,
      medianReturn: 11.8,
      stdDev: 15.3,
      percentiles: {
        p5: -8.2,
        p25: 4.5,
        p50: 11.8,
        p75: 19.3,
        p95: 32.1
      },
      simulations: [],
      confidence: {
        level95: { lower: -8.2, upper: 32.1 },
        level99: { lower: -15.3, upper: 42.5 }
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
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });

    // Mock concentration data
    res.json({
      top10Concentration: 65.5,
      herfindahlIndex: 0.15,
      concentrationByHolding: []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze concentration' });
  }
});

// ==================== ATTRIBUTION TAB (4 endpoints) ====================

// 10. Attribution by region/currency
router.get('/regional-attribution', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock regional data
    res.json({
      regions: [
        { region: 'North America', allocation: 60, return: 12.5, contribution: 7.5 },
        { region: 'Europe', allocation: 25, return: 8.3, contribution: 2.1 },
        { region: 'Asia Pacific', allocation: 15, return: 15.2, contribution: 2.3 }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate regional attribution' });
  }
});

// 11. Sector rotation & exposure
router.get('/sector-rotation', async (req, res) => {
  try {
    const { portfolioId, period = '1Y' } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock sector rotation
    res.json({
      rotationHistory: [],
      currentExposure: {},
      overweightSectors: ['Technology', 'Healthcare'],
      underweightSectors: ['Energy', 'Utilities']
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate sector rotation' });
  }
});

// 12. Attribution vs peers
router.get('/peer-benchmarking', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await peerBench.compareToPeers(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('Peer benchmarking error:', error);
    res.status(500).json({ error: 'Failed to benchmark against peers' });
  }
});

// 13. Alpha decay / factor crowding
router.get('/alpha-decay', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock alpha decay
    res.json({
      alphaDecayRate: -0.02,
      factorCrowding: { momentum: 75, value: 45, quality: 60 },
      timeSeries: []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate alpha decay' });
  }
});

// ==================== CONSTRUCTION TAB (4 endpoints) ====================

// 14. Optimization / efficient frontier
router.get('/efficient-frontier', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock efficient frontier
    res.json({
      frontierPoints: [],
      currentPortfolio: { risk: 15.3, return: 12.5 },
      optimalPortfolio: { risk: 14.1, return: 13.2 }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate efficient frontier' });
  }
});

// 15. Holdings turnover & trade cadence
router.get('/turnover-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock turnover
    res.json({
      annualTurnover: 45.3,
      avgHoldingPeriod: 180,
      tradingFrequency: { daily: 2, weekly: 8, monthly: 15 }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate turnover' });
  }
});

// 16. Liquidity and market impact
router.get('/liquidity-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.query;
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
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    const result = await tcaService.analyzeTCA(portfolioId);
    res.json(result);
  } catch (error) {
    logger.error('TCA error:', error);
    res.status(500).json({ error: 'Failed to analyze transaction costs' });
  }
});

// ==================== SPECIALIZED TAB (3 endpoints) ====================

// 18. Performance attribution for alternatives
router.get('/alternatives-attribution', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock alternatives data
    res.json({
      irr: 15.2,
      multiples: { moic: 2.5, tvpi: 2.3 },
      jCurve: [],
      vintage: 2020
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate alternatives attribution' });
  }
});

// 19. ESG / sustainability exposure
router.get('/esg-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.query;
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
    const { portfolioId } = req.query;
    if (!portfolioId) return res.status(400).json({ error: 'Portfolio ID required' });
    
    // Mock client reporting
    res.json({
      ytdReturn: 12.5,
      sharpeRatio: 0.85,
      maxDrawdown: -18.5,
      winRate: 62.5,
      kpis: {
        aum: 1250000,
        netFlows: 50000,
        performanceFee: 15000
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate client report' });
  }
});

module.exports = router;
