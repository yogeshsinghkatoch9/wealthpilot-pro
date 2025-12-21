const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/investment-selector/search
 * Search for investments by ticker or name
 */
router.get('/search', [
  query('q').trim().notEmpty().isLength({ min: 1, max: 20 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { q } = req.query;
    logger.info(`[Investment Selector] Searching for: ${q}`);

    // Search using market data service
    const results = await MarketDataService.searchStocks(q);

    res.json({
      success: true,
      query: q,
      results: results.slice(0, 20) // Limit to 20 results
    });
  } catch (err) {
    logger.error('Investment search error:', err);
    res.status(500).json({ error: 'Failed to search investments' });
  }
});

/**
 * GET /api/investment-selector/details/:symbol
 * Get detailed information about an investment
 */
router.get('/details/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    logger.info(`[Investment Selector] Getting details for: ${symbol}`);

    // Get quote and profile data
    const [quote, profile] = await Promise.all([
      MarketDataService.getQuote(symbol),
      MarketDataService.getCompanyProfile(symbol).catch(() => null)
    ]);

    if (!quote || !quote.price) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    // Determine category and asset class
    const category = determineCategory(symbol, profile);
    const assetClass = determineAssetClass(profile);

    const investment = {
      symbol,
      name: quote.name || profile?.name || symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,

      // Category info
      category: category,
      assetClass: assetClass,

      // Fundamental data
      pe: quote.peRatio || profile?.peRatio || null,
      dividendYield: quote.dividendYield || profile?.dividendYield || 0,
      marketCap: quote.marketCap || profile?.marketCap || null,
      beta: profile?.beta || null,

      // 52-week range
      week52High: quote.week52High || profile?.week52High || null,
      week52Low: quote.week52Low || profile?.week52Low || null,

      // Additional info
      description: profile?.description || null,
      industry: profile?.industry || quote.industry || null,
      sector: profile?.sector || quote.sector || null,
      exchange: profile?.exchange || quote.exchange || null,

      // Volume and trading
      volume: quote.volume || null,
      avgVolume: quote.avgVolume || profile?.avgVolume || null,

      // Historical returns (will be calculated)
      returns: {
        ytd: null,
        year1: null,
        year3: null,
        year5: null,
        year10: null
      }
    };

    // Try to get historical returns
    try {
      const historicalData = await MarketDataService.getHistoricalPrices(symbol, 3650); // ~10 years
      if (historicalData && historicalData.length > 0) {
        investment.returns = calculateHistoricalReturns(historicalData, quote.price);
      }
    } catch (histErr) {
      logger.warn(`Could not get historical data for ${symbol}:`, histErr.message);
    }

    res.json({
      success: true,
      data: investment
    });
  } catch (err) {
    logger.error('Investment details error:', err);
    res.status(500).json({ error: 'Failed to get investment details' });
  }
});

/**
 * POST /api/investment-selector/analyze-portfolio
 * Analyze a portfolio of selected investments
 */
