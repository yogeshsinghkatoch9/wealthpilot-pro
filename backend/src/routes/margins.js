const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { prisma } = require('../db/simpleDb');
const axios = require('axios');

// API Keys
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'WTV2HVV9OLJ76NEV';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const FMP_KEY = process.env.FMP_API_KEY;

// Cache for margin data (4 hour TTL - margin data doesn't change frequently)
const marginCache = new Map();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Sector average margins for comparison
const SECTOR_AVERAGES = {
  'Technology': { gross: 55, operating: 25, net: 20 },
  'Healthcare': { gross: 50, operating: 15, net: 12 },
  'Financial Services': { gross: 60, operating: 30, net: 25 },
  'Consumer Cyclical': { gross: 35, operating: 10, net: 7 },
  'Communication Services': { gross: 50, operating: 20, net: 15 },
  'Industrials': { gross: 30, operating: 12, net: 8 },
  'Consumer Defensive': { gross: 35, operating: 12, net: 8 },
  'Energy': { gross: 40, operating: 15, net: 10 },
  'Utilities': { gross: 45, operating: 20, net: 12 },
  'Real Estate': { gross: 60, operating: 35, net: 25 },
  'Basic Materials': { gross: 30, operating: 12, net: 8 }
};

/**
 * Fetch margin data from Yahoo Finance (Primary)
 */
