/**
 * Dividend Analysis Routes
 * Endpoints for DRIP projections, yield analysis, payout ratios, and dividend screening
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dividendAnalysis = require('../services/dividendAnalysis');
const MarketDataService = require('../services/marketDataService');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/dividend-analysis/:symbol/yield
 * Get dividend yield analysis for a symbol
 */
router.get('/:symbol/yield', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Get stock quote
    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Estimate annual dividend based on dividend yield or use default
    const dividendYield = quote.dividendYield || 0.02; // 2% default
    const sharePrice = quote.price;
    const annualDividend = sharePrice * dividendYield;

    const yieldAnalysis = dividendAnalysis.calculateDividendYield(annualDividend, sharePrice);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      price: Math.round(sharePrice * 100) / 100,
      ...yieldAnalysis
    });
  } catch (error) {
    logger.error('Dividend yield error:', error);
    res.status(500).json({ error: 'Failed to calculate dividend yield' });
  }
});

/**
 * GET /api/dividend-analysis/:symbol/payout-ratio
 * Get payout ratio analysis
 */
router.get('/:symbol/payout-ratio', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Estimate EPS and DPS from quote data
    const sharePrice = quote.price;
    const dividendYield = quote.dividendYield || 0.02;
    const peRatio = quote.peRatio || 20;

    const eps = sharePrice / peRatio;
    const dps = sharePrice * dividendYield;

    const payoutAnalysis = dividendAnalysis.calculatePayoutRatio(dps, eps);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      price: Math.round(sharePrice * 100) / 100,
      eps: Math.round(eps * 100) / 100,
      ...payoutAnalysis
    });
  } catch (error) {
    logger.error('Payout ratio error:', error);
    res.status(500).json({ error: 'Failed to calculate payout ratio' });
  }
});

/**
 * GET /api/dividend-analysis/:symbol/growth
 * Get dividend growth analysis
 */
router.get('/:symbol/growth', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Generate simulated dividend history (in production, this would come from a financial data API)
    const baseDiv = quote.price * (quote.dividendYield || 0.02) / 4; // Quarterly dividend
    const dividendHistory = [];
    const now = new Date();

    for (let i = 20; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - (i * 3));

      // Add some growth pattern with variation
      const growthFactor = Math.pow(1.05, (20 - i) / 4); // ~5% annual growth
      const variation = 1 + (Math.random() - 0.5) * 0.1;

      dividendHistory.push({
        date: date.toISOString().slice(0, 10),
        amount: Math.round(baseDiv * growthFactor * variation * 100) / 100
      });
    }

    const growthAnalysis = dividendAnalysis.calculateDividendGrowth(dividendHistory);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      price: Math.round(quote.price * 100) / 100,
      ...growthAnalysis
    });
  } catch (error) {
    logger.error('Dividend growth error:', error);
    res.status(500).json({ error: 'Failed to calculate dividend growth' });
  }
});

/**
 * POST /api/dividend-analysis/drip-projection
 * Calculate DRIP projection
 */
router.post('/drip-projection', async (req, res) => {
  try {
    const {
      symbol,
      initialShares = 100,
      dividendGrowthRate = 0.05,
      priceGrowthRate = 0.07,
      years = 10
    } = req.body;

    let sharePrice = 100;
    let annualDividend = 3;

    if (symbol) {
      const quote = await marketData.getQuote(symbol.toUpperCase());
      if (quote) {
        sharePrice = quote.price;
        annualDividend = sharePrice * (quote.dividendYield || 0.03);
      }
    }

    const projection = dividendAnalysis.calculateDRIPProjection(
      initialShares,
      sharePrice,
      annualDividend,
      dividendGrowthRate,
      priceGrowthRate,
      years
    );

    res.json({
      success: true,
      symbol: symbol ? symbol.toUpperCase() : 'Custom',
      ...projection
    });
  } catch (error) {
    logger.error('DRIP projection error:', error);
    res.status(500).json({ error: 'Failed to calculate DRIP projection' });
  }
});

/**
 * GET /api/dividend-analysis/drip/:symbol
 * Get DRIP projection for a specific symbol
 */
