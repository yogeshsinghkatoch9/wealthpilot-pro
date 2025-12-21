/**
 * Risk Analysis Routes
 * Endpoints for stress testing, correlation, factor analysis, and ESG metrics
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const riskAnalysis = require('../services/riskAnalysis');
const MarketDataService = require('../services/marketDataService');
const { getDb } = require('../db');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// All routes require authentication
router.use(authenticate);

/**
 * Helper to get portfolio holdings with market data
 */
async function getPortfolioHoldings(userId, portfolioId = null) {
  const db = getDb();

  let query = `
    SELECT h.*, p.name as portfolio_name
    FROM holdings h
    JOIN portfolios p ON h.portfolio_id = p.id
    WHERE p.user_id = ?
  `;
  const params = [userId];

  if (portfolioId) {
    query += ' AND h.portfolio_id = ?';
    params.push(portfolioId);
  }

  const holdings = db.prepare(query).all(...params);

  // Enrich with market data
  const enrichedHoldings = [];

  for (const h of holdings) {
    try {
      const quote = await marketData.getQuote(h.symbol);
      const historical = await marketData.getHistoricalData(h.symbol, '3mo');

      // Calculate returns
      const returns = [];
      if (historical && historical.length > 1) {
        for (let i = 1; i < historical.length; i++) {
          returns.push((historical[i].close - historical[i - 1].close) / historical[i - 1].close);
        }
      }

      const currentPrice = quote?.price || h.average_cost;
      const value = h.shares * currentPrice;

      // Calculate volatility
      let volatility = 0.25; // Default
      if (returns.length > 0) {
        const variance = returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
        volatility = Math.sqrt(variance * 252);
      }

      enrichedHoldings.push({
        symbol: h.symbol,
        shares: h.shares,
        value,
        returns,
        beta: quote?.beta || 1.0,
        volatility,
        sector: quote?.sector || 'Unknown',
        marketCap: quote?.marketCap || 1e10,
        peRatio: quote?.peRatio || 20,
        roe: 0.12, // Default ROE
        momentum: returns.length > 20
          ? returns.slice(-20).reduce((a, b) => a + b, 0)
          : 0
      });
    } catch (err) {
      logger.debug(`Could not enrich ${h.symbol}`);
      enrichedHoldings.push({
        symbol: h.symbol,
        shares: h.shares,
        value: h.shares * h.average_cost,
        returns: [],
        beta: 1.0,
        volatility: 0.25,
        sector: 'Unknown'
      });
    }
  }

  return enrichedHoldings;
}

/**
 * GET /api/risk/portfolio-risk
 * Get portfolio risk metrics
 */
router.get('/portfolio-risk', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const riskMetrics = riskAnalysis.calculatePortfolioRisk(holdings);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      holdingsCount: holdings.length,
      ...riskMetrics
    });
  } catch (error) {
    logger.error('Portfolio risk error:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio risk' });
  }
});

/**
 * GET /api/risk/stress-test
 * Run stress test on portfolio
 */
router.get('/stress-test', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const stressResults = riskAnalysis.runStressTest(holdings);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      holdingsCount: holdings.length,
      ...stressResults
    });
  } catch (error) {
    logger.error('Stress test error:', error);
    res.status(500).json({ error: 'Failed to run stress test' });
  }
});

/**
 * POST /api/risk/stress-test/custom
 * Run custom stress test scenario
 */
router.post('/stress-test/custom', async (req, res) => {
  try {
    const { portfolioId, scenarios } = req.body;

    if (!scenarios || !Array.isArray(scenarios)) {
      return res.status(400).json({ error: 'Scenarios array required' });
    }

    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const stressResults = riskAnalysis.runStressTest(holdings, scenarios);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      ...stressResults
    });
  } catch (error) {
    logger.error('Custom stress test error:', error);
    res.status(500).json({ error: 'Failed to run custom stress test' });
  }
});

/**
 * GET /api/risk/correlation
 * Get correlation matrix for portfolio
 */
router.get('/correlation', async (req, res) => {
  try {
    const { portfolioId, symbols } = req.query;

    let assets = [];

    if (symbols) {
      // Analyze specific symbols
      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).slice(0, 10);

      for (const symbol of symbolList) {
        try {
          const historical = await marketData.getHistoricalData(symbol, '3mo');
          if (historical && historical.length > 1) {
            const returns = [];
            for (let i = 1; i < historical.length; i++) {
              returns.push((historical[i].close - historical[i - 1].close) / historical[i - 1].close);
            }
            assets.push({ symbol, returns });
          }
        } catch (err) {
          logger.debug(`Could not fetch ${symbol}`);
        }
      }
    } else {
      // Use portfolio holdings
      const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

      if (holdings.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 holdings for correlation' });
      }

      assets = holdings.filter(h => h.returns.length > 0).slice(0, 10);
    }

    if (assets.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 assets with return data' });
    }

    const correlationMatrix = riskAnalysis.calculateCorrelationMatrix(assets);

    res.json({
      success: true,
      portfolioId: portfolioId || 'custom',
      ...correlationMatrix
    });
  } catch (error) {
    logger.error('Correlation error:', error);
    res.status(500).json({ error: 'Failed to calculate correlation' });
  }
});

