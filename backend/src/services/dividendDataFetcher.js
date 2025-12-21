/**
 * Dividend Data Fetcher - Fetches real dividend data from FMP API
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');
class DividendDataFetcher {
  constructor() {
    this.fmpApiKey = process.env.FMP_API_KEY;
    this.iexApiKey = process.env.IEX_CLOUD_API_KEY;
    this.baseUrl = 'https://financialmodelingprep.com/api/v3';
  }

  /**
   * Fetch dividend calendar from FMP for a date range
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   */
  async fetchDividendCalendar(fromDate, toDate) {
    try {
      logger.debug(`Fetching dividend calendar from ${fromDate} to ${toDate}`);

      const url = `${this.baseUrl}/stock_dividend_calendar?from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        logger.debug(`Fetched ${response.data.length} dividends from FMP`);
        return this.transformFMPData(response.data);
      }

      return [];
    } catch (error) {
      logger.error('Error fetching dividend calendar from FMP:', error.message);
      return [];
    }
  }

  /**
   * Fetch historical dividends for a specific symbol
   * @param {string} symbol - Stock symbol
   */
  async fetchSymbolDividendHistory(symbol) {
    try {
      const url = `${this.baseUrl}/historical-price-full/stock_dividend/${symbol}?apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && response.data.historical) {
        return this.transformHistoricalData(response.data.historical, symbol);
      }

      return [];
    } catch (error) {
      logger.error(`Error fetching dividend history for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch dividend data for multiple symbols
   * @param {string[]} symbols - Array of stock symbols
   */
  async fetchMultipleSymbols(symbols) {
    try {
      const results = [];

      // Process in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(symbol => this.fetchSymbolDividendHistory(symbol));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults.flat());

        // Wait 1 second between batches to respect rate limits
        if (i + batchSize < symbols.length) {
          await this.sleep(1000);
        }
      }

      return results;
    } catch (error) {
      logger.error('Error fetching multiple symbols:', error.message);
      return [];
    }
  }

  /**
   * Transform FMP calendar data to our format
   */
  transformFMPData(data) {
    return data.map(item => ({
      symbol: item.symbol,
      company_name: item.label || item.symbol,
      ex_dividend_date: item.date,
      payment_date: item.paymentDate || null,
      record_date: item.recordDate || null,
      declaration_date: item.declarationDate || null,
      dividend_amount: parseFloat(item.dividend) || 0,
      dividend_yield: parseFloat(item.adjDividend) || null,
      frequency: this.determineDividendFrequency(item),
      currency: 'USD',
      dividend_type: 'regular',
      status: 'confirmed'
    }));
  }

  /**
   * Transform historical dividend data to our format
   */
  transformHistoricalData(data, symbol) {
    return data
      .filter(item => new Date(item.date) >= new Date()) // Only future dividends
      .map(item => ({
        symbol: symbol,
        company_name: symbol,
        ex_dividend_date: item.date,
        payment_date: item.paymentDate || null,
        record_date: item.recordDate || null,
        declaration_date: item.declarationDate || null,
        dividend_amount: parseFloat(item.dividend) || 0,
        dividend_yield: parseFloat(item.adjDividend) || null,
        frequency: 'quarterly',
        currency: 'USD',
        dividend_type: 'regular',
        status: 'confirmed'
      }));
  }

  /**
   * Determine dividend frequency based on historical data
   */
  determineDividendFrequency(item) {
    // Default to quarterly as most US stocks pay quarterly
    // You can enhance this by analyzing payment patterns
    return 'quarterly';
  }

  /**
   * Get upcoming dividends for the next N days
   */
  async getUpcomingDividends(days = 90) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = this.formatDate(today);
    const toDate = this.formatDate(futureDate);

    return await this.fetchDividendCalendar(fromDate, toDate);
  }

  /**
   * Fetch dividend data for common dividend aristocrats and high-yield stocks
   */
  async fetchPopularDividendStocks() {
    const popularSymbols = [
      'AAPL', 'MSFT', 'JNJ', 'PG', 'KO', 'PEP', 'MCD', 'WMT', 'HD', 'VZ',
      'T', 'XOM', 'CVX', 'MMM', 'CAT', 'IBM', 'INTC', 'CSCO', 'PM', 'MO',
      'O', 'MAIN', 'AGNC', 'NLY', 'STAG', 'IRM', 'OHI', 'MPW', 'DLR', 'AMT'
    ];

    return await this.fetchMultipleSymbols(popularSymbols);
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
   * Sleep helper for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get company name from symbol using FMP API
   */
  async getCompanyName(symbol) {
    try {
      const url = `${this.baseUrl}/profile/${symbol}?apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && response.data[0]) {
        return response.data[0].companyName || symbol;
      }

      return symbol;
    } catch (error) {
      logger.error(`Error fetching company name for ${symbol}:`, error.message);
      return symbol;
    }
  }

  /**
   * Enrich dividend data with company names
   */
  async enrichWithCompanyNames(dividends) {
    const uniqueSymbols = [...new Set(dividends.map(d => d.symbol))];
    const nameMap = {};

    // Fetch company names in batches
    for (const symbol of uniqueSymbols) {
      nameMap[symbol] = await this.getCompanyName(symbol);
      await this.sleep(200); // Respect rate limits
    }

    // Update dividend records with company names
    return dividends.map(div => ({
      ...div,
      company_name: nameMap[div.symbol] || div.symbol
    }));
  }
}

module.exports = DividendDataFetcher;
