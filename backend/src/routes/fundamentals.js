/**
 * Fundamental Analysis Routes
 * Endpoints for financial ratios, margins, and company metrics
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const fundamentalAnalysis = require('../services/fundamentalAnalysis');
const MarketDataService = require('../services/marketDataService');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// All routes require authentication
router.use(authenticate);

/**
 * Helper to fetch company financials
 */
async function fetchCompanyFinancials(symbol) {
  try {
    // Get quote data for market cap
    const quote = await marketData.getQuote(symbol);

    // Get company profile and financials
    // In production, this would come from financial data APIs like FMP, Alpha Vantage, etc.
    // For now, we'll simulate reasonable financial data based on market cap

    const marketCap = quote?.marketCap || 1000000000;
    const price = quote?.price || 100;

    // Estimate financials based on typical ratios
    const revenue = marketCap * 0.4; // ~2.5x P/S
    const cogs = revenue * 0.55; // 45% gross margin
    const operatingIncome = revenue * 0.15; // 15% operating margin
    const netIncome = revenue * 0.10; // 10% net margin
    const employees = Math.round(revenue / 300000); // $300K revenue per employee

    const currentAssets = revenue * 0.3;
    const currentLiabilities = revenue * 0.2;
    const inventory = currentAssets * 0.3;
    const receivables = currentAssets * 0.4;
    const payables = currentLiabilities * 0.5;

    const totalDebt = marketCap * 0.2;
    const ebit = operatingIncome * 1.1;
    const interestExpense = totalDebt * 0.05;

    return {
      symbol: symbol.toUpperCase(),
      name: quote?.name || symbol,
      price,
      marketCap,
      revenue,
      cogs,
      operatingIncome,
      netIncome,
      employees,
      currentAssets,
      currentLiabilities,
      inventory,
      receivables,
      payables,
      totalDebt,
      ebit,
      interestExpense
    };
  } catch (error) {
    logger.error(`Failed to fetch financials for ${symbol}:`, error);
    throw error;
  }
}

/**
 * GET /api/fundamentals/:symbol
 * Get full fundamental analysis for a symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const analysis = fundamentalAnalysis.getFullAnalysis(financials);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      company: {
        name: financials.name,
        price: financials.price,
        marketCap: financials.marketCap
      },
      fundamentals: analysis
    });
  } catch (error) {
    logger.error('Fundamental analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate fundamentals' });
  }
});

/**
 * GET /api/fundamentals/:symbol/gross-margin
 * Get gross margin analysis
 */
router.get('/:symbol/gross-margin', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const grossMargin = fundamentalAnalysis.calculateGrossMargin(financials.revenue, financials.cogs);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      revenue: Math.round(financials.revenue),
      costOfGoodsSold: Math.round(financials.cogs),
      ...grossMargin,
      industryComparison: {
        sectorAvg: 35,
        percentile: grossMargin.grossMargin > 50 ? 90 : grossMargin.grossMargin > 40 ? 75 : grossMargin.grossMargin > 30 ? 50 : 25
      }
    });
  } catch (error) {
    logger.error('Gross margin error:', error);
    res.status(500).json({ error: 'Failed to calculate gross margin' });
  }
});

/**
 * GET /api/fundamentals/:symbol/margin-expansion
 * Get margin expansion analysis
 */
router.get('/:symbol/margin-expansion', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    // Generate historical margins (simulated quarterly data)
    const quarters = 8;
    const historicalMargins = [];
    let baseGross = 40;
    let baseOp = 12;
    let baseNet = 8;

    for (let i = 0; i < quarters; i++) {
      const variation = (Math.random() - 0.5) * 4; // Random variation
      const trend = i * 0.3; // Slight upward trend
      historicalMargins.push({
        period: `Q${(i % 4) + 1} ${2023 + Math.floor(i / 4)}`,
        grossMargin: Math.round((baseGross + trend + variation) * 100) / 100,
        operatingMargin: Math.round((baseOp + trend * 0.5 + variation * 0.5) * 100) / 100,
        netMargin: Math.round((baseNet + trend * 0.3 + variation * 0.3) * 100) / 100
      });
    }

    const expansion = fundamentalAnalysis.calculateMarginExpansion(historicalMargins);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentMargins: {
        gross: historicalMargins[historicalMargins.length - 1].grossMargin,
        operating: historicalMargins[historicalMargins.length - 1].operatingMargin,
        net: historicalMargins[historicalMargins.length - 1].netMargin
      },
      ...expansion
    });
  } catch (error) {
    logger.error('Margin expansion error:', error);
    res.status(500).json({ error: 'Failed to calculate margin expansion' });
  }
});

/**
 * GET /api/fundamentals/:symbol/revenue-per-employee
 * Get revenue per employee analysis
 */
router.get('/:symbol/revenue-per-employee', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const revPerEmp = fundamentalAnalysis.calculateRevenuePerEmployee(financials.revenue, financials.employees);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ...revPerEmp,
      industryBenchmarks: {
        tech: 400000,
        retail: 150000,
        manufacturing: 200000,
        services: 250000
      }
    });
  } catch (error) {
    logger.error('Revenue per employee error:', error);
    res.status(500).json({ error: 'Failed to calculate revenue per employee' });
  }
});

