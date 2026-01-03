/**
 * Financial Modeling Prep API Client
 * Provides comprehensive index constituent data and market breadth indicators
 */

const BaseAPIClient = require('./BaseAPIClient');
const config = require('../../../config/marketBreadthConfig');

const logger = require('../../../utils/logger');
class FMPClient extends BaseAPIClient {
  constructor() {
    super({
      providerName: 'FinancialModelingPrep',
      baseUrl: config.apiUrls.fmp,
      apiKey: config.apiKeys.fmp,
      requestsPerMinute: config.rateLimits.fmp,
      timeout: 10000
    });
  }

  /**
   * Get index constituents (SP500, NASDAQ, DOW)
   */
  async getIndexConstituents(index = 'sp500') {
    const indexMap = {
      sp500: 'sp500_constituent',
      nasdaq: 'nasdaq_constituent',
      dow: 'dowjones_constituent'
    };

    const endpoint = `/${indexMap[index]}?apikey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.map(stock => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      subSector: stock.subSector,
      headQuarter: stock.headQuarter,
      dateFirstAdded: stock.dateFirstAdded,
      cik: stock.cik,
      founded: stock.founded
    }));
  }

  /**
   * Get real-time quotes for multiple symbols
   */
  async getBatchQuotes(symbols) {
    const symbolString = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const endpoint = `/quote/${symbolString}?apikey=${this.apiKey}`;

    return await this.get(endpoint);
  }

  /**
   * Get historical prices
   */
  async getHistoricalPrices(symbol, from = null, to = null) {
    let endpoint = `/historical-price-full/${symbol}?apikey=${this.apiKey}`;

    if (from) endpoint += `&from=${from}`;
    if (to) endpoint += `&to=${to}`;

    const data = await this.get(endpoint);
    return data.historical || [];
  }

  /**
   * Get market breadth data (Advance/Decline)
   */
  async getAdvanceDeclineData(date = null) {
    let endpoint = `/historical-advance-decline?apikey=${this.apiKey}`;
    if (date) endpoint += `&date=${date}`;

    return await this.get(endpoint);
  }

  /**
   * Get sector performance
   */
  async getSectorPerformance() {
    const endpoint = `/sector-performance?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get historical sector performance
   */
  async getHistoricalSectorPerformance(limit = 50) {
    const endpoint = `/historical-sectors-performance?limit=${limit}&apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get market gainers
   */
  async getGainers() {
    const endpoint = `/stock_market/gainers?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get market losers
   */
  async getLosers() {
    const endpoint = `/stock_market/losers?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get most active stocks
   */
  async getMostActive() {
    const endpoint = `/stock_market/actives?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get market hours status
   */
  async getMarketStatus() {
    const endpoint = `/market-hours?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get company profile (for constituent data)
   */
  async getCompanyProfile(symbol) {
    const endpoint = `/profile/${symbol}?apikey=${this.apiKey}`;
    const data = await this.get(endpoint);
    return data[0] || null;
  }

  /**
   * Get batch company profiles
   */
  async getBatchCompanyProfiles(symbols) {
    const symbolString = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const endpoint = `/profile/${symbolString}?apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get stock screener results
   */
  async screenStocks(filters = {}) {
    const queryParams = new URLSearchParams({
      ...filters,
      apikey: this.apiKey
    });

    const endpoint = `/stock-screener?${queryParams}`;
    return await this.get(endpoint);
  }

  /**
   * Get technical indicators for a symbol
   */
  async getTechnicalIndicator(symbol, indicator = 'sma', period = 50, interval = 'daily') {
    const endpoint = `/technical_indicator/${interval}/${symbol}?type=${indicator}&period=${period}&apikey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Calculate % of stocks above moving average for an index
   */
  async calculatePercentAboveMA(indexSymbols, maPeriod = 200) {
    const quotes = await this.getBatchQuotes(indexSymbols);
    const profiles = await this.getBatchCompanyProfiles(indexSymbols);

    let aboveMA = 0;
    let total = 0;

    for (const symbol of indexSymbols.slice(0, 50)) { // Rate limit consideration
      try {
        const historical = await this.getHistoricalPrices(symbol);
        if (historical.length >= maPeriod) {
          const prices = historical.slice(0, maPeriod).map(d => d.close);
          const ma = prices.reduce((a, b) => a + b, 0) / maPeriod;
          const currentPrice = historical[0].close;

          if (currentPrice > ma) aboveMA++;
          total++;
        }
      } catch (error) {
        logger.error(`Error calculating MA for ${symbol}:`, error.message);
      }
    }

    return {
      aboveMA,
      total,
      percentage: total > 0 ? (aboveMA / total) * 100 : 0
    };
  }

  /**
   * Parse API response (override)
   */
  parseResponse(data) {
    // FMP returns errors as objects with 'Error Message' key
    if (data && data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    // Check for empty responses
    if (Array.isArray(data) && data.length === 0) {
      logger.warn('[FMP] Empty response received');
    }

    return data;
  }
}

module.exports = FMPClient;
