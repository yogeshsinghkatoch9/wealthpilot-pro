/**
 * Live Data Service - Centralized service for all live market data
 * Replaces all mock/demo data with real API calls
 *
 * API Priority:
 * - Stock Prices: Finnhub -> FMP -> Yahoo Finance
 * - Company Info: Alpha Vantage -> FMP
 * - Crypto: CoinGecko
 * - Forex: ExchangeRate-API
 * - News: News API (Market AUX)
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');
class LiveDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache

    // API Keys from environment
    this.apiKeys = {
      finnhub: process.env.FINNHUB_API_KEY,
      fmp: process.env.FMP_API_KEY,
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      polygon: process.env.POLYGON_API_KEY,
      iexCloud: process.env.IEX_CLOUD_API_KEY,
      newsApi: process.env.NEWS_API_KEY
    };
  }

  /**
   * Get live stock prices with fallback chain
   * Priority: Finnhub -> FMP -> Yahoo Finance
   * @param {Array<string>} symbols - Stock symbols
   * @returns {Promise<Object>} Price data for each symbol
   */
  async getStockPrices(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {};
    }

    const cacheKey = `stocks_${symbols.join(',')}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const prices = {};

    // Try each symbol with fallback chain
    for (const symbol of symbols) {
      let quote = null;

      // Try Finnhub first (best for real-time data)
      if (this.apiKeys.finnhub) {
        quote = await this.fetchFinnhubQuote(symbol);
      }

      // Fallback to FMP if Finnhub fails
      if (!quote && this.apiKeys.fmp) {
        quote = await this.fetchFMPQuote(symbol);
      }

      // Final fallback to Yahoo Finance
      if (!quote) {
        quote = await this.fetchYahooQuote(symbol);
      }

      if (quote) {
        prices[symbol] = quote;
      }
    }

    this.setCache(cacheKey, prices);
    return prices;
  }

  /**
   * Fetch quote from Finnhub API
   * @private
   */
  async fetchFinnhubQuote(symbol) {
    try {
      const response = await axios.get('https://finnhub.io/api/v1/quote', {
        params: {
          symbol: symbol.toUpperCase(),
          token: this.apiKeys.finnhub
        },
        timeout: 5000
      });

      const data = response.data;
      if (!data || data.c === 0) return null; // Invalid response

      const currentPrice = data.c; // Current price
      const previousClose = data.pc; // Previous close
      const change = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      return {
        symbol,
        price: currentPrice,
        previousClose,
        change,
        changePercent,
        high: data.h,
        low: data.l,
        open: data.o,
        volume: 0, // Finnhub quote doesn't include volume
        timestamp: new Date(data.t * 1000).toISOString(),
        source: 'Finnhub'
      };
    } catch (error) {
      logger.error(`[LiveDataService] Finnhub fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch quote from FMP (Financial Modeling Prep) API
   * @private
   */
  async fetchFMPQuote(symbol) {
    try {
      const response = await axios.get(`https://financialmodelingprep.com/api/v3/quote/${symbol.toUpperCase()}`, {
        params: { apikey: this.apiKeys.fmp },
        timeout: 5000
      });

      const data = response.data?.[0];
      if (!data) return null;

      return {
        symbol,
        price: data.price,
        previousClose: data.previousClose,
        change: data.change,
        changePercent: data.changesPercentage,
        high: data.dayHigh,
        low: data.dayLow,
        open: data.open,
        volume: data.volume,
        timestamp: new Date(data.timestamp * 1000).toISOString(),
        source: 'FMP'
      };
    } catch (error) {
      logger.error(`[LiveDataService] FMP fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get live crypto prices from CoinGecko (free API)
   * @param {Array<string>} symbols - Crypto symbols (BTC, ETH, etc.)
   * @returns {Promise<Object>} Price data for each crypto
   */
  async getCryptoPrices(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {};
    }

    const cacheKey = `crypto_${symbols.join(',')}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Map common crypto symbols to CoinGecko IDs
      const coinMap = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'BNB': 'binancecoin',
        'SOL': 'solana',
        'XRP': 'ripple',
        'USDC': 'usd-coin',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'AVAX': 'avalanche-2'
      };

      const ids = symbols.map(s => coinMap[s.toUpperCase()] || s.toLowerCase()).join(',');

      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids,
          vs_currencies: 'usd',
          include_24hr_change: 'true'
        },
        timeout: 5000
      });

      const prices = {};
      symbols.forEach(symbol => {
        const coinId = coinMap[symbol.toUpperCase()] || symbol.toLowerCase();
        const data = response.data[coinId];
        if (data) {
          prices[symbol] = {
            symbol,
            price: data.usd,
            change24h: data.usd_24h_change || 0,
            source: 'CoinGecko'
          };
        }
      });

      this.setCache(cacheKey, prices);
      return prices;
    } catch (error) {
      logger.error('[LiveDataService] Crypto price fetch error:', error.message);
      return {};
    }
  }

  /**
   * Get live forex rates from exchangerate-api.com (free tier)
   * @param {string} base - Base currency (default USD)
   * @returns {Promise<Object>} Exchange rates
   */
  async getForexRates(base = 'USD') {
    const cacheKey = `forex_${base}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${base}`, {
        timeout: 5000
      });

      const data = {
        base: response.data.base,
        rates: response.data.rates,
        timestamp: new Date().toISOString(),
        source: 'ExchangeRate-API'
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('[LiveDataService] Forex rates fetch error:', error.message);
      // Fallback to basic rates if API fails
      return {
        base,
        rates: {
          EUR: 0.92,
          GBP: 0.79,
          JPY: 149.50,
          CAD: 1.36,
          AUD: 1.53,
          CHF: 0.88,
          CNY: 7.24,
          INR: 83.12
        },
        timestamp: new Date().toISOString(),
        source: 'Fallback'
      };
    }
  }

  /**
   * Get live dividend data for stocks
   * @param {Array<string>} symbols - Stock symbols
   * @returns {Promise<Object>} Dividend data
   */
  async getDividendData(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {};
    }

    const cacheKey = `dividends_${symbols.join(',')}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const dividends = {};

    // Fetch from Yahoo Finance API
    for (const symbol of symbols) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const response = await axios.get(url, {
          params: { interval: '1d', range: '1y' },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000
        });

        const data = response.data?.chart?.result?.[0];
        if (data && data.meta) {
          dividends[symbol] = {
            symbol,
            annualDividend: data.meta.dividendRate || 0,
            yield: data.meta.dividendYield ? (data.meta.dividendYield * 100) : 0,
            exDividendDate: data.meta.exDividendDate || null,
            source: 'Yahoo Finance'
          };
        }
      } catch (error) {
        logger.error(`[LiveDataService] Dividend fetch error for ${symbol}:`, error.message);
      }
    }

    this.setCache(cacheKey, dividends);
    return dividends;
  }

  /**
   * Fetch single quote from Yahoo Finance
   * @private
   */
  async fetchYahooQuote(symbol) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
      const response = await axios.get(url, {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000
      });

      const data = response.data?.chart?.result?.[0];
      if (!data) return null;

      const quote = data.meta;
      const currentPrice = quote.regularMarketPrice;
      const previousClose = quote.previousClose || quote.chartPreviousClose;
      const change = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      return {
        symbol,
        price: currentPrice,
        previousClose,
        change,
        changePercent,
        volume: data.indicators?.quote?.[0]?.volume?.slice(-1)[0] || 0,
        timestamp: new Date(quote.regularMarketTime * 1000).toISOString(),
        source: 'Yahoo Finance'
      };
    } catch (error) {
      logger.error(`[LiveDataService] Quote fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get company overview/fundamentals
   * Uses Alpha Vantage or FMP
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Company information
   */
  async getCompanyInfo(symbol) {
    const cacheKey = `company_${symbol}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let info = null;

    // Try Alpha Vantage first
    if (this.apiKeys.alphaVantage) {
      info = await this.fetchAlphaVantageCompany(symbol);
    }

    // Fallback to FMP
    if (!info && this.apiKeys.fmp) {
      info = await this.fetchFMPCompany(symbol);
    }

    if (info) {
      this.setCache(cacheKey, info);
    }

    return info || {};
  }

  /**
   * Fetch company overview from Alpha Vantage
   * @private
   */
  async fetchAlphaVantageCompany(symbol) {
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'OVERVIEW',
          symbol: symbol.toUpperCase(),
          apikey: this.apiKeys.alphaVantage
        },
        timeout: 5000
      });

      const data = response.data;
      if (!data || !data.Symbol) return null;

      return {
        symbol: data.Symbol,
        name: data.Name,
        description: data.Description,
        sector: data.Sector,
        industry: data.Industry,
        marketCap: parseFloat(data.MarketCapitalization) || 0,
        peRatio: parseFloat(data.PERatio) || 0,
        dividendYield: parseFloat(data.DividendYield) * 100 || 0,
        eps: parseFloat(data.EPS) || 0,
        beta: parseFloat(data.Beta) || 0,
        fiftyTwoWeekHigh: parseFloat(data['52WeekHigh']) || 0,
        fiftyTwoWeekLow: parseFloat(data['52WeekLow']) || 0,
        source: 'Alpha Vantage'
      };
    } catch (error) {
      logger.error(`[LiveDataService] Alpha Vantage company fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch company profile from FMP
   * @private
   */
  async fetchFMPCompany(symbol) {
    try {
      const response = await axios.get(`https://financialmodelingprep.com/api/v3/profile/${symbol.toUpperCase()}`, {
        params: { apikey: this.apiKeys.fmp },
        timeout: 5000
      });

      const data = response.data?.[0];
      if (!data) return null;

      return {
        symbol: data.symbol,
        name: data.companyName,
        description: data.description,
        sector: data.sector,
        industry: data.industry,
        marketCap: data.mktCap || 0,
        peRatio: data.price / (data.eps || 1),
        dividendYield: (data.lastDiv / data.price) * 100 || 0,
        eps: data.eps || 0,
        beta: data.beta || 0,
        fiftyTwoWeekHigh: data.range ? parseFloat(data.range.split('-')[1]) : 0,
        fiftyTwoWeekLow: data.range ? parseFloat(data.range.split('-')[0]) : 0,
        website: data.website,
        ceo: data.ceo,
        source: 'FMP'
      };
    } catch (error) {
      logger.error(`[LiveDataService] FMP company fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get market news from News API
   * @param {Object} options - Search options
   * @returns {Promise<Array>} News articles
   */
  async getMarketNews(options = {}) {
    const {
      query = 'stock market OR finance OR trading',
      category = 'business',
      country = 'us',
      pageSize = 20
    } = options;

    const cacheKey = `news_${query}_${category}_${country}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      if (!this.apiKeys.newsApi) {
        logger.warn('[LiveDataService] News API key not configured');
        return [];
      }

      const response = await axios.get('https://api.marketaux.com/v1/news/all', {
        params: {
          api_token: this.apiKeys.newsApi,
          symbols: query,
          filter_entities: true,
          language: 'en',
          limit: pageSize
        },
        timeout: 10000
      });

      const articles = response.data?.data || [];
      const formattedArticles = articles.map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        publishedAt: article.published_at,
        source: article.source,
        sentiment: article.sentiment || 'neutral',
        entities: article.entities || [],
        image: article.image_url
      }));

      this.setCache(cacheKey, formattedArticles);
      return formattedArticles;
    } catch (error) {
      logger.error('[LiveDataService] News fetch error:', error.message);
      return [];
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Get historical stock data for charts
   * @param {string} symbol - Stock symbol
   * @param {string} period - Time period (1D, 1W, 1M, 6M, 1Y, 5Y, MAX)
   * @returns {Promise<Array>} Historical price data
   */
  async getHistoricalData(symbol, period = '1M') {
    const cacheKey = `historical_${symbol}_${period}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Map period to Finnhub/Alpha Vantage parameters
    const periodMap = {
      '1D': { interval: '5', days: 1 }, // 5-min intervals, 1 day
      '1W': { interval: '15', days: 7 }, // 15-min intervals, 1 week
      '1M': { interval: '60', days: 30 }, // 1-hour intervals, 1 month
      '6M': { interval: 'D', days: 180 }, // Daily, 6 months
      '1Y': { interval: 'D', days: 365 }, // Daily, 1 year
      '5Y': { interval: 'W', days: 1825 }, // Weekly, 5 years
      'MAX': { interval: 'M', days: 3650 } // Monthly, 10 years
    };

    const config = periodMap[period] || periodMap['1M'];

    let data = null;

    // Try Finnhub first
    if (this.apiKeys.finnhub) {
      data = await this.fetchFinnhubHistorical(symbol, config);
    }

    // Fallback to Alpha Vantage
    if (!data && this.apiKeys.alphaVantage) {
      data = await this.fetchAlphaVantageHistorical(symbol, period);
    }

    // Final fallback to Yahoo Finance
    if (!data) {
      data = await this.fetchYahooHistorical(symbol, config);
    }

    if (data) {
      this.setCache(cacheKey, data);
    }

    return data || [];
  }

  /**
   * Fetch historical data from Finnhub
   * @private
   */
  async fetchFinnhubHistorical(symbol, config) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - (config.days * 24 * 60 * 60);

      const response = await axios.get('https://finnhub.io/api/v1/stock/candle', {
        params: {
          symbol: symbol.toUpperCase(),
          resolution: config.interval === 'D' ? 'D' : config.interval === 'W' ? 'W' : config.interval === 'M' ? 'M' : '60',
          from,
          to: now,
          token: this.apiKeys.finnhub
        },
        timeout: 10000
      });

      const data = response.data;
      if (!data || data.s !== 'ok' || !data.t) return null;

      // Transform to our format
      return data.t.map((timestamp, i) => ({
        timestamp: new Date(timestamp * 1000).toISOString(),
        date: new Date(timestamp * 1000).toLocaleDateString(),
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i]
      }));
    } catch (error) {
      logger.error(`[LiveDataService] Finnhub historical fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch historical data from Alpha Vantage
   * @private
   */
  async fetchAlphaVantageHistorical(symbol, period) {
    try {
      // Determine which Alpha Vantage function to use based on period
      let avFunction = 'TIME_SERIES_DAILY';
      if (period === '1D') avFunction = 'TIME_SERIES_INTRADAY';
      if (period === '1W' || period === '1M') avFunction = 'TIME_SERIES_DAILY';
      if (period === '6M' || period === '1Y' || period === '5Y' || period === 'MAX') avFunction = 'TIME_SERIES_DAILY';

      const params = {
        function: avFunction,
        symbol: symbol.toUpperCase(),
        apikey: this.apiKeys.alphaVantage,
        outputsize: period === '1Y' || period === '5Y' || period === 'MAX' ? 'full' : 'compact'
      };

      if (avFunction === 'TIME_SERIES_INTRADAY') {
        params.interval = '5min';
      }

      const response = await axios.get('https://www.alphavantage.co/query', {
        params,
        timeout: 10000
      });

      const data = response.data;
      const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));

      if (!timeSeriesKey || !data[timeSeriesKey]) return null;

      const timeSeries = data[timeSeriesKey];

      // Transform to our format
      return Object.entries(timeSeries).map(([date, values]) => ({
        timestamp: new Date(date).toISOString(),
        date: new Date(date).toLocaleDateString(),
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      })).reverse(); // Alpha Vantage returns newest first, we want oldest first
    } catch (error) {
      logger.error(`[LiveDataService] Alpha Vantage historical fetch error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch historical data from Yahoo Finance
   * @private
   */
  async fetchYahooHistorical(symbol, config) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - (config.days * 24 * 60 * 60);

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
      const response = await axios.get(url, {
        params: {
          period1: from,
          period2: now,
          interval: config.interval === 'D' ? '1d' : config.interval === 'W' ? '1wk' : config.interval === 'M' ? '1mo' : '1h'
        },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });

      const data = response.data?.chart?.result?.[0];
      if (!data || !data.timestamp) return null;

      const timestamps = data.timestamp;
      const quotes = data.indicators?.quote?.[0];

      if (!quotes) return null;

      return timestamps.map((timestamp, i) => ({
        timestamp: new Date(timestamp * 1000).toISOString(),
        date: new Date(timestamp * 1000).toLocaleDateString(),
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i]
      }));
    } catch (error) {
      logger.error(`[LiveDataService] Yahoo historical fetch error for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Singleton instance
const liveDataService = new LiveDataService();

module.exports = liveDataService;
