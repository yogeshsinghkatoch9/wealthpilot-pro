const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// API Keys from environment
const FMP_API_KEY = process.env.FMP_API_KEY;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Data freshness threshold (1 day in milliseconds)
const DATA_FRESHNESS_MS = 24 * 60 * 60 * 1000;

// Sector averages for comparison
const SECTOR_AVERAGES = {
  Technology: { revPerEmployee: 624000, profitPerEmployee: 180000 },
  'Consumer Cyclical': { revPerEmployee: 450000, profitPerEmployee: 45000 },
  Healthcare: { revPerEmployee: 380000, profitPerEmployee: 60000 },
  'Financial Services': { revPerEmployee: 520000, profitPerEmployee: 150000 },
  'Communication Services': { revPerEmployee: 580000, profitPerEmployee: 120000 },
  'Consumer Defensive': { revPerEmployee: 320000, profitPerEmployee: 35000 },
  Energy: { revPerEmployee: 890000, profitPerEmployee: 95000 },
  Industrials: { revPerEmployee: 340000, profitPerEmployee: 42000 },
  'Basic Materials': { revPerEmployee: 420000, profitPerEmployee: 55000 },
  Utilities: { revPerEmployee: 650000, profitPerEmployee: 85000 },
  'Real Estate': { revPerEmployee: 480000, profitPerEmployee: 110000 },
  default: { revPerEmployee: 500000, profitPerEmployee: 75000 }
};

// Industry employee estimates per $1B revenue (for fallback when Yahoo returns null)
const INDUSTRY_EMPLOYEE_ESTIMATES = {
  'Technology': 1500,
  'Software—Infrastructure': 1200,
  'Software—Application': 1400,
  'Semiconductors': 800,
  'Consumer Electronics': 2500,
  'Internet Content & Information': 1000,
  'Financial Services': 2000,
  'Banks—Diversified': 3000,
  'Healthcare': 3000,
  'Drug Manufacturers—General': 2500,
  'Retail—Cyclical': 8000,
  'Auto Manufacturers': 5000,
  'Aerospace & Defense': 4000,
  'Oil & Gas Integrated': 1500,
  'Utilities—Regulated Electric': 2000,
  'Real Estate—Development': 1000,
  'Asset Management': 500,
  'Exchange Traded Fund': 50,  // ETFs have minimal employees
  'default': 2500
};

