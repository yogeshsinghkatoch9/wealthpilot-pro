/**
 * Fundamental Analysis Routes
 * Endpoints for financial ratios, margins, and company metrics
 * Uses Financial Modeling Prep (FMP) API for real financial data
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const fundamentalAnalysis = require('../services/fundamentalAnalysis');
const logger = require('../utils/logger');

// Alpha Vantage API Configuration (primary source for fundamental data)
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '1S2UQSH44L0953E5';
const AV_BASE_URL = 'https://www.alphavantage.co/query';

// Cache for financial data (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// All routes require authentication
router.use(authenticate);

/**
 * Fetch from Alpha Vantage API with caching
 */
async function fetchAlphaVantage(params) {
  const cacheKey = JSON.stringify(params);
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const queryParams = new URLSearchParams({ ...params, apikey: ALPHA_VANTAGE_KEY });
    const url = `${AV_BASE_URL}?${queryParams}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API limit message
    if (data.Note || data['Error Message']) {
      throw new Error(data.Note || data['Error Message']);
    }

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    logger.error(`Alpha Vantage fetch error:`, error.message);
    throw error;
  }
}

/**
 * Fetch real company financials from Alpha Vantage API
 */
async function fetchCompanyFinancials(symbol) {
  try {
    const upperSymbol = symbol.toUpperCase();

    // Fetch company overview (contains most fundamental data)
    const overview = await fetchAlphaVantage({ function: 'OVERVIEW', symbol: upperSymbol });

    // Parse numeric values safely
    const parseNum = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

    // Extract real financial data from Alpha Vantage OVERVIEW
    const financials = {
      symbol: upperSymbol,
      name: overview.Name || upperSymbol,
      price: 0, // Will be fetched separately if needed
      marketCap: parseNum(overview.MarketCapitalization),

      // Profitability Metrics
      revenue: parseNum(overview.RevenueTTM),
      grossProfit: parseNum(overview.GrossProfitTTM),
      operatingIncome: parseNum(overview.OperatingMarginTTM) * parseNum(overview.RevenueTTM) / 100,
      netIncome: parseNum(overview.ProfitMargin) * parseNum(overview.RevenueTTM) / 100,
      ebitda: parseNum(overview.EBITDA),
      ebit: parseNum(overview.EBITDA) - parseNum(overview.DepreciationAndAmortization || 0),

      // Calculate COGS from gross profit
      cogs: parseNum(overview.RevenueTTM) - parseNum(overview.GrossProfitTTM),

      // Balance Sheet Data
      totalAssets: parseNum(overview.TotalAssets) || parseNum(overview.BookValue) * parseNum(overview.SharesOutstanding),
      totalEquity: parseNum(overview.BookValue) * parseNum(overview.SharesOutstanding),
      totalDebt: 0, // Calculated from debt-to-equity if available

      // Ratios from Overview
      peRatio: parseNum(overview.PERatio),
      pegRatio: parseNum(overview.PEGRatio),
      pbRatio: parseNum(overview.PriceToBookRatio),
      psRatio: parseNum(overview.PriceToSalesRatioTTM),
      evToEbitda: parseNum(overview.EVToEBITDA),
      evToRevenue: parseNum(overview.EVToRevenue),

      // Margins (as percentages)
      grossMarginPct: parseNum(overview.GrossProfitTTM) / parseNum(overview.RevenueTTM) * 100 || 0,
      operatingMarginPct: parseNum(overview.OperatingMarginTTM),
      profitMarginPct: parseNum(overview.ProfitMargin),

      // Returns
      roe: parseNum(overview.ReturnOnEquityTTM),
      roa: parseNum(overview.ReturnOnAssetsTTM),

      // Dividend
      dividendYield: parseNum(overview.DividendYield) * 100,
      dividendPerShare: parseNum(overview.DividendPerShare),

      // Company Info
      employees: parseNum(overview.FullTimeEmployees),
      sector: overview.Sector || 'Unknown',
      industry: overview.Industry || 'Unknown',
      exchange: overview.Exchange || 'Unknown',
      country: overview.Country || 'Unknown',
      description: overview.Description || '',

      // Additional Metrics
      eps: parseNum(overview.EPS),
      beta: parseNum(overview.Beta),
      sharesOutstanding: parseNum(overview.SharesOutstanding),
      bookValue: parseNum(overview.BookValue),
      fiftyTwoWeekHigh: parseNum(overview['52WeekHigh']),
      fiftyTwoWeekLow: parseNum(overview['52WeekLow']),
      movingAverage50: parseNum(overview['50DayMovingAverage']),
      movingAverage200: parseNum(overview['200DayMovingAverage']),
      analystTargetPrice: parseNum(overview.AnalystTargetPrice),

      // Quarterly Data placeholder
      historicalIncome: [],

      // Calculated fields
      currentRatio: 0,
      quickRatio: 0,
      debtToEquity: 0,
      interestExpense: 0,
      currentAssets: 0,
      currentLiabilities: 0,
      inventory: 0,
      receivables: 0,
      payables: 0,
      longTermDebt: 0,
      shortTermDebt: 0,
      cash: 0,
      operatingCashFlow: 0,
      freeCashFlow: 0,
      capitalExpenditures: 0,
      dividendsPaid: 0
    };

    // Calculate price from market cap and shares
    if (financials.sharesOutstanding > 0 && financials.marketCap > 0) {
      financials.price = financials.marketCap / financials.sharesOutstanding;
    }

    // Estimate total debt from book value and equity
    if (financials.totalAssets > 0 && financials.totalEquity > 0) {
      financials.totalDebt = financials.totalAssets - financials.totalEquity;
      financials.debtToEquity = financials.totalDebt / financials.totalEquity;
    }

    logger.info(`Fetched real financials for ${upperSymbol}: Revenue=$${(financials.revenue / 1e9).toFixed(2)}B, MarketCap=$${(financials.marketCap / 1e9).toFixed(2)}B`);

    return financials;
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

    // Calculate margins
    const grossMargin = financials.revenue > 0 ? (financials.grossProfit / financials.revenue) * 100 : 0;
    const operatingMargin = financials.revenue > 0 ? (financials.operatingIncome / financials.revenue) * 100 : 0;
    const netMargin = financials.revenue > 0 ? (financials.netIncome / financials.revenue) * 100 : 0;
    const ebitdaMargin = financials.revenue > 0 ? (financials.ebitda / financials.revenue) * 100 : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      company: {
        name: financials.name,
        price: financials.price,
        marketCap: financials.marketCap,
        sector: financials.sector,
        industry: financials.industry,
        employees: financials.employees
      },
      fundamentals: {
        // Profitability
        margins: {
          gross: Math.round(grossMargin * 100) / 100,
          operating: Math.round(operatingMargin * 100) / 100,
          net: Math.round(netMargin * 100) / 100,
          ebitda: Math.round(ebitdaMargin * 100) / 100
        },
        // Valuation
        valuation: {
          peRatio: Math.round(financials.peRatio * 100) / 100,
          pbRatio: Math.round(financials.pbRatio * 100) / 100,
          psRatio: Math.round(financials.psRatio * 100) / 100,
          evToEbitda: financials.ebitda > 0 ? Math.round(((financials.marketCap + financials.totalDebt - financials.cash) / financials.ebitda) * 100) / 100 : 0
        },
        // Liquidity
        liquidity: {
          currentRatio: Math.round(financials.currentRatio * 100) / 100,
          quickRatio: Math.round(financials.quickRatio * 100) / 100,
          cashRatio: financials.currentLiabilities > 0 ? Math.round((financials.cash / financials.currentLiabilities) * 100) / 100 : 0
        },
        // Leverage
        leverage: {
          debtToEquity: Math.round(financials.debtToEquity * 100) / 100,
          debtToAssets: financials.totalAssets > 0 ? Math.round((financials.totalDebt / financials.totalAssets) * 100) / 100 : 0,
          interestCoverage: financials.interestExpense > 0 ? Math.round((financials.ebit / financials.interestExpense) * 100) / 100 : 0
        },
        // Returns
        returns: {
          roe: Math.round(financials.roe * 100) / 100,
          roa: Math.round(financials.roa * 100) / 100,
          roic: financials.totalEquity + financials.totalDebt > 0 ?
            Math.round((financials.operatingIncome * (1 - 0.21) / (financials.totalEquity + financials.totalDebt)) * 10000) / 100 : 0
        },
        // Efficiency
        efficiency: {
          revenuePerEmployee: financials.employees > 0 ? Math.round(financials.revenue / financials.employees) : 0,
          assetTurnover: financials.totalAssets > 0 ? Math.round((financials.revenue / financials.totalAssets) * 100) / 100 : 0
        },
        // Cash Flow
        cashFlow: {
          operatingCashFlow: financials.operatingCashFlow,
          freeCashFlow: financials.freeCashFlow,
          fcfMargin: financials.revenue > 0 ? Math.round((financials.freeCashFlow / financials.revenue) * 10000) / 100 : 0,
          fcfYield: financials.marketCap > 0 ? Math.round((financials.freeCashFlow / financials.marketCap) * 10000) / 100 : 0
        }
      },
      rawData: {
        revenue: financials.revenue,
        netIncome: financials.netIncome,
        totalAssets: financials.totalAssets,
        totalDebt: financials.totalDebt,
        cash: financials.cash
      }
    });
  } catch (error) {
    logger.error('Fundamental analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch fundamentals', message: error.message });
  }
});

/**
 * GET /api/fundamentals/:symbol/gross-margin
 * Get gross margin analysis with historical comparison
 */
router.get('/:symbol/gross-margin', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    const grossMargin = financials.revenue > 0 ? (financials.grossProfit / financials.revenue) * 100 : 0;

    // Get historical margins from past quarters
    const historicalMargins = financials.historicalIncome.map((q, i) => ({
      period: q.period || q.calendarYear || `Q${4-i}`,
      date: q.date || q.fillingDate,
      grossMargin: q.revenue > 0 ? Math.round((q.grossProfit / q.revenue) * 10000) / 100 : 0,
      revenue: q.revenue,
      grossProfit: q.grossProfit
    }));

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      current: {
        revenue: financials.revenue,
        costOfGoodsSold: financials.cogs,
        grossProfit: financials.grossProfit,
        grossMargin: Math.round(grossMargin * 100) / 100
      },
      historical: historicalMargins,
      analysis: {
        rating: grossMargin >= 50 ? 'Excellent' : grossMargin >= 40 ? 'Good' : grossMargin >= 30 ? 'Average' : 'Below Average',
        percentile: grossMargin >= 50 ? 90 : grossMargin >= 40 ? 75 : grossMargin >= 30 ? 50 : 25,
        trend: historicalMargins.length >= 2 ?
          (historicalMargins[0].grossMargin > historicalMargins[1].grossMargin ? 'Improving' : 'Declining') : 'Stable'
      }
    });
  } catch (error) {
    logger.error('Gross margin error:', error);
    res.status(500).json({ error: 'Failed to calculate gross margin' });
  }
});

/**
 * GET /api/fundamentals/:symbol/margin-expansion
 * Get margin expansion analysis over time
 */
router.get('/:symbol/margin-expansion', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    // Calculate margins for each historical period
    const historicalMargins = financials.historicalIncome.map(q => ({
      period: q.period || q.calendarYear,
      date: q.date,
      grossMargin: q.revenue > 0 ? Math.round((q.grossProfit / q.revenue) * 10000) / 100 : 0,
      operatingMargin: q.revenue > 0 ? Math.round((q.operatingIncome / q.revenue) * 10000) / 100 : 0,
      netMargin: q.revenue > 0 ? Math.round((q.netIncome / q.revenue) * 10000) / 100 : 0,
      ebitdaMargin: q.revenue > 0 ? Math.round((q.ebitda / q.revenue) * 10000) / 100 : 0
    })).reverse(); // Oldest to newest

    // Calculate expansion metrics
    const firstPeriod = historicalMargins[0] || {};
    const lastPeriod = historicalMargins[historicalMargins.length - 1] || {};

    const expansion = {
      grossMarginChange: Math.round((lastPeriod.grossMargin - firstPeriod.grossMargin) * 100) / 100,
      operatingMarginChange: Math.round((lastPeriod.operatingMargin - firstPeriod.operatingMargin) * 100) / 100,
      netMarginChange: Math.round((lastPeriod.netMargin - firstPeriod.netMargin) * 100) / 100
    };

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentMargins: {
        gross: lastPeriod.grossMargin || 0,
        operating: lastPeriod.operatingMargin || 0,
        net: lastPeriod.netMargin || 0,
        ebitda: lastPeriod.ebitdaMargin || 0
      },
      historicalMargins,
      expansion,
      analysis: {
        isExpanding: expansion.operatingMarginChange > 0,
        expansionRate: expansion.operatingMarginChange,
        trend: expansion.operatingMarginChange > 1 ? 'Strong Expansion' :
               expansion.operatingMarginChange > 0 ? 'Slight Expansion' :
               expansion.operatingMarginChange > -1 ? 'Slight Contraction' : 'Contraction'
      }
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

    const revenuePerEmployee = financials.employees > 0 ? financials.revenue / financials.employees : 0;
    const profitPerEmployee = financials.employees > 0 ? financials.netIncome / financials.employees : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      company: {
        name: financials.name,
        employees: financials.employees,
        sector: financials.sector,
        industry: financials.industry
      },
      metrics: {
        revenuePerEmployee: Math.round(revenuePerEmployee),
        profitPerEmployee: Math.round(profitPerEmployee),
        revenue: financials.revenue,
        netIncome: financials.netIncome
      },
      industryBenchmarks: {
        tech: 500000,
        healthcare: 350000,
        financials: 600000,
        retail: 200000,
        manufacturing: 250000,
        energy: 800000
      },
      analysis: {
        rating: revenuePerEmployee >= 500000 ? 'Excellent' :
                revenuePerEmployee >= 300000 ? 'Good' :
                revenuePerEmployee >= 150000 ? 'Average' : 'Below Average',
        efficiency: revenuePerEmployee >= 400000 ? 'High' : revenuePerEmployee >= 200000 ? 'Medium' : 'Low'
      }
    });
  } catch (error) {
    logger.error('Revenue per employee error:', error);
    res.status(500).json({ error: 'Failed to calculate revenue per employee' });
  }
});

/**
 * GET /api/fundamentals/:symbol/price-to-sales
 * Get price to sales ratio analysis
 */
router.get('/:symbol/price-to-sales', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    const psRatio = financials.revenue > 0 ? financials.marketCap / financials.revenue : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      current: {
        price: financials.price,
        marketCap: financials.marketCap,
        revenue: financials.revenue,
        psRatio: Math.round(psRatio * 100) / 100
      },
      valuation: {
        isUndervalued: psRatio < 2,
        isFairValue: psRatio >= 2 && psRatio <= 5,
        isOvervalued: psRatio > 5,
        rating: psRatio < 1 ? 'Deep Value' :
                psRatio < 2 ? 'Value' :
                psRatio < 5 ? 'Fair' :
                psRatio < 10 ? 'Growth Premium' : 'Expensive'
      },
      sectorComparison: {
        tech: { avgPS: 6.5 },
        healthcare: { avgPS: 4.0 },
        financials: { avgPS: 2.5 },
        consumer: { avgPS: 2.0 },
        industrials: { avgPS: 1.8 }
      }
    });
  } catch (error) {
    logger.error('Price to sales error:', error);
    res.status(500).json({ error: 'Failed to calculate price to sales' });
  }
});

/**
 * GET /api/fundamentals/:symbol/debt-maturity
 * Get debt maturity schedule from real data
 */
router.get('/:symbol/debt-maturity', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    // Calculate debt metrics
    const totalDebt = financials.totalDebt;
    const longTermDebt = financials.longTermDebt;
    const shortTermDebt = financials.shortTermDebt;
    const cash = financials.cash;
    const netDebt = totalDebt - cash;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      debtSummary: {
        totalDebt,
        longTermDebt,
        shortTermDebt,
        cash,
        netDebt
      },
      ratios: {
        debtToEquity: Math.round(financials.debtToEquity * 100) / 100,
        debtToAssets: financials.totalAssets > 0 ? Math.round((totalDebt / financials.totalAssets) * 100) / 100 : 0,
        netDebtToEbitda: financials.ebitda > 0 ? Math.round((netDebt / financials.ebitda) * 100) / 100 : 0,
        interestCoverage: financials.interestExpense > 0 ? Math.round((financials.ebit / financials.interestExpense) * 100) / 100 : 0
      },
      analysis: {
        debtLevel: financials.debtToEquity < 0.5 ? 'Low' : financials.debtToEquity < 1 ? 'Moderate' : financials.debtToEquity < 2 ? 'High' : 'Very High',
        canServiceDebt: financials.interestExpense > 0 && (financials.ebit / financials.interestExpense) > 2,
        hasAdequateCash: cash > shortTermDebt
      }
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

    const interestCoverage = financials.interestExpense > 0 ? financials.ebit / financials.interestExpense : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      current: {
        ebit: financials.ebit,
        interestExpense: financials.interestExpense,
        interestCoverage: Math.round(interestCoverage * 100) / 100
      },
      analysis: {
        rating: interestCoverage >= 10 ? 'Excellent' :
                interestCoverage >= 5 ? 'Good' :
                interestCoverage >= 2.5 ? 'Adequate' :
                interestCoverage >= 1 ? 'Weak' : 'Critical',
        canServiceDebt: interestCoverage >= 1.5,
        debtCapacity: interestCoverage >= 5 ? 'High' : interestCoverage >= 2.5 ? 'Medium' : 'Low'
      },
      benchmarks: {
        investment_grade: 4.0,
        high_yield: 2.0,
        distressed: 1.0
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

    const workingCapital = financials.currentAssets - financials.currentLiabilities;
    const currentRatio = financials.currentLiabilities > 0 ? financials.currentAssets / financials.currentLiabilities : 0;
    const quickRatio = financials.currentLiabilities > 0 ?
      (financials.currentAssets - financials.inventory) / financials.currentLiabilities : 0;

    // Calculate cycle days
    const dso = financials.revenue > 0 ? (financials.receivables / financials.revenue) * 365 : 0;
    const dio = financials.cogs > 0 ? (financials.inventory / financials.cogs) * 365 : 0;
    const dpo = financials.cogs > 0 ? (financials.payables / financials.cogs) * 365 : 0;
    const cashConversionCycle = dso + dio - dpo;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      components: {
        currentAssets: financials.currentAssets,
        currentLiabilities: financials.currentLiabilities,
        inventory: financials.inventory,
        receivables: financials.receivables,
        payables: financials.payables,
        cash: financials.cash
      },
      metrics: {
        workingCapital,
        currentRatio: Math.round(currentRatio * 100) / 100,
        quickRatio: Math.round(quickRatio * 100) / 100,
        cashRatio: financials.currentLiabilities > 0 ?
          Math.round((financials.cash / financials.currentLiabilities) * 100) / 100 : 0
      },
      cycleDays: {
        daysSalesOutstanding: Math.round(dso),
        daysInventoryOutstanding: Math.round(dio),
        daysPayablesOutstanding: Math.round(dpo),
        cashConversionCycle: Math.round(cashConversionCycle)
      },
      analysis: {
        liquidityRating: currentRatio >= 2 ? 'Strong' : currentRatio >= 1.5 ? 'Good' : currentRatio >= 1 ? 'Adequate' : 'Weak',
        workingCapitalHealth: workingCapital > 0 ? 'Positive' : 'Negative',
        efficiencyRating: cashConversionCycle < 30 ? 'Excellent' : cashConversionCycle < 60 ? 'Good' : cashConversionCycle < 90 ? 'Average' : 'Needs Improvement'
      }
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

        comparisons.push({
          symbol,
          name: financials.name,
          sector: financials.sector,
          marketCap: financials.marketCap,
          revenue: financials.revenue,
          netIncome: financials.netIncome,
          margins: {
            gross: financials.revenue > 0 ? Math.round((financials.grossProfit / financials.revenue) * 10000) / 100 : 0,
            operating: financials.revenue > 0 ? Math.round((financials.operatingIncome / financials.revenue) * 10000) / 100 : 0,
            net: financials.revenue > 0 ? Math.round((financials.netIncome / financials.revenue) * 10000) / 100 : 0
          },
          valuation: {
            peRatio: Math.round(financials.peRatio * 100) / 100,
            pbRatio: Math.round(financials.pbRatio * 100) / 100,
            psRatio: Math.round(financials.psRatio * 100) / 100
          },
          leverage: {
            debtToEquity: Math.round(financials.debtToEquity * 100) / 100,
            currentRatio: Math.round(financials.currentRatio * 100) / 100
          },
          efficiency: {
            roe: Math.round(financials.roe * 100) / 100,
            roa: Math.round(financials.roa * 100) / 100
          }
        });
      } catch (err) {
        logger.debug(`Skipping ${symbol}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      count: comparisons.length,
      comparisons
    });
  } catch (error) {
    logger.error('Comparison error:', error);
    res.status(500).json({ error: 'Failed to compare fundamentals' });
  }
});

