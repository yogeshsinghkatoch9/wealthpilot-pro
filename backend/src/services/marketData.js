const { prisma } = require('../db/simpleDb');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Cache quotes for 1 minute, profiles for 1 hour, history for 5 minutes
const quoteCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const profileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const historyCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// API Keys from environment
const API_KEYS = {
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
  FMP: process.env.FMP_API_KEY,
  POLYGON: process.env.POLYGON_API_KEY,
  FINNHUB: process.env.FINNHUB_API_KEY,
  TWELVEDATA: process.env.TWELVEDATA_API_KEY,
  NASDAQ: process.env.NASDAQ_API_KEY,
  COINCAP: process.env.COINCAP_API_KEY
};

// Cryptocurrency symbol mapping (ticker -> CoinCap ID)
const CRYPTO_SYMBOL_MAP = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'XRP': 'xrp',
  'SOL': 'solana',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'SHIB': 'shiba-inu',
  'LTC': 'litecoin',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'XLM': 'stellar',
  'ATOM': 'cosmos',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'ALGO': 'algorand',
  'FTM': 'fantom',
  'NEAR': 'near-protocol',
  'VET': 'vechain',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'AXS': 'axie-infinity',
  'CRO': 'crypto-com-chain',
  'APE': 'apecoin',
  'LDO': 'lido-dao',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'IMX': 'immutable-x',
  'INJ': 'injective-protocol'
};

// Known ETF symbols for enhanced data fetching
const KNOWN_ETFS = new Set([
  'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'VEA', 'IEFA', 'VWO', 'EFA', 'AGG',
  'BND', 'VNQ', 'GLD', 'LQD', 'VIG', 'TLT', 'IWM', 'EEM', 'XLF', 'XLK',
  'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'VGT', 'VHT',
  'VDC', 'VFH', 'VIS', 'VCR', 'VAW', 'VPU', 'VOX', 'VDE', 'SCHD', 'JEPI',
  'HDV', 'DVY', 'VYM', 'SPYD', 'NOBL', 'SDY', 'DIA', 'RSP', 'MTUM', 'QUAL',
  'USMV', 'VLUE', 'SIZE', 'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ', 'ARKX',
  'VCIT', 'VCSH', 'VGSH', 'VGIT', 'VGLT', 'BSV', 'BIV', 'BLV', 'EMB', 'HYG',
  'JNK', 'LQD', 'TIP', 'VTIP', 'MUB', 'SHY', 'IEF', 'GOVT', 'FALN', 'IDV',
  'DEM', 'VEU', 'VXUS', 'IXUS', 'ACWI', 'ACWX', 'URTH'
]);

/**
 * Provider Health Tracking
 * Tracks rate limits and failures per provider
 */
const providerHealth = {
  yahoo: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  alphavantage: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  fmp: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  polygon: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  finnhub: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  coincap: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  twelvedata: { failures: 0, lastFailure: 0, cooldownUntil: 0 },
  nasdaq: { failures: 0, lastFailure: 0, cooldownUntil: 0 }
};

const COOLDOWN_DURATION = 60000; // 1 minute cooldown after rate limit
const MAX_FAILURES = 3; // Max failures before cooldown

function isProviderHealthy(provider) {
  const health = providerHealth[provider];
  if (!health) return true;

  // Check if still in cooldown
  if (Date.now() < health.cooldownUntil) {
    return false;
  }

  // Reset failures if cooldown passed
  if (health.cooldownUntil > 0 && Date.now() >= health.cooldownUntil) {
    health.failures = 0;
    health.cooldownUntil = 0;
  }

  return true;
}

function markProviderFailure(provider, isRateLimit = false) {
  const health = providerHealth[provider];
  if (!health) return;

  health.failures++;
  health.lastFailure = Date.now();

  if (isRateLimit || health.failures >= MAX_FAILURES) {
    health.cooldownUntil = Date.now() + COOLDOWN_DURATION;
    logger.warn(`Provider ${provider} in cooldown until ${new Date(health.cooldownUntil).toISOString()}`);
  }
}

function markProviderSuccess(provider) {
  const health = providerHealth[provider];
  if (!health) return;
  health.failures = 0;
  health.cooldownUntil = 0;
}

/**
 * Validate stock symbol to prevent SSRF attacks
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const cleaned = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^]{1,10}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Generic fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============================================================================
// QUOTE PROVIDERS (7 providers)
// ============================================================================

/**
 * 1. Yahoo Finance (Primary - No API key required)
 */