// Helper to format large numbers
function formatNumber(num) {
  if (!num || isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

// Check if data is fresh (less than 1 day old)
function isDataFresh(fetchedAt) {
  if (!fetchedAt) return false;
  const now = new Date();
  const fetchedTime = new Date(fetchedAt);
  return (now - fetchedTime) < DATA_FRESHNESS_MS;
}

// ============================================================================
// MULTI-API DATA FETCHERS - Cascade through APIs until employee data is found
// ============================================================================

// 1. Yahoo Finance API
async function fetchFromYahoo(symbol) {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile,incomeStatementHistory`;
    const response = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const profile = result.assetProfile || {};
    const financials = result.financialData || {};
    const keyStats = result.defaultKeyStatistics || {};
    const summary = result.summaryDetail || {};

    return {
      symbol,
      companyName: profile.longName || symbol,
      sector: profile.sector || null,
      industry: profile.industry || null,
      revenue: financials.totalRevenue?.raw || null,
      employees: profile.fullTimeEmployees || null,
      netIncome: financials.netIncomeToCommon?.raw || keyStats.netIncomeToCommon?.raw || null,
      grossProfit: financials.grossProfits?.raw || null,
      marketCap: summary.marketCap?.raw || null,
      operatingMargin: financials.operatingMargins?.raw || null,
      profitMargin: financials.profitMargins?.raw || null,
      grossMargin: financials.grossMargins?.raw || null,
      dataSource: 'yahoo'
    };
  } catch (error) {
    console.error(`[Yahoo] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// 2. Financial Modeling Prep API
async function fetchFromFMP(symbol) {
  if (!FMP_API_KEY) return null;

  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`;
    const response = await fetch(url, { timeout: 10000 });

    if (!response.ok) return null;

    const data = await response.json();
    const profile = data[0];
    if (!profile) return null;

    return {
      symbol,
      companyName: profile.companyName || symbol,
      sector: profile.sector || null,
      industry: profile.industry || null,
      revenue: null, // Need separate call for financials
      employees: profile.fullTimeEmployees || null,
      netIncome: null,
      grossProfit: null,
      marketCap: profile.mktCap || null,
      dataSource: 'fmp'
    };
  } catch (error) {
    console.error(`[FMP] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// 2b. FMP Income Statement for revenue data
async function fetchFMPFinancials(symbol) {
  if (!FMP_API_KEY) return null;

  try {
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=1&apikey=${FMP_API_KEY}`;
    const response = await fetch(url, { timeout: 10000 });

    if (!response.ok) return null;

    const data = await response.json();
    const income = data[0];
    if (!income) return null;

    return {
      revenue: income.revenue || null,
      netIncome: income.netIncome || null,
      grossProfit: income.grossProfit || null,
      operatingIncome: income.operatingIncome || null
    };
  } catch (error) {
    console.error(`[FMP Financials] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// 3. Polygon.io API
async function fetchFromPolygon(symbol) {
  if (!POLYGON_API_KEY) return null;

  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, { timeout: 10000 });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.results;
    if (!result) return null;

    return {
      symbol,
      companyName: result.name || symbol,
      sector: result.sic_description || null,
      industry: null,
      employees: result.total_employees || null,
      marketCap: result.market_cap || null,
      dataSource: 'polygon'
    };
  } catch (error) {
    console.error(`[Polygon] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// 4. Finnhub API
async function fetchFromFinnhub(symbol) {
  if (!FINNHUB_API_KEY) return null;

  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url, { timeout: 10000 });

    if (!response.ok) return null;

    const profile = await response.json();
    if (!profile || !profile.name) return null;

    return {
      symbol,
      companyName: profile.name || symbol,
      sector: profile.finnhubIndustry || null,
      industry: profile.finnhubIndustry || null,
      employees: profile.employeeTotal || null,
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
      dataSource: 'finnhub'
    };
  } catch (error) {
    console.error(`[Finnhub] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// 5. Alpha Vantage API (Company Overview)
async function fetchFromAlphaVantage(symbol) {
  if (!ALPHA_VANTAGE_API_KEY) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url, { timeout: 15000 });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.Note || !data.Symbol) return null; // Rate limit or no data

    return {
      symbol,
      companyName: data.Name || symbol,
      sector: data.Sector || null,
      industry: data.Industry || null,
      revenue: data.RevenueTTM ? parseFloat(data.RevenueTTM) : null,
      employees: data.FullTimeEmployees ? parseInt(data.FullTimeEmployees) : null,
      netIncome: data.NetIncomeTTM ? parseFloat(data.NetIncomeTTM) : null,
      grossProfit: data.GrossProfitTTM ? parseFloat(data.GrossProfitTTM) : null,
      marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
      operatingMargin: data.OperatingMarginTTM ? parseFloat(data.OperatingMarginTTM) : null,
      profitMargin: data.ProfitMargin ? parseFloat(data.ProfitMargin) : null,
      dataSource: 'alphavantage'
    };
  } catch (error) {
    console.error(`[AlphaVantage] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// ============================================================================
// MASTER FUNCTION: Cascade through APIs until complete data is found
// ============================================================================
async function fetchEfficiencyDataWithCascade(symbol) {
  console.log(`[Efficiency] Fetching data for ${symbol} with multi-API cascade`);

  let combinedData = {
    symbol: symbol.toUpperCase(),
    companyName: symbol,
    sector: null,
    industry: null,
    revenue: null,
    employees: null,
    netIncome: null,
    grossProfit: null,
    marketCap: null,
    operatingMargin: null,
    profitMargin: null,
    grossMargin: null,
    dataSource: 'none',
    dataSources: []
  };

  // Track which APIs provided data
  const apiResults = [];

  // 1. Try Yahoo Finance first (usually has good financial data)
  const yahooData = await fetchFromYahoo(symbol);
  if (yahooData) {
    apiResults.push({ api: 'yahoo', employees: yahooData.employees, revenue: yahooData.revenue });
    combinedData = { ...combinedData, ...yahooData };
    combinedData.dataSources.push('yahoo');

    if (yahooData.employees && yahooData.revenue) {
      console.log(`[Efficiency] ✓ Yahoo provided complete data for ${symbol} (${yahooData.employees} employees)`);
      return finalizeData(combinedData);
    }
  }

  // 2. Try FMP if employees still missing
  if (!combinedData.employees) {
    const fmpData = await fetchFromFMP(symbol);
    if (fmpData?.employees) {
      apiResults.push({ api: 'fmp', employees: fmpData.employees });
      combinedData.employees = fmpData.employees;
      combinedData.companyName = combinedData.companyName || fmpData.companyName;
      combinedData.sector = combinedData.sector || fmpData.sector;
      combinedData.industry = combinedData.industry || fmpData.industry;
      combinedData.dataSources.push('fmp');
      console.log(`[Efficiency] ✓ FMP provided employees for ${symbol} (${fmpData.employees})`);
    }

    // Also get FMP financials if revenue is missing
    if (!combinedData.revenue) {
      const fmpFinancials = await fetchFMPFinancials(symbol);
      if (fmpFinancials?.revenue) {
        combinedData.revenue = fmpFinancials.revenue;
        combinedData.netIncome = combinedData.netIncome || fmpFinancials.netIncome;
        combinedData.grossProfit = combinedData.grossProfit || fmpFinancials.grossProfit;
        if (!combinedData.dataSources.includes('fmp')) combinedData.dataSources.push('fmp');
      }
    }
  }

  // Check if we have complete data now
  if (combinedData.employees && combinedData.revenue) {
    return finalizeData(combinedData);
  }

  // 3. Try Polygon if employees still missing
  if (!combinedData.employees) {
    const polygonData = await fetchFromPolygon(symbol);
    if (polygonData?.employees) {
      apiResults.push({ api: 'polygon', employees: polygonData.employees });
      combinedData.employees = polygonData.employees;
      combinedData.companyName = combinedData.companyName || polygonData.companyName;
      combinedData.sector = combinedData.sector || polygonData.sector;
      combinedData.dataSources.push('polygon');
      console.log(`[Efficiency] ✓ Polygon provided employees for ${symbol} (${polygonData.employees})`);
    }
  }

  // Check if we have complete data now
  if (combinedData.employees && combinedData.revenue) {
    return finalizeData(combinedData);
  }

  // 4. Try Finnhub if employees still missing
  if (!combinedData.employees) {
    const finnhubData = await fetchFromFinnhub(symbol);
    if (finnhubData?.employees) {
      apiResults.push({ api: 'finnhub', employees: finnhubData.employees });
      combinedData.employees = finnhubData.employees;
      combinedData.companyName = combinedData.companyName || finnhubData.companyName;
      combinedData.sector = combinedData.sector || finnhubData.sector;
      combinedData.dataSources.push('finnhub');
      console.log(`[Efficiency] ✓ Finnhub provided employees for ${symbol} (${finnhubData.employees})`);
    }
  }

  // Check if we have complete data now
  if (combinedData.employees && combinedData.revenue) {
    return finalizeData(combinedData);
  }

  // 5. Try Alpha Vantage as last resort (strict rate limits)
  if (!combinedData.employees || !combinedData.revenue) {
    const avData = await fetchFromAlphaVantage(symbol);
    if (avData) {
      apiResults.push({ api: 'alphavantage', employees: avData.employees, revenue: avData.revenue });
      if (avData.employees && !combinedData.employees) {
        combinedData.employees = avData.employees;
        console.log(`[Efficiency] ✓ AlphaVantage provided employees for ${symbol} (${avData.employees})`);
      }
      if (avData.revenue && !combinedData.revenue) {
        combinedData.revenue = avData.revenue;
      }
      combinedData.companyName = combinedData.companyName || avData.companyName;
      combinedData.sector = combinedData.sector || avData.sector;
      combinedData.industry = combinedData.industry || avData.industry;
      combinedData.netIncome = combinedData.netIncome || avData.netIncome;
      combinedData.grossProfit = combinedData.grossProfit || avData.grossProfit;
      combinedData.dataSources.push('alphavantage');
    }
  }

  // Log API cascade results
  console.log(`[Efficiency] API cascade results for ${symbol}:`, JSON.stringify(apiResults));

  // 6. Final fallback: Estimate employees from industry averages
  if (!combinedData.employees && combinedData.revenue) {
    const industry = combinedData.industry || '';
    const sector = combinedData.sector || 'Technology';
    const estimateRatio = INDUSTRY_EMPLOYEE_ESTIMATES[industry]
      || INDUSTRY_EMPLOYEE_ESTIMATES[sector]
      || INDUSTRY_EMPLOYEE_ESTIMATES.default;

    combinedData.employees = Math.round(combinedData.revenue / 1e9 * estimateRatio);
    combinedData.estimatedEmployees = true;
    combinedData.dataSources.push('estimate');
    console.log(`[Efficiency] ⚠ Using estimated employees for ${symbol}: ${combinedData.employees} (based on ${industry || sector})`);
  }

  return finalizeData(combinedData);
}

// Finalize data with calculated metrics
function finalizeData(data) {
  const { revenue, employees, netIncome, grossProfit } = data;

  return {
    ...data,
    estimatedEmployees: data.estimatedEmployees || false,
    revPerEmployee: revenue && employees ? revenue / employees : null,
    profitPerEmployee: netIncome && employees ? netIncome / employees : null,
    grossProfitPerEmployee: grossProfit && employees ? grossProfit / employees : null,
    dataSource: data.dataSources.length > 0 ? data.dataSources.join('+') : 'none'
  };
}

// Get efficiency data for a symbol (database first, then API)
async function getEfficiencyData(symbol) {
  // 1. Check database first
  const dbData = await prisma.efficiencyData.findUnique({
    where: { symbol: symbol.toUpperCase() }
  });

  // 2. If fresh data exists in DB, return it
  if (dbData && isDataFresh(dbData.fetchedAt)) {
    console.log(`[Efficiency] Using cached data for ${symbol}`);
    return dbData;
  }

  // 3. Fetch fresh data from multi-API cascade
  console.log(`[Efficiency] Fetching fresh data for ${symbol} using multi-API cascade`);
  const freshData = await fetchEfficiencyDataWithCascade(symbol);

  if (!freshData) {
    // Return stale DB data if API fails
    if (dbData) {
      console.log(`[Efficiency] API failed, using stale data for ${symbol}`);
      return dbData;
    }
    return null;
  }

  // 4. Store in database (upsert)
  const savedData = await prisma.efficiencyData.upsert({
    where: { symbol: symbol.toUpperCase() },
    update: {
      companyName: freshData.companyName,
      sector: freshData.sector,
      industry: freshData.industry,
      revenue: freshData.revenue,
      employees: freshData.employees,
      netIncome: freshData.netIncome,
      grossProfit: freshData.grossProfit,
      marketCap: freshData.marketCap,
      revPerEmployee: freshData.revPerEmployee,
      profitPerEmployee: freshData.profitPerEmployee,
      grossProfitPerEmployee: freshData.grossProfitPerEmployee,
      operatingMargin: freshData.operatingMargin,
      profitMargin: freshData.profitMargin,
      grossMargin: freshData.grossMargin,
      dataSource: freshData.dataSource,
      fetchedAt: new Date()
    },
    create: {
      symbol: symbol.toUpperCase(),
      companyName: freshData.companyName,
      sector: freshData.sector,
      industry: freshData.industry,
      revenue: freshData.revenue,
      employees: freshData.employees,
      netIncome: freshData.netIncome,
      grossProfit: freshData.grossProfit,
      marketCap: freshData.marketCap,
      revPerEmployee: freshData.revPerEmployee,
      profitPerEmployee: freshData.profitPerEmployee,
      grossProfitPerEmployee: freshData.grossProfitPerEmployee,
      operatingMargin: freshData.operatingMargin,
      profitMargin: freshData.profitMargin,
      grossMargin: freshData.grossMargin,
      dataSource: freshData.dataSource,
      fetchedAt: new Date()
    }
  });

  console.log(`[Efficiency] Saved fresh data for ${symbol}`);
  // Include estimatedEmployees flag from freshData (not stored in DB)
  return { ...savedData, estimatedEmployees: freshData.estimatedEmployees };
}

// GET /api/efficiency/portfolio/:portfolioId - Get efficiency for portfolio holdings
router.get('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get portfolio holdings
    let holdings = [];

    if (portfolioId === 'all') {
      const portfolios = await prisma.portfolios.findMany({
        where: { userId },
        include: { holdings: true }
      });
      holdings = portfolios.flatMap(p => p.holdings);
    } else {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId },
        include: { holdings: true }
      });
      holdings = portfolio?.holdings || [];
    }

    if (holdings.length === 0) {
      return res.json({
        empty: true,
        message: 'No holdings in this portfolio',
        holdings: [],
        summary: null
      });
    }

    // Get unique symbols
    const symbols = [...new Set(holdings.map(h => h.symbol))];

    // Fetch efficiency data for each symbol (from DB or API)
    const efficiencyResults = await Promise.all(
      symbols.map(symbol => getEfficiencyData(symbol))
    );

    // Separate results into those with efficiency data and those without
    const allData = efficiencyResults.filter(d => d !== null);
    const withEfficiencyData = allData.filter(d => d.revPerEmployee);
    const withoutEfficiencyData = allData.filter(d => !d.revPerEmployee);

    // If no data at all could be fetched
    if (allData.length === 0) {
      return res.json({
        empty: true,
        message: 'Unable to fetch any data for holdings',
        holdings: [],
        summary: null,
        warnings: null
      });
    }

    // Build warning message if some stocks lack efficiency data
    const warnings = withoutEfficiencyData.length > 0
      ? `Employee data unavailable for ${withoutEfficiencyData.length} holding(s): ${withoutEfficiencyData.map(d => d.symbol).join(', ')}`
      : null;

    // Sort by rev/employee descending (stocks with data first, then those without)
    const validData = [...withEfficiencyData].sort((a, b) => (b.revPerEmployee || 0) - (a.revPerEmployee || 0));
    const allSortedData = [...validData, ...withoutEfficiencyData];

    // Calculate portfolio metrics
    const totalRevenue = validData.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const totalEmployees = validData.reduce((sum, d) => sum + (d.employees || 0), 0);
    const totalProfit = validData.reduce((sum, d) => sum + (d.netIncome || 0), 0);

    const avgRevPerEmployee = totalEmployees > 0 ? totalRevenue / totalEmployees : 0;
    const avgProfitPerEmployee = totalEmployees > 0 ? totalProfit / totalEmployees : 0;

    const mostEfficient = validData[0];
    const primarySector = validData[0]?.sector || 'Technology';
    const sectorAvg = SECTOR_AVERAGES[primarySector] || SECTOR_AVERAGES.default;
    const aboveAvgCount = validData.filter(d => d.revPerEmployee > sectorAvg.revPerEmployee).length;

    // Format holdings response (include all stocks, even those without efficiency data)
    const formattedHoldings = allSortedData.map((d, idx) => {
      const vsSector = d.revPerEmployee && sectorAvg.revPerEmployee
        ? ((d.revPerEmployee - sectorAvg.revPerEmployee) / sectorAvg.revPerEmployee * 100)
        : 0;

      // YoY change not available without historical efficiency data
      const yoyChange = 0;

      return {
        rank: d.revPerEmployee ? idx + 1 : null,
        symbol: d.symbol,
        name: d.companyName || d.symbol,
        sector: d.sector,
        revenue: d.revenue,
        revenueFormatted: formatNumber(d.revenue),
        employees: d.employees,
        employeesFormatted: d.employees?.toLocaleString() || 'N/A',
        estimatedEmployees: d.estimatedEmployees || false,
        revPerEmployee: d.revPerEmployee,
        revPerEmployeeFormatted: d.revPerEmployee ? formatNumber(d.revPerEmployee) : 'N/A',
        profitPerEmployee: d.profitPerEmployee,
        profitPerEmployeeFormatted: d.profitPerEmployee ? formatNumber(d.profitPerEmployee) : 'N/A',
        yoyChange: parseFloat(yoyChange),
        vsSector: d.revPerEmployee ? vsSector.toFixed(0) : 'N/A',
        isAboveAvg: d.revPerEmployee ? d.revPerEmployee > sectorAvg.revPerEmployee : false,
        hasEfficiencyData: !!d.revPerEmployee,
        fetchedAt: d.fetchedAt
      };
    });

    // Insights (only from stocks with efficiency data)
    const holdingsWithData = formattedHoldings.filter(h => h.hasEfficiencyData);
    const leaders = holdingsWithData.slice(0, 3);
    const improved = [...holdingsWithData]
      .filter(h => h.yoyChange > 0)
      .sort((a, b) => b.yoyChange - a.yoyChange)
      .slice(0, 3);
    const belowAvg = holdingsWithData
      .filter(h => !h.isAboveAvg)
      .slice(0, 3);

    res.json({
      summary: {
        avgRevPerEmployee,
        avgRevPerEmployeeFormatted: formatNumber(avgRevPerEmployee),
        avgProfitPerEmployee,
        avgProfitPerEmployeeFormatted: formatNumber(avgProfitPerEmployee),
        mostEfficient: {
          symbol: mostEfficient?.symbol,
          value: mostEfficient?.revPerEmployee,
          formatted: formatNumber(mostEfficient?.revPerEmployee)
        },
        sectorAvg: {
          value: sectorAvg.revPerEmployee,
          formatted: formatNumber(sectorAvg.revPerEmployee),
          sector: primarySector
        },
        aboveAvg: {
          count: aboveAvgCount,
          total: validData.length
        }
      },
      holdings: formattedHoldings,
      warnings,
      holdingsWithoutData: withoutEfficiencyData.map(d => ({
        symbol: d.symbol,
        name: d.companyName,
        reason: !d.revenue ? 'No revenue data' : 'No employee data'
      })),
      insights: { leaders, improved, belowAvg },
      chartData: {
        comparison: holdingsWithData.slice(0, 10).map(h => ({
          symbol: h.symbol,
          revPerEmployee: h.revPerEmployee / 1e6,
          isAboveAvg: h.isAboveAvg
        })),
        sectorAvgLine: sectorAvg.revPerEmployee / 1e6
      }
    });

  } catch (error) {
    console.error('Error fetching efficiency data:', error);
    res.status(500).json({ error: 'Failed to fetch efficiency data' });
  }
});

// GET /api/efficiency/trend/:symbol - Get historical efficiency trend
router.get('/trend/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { years = 5 } = req.query;

    // Get current data
    const currentData = await getEfficiencyData(symbol);

    if (!currentData || !currentData.revPerEmployee) {
      return res.status(404).json({ error: 'Efficiency data not found' });
    }

    // Check for historical data in DB
    let historicalData = await prisma.efficiencyHistory.findMany({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { year: 'asc' },
      take: parseInt(years)
    });

    // If no historical data, return empty trend with current value only
    if (historicalData.length === 0) {
      const currentYear = new Date().getFullYear();

      return res.json({
        symbol,
        name: currentData.companyName,
        current: {
          revPerEmployee: currentData.revPerEmployee,
          formatted: formatNumber(currentData.revPerEmployee)
        },
        trend: [{
          year: currentYear,
          revPerEmployee: currentData.revPerEmployee,
          formatted: formatNumber(currentData.revPerEmployee)
        }],
        cagr: null,
        message: 'Historical efficiency data not available'
      });
    }

    // Use actual historical data
    const trend = historicalData.map(h => ({
      year: h.year,
      revPerEmployee: h.revPerEmployee,
      formatted: formatNumber(h.revPerEmployee)
    }));

    const startVal = trend[0].revPerEmployee;
    const endVal = trend[trend.length - 1].revPerEmployee;
    const cagr = startVal > 0 ? ((Math.pow(endVal / startVal, 1 / years) - 1) * 100).toFixed(1) : '0';

    res.json({
      symbol,
      name: currentData.companyName,
      current: {
        revPerEmployee: currentData.revPerEmployee,
        formatted: formatNumber(currentData.revPerEmployee)
      },
      trend,
      cagr
    });

  } catch (error) {
    console.error('Error fetching trend:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

// GET /api/efficiency/sectors - Get sector benchmarks
router.get('/sectors', (req, res) => {
  const sectors = Object.entries(SECTOR_AVERAGES)
    .filter(([key]) => key !== 'default')
    .map(([sector, data]) => ({
      sector,
      revPerEmployee: data.revPerEmployee,
      revPerEmployeeFormatted: formatNumber(data.revPerEmployee),
      profitPerEmployee: data.profitPerEmployee,
      profitPerEmployeeFormatted: formatNumber(data.profitPerEmployee)
    }))
    .sort((a, b) => b.revPerEmployee - a.revPerEmployee);

  res.json({ sectors });
});

// POST /api/efficiency/refresh - Refresh all efficiency data (for cron job)
router.post('/refresh', async (req, res) => {
  try {
    // Get all unique symbols from all users' holdings
    const allHoldings = await prisma.holdings.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });

    const symbols = allHoldings.map(h => h.symbol);
    console.log(`[Efficiency Refresh] Refreshing data for ${symbols.length} symbols`);

    let refreshed = 0;
    let failed = 0;

    for (const symbol of symbols) {
      try {
        const freshData = await fetchEfficiencyDataWithCascade(symbol);
        if (freshData && freshData.revPerEmployee) {
          await prisma.efficiencyData.upsert({
            where: { symbol: symbol.toUpperCase() },
            update: {
              companyName: freshData.companyName,
              sector: freshData.sector,
              industry: freshData.industry,
              revenue: freshData.revenue,
              employees: freshData.employees,
              netIncome: freshData.netIncome,
              grossProfit: freshData.grossProfit,
              marketCap: freshData.marketCap,
              revPerEmployee: freshData.revPerEmployee,
              profitPerEmployee: freshData.profitPerEmployee,
              grossProfitPerEmployee: freshData.grossProfitPerEmployee,
              operatingMargin: freshData.operatingMargin,
              profitMargin: freshData.profitMargin,
              grossMargin: freshData.grossMargin,
              dataSource: freshData.dataSource,
              fetchedAt: new Date()
            },
            create: {
              symbol: symbol.toUpperCase(),
              companyName: freshData.companyName,
              sector: freshData.sector,
              industry: freshData.industry,
              revenue: freshData.revenue,
              employees: freshData.employees,
              netIncome: freshData.netIncome,
              grossProfit: freshData.grossProfit,
              marketCap: freshData.marketCap,
              revPerEmployee: freshData.revPerEmployee,
              profitPerEmployee: freshData.profitPerEmployee,
              grossProfitPerEmployee: freshData.grossProfitPerEmployee,
              operatingMargin: freshData.operatingMargin,
              profitMargin: freshData.profitMargin,
              grossMargin: freshData.grossMargin,
              dataSource: freshData.dataSource,
              fetchedAt: new Date()
            }
          });
          refreshed++;
        } else {
          failed++;
        }

        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`[Efficiency Refresh] Error refreshing ${symbol}:`, err.message);
        failed++;
      }
    }

    console.log(`[Efficiency Refresh] Complete: ${refreshed} refreshed, ${failed} failed`);

    res.json({
      success: true,
      message: `Refreshed ${refreshed} symbols, ${failed} failed`,
      refreshed,
      failed,
      total: symbols.length
    });

  } catch (error) {
    console.error('Error in efficiency refresh:', error);
    res.status(500).json({ error: 'Failed to refresh efficiency data' });
  }
});

// GET /api/efficiency/compare - Compare multiple symbols
router.get('/compare', async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'Symbols parameter required' });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

    const results = await Promise.all(
      symbolList.map(symbol => getEfficiencyData(symbol))
    );

    const validResults = results.filter(r => r !== null);

    res.json({
      symbols: validResults.map(d => ({
        symbol: d.symbol,
        name: d.companyName,
        sector: d.sector,
        revPerEmployee: d.revPerEmployee,
        revPerEmployeeFormatted: formatNumber(d.revPerEmployee),
        profitPerEmployee: d.profitPerEmployee,
        profitPerEmployeeFormatted: formatNumber(d.profitPerEmployee),
        employees: d.employees,
        revenue: d.revenue,
        vsSectorPct: d.revPerEmployee && SECTOR_AVERAGES[d.sector]
          ? ((d.revPerEmployee - SECTOR_AVERAGES[d.sector].revPerEmployee) / SECTOR_AVERAGES[d.sector].revPerEmployee * 100).toFixed(1)
          : '0'
      })),
      sectorAverages: SECTOR_AVERAGES
    });

  } catch (error) {
    console.error('Error comparing efficiency:', error);
    res.status(500).json({ error: 'Failed to compare efficiency' });
  }
});

module.exports = router;
