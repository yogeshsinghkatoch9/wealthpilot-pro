/**
 * Portfolio Manager API Routes
 * Institutional-grade portfolio construction and analysis
 */

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const PortfolioMath = require('../services/portfolioMath');
const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/portfolio-manager/build
 * Get current build state for a portfolio construction session
 */
router.get('/build', async (req, res) => {
  try {
    const userId = req.user.id;

    // Return empty build state for new session
    res.json({
      success: true,
      data: {
        totalInvestment: 100000,
        holdings: [],
        allocation: {
          equity: 0,
          fixedIncome: 0,
          alternatives: 0,
          cash: 0
        },
        metrics: {
          beta: null,
          yield: null,
          projectedIncome: 0,
          sharpeRatio: null
        },
        returns: {
          year1: null,
          year3: null,
          year5: null,
          year10: null
        },
        validation: {
          isValid: false,
          total: 0,
          message: 'Add investments to begin'
        }
      }
    });
  } catch (err) {
    logger.error('Portfolio build state error:', err);
    res.status(500).json({ error: 'Failed to get build state' });
  }
});

/**
 * POST /api/portfolio-manager/analyze
 * Comprehensive portfolio analysis with all metrics
 */
router.post('/analyze', [
  body('holdings').isArray({ min: 1 }),
  body('holdings.*.symbol').trim().notEmpty(),
  body('holdings.*.allocation').isFloat({ min: 0, max: 100 }),
  body('totalInvestment').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { holdings, totalInvestment } = req.body;

    logger.info(`[Portfolio Manager] Analyzing portfolio with ${holdings.length} holdings, $${totalInvestment} total`);

    // Validate allocation
    const validation = PortfolioMath.validateAllocation(holdings);
    if (!validation.isValid) {
      logger.warn(`[Portfolio Manager] Invalid allocation: ${validation.message}`);
    }

    // Fetch current market data for all holdings
    const symbols = holdings.map(h => h.symbol.toUpperCase());
    const quotes = await MarketDataService.getQuotes(symbols);

    // Fetch company profiles for sector data
    const profilePromises = symbols.map(s =>
      MarketDataService.getCompanyProfile(s).catch(() => null)
    );
    const profiles = await Promise.all(profilePromises);
    const profileMap = {};
    profiles.forEach((p, i) => {
      if (p) profileMap[symbols[i]] = p;
    });

    // Enrich holdings with live data
    const enrichedHoldings = holdings.map(h => {
      const symbol = h.symbol.toUpperCase();
      const quote = quotes[symbol] || {};
      const profile = profileMap[symbol] || {};

      const allocation = parseFloat(h.allocation) || 0;
      const price = quote.price || 0;
      const dividendYield = quote.dividendYield || profile.dividendYield || 0;
      const beta = quote.beta || profile.beta || 1;
      const shares = PortfolioMath.calculateShares(allocation, price, totalInvestment);
      const investedAmount = (allocation / 100) * totalInvestment;
      const projectedIncome = PortfolioMath.calculateHoldingIncome(allocation, dividendYield, totalInvestment);

      return {
        symbol,
        name: quote.name || profile.name || symbol,
        allocation,
        shares: parseFloat(shares.toFixed(4)),
        price,
        investedAmount,
        dividendYield,
        projectedIncome,
        beta,
        pe: quote.peRatio || profile.peRatio || null,
        marketCap: quote.marketCap || profile.marketCap || null,
        week52High: quote.week52High || null,
        week52Low: quote.week52Low || null,
        sector: profile.sector || quote.sector || 'Unknown',
        industry: profile.industry || null,
        assetClass: determineAssetClass(symbol, profile),
        change: quote.change || 0,
        changePercent: quote.changePercent || 0
      };
    });

    // Calculate portfolio metrics
    const portfolioBeta = PortfolioMath.calculatePortfolioBeta(enrichedHoldings);
    const portfolioYield = PortfolioMath.calculatePortfolioYield(enrichedHoldings);
    const totalProjectedIncome = PortfolioMath.calculateProjectedIncome(enrichedHoldings, totalInvestment);
    const assetAllocation = PortfolioMath.calculateAssetClassAllocation(enrichedHoldings);
    const sectorAllocation = PortfolioMath.calculateSectorAllocation(enrichedHoldings);
    const concentration = PortfolioMath.calculateConcentration(enrichedHoldings);

    // Calculate risk metrics
    const portfolioStdDev = PortfolioMath.calculatePortfolioStdDev(enrichedHoldings);
    const var95 = PortfolioMath.calculateVaR(totalInvestment, portfolioStdDev, 0.95, 1);

    // Fetch historical returns for each holding
    const historicalPromises = symbols.map(async symbol => {
      try {
        const hist = await MarketDataService.getHistoricalPrices(symbol, 3650);
        const quote = quotes[symbol];
        if (hist && hist.length > 0 && quote?.price) {
          return { symbol, returns: calculateHistoricalReturns(hist, quote.price) };
        }
      } catch (e) {
        logger.warn(`Failed to get historical data for ${symbol}`);
      }
      return null;
    });

    const historicalData = await Promise.all(historicalPromises);

    // Attach returns to holdings
    historicalData.forEach(hd => {
      if (hd) {
        const holding = enrichedHoldings.find(h => h.symbol === hd.symbol);
        if (holding) {
          holding.returns = hd.returns;
        }
      }
    });

    // Calculate portfolio-level returns
    const portfolioReturns = PortfolioMath.calculatePortfolioReturns(enrichedHoldings);

    // Calculate Sharpe Ratio
    const avgReturn = portfolioReturns.year1 ? portfolioReturns.year1 / 100 : null;
    const sharpeRatio = avgReturn !== null ?
      PortfolioMath.calculateSharpeRatio(avgReturn, 0.05, portfolioStdDev) : null;

    // Build response
    res.json({
      success: true,
      data: {
        totalInvestment,
        validation,

        // Holdings with full data
        holdings: enrichedHoldings,

        // Asset class allocation
        allocation: {
          equity: parseFloat(assetAllocation.equity.toFixed(2)),
          fixedIncome: parseFloat(assetAllocation.fixedIncome.toFixed(2)),
          alternatives: parseFloat(assetAllocation.alternatives.toFixed(2)),
          cash: parseFloat(assetAllocation.cash.toFixed(2))
        },

        // Sector allocation
        sectors: sectorAllocation,

        // Portfolio metrics
        metrics: {
          beta: parseFloat(portfolioBeta.toFixed(3)),
          yield: parseFloat(portfolioYield.toFixed(2)),
          projectedIncome: parseFloat(totalProjectedIncome.toFixed(2)),
          standardDeviation: parseFloat((portfolioStdDev * 100).toFixed(2)),
          sharpeRatio: sharpeRatio ? parseFloat(sharpeRatio.toFixed(2)) : null,
          var95Daily: parseFloat(var95.toFixed(2))
        },

        // Historical returns
        returns: {
          year1: portfolioReturns.year1 ? parseFloat(portfolioReturns.year1.toFixed(2)) : null,
          year3: portfolioReturns.year3 ? parseFloat(portfolioReturns.year3.toFixed(2)) : null,
          year5: portfolioReturns.year5 ? parseFloat(portfolioReturns.year5.toFixed(2)) : null,
          year10: portfolioReturns.year10 ? parseFloat(portfolioReturns.year10.toFixed(2)) : null
        },

        // Concentration metrics
        concentration: {
          hhi: parseFloat(concentration.hhi.toFixed(0)),
          top5: parseFloat(concentration.top5.toFixed(2)),
          holdingCount: concentration.holdingCount,
          diversification: concentration.diversification
        },

        // Timestamp
        analyzedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('Portfolio analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze portfolio' });
  }
});

/**
 * POST /api/portfolio-manager/rebalance
 * Calculate rebalancing trades needed
 */
router.post('/rebalance', [
  body('currentHoldings').isArray(),
  body('targetAllocations').isArray({ min: 1 }),
  body('totalValue').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentHoldings, targetAllocations, totalValue } = req.body;

    logger.info(`[Portfolio Manager] Calculating rebalance for ${targetAllocations.length} targets`);

    // Calculate rebalancing deltas
    const deltas = PortfolioMath.calculateRebalancingDeltas(
      currentHoldings,
      targetAllocations,
      totalValue
    );

    // Calculate drift
    const drift = PortfolioMath.calculateDrift(currentHoldings, targetAllocations);

    // Fetch current prices for trade calculations
    const symbols = [...new Set([
      ...currentHoldings.map(h => h.symbol),
      ...targetAllocations.map(t => t.symbol)
    ])];

    const quotes = await MarketDataService.getQuotes(symbols);

    // Enrich deltas with trade details
    const trades = deltas.map(d => {
      const quote = quotes[d.symbol] || {};
      const price = quote.price || 0;
      const shares = price > 0 ? Math.abs(d.deltaValue) / price : 0;

      return {
        ...d,
        price,
        shares: parseFloat(shares.toFixed(4)),
        estimatedCost: Math.abs(d.deltaValue)
      };
    });

    // Calculate total trading needed
    const totalBuys = trades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estimatedCost, 0);
    const totalSells = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estimatedCost, 0);

    res.json({
      success: true,
      data: {
        drift: parseFloat(drift.toFixed(2)),
        trades,
        summary: {
          totalBuys: parseFloat(totalBuys.toFixed(2)),
          totalSells: parseFloat(totalSells.toFixed(2)),
          netCashFlow: parseFloat((totalSells - totalBuys).toFixed(2)),
          tradeCount: trades.length
        }
      }
    });
  } catch (err) {
    logger.error('Rebalance calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate rebalancing' });
  }
});