router.get('/drip/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { shares = 100, years = 10, dividendGrowth = 5, priceGrowth = 7 } = req.query;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const sharePrice = quote.price;
    const dividendYield = quote.dividendYield || 0.03;
    const annualDividend = sharePrice * dividendYield;

    const projection = dividendAnalysis.calculateDRIPProjection(
      parseInt(shares),
      sharePrice,
      annualDividend,
      parseFloat(dividendGrowth) / 100,
      parseFloat(priceGrowth) / 100,
      parseInt(years)
    );

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      currentPrice: Math.round(sharePrice * 100) / 100,
      currentDividend: Math.round(annualDividend * 100) / 100,
      currentYield: Math.round(dividendYield * 10000) / 100,
      ...projection
    });
  } catch (error) {
    logger.error('DRIP projection error:', error);
    res.status(500).json({ error: 'Failed to calculate DRIP projection' });
  }
});

/**
 * POST /api/dividend-analysis/income-projection
 * Project dividend income from holdings
 */
router.post('/income-projection', async (req, res) => {
  try {
    const { holdings, years = 10, growthRate = 0.05 } = req.body;

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return res.status(400).json({ error: 'Holdings array required' });
    }

    // Enrich holdings with current dividend data
    const enrichedHoldings = [];

    for (const h of holdings) {
      let dividend = h.dividend;

      if (!dividend && h.symbol) {
        try {
          const quote = await marketData.getQuote(h.symbol.toUpperCase());
          if (quote) {
            dividend = quote.price * (quote.dividendYield || 0.02);
          }
        } catch (err) {
          dividend = 2; // Default $2 annual dividend
        }
      }

      enrichedHoldings.push({
        symbol: h.symbol || 'Unknown',
        shares: h.shares || 0,
        dividend: dividend || 0,
        frequency: h.frequency || 'quarterly'
      });
    }

    const projection = dividendAnalysis.projectDividendIncome(
      enrichedHoldings,
      years,
      growthRate
    );

    res.json({
      success: true,
      ...projection
    });
  } catch (error) {
    logger.error('Income projection error:', error);
    res.status(500).json({ error: 'Failed to project dividend income' });
  }
});

/**
 * GET /api/dividend-analysis/yield-curve
 * Get yield curve comparison for dividend stocks
 */
router.get('/yield-curve', async (req, res) => {
  try {
    const { symbols } = req.query;

    // Default dividend stocks if none provided
    const stockSymbols = symbols
      ? symbols.split(',').map(s => s.trim().toUpperCase()).slice(0, 20)
      : ['JNJ', 'PG', 'KO', 'PEP', 'T', 'VZ', 'XOM', 'CVX', 'ABBV', 'MO'];

    const stocks = [];

    for (const symbol of stockSymbols) {
      try {
        const quote = await marketData.getQuote(symbol);
        if (quote) {
          const dividendYield = quote.dividendYield || 0;
          stocks.push({
            symbol,
            name: quote.name || symbol,
            price: quote.price,
            yield: Math.round(dividendYield * 10000) / 100,
            rating: dividendYield > 0.05 ? 'High Yield' : dividendYield > 0.03 ? 'Above Average' : dividendYield > 0.015 ? 'Average' : 'Low Yield',
            sector: quote.sector || 'Unknown'
          });
        }
      } catch (err) {
        logger.debug(`Could not fetch ${symbol}`);
      }
    }

    if (stocks.length === 0) {
      return res.status(404).json({ error: 'No stock data available' });
    }

    const yieldCurve = dividendAnalysis.calculateYieldCurve(stocks);

    res.json({
      success: true,
      ...yieldCurve
    });
  } catch (error) {
    logger.error('Yield curve error:', error);
    res.status(500).json({ error: 'Failed to calculate yield curve' });
  }
});

/**
 * POST /api/dividend-analysis/screen
 * Screen dividend stocks by criteria
 */