router.post('/analyze-portfolio', [
  body('investments').isArray({ min: 1 }),
  body('investments.*.symbol').trim().notEmpty(),
  body('investments.*.allocation').isFloat({ min: 0, max: 100 }),
  body('totalInvestment').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { investments, totalInvestment } = req.body;
    logger.info(`[Investment Selector] Analyzing portfolio with ${investments.length} investments`);

    // Validate total allocation
    const totalAllocation = investments.reduce((sum, inv) => sum + inv.allocation, 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      return res.status(400).json({ error: `Total allocation must equal 100% (current: ${totalAllocation.toFixed(2)}%)` });
    }

    // Get current data for all investments
    const symbols = investments.map(inv => inv.symbol.toUpperCase());
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate portfolio metrics
    let portfolioBeta = 0;
    let portfolioYield = 0;
    let totalIncome = 0;

    const portfolioDetails = investments.map(inv => {
      const symbol = inv.symbol.toUpperCase();
      const quote = quotes[symbol] || {};
      const investedAmount = (inv.allocation / 100) * totalInvestment;
      const shares = quote.price ? investedAmount / quote.price : 0;
      const projectedIncome = (quote.dividendYield || 0) / 100 * investedAmount;

      // Weighted contributions
      const weight = inv.allocation / 100;
      portfolioBeta += (quote.beta || 1) * weight;
      portfolioYield += (quote.dividendYield || 0) * weight;
      totalIncome += projectedIncome;

      return {
        symbol,
        name: quote.name || symbol,
        allocation: inv.allocation,
        investedAmount,
        shares: shares.toFixed(4),
        currentPrice: quote.price || 0,
        dividendYield: quote.dividendYield || 0,
        projectedIncome: projectedIncome.toFixed(2),
        beta: quote.beta || 1,
        pe: quote.peRatio || null,
        sector: quote.sector || 'Unknown'
      };
    });

    // Calculate allocation by asset class
    const allocationByClass = {
      equity: 0,
      fixedIncome: 0,
      other: 0
    };

    portfolioDetails.forEach(inv => {
      // Simple classification based on sector/name
      const symbol = inv.symbol;
      if (symbol.includes('BND') || symbol.includes('AGG') || symbol.includes('BOND')) {
        allocationByClass.fixedIncome += inv.allocation;
      } else if (symbol.includes('GLD') || symbol.includes('SLV') || symbol.includes('REIT')) {
        allocationByClass.other += inv.allocation;
      } else {
        allocationByClass.equity += inv.allocation;
      }
    });

    // Get historical returns for the portfolio
    let portfolioReturns = {
      year1: null,
      year3: null,
      year5: null,
      year10: null
    };

    try {
      // Calculate weighted portfolio returns
      const returnPromises = symbols.map(async (symbol) => {
        try {
          const hist = await MarketDataService.getHistoricalPrices(symbol, 3650);
          const quote = quotes[symbol];
          if (hist && hist.length > 0 && quote?.price) {
            return { symbol, returns: calculateHistoricalReturns(hist, quote.price) };
          }
        } catch (e) {
          return null;
        }
        return null;
      });

      const allReturns = await Promise.all(returnPromises);

      // Calculate weighted returns
      let year1Sum = 0, year3Sum = 0, year5Sum = 0, year10Sum = 0;
      let year1Weight = 0, year3Weight = 0, year5Weight = 0, year10Weight = 0;

      allReturns.forEach((ret, idx) => {
        if (ret && ret.returns) {
          const weight = investments[idx].allocation / 100;
          if (ret.returns.year1 !== null) { year1Sum += ret.returns.year1 * weight; year1Weight += weight; }
          if (ret.returns.year3 !== null) { year3Sum += ret.returns.year3 * weight; year3Weight += weight; }
          if (ret.returns.year5 !== null) { year5Sum += ret.returns.year5 * weight; year5Weight += weight; }
          if (ret.returns.year10 !== null) { year10Sum += ret.returns.year10 * weight; year10Weight += weight; }
        }
      });

      portfolioReturns = {
        year1: year1Weight > 0 ? (year1Sum / year1Weight).toFixed(2) : null,
        year3: year3Weight > 0 ? (year3Sum / year3Weight).toFixed(2) : null,
        year5: year5Weight > 0 ? (year5Sum / year5Weight).toFixed(2) : null,
        year10: year10Weight > 0 ? (year10Sum / year10Weight).toFixed(2) : null
      };
    } catch (retErr) {
      logger.warn('Could not calculate portfolio returns:', retErr.message);
    }

    res.json({
      success: true,
      data: {
        totalInvestment,
        totalAllocation: totalAllocation.toFixed(2),

        // Allocation breakdown
        allocation: {
          equity: allocationByClass.equity.toFixed(2),
          fixedIncome: allocationByClass.fixedIncome.toFixed(2),
          other: allocationByClass.other.toFixed(2)
        },

        // Portfolio metrics
        metrics: {
          beta: portfolioBeta.toFixed(2),
          yield: portfolioYield.toFixed(2),
          totalProjectedIncome: totalIncome.toFixed(2)
        },

        // Historical returns
        returns: portfolioReturns,

        // Individual investments
        investments: portfolioDetails
      }
    });
  } catch (err) {
    logger.error('Portfolio analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze portfolio' });
  }
});

/**
 * Helper: Determine investment category
 */