/**
 * POST /api/portfolio-manager/simulate
 * Simulate portfolio growth over time
 */
router.post('/simulate', [
  body('holdings').isArray({ min: 1 }),
  body('totalInvestment').isFloat({ min: 0 }),
  body('years').optional().isInt({ min: 1, max: 30 }),
  body('monthlyContribution').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { holdings, totalInvestment, years = 10, monthlyContribution = 0 } = req.body;

    logger.info(`[Portfolio Manager] Simulating ${years} year growth`);

    // Get current quotes for expected return estimation
    const symbols = holdings.map(h => h.symbol.toUpperCase());
    const quotes = await MarketDataService.getQuotes(symbols);

    // Estimate weighted average return (using dividend yield + assumed growth)
    let weightedReturn = 0;
    let totalWeight = 0;

    holdings.forEach(h => {
      const weight = parseFloat(h.allocation) || 0;
      const quote = quotes[h.symbol.toUpperCase()] || {};
      // Estimate: dividend yield + 5% real growth
      const estimatedReturn = ((quote.dividendYield || 0) / 100) + 0.05;
      weightedReturn += weight * estimatedReturn;
      totalWeight += weight;
    });

    const annualReturn = totalWeight > 0 ? weightedReturn / totalWeight : 0.07;
    const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;

    // Generate simulation data
    const simulation = [];
    let currentValue = totalInvestment;
    let totalContributed = totalInvestment;

    for (let month = 0; month <= years * 12; month++) {
      simulation.push({
        month,
        year: parseFloat((month / 12).toFixed(2)),
        portfolioValue: parseFloat(currentValue.toFixed(2)),
        totalContributed: parseFloat(totalContributed.toFixed(2)),
        gains: parseFloat((currentValue - totalContributed).toFixed(2))
      });

      // Apply monthly growth and contribution
      currentValue = currentValue * (1 + monthlyReturn) + monthlyContribution;
      totalContributed += monthlyContribution;
    }

    res.json({
      success: true,
      data: {
        assumptions: {
          initialInvestment: totalInvestment,
          monthlyContribution,
          annualReturn: parseFloat((annualReturn * 100).toFixed(2)),
          years
        },
        projection: {
          finalValue: parseFloat(currentValue.toFixed(2)),
          totalContributed: parseFloat(totalContributed.toFixed(2)),
          totalGains: parseFloat((currentValue - totalContributed).toFixed(2)),
          cagr: parseFloat((annualReturn * 100).toFixed(2))
        },
        timeline: simulation.filter((_, i) => i % 12 === 0 || i === simulation.length - 1)
      }
    });
  } catch (err) {
    logger.error('Simulation error:', err);
    res.status(500).json({ error: 'Failed to run simulation' });
  }
});

