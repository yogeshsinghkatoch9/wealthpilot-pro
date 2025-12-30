/**
 * Earnings Data Fetcher - Fetches real earnings data from FMP and Alpha Vantage APIs
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');
class EarningsDataFetcher {
  constructor() {
    this.fmpApiKey = process.env.FMP_API_KEY;
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.fmpBaseUrl = 'https://financialmodelingprep.com/api/v3';
  }

  /**
   * Fetch earnings calendar from FMP for a date range
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   */
  async fetchEarningsCalendar(fromDate, toDate) {
    try {
      logger.debug(`Fetching earnings calendar from ${fromDate} to ${toDate}`);

      const url = `${this.fmpBaseUrl}/earning_calendar?from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        logger.debug(`Fetched ${response.data.length} earnings events from FMP`);
        return this.transformFMPData(response.data);
      }

      return [];
    } catch (error) {
      logger.error('Error fetching earnings calendar from FMP:', error.message);
      return [];
    }
  }

  /**
   * Fetch earnings for a specific symbol
   * @param {string} symbol - Stock symbol
   */
  async fetchSymbolEarnings(symbol) {
    try {
      const url = `${this.fmpBaseUrl}/historical/earning_calendar/${symbol}?apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        return this.transformFMPData(response.data);
      }

      return [];
    } catch (error) {
      logger.error(`Error fetching earnings for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch earnings for multiple symbols
   * @param {string[]} symbols - Array of stock symbols
   */
  async fetchMultipleSymbols(symbols) {
    try {
      const results = [];

      // Process in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(symbol => this.fetchSymbolEarnings(symbol));
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
   * Transform FMP earnings data to our format
   */
  transformFMPData(data) {
    return data.map(item => ({
      symbol: item.symbol,
      company_name: item.symbol, // Will be enriched later
      earnings_date: item.date,
      fiscal_quarter: item.fiscalDateEnding ? this.determineFiscalQuarter(item.fiscalDateEnding) : null,
      fiscal_year: item.fiscalDateEnding ? new Date(item.fiscalDateEnding).getFullYear() : null,
      eps_estimate: parseFloat(item.epsEstimated) || null,
      eps_actual: parseFloat(item.eps) || null,
      revenue_estimate: parseFloat(item.revenueEstimated) || null,
      revenue_actual: parseFloat(item.revenue) || null,
      reported: item.eps !== null && item.eps !== undefined,
      time_of_day: item.time || 'unknown',
      currency: 'USD',
      status: item.eps ? 'reported' : 'scheduled'
    }));
  }

  /**
   * Determine fiscal quarter from date
   */
  determineFiscalQuarter(fiscalDateEnding) {
    const date = new Date(fiscalDateEnding);
    const month = date.getMonth() + 1; // 1-12

    if (month <= 3) return 'Q1';
    if (month <= 6) return 'Q2';
    if (month <= 9) return 'Q3';
    return 'Q4';
  }

  /**
   * Get upcoming earnings for the next N days
   */
  async getUpcomingEarnings(days = 30) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const fromDate = this.formatDate(today);
    const toDate = this.formatDate(futureDate);

    return await this.fetchEarningsCalendar(fromDate, toDate);
  }

  /**
   * Fetch earnings for popular stocks
   */
  async fetchPopularStockEarnings() {
    const popularSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM',
      'JNJ', 'V', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS',
      'BAC', 'XOM', 'CVX', 'PFE', 'KO', 'PEP', 'NFLX', 'INTC',
      'CSCO', 'VZ', 'T', 'MRK', 'ABT', 'NKE'
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
  async getCompanyProfile(symbol) {
    try {
      const url = `${this.fmpBaseUrl}/profile/${symbol}?apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && response.data[0]) {
        return {
          companyName: response.data[0].companyName || symbol,
          sector: response.data[0].sector || null,
          industry: response.data[0].industry || null,
          marketCap: response.data[0].mktCap || null
        };
      }

      return { companyName: symbol, sector: null, industry: null, marketCap: null };
    } catch (error) {
      logger.error(`Error fetching company profile for ${symbol}:`, error.message);
      return { companyName: symbol, sector: null, industry: null, marketCap: null };
    }
  }

  /**
   * Enrich earnings data with company names and profiles
   */
  async enrichWithCompanyData(earnings) {
    const uniqueSymbols = [...new Set(earnings.map(e => e.symbol))];
    const profileMap = {};

    // Fetch company profiles in batches
    for (const symbol of uniqueSymbols) {
      profileMap[symbol] = await this.getCompanyProfile(symbol);
      await this.sleep(200); // Respect rate limits
    }

    // Update earnings records with company data
    return earnings.map(earning => ({
      ...earning,
      company_name: profileMap[earning.symbol]?.companyName || earning.symbol
    }));
  }

  /**
   * Fetch earnings surprises (historical data)
   * @param {string} symbol - Stock symbol
   * @param {number} limit - Number of past quarters
   */
  async fetchEarningsSurprises(symbol, limit = 4) {
    try {
      const url = `${this.fmpBaseUrl}/earnings-surprises/${symbol}?apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        return response.data.slice(0, limit).map(item => ({
          date: item.date,
          estimatedEPS: item.estimatedEarning,
          actualEPS: item.actualEarning,
          surprise: ((item.actualEarning - item.estimatedEarning) / Math.abs(item.estimatedEarning) * 100).toFixed(2)
        }));
      }

      return [];
    } catch (error) {
      logger.error(`Error fetching earnings surprises for ${symbol}:`, error.message);
      return [];
    }
  }

  // REMOVED: generateMockEarnings() - All data must come from real APIs
}

// REMOVED: All mock data functions have been deleted
// The service now returns empty arrays when APIs fail
// This ensures only real data is displayed to users

module.exports = EarningsDataFetcher;
