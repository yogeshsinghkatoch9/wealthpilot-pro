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
   * Fetch quote from Alpha Vantage API
   */
  static async fetchQuoteFromAPI(symbol) {
    if (!ALPHA_VANTAGE_KEY) {
      logger.warn('No Alpha Vantage API key configured');
      return this.getMockQuote(symbol);
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    
    try {
      const data = await rateLimitedFetch(url);
      
      if (data['Note']) {
        logger.warn('Alpha Vantage rate limit hit');
        return this.getMockQuote(symbol);
      }

      const quote = data['Global Quote'];
      if (!quote || !quote['05. price']) {
        logger.warn(`No quote data for ${symbol}`);
        return this.getMockQuote(symbol);
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
      return this.getMockQuote(symbol);
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
      return this.getMockProfile(symbol);
    }

    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      const data = await rateLimitedFetch(url);

      if (!data.Symbol) {
        return this.getMockProfile(symbol);
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
      return this.getMockProfile(symbol);
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
      return this.getMockHistory(symbol, days);
    }

    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
      const data = await rateLimitedFetch(url);

      if (!data['Time Series (Daily)']) {
        return this.getMockHistory(symbol, days);
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
      return this.getMockHistory(symbol, days);
    }
  }

  /**
   * Get dividend history
   */
  static async getDividendHistory(symbol) {
    symbol = symbol.toUpperCase();

    const dbDividends = await prisma.dividendHistory.findMany({
      where: { symbol },
      orderBy: { exDate: 'desc' }
    });

    if (dbDividends.length > 0) {
      return dbDividends;
    }

    // Would fetch from API here
    return this.getMockDividends(symbol);
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

  // Mock data for development/fallback
  static getMockQuote(symbol) {
    const mockData = {
      'AAPL': { price: 189.65, previousClose: 188.42, change: 1.23, changePercent: 0.65, sector: 'Technology', name: 'Apple Inc.' },
      'MSFT': { price: 428.42, previousClose: 425.18, change: 3.24, changePercent: 0.76, sector: 'Technology', name: 'Microsoft Corp' },
      'GOOGL': { price: 174.82, previousClose: 173.24, change: 1.58, changePercent: 0.91, sector: 'Technology', name: 'Alphabet Inc.' },
      'NVDA': { price: 142.84, previousClose: 140.12, change: 2.72, changePercent: 1.94, sector: 'Technology', name: 'NVIDIA Corp' },
      'META': { price: 584.24, previousClose: 578.42, change: 5.82, changePercent: 1.01, sector: 'Technology', name: 'Meta Platforms' },
      'TSLA': { price: 248.42, previousClose: 252.18, change: -3.76, changePercent: -1.49, sector: 'Consumer Cyclical', name: 'Tesla Inc.' },
      'AMZN': { price: 218.64, previousClose: 216.42, change: 2.22, changePercent: 1.03, sector: 'Consumer Cyclical', name: 'Amazon.com Inc.' },
      'JPM': { price: 198.24, previousClose: 196.84, change: 1.40, changePercent: 0.71, sector: 'Financial Services', name: 'JPMorgan Chase' },
      'V': { price: 284.62, previousClose: 282.48, change: 2.14, changePercent: 0.76, sector: 'Financial Services', name: 'Visa Inc.' },
      'JNJ': { price: 156.42, previousClose: 155.84, change: 0.58, changePercent: 0.37, sector: 'Healthcare', name: 'Johnson & Johnson' },
      'UNH': { price: 584.24, previousClose: 582.18, change: 2.06, changePercent: 0.35, sector: 'Healthcare', name: 'UnitedHealth Group' },
      'SPY': { price: 584.82, previousClose: 582.24, change: 2.58, changePercent: 0.44, sector: 'ETF', name: 'SPDR S&P 500 ETF' },
      'VZ': { price: 42.84, previousClose: 42.62, change: 0.22, changePercent: 0.52, sector: 'Communication Services', name: 'Verizon' },
      'T': { price: 22.48, previousClose: 22.36, change: 0.12, changePercent: 0.54, sector: 'Communication Services', name: 'AT&T' },
      'INTC': { price: 24.18, previousClose: 24.86, change: -0.68, changePercent: -2.73, sector: 'Technology', name: 'Intel Corp' }
    };

    const mock = mockData[symbol] || {
      price: 100 + Math.random() * 100,
      previousClose: 100 + Math.random() * 100,
      change: (Math.random() - 0.5) * 5,
      changePercent: (Math.random() - 0.5) * 3,
      sector: 'Unknown',
      name: symbol
    };

    return {
      symbol,
      ...mock,
      open: mock.previousClose * (1 + (Math.random() - 0.5) * 0.01),
      high: mock.price * 1.02,
      low: mock.price * 0.98,
      volume: Math.floor(Math.random() * 50000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      peRatio: 15 + Math.random() * 30,
      dividendYield: Math.random() * 4,
      week52High: mock.price * 1.3,
      week52Low: mock.price * 0.7
    };
  }

  static getMockProfile(symbol) {
    return {
      symbol,
      name: symbol + ' Inc.',
      description: 'A publicly traded company.',
      exchange: 'NASDAQ',
      sector: 'Technology',
      industry: 'Software',
      employees: Math.floor(Math.random() * 100000),
      ceo: 'John Smith',
      headquarters: 'San Francisco, CA',
      website: `https://www.${symbol.toLowerCase()}.com`
    };
  }

  static getMockHistory(symbol, days) {
    const history = [];
    let price = 100 + Math.random() * 100;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const change = (Math.random() - 0.48) * 5;
      price = Math.max(price + change, 10);
      
      history.push({
        symbol,
        date,
        open: price * (1 + (Math.random() - 0.5) * 0.02),
        high: price * (1 + Math.random() * 0.03),
        low: price * (1 - Math.random() * 0.03),
        close: price,
        adjClose: price,
        volume: Math.floor(Math.random() * 50000000)
      });
    }

    return history;
  }

  static getMockDividends(symbol) {
    const dividends = [];
    const baseAmount = Math.random() * 2;
    
    for (let i = 0; i < 8; i++) {
      const exDate = new Date();
      exDate.setMonth(exDate.getMonth() - (i * 3));
      
      dividends.push({
        symbol,
        exDate,
        payDate: new Date(exDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        amount: baseAmount * (1 + Math.random() * 0.1),
        frequency: 'quarterly',
        type: 'regular'
      });
    }

    return dividends;
  }
}

module.exports = MarketDataService;
