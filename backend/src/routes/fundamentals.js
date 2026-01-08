/**
 * Fundamental Analysis Routes
 * Endpoints for financial ratios, margins, and company metrics
 * Uses Financial Modeling Prep (FMP) API with Yahoo Finance fallback
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// FMP API Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || 'demo';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Cache configuration - 1 hour TTL for fundamental data (quarterly data doesn't change often)
const fundamentalCache = new Map();
const FUNDAMENTAL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch fundamentals from Yahoo Finance as fallback using yahoo-finance2 package
 * Uses quoteSummary for ratios/metrics and fundamentalsTimeSeries for financial statements
 */
async function fetchFromYahoo(symbol) {
  const cacheKey = `yahoo_fundamentals_${symbol.toUpperCase()}`;
  const cached = fundamentalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FUNDAMENTAL_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Fetch quoteSummary for ratios and metrics (doesn't include financial statements since Nov 2024)
    const [summaryResult, timeSeriesResult] = await Promise.all([
      yahooFinance.quoteSummary(symbol, {
        modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'assetProfile']
      }).catch(e => {
        logger.warn(`Yahoo quoteSummary failed for ${symbol}: ${e.message}`);
        return null;
      }),
      // Use fundamentalsTimeSeries for financial statement data
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: 'annual',
        period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), // 5 years ago
        period2: new Date()
      }).catch(e => {
        logger.warn(`Yahoo fundamentalsTimeSeries failed for ${symbol}: ${e.message}`);
        return [];
      })
    ]);

    if (!summaryResult && (!timeSeriesResult || timeSeriesResult.length === 0)) {
      return null;
    }

    const financials = summaryResult?.financialData || {};
    const keyStats = summaryResult?.defaultKeyStatistics || {};
    const summary = summaryResult?.summaryDetail || {};
    const profile = summaryResult?.assetProfile || {};

    // Extract latest financial statement data from time series
    const latestTS = timeSeriesResult && timeSeriesResult.length > 0 ? timeSeriesResult[0] : {};

    // Transform to match FMP format
    const transformed = {
      symbol: symbol.toUpperCase(),
      profile: {
        companyName: symbol,
        price: financials.currentPrice || summary.previousClose || 0,
        mktCap: summary.marketCap || 0,
        sector: profile.sector || 'Unknown',
        industry: profile.industry || 'Unknown',
        exchange: 'Yahoo',
        fullTimeEmployees: profile.fullTimeEmployees || 0,
        description: profile.longBusinessSummary || ''
      },
      ratios: {
        priceToEarningsRatio: keyStats.forwardPE || summary.trailingPE || 0,
        priceToBookRatio: keyStats.priceToBook || 0,
        priceToSalesRatio: keyStats.priceToSalesTrailing12Months || 0,
        returnOnEquity: (financials.returnOnEquity || 0) * 100,
        returnOnAssets: (financials.returnOnAssets || 0) * 100,
        debtToEquity: financials.debtToEquity || 0,
        currentRatio: financials.currentRatio || 0,
        quickRatio: financials.quickRatio || 0,
        grossProfitMargin: (financials.grossMargins || 0) * 100,
        operatingProfitMargin: (financials.operatingMargins || 0) * 100,
        netProfitMargin: (financials.profitMargins || 0) * 100
      },
      income: {
        revenue: latestTS.annualTotalRevenue || financials.totalRevenue || 0,
        grossProfit: latestTS.annualGrossProfit || 0,
        operatingIncome: latestTS.annualOperatingIncome || financials.operatingCashflow || 0,
        netIncome: latestTS.annualNetIncome || financials.freeCashflow || 0,
        ebitda: latestTS.annualEbitda || financials.ebitda || 0
      },
      balance: {
        totalAssets: latestTS.annualTotalAssets || 0,
        totalLiabilities: latestTS.annualTotalLiabilitiesNetMinorityInterest || 0,
        totalEquity: latestTS.annualStockholdersEquity || 0,
        cash: latestTS.annualCashAndCashEquivalents || 0,
        totalDebt: latestTS.annualTotalDebt || financials.totalDebt || 0
      },
      cashflow: {
        operatingCashflow: latestTS.annualOperatingCashFlow || financials.operatingCashflow || 0,
        freeCashflow: latestTS.annualFreeCashFlow || financials.freeCashflow || 0
      },
      growth: {
        revenueGrowth: (financials.revenueGrowth || 0) * 100,
        earningsGrowth: (financials.earningsGrowth || 0) * 100
      },
      historical: {
        income: (timeSeriesResult || []).slice(0, 5).map(ts => ({
          date: ts.date || ts.asOfDate || '',
          revenue: ts.annualTotalRevenue || 0,
          netIncome: ts.annualNetIncome || 0
        })),
        balance: (timeSeriesResult || []).slice(0, 5).map(ts => ({
          date: ts.date || ts.asOfDate || '',
          totalAssets: ts.annualTotalAssets || 0,
          totalEquity: ts.annualStockholdersEquity || 0
        }))
      },
      source: 'yahoo'
    };

    fundamentalCache.set(cacheKey, { data: transformed, timestamp: Date.now() });
    logger.info(`Yahoo Finance fundamentals success for ${symbol}`);
    return transformed;
  } catch (error) {
    logger.warn(`Yahoo Finance fundamentals error for ${symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Helper to make FMP API calls with caching
 */
async function fetchFromFMP(endpoint, cacheKey, cacheTTL = FUNDAMENTAL_CACHE_TTL) {
  // Check cache first
  const cached = fundamentalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    logger.debug(`FMP cache hit for ${cacheKey}`);
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${FMP_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${FMP_API_KEY}`;
    logger.debug(`FMP API call: ${endpoint}`);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API error messages
    if (data['Error Message'] || (typeof data === 'string' && data.includes('Error'))) {
      throw new Error(data['Error Message'] || data);
    }

    // Cache the result
    fundamentalCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    logger.error(`FMP API error for ${endpoint}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch company profile from FMP
 */
async function fetchCompanyProfile(symbol) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `profile_${upperSymbol}`;

  try {
    const data = await fetchFromFMP(`/profile/${upperSymbol}`, cacheKey);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (error) {
    logger.warn(`Failed to fetch profile for ${upperSymbol}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch key ratios from FMP
 */
async function fetchKeyRatios(symbol, period = 'annual') {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `ratios_${upperSymbol}_${period}`;

  try {
    const endpoint = `/ratios/${upperSymbol}?period=${period}&limit=5`;
    const data = await fetchFromFMP(endpoint, cacheKey);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`Failed to fetch ratios for ${upperSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch income statement from FMP
 */
async function fetchIncomeStatement(symbol, period = 'annual', limit = 5) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `income_${upperSymbol}_${period}_${limit}`;

  try {
    const endpoint = `/income-statement/${upperSymbol}?period=${period}&limit=${limit}`;
    const data = await fetchFromFMP(endpoint, cacheKey);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`Failed to fetch income statement for ${upperSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch balance sheet from FMP
 */
async function fetchBalanceSheet(symbol, period = 'annual', limit = 5) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `balance_${upperSymbol}_${period}_${limit}`;

  try {
    const endpoint = `/balance-sheet-statement/${upperSymbol}?period=${period}&limit=${limit}`;
    const data = await fetchFromFMP(endpoint, cacheKey);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`Failed to fetch balance sheet for ${upperSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch cash flow statement from FMP
 */
async function fetchCashFlowStatement(symbol, period = 'annual', limit = 5) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `cashflow_${upperSymbol}_${period}_${limit}`;

  try {
    const endpoint = `/cash-flow-statement/${upperSymbol}?period=${period}&limit=${limit}`;
    const data = await fetchFromFMP(endpoint, cacheKey);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`Failed to fetch cash flow for ${upperSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch financial growth metrics from FMP
 */
async function fetchFinancialGrowth(symbol, period = 'annual', limit = 5) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `growth_${upperSymbol}_${period}_${limit}`;

  try {
    const endpoint = `/financial-growth/${upperSymbol}?period=${period}&limit=${limit}`;
    const data = await fetchFromFMP(endpoint, cacheKey);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`Failed to fetch growth metrics for ${upperSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch comprehensive fundamental data for a symbol
 */
async function fetchComprehensiveFundamentals(symbol, period = 'annual') {
  const upperSymbol = symbol.toUpperCase();

  // Fetch all data in parallel for efficiency
  const [profile, ratios, income, balance, cashflow, growth] = await Promise.all([
    fetchCompanyProfile(upperSymbol),
    fetchKeyRatios(upperSymbol, period),
    fetchIncomeStatement(upperSymbol, period, 5),
    fetchBalanceSheet(upperSymbol, period, 5),
    fetchCashFlowStatement(upperSymbol, period, 5),
    fetchFinancialGrowth(upperSymbol, period, 5)
  ]);

  // Check if we have any data
  if (!profile && (!income || income.length === 0)) {
    return null;
  }

  const latestIncome = income[0] || {};
  const latestBalance = balance[0] || {};
  const latestCashflow = cashflow[0] || {};
  const latestRatios = ratios[0] || {};
  const latestGrowth = growth[0] || {};

  return {
    symbol: upperSymbol,
    profile,
    ratios: latestRatios,
    income: latestIncome,
    balance: latestBalance,
    cashflow: latestCashflow,
    growth: latestGrowth,
    historical: {
      income,
      balance,
      cashflow,
      ratios,
      growth
    }
  };
}

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/fundamentals/:symbol
 * Get full fundamental analysis for a symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;

    // Try FMP first, then Yahoo Finance as fallback
    let data = await fetchComprehensiveFundamentals(symbol, period);
    let source = 'fmp';

    if (!data) {
      logger.info(`FMP failed for ${symbol}, trying Yahoo Finance fallback`);
      data = await fetchFromYahoo(symbol);
      source = 'yahoo';
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'No fundamental data available for this symbol',
        symbol: symbol.toUpperCase()
      });
    }

    const { profile, ratios, income, balance, cashflow, growth } = data;

    // Extract key metrics
    const revenue = income.revenue || profile?.revenue || 0;
    const netIncome = income.netIncome || 0;
    const grossProfit = income.grossProfit || 0;
    const operatingIncome = income.operatingIncome || 0;
    const ebitda = income.ebitda || income.ebitdaRatio * revenue || 0;

    // Calculate margins
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
    const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period,
      company: {
        name: profile?.companyName || income.symbol || symbol,
        price: profile?.price || 0,
        marketCap: profile?.mktCap || 0,
        sector: profile?.sector || 'Unknown',
        industry: profile?.industry || 'Unknown',
        exchange: profile?.exchangeShortName || profile?.exchange || 'Unknown',
        employees: profile?.fullTimeEmployees || 0,
        description: profile?.description || '',
        website: profile?.website || '',
        ceo: profile?.ceo || '',
        country: profile?.country || ''
      },
      fundamentals: {
        // Profitability
        margins: {
          gross: Math.round(grossMargin * 100) / 100,
          operating: Math.round(operatingMargin * 100) / 100,
          net: Math.round(netMargin * 100) / 100,
          ebitda: Math.round(ebitdaMargin * 100) / 100
        },
        // Valuation Ratios
        valuation: {
          peRatio: Math.round((ratios.priceEarningsRatio || profile?.pe || 0) * 100) / 100,
          pbRatio: Math.round((ratios.priceToBookRatio || profile?.priceToBook || 0) * 100) / 100,
          psRatio: Math.round((ratios.priceToSalesRatio || profile?.priceToSales || 0) * 100) / 100,
          evToEbitda: Math.round((ratios.enterpriseValueMultiple || 0) * 100) / 100,
          evToRevenue: Math.round((ratios.evToSales || 0) * 100) / 100,
          pegRatio: Math.round((ratios.priceEarningsToGrowthRatio || 0) * 100) / 100
        },
        // Liquidity Ratios
        liquidity: {
          currentRatio: Math.round((ratios.currentRatio || 0) * 100) / 100,
          quickRatio: Math.round((ratios.quickRatio || 0) * 100) / 100,
          cashRatio: Math.round((ratios.cashRatio || 0) * 100) / 100
        },
        // Leverage/Solvency Ratios
        leverage: {
          debtToEquity: Math.round((ratios.debtEquityRatio || 0) * 100) / 100,
          debtToAssets: Math.round((ratios.debtRatio || 0) * 100) / 100,
          interestCoverage: Math.round((ratios.interestCoverage || 0) * 100) / 100,
          debtToCapital: Math.round((ratios.debtToCapital || 0) * 100) / 100
        },
        // Return Metrics
        returns: {
          roe: Math.round((ratios.returnOnEquity || 0) * 10000) / 100, // Convert to percentage
          roa: Math.round((ratios.returnOnAssets || 0) * 10000) / 100,
          roic: Math.round((ratios.returnOnCapitalEmployed || 0) * 10000) / 100,
          roce: Math.round((ratios.returnOnCapitalEmployed || 0) * 10000) / 100
        },
        // Growth Metrics
        growth: {
          revenueGrowth: Math.round((growth.revenueGrowth || 0) * 10000) / 100,
          epsGrowth: Math.round((growth.epsgrowth || growth.epsGrowth || 0) * 10000) / 100,
          netIncomeGrowth: Math.round((growth.netIncomeGrowth || 0) * 10000) / 100,
          assetGrowth: Math.round((growth.assetGrowth || 0) * 10000) / 100,
          bookValueGrowth: Math.round((growth.bookValueperShareGrowth || 0) * 10000) / 100
        },
        // Dividend Metrics
        dividends: {
          dividendYield: Math.round((ratios.dividendYield || profile?.lastDiv / profile?.price || 0) * 10000) / 100,
          dividendPerShare: profile?.lastDiv || 0,
          payoutRatio: Math.round((ratios.payoutRatio || 0) * 10000) / 100
        },
        // Efficiency Metrics
        efficiency: {
          assetTurnover: Math.round((ratios.assetTurnover || 0) * 100) / 100,
          inventoryTurnover: Math.round((ratios.inventoryTurnover || 0) * 100) / 100,
          receivablesTurnover: Math.round((ratios.receivablesTurnover || 0) * 100) / 100,
          payablesTurnover: Math.round((ratios.payablesTurnover || 0) * 100) / 100
        },
        // Per Share Metrics
        perShare: {
          eps: Math.round((income.eps || profile?.eps || 0) * 100) / 100,
          bookValue: Math.round((ratios.bookValuePerShare || profile?.bookValue || 0) * 100) / 100,
          freeCashFlowPerShare: Math.round((ratios.freeCashFlowPerShare || 0) * 100) / 100,
          operatingCashFlowPerShare: Math.round((ratios.operatingCashFlowPerShare || 0) * 100) / 100
        }
      },
      rawData: {
        revenue,
        netIncome,
        grossProfit,
        operatingIncome,
        ebitda,
        totalAssets: balance.totalAssets || 0,
        totalLiabilities: balance.totalLiabilities || 0,
        totalEquity: balance.totalStockholdersEquity || balance.totalEquity || 0,
        totalDebt: balance.totalDebt || 0,
        cash: balance.cashAndCashEquivalents || 0,
        operatingCashFlow: cashflow.operatingCashFlow || 0,
        freeCashFlow: cashflow.freeCashFlow || 0,
        capitalExpenditures: cashflow.capitalExpenditure || 0
      },
      lastUpdated: income.fillingDate || income.date || new Date().toISOString(),
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Fundamental analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fundamentals',
      message: error.message
    });
  }
});

/**
 * GET /api/fundamentals/:symbol/statements
 * Get financial statements (income, balance sheet, cash flow)
 */
router.get('/:symbol/statements', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual', limit = 5 } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const [income, balance, cashflow] = await Promise.all([
      fetchIncomeStatement(upperSymbol, period, limit),
      fetchBalanceSheet(upperSymbol, period, limit),
      fetchCashFlowStatement(upperSymbol, period, limit)
    ]);

    if (!income.length && !balance.length && !cashflow.length) {
      return res.status(404).json({
        success: false,
        error: 'No financial statement data available',
        symbol: upperSymbol
      });
    }

    res.json({
      success: true,
      symbol: upperSymbol,
      period,
      statements: {
        incomeStatement: income.map(stmt => ({
          date: stmt.date,
          period: stmt.period,
          revenue: stmt.revenue,
          costOfRevenue: stmt.costOfRevenue,
          grossProfit: stmt.grossProfit,
          operatingExpenses: stmt.operatingExpenses,
          operatingIncome: stmt.operatingIncome,
          netIncome: stmt.netIncome,
          eps: stmt.eps,
          epsDiluted: stmt.epsdiluted,
          ebitda: stmt.ebitda,
          interestExpense: stmt.interestExpense
        })),
        balanceSheet: balance.map(stmt => ({
          date: stmt.date,
          period: stmt.period,
          totalAssets: stmt.totalAssets,
          totalLiabilities: stmt.totalLiabilities,
          totalEquity: stmt.totalStockholdersEquity,
          totalDebt: stmt.totalDebt,
          netDebt: stmt.netDebt,
          cash: stmt.cashAndCashEquivalents,
          currentAssets: stmt.totalCurrentAssets,
          currentLiabilities: stmt.totalCurrentLiabilities,
          inventory: stmt.inventory,
          receivables: stmt.netReceivables,
          payables: stmt.accountPayables,
          longTermDebt: stmt.longTermDebt,
          shortTermDebt: stmt.shortTermDebt
        })),
        cashFlowStatement: cashflow.map(stmt => ({
          date: stmt.date,
          period: stmt.period,
          operatingCashFlow: stmt.operatingCashFlow,
          investingCashFlow: stmt.netCashUsedForInvestingActivites,
          financingCashFlow: stmt.netCashUsedProvidedByFinancingActivities,
          freeCashFlow: stmt.freeCashFlow,
          capitalExpenditure: stmt.capitalExpenditure,
          dividendsPaid: stmt.dividendsPaid,
          stockRepurchased: stmt.commonStockRepurchased,
          debtRepayment: stmt.debtRepayment
        }))
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Financial statements error:', error);
    res.status(500).json({ error: 'Failed to fetch financial statements' });
  }
});

/**
 * GET /api/fundamentals/:symbol/ratios
 * Get detailed financial ratios
 */
router.get('/:symbol/ratios', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const ratios = await fetchKeyRatios(upperSymbol, period);

    if (!ratios || ratios.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No ratio data available',
        symbol: upperSymbol
      });
    }

    const latest = ratios[0];

    res.json({
      success: true,
      symbol: upperSymbol,
      period,
      current: {
        // Valuation
        priceEarningsRatio: latest.priceEarningsRatio,
        priceToBookRatio: latest.priceToBookRatio,
        priceToSalesRatio: latest.priceToSalesRatio,
        priceToFreeCashFlowsRatio: latest.priceToFreeCashFlowsRatio,
        enterpriseValueMultiple: latest.enterpriseValueMultiple,
        evToSales: latest.evToSales,
        evToOperatingCashFlow: latest.evToOperatingCashFlow,
        evToFreeCashFlow: latest.evToFreeCashFlow,
        pegRatio: latest.priceEarningsToGrowthRatio,

        // Profitability
        grossProfitMargin: latest.grossProfitMargin,
        operatingProfitMargin: latest.operatingProfitMargin,
        netProfitMargin: latest.netProfitMargin,
        returnOnAssets: latest.returnOnAssets,
        returnOnEquity: latest.returnOnEquity,
        returnOnCapitalEmployed: latest.returnOnCapitalEmployed,

        // Liquidity
        currentRatio: latest.currentRatio,
        quickRatio: latest.quickRatio,
        cashRatio: latest.cashRatio,

        // Leverage
        debtRatio: latest.debtRatio,
        debtEquityRatio: latest.debtEquityRatio,
        debtToCapital: latest.debtToCapital,
        interestCoverage: latest.interestCoverage,

        // Efficiency
        assetTurnover: latest.assetTurnover,
        inventoryTurnover: latest.inventoryTurnover,
        receivablesTurnover: latest.receivablesTurnover,
        payablesTurnover: latest.payablesTurnover,

        // Dividend
        dividendYield: latest.dividendYield,
        dividendPayoutRatio: latest.payoutRatio,
        dividendPerShare: latest.dividendPerShare
      },
      historical: ratios.map(r => ({
        date: r.date,
        peRatio: r.priceEarningsRatio,
        pbRatio: r.priceToBookRatio,
        psRatio: r.priceToSalesRatio,
        currentRatio: r.currentRatio,
        debtToEquity: r.debtEquityRatio,
        roe: r.returnOnEquity,
        roa: r.returnOnAssets
      })),
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Ratios error:', error);
    res.status(500).json({ error: 'Failed to fetch ratios' });
  }
});

/**
 * GET /api/fundamentals/:symbol/growth
 * Get growth metrics
 */
router.get('/:symbol/growth', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const growth = await fetchFinancialGrowth(upperSymbol, period, 5);

    if (!growth || growth.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No growth data available',
        symbol: upperSymbol
      });
    }

    const latest = growth[0];

    res.json({
      success: true,
      symbol: upperSymbol,
      period,
      current: {
        revenueGrowth: Math.round((latest.revenueGrowth || 0) * 10000) / 100,
        grossProfitGrowth: Math.round((latest.grossProfitGrowth || 0) * 10000) / 100,
        operatingIncomeGrowth: Math.round((latest.operatingIncomeGrowth || 0) * 10000) / 100,
        netIncomeGrowth: Math.round((latest.netIncomeGrowth || 0) * 10000) / 100,
        epsGrowth: Math.round((latest.epsgrowth || latest.epsGrowth || 0) * 10000) / 100,
        epsDilutedGrowth: Math.round((latest.epsdilutedGrowth || 0) * 10000) / 100,
        freeCashFlowGrowth: Math.round((latest.freeCashFlowGrowth || 0) * 10000) / 100,
        assetGrowth: Math.round((latest.assetGrowth || 0) * 10000) / 100,
        debtGrowth: Math.round((latest.debtGrowth || 0) * 10000) / 100,
        bookValueGrowth: Math.round((latest.bookValueperShareGrowth || 0) * 10000) / 100,
        dividendGrowth: Math.round((latest.dividendsperShareGrowth || 0) * 10000) / 100
      },
      historical: growth.map(g => ({
        date: g.date,
        period: g.period,
        revenueGrowth: Math.round((g.revenueGrowth || 0) * 10000) / 100,
        netIncomeGrowth: Math.round((g.netIncomeGrowth || 0) * 10000) / 100,
        epsGrowth: Math.round((g.epsgrowth || g.epsGrowth || 0) * 10000) / 100
      })),
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Growth metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch growth metrics' });
  }
});

/**
 * GET /api/fundamentals/:symbol/gross-margin
 * Get gross margin analysis with historical comparison
 */
router.get('/:symbol/gross-margin', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const income = await fetchIncomeStatement(upperSymbol, period, 8);
    const profile = await fetchCompanyProfile(upperSymbol);

    if (!income || income.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No income statement data available',
        symbol: upperSymbol
      });
    }

    const latest = income[0];
    const grossMargin = latest.revenue > 0 ? (latest.grossProfit / latest.revenue) * 100 : 0;

    const historicalMargins = income.map(stmt => ({
      date: stmt.date,
      period: stmt.period,
      revenue: stmt.revenue,
      costOfRevenue: stmt.costOfRevenue,
      grossProfit: stmt.grossProfit,
      grossMargin: stmt.revenue > 0 ? Math.round((stmt.grossProfit / stmt.revenue) * 10000) / 100 : 0
    }));

    // Calculate trend
    let trend = 'Stable';
    if (historicalMargins.length >= 2) {
      const diff = historicalMargins[0].grossMargin - historicalMargins[1].grossMargin;
      if (diff > 1) trend = 'Improving';
      else if (diff < -1) trend = 'Declining';
    }

    // Calculate 5-year average
    const avgMargin = historicalMargins.length > 0
      ? historicalMargins.reduce((sum, h) => sum + h.grossMargin, 0) / historicalMargins.length
      : 0;

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
      current: {
        revenue: latest.revenue,
        costOfGoodsSold: latest.costOfRevenue,
        grossProfit: latest.grossProfit,
        grossMargin: Math.round(grossMargin * 100) / 100
      },
      historical: historicalMargins,
      analysis: {
        rating: grossMargin >= 50 ? 'Excellent' : grossMargin >= 40 ? 'Good' : grossMargin >= 30 ? 'Average' : grossMargin >= 20 ? 'Below Average' : 'Poor',
        percentile: grossMargin >= 50 ? 90 : grossMargin >= 40 ? 75 : grossMargin >= 30 ? 50 : grossMargin >= 20 ? 25 : 10,
        trend,
        fiveYearAvg: Math.round(avgMargin * 100) / 100,
        vs5YearAvg: Math.round((grossMargin - avgMargin) * 100) / 100
      },
      source: 'Financial Modeling Prep'
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
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const income = await fetchIncomeStatement(upperSymbol, period, 8);
    const profile = await fetchCompanyProfile(upperSymbol);

    if (!income || income.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data available',
        symbol: upperSymbol
      });
    }

    const historicalMargins = income.map(stmt => ({
      date: stmt.date,
      period: stmt.period,
      grossMargin: stmt.revenue > 0 ? Math.round((stmt.grossProfit / stmt.revenue) * 10000) / 100 : 0,
      operatingMargin: stmt.revenue > 0 ? Math.round((stmt.operatingIncome / stmt.revenue) * 10000) / 100 : 0,
      netMargin: stmt.revenue > 0 ? Math.round((stmt.netIncome / stmt.revenue) * 10000) / 100 : 0,
      ebitdaMargin: stmt.revenue > 0 && stmt.ebitda ? Math.round((stmt.ebitda / stmt.revenue) * 10000) / 100 : 0
    })).reverse(); // Oldest to newest

    const firstPeriod = historicalMargins[0] || {};
    const lastPeriod = historicalMargins[historicalMargins.length - 1] || {};

    const expansion = {
      grossMarginChange: Math.round((lastPeriod.grossMargin - firstPeriod.grossMargin) * 100) / 100,
      operatingMarginChange: Math.round((lastPeriod.operatingMargin - firstPeriod.operatingMargin) * 100) / 100,
      netMarginChange: Math.round((lastPeriod.netMargin - firstPeriod.netMargin) * 100) / 100
    };

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
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
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Margin expansion error:', error);
    res.status(500).json({ error: 'Failed to calculate margin expansion' });
  }
});

/**
 * GET /api/fundamentals/:symbol/price-to-sales
 * Get price to sales ratio analysis
 */
router.get('/:symbol/price-to-sales', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const [profile, ratios] = await Promise.all([
      fetchCompanyProfile(upperSymbol),
      fetchKeyRatios(upperSymbol, 'annual')
    ]);

    if (!profile && (!ratios || ratios.length === 0)) {
      return res.status(404).json({
        success: false,
        error: 'No data available',
        symbol: upperSymbol
      });
    }

    const latestRatios = ratios[0] || {};
    const psRatio = latestRatios.priceToSalesRatio || profile?.priceToSales || 0;
    const marketCap = profile?.mktCap || 0;
    const revenue = profile?.revenue || (psRatio > 0 ? marketCap / psRatio : 0);

    // Calculate 5-year average P/S
    const historicalPS = ratios.slice(0, 5).map(r => r.priceToSalesRatio || 0);
    const avgPS = historicalPS.length > 0
      ? historicalPS.reduce((a, b) => a + b, 0) / historicalPS.length
      : psRatio;

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
      current: {
        price: profile?.price || 0,
        marketCap,
        revenue,
        psRatio: Math.round(psRatio * 100) / 100
      },
      historical: ratios.map(r => ({
        date: r.date,
        psRatio: Math.round((r.priceToSalesRatio || 0) * 100) / 100
      })),
      valuation: {
        isUndervalued: psRatio < avgPS * 0.8,
        isFairValue: psRatio >= avgPS * 0.8 && psRatio <= avgPS * 1.2,
        isOvervalued: psRatio > avgPS * 1.2,
        rating: psRatio < 1 ? 'Deep Value' :
                psRatio < 2 ? 'Value' :
                psRatio < 5 ? 'Fair' :
                psRatio < 10 ? 'Growth Premium' : 'Expensive',
        fiveYearAvg: Math.round(avgPS * 100) / 100,
        vs5YearAvg: avgPS > 0 ? Math.round(((psRatio - avgPS) / avgPS) * 10000) / 100 : 0
      },
      sectorComparison: {
        tech: { avgPS: 6.5 },
        healthcare: { avgPS: 4.0 },
        financials: { avgPS: 2.5 },
        consumer: { avgPS: 2.0 },
        industrials: { avgPS: 1.8 }
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Price to sales error:', error);
    res.status(500).json({ error: 'Failed to calculate price to sales' });
  }
});

/**
 * GET /api/fundamentals/:symbol/interest-coverage
 * Get detailed interest coverage ratio with historical data
 */
router.get('/:symbol/interest-coverage', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const [income, ratios, profile] = await Promise.all([
      fetchIncomeStatement(upperSymbol, period, 5),
      fetchKeyRatios(upperSymbol, period),
      fetchCompanyProfile(upperSymbol)
    ]);

    if (!income || income.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data available',
        symbol: upperSymbol
      });
    }

    const latest = income[0];
    const latestRatios = ratios[0] || {};

    const ebit = latest.operatingIncome || 0;
    const interestExpense = Math.abs(latest.interestExpense || 0);

    // Calculate interest coverage
    let interestCoverage = null;
    if (interestExpense > 0) {
      interestCoverage = ebit / interestExpense;
    }

    // Historical data
    const historicalData = income.map(stmt => {
      const stmtEbit = stmt.operatingIncome || 0;
      const stmtInterest = Math.abs(stmt.interestExpense || 0);
      return {
        date: stmt.date,
        period: stmt.period,
        ebit: stmtEbit,
        interestExpense: stmtInterest,
        interestCoverage: stmtInterest > 0 ? Math.round((stmtEbit / stmtInterest) * 100) / 100 : null
      };
    });

    // Calculate 5-year average
    const validCoverages = historicalData.filter(h => h.interestCoverage !== null).map(h => h.interestCoverage);
    const fiveYearAvg = validCoverages.length > 0
      ? validCoverages.reduce((a, b) => a + b, 0) / validCoverages.length
      : null;

    // Determine rating
    let rating = 'N/A';
    if (interestExpense === 0) {
      rating = 'Debt-Free';
    } else if (interestCoverage !== null) {
      if (interestCoverage >= 10) rating = 'Excellent';
      else if (interestCoverage >= 5) rating = 'Good';
      else if (interestCoverage >= 3) rating = 'Adequate';
      else if (interestCoverage >= 1.5) rating = 'Weak';
      else if (interestCoverage > 0) rating = 'Distressed';
      else rating = 'Negative';
    }

    // Calculate trend
    let trend = 'Stable';
    if (validCoverages.length >= 2) {
      const diff = validCoverages[0] - validCoverages[1];
      if (diff > 1) trend = 'Improving';
      else if (diff < -1) trend = 'Declining';
    }

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
      current: {
        ebit,
        ebitda: latest.ebitda || 0,
        interestExpense,
        interestCoverage: interestCoverage !== null ? Math.round(interestCoverage * 100) / 100 : null,
        revenue: latest.revenue || 0,
        operatingIncome: latest.operatingIncome || 0
      },
      historical: historicalData,
      analysis: {
        rating,
        trend,
        fiveYearAvg: fiveYearAvg !== null ? Math.round(fiveYearAvg * 100) / 100 : null,
        canServiceDebt: interestCoverage !== null && interestCoverage >= 1.5,
        debtCapacity: interestCoverage === null ? 'N/A' :
                      interestCoverage >= 5 ? 'High' :
                      interestCoverage >= 2.5 ? 'Medium' : 'Low',
        riskLevel: interestCoverage === null ? 'N/A' :
                   interestCoverage < 1.5 ? 'High' :
                   interestCoverage < 3 ? 'Moderate' : 'Low'
      },
      benchmarks: {
        investmentGrade: 4.0,
        highYield: 2.0,
        distressed: 1.0,
        excellent: 10.0
      },
      source: 'Financial Modeling Prep'
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
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const [balance, ratios, profile] = await Promise.all([
      fetchBalanceSheet(upperSymbol, period, 5),
      fetchKeyRatios(upperSymbol, period),
      fetchCompanyProfile(upperSymbol)
    ]);

    if (!balance || balance.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No balance sheet data available',
        symbol: upperSymbol
      });
    }

    const latest = balance[0];
    const latestRatios = ratios[0] || {};

    const currentAssets = latest.totalCurrentAssets || 0;
    const currentLiabilities = latest.totalCurrentLiabilities || 0;
    const workingCapital = currentAssets - currentLiabilities;

    const currentRatio = latestRatios.currentRatio || (currentLiabilities > 0 ? currentAssets / currentLiabilities : 0);
    const quickRatio = latestRatios.quickRatio || 0;
    const cashRatio = latestRatios.cashRatio || 0;

    // Historical current ratios
    const historicalData = balance.map((stmt, idx) => ({
      date: stmt.date,
      period: stmt.period,
      currentAssets: stmt.totalCurrentAssets || 0,
      currentLiabilities: stmt.totalCurrentLiabilities || 0,
      workingCapital: (stmt.totalCurrentAssets || 0) - (stmt.totalCurrentLiabilities || 0),
      currentRatio: ratios[idx]?.currentRatio ||
        (stmt.totalCurrentLiabilities > 0 ? stmt.totalCurrentAssets / stmt.totalCurrentLiabilities : 0)
    }));

    // Calculate trend
    let trend = 'Stable';
    if (historicalData.length >= 2) {
      const diff = historicalData[0].currentRatio - historicalData[1].currentRatio;
      if (diff > 0.1) trend = 'Improving';
      else if (diff < -0.1) trend = 'Declining';
    }

    // Liquidity rating
    const getLiquidityRating = (ratio) => {
      if (ratio >= 2.5) return 'Excellent';
      if (ratio >= 1.5) return 'Strong';
      if (ratio >= 1.0) return 'Adequate';
      if (ratio >= 0.5) return 'Weak';
      return 'Critical';
    };

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
      components: {
        currentAssets,
        currentLiabilities,
        inventory: latest.inventory || 0,
        receivables: latest.netReceivables || 0,
        payables: latest.accountPayables || 0,
        cash: latest.cashAndCashEquivalents || 0
      },
      metrics: {
        workingCapital,
        currentRatio: Math.round(currentRatio * 100) / 100,
        quickRatio: Math.round(quickRatio * 100) / 100,
        cashRatio: Math.round(cashRatio * 100) / 100
      },
      historical: historicalData,
      analysis: {
        liquidityRating: getLiquidityRating(currentRatio),
        workingCapitalHealth: workingCapital > 0 ? 'Positive' : 'Negative',
        trend
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Working capital error:', error);
    res.status(500).json({ error: 'Failed to calculate working capital' });
  }
});

/**
 * GET /api/fundamentals/:symbol/debt-maturity
 * Get debt analysis
 */
router.get('/:symbol/debt-maturity', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const [balance, income, ratios, profile] = await Promise.all([
      fetchBalanceSheet(upperSymbol, period, 3),
      fetchIncomeStatement(upperSymbol, period, 3),
      fetchKeyRatios(upperSymbol, period),
      fetchCompanyProfile(upperSymbol)
    ]);

    if (!balance || balance.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No balance sheet data available',
        symbol: upperSymbol
      });
    }

    const latestBalance = balance[0];
    const latestIncome = income[0] || {};
    const latestRatios = ratios[0] || {};

    const totalDebt = latestBalance.totalDebt || 0;
    const longTermDebt = latestBalance.longTermDebt || 0;
    const shortTermDebt = latestBalance.shortTermDebt || 0;
    const cash = latestBalance.cashAndCashEquivalents || 0;
    const netDebt = latestBalance.netDebt || (totalDebt - cash);
    const ebitda = latestIncome.ebitda || 0;

    // Calculate ratios
    const debtToEquity = latestRatios.debtEquityRatio || 0;
    const debtToAssets = latestRatios.debtRatio || 0;
    const netDebtToEbitda = ebitda > 0 ? netDebt / ebitda : 0;
    const interestCoverage = latestRatios.interestCoverage || 0;

    // Determine risk level
    let debtLevel = 'Low';
    if (debtToEquity < 0.5) debtLevel = 'Low';
    else if (debtToEquity < 1) debtLevel = 'Moderate';
    else if (debtToEquity < 2) debtLevel = 'High';
    else debtLevel = 'Very High';

    res.json({
      success: true,
      symbol: upperSymbol,
      companyName: profile?.companyName || upperSymbol,
      debtSummary: {
        totalDebt,
        longTermDebt,
        shortTermDebt,
        cash,
        netDebt,
        ebitda
      },
      ratios: {
        debtToEquity: Math.round(debtToEquity * 100) / 100,
        debtToAssets: Math.round(debtToAssets * 100) / 100,
        netDebtToEbitda: Math.round(netDebtToEbitda * 10) / 10,
        interestCoverage: Math.round(interestCoverage * 100) / 100
      },
      analysis: {
        debtLevel,
        canServiceDebt: ebitda > 0 && netDebtToEbitda < 4,
        hasAdequateCash: cash > shortTermDebt
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Debt maturity error:', error);
    res.status(500).json({ error: 'Failed to calculate debt maturity' });
  }
});

/**
 * GET /api/fundamentals/:symbol/cash-flow
 * Get cash flow analysis
 */
router.get('/:symbol/cash-flow', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 'annual' } = req.query;
    const upperSymbol = symbol.toUpperCase();

    const [cashflow, income, profile] = await Promise.all([
      fetchCashFlowStatement(upperSymbol, period, 5),
      fetchIncomeStatement(upperSymbol, period, 5),
      fetchCompanyProfile(upperSymbol)
    ]);

    if (!cashflow || cashflow.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No cash flow data available',
        symbol: upperSymbol
      });
    }

    const latestCF = cashflow[0];
    const latestIncome = income[0] || {};

    const operatingCashFlow = latestCF.operatingCashFlow || 0;
    const capitalExpenditures = Math.abs(latestCF.capitalExpenditure || 0);
    const freeCashFlow = latestCF.freeCashFlow || (operatingCashFlow - capitalExpenditures);
    const dividendsPaid = Math.abs(latestCF.dividendsPaid || 0);
    const revenue = latestIncome.revenue || 0;
    const netIncome = latestIncome.netIncome || 0;
    const marketCap = profile?.mktCap || 0;

    const fcfYield = marketCap > 0 ? (freeCashFlow / marketCap) * 100 : 0;
    const fcfMargin = revenue > 0 ? (freeCashFlow / revenue) * 100 : 0;

    // Historical FCF data
    const historicalData = cashflow.map(stmt => ({
      date: stmt.date,
      period: stmt.period,
      operatingCashFlow: stmt.operatingCashFlow || 0,
      freeCashFlow: stmt.freeCashFlow || 0,
      capitalExpenditure: stmt.capitalExpenditure || 0
    }));

    res.json({
      success: true,
      symbol: upperSymbol,
      company: profile?.companyName || upperSymbol,
      cashFlow: {
        operatingCashFlow,
        capitalExpenditures: -capitalExpenditures,
        freeCashFlow,
        dividendsPaid: -dividendsPaid,
        stockRepurchased: latestCF.commonStockRepurchased || 0,
        debtRepayment: latestCF.debtRepayment || 0
      },
      metrics: {
        fcfYield: Math.round(fcfYield * 100) / 100,
        fcfMargin: Math.round(fcfMargin * 100) / 100,
        fcfToNetIncome: netIncome !== 0 ? Math.round((freeCashFlow / netIncome) * 100) / 100 : 0,
        capexToRevenue: revenue > 0 ? Math.round((capitalExpenditures / revenue) * 10000) / 100 : 0,
        dividendCoverage: dividendsPaid > 0 ? Math.round((freeCashFlow / dividendsPaid) * 100) / 100 : 0
      },
      historical: historicalData,
      analysis: {
        fcfQuality: freeCashFlow > netIncome ? 'High Quality' : 'Watch',
        dividendSustainability: freeCashFlow > dividendsPaid ? 'Sustainable' : 'At Risk',
        growthCapacity: fcfMargin >= 15 ? 'High' : fcfMargin >= 8 ? 'Medium' : 'Low'
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Cash flow error:', error);
    res.status(500).json({ error: 'Failed to calculate cash flow metrics' });
  }
});

/**
 * GET /api/fundamentals/:symbol/revenue-per-employee
 * Get revenue per employee analysis
 */
router.get('/:symbol/revenue-per-employee', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const [profile, income] = await Promise.all([
      fetchCompanyProfile(upperSymbol),
      fetchIncomeStatement(upperSymbol, 'annual', 1)
    ]);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'No company data available',
        symbol: upperSymbol
      });
    }

    const employees = profile.fullTimeEmployees || 0;
    const revenue = income[0]?.revenue || profile.revenue || 0;
    const netIncome = income[0]?.netIncome || 0;

    const revenuePerEmployee = employees > 0 ? revenue / employees : 0;
    const profitPerEmployee = employees > 0 ? netIncome / employees : 0;

    res.json({
      success: true,
      symbol: upperSymbol,
      company: {
        name: profile.companyName || upperSymbol,
        employees,
        sector: profile.sector || 'Unknown',
        industry: profile.industry || 'Unknown'
      },
      metrics: {
        revenuePerEmployee: Math.round(revenuePerEmployee),
        profitPerEmployee: Math.round(profitPerEmployee),
        revenue,
        netIncome
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
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Revenue per employee error:', error);
    res.status(500).json({ error: 'Failed to calculate revenue per employee' });
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

    for (const sym of symbolList) {
      try {
        const [profile, ratios, income] = await Promise.all([
          fetchCompanyProfile(sym),
          fetchKeyRatios(sym, 'annual'),
          fetchIncomeStatement(sym, 'annual', 1)
        ]);

        if (!profile && (!income || income.length === 0)) continue;

        const latestRatios = ratios[0] || {};
        const latestIncome = income[0] || {};

        comparisons.push({
          symbol: sym,
          name: profile?.companyName || sym,
          sector: profile?.sector || 'Unknown',
          marketCap: profile?.mktCap || 0,
          revenue: latestIncome.revenue || 0,
          netIncome: latestIncome.netIncome || 0,
          margins: {
            gross: Math.round((latestRatios.grossProfitMargin || 0) * 10000) / 100,
            operating: Math.round((latestRatios.operatingProfitMargin || 0) * 10000) / 100,
            net: Math.round((latestRatios.netProfitMargin || 0) * 10000) / 100
          },
          valuation: {
            peRatio: Math.round((latestRatios.priceEarningsRatio || profile?.pe || 0) * 100) / 100,
            pbRatio: Math.round((latestRatios.priceToBookRatio || 0) * 100) / 100,
            psRatio: Math.round((latestRatios.priceToSalesRatio || 0) * 100) / 100
          },
          leverage: {
            debtToEquity: Math.round((latestRatios.debtEquityRatio || 0) * 100) / 100,
            currentRatio: Math.round((latestRatios.currentRatio || 0) * 100) / 100
          },
          efficiency: {
            roe: Math.round((latestRatios.returnOnEquity || 0) * 10000) / 100,
            roa: Math.round((latestRatios.returnOnAssets || 0) * 10000) / 100
          }
        });
      } catch (err) {
        logger.debug(`Skipping ${sym}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      count: comparisons.length,
      comparisons,
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Comparison error:', error);
    res.status(500).json({ error: 'Failed to compare fundamentals' });
  }
});

/**
 * GET /api/fundamentals/portfolio/interest-coverage
 * Portfolio-level interest coverage analysis for all holdings
 */
router.get('/portfolio/interest-coverage', authenticate, async (req, res) => {
  try {
    // Get user's portfolios and holdings
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    // Flatten all holdings
    const allHoldings = [];
    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        const existing = allHoldings.find(h => h.symbol === holding.symbol);
        if (existing) {
          existing.shares += Number(holding.shares);
        } else {
          allHoldings.push({
            symbol: holding.symbol,
            shares: Number(holding.shares),
            avgCostBasis: Number(holding.avgCostBasis)
          });
        }
      }
    }

    if (allHoldings.length === 0) {
      return res.json({
        success: true,
        portfolio: { avgCoverage: 0, medianCoverage: 0, overallRating: 'N/A' },
        holdings: [],
        summary: { strong: 0, adequate: 0, weak: 0, distressed: 0 }
      });
    }

    // Fetch interest coverage for each holding
    const holdingsCoverage = await Promise.all(allHoldings.map(async (holding) => {
      try {
        const [income, ratios, profile] = await Promise.all([
          fetchIncomeStatement(holding.symbol, 'annual', 3),
          fetchKeyRatios(holding.symbol, 'annual'),
          fetchCompanyProfile(holding.symbol)
        ]);

        const latestIncome = income[0] || {};
        const latestRatios = ratios[0] || {};

        const ebit = latestIncome.operatingIncome || 0;
        const interestExpense = Math.abs(latestIncome.interestExpense || 0);
        const interestCoverage = latestRatios.interestCoverage ||
          (interestExpense > 0 ? ebit / interestExpense : null);

        let rating = 'N/A';
        if (interestExpense === 0) rating = 'Debt-Free';
        else if (interestCoverage >= 10) rating = 'Excellent';
        else if (interestCoverage >= 5) rating = 'Good';
        else if (interestCoverage >= 3) rating = 'Adequate';
        else if (interestCoverage >= 1.5) rating = 'Weak';
        else rating = 'Distressed';

        return {
          symbol: holding.symbol,
          name: profile?.companyName || holding.symbol,
          shares: holding.shares,
          ebit,
          interestExpense,
          interestCoverage: interestCoverage !== null ? Math.round(interestCoverage * 100) / 100 : null,
          rating,
          source: 'Financial Modeling Prep'
        };
      } catch (err) {
        return {
          symbol: holding.symbol,
          name: holding.symbol,
          shares: holding.shares,
          interestCoverage: null,
          rating: 'N/A',
          error: err.message
        };
      }
    }));

    // Calculate portfolio-level metrics
    const validCoverages = holdingsCoverage
      .filter(h => h.interestCoverage !== null && h.interestCoverage > 0)
      .map(h => h.interestCoverage);

    const avgCoverage = validCoverages.length > 0
      ? validCoverages.reduce((a, b) => a + b, 0) / validCoverages.length
      : 0;

    const sortedCoverages = [...validCoverages].sort((a, b) => a - b);
    const medianCoverage = sortedCoverages.length > 0
      ? sortedCoverages[Math.floor(sortedCoverages.length / 2)]
      : 0;

    // Summary counts
    const summary = {
      strong: holdingsCoverage.filter(h => h.rating === 'Excellent' || h.rating === 'Good').length,
      adequate: holdingsCoverage.filter(h => h.rating === 'Adequate').length,
      weak: holdingsCoverage.filter(h => h.rating === 'Weak').length,
      distressed: holdingsCoverage.filter(h => h.rating === 'Distressed').length
    };

    const getPortfolioRating = (avg) => {
      if (avg >= 15) return 'Excellent';
      if (avg >= 8) return 'Strong';
      if (avg >= 4) return 'Adequate';
      if (avg >= 2) return 'Moderate Risk';
      return 'High Risk';
    };

    res.json({
      success: true,
      portfolio: {
        avgCoverage: Math.round(avgCoverage * 10) / 10,
        medianCoverage: Math.round(medianCoverage * 10) / 10,
        totalHoldings: holdingsCoverage.length,
        overallRating: getPortfolioRating(avgCoverage)
      },
      holdings: holdingsCoverage.sort((a, b) => (b.interestCoverage || -999) - (a.interestCoverage || -999)),
      summary,
      benchmarks: {
        investmentGrade: 4.0,
        highYield: 2.0,
        distressed: 1.0,
        excellent: 10.0
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Portfolio interest coverage error:', error);
    res.status(500).json({ error: 'Failed to analyze portfolio interest coverage' });
  }
});

/**
 * GET /api/fundamentals/portfolio/working-capital
 * Portfolio-level working capital / liquidity analysis
 */
router.get('/portfolio/working-capital', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's portfolios and holdings
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: userId },
      include: { holdings: true }
    });

    // Get all unique holdings
    const seenSymbols = new Set();
    const allHoldings = [];

    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        if (!seenSymbols.has(holding.symbol)) {
          seenSymbols.add(holding.symbol);
          allHoldings.push(holding);
        }
      }
    }

    if (allHoldings.length === 0) {
      return res.json({
        success: true,
        portfolio: { avgCurrentRatio: 0, avgQuickRatio: 0, totalHoldings: 0, overallRating: 'N/A' },
        holdings: [],
        summary: { excellent: 0, strong: 0, adequate: 0, weak: 0 }
      });
    }

    // Fetch working capital data for each holding
    const holdingsData = await Promise.all(allHoldings.map(async (holding) => {
      try {
        const [balance, ratios, profile] = await Promise.all([
          fetchBalanceSheet(holding.symbol, 'annual', 1),
          fetchKeyRatios(holding.symbol, 'annual'),
          fetchCompanyProfile(holding.symbol)
        ]);

        const latestBalance = balance[0] || {};
        const latestRatios = ratios[0] || {};

        const currentRatio = latestRatios.currentRatio || 0;
        const quickRatio = latestRatios.quickRatio || 0;
        const cashRatio = latestRatios.cashRatio || 0;

        let rating = 'N/A';
        if (currentRatio >= 2.5) rating = 'Excellent';
        else if (currentRatio >= 1.5) rating = 'Strong';
        else if (currentRatio >= 1.0) rating = 'Adequate';
        else if (currentRatio > 0) rating = 'Weak';

        return {
          symbol: holding.symbol,
          name: profile?.companyName || holding.symbol,
          shares: holding.shares,
          currentAssets: latestBalance.totalCurrentAssets || 0,
          currentLiabilities: latestBalance.totalCurrentLiabilities || 0,
          cash: latestBalance.cashAndCashEquivalents || 0,
          currentRatio: Math.round(currentRatio * 100) / 100,
          quickRatio: Math.round(quickRatio * 100) / 100,
          cashRatio: Math.round(cashRatio * 100) / 100,
          rating,
          source: 'Financial Modeling Prep'
        };
      } catch (err) {
        return {
          symbol: holding.symbol,
          name: holding.symbol,
          shares: holding.shares,
          currentRatio: 0,
          quickRatio: 0,
          cashRatio: 0,
          rating: 'N/A',
          error: err.message
        };
      }
    }));

    // Calculate portfolio averages
    const validRatios = holdingsData.filter(h => h.currentRatio > 0);
    const avgCurrentRatio = validRatios.length > 0
      ? validRatios.reduce((sum, h) => sum + h.currentRatio, 0) / validRatios.length
      : 0;
    const avgQuickRatio = validRatios.length > 0
      ? validRatios.reduce((sum, h) => sum + h.quickRatio, 0) / validRatios.length
      : 0;

    const getLiquidityRating = (ratio) => {
      if (ratio >= 2.5) return 'Excellent';
      if (ratio >= 1.5) return 'Strong';
      if (ratio >= 1.0) return 'Adequate';
      if (ratio >= 0.5) return 'Weak';
      return 'Critical';
    };

    const summary = {
      excellent: holdingsData.filter(h => h.currentRatio >= 2.5).length,
      strong: holdingsData.filter(h => h.currentRatio >= 1.5 && h.currentRatio < 2.5).length,
      adequate: holdingsData.filter(h => h.currentRatio >= 1.0 && h.currentRatio < 1.5).length,
      weak: holdingsData.filter(h => h.currentRatio < 1.0 && h.currentRatio > 0).length
    };

    res.json({
      success: true,
      portfolio: {
        avgCurrentRatio: Math.round(avgCurrentRatio * 100) / 100,
        avgQuickRatio: Math.round(avgQuickRatio * 100) / 100,
        totalHoldings: holdingsData.length,
        overallRating: getLiquidityRating(avgCurrentRatio)
      },
      holdings: holdingsData.sort((a, b) => b.currentRatio - a.currentRatio),
      summary,
      benchmarks: {
        excellent: 2.5,
        strong: 1.5,
        adequate: 1.0,
        weak: 0.5
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Portfolio working capital error:', error);
    res.status(500).json({ error: 'Failed to analyze portfolio working capital' });
  }
});

/**
 * GET /api/fundamentals/portfolio/:portfolioId/price-to-sales
 * Get P/S analysis for all holdings in a portfolio
 */
router.get('/portfolio/:portfolioId/price-to-sales', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.id;

    // Fetch portfolios
    let portfolios;
    if (portfolioId === 'all') {
      portfolios = await prisma.portfolios.findMany({
        where: { user_id: userId },
        include: { holdings: true }
      });
    } else {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, user_id: userId },
        include: { holdings: true }
      });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      portfolios = [portfolio];
    }

    // Collect unique symbols
    const symbolsSet = new Set();
    portfolios.forEach(p => p.holdings.forEach(h => symbolsSet.add(h.symbol.toUpperCase())));
    const symbols = Array.from(symbolsSet);

    if (symbols.length === 0) {
      return res.json({
        success: true,
        summary: { avgPS: 0, undervalued: 0, overvalued: 0, total: 0 },
        holdings: []
      });
    }

    // Fetch P/S data for all symbols
    const holdings = await Promise.all(symbols.map(async (sym) => {
      try {
        const [profile, ratios] = await Promise.all([
          fetchCompanyProfile(sym),
          fetchKeyRatios(sym, 'annual')
        ]);

        if (!profile && (!ratios || ratios.length === 0)) return null;

        const latestRatios = ratios[0] || {};
        const psRatio = latestRatios.priceToSalesRatio || profile?.priceToSales || 0;

        // Calculate 5-year average
        const historicalPS = ratios.slice(0, 5).map(r => r.priceToSalesRatio || 0).filter(p => p > 0);
        const avgPS = historicalPS.length > 0
          ? historicalPS.reduce((a, b) => a + b, 0) / historicalPS.length
          : psRatio;

        const vs5YAvg = avgPS > 0 ? ((psRatio - avgPS) / avgPS) * 100 : 0;

        let valuation = 'Fair Value';
        if (vs5YAvg > 50) valuation = 'Expensive';
        else if (vs5YAvg > 20) valuation = 'Stretched';
        else if (vs5YAvg < -30) valuation = 'Cheap';
        else if (vs5YAvg < -10) valuation = 'Undervalued';

        return {
          symbol: sym,
          name: profile?.companyName || sym,
          marketCap: profile?.mktCap || 0,
          revenue: profile?.revenue || 0,
          psRatio: Math.round(psRatio * 100) / 100,
          fiveYearAvg: Math.round(avgPS * 100) / 100,
          vs5YAvg: Math.round(vs5YAvg * 10) / 10,
          valuation,
          sector: profile?.sector || 'Unknown'
        };
      } catch (err) {
        return null;
      }
    }));

    const validHoldings = holdings.filter(h => h !== null);

    // Calculate summary
    const avgPS = validHoldings.length > 0
      ? validHoldings.reduce((s, h) => s + h.psRatio, 0) / validHoldings.length
      : 0;

    res.json({
      success: true,
      summary: {
        avgPS: Math.round(avgPS * 10) / 10,
        undervalued: validHoldings.filter(h => h.vs5YAvg < 0).length,
        overvalued: validHoldings.filter(h => h.vs5YAvg > 0).length,
        total: validHoldings.length
      },
      holdings: validHoldings.sort((a, b) => b.psRatio - a.psRatio),
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Portfolio P/S analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch P/S analysis' });
  }
});