function determineCategory(symbol, profile) {
  const upperSymbol = symbol.toUpperCase();

  // Common ETF patterns
  if (upperSymbol.includes('SPY') || upperSymbol.includes('QQQ') ||
      upperSymbol.includes('IWM') || upperSymbol.includes('VTI') ||
      upperSymbol.includes('VOO') || upperSymbol.includes('IVV') ||
      upperSymbol.includes('EEM') || upperSymbol.includes('VEA') ||
      upperSymbol.includes('BND') || upperSymbol.includes('AGG') ||
      upperSymbol.includes('GLD') || upperSymbol.includes('SLV')) {
    return 'ETF';
  }

  // Mutual fund patterns (usually 5 letters ending in X)
  if (upperSymbol.length === 5 && upperSymbol.endsWith('X')) {
    return 'Mutual Fund';
  }

  // Check profile data
  if (profile?.isEtf || profile?.quoteType === 'ETF') {
    return 'ETF';
  }

  return 'Stock';
}

/**
 * Helper: Determine asset class
 */
function determineAssetClass(profile) {
  if (!profile) return 'Stocks';

  const sector = (profile.sector || '').toLowerCase();
  const industry = (profile.industry || '').toLowerCase();
  const name = (profile.name || '').toLowerCase();

  if (sector.includes('bond') || industry.includes('bond') || name.includes('bond') ||
      name.includes('treasury') || name.includes('fixed income')) {
    return 'Bonds';
  }

  if (sector.includes('real estate') || industry.includes('reit') || name.includes('reit')) {
    return 'Alt';
  }

  if (name.includes('gold') || name.includes('silver') || name.includes('commodity')) {
    return 'Alt';
  }

  return 'Stocks';
}

/**
 * Helper: Calculate historical returns
 */
function calculateHistoricalReturns(historicalData, currentPrice) {
  if (!historicalData || historicalData.length === 0 || !currentPrice) {
    return { ytd: null, year1: null, year3: null, year5: null, year10: null };
  }

  // Sort by date descending (most recent first)
  const sorted = [...historicalData].sort((a, b) => new Date(b.date) - new Date(a.date));

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
  const threeYearsAgo = new Date(now.setFullYear(now.getFullYear() - 2)); // Already -1
  const fiveYearsAgo = new Date(now.setFullYear(now.getFullYear() - 2)); // Already -3
  const tenYearsAgo = new Date(now.setFullYear(now.getFullYear() - 5)); // Already -5

  const findPriceAt = (targetDate) => {
    for (const item of sorted) {
      const itemDate = new Date(item.date);
      if (itemDate <= targetDate) {
        return item.close || item.price;
      }
    }
    return null;
  };

  const calcReturn = (oldPrice) => {
    if (!oldPrice) return null;
    return ((currentPrice - oldPrice) / oldPrice * 100);
  };

  return {
    ytd: calcReturn(findPriceAt(yearStart)),
    year1: calcReturn(findPriceAt(oneYearAgo)),
    year3: calcReturn(findPriceAt(threeYearsAgo)),
    year5: calcReturn(findPriceAt(fiveYearsAgo)),
    year10: calcReturn(findPriceAt(tenYearsAgo))
  };
}

// ============== SAVED PORTFOLIO ENDPOINTS ==============

/**
 * POST /api/investment-selector/save
 * Save a portfolio analysis
 */
router.post('/save', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('totalInvestment').isFloat({ min: 0 }),
  body('investments').isArray({ min: 1 }),
  body('investments.*.symbol').trim().notEmpty(),
  body('investments.*.allocation').isFloat({ min: 0, max: 100 }),
  body('allocation').optional().isObject(),
  body('metrics').optional().isObject(),
  body('returns').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { name, description, totalInvestment, investments, allocation, metrics, returns } = req.body;

    logger.info(`[Investment Selector] Saving portfolio "${name}" for user ${userId}`);

    // Check for duplicate name
    const existing = await prisma.savedPortfolioAnalysis.findFirst({
      where: {
        userId,
        name: { equals: name, mode: 'insensitive' }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'A portfolio with this name already exists' });
    }

    // Create saved portfolio
    const savedPortfolio = await prisma.savedPortfolioAnalysis.create({
      data: {
        userId,
        name,
        description: description || null,
        totalInvestment,
        equityAllocation: parseFloat(allocation?.equity) || 0,
        fixedIncomeAllocation: parseFloat(allocation?.fixedIncome) || 0,
        otherAllocation: parseFloat(allocation?.other) || 0,
        portfolioBeta: parseFloat(metrics?.beta) || null,
        portfolioYield: parseFloat(metrics?.yield) || null,
        projectedIncome: parseFloat(metrics?.totalProjectedIncome) || null,
        return1Year: parseFloat(returns?.year1) || null,
        return3Year: parseFloat(returns?.year3) || null,
        return5Year: parseFloat(returns?.year5) || null,
        return10Year: parseFloat(returns?.year10) || null,
        investments: JSON.stringify(investments)
      }
    });

    logger.info(`[Investment Selector] Portfolio saved with ID: ${savedPortfolio.id}`);

    res.json({
      success: true,
      data: {
        id: savedPortfolio.id,
        name: savedPortfolio.name,
        message: 'Portfolio saved successfully'
      }
    });
  } catch (err) {
    logger.error('Save portfolio error:', err);
    res.status(500).json({ error: 'Failed to save portfolio' });
  }
});