/**
 * POST /api/portfolio-manager/risk-return
 * Generate risk vs return data for scatter plot
 */
router.post('/risk-return', [
  body('holdings').isArray({ min: 1 }),
  body('holdings.*.symbol').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { holdings } = req.body;
    const symbols = holdings.map(h => h.symbol.toUpperCase());

    logger.info(`[Portfolio Manager] Generating risk-return data for ${symbols.length} holdings`);

    // Fetch data for each holding
    const dataPromises = symbols.map(async symbol => {
      try {
        const [quote, profile, history] = await Promise.all([
          MarketDataService.getQuote(symbol),
          MarketDataService.getCompanyProfile(symbol).catch(() => null),
          MarketDataService.getHistoricalPrices(symbol, 365).catch(() => null)
        ]);

        // Calculate 1-year return
        let return1Y = null;
        if (history && history.length > 0 && quote?.price) {
          const oldPrice = history[0]?.close;
          if (oldPrice) {
            return1Y = ((quote.price - oldPrice) / oldPrice) * 100;
          }
        }

        // Calculate volatility from historical data
        let volatility = null;
        if (history && history.length > 20) {
          const returns = [];
          for (let i = 1; i < history.length; i++) {
            const prevClose = history[i - 1].close;
            const currClose = history[i].close;
            if (prevClose && currClose) {
              returns.push((currClose - prevClose) / prevClose);
            }
          }
          if (returns.length > 0) {
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
            volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized
          }
        }

        return {
          symbol,
          name: quote?.name || profile?.name || symbol,
          return: return1Y ? parseFloat(return1Y.toFixed(2)) : null,
          volatility: volatility ? parseFloat(volatility.toFixed(2)) : null,
          beta: quote?.beta || profile?.beta || null,
          sector: profile?.sector || quote?.sector || 'Unknown'
        };
      } catch (e) {
        return { symbol, return: null, volatility: null };
      }
    });

    const riskReturnData = await Promise.all(dataPromises);

    // Add benchmark (SPY)
    const spyData = riskReturnData.find(d => d.symbol === 'SPY');
    const benchmark = spyData || {
      symbol: 'SPY',
      name: 'S&P 500 Benchmark',
      return: 10,
      volatility: 15,
      sector: 'Benchmark'
    };

    res.json({
      success: true,
      data: {
        holdings: riskReturnData.filter(d => d.return !== null && d.volatility !== null),
        benchmark
      }
    });
  } catch (err) {
    logger.error('Risk-return calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate risk-return data' });
  }
});