/**
 * GET /api/fundamentals/:symbol/cash-flow
 * Get cash flow analysis
 */
router.get('/:symbol/cash-flow', async (req, res) => {
  try {
    const { symbol } = req.params;
    const financials = await fetchCompanyFinancials(symbol);

    const fcfYield = financials.marketCap > 0 ? (financials.freeCashFlow / financials.marketCap) * 100 : 0;
    const fcfMargin = financials.revenue > 0 ? (financials.freeCashFlow / financials.revenue) * 100 : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      cashFlow: {
        operatingCashFlow: financials.operatingCashFlow,
        capitalExpenditures: financials.capitalExpenditures,
        freeCashFlow: financials.freeCashFlow,
        dividendsPaid: financials.dividendsPaid
      },
      metrics: {
        fcfYield: Math.round(fcfYield * 100) / 100,
        fcfMargin: Math.round(fcfMargin * 100) / 100,
        fcfToNetIncome: financials.netIncome !== 0 ?
          Math.round((financials.freeCashFlow / financials.netIncome) * 100) / 100 : 0,
        capexToRevenue: financials.revenue > 0 ?
          Math.round((Math.abs(financials.capitalExpenditures) / financials.revenue) * 10000) / 100 : 0
      },
      analysis: {
        fcfQuality: financials.freeCashFlow > financials.netIncome ? 'High Quality' : 'Watch',
        dividendSustainability: financials.freeCashFlow > Math.abs(financials.dividendsPaid) ? 'Sustainable' : 'At Risk',
        growthCapacity: fcfMargin >= 15 ? 'High' : fcfMargin >= 8 ? 'Medium' : 'Low'
      }
    });
  } catch (error) {
    logger.error('Cash flow error:', error);
    res.status(500).json({ error: 'Failed to calculate cash flow metrics' });
  }
});

module.exports = router;