async function fetchFromYahooFinance(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
      params: {
        modules: 'financialData,summaryDetail,price,defaultKeyStatistics'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000 // Reduced from 10s to 5s
    });

    const result = response.data?.quoteSummary?.result?.[0];
    if (!result) throw new Error('No data from Yahoo Finance');

    const financialData = result.financialData || {};
    const price = result.price || {};
    const keyStats = result.defaultKeyStatistics || {};

    const grossMargins = financialData.grossMargins?.raw || 0;
    const operatingMargins = financialData.operatingMargins?.raw || 0;
    const profitMargins = financialData.profitMargins?.raw || 0;

    return {
      symbol: symbol.toUpperCase(),
      name: price.shortName || price.longName || symbol,
      grossMargin: Math.round(grossMargins * 1000) / 10,
      operatingMargin: Math.round(operatingMargins * 1000) / 10,
      netMargin: Math.round(profitMargins * 1000) / 10,
      price: price.regularMarketPrice?.raw || 0,
      marketCap: price.marketCap?.raw || 0,
      sector: keyStats.sector || 'Unknown',
      industry: keyStats.industry || 'Unknown',
      provider: 'Yahoo Finance'
    };
  } catch (error) {
    logger.debug(`Yahoo Finance margin fetch failed for ${symbol}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch margin data from FinnHub (Fallback 1)
 */
async function fetchFromFinnHub(symbol) {
  if (!FINNHUB_KEY) throw new Error('FinnHub API key not configured');

  try {
    const [profile, metrics] = await Promise.all([
      axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`, { timeout: 4000 }),
      axios.get(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`, { timeout: 4000 })
    ]);

    const profileData = profile.data || {};
    const metricData = metrics.data?.metric || {};

    if (!metricData.grossMarginTTM && !metricData.operatingMarginTTM) {
      throw new Error('No margin data from FinnHub');
    }

    return {
      symbol: symbol.toUpperCase(),
      name: profileData.name || symbol,
      grossMargin: Math.round((metricData.grossMarginTTM || 0) * 10) / 10,
      operatingMargin: Math.round((metricData.operatingMarginTTM || 0) * 10) / 10,
      netMargin: Math.round((metricData.netProfitMarginTTM || 0) * 10) / 10,
      price: metricData['52WeekHigh'] || 0,
      marketCap: profileData.marketCapitalization * 1000000 || 0,
      sector: profileData.finnhubIndustry || 'Unknown',
      industry: profileData.finnhubIndustry || 'Unknown',
      provider: 'FinnHub'
    };
  } catch (error) {
    logger.debug(`FinnHub margin fetch failed for ${symbol}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch margin data from Polygon (Fallback 2)
 */
async function fetchFromPolygon(symbol) {
  if (!POLYGON_KEY) throw new Error('Polygon API key not configured');

  try {
    const [details, financials] = await Promise.all([
      axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_KEY}`, { timeout: 4000 }),
      axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${POLYGON_KEY}`, { timeout: 4000 })
    ]);

    const tickerData = details.data?.results || {};
    const financialData = financials.data?.results?.[0]?.financials || {};
    const incomeStatement = financialData.income_statement || {};

    const revenue = incomeStatement.revenues?.value || 0;
    const grossProfit = incomeStatement.gross_profit?.value || 0;
    const operatingIncome = incomeStatement.operating_income_loss?.value || 0;
    const netIncome = incomeStatement.net_income_loss?.value || 0;

    if (revenue === 0) throw new Error('No financial data from Polygon');

    return {
      symbol: symbol.toUpperCase(),
      name: tickerData.name || symbol,
      grossMargin: Math.round((grossProfit / revenue) * 1000) / 10,
      operatingMargin: Math.round((operatingIncome / revenue) * 1000) / 10,
      netMargin: Math.round((netIncome / revenue) * 1000) / 10,
      price: 0,
      marketCap: tickerData.market_cap || 0,
      sector: tickerData.sic_description || 'Unknown',
      industry: tickerData.sic_description || 'Unknown',
      provider: 'Polygon'
    };
  } catch (error) {
    logger.debug(`Polygon margin fetch failed for ${symbol}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch margin data from Alpha Vantage (Fallback 3)
 */
async function fetchFromAlphaVantage(symbol) {
  try {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'OVERVIEW',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_KEY
      },
      timeout: 5000 // Reduced from 12s
    });

    const data = response.data || {};

    if (data.Note || data['Error Message'] || data.Information || !data.Symbol) {
      throw new Error('Alpha Vantage rate limit or no data');
    }

    const parseNum = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

    const revenueTTM = parseNum(data.RevenueTTM);
    const grossProfitTTM = parseNum(data.GrossProfitTTM);
    const grossMargin = revenueTTM > 0 ? (grossProfitTTM / revenueTTM) * 100 : 0;
    const operatingMargin = parseNum(data.OperatingMarginTTM) * 100;
    const netMargin = parseNum(data.ProfitMargin) * 100;

    return {
      symbol: symbol.toUpperCase(),
      name: data.Name || symbol,
      grossMargin: Math.round(grossMargin * 10) / 10,
      operatingMargin: Math.round(operatingMargin * 10) / 10,
      netMargin: Math.round(netMargin * 10) / 10,
      price: parseNum(data.AnalystTargetPrice),
      marketCap: parseNum(data.MarketCapitalization),
      sector: data.Sector || 'Unknown',
      industry: data.Industry || 'Unknown',
      provider: 'Alpha Vantage'
    };
  } catch (error) {
    logger.debug(`Alpha Vantage margin fetch failed for ${symbol}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch margin data with PARALLEL API calls (first success wins)
 * Falls back to sector averages if all APIs fail
 */
async function fetchMarginData(symbol) {
  const cacheKey = `margin:${symbol.toUpperCase()}`;
  const cached = marginCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, fromCache: true };
  }

  // Try ALL providers in PARALLEL - first success wins
  const providers = [
    { name: 'Yahoo Finance', fn: fetchFromYahooFinance },
    { name: 'FinnHub', fn: fetchFromFinnHub },
    { name: 'Polygon', fn: fetchFromPolygon },
    { name: 'Alpha Vantage', fn: fetchFromAlphaVantage }
  ];

  let data = null;

  try {
    // Race all providers - return first successful result
    data = await Promise.any(
      providers.map(async (provider) => {
        const result = await provider.fn(symbol);
        result._provider = provider.name;
        return result;
      })
    );
  } catch (aggregateError) {
    // All providers failed - return null to indicate no data available
    logger.warn(`[Margins] All APIs failed for ${symbol}, no margin data available`);
    return null;
  }

  // If no data was retrieved, return null
  if (!data) {
    return null;
  }

  // Calculate additional metrics
  const sectorAvg = SECTOR_AVERAGES[data.sector] || { gross: 40, operating: 15, net: 10 };
  data.vsPeers = Math.round((data.grossMargin - sectorAvg.gross) * 10) / 10;

  // Estimate trend based on margin levels
  if (data.grossMargin > sectorAvg.gross + 10) {
    data.trend = 'Expanding';
    data.marginChange = Math.round((data.grossMargin - sectorAvg.gross) / 3 * 10) / 10;
  } else if (data.grossMargin < sectorAvg.gross - 10) {
    data.trend = 'Contracting';
    data.marginChange = Math.round((data.grossMargin - sectorAvg.gross) / 3 * 10) / 10;
  } else {
    data.trend = 'Stable';
    data.marginChange = 0;
  }

  // Cache successful result
  marginCache.set(cacheKey, { data, timestamp: Date.now() });
  logger.info(`[Margins] ${symbol}: Gross=${data.grossMargin.toFixed(1)}% via ${data._provider || data.provider}`);

  return data;
}

/**
 * GET /api/margins/portfolio/:portfolioId
 * Fetch margin data for all holdings in a portfolio
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const userId = req.user.userId;

    // Fetch portfolios
    let portfolios;
    if (portfolioId === 'all') {
      portfolios = await prisma.portfolios.findMany({
        where: { userId },
        include: { holdings: true }
      });
    } else {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId },
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
    const allSymbols = Array.from(symbolsSet);

    if (allSymbols.length === 0) {
      return res.json({
        summary: { avgGrossMargin: '0.0', avgOperatingMargin: '0.0', avgNetMargin: '0.0', expanding: 0, contracting: 0, total: 0 },
        holdings: [],
        insights: { highestMargins: [], biggestExpansion: [], watchList: [] }
      });
    }

    // Filter out ETFs and funds
    const ETF_LIST = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'SLV', 'USO', 'VNQ', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLP', 'XLU', 'XLB', 'XLY', 'XLRE'];
    const stockSymbols = allSymbols.filter(s =>
      !s.includes('.') &&
      s.length <= 5 &&
      !ETF_LIST.includes(s) &&
      !/^\d/.test(s)
    );

    // Fetch margin data in batches of 10 to avoid API rate limits
    // Each stock has a 4-second timeout
    const BATCH_SIZE = 10;
    const marginData = [];
    const errors = [];

    const fetchWithTimeout = async (symbol) => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 4000)
      );
      try {
        return await Promise.race([fetchMarginData(symbol), timeoutPromise]);
      } catch (e) {
        return null;
      }
    };

    // Process in batches to avoid rate limits
    for (let i = 0; i < stockSymbols.length; i += BATCH_SIZE) {
      const batch = stockSymbols.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(s => fetchWithTimeout(s)));

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          const data = result.value;
          if (data.grossMargin > 0 || data.operatingMargin > 0 || data.netMargin > 0) {
            marginData.push(data);
          }
        } else {
          errors.push({ symbol: batch[idx], error: 'Timeout/Error' });
        }
      });

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < stockSymbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Sort by gross margin descending
    marginData.sort((a, b) => b.grossMargin - a.grossMargin);

    // Calculate averages
    const count = marginData.length;
    const avgGrossMargin = count > 0 ? marginData.reduce((s, d) => s + d.grossMargin, 0) / count : 0;
    const avgOperatingMargin = count > 0 ? marginData.reduce((s, d) => s + d.operatingMargin, 0) / count : 0;
    const avgNetMargin = count > 0 ? marginData.reduce((s, d) => s + d.netMargin, 0) / count : 0;
    const expanding = marginData.filter(d => d.trend === 'Expanding').length;
    const contracting = marginData.filter(d => d.trend === 'Contracting').length;

    // Insights
    const highestMargins = marginData.slice(0, 5);
    const biggestExpansion = [...marginData].sort((a, b) => b.marginChange - a.marginChange).slice(0, 5);
    const watchList = [...marginData].filter(d => d.trend === 'Contracting' || d.grossMargin < 20).slice(0, 5);

    res.json({
      summary: {
        avgGrossMargin: avgGrossMargin.toFixed(1),
        avgOperatingMargin: avgOperatingMargin.toFixed(1),
        avgNetMargin: avgNetMargin.toFixed(1),
        expanding,
        contracting,
        total: count
      },
      holdings: marginData,
      insights: {
        highestMargins,
        biggestExpansion,
        watchList
      },
      errors: errors.length > 0 ? errors : undefined,
      meta: {
        totalSymbols: allSymbols.length,
        stocksAnalyzed: stockSymbols.length,
        etfsSkipped: allSymbols.length - stockSymbols.length
      }
    });

  } catch (error) {
    logger.error('Error fetching portfolio margins:', error);
    res.status(500).json({ error: 'Failed to fetch margin data: ' + error.message });
  }
});

/**
 * GET /api/margins/stock/:symbol
 * Fetch margin data for a single stock
 */
router.get('/stock/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await fetchMarginData(symbol);

    if (!data) {
      return res.json({
        symbol: symbol.toUpperCase(),
        grossMargin: null,
        operatingMargin: null,
        netMargin: null,
        message: 'Margin data not available for this symbol',
        dataAvailable: false
      });
    }

    res.json({ ...data, dataAvailable: true });
  } catch (error) {
    logger.error(`Error fetching margin for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch margin data' });
  }
});

/**
 * GET /api/margins/trend/:symbol
 * Fetch historical margin trend for a symbol
 */
router.get('/trend/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const years = parseInt(req.query.years) || 5;

    // Try Alpha Vantage income statement
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'INCOME_STATEMENT',
          symbol: symbol.toUpperCase(),
          apikey: ALPHA_VANTAGE_KEY
        },
        timeout: 15000
      });

      const data = response.data || {};
      const annualReports = data.annualReports || [];

      if (annualReports.length > 0) {
        const trendData = annualReports
          .slice(0, years)
          .reverse()
          .map(report => {
            const year = new Date(report.fiscalDateEnding).getFullYear();
            const revenue = parseFloat(report.totalRevenue) || 0;
            const grossProfit = parseFloat(report.grossProfit) || 0;
            const operatingIncome = parseFloat(report.operatingIncome) || 0;
            const netIncome = parseFloat(report.netIncome) || 0;

            return {
              year,
              grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
              operatingMargin: revenue > 0 ? Math.round((operatingIncome / revenue) * 1000) / 10 : 0,
              netMargin: revenue > 0 ? Math.round((netIncome / revenue) * 1000) / 10 : 0
            };
          });

        return res.json({ symbol: symbol.toUpperCase(), trendData });
      }
    } catch (e) {
      logger.debug(`Alpha Vantage trend failed for ${symbol}: ${e.message}`);
    }

    // Try FMP income statement as secondary source
    if (FMP_KEY) {
      try {
        const fmpResponse = await axios.get(
          `https://financialmodelingprep.com/api/v3/income-statement/${symbol.toUpperCase()}`,
          {
            params: { limit: years, apikey: FMP_KEY },
            timeout: 10000
          }
        );

        const fmpData = fmpResponse.data || [];
        if (fmpData.length > 0) {
          const trendData = fmpData
            .slice(0, years)
            .reverse()
            .map(report => {
              const year = new Date(report.date).getFullYear();
              const revenue = report.revenue || 0;
              const grossProfit = report.grossProfit || 0;
              const operatingIncome = report.operatingIncome || 0;
              const netIncome = report.netIncome || 0;

              return {
                year,
                grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
                operatingMargin: revenue > 0 ? Math.round((operatingIncome / revenue) * 1000) / 10 : 0,
                netMargin: revenue > 0 ? Math.round((netIncome / revenue) * 1000) / 10 : 0
              };
            });

          return res.json({ symbol: symbol.toUpperCase(), trendData, provider: 'FMP' });
        }
      } catch (fmpError) {
        logger.debug(`FMP trend failed for ${symbol}: ${fmpError.message}`);
      }
    }

    // No historical data available from any source - return empty state
    res.json({
      symbol: symbol.toUpperCase(),
      trendData: [],
      message: 'Historical margin data not available for this symbol'
    });

  } catch (error) {
    logger.error('Error fetching margin trend:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

module.exports = router;
