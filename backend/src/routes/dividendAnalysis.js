/**
 * Dividend Analysis Routes
 * Endpoints for DRIP projections, yield analysis, payout ratios, and dividend screening
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dividendAnalysis = require('../services/dividendAnalysis');
const MarketDataService = require('../services/marketDataService');
const DividendDataFetcher = require('../services/dividendDataFetcher');
const PortfolioDataHelper = require('../services/portfolioDataHelper');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);
const dividendFetcher = new DividendDataFetcher();

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
 * Get dividend growth analysis using real dividend history from Alpha Vantage API
 */
router.get('/:symbol/growth', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    // Fetch real dividend history from Alpha Vantage API
    const dividendData = await dividendFetcher.fetchSymbolDividends(symbol.toUpperCase());

    // Return empty state if no dividend data available
    if (!dividendData || dividendData.length === 0) {
      return res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        name: quote.name || symbol,
        price: Math.round(quote.price * 100) / 100,
        message: 'No dividend history available for this symbol',
        dividendHistory: [],
        growthAnalysis: null
      });
    }

    // Transform API data to format expected by calculateDividendGrowth
    const dividendHistory = dividendData.map(d => ({
      date: d.ex_dividend_date,
      amount: d.dividend_amount
    }));

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
 * Project dividend income from user's holdings
 */
