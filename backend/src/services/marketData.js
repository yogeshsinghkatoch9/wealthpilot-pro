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

    // Return cached data if available, otherwise mock
    if (dbDividends.length > 0) {
      return dbDividends;
    }

    return this.getMockDividends(symbol);
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

  // Mock data for development/fallback
  static getMockQuote(symbol) {
    const mockData = {
      // Technology
      'AAPL': { price: 189.65, previousClose: 188.42, change: 1.23, changePercent: 0.65, sector: 'Technology', name: 'Apple Inc.' },
      'MSFT': { price: 428.42, previousClose: 425.18, change: 3.24, changePercent: 0.76, sector: 'Technology', name: 'Microsoft Corp' },
      'GOOGL': { price: 174.82, previousClose: 173.24, change: 1.58, changePercent: 0.91, sector: 'Technology', name: 'Alphabet Inc.' },
      'GOOG': { price: 176.42, previousClose: 175.24, change: 1.18, changePercent: 0.67, sector: 'Technology', name: 'Alphabet Inc. Class C' },
      'NVDA': { price: 142.84, previousClose: 140.12, change: 2.72, changePercent: 1.94, sector: 'Technology', name: 'NVIDIA Corp' },
      'META': { price: 584.24, previousClose: 578.42, change: 5.82, changePercent: 1.01, sector: 'Technology', name: 'Meta Platforms' },
      'INTC': { price: 24.18, previousClose: 24.86, change: -0.68, changePercent: -2.73, sector: 'Technology', name: 'Intel Corp' },
      'AMD': { price: 142.50, previousClose: 140.80, change: 1.70, changePercent: 1.21, sector: 'Technology', name: 'AMD' },
      'CRM': { price: 318.42, previousClose: 315.24, change: 3.18, changePercent: 1.01, sector: 'Technology', name: 'Salesforce' },
      'ORCL': { price: 178.42, previousClose: 176.24, change: 2.18, changePercent: 1.24, sector: 'Technology', name: 'Oracle Corp' },
      'CSCO': { price: 58.42, previousClose: 57.84, change: 0.58, changePercent: 1.00, sector: 'Technology', name: 'Cisco Systems' },
      'ADBE': { price: 485.24, previousClose: 480.42, change: 4.82, changePercent: 1.00, sector: 'Technology', name: 'Adobe Inc.' },
      // Consumer Cyclical
      'TSLA': { price: 248.42, previousClose: 252.18, change: -3.76, changePercent: -1.49, sector: 'Consumer Cyclical', name: 'Tesla Inc.' },
      'AMZN': { price: 218.64, previousClose: 216.42, change: 2.22, changePercent: 1.03, sector: 'Consumer Cyclical', name: 'Amazon.com Inc.' },
      'HD': { price: 385.24, previousClose: 382.42, change: 2.82, changePercent: 0.74, sector: 'Consumer Cyclical', name: 'Home Depot' },
      'NKE': { price: 78.42, previousClose: 77.84, change: 0.58, changePercent: 0.75, sector: 'Consumer Cyclical', name: 'Nike Inc.' },
      'MCD': { price: 298.42, previousClose: 296.24, change: 2.18, changePercent: 0.74, sector: 'Consumer Cyclical', name: 'McDonalds Corp' },
      'SBUX': { price: 98.42, previousClose: 97.24, change: 1.18, changePercent: 1.21, sector: 'Consumer Cyclical', name: 'Starbucks' },
      // Financial Services
      'JPM': { price: 198.24, previousClose: 196.84, change: 1.40, changePercent: 0.71, sector: 'Financial Services', name: 'JPMorgan Chase' },
      'V': { price: 284.62, previousClose: 282.48, change: 2.14, changePercent: 0.76, sector: 'Financial Services', name: 'Visa Inc.' },
      'MA': { price: 485.24, previousClose: 482.42, change: 2.82, changePercent: 0.58, sector: 'Financial Services', name: 'Mastercard' },
      'BAC': { price: 42.84, previousClose: 42.42, change: 0.42, changePercent: 0.99, sector: 'Financial Services', name: 'Bank of America' },
      'WFC': { price: 62.42, previousClose: 61.84, change: 0.58, changePercent: 0.94, sector: 'Financial Services', name: 'Wells Fargo' },
      'GS': { price: 542.24, previousClose: 538.42, change: 3.82, changePercent: 0.71, sector: 'Financial Services', name: 'Goldman Sachs' },
      'BRK.B': { price: 458.42, previousClose: 455.24, change: 3.18, changePercent: 0.70, sector: 'Financial Services', name: 'Berkshire Hathaway' },
      // Healthcare
      'JNJ': { price: 156.42, previousClose: 155.84, change: 0.58, changePercent: 0.37, sector: 'Healthcare', name: 'Johnson & Johnson' },
      'UNH': { price: 584.24, previousClose: 582.18, change: 2.06, changePercent: 0.35, sector: 'Healthcare', name: 'UnitedHealth Group' },
      'PFE': { price: 28.42, previousClose: 28.24, change: 0.18, changePercent: 0.64, sector: 'Healthcare', name: 'Pfizer Inc.' },
      'MRK': { price: 108.42, previousClose: 107.24, change: 1.18, changePercent: 1.10, sector: 'Healthcare', name: 'Merck & Co.' },
      'ABBV': { price: 178.42, previousClose: 176.24, change: 2.18, changePercent: 1.24, sector: 'Healthcare', name: 'AbbVie Inc.' },
      'LLY': { price: 785.24, previousClose: 778.42, change: 6.82, changePercent: 0.88, sector: 'Healthcare', name: 'Eli Lilly' },
      // Energy
      'XOM': { price: 108.42, previousClose: 107.24, change: 1.18, changePercent: 1.10, sector: 'Energy', name: 'Exxon Mobil' },
      'CVX': { price: 148.42, previousClose: 146.24, change: 2.18, changePercent: 1.49, sector: 'Energy', name: 'Chevron Corp' },
      'COP': { price: 108.42, previousClose: 106.24, change: 2.18, changePercent: 2.05, sector: 'Energy', name: 'ConocoPhillips' },
      // Consumer Defensive
      'PG': { price: 168.42, previousClose: 167.24, change: 1.18, changePercent: 0.71, sector: 'Consumer Defensive', name: 'Procter & Gamble' },
      'KO': { price: 62.42, previousClose: 61.84, change: 0.58, changePercent: 0.94, sector: 'Consumer Defensive', name: 'Coca-Cola' },
      'PEP': { price: 168.42, previousClose: 167.24, change: 1.18, changePercent: 0.71, sector: 'Consumer Defensive', name: 'PepsiCo' },
      'WMT': { price: 168.42, previousClose: 166.24, change: 2.18, changePercent: 1.31, sector: 'Consumer Defensive', name: 'Walmart' },
      'COST': { price: 918.42, previousClose: 912.24, change: 6.18, changePercent: 0.68, sector: 'Consumer Defensive', name: 'Costco' },
      // Communication Services
      'VZ': { price: 42.84, previousClose: 42.62, change: 0.22, changePercent: 0.52, sector: 'Communication Services', name: 'Verizon' },
      'T': { price: 22.48, previousClose: 22.36, change: 0.12, changePercent: 0.54, sector: 'Communication Services', name: 'AT&T' },
      'NFLX': { price: 898.42, previousClose: 892.24, change: 6.18, changePercent: 0.69, sector: 'Communication Services', name: 'Netflix' },
      'DIS': { price: 112.42, previousClose: 111.24, change: 1.18, changePercent: 1.06, sector: 'Communication Services', name: 'Walt Disney' },
      // Industrials
      'CAT': { price: 378.42, previousClose: 375.24, change: 3.18, changePercent: 0.85, sector: 'Industrials', name: 'Caterpillar' },
      'BA': { price: 178.42, previousClose: 176.24, change: 2.18, changePercent: 1.24, sector: 'Industrials', name: 'Boeing' },
      'HON': { price: 218.42, previousClose: 216.24, change: 2.18, changePercent: 1.01, sector: 'Industrials', name: 'Honeywell' },
      'UPS': { price: 128.42, previousClose: 127.24, change: 1.18, changePercent: 0.93, sector: 'Industrials', name: 'UPS' },
      // ETFs
      'SPY': { price: 584.82, previousClose: 582.24, change: 2.58, changePercent: 0.44, sector: 'ETF', name: 'SPDR S&P 500 ETF' },
      'QQQ': { price: 498.42, previousClose: 495.24, change: 3.18, changePercent: 0.64, sector: 'ETF', name: 'Invesco QQQ Trust' },
      'DIA': { price: 428.42, previousClose: 426.24, change: 2.18, changePercent: 0.51, sector: 'ETF', name: 'SPDR Dow Jones ETF' },
      'IWM': { price: 218.42, previousClose: 216.24, change: 2.18, changePercent: 1.01, sector: 'ETF', name: 'iShares Russell 2000' },
      'VTI': { price: 278.42, previousClose: 276.24, change: 2.18, changePercent: 0.79, sector: 'ETF', name: 'Vanguard Total Stock Market' }
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
