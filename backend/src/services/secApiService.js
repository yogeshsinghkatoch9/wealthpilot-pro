const axios = require('axios');
const logger = require('../utils/logger');

/**
 * SEC API Service - Fetches SEC filings and insider trading data
 * Uses sec-api.io for comprehensive SEC data
 */
class SecApiService {
  constructor() {
    this.apiKey = process.env.SEC_API_KEY;
    this.baseUrl = 'https://api.sec-api.io';

    if (!this.apiKey) {
      logger.warn('SEC_API_KEY not set - SEC API features will be limited');
    }
  }

  /**
   * Get SEC filings for a company
   * @param {string} ticker - Stock ticker symbol
   * @param {string} formType - SEC form type (10-K, 10-Q, 8-K, etc.)
   * @param {number} limit - Number of filings to return
   */
  async getFilings(ticker, formType = null, limit = 10) {
    if (!this.apiKey) {
      throw new Error('SEC API key not configured');
    }

    try {
      const query = {
        query: {
          query_string: {
            query: `ticker:${ticker.toUpperCase()}${formType ? ` AND formType:"${formType}"` : ''}`
          }
        },
        from: 0,
        size: limit,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const response = await axios.post(
        `${this.baseUrl}?token=${this.apiKey}`,
        query,
        { timeout: 10000 }
      );

      const filings = response.data.filings || [];

      return filings.map(filing => ({
        id: filing.id,
        accessionNo: filing.accessionNo,
        cik: filing.cik,
        ticker: filing.ticker,
        companyName: filing.companyName,
        formType: filing.formType,
        filedAt: filing.filedAt,
        periodOfReport: filing.periodOfReport,
        description: filing.description,
        linkToTxt: filing.linkToTxt,
        linkToHtml: filing.linkToHtml,
        linkToFilingDetails: filing.linkToFilingDetails
      }));
    } catch (error) {
      logger.error(`SEC API getFilings error for ${ticker}:`, error.message);
      throw error;
    }
  }

  /**
   * Get insider transactions (Form 4 filings)
   * @param {string} ticker - Stock ticker symbol
   * @param {number} limit - Number of transactions to return
   */
  async getInsiderTransactions(ticker, limit = 50) {
    if (!this.apiKey) {
      throw new Error('SEC API key not configured');
    }

    try {
      const query = {
        query: {
          query_string: {
            query: `ticker:${ticker.toUpperCase()} AND formType:"4"`
          }
        },
        from: 0,
        size: limit,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const response = await axios.post(
        `${this.baseUrl}?token=${this.apiKey}`,
        query,
        { timeout: 10000 }
      );

      const filings = response.data.filings || [];

      // Parse Form 4 data for insider transactions
      return filings.map(filing => ({
        filedAt: filing.filedAt,
        accessionNo: filing.accessionNo,
        insiderName: filing.reportingOwner?.name || 'Unknown',
        insiderTitle: filing.reportingOwner?.relationship?.officerTitle || '',
        isDirector: filing.reportingOwner?.relationship?.isDirector || false,
        isOfficer: filing.reportingOwner?.relationship?.isOfficer || false,
        is10PercentOwner: filing.reportingOwner?.relationship?.isTenPercentOwner || false,
        transactionType: this.parseTransactionType(filing),
        shares: this.parseShares(filing),
        pricePerShare: this.parsePrice(filing),
        totalValue: this.parseTotalValue(filing),
        sharesOwnedAfter: filing.ownershipAfterTransaction || null,
        linkToFiling: filing.linkToHtml
      }));
    } catch (error) {
      logger.error(`SEC API getInsiderTransactions error for ${ticker}:`, error.message);
      throw error;
    }
  }

  /**
   * Get institutional holdings (13F filings)
   * @param {string} ticker - Stock ticker symbol
   */
  async getInstitutionalHoldings(ticker, limit = 20) {
    if (!this.apiKey) {
      throw new Error('SEC API key not configured');
    }

    try {
      const query = {
        query: {
          query_string: {
            query: `holdings.ticker:${ticker.toUpperCase()} AND formType:"13F-HR"`
          }
        },
        from: 0,
        size: limit,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const response = await axios.post(
        `${this.baseUrl}?token=${this.apiKey}`,
        query,
        { timeout: 10000 }
      );

      return response.data.filings || [];
    } catch (error) {
      logger.error(`SEC API getInstitutionalHoldings error for ${ticker}:`, error.message);
      throw error;
    }
  }

  /**
   * Search all SEC filings
   * @param {string} query - Search query
   * @param {number} limit - Number of results
   */
  async searchFilings(searchQuery, limit = 20) {
    if (!this.apiKey) {
      throw new Error('SEC API key not configured');
    }

    try {
      const query = {
        query: {
          query_string: {
            query: searchQuery
          }
        },
        from: 0,
        size: limit,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const response = await axios.post(
        `${this.baseUrl}?token=${this.apiKey}`,
        query,
        { timeout: 10000 }
      );

      return response.data.filings || [];
    } catch (error) {
      logger.error(`SEC API searchFilings error:`, error.message);
      throw error;
    }
  }

  // Helper methods
  parseTransactionType(filing) {
    // Parse transaction code from Form 4
    const codes = {
      'P': 'Purchase',
      'S': 'Sale',
      'A': 'Grant/Award',
      'D': 'Disposition to Issuer',
      'F': 'Tax Withholding',
      'M': 'Option Exercise',
      'G': 'Gift',
      'C': 'Conversion'
    };
    const code = filing.transactionCode || '';
    return codes[code] || code || 'Unknown';
  }

  parseShares(filing) {
    return filing.transactionShares || filing.sharesTransacted || 0;
  }

  parsePrice(filing) {
    return filing.transactionPricePerShare || filing.pricePerShare || 0;
  }

  parseTotalValue(filing) {
    const shares = this.parseShares(filing);
    const price = this.parsePrice(filing);
    return shares * price;
  }
}

module.exports = new SecApiService();
