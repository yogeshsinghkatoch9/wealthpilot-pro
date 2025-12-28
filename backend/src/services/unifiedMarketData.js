const axios = require('axios');
const logger = require('../utils/logger');

// Yahoo Finance - no API key required
let yahooFinance;
try {
  yahooFinance = require('yahoo-finance2').default;
} catch (e) {
  logger.warn('yahoo-finance2 not available');
}

/**
 * Unified Market Data Service
 * Integrates 5 data providers with intelligent fallback:
 * 1. Finnhub (Primary - 60 req/min)
 * 2. Financial Modeling Prep (Secondary - 250 req/day)
 * 3. Yahoo Finance (No API key required - reliable)
 * 4. Alpha Vantage (Tertiary - 25 req/day)
 * 5. StockData.org (Backup - Real-time)
 */
class UnifiedMarketDataService {
  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.finnhubKey = process.env.FINNHUB_API_KEY;
    this.fmpKey = process.env.FMP_API_KEY;
    this.stockDataKey = process.env.STOCKDATA_API_KEY;

    // In-memory cache with TTL - AGGRESSIVE for live data
    this.cache = new Map();
    this.cacheTTL = {
      quote: 5 * 1000, // 5 seconds for quotes (LIVE DATA)
      history: 2 * 60 * 1000, // 2 minutes for historical data
      profile: 30 * 60 * 1000 // 30 minutes for company profiles
    };