/**
 * GET /api/fundamentals/portfolio/:portfolioId/debt-analysis
 * Get comprehensive debt analysis for all holdings in a portfolio
 */
router.get('/portfolio/:portfolioId/debt-analysis', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.id;

    // Fetch portfolios
    let portfolios;
    if (portfolioId === 'all') {
      portfolios = await prisma.portfolios.findMany({
        where: { user_id: userId },
        include: { holdings: true }
      });
    } else {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, user_id: userId },
        include: { holdings: true }
      });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      portfolios = [portfolio];
    }

    // Collect unique symbols (excluding ETFs)
    const ETF_LIST = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'ARKK'];
    const symbolsSet = new Set();
    portfolios.forEach(p => p.holdings.forEach(h => {
      const sym = h.symbol.toUpperCase();
      if (!ETF_LIST.includes(sym)) symbolsSet.add(sym);
    }));
    const symbols = Array.from(symbolsSet);

    if (symbols.length === 0) {
      return res.json({
        success: true,
        summary: { totalDebt: 0, avgDebtToEbitda: 0, lowRisk: 0, mediumRisk: 0, highRisk: 0 },
        holdings: []
      });
    }

    // Fetch debt data for all symbols
    const holdings = await Promise.all(symbols.map(async (sym) => {
      try {
        const [balance, income, ratios, profile] = await Promise.all([
          fetchBalanceSheet(sym, 'annual', 1),
          fetchIncomeStatement(sym, 'annual', 1),
          fetchKeyRatios(sym, 'annual'),
          fetchCompanyProfile(sym)
        ]);

        const latestBalance = balance[0] || {};
        const latestIncome = income[0] || {};
        const latestRatios = ratios[0] || {};

        const totalDebt = latestBalance.totalDebt || 0;
        const cash = latestBalance.cashAndCashEquivalents || 0;
        const ebitda = latestIncome.ebitda || 0;
        const debtToEquity = latestRatios.debtEquityRatio || 0;
        const debtToEbitda = ebitda > 0 ? totalDebt / ebitda : 0;

        let riskLevel = 'Low';
        if (debtToEbitda > 4 || ebitda < 0) riskLevel = 'High';
        else if (debtToEbitda > 2.5 || debtToEquity > 1.5) riskLevel = 'Medium';

        return {
          symbol: sym,
          name: profile?.companyName || sym,
          totalDebt,
          cash,
          netDebt: totalDebt - cash,
          ebitda,
          debtToEbitda: Math.round(debtToEbitda * 10) / 10,
          debtToEquity: Math.round(debtToEquity * 100) / 100,
          riskLevel
        };
      } catch (err) {
        return null;
      }
    }));

    const validHoldings = holdings.filter(h => h !== null);

    // Calculate summary
    const totalDebt = validHoldings.reduce((sum, h) => sum + h.totalDebt, 0);
    const validDebtEbitda = validHoldings.filter(h => h.debtToEbitda > 0 && h.debtToEbitda < 100);
    const avgDebtToEbitda = validDebtEbitda.length > 0
      ? validDebtEbitda.reduce((sum, h) => sum + h.debtToEbitda, 0) / validDebtEbitda.length
      : 0;

    const lowRisk = validHoldings.filter(h => h.riskLevel === 'Low');
    const mediumRisk = validHoldings.filter(h => h.riskLevel === 'Medium');
    const highRisk = validHoldings.filter(h => h.riskLevel === 'High');

    res.json({
      success: true,
      summary: {
        totalDebt: Math.round(totalDebt / 1e9 * 10) / 10,
        avgDebtToEbitda: Math.round(avgDebtToEbitda * 10) / 10,
        lowRiskCount: lowRisk.length,
        mediumRiskCount: mediumRisk.length,
        highRiskCount: highRisk.length
      },
      holdings: validHoldings.sort((a, b) => b.debtToEbitda - a.debtToEbitda),
      riskCategories: {
        low: lowRisk.slice(0, 5).map(h => ({ symbol: h.symbol, metric: `$${Math.round(h.cash / 1e9)}B cash` })),
        medium: mediumRisk.slice(0, 5).map(h => ({ symbol: h.symbol, metric: `${h.debtToEbitda}x Debt/EBITDA` })),
        high: highRisk.slice(0, 5).map(h => ({ symbol: h.symbol, metric: 'High leverage' }))
      },
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('Portfolio debt analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze portfolio debt' });
  }
});