async function fetchQuoteYahoo(symbol) {
  if (!isProviderHealthy('yahoo')) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const currentPrice = meta.regularMarketPrice;

    markProviderSuccess('yahoo');
    return {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || symbol,
      price: currentPrice,
      previousClose: prevClose,
      open: quote?.open?.[quote.open.length - 1] || currentPrice,
      high: quote?.high?.[quote.high.length - 1] || currentPrice,
      low: quote?.low?.[quote.low.length - 1] || currentPrice,
      volume: quote?.volume?.[quote.volume.length - 1] || 0,
      change: currentPrice - prevClose,
      changePercent: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
      marketCap: meta.marketCap || null,
      exchange: meta.exchangeName || meta.exchange,
      provider: 'yahoo'
    };
  } catch (err) {
    markProviderFailure('yahoo');
    logger.debug(`Yahoo Finance error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 2. Finnhub (60 requests/min)
 */
async function fetchQuoteFinnhub(symbol) {
  if (!isProviderHealthy('finnhub') || !API_KEYS.FINNHUB) return null;

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.FINNHUB}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 429) {
      markProviderFailure('finnhub', true);
      return null;
    }

    const data = await response.json();
    if (!data || data.c === 0) return null;

    markProviderSuccess('finnhub');
    return {
      symbol,
      price: data.c,
      previousClose: data.pc,
      change: data.c - data.pc,
      changePercent: ((data.c - data.pc) / data.pc) * 100,
      high: data.h,
      low: data.l,
      open: data.o,
      volume: null,
      provider: 'finnhub'
    };
  } catch (err) {
    markProviderFailure('finnhub');
    logger.debug(`Finnhub error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 3. Financial Modeling Prep (250 requests/day)
 */
async function fetchQuoteFMP(symbol) {
  if (!isProviderHealthy('fmp') || !API_KEYS.FMP) return null;

  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${API_KEYS.FMP}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 429) {
      markProviderFailure('fmp', true);
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const q = data[0];
    markProviderSuccess('fmp');
    return {
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      previousClose: q.previousClose,
      change: q.change,
      changePercent: q.changesPercentage,
      high: q.dayHigh,
      low: q.dayLow,
      open: q.open,
      volume: q.volume,
      marketCap: q.marketCap,
      provider: 'fmp'
    };
  } catch (err) {
    markProviderFailure('fmp');
    logger.debug(`FMP error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 4. Alpha Vantage (25 requests/day free tier)
 */
async function fetchQuoteAlphaVantage(symbol) {
  if (!isProviderHealthy('alphavantage') || !API_KEYS.ALPHA_VANTAGE) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEYS.ALPHA_VANTAGE}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data['Note'] || data['Information']) {
      markProviderFailure('alphavantage', true);
      return null;
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) return null;

    markProviderSuccess('alphavantage');
    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      previousClose: parseFloat(quote['08. previous close']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent']?.replace('%', '')),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      volume: parseInt(quote['06. volume']),
      provider: 'alphavantage'
    };
  } catch (err) {
    markProviderFailure('alphavantage');
    logger.debug(`Alpha Vantage error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 5. Polygon.io (5 requests/min free tier)
 */
async function fetchQuotePolygon(symbol) {
  if (!isProviderHealthy('polygon') || !API_KEYS.POLYGON) return null;

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${API_KEYS.POLYGON}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 429) {
      markProviderFailure('polygon', true);
      return null;
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) return null;

    const r = data.results[0];
    markProviderSuccess('polygon');
    return {
      symbol,
      price: r.c,
      previousClose: r.c, // Previous day's close
      change: r.c - r.o,
      changePercent: ((r.c - r.o) / r.o) * 100,
      high: r.h,
      low: r.l,
      open: r.o,
      volume: r.v,
      provider: 'polygon'
    };
  } catch (err) {
    markProviderFailure('polygon');
    logger.debug(`Polygon error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 6. Twelve Data (800 requests/day)
 */
async function fetchQuoteTwelveData(symbol) {
  if (!isProviderHealthy('twelvedata') || !API_KEYS.TWELVEDATA) return null;

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${API_KEYS.TWELVEDATA}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 429) {
      markProviderFailure('twelvedata', true);
      return null;
    }

    const data = await response.json();
    if (data.code || !data.close) return null;

    markProviderSuccess('twelvedata');
    return {
      symbol: data.symbol,
      name: data.name,
      price: parseFloat(data.close),
      previousClose: parseFloat(data.previous_close),
      change: parseFloat(data.change),
      changePercent: parseFloat(data.percent_change),
      high: parseFloat(data.high),
      low: parseFloat(data.low),
      open: parseFloat(data.open),
      volume: parseInt(data.volume),
      provider: 'twelvedata'
    };
  } catch (err) {
    markProviderFailure('twelvedata');
    logger.debug(`Twelve Data error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 7. NASDAQ Data Link
 */
async function fetchQuoteNASDAQ(symbol) {
  if (!isProviderHealthy('nasdaq') || !API_KEYS.NASDAQ) return null;

  try {
    const url = `https://data.nasdaq.com/api/v3/datasets/WIKI/${symbol}.json?rows=1&api_key=${API_KEYS.NASDAQ}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 429) {
      markProviderFailure('nasdaq', true);
      return null;
    }

    const data = await response.json();
    if (!data.dataset || !data.dataset.data || data.dataset.data.length === 0) return null;

    const row = data.dataset.data[0];
    markProviderSuccess('nasdaq');
    return {
      symbol,
      price: row[4], // Close
      previousClose: row[4],
      open: row[1],
      high: row[2],
      low: row[3],
      volume: row[5],
      provider: 'nasdaq'
    };
  } catch (err) {
    markProviderFailure('nasdaq');
    logger.debug(`NASDAQ error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * 8. CoinCap API for Cryptocurrency data
 * API Key provided by user
 */
async function fetchQuoteCoinCap(symbol) {
  if (!isProviderHealthy('coincap')) return null;

  const cryptoId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
  if (!cryptoId) return null; // Not a known crypto symbol

  try {
    const headers = {
      'Accept': 'application/json'
    };

    // Add API key if available
    if (API_KEYS.COINCAP) {
      headers['Authorization'] = `Bearer ${API_KEYS.COINCAP}`;
    }

    const url = `https://api.coincap.io/v2/assets/${cryptoId}`;
    const response = await fetchWithTimeout(url, { headers }, 10000);

    if (response.status === 429) {
      markProviderFailure('coincap', true);
      return null;
    }

    if (!response.ok) {
      throw new Error(`CoinCap returned ${response.status}`);
    }

    const data = await response.json();
    const asset = data?.data;
    if (!asset) return null;

    markProviderSuccess('coincap');

    const price = parseFloat(asset.priceUsd);
    const changePercent24h = parseFloat(asset.changePercent24Hr) || 0;
    const previousPrice = price / (1 + changePercent24h / 100);

    return {
      symbol: symbol.toUpperCase(),
      name: asset.name,
      price: price,
      previousClose: previousPrice,
      change: price - previousPrice,
      changePercent: changePercent24h,
      high: null, // CoinCap doesn't provide 24h high in basic endpoint
      low: null,
      open: previousPrice,
      volume: parseFloat(asset.volumeUsd24Hr) || 0,
      marketCap: parseFloat(asset.marketCapUsd) || 0,
      supply: parseFloat(asset.supply) || 0,
      rank: parseInt(asset.rank) || 0,
      provider: 'coincap',
      assetType: 'cryptocurrency'
    };
  } catch (err) {
    markProviderFailure('coincap');
    logger.debug(`CoinCap error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch detailed crypto data including history from CoinCap
 */
async function fetchCryptoHistory(symbol, days = 30) {
  const cryptoId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
  if (!cryptoId) return null;

  try {
    const headers = { 'Accept': 'application/json' };
    if (API_KEYS.COINCAP) {
      headers['Authorization'] = `Bearer ${API_KEYS.COINCAP}`;
    }

    const end = Date.now();
    const start = end - (days * 24 * 60 * 60 * 1000);
    const interval = days <= 7 ? 'h1' : days <= 30 ? 'h6' : 'd1';

    const url = `https://api.coincap.io/v2/assets/${cryptoId}/history?interval=${interval}&start=${start}&end=${end}`;
    const response = await fetchWithTimeout(url, { headers }, 15000);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.data) return null;

    return data.data.map(point => ({
      date: new Date(point.time).toISOString().split('T')[0],
      price: parseFloat(point.priceUsd),
      time: point.time
    }));
  } catch (err) {
    logger.debug(`CoinCap history error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Check if symbol is a cryptocurrency
 */
function isCryptocurrency(symbol) {
  return CRYPTO_SYMBOL_MAP.hasOwnProperty(symbol.toUpperCase());
}

/**
 * Check if symbol is an ETF
 */
function isETF(symbol) {
  return KNOWN_ETFS.has(symbol.toUpperCase());
}

/**
 * Fetch ETF-specific data from Yahoo Finance
 * ETFs have holdings, expense ratios, and yield data
 */
async function fetchETFData(symbol) {
  if (!isProviderHealthy('yahoo')) return null;
  if (!KNOWN_ETFS.has(symbol.toUpperCase())) return null;

  try {
    const yahooFinance = require('yahoo-finance2').default;

    const quoteSummary = await yahooFinance.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'fundProfile', 'topHoldings']
    });

    const price = quoteSummary.price || {};
    const summary = quoteSummary.summaryDetail || {};
    const stats = quoteSummary.defaultKeyStatistics || {};
    const profile = quoteSummary.fundProfile || {};
    const holdings = quoteSummary.topHoldings || {};

    return {
      symbol: symbol.toUpperCase(),
      name: price.shortName || price.longName || symbol,
      price: price.regularMarketPrice,
      previousClose: price.regularMarketPreviousClose,
      change: price.regularMarketChange,
      changePercent: price.regularMarketChangePercent * 100,
      volume: price.regularMarketVolume,
      avgVolume: summary.averageVolume,

      // ETF-specific data
      assetType: 'etf',
      expenseRatio: stats.annualReportExpenseRatio || profile.feesExpensesInvestment?.annualReportExpenseRatio,
      yield: summary.yield,
      dividendYield: summary.dividendYield,
      ytdReturn: stats.ytdReturn,
      threeYearReturn: stats.threeYearAverageReturn,
      fiveYearReturn: stats.fiveYearAverageReturn,
      beta: summary.beta || stats.beta3Year,
      totalAssets: summary.totalAssets,

      // Fund info
      category: profile.categoryName,
      family: profile.family,
      legalType: profile.legalType,

      // Top holdings
      topHoldings: holdings.holdings?.slice(0, 10)?.map(h => ({
        symbol: h.symbol,
        name: h.holdingName,
        weight: h.holdingPercent
      })) || [],

      // Sector weights
      sectorWeights: holdings.sectorWeightings?.map(s => {
        const key = Object.keys(s)[0];
        return { sector: key, weight: s[key] };
      }) || [],

      provider: 'yahoo-etf'
    };
  } catch (err) {
    logger.debug(`ETF data error for ${symbol}: ${err.message}`);
    return null;
  }
}

// ============================================================================
// HISTORICAL DATA PROVIDERS
// ============================================================================

/**
 * Fetch historical data from Yahoo Finance (1 year)
 */
async function fetchHistoricalYahoo(symbol, days = 365) {
  if (!isProviderHealthy('yahoo')) return null;

  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (days * 24 * 60 * 60);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, 15000);

    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) return null;

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const adjClose = result.indicators.adjclose?.[0]?.adjclose;

    const history = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      adjClose: adjClose?.[i] || quote.close[i],
      volume: quote.volume[i]
    })).filter(d => d.close !== null);

    markProviderSuccess('yahoo');
    logger.info(`[History] Yahoo: ${symbol} returned ${history.length} days`);
    return history;
  } catch (err) {
    markProviderFailure('yahoo');
    logger.debug(`Yahoo history error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch historical data from FMP (1 year)
 */
async function fetchHistoricalFMP(symbol, days = 365) {
  if (!isProviderHealthy('fmp') || !API_KEYS.FMP) return null;

  try {
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${API_KEYS.FMP}`;
    const response = await fetchWithTimeout(url, {}, 15000);

    if (response.status === 429) {
      markProviderFailure('fmp', true);
      return null;
    }

    const data = await response.json();
    if (!data.historical) return null;

    const history = data.historical
      .slice(0, days)
      .reverse()
      .map(d => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        adjClose: d.adjClose || d.close,
        volume: d.volume
      }));

    markProviderSuccess('fmp');
    logger.info(`[History] FMP: ${symbol} returned ${history.length} days`);
    return history;
  } catch (err) {
    markProviderFailure('fmp');
    logger.debug(`FMP history error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch historical data from Alpha Vantage (1 year)
 */
async function fetchHistoricalAlphaVantage(symbol, days = 365) {
  if (!isProviderHealthy('alphavantage') || !API_KEYS.ALPHA_VANTAGE) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${API_KEYS.ALPHA_VANTAGE}`;
    const response = await fetchWithTimeout(url, {}, 15000);
    const data = await response.json();

    if (data['Note'] || data['Information']) {
      markProviderFailure('alphavantage', true);
      return null;
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) return null;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const history = Object.entries(timeSeries)
      .filter(([dateStr]) => new Date(dateStr) >= cutoffDate)
      .map(([dateStr, values]) => ({
        date: dateStr,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        adjClose: parseFloat(values['5. adjusted close']),
        volume: parseInt(values['6. volume'])
      }))
      .reverse();

    markProviderSuccess('alphavantage');
    logger.info(`[History] Alpha Vantage: ${symbol} returned ${history.length} days`);
    return history;
  } catch (err) {
    markProviderFailure('alphavantage');
    logger.debug(`Alpha Vantage history error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch historical data from Polygon (1 year)
 */
async function fetchHistoricalPolygon(symbol, days = 365) {
  if (!isProviderHealthy('polygon') || !API_KEYS.POLYGON) return null;

  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${API_KEYS.POLYGON}`;

    const response = await fetchWithTimeout(url, {}, 15000);

    if (response.status === 429) {
      markProviderFailure('polygon', true);
      return null;
    }

    const data = await response.json();
    if (!data.results) return null;

    const history = data.results.map(r => ({
      date: new Date(r.t).toISOString().split('T')[0],
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      adjClose: r.c,
      volume: r.v
    }));

    markProviderSuccess('polygon');
    logger.info(`[History] Polygon: ${symbol} returned ${history.length} days`);
    return history;
  } catch (err) {
    markProviderFailure('polygon');
    logger.debug(`Polygon history error for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch historical data from Twelve Data
 */
async function fetchHistoricalTwelveData(symbol, days = 365) {
  if (!isProviderHealthy('twelvedata') || !API_KEYS.TWELVEDATA) return null;

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=${days}&apikey=${API_KEYS.TWELVEDATA}`;
    const response = await fetchWithTimeout(url, {}, 15000);

    if (response.status === 429) {
      markProviderFailure('twelvedata', true);
      return null;
    }

    const data = await response.json();
    if (data.code || !data.values) return null;

    const history = data.values
      .reverse()
      .map(v => ({
        date: v.datetime,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        adjClose: parseFloat(v.close),
        volume: parseInt(v.volume)
      }));

    markProviderSuccess('twelvedata');
    logger.info(`[History] Twelve Data: ${symbol} returned ${history.length} days`);
    return history;
  } catch (err) {
    markProviderFailure('twelvedata');
    logger.debug(`Twelve Data history error for ${symbol}: ${err.message}`);
    return null;
  }
}

// ============================================================================
// MARKET DATA SERVICE CLASS
// ============================================================================

class MarketDataService {

  /**
   * Get quote with 7-provider fallback
   */
  static async getQuote(symbol) {
    const validSymbol = validateSymbol(symbol);
    if (!validSymbol) return null;
    symbol = validSymbol;

    // Check cache first
    const cached = quoteCache.get(symbol);
    if (cached) return cached;

    // Check database cache
    try {
      const dbQuote = await prisma.stockQuote.findUnique({ where: { symbol } });
      if (dbQuote && (Date.now() - new Date(dbQuote.updatedAt).getTime()) < 300000) {
        const quote = this.formatQuote(dbQuote);
        quoteCache.set(symbol, quote);
        return quote;
      }
    } catch (err) {
      logger.debug(`DB cache check failed: ${err.message}`);
    }

    // Fetch from API with multi-provider fallback
    const quote = await this.fetchQuoteWithFallback(symbol);

    if (quote) {
      quoteCache.set(symbol, quote);
      await this.saveQuoteToDB(symbol, quote);
      return quote;
    }

    // Return stale DB data if available
    try {
      const dbQuote = await prisma.stockQuote.findUnique({ where: { symbol } });
      if (dbQuote) {
        logger.warn(`Returning stale data for ${symbol}`);
        return this.formatQuote(dbQuote);
      }
    } catch (err) {
      logger.debug(`Stale data fetch failed: ${err.message}`);
    }

    return null;
  }

  /**
   * Fetch quote with intelligent 7-provider fallback
   */
  static async fetchQuoteWithFallback(symbol) {
    // Check if it's a cryptocurrency - use CoinCap first
    if (isCryptocurrency(symbol)) {
      try {
        const cryptoQuote = await fetchQuoteCoinCap(symbol);
        if (cryptoQuote) {
          logger.info(`[Quote] ${symbol} from CoinCap (crypto): $${cryptoQuote.price}`);
          return cryptoQuote;
        }
      } catch (err) {
        logger.debug(`CoinCap failed for ${symbol}: ${err.message}`);
      }
    }

    // Check if it's an ETF - use Yahoo with enhanced data
    if (isETF(symbol)) {
      try {
        const etfData = await fetchETFData(symbol);
        if (etfData) {
          logger.info(`[Quote] ${symbol} from Yahoo-ETF: $${etfData.price}`);
          return etfData;
        }
      } catch (err) {
        logger.debug(`ETF data failed for ${symbol}: ${err.message}`);
      }
    }

    // Standard stock providers
    const providers = [
      { name: 'Yahoo', fn: fetchQuoteYahoo },
      { name: 'Finnhub', fn: fetchQuoteFinnhub },
      { name: 'FMP', fn: fetchQuoteFMP },
      { name: 'Polygon', fn: fetchQuotePolygon },
      { name: 'TwelveData', fn: fetchQuoteTwelveData },
      { name: 'AlphaVantage', fn: fetchQuoteAlphaVantage },
      { name: 'NASDAQ', fn: fetchQuoteNASDAQ }
    ];

    for (const provider of providers) {
      try {
        const quote = await provider.fn(symbol);
        if (quote) {
          logger.info(`[Quote] ${symbol} from ${provider.name}: $${quote.price}`);
          return quote;
        }
      } catch (err) {
        logger.debug(`${provider.name} failed for ${symbol}: ${err.message}`);
      }
    }

    logger.error(`[Quote] ALL PROVIDERS FAILED for ${symbol}`);
    return null;
  }

  /**
   * Get quotes for multiple symbols
   */
  static async getQuotes(symbols) {
    if (!symbols || symbols.length === 0) return {};

    const results = {};
    const toFetch = [];

    // Check cache first
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const cached = quoteCache.get(upper);
      if (cached) {
        results[upper] = cached;
      } else {
        toFetch.push(upper);
      }
    }

    // Fetch remaining in parallel (limited batch)
    const batchSize = 10;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      const promises = batch.map(symbol => this.getQuote(symbol));
      const quotes = await Promise.all(promises);

      batch.forEach((symbol, idx) => {
        if (quotes[idx]) {
          results[symbol] = quotes[idx];
        }
      });
    }

    return results;
  }

  /**
   * Get historical prices with multi-provider fallback (default 365 days)
   */
  static async getHistoricalPrices(symbol, days = 365) {
    const validSymbol = validateSymbol(symbol);
    if (!validSymbol) return [];
    symbol = validSymbol;

    // Check cache
    const cacheKey = `${symbol}_${days}`;
    const cached = historyCache.get(cacheKey);
    if (cached) return cached;

    // Check database first
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const dbHistory = await prisma.stockHistory.findMany({
        where: { symbol, date: { gte: cutoffDate } },
        orderBy: { date: 'asc' }
      });

      if (dbHistory.length > days * 0.9) {
        historyCache.set(cacheKey, dbHistory);
        return dbHistory;
      }
    } catch (err) {
      logger.debug(`DB history check failed: ${err.message}`);
    }

    // Fetch from API with fallback
    const history = await this.fetchHistoricalWithFallback(symbol, days);

    if (history && history.length > 0) {
      historyCache.set(cacheKey, history);
      await this.saveHistoryToDB(symbol, history);
      return history;
    }

    return [];
  }

  /**
   * Fetch historical data with 5-provider fallback
   */
  static async fetchHistoricalWithFallback(symbol, days) {
    const providers = [
      { name: 'Yahoo', fn: fetchHistoricalYahoo },
      { name: 'FMP', fn: fetchHistoricalFMP },
      { name: 'Polygon', fn: fetchHistoricalPolygon },
      { name: 'TwelveData', fn: fetchHistoricalTwelveData },
      { name: 'AlphaVantage', fn: fetchHistoricalAlphaVantage }
    ];

    for (const provider of providers) {
      try {
        const history = await provider.fn(symbol, days);
        if (history && history.length > 0) {
          logger.info(`[History] ${symbol} from ${provider.name}: ${history.length} days`);
          return history;
        }
      } catch (err) {
        logger.debug(`${provider.name} history failed for ${symbol}: ${err.message}`);
      }
    }

    logger.error(`[History] ALL PROVIDERS FAILED for ${symbol}`);
    return [];
  }

  /**
   * Get company profile/overview
   */
  static async getCompanyProfile(symbol) {
    symbol = symbol.toUpperCase();

    const cached = profileCache.get(symbol);
    if (cached) return cached;

    try {
      const dbProfile = await prisma.companyProfile.findUnique({ where: { symbol } });
      if (dbProfile) {
        profileCache.set(symbol, dbProfile);
        return dbProfile;
      }
    } catch (err) {
      logger.debug(`DB profile check failed: ${err.message}`);
    }

    // Try FMP first for profiles
    if (API_KEYS.FMP && isProviderHealthy('fmp')) {
      try {
        const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEYS.FMP}`;
        const response = await fetchWithTimeout(url);
        const data = await response.json();

        if (data && data.length > 0) {
          const p = data[0];
          const profile = {
            symbol: p.symbol,
            name: p.companyName,
            description: p.description,
            exchange: p.exchangeShortName,
            sector: p.sector,
            industry: p.industry,
            employees: p.fullTimeEmployees,
            ceo: p.ceo,
            headquarters: `${p.city}, ${p.state}, ${p.country}`,
            website: p.website
          };

          await prisma.companyProfile.upsert({
            where: { symbol },
            create: profile,
            update: profile
          });

          profileCache.set(symbol, profile);
          return profile;
        }
      } catch (err) {
        logger.debug(`FMP profile error: ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Get dividend history
   */
  static async getDividendHistory(symbol) {
    symbol = symbol.toUpperCase();

    try {
      const dbDividends = await prisma.dividendHistory.findMany({
        where: { symbol },
        orderBy: { exDate: 'desc' }
      });

      if (dbDividends.length > 0) {
        const daysSinceUpdate = (Date.now() - new Date(dbDividends[0].exDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 90) {
          return dbDividends;
        }
      }
    } catch (err) {
      logger.debug(`DB dividend check failed: ${err.message}`);
    }

    // Try FMP for dividends
    if (API_KEYS.FMP && isProviderHealthy('fmp')) {
      try {
        const url = `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${symbol}?apikey=${API_KEYS.FMP}`;
        const response = await fetchWithTimeout(url);
        const data = await response.json();

        if (data.historical && data.historical.length > 0) {
          const dividends = data.historical.slice(0, 20).map(d => ({
            symbol,
            exDate: new Date(d.date),
            payDate: d.paymentDate ? new Date(d.paymentDate) : null,
            recordDate: d.recordDate ? new Date(d.recordDate) : null,
            amount: d.dividend,
            frequency: 'quarterly',
            type: 'regular'
          }));

          await this.saveDividendsToDB(symbol, dividends);
          return dividends;
        }
      } catch (err) {
        logger.debug(`FMP dividend error: ${err.message}`);
      }
    }

    return [];
  }

  /**
   * Get provider health status
   */
  static getProviderHealth() {
    return Object.entries(providerHealth).map(([name, health]) => ({
      name,
      healthy: isProviderHealthy(name),
      failures: health.failures,
      cooldownUntil: health.cooldownUntil > Date.now()
        ? new Date(health.cooldownUntil).toISOString()
        : null
    }));
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  static formatQuote(dbQuote) {
    return {
      symbol: dbQuote.symbol,
      name: dbQuote.name,
      price: Number(dbQuote.price),
      previousClose: Number(dbQuote.previousClose),
      open: Number(dbQuote.open),
      high: Number(dbQuote.high),
      low: Number(dbQuote.low),
      volume: Number(dbQuote.volume),
      avgVolume: Number(dbQuote.avgVolume),
      marketCap: Number(dbQuote.marketCap),
      peRatio: Number(dbQuote.peRatio),
      eps: Number(dbQuote.eps),
      dividend: Number(dbQuote.dividend),
      dividendYield: Number(dbQuote.dividendYield),
      beta: Number(dbQuote.beta),
      week52High: Number(dbQuote.week52High),
      week52Low: Number(dbQuote.week52Low),
      change: Number(dbQuote.change),
      changePercent: Number(dbQuote.changePercent),
      sector: dbQuote.sector,
      exchange: dbQuote.exchange
    };
  }

  static async saveQuoteToDB(symbol, quote) {
    try {
      const now = new Date().toISOString();
      await prisma.stockQuote.upsert({
        where: { symbol },
        create: {
          symbol,
          name: quote.name || null,
          price: quote.price,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume || null,
          marketCap: quote.marketCap || null,
          change: quote.change,
          changePercent: quote.changePercent,
          updatedAt: now
        },
        update: {
          name: quote.name || undefined,
          price: quote.price,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume || null,
          marketCap: quote.marketCap || null,
          change: quote.change,
          changePercent: quote.changePercent,
          updatedAt: now
        }
      });
    } catch (err) {
      logger.error(`Failed to save quote for ${symbol}: ${err.message}`);
    }
  }

  static async saveHistoryToDB(symbol, history) {
    try {
      for (const record of history.slice(-100)) { // Save last 100 days
        await prisma.stockHistory.upsert({
          where: { symbol_date: { symbol, date: new Date(record.date) } },
          create: {
            symbol,
            date: new Date(record.date),
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            adjClose: record.adjClose || record.close,
            volume: record.volume
          },
          update: {
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            adjClose: record.adjClose || record.close,
            volume: record.volume
          }
        });
      }
      logger.info(`Saved ${Math.min(history.length, 100)} history records for ${symbol}`);
    } catch (err) {
      logger.error(`Failed to save history for ${symbol}: ${err.message}`);
    }
  }

  static async saveDividendsToDB(symbol, dividends) {
    try {
      for (const div of dividends) {
        await prisma.dividendHistory.upsert({
          where: { symbol_exDate: { symbol: div.symbol, exDate: div.exDate } },
          update: {
            payDate: div.payDate,
            recordDate: div.recordDate,
            amount: div.amount,
            frequency: div.frequency,
            type: div.type
          },
          create: div
        });
      }
      logger.info(`Saved ${dividends.length} dividends for ${symbol}`);
    } catch (err) {
      logger.error(`Failed to save dividends for ${symbol}: ${err.message}`);
    }
  }

  static async updateAllQuotes() {
    try {
      const holdings = await prisma.holdings.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      const symbols = holdings.map(h => h.symbol);
      logger.info(`Updating quotes for ${symbols.length} symbols`);

      for (const symbol of symbols) {
        try {
          await this.getQuote(symbol);
        } catch (err) {
          logger.error(`Failed to update ${symbol}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`updateAllQuotes failed: ${err.message}`);
    }
  }

  /**
   * Get cryptocurrency data from CoinCap
   */
  static async getCryptoQuote(symbol) {
    if (!isCryptocurrency(symbol)) {
      return null;
    }
    return await fetchQuoteCoinCap(symbol);
  }

  /**
   * Get cryptocurrency historical data
   */
  static async getCryptoHistory(symbol, days = 30) {
    return await fetchCryptoHistory(symbol, days);
  }

  /**
   * Get ETF-specific data
   */
  static async getETFData(symbol) {
    if (!isETF(symbol)) {
      return null;
    }
    return await fetchETFData(symbol);
  }

  /**
   * Check if symbol is a cryptocurrency
   */
  static isCryptocurrency(symbol) {
    return isCryptocurrency(symbol);
  }

  /**
   * Check if symbol is an ETF
   */
  static isETF(symbol) {
    return isETF(symbol);
  }

  /**
   * Get asset type for a symbol
   */
  static getAssetType(symbol) {
    const upperSymbol = symbol.toUpperCase();
    if (isCryptocurrency(upperSymbol)) return 'cryptocurrency';
    if (isETF(upperSymbol)) return 'etf';
    return 'stock';
  }

  /**
   * Get list of supported cryptocurrencies
   */
  static getSupportedCryptos() {
    return Object.keys(CRYPTO_SYMBOL_MAP);
  }

  /**
   * Get list of known ETFs
   */
  static getKnownETFs() {
    return Array.from(KNOWN_ETFS);
  }
}

module.exports = MarketDataService;