    logger.info('Unified Market Data Service initialized with 5 providers (including Yahoo Finance)');
  }

  /**
   * Get cached data or execute fetch function
   */
  async getCached(key, ttl, fetchFn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      logger.debug(`Cache HIT: ${key}`);
      return cached.data;
    }

    logger.debug(`Cache MISS: ${key}`);
    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Fetch real-time quote with fallback across all providers
   */
  async fetchQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    return this.getCached(cacheKey, this.cacheTTL.quote, async () => {
      logger.info(`[Quote] Fetching ${symbol} with multi-provider fallback`);

      // Try Yahoo Finance FIRST (PRIMARY - no API key required, most reliable)
      try {
        const quote = await this.fetchQuoteYahoo(symbol);
        if (quote) {
          logger.info(`[Quote] SUCCESS via Yahoo Finance: ${symbol}`);
          return quote;
        }
      } catch (err) {
        logger.warn(`[Quote] Yahoo Finance failed for ${symbol}:`, err.message);
      }

      // Try Finnhub second
      try {
        const quote = await this.fetchQuoteFinnhub(symbol);
        if (quote) {
          logger.info(`[Quote] SUCCESS via Finnhub: ${symbol}`);
          return quote;
        }
      } catch (err) {
        logger.warn(`[Quote] Finnhub failed for ${symbol}:`, err.message);
      }

      // Try FMP third
      try {
        const quote = await this.fetchQuoteFMP(symbol);
        if (quote) {
          logger.info(`[Quote] SUCCESS via FMP: ${symbol}`);
          return quote;
        }
      } catch (err) {
        logger.warn(`[Quote] FMP failed for ${symbol}:`, err.message);
      }

      // Try Alpha Vantage fourth
      try {
        const quote = await this.fetchQuoteAlphaVantage(symbol);
        if (quote) {
          logger.info(`[Quote] SUCCESS via Alpha Vantage: ${symbol}`);
          return quote;
        }
      } catch (err) {
        logger.warn(`[Quote] Alpha Vantage failed for ${symbol}:`, err.message);
      }

      // Try StockData.org last
      try {
        const quote = await this.fetchQuoteStockData(symbol);
        if (quote) {
          logger.info(`[Quote] SUCCESS via StockData.org: ${symbol}`);
          return quote;
        }
      } catch (err) {
        logger.warn(`[Quote] StockData.org failed for ${symbol}:`, err.message);
      }

      logger.error(`[Quote] ALL PROVIDERS FAILED for ${symbol}`);
      return null;
    });
  }

  /**
   * Finnhub Quote
   */
  async fetchQuoteFinnhub(symbol) {
    const url = 'https://finnhub.io/api/v1/quote';
    const response = await axios.get(url, {
      params: { symbol, token: this.finnhubKey },
      timeout: 5000
    });

    if (!response.data || response.data.c === 0) {
      return null;
    }

    const data = response.data;
    return {
      symbol: symbol.toUpperCase(),
      price: data.c, // Current price
      previousClose: data.pc, // Previous close
      change: data.c - data.pc,
      changePercent: ((data.c - data.pc) / data.pc) * 100,
      high: data.h, // High
      low: data.l, // Low
      open: data.o, // Open
      volume: null, // Not provided by this endpoint
      timestamp: new Date(data.t * 1000).toISOString(),
      provider: 'Finnhub'
    };
  }

  /**
   * Financial Modeling Prep Quote
   */
  async fetchQuoteFMP(symbol) {
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}`;
    const response = await axios.get(url, {
      params: { apikey: this.fmpKey },
      timeout: 5000
    });

    if (!response.data || response.data.length === 0) {
      return null;
    }

    const data = response.data[0];
    return {
      symbol: data.symbol,
      price: data.price,
      previousClose: data.previousClose,
      change: data.change,
      changePercent: data.changesPercentage,
      high: data.dayHigh,
      low: data.dayLow,
      open: data.open,
      volume: data.volume,
      marketCap: data.marketCap,
      timestamp: new Date(data.timestamp * 1000).toISOString(),
      provider: 'FMP'
    };
  }

  /**
   * Alpha Vantage Quote
   */
  async fetchQuoteAlphaVantage(symbol) {
    const url = 'https://www.alphavantage.co/query';
    const response = await axios.get(url, {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol,
        apikey: this.alphaVantageKey
      },
      timeout: 5000
    });

    if (!response.data || !response.data['Global Quote']) {
      return null;
    }

    const quote = response.data['Global Quote'];
    if (!quote['05. price']) {
      return null;
    }

    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      previousClose: parseFloat(quote['08. previous close']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      volume: parseInt(quote['06. volume']),
      timestamp: new Date(quote['07. latest trading day']).toISOString(),
      provider: 'Alpha Vantage'
    };
  }

  /**
   * Yahoo Finance Quote (no API key required)
   */
  async fetchQuoteYahoo(symbol) {
    if (!yahooFinance) {
      return null;
    }

    try {
      const quote = await yahooFinance.quote(symbol);
      if (!quote || !quote.regularMarketPrice) {
        return null;
      }

      return {
        symbol: quote.symbol,
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow,
        open: quote.regularMarketOpen,
        volume: quote.regularMarketVolume,
        marketCap: quote.marketCap,
        name: quote.shortName || quote.longName,
        timestamp: new Date().toISOString(),
        provider: 'Yahoo Finance'
      };
    } catch (err) {
      logger.warn(`[Quote] Yahoo Finance error for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * StockData.org Quote
   */
  async fetchQuoteStockData(symbol) {
    const url = 'https://api.stockdata.org/v1/data/quote';
    const response = await axios.get(url, {
      params: {
        symbols: symbol,
        api_token: this.stockDataKey
      },
      timeout: 5000
    });

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return null;
    }

    const data = response.data.data[0];
    return {
      symbol: data.ticker,
      price: data.price,
      previousClose: data.previous_close,
      change: data.change,
      changePercent: data.change_percent,
      high: data.day_high,
      low: data.day_low,
      open: data.day_open,
      volume: data.volume,
      timestamp: new Date(data.last_update).toISOString(),
      provider: 'StockData.org'
    };
  }

  /**
   * Fetch historical data with fallback
   */
  async fetchHistoricalData(symbol, days = 30) {
    const cacheKey = `history_${symbol}_${days}`;
    return this.getCached(cacheKey, this.cacheTTL.history, async () => {
      logger.info(`[History] Fetching ${symbol} (${days} days) with fallback`);

      // Try FMP first (best for historical data)
      try {
        const data = await this.fetchHistoricalFMP(symbol, days);
        if (data && data.length > 0) {
          logger.info(`[History] SUCCESS via FMP: ${symbol} (${data.length} points)`);
          return data;
        }
      } catch (err) {
        logger.warn(`[History] FMP failed for ${symbol}:`, err.message);
      }

      // Try Alpha Vantage second
      try {
        const data = await this.fetchHistoricalAlphaVantage(symbol, days);
        if (data && data.length > 0) {
          logger.info(`[History] SUCCESS via Alpha Vantage: ${symbol} (${data.length} points)`);
          return data;
        }
      } catch (err) {
        logger.warn(`[History] Alpha Vantage failed for ${symbol}:`, err.message);
      }

      // Try Yahoo Finance third (no API key required)
      try {
        const data = await this.fetchHistoricalYahoo(symbol, days);
        if (data && data.length > 0) {
          logger.info(`[History] SUCCESS via Yahoo Finance: ${symbol} (${data.length} points)`);
          return data;
        }
      } catch (err) {
        logger.warn(`[History] Yahoo Finance failed for ${symbol}:`, err.message);
      }

      // Try Finnhub fourth
      try {
        const data = await this.fetchHistoricalFinnhub(symbol, days);
        if (data && data.length > 0) {
          logger.info(`[History] SUCCESS via Finnhub: ${symbol} (${data.length} points)`);
          return data;
        }
      } catch (err) {
        logger.warn(`[History] Finnhub failed for ${symbol}:`, err.message);
      }

      // Try StockData.org last
      try {
        const data = await this.fetchHistoricalStockData(symbol, days);
        if (data && data.length > 0) {
          logger.info(`[History] SUCCESS via StockData.org: ${symbol} (${data.length} points)`);
          return data;
        }
      } catch (err) {
        logger.warn(`[History] StockData.org failed for ${symbol}:`, err.message);
      }

      logger.error(`[History] ALL PROVIDERS FAILED for ${symbol}`);
      return [];
    });
  }

  /**
   * FMP Historical Data
   */
  async fetchHistoricalFMP(symbol, days) {
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}`;
    const response = await axios.get(url, {
      params: { apikey: this.fmpKey },
      timeout: 10000
    });

    if (!response.data || !response.data.historical) {
      return null;
    }

    return response.data.historical
      .slice(0, days)
      .reverse()
      .map(item => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume
      }));
  }

  /**
   * Alpha Vantage Historical Data
   */
  async fetchHistoricalAlphaVantage(symbol, days) {
    const outputSize = days > 100 ? 'full' : 'compact';
    const url = 'https://www.alphavantage.co/query';
    const response = await axios.get(url, {
      params: {
        function: 'TIME_SERIES_DAILY',
        symbol,
        outputsize: outputSize,
        apikey: this.alphaVantageKey
      },
      timeout: 10000
    });

    if (!response.data || !response.data['Time Series (Daily)']) {
      return null;
    }

    const timeSeries = response.data['Time Series (Daily)'];
    const dates = Object.keys(timeSeries).slice(0, days);

    return dates.map(date => ({
      date,
      open: parseFloat(timeSeries[date]['1. open']),
      high: parseFloat(timeSeries[date]['2. high']),
      low: parseFloat(timeSeries[date]['3. low']),
      close: parseFloat(timeSeries[date]['4. close']),
      volume: parseInt(timeSeries[date]['5. volume'])
    }));
  }

  /**
   * Yahoo Finance Historical Data (no API key required)
   */
  async fetchHistoricalYahoo(symbol, days) {
    if (!yahooFinance) {
      return null;
    }

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await yahooFinance.chart(symbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        return null;
      }

      return result.quotes.map(item => ({
        date: new Date(item.date).toISOString().split('T')[0],
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume
      }));
    } catch (err) {
      logger.warn(`[History] Yahoo Finance error for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * Finnhub Historical Data (Candles)
   */
  async fetchHistoricalFinnhub(symbol, days) {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (days * 24 * 60 * 60);
    const resolution = days <= 7 ? '60' : 'D'; // 60-min or daily

    const url = 'https://finnhub.io/api/v1/stock/candle';
    const response = await axios.get(url, {
      params: {
        symbol,
        resolution,
        from,
        to,
        token: this.finnhubKey
      },
      timeout: 10000
    });

    if (!response.data || response.data.s !== 'ok') {
      return null;
    }

    const { t, o, h, l, c, v } = response.data;
    return t.map((timestamp, i) => ({
      date: new Date(timestamp * 1000).toISOString(),
      open: o[i],
      high: h[i],
      low: l[i],
      close: c[i],
      volume: v[i]
    }));
  }

  /**
   * StockData.org Historical Data
   */
  async fetchHistoricalStockData(symbol, days) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const from = dateFrom.toISOString().split('T')[0];

    const url = 'https://api.stockdata.org/v1/data/eod';
    const response = await axios.get(url, {
      params: {
        symbols: symbol,
        date_from: from,
        api_token: this.stockDataKey
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      return null;
    }

    return response.data.data.map(item => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume
    }));
  }

  /**
   * Fetch company profile/info
   */
  async fetchCompanyProfile(symbol) {
    const cacheKey = `profile_${symbol}`;
    return this.getCached(cacheKey, this.cacheTTL.profile, async () => {
      logger.info(`[Profile] Fetching ${symbol} with fallback`);

      // Try FMP first (best for company data)
      try {
        const profile = await this.fetchProfileFMP(symbol);
        if (profile) {
          logger.info(`[Profile] SUCCESS via FMP: ${symbol}`);
          return profile;
        }
      } catch (err) {
        logger.warn(`[Profile] FMP failed for ${symbol}:`, err.message);
      }

      // Try Finnhub second
      try {
        const profile = await this.fetchProfileFinnhub(symbol);
        if (profile) {
          logger.info(`[Profile] SUCCESS via Finnhub: ${symbol}`);
          return profile;
        }
      } catch (err) {
        logger.warn(`[Profile] Finnhub failed for ${symbol}:`, err.message);
      }

      // Try Alpha Vantage third
      try {
        const profile = await this.fetchProfileAlphaVantage(symbol);
        if (profile) {
          logger.info(`[Profile] SUCCESS via Alpha Vantage: ${symbol}`);
          return profile;
        }
      } catch (err) {
        logger.warn(`[Profile] Alpha Vantage failed for ${symbol}:`, err.message);
      }

      logger.error(`[Profile] ALL PROVIDERS FAILED for ${symbol}`);
      return null;
    });
  }

  /**
   * FMP Company Profile
   */
  async fetchProfileFMP(symbol) {
    const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}`;
    const response = await axios.get(url, {
      params: { apikey: this.fmpKey },
      timeout: 5000
    });

    if (!response.data || response.data.length === 0) {
      return null;
    }

    const data = response.data[0];
    return {
      symbol: data.symbol,
      name: data.companyName,
      description: data.description,
      sector: data.sector,
      industry: data.industry,
      website: data.website,
      ceo: data.ceo,
      marketCap: data.mktCap,
      exchange: data.exchangeShortName,
      country: data.country,
      logo: data.image,
      provider: 'FMP'
    };
  }

  /**
   * Finnhub Company Profile
   */
  async fetchProfileFinnhub(symbol) {
    const url = 'https://finnhub.io/api/v1/stock/profile2';
    const response = await axios.get(url, {
      params: { symbol, token: this.finnhubKey },
      timeout: 5000
    });

    if (!response.data || !response.data.name) {
      return null;
    }

    const data = response.data;
    return {
      symbol: data.ticker,
      name: data.name,
      description: null,
      sector: null,
      industry: data.finnhubIndustry,
      website: data.weburl,
      ceo: null,
      marketCap: data.marketCapitalization * 1000000,
      exchange: data.exchange,
      country: data.country,
      logo: data.logo,
      provider: 'Finnhub'
    };
  }

  /**
   * Alpha Vantage Company Profile
   */
  async fetchProfileAlphaVantage(symbol) {
    const url = 'https://www.alphavantage.co/query';
    const response = await axios.get(url, {
      params: {
        function: 'OVERVIEW',
        symbol,
        apikey: this.alphaVantageKey
      },
      timeout: 5000
    });

    if (!response.data || !response.data.Symbol) {
      return null;
    }

    const data = response.data;
    return {
      symbol: data.Symbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      website: null,
      ceo: null,
      marketCap: parseInt(data.MarketCapitalization),
      exchange: data.Exchange,
      country: data.Country,
      logo: null,
      provider: 'Alpha Vantage'
    };
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache() {
    this.cache.clear();
    logger.info('Market data cache cleared');
  }
}

module.exports = UnifiedMarketDataService;
