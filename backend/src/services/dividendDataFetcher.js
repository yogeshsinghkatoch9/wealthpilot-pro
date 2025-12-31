/**
 * Dividend Data Fetcher - Fetches real dividend data from Alpha Vantage API
 * Primary source: Alpha Vantage DIVIDENDS endpoint (free, reliable)
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');

class DividendDataFetcher {
  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!this.alphaVantageKey) {
      logger.warn('ALPHA_VANTAGE_API_KEY not set - dividend data fetching will be limited');
    }
    this.baseUrl = 'https://www.alphavantage.co/query';
    this.cache = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours (dividend data changes infrequently)
    this.lastApiCall = 0;
    this.rateLimitMs = 12000; // Alpha Vantage free tier: 5 calls/minute
  }

  /**
   * Rate-limited API call
   */
  async rateLimitedCall(url) {
    const now = Date.now();
    const elapsed = now - this.lastApiCall;
    if (elapsed < this.rateLimitMs) {
      await this.sleep(this.rateLimitMs - elapsed);
    }
    this.lastApiCall = Date.now();
    return axios.get(url, { timeout: 10000 });
  }

  /**
   * Fetch dividend data for a symbol from Alpha Vantage
   */
  async fetchSymbolDividends(symbol) {
    const cacheKey = `div:${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}?function=DIVIDENDS&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
      const response = await this.rateLimitedCall(url);
      const data = response.data;

      if (data.Note || data['Error Message']) {
        logger.warn(`Alpha Vantage rate limit or error for ${symbol}: ${data.Note || data['Error Message']}`);
        return [];
      }

      if (!data.data || !Array.isArray(data.data)) {
        logger.debug(`No dividend data for ${symbol}`);
        return [];
      }

      const dividends = this.transformAlphaVantageData(data.data, symbol);
      this.cache.set(cacheKey, { data: dividends, timestamp: Date.now() });

      logger.debug(`Fetched ${dividends.length} dividends for ${symbol} from Alpha Vantage`);
      return dividends;
    } catch (error) {
      logger.error(`Error fetching dividends for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Transform Alpha Vantage dividend data to our format
   */
  transformAlphaVantageData(data, symbol) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data
      .map(item => ({
        symbol: symbol.toUpperCase(),
        company_name: symbol.toUpperCase(), // Will be enriched later
        ex_dividend_date: item.ex_dividend_date,
        payment_date: item.payment_date || null,
        record_date: item.record_date || null,
        declaration_date: item.declaration_date || null,
        dividend_amount: parseFloat(item.amount) || 0,
        dividend_yield: null, // Will calculate from price if needed
        frequency: this.determineDividendFrequency(data),
        currency: 'USD',
        dividend_type: 'regular',
        status: 'confirmed',
        source: 'Alpha Vantage'
      }))
      .filter(d => {
        // Include future and recent past dividends (last 30 days)
        const exDate = new Date(d.ex_dividend_date);
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return exDate >= thirtyDaysAgo;
      })
      .sort((a, b) => new Date(a.ex_dividend_date) - new Date(b.ex_dividend_date));
  }

  /**
   * Determine dividend frequency based on historical pattern
   */
  determineDividendFrequency(dividends) {
    if (!dividends || dividends.length < 2) return 'quarterly';

    // Get unique months in last year
    const lastYear = dividends
      .filter(d => {
        const date = new Date(d.ex_dividend_date);
        return date >= new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      })
      .map(d => new Date(d.ex_dividend_date).getMonth());

    const uniqueMonths = new Set(lastYear).size;

    if (uniqueMonths >= 10) return 'monthly';
    if (uniqueMonths >= 3) return 'quarterly';
    if (uniqueMonths >= 2) return 'semi-annual';
    return 'annual';
  }

  /**
   * Fetch dividend data for multiple symbols
   */
  async fetchMultipleSymbols(symbols) {
    const results = [];

    for (const symbol of symbols) {
      const dividends = await this.fetchSymbolDividends(symbol);
      results.push(...dividends);
    }

    return results;
  }

  /**
   * Get upcoming dividends for common dividend stocks
   * Returns real data from Alpha Vantage
   */
  async getUpcomingDividends(days = 90) {
    const dividendStocks = [
      // Dividend Aristocrats & Popular Dividend Payers
      'JNJ', 'PG', 'KO', 'PEP', 'XOM', 'CVX', 'T', 'VZ',
      'MCD', 'IBM', 'MMM', 'CAT', 'ABBV', 'MO', 'PM',
      // REITs (monthly payers)
      'O', 'MAIN', 'STAG',
      // Tech dividends
      'MSFT', 'AAPL', 'CSCO', 'INTC',
      // Financials
      'JPM', 'BAC', 'WFC', 'GS',
      // ETFs
      'VYM', 'SCHD', 'DVY'
    ];

    const allDividends = [];
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    logger.info(`Fetching upcoming dividends for ${dividendStocks.length} stocks...`);

    for (const symbol of dividendStocks) {
      try {
        const dividends = await this.fetchSymbolDividends(symbol);

        // Filter to only upcoming dividends within the date range
        const upcoming = dividends.filter(d => {
          const exDate = new Date(d.ex_dividend_date);
          return exDate >= today && exDate <= futureDate;
        });

        allDividends.push(...upcoming);
      } catch (error) {
        logger.error(`Error fetching ${symbol}:`, error.message);
      }
    }

    logger.info(`Found ${allDividends.length} upcoming dividends`);
    return allDividends.sort((a, b) =>
      new Date(a.ex_dividend_date) - new Date(b.ex_dividend_date)
    );
  }

  /**
   * Enrich dividend data with company names using Alpha Vantage OVERVIEW
   */
  async enrichWithCompanyNames(dividends) {
    const uniqueSymbols = [...new Set(dividends.map(d => d.symbol))];
    const nameMap = {};

    for (const symbol of uniqueSymbols) {
      try {
        const url = `${this.baseUrl}?function=OVERVIEW&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
        const response = await this.rateLimitedCall(url);

        if (response.data && response.data.Name) {
          nameMap[symbol] = response.data.Name;
        } else {
          nameMap[symbol] = symbol;
        }
      } catch (error) {
        nameMap[symbol] = symbol;
      }
    }

    return dividends.map(div => ({
      ...div,
      company_name: nameMap[div.symbol] || div.symbol
    }));
  }

  /**
   * Get dividend yield for a symbol
   */
  async getDividendYield(symbol) {
    try {
      const url = `${this.baseUrl}?function=OVERVIEW&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
      const response = await this.rateLimitedCall(url);

      if (response.data && response.data.DividendYield) {
        return parseFloat(response.data.DividendYield) * 100;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Fetch historical dividends for a specific symbol (wrapper for fetchSymbolDividends)
   */
  async fetchSymbolDividendHistory(symbol) {
    return this.fetchSymbolDividends(symbol);
  }

  /**
   * Fetch dividend calendar - wrapper for compatibility
   */
  async fetchDividendCalendar(fromDate, toDate) {
    // Use the getUpcomingDividends method which fetches from real API
    const daysDiff = Math.ceil((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24));
    return this.getUpcomingDividends(daysDiff);
  }
}

module.exports = DividendDataFetcher;