router.post('/screen', async (req, res) => {
  try {
    const {
      criteria = {},
      symbols
    } = req.body;

    // Default list of dividend stocks
    const stockSymbols = symbols || [
      'JNJ', 'PG', 'KO', 'PEP', 'T', 'VZ', 'XOM', 'CVX', 'ABBV', 'MO',
      'MMM', 'CL', 'GIS', 'K', 'SYY', 'ADM', 'CAG', 'HSY', 'MKC', 'SJM'
    ];

    const stocks = [];

    for (const symbol of stockSymbols) {
      try {
        const quote = await marketData.getQuote(symbol.toUpperCase());
        if (quote) {
          const dividendYield = (quote.dividendYield || 0) * 100;
          const peRatio = quote.peRatio || 20;
          const eps = quote.price / peRatio;
          const dps = quote.price * (quote.dividendYield || 0);
          const payoutRatio = eps > 0 ? (dps / eps) * 100 : 0;

          // Simulate growth rate and consecutive years (in production, from financial data API)
          const dividendGrowth = 3 + Math.random() * 7; // 3-10% growth
          const consecutiveYears = Math.floor(5 + Math.random() * 45); // 5-50 years

          stocks.push({
            symbol,
            name: quote.name || symbol,
            price: quote.price,
            yield: Math.round(dividendYield * 100) / 100,
            payoutRatio: Math.round(payoutRatio * 100) / 100,
            dividendGrowth: Math.round(dividendGrowth * 100) / 100,
            consecutiveYears,
            sector: quote.sector || 'Unknown'
          });
        }
      } catch (err) {
        logger.debug(`Could not fetch ${symbol}`);
      }
    }

    const screened = dividendAnalysis.screenDividendStocks(stocks, criteria);

    res.json({
      success: true,
      criteria,
      totalScanned: stocks.length,
      matchingStocks: screened.length,
      stocks: screened
    });
  } catch (error) {
    logger.error('Dividend screen error:', error);
    res.status(500).json({ error: 'Failed to screen dividend stocks' });
  }
});

/**
 * GET /api/dividend-analysis/:symbol/full
 * Get full dividend analysis for a symbol
 */
router.get('/:symbol/full', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const sharePrice = quote.price;
    const dividendYield = quote.dividendYield || 0.02;
    const peRatio = quote.peRatio || 20;
    const annualDividend = sharePrice * dividendYield;
    const eps = sharePrice / peRatio;

    // Calculate all metrics
    const yieldAnalysis = dividendAnalysis.calculateDividendYield(annualDividend, sharePrice);
    const payoutAnalysis = dividendAnalysis.calculatePayoutRatio(annualDividend, eps);

    // Generate dividend history for growth analysis
    const baseDiv = annualDividend / 4;
    const dividendHistory = [];
    const now = new Date();

    for (let i = 20; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - (i * 3));
      const growthFactor = Math.pow(1.05, (20 - i) / 4);
      const variation = 1 + (Math.random() - 0.5) * 0.1;

      dividendHistory.push({
        date: date.toISOString().slice(0, 10),
        amount: Math.round(baseDiv * growthFactor * variation * 100) / 100
      });
    }

    const growthAnalysis = dividendAnalysis.calculateDividendGrowth(dividendHistory);

    // 10-year DRIP projection
    const dripProjection = dividendAnalysis.calculateDRIPProjection(
      100, sharePrice, annualDividend, 0.05, 0.07, 10
    );

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      price: Math.round(sharePrice * 100) / 100,
      marketCap: quote.marketCap,
      sector: quote.sector || 'Unknown',
      yield: yieldAnalysis,
      payout: payoutAnalysis,
      growth: growthAnalysis,
      dripProjection: {
        summary: dripProjection.summary,
        assumptions: dripProjection.assumptions
      },
      status: {
        isDividendAristocrat: growthAnalysis.consecutiveGrowthPeriods >= 25,
        isDividendKing: growthAnalysis.consecutiveGrowthPeriods >= 50,
        sustainability: payoutAnalysis.sustainability,
        yieldRating: yieldAnalysis.rating
      }
    });
  } catch (error) {
    logger.error('Full dividend analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate dividend analysis' });
  }
});

module.exports = router;