/**
 * GET /api/fundamentals/:symbol/price-to-sales
 * Get price to sales ratio
 */
router.get('/:symbol/price-to-sales', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const ps = fundamentalAnalysis.calculatePriceToSales(financials.marketCap, financials.revenue);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      price: financials.price,
      ...ps,
      historicalPS: {
        avg5Year: ps.psRatio * 0.9,
        high5Year: ps.psRatio * 1.5,
        low5Year: ps.psRatio * 0.5
      }
    });
  } catch (error) {
    logger.error('Price to sales error:', error);
    res.status(500).json({ error: 'Failed to calculate price to sales' });
  }
});

/**
 * GET /api/fundamentals/:symbol/debt-maturity
 * Get debt maturity schedule
 */
router.get('/:symbol/debt-maturity', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    // Generate debt schedule (simulated)
    const totalDebt = financials.totalDebt;
    const now = new Date();
    const debtSchedule = [
      { maturityDate: new Date(now.getFullYear() + 1, 3, 15).toISOString(), amount: totalDebt * 0.1, type: 'Senior Notes', interestRate: 4.5 },
      { maturityDate: new Date(now.getFullYear() + 2, 6, 1).toISOString(), amount: totalDebt * 0.15, type: 'Term Loan', interestRate: 5.0 },
      { maturityDate: new Date(now.getFullYear() + 3, 9, 30).toISOString(), amount: totalDebt * 0.2, type: 'Senior Notes', interestRate: 4.75 },
      { maturityDate: new Date(now.getFullYear() + 5, 12, 15).toISOString(), amount: totalDebt * 0.25, type: 'Bonds', interestRate: 5.25 },
      { maturityDate: new Date(now.getFullYear() + 7, 6, 1).toISOString(), amount: totalDebt * 0.3, type: 'Bonds', interestRate: 5.5 }
    ];

    const analysis = fundamentalAnalysis.calculateDebtMaturity(debtSchedule);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ...analysis
    });
  } catch (error) {
    logger.error('Debt maturity error:', error);
    res.status(500).json({ error: 'Failed to calculate debt maturity' });
  }
});

/**
 * GET /api/fundamentals/:symbol/interest-coverage
 * Get interest coverage ratio
 */
router.get('/:symbol/interest-coverage', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const coverage = fundamentalAnalysis.calculateInterestCoverage(financials.ebit, financials.interestExpense);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ...coverage,
      historical: {
        ttm: coverage.interestCoverage,
        lastYear: coverage.interestCoverage * 0.95,
        twoYearsAgo: coverage.interestCoverage * 0.9
      }
    });
  } catch (error) {
    logger.error('Interest coverage error:', error);
    res.status(500).json({ error: 'Failed to calculate interest coverage' });
  }
});

/**
 * GET /api/fundamentals/:symbol/working-capital
 * Get working capital analysis
 */
router.get('/:symbol/working-capital', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);
    const wc = fundamentalAnalysis.calculateWorkingCapital(
      financials.currentAssets,
      financials.currentLiabilities,
      financials.inventory,
      financials.receivables,
      financials.payables,
      financials.revenue,
      financials.cogs
    );

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      components: {
        currentAssets: Math.round(financials.currentAssets),
        currentLiabilities: Math.round(financials.currentLiabilities),
        inventory: Math.round(financials.inventory),
        receivables: Math.round(financials.receivables),
        payables: Math.round(financials.payables)
      },
      ...wc
    });
  } catch (error) {
    logger.error('Working capital error:', error);
    res.status(500).json({ error: 'Failed to calculate working capital' });
  }
});

/**
 * GET /api/fundamentals/compare
 * Compare fundamentals of multiple symbols
 */
router.get('/compare', async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ error: 'Symbols required (comma-separated)' });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).slice(0, 5);
    const comparisons = [];

    for (const symbol of symbolList) {
      try {
        const financials = await fetchCompanyFinancials(symbol);
        const grossMargin = fundamentalAnalysis.calculateGrossMargin(financials.revenue, financials.cogs);
        const ps = fundamentalAnalysis.calculatePriceToSales(financials.marketCap, financials.revenue);
        const coverage = fundamentalAnalysis.calculateInterestCoverage(financials.ebit, financials.interestExpense);
        const wc = fundamentalAnalysis.calculateWorkingCapital(
          financials.currentAssets, financials.currentLiabilities, financials.inventory,
          financials.receivables, financials.payables, financials.revenue, financials.cogs
        );

        comparisons.push({
          symbol,
          name: financials.name,
          marketCap: financials.marketCap,
          grossMargin: grossMargin.grossMargin,
          operatingMargin: (financials.operatingIncome / financials.revenue) * 100,
          netMargin: (financials.netIncome / financials.revenue) * 100,
          psRatio: ps.psRatio,
          currentRatio: wc.currentRatio,
          interestCoverage: coverage.interestCoverage
        });
      } catch (err) {
        logger.debug(`Skipping ${symbol}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      comparisons
    });
  } catch (error) {
    logger.error('Comparison error:', error);
    res.status(500).json({ error: 'Failed to compare fundamentals' });
  }
});

module.exports = router;
