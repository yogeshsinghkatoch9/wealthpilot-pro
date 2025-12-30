/**
 * IPO Data Fetcher - Generates realistic IPO data
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');
class IPODataFetcher {
  constructor() {
    this.fmpApiKey = process.env.FMP_API_KEY;
    this.finnhubApiKey = process.env.FINNHUB_API_KEY;
    this.fmpBaseUrl = 'https://financialmodelingprep.com/api/v3';
    this.finnhubBaseUrl = 'https://finnhub.io/api/v1';
  }

  /**
   * Fetch IPO calendar from Finnhub API (primary) with FMP fallback
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   */
  async fetchIPOCalendar(fromDate, toDate) {
    // Try Finnhub first (has real data)
    try {
      logger.debug(`Fetching IPO calendar from Finnhub: ${fromDate} to ${toDate}`);
      const url = `${this.finnhubBaseUrl}/calendar/ipo?from=${fromDate}&to=${toDate}&token=${this.finnhubApiKey}`;
      const response = await axios.get(url);

      if (response.data && response.data.ipoCalendar && Array.isArray(response.data.ipoCalendar)) {
        logger.debug(`✓ Fetched ${response.data.ipoCalendar.length} real IPOs from Finnhub`);
        return this.transformFinnhubData(response.data.ipoCalendar);
      }
    } catch (error) {
      logger.error('Error fetching from Finnhub:', error.message);
    }

    // Fallback to FMP (legacy endpoint, likely won't work)
    try {
      logger.debug('Trying FMP API fallback...');
      const url = `${this.fmpBaseUrl}/ipo_calendar?from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        logger.debug(`Fetched ${response.data.length} IPOs from FMP`);
        return this.transformFMPData(response.data);
      }
    } catch (error) {
      logger.error('Error fetching from FMP:', error.message);
    }

    return [];
  }

  /**
   * Transform Finnhub API data to our schema
   */
  transformFinnhubData(data) {
    return data.map(ipo => {
      // Parse price range (e.g., "26.00-30.00" or "10.00")
      let priceLow = null;
      let priceHigh = null;
      let ipoPrice = null;

      if (ipo.price) {
        const priceStr = String(ipo.price);
        if (priceStr.includes('-')) {
          const parts = priceStr.split('-');
          priceLow = parseFloat(parts[0]);
          priceHigh = parseFloat(parts[1]);
        } else {
          ipoPrice = parseFloat(priceStr);
          priceLow = ipoPrice;
          priceHigh = ipoPrice;
        }
      }

      // Determine sector from company name or default to Technology
      const companyName = ipo.name || ipo.symbol;
      let sector = 'Technology';
      if (companyName.toLowerCase().includes('bank') || companyName.toLowerCase().includes('financial')) sector = 'Financial';
      else if (companyName.toLowerCase().includes('bio') || companyName.toLowerCase().includes('health') || companyName.toLowerCase().includes('medical')) sector = 'Healthcare';
      else if (companyName.toLowerCase().includes('energy') || companyName.toLowerCase().includes('power')) sector = 'Energy';
      else if (companyName.toLowerCase().includes('acquisition') || companyName.toLowerCase().includes('spac')) sector = 'Financial';

      // Map Finnhub status to our status
      let status = 'filed';
      if (ipo.status === 'priced') status = 'priced';
      else if (ipo.status === 'expected') {
        const daysUntil = Math.floor((new Date(ipo.date) - new Date()) / 86400000);
        status = daysUntil <= 7 ? 'upcoming' : 'filed';
      }

      return {
        id: `${ipo.symbol}-${ipo.date}`,
        symbol: ipo.symbol || 'TBD',
        company_name: companyName,
        exchange: ipo.exchange || 'NASDAQ',
        ipo_date: ipo.date,
        filing_date: null,
        price_range_low: priceLow,
        price_range_high: priceHigh,
        ipo_price: ipoPrice,
        shares_offered: ipo.numberOfShares || null,
        market_cap: ipo.totalSharesValue || null,
        industry: null,
        sector: sector,
        description: null,
        status: status,
        underwriters: null,
        lead_managers: null,
        country: 'USA',
        currency: 'USD'
      };
    });
  }

  /**
   * Transform FMP API data to our schema
   */
  transformFMPData(data) {
    return data.map(ipo => {
      const ipoDate = ipo.date || ipo.ipoDate;
      const filingDate = ipo.filedDate || null;

      // Determine status based on date
      let status = ipo.status || 'filed';
      if (!status || status === 'unknown') {
        const daysUntilIPO = ipoDate ? Math.floor((new Date(ipoDate) - new Date()) / 86400000) : null;
        if (daysUntilIPO !== null) {
          if (daysUntilIPO < 0) status = 'completed';
          else if (daysUntilIPO <= 7) status = 'upcoming';
          else if (ipo.price) status = 'priced';
          else status = 'filed';
        }
      }

      return {
        id: `${ipo.symbol}-${ipoDate}`,
        symbol: ipo.symbol || 'TBD',
        company_name: ipo.company || ipo.companyName || ipo.symbol,
        exchange: ipo.exchange || 'NASDAQ',
        ipo_date: ipoDate,
        filing_date: filingDate,
        price_range_low: ipo.priceRangeLow || ipo.priceLow || null,
        price_range_high: ipo.priceRangeHigh || ipo.priceHigh || null,
        ipo_price: ipo.price || ipo.ipoPrice || null,
        shares_offered: ipo.numberOfShares || ipo.sharesOffered || null,
        market_cap: ipo.marketCap || null,
        industry: ipo.industry || null,
        sector: ipo.sector || null,
        description: ipo.description || ipo.businessDescription || null,
        status: status,
        underwriters: ipo.underwriters || null,
        lead_managers: ipo.leadManagers || null,
        country: ipo.country || 'USA',
        currency: ipo.currency || 'USD'
      };
    });
  }

  // REMOVED: generateMockIPOs() - All data must come from real APIs
  // This ensures only real data is displayed to users

  /**
   * Get upcoming IPOs (next N days)
   */
  async getUpcomingIPOs(days = 90) {
    try {
      const fromDate = new Date().toISOString().split('T')[0];
      const toDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

      // Try to fetch from API
      const apiData = await this.fetchIPOCalendar(fromDate, toDate);

      // Return API data or empty array - NO MOCK DATA
      if (apiData && apiData.length > 0) {
        return apiData;
      }

      logger.warn('No IPO data from API');
      return [];
    } catch (error) {
      logger.error('Error getting upcoming IPOs:', error.message);
      return [];
    }
  }
}

module.exports = IPODataFetcher;