/**
 * POST /api/portfolio-manager/income-breakdown
 * Get income contribution by each holding
 */
router.post('/income-breakdown', [
  body('holdings').isArray({ min: 1 }),
  body('totalInvestment').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { holdings, totalInvestment } = req.body;
    const symbols = holdings.map(h => h.symbol.toUpperCase());

    logger.info(`[Portfolio Manager] Calculating income breakdown`);

    const quotes = await MarketDataService.getQuotes(symbols);

    const incomeData = holdings.map(h => {
      const symbol = h.symbol.toUpperCase();
      const quote = quotes[symbol] || {};
      const allocation = parseFloat(h.allocation) || 0;
      const dividendYield = quote.dividendYield || 0;
      const invested = (allocation / 100) * totalInvestment;
      const annualIncome = (dividendYield / 100) * invested;
      const quarterlyIncome = annualIncome / 4;

      return {
        symbol,
        name: quote.name || symbol,
        allocation,
        invested: parseFloat(invested.toFixed(2)),
        dividendYield: parseFloat(dividendYield.toFixed(2)),
        annualIncome: parseFloat(annualIncome.toFixed(2)),
        quarterlyIncome: parseFloat(quarterlyIncome.toFixed(2)),
        monthlyIncome: parseFloat((annualIncome / 12).toFixed(2))
      };
    }).sort((a, b) => b.annualIncome - a.annualIncome);

    const totalAnnualIncome = incomeData.reduce((s, d) => s + d.annualIncome, 0);

    res.json({
      success: true,
      data: {
        holdings: incomeData,
        totals: {
          annual: parseFloat(totalAnnualIncome.toFixed(2)),
          quarterly: parseFloat((totalAnnualIncome / 4).toFixed(2)),
          monthly: parseFloat((totalAnnualIncome / 12).toFixed(2))
        },
        portfolioYield: parseFloat(((totalAnnualIncome / totalInvestment) * 100).toFixed(2))
      }
    });
  } catch (err) {
    logger.error('Income breakdown error:', err);
    res.status(500).json({ error: 'Failed to calculate income breakdown' });
  }
});

/**
 * GET /api/portfolio-manager/watchlist-suggestions
 * Suggest investments based on current portfolio gaps
 */