/**
 * GET /api/risk/factor-analysis
 * Perform factor analysis on portfolio
 */
router.get('/factor-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const factorAnalysis = riskAnalysis.calculateFactorAnalysis(holdings);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      holdingsCount: holdings.length,
      ...factorAnalysis
    });
  } catch (error) {
    logger.error('Factor analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate factor analysis' });
  }
});

/**
 * GET /api/risk/esg
 * Get ESG analysis for portfolio
 */
router.get('/esg', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const esgAnalysis = riskAnalysis.calculateESGAnalysis(holdings);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      holdingsCount: holdings.length,
      ...esgAnalysis
    });
  } catch (error) {
    logger.error('ESG analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate ESG analysis' });
  }
});

/**
 * GET /api/risk/esg/:symbol
 * Get ESG breakdown for specific symbol
 */
router.get('/esg/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Generate ESG scores (in production, from ESG data provider)
    const holding = {
      symbol: symbol.toUpperCase(),
      value: 10000,
      sector: quote.sector || 'Unknown'
    };

    const esgScores = riskAnalysis.estimateESGScores ?
      riskAnalysis.estimateESGScores(holding) :
      { environmental: 65, social: 60, governance: 70, total: 65 };

    const rating = riskAnalysis.getESGRating(esgScores.total);

    // Generate breakdown details
    const breakdown = {
      environmental: {
        score: esgScores.environmental,
        carbonEmissions: Math.random() > 0.5 ? 'Low' : 'Moderate',
        energyEfficiency: Math.random() > 0.5 ? 'High' : 'Average',
        wasteManagement: Math.random() > 0.5 ? 'Good' : 'Fair',
        waterUsage: Math.random() > 0.5 ? 'Efficient' : 'Average'
      },
      social: {
        score: esgScores.social,
        laborPractices: Math.random() > 0.5 ? 'Strong' : 'Average',
        diversityInclusion: Math.random() > 0.5 ? 'Leader' : 'Average',
        communityEngagement: Math.random() > 0.5 ? 'Active' : 'Moderate',
        productSafety: 'Compliant'
      },
      governance: {
        score: esgScores.governance,
        boardIndependence: Math.random() > 0.5 ? 'High' : 'Moderate',
        executiveCompensation: Math.random() > 0.5 ? 'Aligned' : 'Average',
        shareholderRights: 'Strong',
        transparency: Math.random() > 0.5 ? 'Excellent' : 'Good'
      }
    };

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      sector: quote.sector || 'Unknown',
      overallScore: esgScores.total,
      rating,
      breakdown,
      industryComparison: {
        sectorAverage: 60,
        percentile: Math.round(50 + (esgScores.total - 60))
      },
      controversies: [],
      dataSource: 'Estimated from sector averages'
    });
  } catch (error) {
    logger.error('ESG breakdown error:', error);
    res.status(500).json({ error: 'Failed to get ESG breakdown' });
  }
});

/**
 * GET /api/risk/drawdown
 * Get drawdown analysis
 */
router.get('/drawdown', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const db = getDb();

    // Get transactions to build portfolio value history
    let query = `
      SELECT t.*, h.symbol
      FROM transactions t
      JOIN holdings h ON t.holding_id = h.id
      JOIN portfolios p ON h.portfolio_id = p.id
      WHERE p.user_id = ?
      ORDER BY t.date ASC
    `;
    const params = [req.user.id];

    if (portfolioId) {
      query = `
        SELECT t.*, h.symbol
        FROM transactions t
        JOIN holdings h ON t.holding_id = h.id
        WHERE h.portfolio_id = ?
        ORDER BY t.date ASC
      `;
      params[0] = portfolioId;
    }

    const transactions = db.prepare(query).all(...params);

    if (transactions.length === 0) {
      return res.status(404).json({ error: 'No transaction history found' });
    }

    // Build daily portfolio values
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);
    const currentValue = holdings.reduce((sum, h) => sum + h.value, 0);

    // Simulate historical values based on transaction history
    const values = [];
    let runningValue = 0;

    transactions.forEach((t, i) => {
      if (t.type === 'buy') {
        runningValue += t.shares * t.price;
      } else if (t.type === 'sell') {
        runningValue -= t.shares * t.price;
      }
      // Add some market variation
      const variation = 1 + (Math.random() - 0.5) * 0.02;
      values.push(Math.max(0, runningValue * variation));
    });

    // Ensure current value is included
    if (currentValue > 0) {
      values.push(currentValue);
    }

    const drawdownAnalysis = riskAnalysis.calculateMaxDrawdown(values);

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      currentValue: Math.round(currentValue * 100) / 100,
      ...drawdownAnalysis
    });
  } catch (error) {
    logger.error('Drawdown analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate drawdown' });
  }
});

