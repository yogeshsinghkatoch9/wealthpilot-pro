const { prisma } = require('../db/simpleDb');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');


// Cache quotes for 1 minute, profiles for 1 hour
const quoteCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const profileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const POLYGON_KEY = process.env.POLYGON_API_KEY;

// Rate limiting for Alpha Vantage (5 calls/min free tier)
let lastApiCall = 0;
const API_CALL_DELAY = 12000; // 12 seconds between calls

async function rateLimitedFetch(url) {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;

  if (timeSinceLastCall < API_CALL_DELAY) {
    await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY - timeSinceLastCall));
  }

  lastApiCall = Date.now();
  const response = await fetch(url);
  return response.json();
}

/**
 * Fetch quote from Yahoo Finance (no API key required)
 */
async function fetchFromYahooFinance(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return null;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const currentPrice = meta.regularMarketPrice;

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
      exchange: meta.exchangeName || meta.exchange
    };
  } catch (err) {
    logger.error(`Yahoo Finance error for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Market Data Service
 * Fetches real-time and historical stock data
 */
class MarketDataService {
  
  /**
   * Get quote for single symbol
   */
  static async getQuote(symbol) {
    symbol = symbol.toUpperCase();
    
    // Check cache first
    const cached = quoteCache.get(symbol);
    if (cached) return cached;

    // Check database cache
    const dbQuote = await prisma.stockQuote.findUnique({
      where: { symbol }
    });

    // If DB quote is fresh (< 5 min), use it
    if (dbQuote && (Date.now() - new Date(dbQuote.updatedAt).getTime()) < 300000) {
      const quote = this.formatQuote(dbQuote);
      quoteCache.set(symbol, quote);
      return quote;
    }

    // Fetch from API
    try {
      const quote = await this.fetchQuoteFromAPI(symbol);
      if (quote) {
        quoteCache.set(symbol, quote);
        await this.saveQuoteToDB(symbol, quote);
      }
      return quote;
    } catch (err) {
      logger.error(`Failed to fetch quote for ${symbol}:`, err);
      // Return stale DB data if available
      if (dbQuote) {
        return this.formatQuote(dbQuote);
      }
      return null;
    }
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
      const cached = quoteCache.get(symbol.toUpperCase());
      if (cached) {
        results[symbol.toUpperCase()] = cached;
      } else {
        toFetch.push(symbol.toUpperCase());
      }
    }

    // Check DB for remaining
    if (toFetch.length > 0) {
      const dbQuotes = await prisma.stockQuote.findMany({
        where: { symbol: { in: toFetch } }
      });

      for (const dbQuote of dbQuotes) {
        const quote = this.formatQuote(dbQuote);
        results[dbQuote.symbol] = quote;
        quoteCache.set(dbQuote.symbol, quote);
        
        // Remove from fetch list if fresh
        const age = Date.now() - new Date(dbQuote.updatedAt).getTime();
        if (age < 300000) {
          const idx = toFetch.indexOf(dbQuote.symbol);
          if (idx > -1) toFetch.splice(idx, 1);
        }
      }
    }

    // Fetch remaining from API (batch if possible)
    for (const symbol of toFetch.slice(0, 5)) { // Limit API calls
      try {
        const quote = await this.fetchQuoteFromAPI(symbol);
        if (quote) {
          results[symbol] = quote;
          quoteCache.set(symbol, quote);
          await this.saveQuoteToDB(symbol, quote);
        }
      } catch (err) {
        logger.error(`Failed to fetch ${symbol}:`, err);
      }
    }

    return results;
  }

  /**
   * Fetch quote from API - tries Yahoo Finance first (free), then Alpha Vantage
   */
  static async fetchQuoteFromAPI(symbol) {
    // Try Yahoo Finance first (free, no API key required)
    const yahooQuote = await fetchFromYahooFinance(symbol);
    if (yahooQuote) {
      logger.info(`Got quote for ${symbol} from Yahoo Finance: $${yahooQuote.price}`);
      return yahooQuote;
    }

    // Fall back to Alpha Vantage if configured
    if (!ALPHA_VANTAGE_KEY) {
      logger.warn(`No quote available for ${symbol} - Yahoo failed and no Alpha Vantage key`);
      return null;
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;

    try {
      const data = await rateLimitedFetch(url);

      if (data['Note']) {
        logger.warn('Alpha Vantage rate limit hit');
        return null;
      }

      const quote = data['Global Quote'];
      if (!quote || !quote['05. price']) {
        logger.warn(`No quote data for ${symbol}`);
        return null;
      }

      return {
        symbol,
        price: parseFloat(quote['05. price']),
        previousClose: parseFloat(quote['08. previous close']),
        open: parseFloat(quote['02. open']),
        high: parseFloat(quote['03. high']),
        low: parseFloat(quote['04. low']),
        volume: parseInt(quote['06. volume']),
        change: parseFloat(quote['09. change']),
        changePercent: parseFloat(quote['10. change percent']?.replace('%', ''))
      };
    } catch (err) {
      logger.error(`API fetch error for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Get company profile/overview
   */
  static async getCompanyProfile(symbol) {
    symbol = symbol.toUpperCase();
    
    // Check cache
    const cached = profileCache.get(symbol);
    if (cached) return cached;

    // Check database
    const dbProfile = await prisma.companyProfile.findUnique({
      where: { symbol }
    });

    if (dbProfile) {
      profileCache.set(symbol, dbProfile);
      return dbProfile;
    }

    // Fetch from API
    if (!ALPHA_VANTAGE_KEY) {
      logger.warn('No Alpha Vantage API key configured for profile');
      return null;
    }

    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      const data = await rateLimitedFetch(url);

      if (!data.Symbol) {
        logger.warn(`No profile data for ${symbol}`);
        return null;
      }

      const profile = {
        symbol: data.Symbol,
        name: data.Name,
        description: data.Description,
        exchange: data.Exchange,
        sector: data.Sector,
        industry: data.Industry,
        employees: parseInt(data.FullTimeEmployees) || null,
        ceo: null,
        headquarters: data.Address,
        website: null
      };

      // Save to DB
      await prisma.companyProfile.upsert({
        where: { symbol },
        create: profile,
        update: profile
      });

      profileCache.set(symbol, profile);
      return profile;
    } catch (err) {
      logger.error(`Profile fetch error for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Get historical price data
   */
  static async getHistoricalPrices(symbol, days = 365) {
    symbol = symbol.toUpperCase();

    // Check database first
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const dbHistory = await prisma.stockHistory.findMany({
      where: {
        symbol,
        date: { gte: cutoffDate }
      },
      orderBy: { date: 'asc' }
    });

    if (dbHistory.length > days * 0.9) {
      return dbHistory;
    }

    // Fetch from API
    if (!ALPHA_VANTAGE_KEY) {
      logger.warn('No Alpha Vantage API key configured for history');
      return [];
    }

    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
      const data = await rateLimitedFetch(url);

      if (!data['Time Series (Daily)']) {
        logger.warn(`No historical data for ${symbol}`);
        return [];
      }

      const timeSeries = data['Time Series (Daily)'];
      const history = [];

      for (const [dateStr, values] of Object.entries(timeSeries)) {
        const date = new Date(dateStr);
        if (date < cutoffDate) continue;

        history.push({
          symbol,
          date,
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          adjClose: parseFloat(values['5. adjusted close']),
          volume: parseInt(values['6. volume'])
        });
      }

      // Save to DB
      for (const record of history) {
        await prisma.stockHistory.upsert({
          where: {
            symbol_date: { symbol: record.symbol, date: record.date }
          },
          create: record,
          update: record
        });
      }

      return history.sort((a, b) => a.date - b.date);
    } catch (err) {
      logger.error(`History fetch error for ${symbol}:`, err);
      return [];
    }
  }

  /**
   * Get dividend history
   */
  static async getDividendHistory(symbol) {
    symbol = symbol.toUpperCase();

    // Check database cache first
    const dbDividends = await prisma.dividendHistory.findMany({
      where: { symbol },
      orderBy: { exDate: 'desc' }
    });

    // Return cached if we have recent data (within 7 days)
    if (dbDividends.length > 0) {
      const latestUpdate = dbDividends[0];
      const daysSinceUpdate = (Date.now() - new Date(latestUpdate.exDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 90) { // Dividend data doesn't change frequently
        return dbDividends;
      }
    }

    // Try to fetch from Alpha Vantage API
    if (ALPHA_VANTAGE_KEY) {
      try {
        const apiDividends = await this.fetchDividendsFromAPI(symbol);
        if (apiDividends && apiDividends.length > 0) {
          // Save to database
          await this.saveDividendsToDB(symbol, apiDividends);
          return apiDividends;
        }
      } catch (err) {
        logger.error(`Failed to fetch dividends for ${symbol} from API:`, err.message);
      }
    }

    // Return cached data if available, otherwise empty array
    if (dbDividends.length > 0) {
      return dbDividends;
    }

    logger.warn(`No dividend data available for ${symbol}`);
    return [];
  }

  /**
   * Fetch dividend data from Alpha Vantage API
   */
  static async fetchDividendsFromAPI(symbol) {
    const url = `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;

    try {
      const data = await rateLimitedFetch(url);

      if (data['Note'] || data['Information']) {
        logger.warn('Alpha Vantage rate limit hit for dividends');
        return null;
      }

      if (!data.data || !Array.isArray(data.data)) {
        return null;
      }

      return data.data.slice(0, 20).map(d => ({
        symbol,
        exDate: new Date(d.ex_dividend_date),
        payDate: d.payment_date ? new Date(d.payment_date) : null,
        recordDate: d.record_date ? new Date(d.record_date) : null,
        amount: parseFloat(d.amount) || 0,
        frequency: this.inferDividendFrequency(data.data),
        type: 'regular'
      }));
    } catch (err) {
      logger.error(`Alpha Vantage dividends error for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * Infer dividend frequency from history
   */
  static inferDividendFrequency(dividends) {
    if (!dividends || dividends.length < 2) return 'unknown';

    const dates = dividends.slice(0, 4).map(d => new Date(d.ex_dividend_date));
    if (dates.length < 2) return 'unknown';

    const avgDays = (dates[0] - dates[dates.length - 1]) / (dates.length - 1) / (1000 * 60 * 60 * 24);

    if (avgDays < 45) return 'monthly';
    if (avgDays < 120) return 'quarterly';
    if (avgDays < 240) return 'semi-annual';
    return 'annual';
  }

  /**
   * Save dividends to database
   */
  static async saveDividendsToDB(symbol, dividends) {
    try {
      for (const div of dividends) {
        await prisma.dividendHistory.upsert({
          where: {
            symbol_exDate: {
              symbol: div.symbol,
              exDate: div.exDate
            }
          },
          update: {
            payDate: div.payDate,
            recordDate: div.recordDate,
            amount: div.amount,
            frequency: div.frequency,
            type: div.type
          },
          create: {
            symbol: div.symbol,
            exDate: div.exDate,
            payDate: div.payDate,
            recordDate: div.recordDate,
            amount: div.amount,
            frequency: div.frequency,
            type: div.type
          }
        });
      }
      logger.info(`Saved ${dividends.length} dividends for ${symbol}`);
    } catch (err) {
      logger.error(`Failed to save dividends for ${symbol}:`, err.message);
    }
  }

  /**
   * Update all tracked quotes
   */
  static async updateAllQuotes() {
    // Get all unique symbols from holdings
    const holdings = await prisma.holding.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });

    const symbols = holdings.map(h => h.symbol);
    logger.info(`Updating quotes for ${symbols.length} symbols`);

    for (const symbol of symbols) {
      try {
        await this.getQuote(symbol);
      } catch (err) {
        logger.error(`Failed to update ${symbol}:`, err);
      }
    }
  }

  // Helper methods

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
          price: quote.price,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume || null,
          change: quote.change,
          changePercent: quote.changePercent,
          updatedAt: now
        },
        update: {
          price: quote.price,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume || null,
          change: quote.change,
          changePercent: quote.changePercent,
          updatedAt: now
        }
      });
    } catch (err) {
      logger.error(`Failed to save quote for ${symbol}:`, err);
    }
  }

  // REMOVED: All mock data functions have been deleted
  // The service now returns null or empty arrays when APIs fail
  // This ensures only real data is displayed to users
}

module.exports = MarketDataService;