/**
 * GET /api/investment-selector/saved
 * Get all saved portfolio analyses for the current user
 */
router.get('/saved', async (req, res) => {
  try {
    const userId = req.user.id;
    logger.info(`[Investment Selector] Loading saved portfolios for user ${userId}`);

    const savedPortfolios = await prisma.savedPortfolioAnalysis.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        totalInvestment: true,
        equityAllocation: true,
        fixedIncomeAllocation: true,
        otherAllocation: true,
        portfolioBeta: true,
        portfolioYield: true,
        projectedIncome: true,
        return1Year: true,
        return3Year: true,
        return5Year: true,
        return10Year: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      count: savedPortfolios.length,
      data: savedPortfolios.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        totalInvestment: p.totalInvestment,
        allocation: {
          equity: p.equityAllocation,
          fixedIncome: p.fixedIncomeAllocation,
          other: p.otherAllocation
        },
        metrics: {
          beta: p.portfolioBeta,
          yield: p.portfolioYield,
          projectedIncome: p.projectedIncome
        },
        returns: {
          year1: p.return1Year,
          year3: p.return3Year,
          year5: p.return5Year,
          year10: p.return10Year
        },
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
    });
  } catch (err) {
    logger.error('Load saved portfolios error:', err);
    res.status(500).json({ error: 'Failed to load saved portfolios' });
  }
});

/**
 * GET /api/investment-selector/saved/:id
 * Get a specific saved portfolio analysis with full investment details
 */
