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

  /**
   * Generate mock earnings data for symbols when API is unavailable
   * @param {string[]} symbols - Array of stock symbols
   * @param {number} daysAhead - Days to generate data for (default 30)
   */
  generateMockEarnings(symbols, daysAhead = 30) {
    logger.debug(`Generating mock earnings data for ${symbols.length} symbols`);
    const earnings = [];
    const now = new Date();
    const companyNames = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'TSLA': 'Tesla Inc.',
      'META': 'Meta Platforms Inc.',
      'NVDA': 'NVIDIA Corporation',
      'NFLX': 'Netflix Inc.',
      'SPY': 'SPDR S&P 500 ETF',
      'QQQ': 'Invesco QQQ Trust',
      'VTI': 'Vanguard Total Stock Market ETF',
      'AGG': 'iShares Core U.S. Aggregate Bond ETF',
      'BND': 'Vanguard Total Bond Market ETF',
      'EEM': 'iShares MSCI Emerging Markets ETF',
      'EFA': 'iShares MSCI EAFE ETF',
      'EWG': 'iShares MSCI Germany ETF',
      'EWJ': 'iShares MSCI Japan ETF',
      'FXI': 'iShares China Large-Cap ETF',
      'GLD': 'SPDR Gold Trust',
      'IEMG': 'iShares Core MSCI Emerging Markets ETF',
      'IWM': 'iShares Russell 2000 ETF',
      'VEU': 'Vanguard FTSE All-World ex-US ETF',
      'VWO': 'Vanguard FTSE Emerging Markets ETF',
      'TLT': 'iShares 20+ Year Treasury Bond ETF',
      'XLE': 'Energy Select Sector SPDR Fund',
      'XLF': 'Financial Select Sector SPDR Fund',
      'XLI': 'Industrial Select Sector SPDR Fund',
      'XLK': 'Technology Select Sector SPDR Fund',
      'XLP': 'Consumer Staples Select Sector SPDR Fund',
      'XLRE': 'Real Estate Select Sector SPDR Fund',
      'XLV': 'Health Care Select Sector SPDR Fund',
      'XLY': 'Consumer Discretionary Select Sector SPDR Fund',
      'JNJ': 'Johnson & Johnson',
      'KO': 'The Coca-Cola Company',
      'MMM': '3M Company',
      'NOK': 'Nokia Corporation',
      'PEP': 'PepsiCo Inc.',
      'PG': 'Procter & Gamble Co.',
      'T': 'AT&T Inc.',
      'VZ': 'Verizon Communications Inc.',
      'XOM': 'Exxon Mobil Corporation'
    };

    // ETFs don't have earnings, so filter them out
    const etfSymbols = ['SPY', 'QQQ', 'VTI', 'AGG', 'BND', 'EEM', 'EFA', 'EWG', 'EWJ',
      'FXI', 'GLD', 'IEMG', 'IWM', 'VEU', 'VWO', 'TLT',
      'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLV', 'XLY'];

    const stockSymbols = symbols.filter(s => !etfSymbols.includes(s));

    logger.debug(`Generating earnings for ${stockSymbols.length} stocks (filtered out ${symbols.length - stockSymbols.length} ETFs)`);

    // Generate 1-2 earnings per stock over the next period
    stockSymbols.forEach(symbol => {
      const numEarnings = Math.floor(Math.random() * 2) + 1; // 1-2 earnings

      for (let i = 0; i < numEarnings; i++) {
        const daysFromNow = Math.floor(Math.random() * daysAhead);
        const earningsDate = new Date(now);
        earningsDate.setDate(earningsDate.getDate() + daysFromNow);

        // Determine quarter
        const month = earningsDate.getMonth();
        const quarter = Math.floor(month / 3) + 1;
        const year = earningsDate.getFullYear();

        // Generate realistic EPS estimates
        const epsEstimate = (Math.random() * 5 + 0.5).toFixed(2);
        const revenueEstimate = (Math.random() * 10000000000 + 1000000000).toFixed(0);

        // Randomly assign time of day
        const timeOptions = ['Before Market Open', 'After Market Close', 'During Market Hours'];
        const timeOfDay = timeOptions[Math.floor(Math.random() * timeOptions.length)];

        earnings.push({
          id: `${symbol}-${earningsDate.toISOString().split('T')[0]}-${i}`,
          symbol: symbol,
          company_name: companyNames[symbol] || `${symbol} Corp.`,
          earnings_date: earningsDate.toISOString(),
          fiscal_quarter: `Q${quarter}`,
          fiscal_year: year,
          eps_estimate: parseFloat(epsEstimate),
          eps_actual: null,
          revenue_estimate: parseFloat(revenueEstimate),
          revenue_actual: null,
          reported: false,
          time_of_day: timeOfDay,
          currency: 'USD',
          status: 'scheduled'
        });
      }
    });

    // Sort by date
    earnings.sort((a, b) => new Date(a.earnings_date) - new Date(b.earnings_date));

    logger.debug(`Generated ${earnings.length} mock earnings events`);
    return earnings;
  }
}

module.exports = EarningsDataFetcher;