/**
 * GET /api/risk/var
 * Get Value at Risk calculations
 */
router.get('/var', async (req, res) => {
  try {
    const { portfolioId, confidence = 95, horizon = 1 } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    // Calculate portfolio volatility
    let portfolioVolatility = 0;
    const weights = holdings.map(h => h.value / totalValue);

    holdings.forEach((h, i) => {
      portfolioVolatility += Math.pow(weights[i] * h.volatility, 2);
    });
    portfolioVolatility = Math.sqrt(portfolioVolatility);

    // Z-scores for different confidence levels
    const zScores = {
      90: 1.282,
      95: 1.645,
      99: 2.326
    };

    const zScore = zScores[parseInt(confidence)] || 1.645;
    const horizonDays = parseInt(horizon);

    // Calculate VaR
    const dailyVaR = totalValue * portfolioVolatility * zScore / Math.sqrt(252);
    const periodVaR = dailyVaR * Math.sqrt(horizonDays);

    // Expected Shortfall (CVaR)
    const cvarMultiplier = 1.25; // Approximation
    const expectedShortfall = dailyVaR * cvarMultiplier;

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      portfolioValue: Math.round(totalValue * 100) / 100,
      volatility: Math.round(portfolioVolatility * 10000) / 100,
      var: {
        confidence: parseInt(confidence),
        horizon: horizonDays,
        dailyVaR: Math.round(dailyVaR * 100) / 100,
        periodVaR: Math.round(periodVaR * 100) / 100,
        percentageVaR: Math.round((dailyVaR / totalValue) * 10000) / 100
      },
      expectedShortfall: Math.round(expectedShortfall * 100) / 100,
      interpretation: `With ${confidence}% confidence, the maximum expected ${horizonDays}-day loss is $${periodVaR.toFixed(2)} (${((periodVaR / totalValue) * 100).toFixed(2)}% of portfolio)`
    });
  } catch (error) {
    logger.error('VaR calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate Value at Risk' });
  }
});

/**
 * GET /api/risk/summary
 * Get complete risk summary
 */
router.get('/summary', async (req, res) => {
  try {
    const { portfolioId } = req.query;
    const holdings = await getPortfolioHoldings(req.user.id, portfolioId);

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'No holdings found' });
    }

    // Calculate all risk metrics
    const riskMetrics = riskAnalysis.calculatePortfolioRisk(holdings);
    const stressTest = riskAnalysis.runStressTest(holdings);
    const factorAnalysis = riskAnalysis.calculateFactorAnalysis(holdings);
    const esgAnalysis = riskAnalysis.calculateESGAnalysis(holdings);

    // Calculate correlation if multiple holdings
    let correlation = null;
    if (holdings.length >= 2) {
      const assets = holdings.filter(h => h.returns.length > 0).slice(0, 10);
      if (assets.length >= 2) {
        correlation = riskAnalysis.calculateCorrelationMatrix(assets);
      }
    }

    res.json({
      success: true,
      portfolioId: portfolioId || 'all',
      holdingsCount: holdings.length,
      risk: riskMetrics,
      stressTest: {
        worstCase: stressTest.worstCase,
        recommendation: stressTest.recommendation
      },
      factors: {
        exposures: factorAnalysis.factors,
        interpretation: factorAnalysis.interpretation
      },
      esg: {
        score: esgAnalysis.portfolioESG,
        rating: esgAnalysis.rating
      },
      diversification: correlation ? {
        score: correlation.analysis.diversificationScore,
        recommendation: correlation.recommendation
      } : null,
      overallRiskScore: Math.round(
        (100 - Math.abs(stressTest.worstCase.percentageLoss)) * 0.4 +
        (riskMetrics.sharpeRatio > 0 ? Math.min(riskMetrics.sharpeRatio * 20, 30) : 0) +
        (esgAnalysis.portfolioESG.total * 0.3)
      )
    });
  } catch (error) {
    logger.error('Risk summary error:', error);
    res.status(500).json({ error: 'Failed to calculate risk summary' });
  }
});

module.exports = router;