router.get('/saved/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const portfolioId = req.params.id;

    logger.info(`[Investment Selector] Loading portfolio ${portfolioId} for user ${userId}`);

    const portfolio = await prisma.savedPortfolioAnalysis.findFirst({
      where: {
        id: portfolioId,
        userId
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Parse investments JSON
    let investments = [];
    try {
      investments = JSON.parse(portfolio.investments);
    } catch (e) {
      logger.warn('Failed to parse investments JSON:', e.message);
    }

    res.json({
      success: true,
      data: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        totalInvestment: portfolio.totalInvestment,
        allocation: {
          equity: portfolio.equityAllocation,
          fixedIncome: portfolio.fixedIncomeAllocation,
          other: portfolio.otherAllocation
        },
        metrics: {
          beta: portfolio.portfolioBeta,
          yield: portfolio.portfolioYield,
          projectedIncome: portfolio.projectedIncome
        },
        returns: {
          year1: portfolio.return1Year,
          year3: portfolio.return3Year,
          year5: portfolio.return5Year,
          year10: portfolio.return10Year
        },
        investments,
        createdAt: portfolio.createdAt,
        updatedAt: portfolio.updatedAt
      }
    });
  } catch (err) {
    logger.error('Load portfolio error:', err);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

/**
 * PUT /api/investment-selector/saved/:id
 * Update a saved portfolio analysis
 */
router.put('/saved/:id', [
  param('id').isUUID(),
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('totalInvestment').optional().isFloat({ min: 0 }),
  body('investments').optional().isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const portfolioId = req.params.id;
    const { name, description, totalInvestment, investments, allocation, metrics, returns } = req.body;

    logger.info(`[Investment Selector] Updating portfolio ${portfolioId} for user ${userId}`);

    // Check ownership
    const existing = await prisma.savedPortfolioAnalysis.findFirst({
      where: {
        id: portfolioId,
        userId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Check for duplicate name (if name changed)
    if (name && name !== existing.name) {
      const duplicate = await prisma.savedPortfolioAnalysis.findFirst({
        where: {
          userId,
          name: { equals: name, mode: 'insensitive' },
          id: { not: portfolioId }
        }
      });

      if (duplicate) {
        return res.status(400).json({ error: 'A portfolio with this name already exists' });
      }
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (totalInvestment !== undefined) updateData.totalInvestment = totalInvestment;
    if (investments) updateData.investments = JSON.stringify(investments);
    if (allocation) {
      updateData.equityAllocation = parseFloat(allocation.equity) || 0;
      updateData.fixedIncomeAllocation = parseFloat(allocation.fixedIncome) || 0;
      updateData.otherAllocation = parseFloat(allocation.other) || 0;
    }
    if (metrics) {
      updateData.portfolioBeta = parseFloat(metrics.beta) || null;
      updateData.portfolioYield = parseFloat(metrics.yield) || null;
      updateData.projectedIncome = parseFloat(metrics.totalProjectedIncome) || null;
    }
    if (returns) {
      updateData.return1Year = parseFloat(returns.year1) || null;
      updateData.return3Year = parseFloat(returns.year3) || null;
      updateData.return5Year = parseFloat(returns.year5) || null;
      updateData.return10Year = parseFloat(returns.year10) || null;
    }

    const updated = await prisma.savedPortfolioAnalysis.update({
      where: { id: portfolioId },
      data: updateData
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        message: 'Portfolio updated successfully'
      }
    });
  } catch (err) {
    logger.error('Update portfolio error:', err);
    res.status(500).json({ error: 'Failed to update portfolio' });
  }
});

/**
 * DELETE /api/investment-selector/saved/:id
 * Delete a saved portfolio analysis
 */
router.delete('/saved/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const portfolioId = req.params.id;

    logger.info(`[Investment Selector] Deleting portfolio ${portfolioId} for user ${userId}`);

    // Check ownership
    const existing = await prisma.savedPortfolioAnalysis.findFirst({
      where: {
        id: portfolioId,
        userId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    await prisma.savedPortfolioAnalysis.delete({
      where: { id: portfolioId }
    });

    res.json({
      success: true,
      message: 'Portfolio deleted successfully'
    });
  } catch (err) {
    logger.error('Delete portfolio error:', err);
    res.status(500).json({ error: 'Failed to delete portfolio' });
  }
});

/**
 * POST /api/investment-selector/saved/:id/convert
 * Convert a saved analysis to an actual portfolio with holdings
 */
router.post('/saved/:id/convert', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const portfolioId = req.params.id;

    logger.info(`[Investment Selector] Converting saved analysis ${portfolioId} to real portfolio`);

    // Get the saved analysis
    const savedAnalysis = await prisma.savedPortfolioAnalysis.findFirst({
      where: {
        id: portfolioId,
        userId
      }
    });

    if (!savedAnalysis) {
      return res.status(404).json({ error: 'Saved analysis not found' });
    }

    // Parse investments
    let investments = [];
    try {
      investments = JSON.parse(savedAnalysis.investments);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid investments data' });
    }

    // Create the real portfolio
    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: savedAnalysis.name,
        description: savedAnalysis.description || `Converted from Investment Selector analysis`,
        currency: 'USD',
        benchmark: 'SPY',
        cashBalance: 0
      }
    });

    // Create holdings for each investment
    const holdings = [];
    for (const inv of investments) {
      const shares = parseFloat(inv.shares) || 0;
      const price = parseFloat(inv.currentPrice) || 0;

      if (shares > 0) {
        const holding = await prisma.holding.create({
          data: {
            portfolioId: portfolio.id,
            symbol: inv.symbol,
            shares,
            avgCostBasis: price,
            sector: inv.sector || null,
            assetType: 'stock'
          }
        });
        holdings.push(holding);
      }
    }

    logger.info(`[Investment Selector] Created portfolio ${portfolio.id} with ${holdings.length} holdings`);

    res.json({
      success: true,
      data: {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        holdingsCount: holdings.length,
        message: 'Analysis converted to portfolio successfully'
      }
    });
  } catch (err) {
    logger.error('Convert to portfolio error:', err);
    res.status(500).json({ error: 'Failed to convert to portfolio' });
  }
});

module.exports = router;