/**
 * GET /api/fundamentals/:symbol/ps-history
 * Get historical P/S ratio for a symbol
 */
router.get('/:symbol/ps-history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const [profile, ratios] = await Promise.all([
      fetchCompanyProfile(upperSymbol),
      fetchKeyRatios(upperSymbol, 'annual')
    ]);

    if (!ratios || ratios.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No historical P/S data available',
        symbol: upperSymbol
      });
    }

    const currentPS = ratios[0]?.priceToSalesRatio || profile?.priceToSales || 0;

    const history = ratios.map(r => ({
      date: r.date,
      year: r.date ? r.date.substring(0, 4) : null,
      psRatio: Math.round((r.priceToSalesRatio || 0) * 100) / 100
    }));

    const avgPS = history.length > 0
      ? history.reduce((s, h) => s + h.psRatio, 0) / history.length
      : 0;

    res.json({
      success: true,
      symbol: upperSymbol,
      name: profile?.companyName || upperSymbol,
      currentPS: Math.round(currentPS * 100) / 100,
      history,
      avgPS: Math.round(avgPS * 100) / 100,
      source: 'Financial Modeling Prep'
    });
  } catch (error) {
    logger.error('P/S history error:', error);
    res.status(500).json({ error: 'Failed to fetch P/S history' });
  }
});

/**
 * Clear cache utility endpoint (for admin use)
 */
router.post('/cache/clear', async (req, res) => {
  fundamentalCache.clear();
  res.json({ success: true, message: 'Fundamental cache cleared' });
});

module.exports = router;