router.post('/income-projection', async (req, res) => {
  try {
    const { holdings, years = 10, growthRate = 0.05 } = req.body;

    // If holdings provided in request, use those
    if (holdings && Array.isArray(holdings) && holdings.length > 0) {
      // Enrich holdings with current dividend data
      const enrichedHoldings = [];

      for (const h of holdings) {
        let dividend = h.dividend;

        if (!dividend && h.symbol) {
          try {
            const quote = await marketData.getQuote(h.symbol.toUpperCase());
            if (quote) {
              dividend = quote.price * (quote.dividendYield || 0);
            }
          } catch (err) {
            dividend = 0; // No default - use real data only
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

      return res.json({
        success: true,
        ...projection
      });
    }

    // No holdings provided - return empty state
    return res.json({
      success: true,
      message: 'No holdings provided for income projection',
      assumptions: {
        growthRate: growthRate * 100,
        years
      },
      summary: {
        currentAnnualIncome: 0,
        projectedFinalIncome: 0,
        incomeGrowth: 0,
        totalIncomeOverPeriod: 0
      },
      projections: [],
      currentBreakdown: []
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
      return res.json({
        success: true,
        message: 'No stock data available',
        summary: {
          totalStocks: 0,
          avgYield: 0,
          medianYield: 0
        },
        distribution: {},
        bySector: {},
        rankedStocks: []
      });
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
 * Screen dividend stocks by criteria using real API data
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
          const peRatio = quote.peRatio || 0;
          const eps = peRatio > 0 ? quote.price / peRatio : 0;
          const dps = quote.price * (quote.dividendYield || 0);
          const payoutRatio = eps > 0 ? (dps / eps) * 100 : 0;

          // Fetch real dividend history from API for growth rate calculation
          let dividendGrowth = 0;
          let consecutiveYears = 0;

          try {
            const dividendData = await dividendFetcher.fetchSymbolDividends(symbol.toUpperCase());
            if (dividendData && dividendData.length >= 2) {
              // Transform to expected format and calculate growth
              const dividendHistory = dividendData.map(d => ({
                date: d.ex_dividend_date,
                amount: d.dividend_amount
              }));

              const growthAnalysis = dividendAnalysis.calculateDividendGrowth(dividendHistory);
              if (growthAnalysis && !growthAnalysis.error) {
                dividendGrowth = growthAnalysis.cagr || 0;
                consecutiveYears = growthAnalysis.consecutiveGrowthPeriods || 0;
              }
            }
          } catch (divErr) {
            // If dividend fetch fails, use 0 for growth metrics
            logger.debug(`Could not fetch dividend history for ${symbol}: ${divErr.message}`);
          }

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

    // Return empty state if no stocks fetched
    if (stocks.length === 0) {
      return res.json({
        success: true,
        message: 'No stock data available for screening',
        criteria,
        totalScanned: 0,
        matchingStocks: 0,
        stocks: []
      });
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
 * Get full dividend analysis for a symbol using real API data
 */
router.get('/:symbol/full', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const sharePrice = quote.price;
    const dividendYield = quote.dividendYield || 0;
    const peRatio = quote.peRatio || 0;
    const annualDividend = sharePrice * dividendYield;
    const eps = peRatio > 0 ? sharePrice / peRatio : 0;

    // Calculate yield and payout metrics
    const yieldAnalysis = dividendAnalysis.calculateDividendYield(annualDividend, sharePrice);
    const payoutAnalysis = dividendAnalysis.calculatePayoutRatio(annualDividend, eps);

    // Fetch real dividend history from Alpha Vantage API
    let growthAnalysis = null;
    let dividendHistory = [];

    try {
      const dividendData = await dividendFetcher.fetchSymbolDividends(symbol.toUpperCase());
      if (dividendData && dividendData.length >= 2) {
        // Transform API data to format expected by calculateDividendGrowth
        dividendHistory = dividendData.map(d => ({
          date: d.ex_dividend_date,
          amount: d.dividend_amount
        }));
        growthAnalysis = dividendAnalysis.calculateDividendGrowth(dividendHistory);
      }
    } catch (divErr) {
      logger.debug(`Could not fetch dividend history for ${symbol}: ${divErr.message}`);
    }

    // 10-year DRIP projection (uses real current data, projects forward)
    const dripProjection = annualDividend > 0
      ? dividendAnalysis.calculateDRIPProjection(100, sharePrice, annualDividend, 0.05, 0.07, 10)
      : null;

    // Determine dividend status based on real data
    const consecutiveGrowthPeriods = growthAnalysis?.consecutiveGrowthPeriods || 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      name: quote.name || symbol,
      price: Math.round(sharePrice * 100) / 100,
      marketCap: quote.marketCap,
      sector: quote.sector || 'Unknown',
      yield: yieldAnalysis,
      payout: payoutAnalysis,
      growth: growthAnalysis || {
        message: 'Insufficient dividend history for growth analysis',
        dividendHistory: []
      },
      dripProjection: dripProjection ? {
        summary: dripProjection.summary,
        assumptions: dripProjection.assumptions
      } : null,
      status: {
        isDividendPayer: annualDividend > 0,
        isDividendAristocrat: consecutiveGrowthPeriods >= 25,
        isDividendKing: consecutiveGrowthPeriods >= 50,
        sustainability: payoutAnalysis.sustainability,
        yieldRating: yieldAnalysis.rating
      }
    });
  } catch (error) {
    logger.error('Full dividend analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate dividend analysis' });
  }
});

/**
 * GET /api/dividend-analysis/portfolio/:portfolioId
 * Get dividend analysis for user's portfolio holdings
 */
router.get('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.id;

    // Get user's portfolio holdings
    const portfolios = PortfolioDataHelper.getPortfolios(userId, portfolioId);

    if (!portfolios || portfolios.length === 0) {
      return res.json({
        success: true,
        message: 'No portfolio found',
        holdings: [],
        summary: {
          totalAnnualDividends: 0,
          portfolioYield: 0,
          dividendPayingHoldings: 0,
          totalHoldings: 0
        }
      });
    }

    const portfolio = portfolios[0];
    const holdings = portfolio.holdings || [];

    if (holdings.length === 0) {
      return res.json({
        success: true,
        portfolioId,
        portfolioName: portfolio.name,
        message: 'No holdings in portfolio',
        holdings: [],
        summary: {
          totalAnnualDividends: 0,
          portfolioYield: 0,
          dividendPayingHoldings: 0,
          totalHoldings: 0
        }
      });
    }

    // Analyze dividends for each holding
    const holdingAnalysis = [];
    let totalAnnualDividends = 0;
    let totalMarketValue = 0;

    for (const holding of holdings) {
      try {
        const quote = await marketData.getQuote(holding.symbol);
        if (quote) {
          const dividendYield = quote.dividendYield || 0;
          const annualDividendPerShare = quote.price * dividendYield;
          const annualDividendIncome = annualDividendPerShare * holding.shares;
          const marketValue = quote.price * holding.shares;

          totalAnnualDividends += annualDividendIncome;
          totalMarketValue += marketValue;

          holdingAnalysis.push({
            symbol: holding.symbol,
            shares: holding.shares,
            currentPrice: quote.price,
            marketValue,
            dividendYield: Math.round(dividendYield * 10000) / 100,
            annualDividendPerShare: Math.round(annualDividendPerShare * 100) / 100,
            annualDividendIncome: Math.round(annualDividendIncome * 100) / 100,
            quarterlyIncome: Math.round((annualDividendIncome / 4) * 100) / 100,
            monthlyIncome: Math.round((annualDividendIncome / 12) * 100) / 100
          });
        }
      } catch (err) {
        logger.debug(`Could not analyze ${holding.symbol}: ${err.message}`);
      }
    }

    const portfolioYield = totalMarketValue > 0
      ? (totalAnnualDividends / totalMarketValue) * 100
      : 0;

    res.json({
      success: true,
      portfolioId,
      portfolioName: portfolio.name,
      holdings: holdingAnalysis.sort((a, b) => b.annualDividendIncome - a.annualDividendIncome),
      summary: {
        totalAnnualDividends: Math.round(totalAnnualDividends * 100) / 100,
        monthlyDividendIncome: Math.round((totalAnnualDividends / 12) * 100) / 100,
        quarterlyDividendIncome: Math.round((totalAnnualDividends / 4) * 100) / 100,
        portfolioYield: Math.round(portfolioYield * 100) / 100,
        dividendPayingHoldings: holdingAnalysis.filter(h => h.annualDividendIncome > 0).length,
        totalHoldings: holdingAnalysis.length,
        totalMarketValue: Math.round(totalMarketValue * 100) / 100
      }
    });
  } catch (error) {
    logger.error('Portfolio dividend analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze portfolio dividends' });
  }
});

module.exports = router;