router.post('/suggestions', [
  body('holdings').isArray(),
  body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive'])
], async (req, res) => {
  try {
    const { holdings, riskTolerance = 'moderate' } = req.body;

    // Calculate current allocation
    const currentAllocation = PortfolioMath.calculateAssetClassAllocation(holdings);
    const currentSectors = PortfolioMath.calculateSectorAllocation(holdings);

    // Target allocations by risk tolerance
    const targets = {
      conservative: { equity: 40, fixedIncome: 50, alternatives: 10 },
      moderate: { equity: 60, fixedIncome: 30, alternatives: 10 },
      aggressive: { equity: 80, fixedIncome: 10, alternatives: 10 }
    };

    const target = targets[riskTolerance];

    // Identify gaps
    const gaps = {
      equity: target.equity - currentAllocation.equity,
      fixedIncome: target.fixedIncome - currentAllocation.fixedIncome,
      alternatives: target.alternatives - currentAllocation.alternatives
    };

    // Suggest holdings based on gaps
    const suggestions = [];

    if (gaps.equity > 5) {
      suggestions.push(
        { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', reason: 'Broad US equity exposure', type: 'Equity' },
        { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', reason: 'International diversification', type: 'Equity' }
      );
    }

    if (gaps.fixedIncome > 5) {
      suggestions.push(
        { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', reason: 'Core fixed income allocation', type: 'Fixed Income' },
        { symbol: 'VCIT', name: 'Vanguard Intermediate-Term Corporate Bond ETF', reason: 'Investment-grade corporate bonds', type: 'Fixed Income' }
      );
    }

    if (gaps.alternatives > 3) {
      suggestions.push(
        { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', reason: 'Real estate exposure', type: 'Alternatives' },
        { symbol: 'GLD', name: 'SPDR Gold Shares', reason: 'Inflation hedge', type: 'Alternatives' }
      );
    }

    // Sector diversification suggestions
    const existingSectors = new Set(currentSectors.map(s => s.name));
    const missingCoreSectors = ['Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical']
      .filter(s => !existingSectors.has(s));

    res.json({
      success: true,
      data: {
        currentAllocation,
        targetAllocation: target,
        gaps,
        suggestions,
        missingSectors: missingCoreSectors,
        riskTolerance
      }
    });
  } catch (err) {
    logger.error('Suggestions error:', err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Helper functions

function determineAssetClass(symbol, profile) {
  const upperSymbol = symbol.toUpperCase();

  // Bond ETFs
  if (upperSymbol.includes('BND') || upperSymbol.includes('AGG') || upperSymbol.includes('TLT') ||
      upperSymbol.includes('LQD') || upperSymbol.includes('HYG') || upperSymbol.includes('VCIT')) {
    return 'Bonds';
  }

  // Alternatives
  if (upperSymbol.includes('GLD') || upperSymbol.includes('SLV') || upperSymbol.includes('VNQ') ||
      upperSymbol.includes('DBC') || upperSymbol.includes('USO')) {
    return 'Alternatives';
  }

  // Cash equivalents
  if (upperSymbol.includes('SHV') || upperSymbol.includes('BIL') || upperSymbol.includes('SGOV')) {
    return 'Cash';
  }

  // Check profile
  const sector = (profile?.sector || '').toLowerCase();
  if (sector.includes('bond') || sector.includes('fixed income')) return 'Bonds';
  if (sector.includes('real estate')) return 'Alternatives';

  return 'Equity';
}

function calculateHistoricalReturns(historicalData, currentPrice) {
  if (!historicalData || historicalData.length === 0 || !currentPrice) {
    return { year1: null, year3: null, year5: null, year10: null };
  }

  const sorted = [...historicalData].sort((a, b) => new Date(b.date) - new Date(a.date));

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());

  const findPriceAt = (targetDate) => {
    for (const item of sorted) {
      const itemDate = new Date(item.date);
      if (itemDate <= targetDate) {
        return item.close || item.adjClose;
      }
    }
    return null;
  };

  const calcReturn = (oldPrice) => {
    if (!oldPrice) return null;
    return ((currentPrice - oldPrice) / oldPrice * 100);
  };

  return {
    year1: calcReturn(findPriceAt(oneYearAgo)),
    year3: calcReturn(findPriceAt(threeYearsAgo)),
    year5: calcReturn(findPriceAt(fiveYearsAgo)),
    year10: calcReturn(findPriceAt(tenYearsAgo))
  };
}

module.exports = router;
