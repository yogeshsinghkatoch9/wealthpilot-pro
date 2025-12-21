const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
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

module.exports = router;
