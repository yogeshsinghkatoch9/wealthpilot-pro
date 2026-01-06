/**
 * ETF Analyzer Service
 * Provides deep analysis of ETF holdings, overlap, expenses, and composition
 * NOW WITH LIVE DATA FETCHING FROM YAHOO FINANCE!
 */

const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;
const logger = require('../utils/logger');

// Initialize Yahoo Finance v3 instance
const yahooFinance = new YahooFinance();

// API Configuration
const FMP_KEY = 'nKxGNnbkLs6VUjVsbeKTlQF4UPKyvPbG';
const ALPHA_VANTAGE_KEY = '1S2UQSH44L0953E5';

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for ETF data (changes infrequently)
const HOLDINGS_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours for holdings (more frequent updates)
const cache = new Map();

class ETFAnalyzerService {
  /**
   * Search for ETFs
   */
  static async searchETFs(query) {
    try {
      const cacheKey = `search_${query.toLowerCase()}`;
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      // Search using FMP
      const url = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=20&apikey=${FMP_KEY}`;
      const response = await axios.get(url, { timeout: 10000 });

      // Filter for ETFs only
      const etfs = response.data.filter(item =>
        item.exchangeShortName &&
        (item.name?.toUpperCase().includes('ETF') || item.symbol?.toUpperCase().match(/^[A-Z]{3,5}$/))
      );

      this.setCache(cacheKey, etfs);
      return etfs;
    } catch (error) {
      logger.error('Failed to search ETFs', { error: error.message });
      return [];
    }
  }

  /**
   * Get detailed ETF profile - ENHANCED with LIVE DATA from Yahoo Finance
   */
  static async getETFProfile(symbol) {
    try {
      const cacheKey = `profile_${symbol}`;
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      logger.info(`Fetching LIVE ETF profile for ${symbol} from Yahoo Finance`);

      // Fetch comprehensive data from Yahoo Finance
      const [quote, quoteSummary] = await Promise.all([
        yahooFinance.quote(symbol).catch(err => {
          logger.warn(`Yahoo quote failed for ${symbol}, using Alpha Vantage fallback`);
          return null;
        }),
        yahooFinance.quoteSummary(symbol, {
          modules: ['summaryDetail', 'fundProfile', 'price']
        }).catch(err => {
          logger.warn(`Yahoo quoteSummary failed for ${symbol}`);
          return null;
        })
      ]);

      let price = 0, change = 0, changePercent = 0, volume = 0;
      let expenseRatio = this.getExpenseRatio(symbol);
      let aum = this.getAUM(symbol);
      let name = this.getETFName(symbol);
      let description = this.getETFDescription(symbol);

      // Extract price data from quote
      if (quote) {
        price = quote.regularMarketPrice || 0;
        change = quote.regularMarketChange || 0;
        changePercent = quote.regularMarketChangePercent || 0;
        volume = quote.regularMarketVolume || 0;
        name = quote.longName || quote.shortName || name;
      }

      // Extract ETF-specific data from quoteSummary
      if (quoteSummary) {
        if (quoteSummary.summaryDetail && quoteSummary.summaryDetail.expenseRatio) {
          expenseRatio = quoteSummary.summaryDetail.expenseRatio * 100;
        }
        if (quoteSummary.price && quoteSummary.price.marketCap) {
          aum = quoteSummary.price.marketCap;
        }
        if (quoteSummary.fundProfile && quoteSummary.fundProfile.longBusinessSummary) {
          description = quoteSummary.fundProfile.longBusinessSummary;
        }
      }

      // Fallback to Alpha Vantage if Yahoo Finance completely fails
      if (!quote) {
        logger.info(`Using Alpha Vantage fallback for ${symbol}`);
        const avData = await this.getProfileFromAlphaVantage(symbol);
        price = avData.price;
        change = avData.change;
        changePercent = avData.changePercent;
        volume = avData.volume;
      }

      const result = {
        symbol: symbol,
        name: name,
        description: description,
        sector: 'ETF',
        industry: 'Exchange Traded Fund',
        website: '',
        price: price,
        change: change,
        changePercent: changePercent,
        volume: volume,
        avgVolume: volume,
        marketCap: aum,
        expenseRatio: expenseRatio,
        aum: aum,
        inceptionDate: '',
        exchange: 'NYSE Arca',
        image: null,
        source: quote ? 'Yahoo Finance' : 'Alpha Vantage'
      };

      this.setCache(cacheKey, result);
      logger.info(`Successfully fetched LIVE profile for ${symbol} from ${result.source}`);
      return result;
    } catch (error) {
      logger.error(`Failed to fetch ETF profile for ${symbol}`, { error: error.message });
      return this.getDefaultProfile(symbol);
    }
  }

  /**
   * Fallback: Get profile from Alpha Vantage
   */
  static async getProfileFromAlphaVantage(symbol) {
    try {
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      const quoteResponse = await axios.get(quoteUrl, { timeout: 10000 });

      if (!quoteResponse.data || !quoteResponse.data['Global Quote']) {
        return { price: 0, change: 0, changePercent: 0, volume: 0 };
      }

      const quote = quoteResponse.data['Global Quote'];
      return {
        price: parseFloat(quote['05. price']) || 0,
        change: parseFloat(quote['09. change']) || 0,
        changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
        volume: parseInt(quote['06. volume']) || 0
      };
    } catch (error) {
      logger.error(`Alpha Vantage fallback failed for ${symbol}`, { error: error.message });
      return { price: 0, change: 0, changePercent: 0, volume: 0 };
    }
  }

  /**
   * Get ETF holdings - LIVE DATA from Yahoo Finance
   */
  static async getETFHoldings(symbol) {
    try {
      const cacheKey = `holdings_${symbol}`;
      const cached = this.getCache(cacheKey, HOLDINGS_CACHE_DURATION);
      if (cached) {
        logger.info(`Using cached holdings for ${symbol}`);
        return cached;
      }

      logger.info(`Fetching LIVE holdings for ${symbol} from Yahoo Finance`);

      // Fetch from Yahoo Finance - quoteSummary with holdings module
      const quote = await yahooFinance.quoteSummary(symbol, {
        modules: ['topHoldings', 'fundProfile']
      });

      if (!quote || !quote.topHoldings || !quote.topHoldings.holdings) {
        logger.warn(`No holdings data available for ${symbol} from Yahoo Finance`);
        // Try fallback to FMP
        return await this.getHoldingsFromFMP(symbol);
      }

      const holdings = quote.topHoldings.holdings.map((holding, idx) => ({
        rank: idx + 1,
        symbol: holding.symbol || 'N/A',
        name: holding.holdingName || holding.symbol || 'Unknown',
        weight: parseFloat((holding.holdingPercent * 100).toFixed(2)) || 0,
        shares: 0, // Not provided by Yahoo Finance
        marketValue: 0 // Not provided by Yahoo Finance
      }));

      const result = {
        symbol: symbol,
        holdings: holdings,
        totalHoldings: holdings.length,
        asOfDate: new Date().toISOString()
      };

      this.setCache(cacheKey, result, HOLDINGS_CACHE_DURATION);
      logger.info(`Successfully fetched ${holdings.length} LIVE holdings for ${symbol}`);
      return result;
    } catch (error) {
      logger.error(`Failed to fetch holdings for ${symbol}`, { error: error.message });
      // Try fallback to FMP
      return await this.getHoldingsFromFMP(symbol);
    }
  }

  /**
   * Fallback: Try to get holdings from FMP API
   */
  static async getHoldingsFromFMP(symbol) {
    try {
      logger.info(`Trying FMP fallback for ${symbol} holdings`);
      const holdingsUrl = `https://financialmodelingprep.com/api/v3/etf-holder/${symbol}?apikey=${FMP_KEY}`;
      const response = await axios.get(holdingsUrl, { timeout: 15000 });

      if (!response.data || response.data.length === 0) {
        logger.warn(`No holdings from FMP either, using estimated data for ${symbol}`);
        return {
          symbol: symbol,
          holdings: this.getEstimatedHoldings(symbol),
          totalHoldings: this.getEstimatedHoldings(symbol).length,
          asOfDate: new Date().toISOString(),
          source: 'estimated'
        };
      }

      const holdings = response.data.slice(0, 50).map((holding, idx) => ({
        rank: idx + 1,
        symbol: holding.asset || 'N/A',
        name: holding.name || holding.asset || 'Unknown',
        weight: holding.weightPercentage || 0,
        shares: holding.sharesNumber || 0,
        marketValue: holding.marketValue || 0
      }));

      return {
        symbol: symbol,
        holdings: holdings,
        totalHoldings: holdings.length,
        asOfDate: new Date().toISOString(),
        source: 'FMP'
      };
    } catch (error) {
      logger.error(`FMP fallback also failed for ${symbol}`, { error: error.message });
      return {
        symbol: symbol,
        holdings: this.getEstimatedHoldings(symbol),
        totalHoldings: this.getEstimatedHoldings(symbol).length,
        asOfDate: new Date().toISOString(),
        source: 'estimated'
      };
    }
  }

  /**
   * Get ETF sector allocation - LIVE DATA from Yahoo Finance
   */
  static async getSectorAllocation(symbol) {
    try {
      const cacheKey = `sectors_${symbol}`;
      const cached = this.getCache(cacheKey, HOLDINGS_CACHE_DURATION);
      if (cached) {
        logger.info(`Using cached sector data for ${symbol}`);
        return cached;
      }

      logger.info(`Fetching LIVE sector allocation for ${symbol} from Yahoo Finance`);

      // Fetch from Yahoo Finance - quoteSummary with sectorWeightings
      const quote = await yahooFinance.quoteSummary(symbol, {
        modules: ['topHoldings', 'fundProfile']
      });

      if (!quote || !quote.topHoldings || !quote.topHoldings.sectorWeightings) {
        logger.warn(`No sector data available for ${symbol} from Yahoo Finance, trying FMP`);
        return await this.getSectorsFromFMP(symbol);
      }

      // Parse sector weightings from Yahoo Finance
      const sectors = quote.topHoldings.sectorWeightings
        .map(sector => ({
          sector: Object.keys(sector)[0],
          weight: parseFloat((Object.values(sector)[0] * 100).toFixed(2))
        }))
        .filter(s => s.weight > 0)
        .sort((a, b) => b.weight - a.weight);

      this.setCache(cacheKey, sectors, HOLDINGS_CACHE_DURATION);
      logger.info(`Successfully fetched ${sectors.length} LIVE sectors for ${symbol}`);
      return sectors;
    } catch (error) {
      logger.error(`Failed to fetch sector allocation for ${symbol}`, { error: error.message });
      return await this.getSectorsFromFMP(symbol);
    }
  }

  /**
   * Fallback: Try to get sectors from FMP API
   */
  static async getSectorsFromFMP(symbol) {
    try {
      logger.info(`Trying FMP fallback for ${symbol} sectors`);
      const url = `https://financialmodelingprep.com/api/v3/etf-sector-weightings/${symbol}?apikey=${FMP_KEY}`;
      const response = await axios.get(url, { timeout: 10000 });

      if (!response.data || response.data.length === 0) {
        logger.warn(`No sector data from FMP either, using estimated for ${symbol}`);
        return this.getEstimatedSectors(symbol);
      }

      const sectors = Object.entries(response.data[0])
        .filter(([key, value]) => key !== 'symbol' && typeof value === 'string')
        .map(([sector, weight]) => ({
          sector: sector.replace(/Weighting$/, '').trim(),
          weight: parseFloat(weight.replace('%', '')) || 0
        }))
        .filter(s => s.weight > 0)
        .sort((a, b) => b.weight - a.weight);

      return sectors;
    } catch (error) {
      logger.error(`FMP fallback also failed for ${symbol} sectors`, { error: error.message });
      return this.getEstimatedSectors(symbol);
    }
  }

  /**
   * Calculate overlap between multiple ETFs
   */
  static async calculateOverlap(symbols) {
    try {
      logger.info(`Calculating overlap for ${symbols.length} ETFs: ${symbols.join(', ')}`);

      if (symbols.length < 2) {
        throw new Error('Need at least 2 ETFs to calculate overlap');
      }

      // Fetch holdings for all ETFs
      const allHoldings = await Promise.all(
        symbols.map(async symbol => {
          const holdings = await this.getETFHoldings(symbol);
          return { symbol, holdings };
        })
      );

      // Find common holdings
      const holdingsBySymbol = new Map();

      allHoldings.forEach(({ symbol, holdings }) => {
        holdings.forEach(holding => {
          if (!holdingsBySymbol.has(holding.symbol)) {
            holdingsBySymbol.set(holding.symbol, []);
          }
          holdingsBySymbol.get(holding.symbol).push({
            etf: symbol,
            weight: holding.weight,
            name: holding.name
          });
        });
      });

      // Calculate overlap metrics
      const commonHoldings = [];
      holdingsBySymbol.forEach((etfList, holdingSymbol) => {
        if (etfList.length >= 2) { // Present in at least 2 ETFs
          const weights = {};
          etfList.forEach(item => {
            weights[item.etf] = item.weight;
          });

          commonHoldings.push({
            symbol: holdingSymbol,
            name: etfList[0].name,
            presentIn: etfList.length,
            etfs: etfList.map(e => e.etf),
            weights: weights,
            avgWeight: etfList.reduce((sum, e) => sum + e.weight, 0) / etfList.length
          });
        }
      });

      // Sort by number of ETFs containing the holding
      commonHoldings.sort((a, b) => b.presentIn - a.presentIn || b.avgWeight - a.avgWeight);

      // Calculate pairwise overlap percentages
      const pairwiseOverlap = [];
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const etf1 = symbols[i];
          const etf2 = symbols[j];

          const holdings1 = allHoldings[i].holdings;
          const holdings2 = allHoldings[j].holdings;

          const symbols1 = new Set(holdings1.map(h => h.symbol));
          const symbols2 = new Set(holdings2.map(h => h.symbol));

          const intersection = new Set([...symbols1].filter(s => symbols2.has(s)));
          const overlapCount = intersection.size;
          const overlapPercent = (overlapCount / Math.min(holdings1.length, holdings2.length)) * 100;

          // Calculate weighted overlap
          let weightedOverlap = 0;
          intersection.forEach(sym => {
            const weight1 = holdings1.find(h => h.symbol === sym)?.weight || 0;
            const weight2 = holdings2.find(h => h.symbol === sym)?.weight || 0;
            weightedOverlap += Math.min(weight1, weight2);
          });

          pairwiseOverlap.push({
            etf1,
            etf2,
            commonCount: overlapCount,
            overlapPercent: overlapPercent.toFixed(2),
            weightedOverlap: weightedOverlap.toFixed(2)
          });
        }
      }

      const result = {
        etfs: symbols,
        commonHoldings: commonHoldings.slice(0, 50), // Top 50 common holdings
        pairwiseOverlap,
        totalCommon: commonHoldings.length,
        summary: {
          etfsAnalyzed: symbols.length,
          totalCommonHoldings: commonHoldings.length,
          avgOverlapPercent: (pairwiseOverlap.reduce((sum, o) => sum + parseFloat(o.overlapPercent), 0) / pairwiseOverlap.length).toFixed(2)
        }
      };

      logger.info(`Overlap calculation complete: ${result.totalCommon} common holdings found`);
      return result;
    } catch (error) {
      logger.error('Failed to calculate ETF overlap', { error: error.message });
      throw error;
    }
  }

  /**
   * Compare expense ratios and fees
   */
  static async compareExpenses(symbols) {
    try {
      const profiles = await Promise.all(
        symbols.map(symbol => this.getETFProfile(symbol))
      );

      const comparison = profiles
        .filter(p => p !== null)
        .map(profile => ({
          symbol: profile.symbol,
          name: profile.name,
          expenseRatio: profile.expenseRatio,
          aum: profile.aum,
          price: profile.price,
          volume: profile.volume
        }))
        .sort((a, b) => a.expenseRatio - b.expenseRatio);

      return {
        etfs: comparison,
        lowestExpense: comparison[0],
        highestExpense: comparison[comparison.length - 1],
        avgExpense: (comparison.reduce((sum, e) => sum + e.expenseRatio, 0) / comparison.length).toFixed(4)
      };
    } catch (error) {
      logger.error('Failed to compare expenses', { error: error.message });
      throw error;
    }
  }

  /**
   * Helper: Extract expense ratio from description
   */
  static extractExpenseRatio(description) {
    if (!description) return 0;
    const match = description.match(/expense ratio[:\s]+(\d+\.?\d*)/i);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Helper: Extract AUM from description
   */
  static extractAUM(description) {
    if (!description) return 0;
    const match = description.match(/aum[:\s]+\$?([\d.]+)\s*(billion|million|trillion)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 'billion') return value * 1e9;
      if (unit === 'million') return value * 1e6;
      if (unit === 'trillion') return value * 1e12;
    }
    return 0;
  }

  /**
   * Helper: Get estimated holdings for common ETFs
   */
  static getEstimatedHoldings(symbol) {
    // S&P 500 top holdings (used by SPY, VOO, IVV)
    const sp500Holdings = [
      { rank: 1, symbol: 'AAPL', name: 'Apple Inc.', weight: 7.2, shares: 0, marketValue: 0 },
      { rank: 2, symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.8, shares: 0, marketValue: 0 },
      { rank: 3, symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 5.4, shares: 0, marketValue: 0 },
      { rank: 4, symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.8, shares: 0, marketValue: 0 },
      { rank: 5, symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 2.1, shares: 0, marketValue: 0 },
      { rank: 6, symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.4, shares: 0, marketValue: 0 },
      { rank: 7, symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.8, shares: 0, marketValue: 0 },
      { rank: 8, symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', weight: 1.7, shares: 0, marketValue: 0 },
      { rank: 9, symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.9, shares: 0, marketValue: 0 },
      { rank: 10, symbol: 'LLY', name: 'Eli Lilly and Company', weight: 1.5, shares: 0, marketValue: 0 }
    ];

    const estimatedHoldings = {
      'SPY': sp500Holdings,
      'VOO': sp500Holdings, // Vanguard S&P 500 - same holdings as SPY
      'IVV': sp500Holdings, // iShares Core S&P 500 - same holdings as SPY
      'QQQ': [
        { rank: 1, symbol: 'AAPL', name: 'Apple Inc.', weight: 8.5, shares: 0, marketValue: 0 },
        { rank: 2, symbol: 'MSFT', name: 'Microsoft Corporation', weight: 8.2, shares: 0, marketValue: 0 },
        { rank: 3, symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 7.5, shares: 0, marketValue: 0 },
        { rank: 4, symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 5.2, shares: 0, marketValue: 0 },
        { rank: 5, symbol: 'META', name: 'Meta Platforms Inc.', weight: 4.8, shares: 0, marketValue: 0 },
        { rank: 6, symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 3.2, shares: 0, marketValue: 0 },
        { rank: 7, symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 2.8, shares: 0, marketValue: 0 },
        { rank: 8, symbol: 'TSLA', name: 'Tesla Inc.', weight: 4.5, shares: 0, marketValue: 0 },
        { rank: 9, symbol: 'AVGO', name: 'Broadcom Inc.', weight: 4.2, shares: 0, marketValue: 0 },
        { rank: 10, symbol: 'COST', name: 'Costco Wholesale Corporation', weight: 2.6, shares: 0, marketValue: 0 }
      ],
      'VTI': [
        { rank: 1, symbol: 'AAPL', name: 'Apple Inc.', weight: 5.8, shares: 0, marketValue: 0 },
        { rank: 2, symbol: 'MSFT', name: 'Microsoft Corporation', weight: 5.5, shares: 0, marketValue: 0 },
        { rank: 3, symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 4.3, shares: 0, marketValue: 0 },
        { rank: 4, symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.0, shares: 0, marketValue: 0 },
        { rank: 5, symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 1.7, shares: 0, marketValue: 0 },
        { rank: 6, symbol: 'META', name: 'Meta Platforms Inc.', weight: 1.9, shares: 0, marketValue: 0 },
        { rank: 7, symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.4, shares: 0, marketValue: 0 },
        { rank: 8, symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', weight: 1.4, shares: 0, marketValue: 0 },
        { rank: 9, symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.5, shares: 0, marketValue: 0 },
        { rank: 10, symbol: 'LLY', name: 'Eli Lilly and Company', weight: 1.2, shares: 0, marketValue: 0 }
      ],
      'XLK': [
        { rank: 1, symbol: 'AAPL', name: 'Apple Inc.', weight: 21.5, shares: 0, marketValue: 0 },
        { rank: 2, symbol: 'MSFT', name: 'Microsoft Corporation', weight: 20.2, shares: 0, marketValue: 0 },
        { rank: 3, symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 16.5, shares: 0, marketValue: 0 },
        { rank: 4, symbol: 'AVGO', name: 'Broadcom Inc.', weight: 5.2, shares: 0, marketValue: 0 },
        { rank: 5, symbol: 'CRM', name: 'Salesforce Inc.', weight: 2.8, shares: 0, marketValue: 0 },
        { rank: 6, symbol: 'ORCL', name: 'Oracle Corporation', weight: 2.5, shares: 0, marketValue: 0 },
        { rank: 7, symbol: 'CSCO', name: 'Cisco Systems Inc.', weight: 2.2, shares: 0, marketValue: 0 },
        { rank: 8, symbol: 'ACN', name: 'Accenture plc', weight: 2.0, shares: 0, marketValue: 0 },
        { rank: 9, symbol: 'AMD', name: 'Advanced Micro Devices Inc.', weight: 1.9, shares: 0, marketValue: 0 },
        { rank: 10, symbol: 'ADBE', name: 'Adobe Inc.', weight: 1.8, shares: 0, marketValue: 0 }
      ]
    };

    return estimatedHoldings[symbol.toUpperCase()] || [];
  }

  /**
   * Helper: Get estimated sector allocation
   */
  static getEstimatedSectors(symbol) {
    const estimatedSectors = {
      'SPY': [
        { sector: 'Technology', weight: 28.5 },
        { sector: 'Healthcare', weight: 13.2 },
        { sector: 'Financials', weight: 12.8 },
        { sector: 'Consumer Discretionary', weight: 10.5 },
        { sector: 'Communication Services', weight: 8.7 }
      ],
      'QQQ': [
        { sector: 'Technology', weight: 48.5 },
        { sector: 'Communication Services', weight: 16.2 },
        { sector: 'Consumer Discretionary', weight: 14.8 },
        { sector: 'Healthcare', weight: 6.5 },
        { sector: 'Consumer Staples', weight: 5.2 }
      ]
    };

    return estimatedSectors[symbol.toUpperCase()] || [];
  }

  /**
   * Cache management
   */
  static getCache(key, customDuration = CACHE_DURATION) {
    const item = cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > customDuration) {
      cache.delete(key);
      return null;
    }

    return item.data;
  }

  static setCache(key, data, customDuration = CACHE_DURATION) {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      duration: customDuration
    });
  }

  static clearCache() {
    cache.clear();
    logger.info('ETF analyzer cache cleared');
  }

  /**
   * Helper: Get ETF name from symbol
   */
  static getETFName(symbol) {
    const names = {
      // S&P 500 ETFs
      'SPY': 'SPDR S&P 500 ETF Trust',
      'VOO': 'Vanguard S&P 500 ETF',
      'IVV': 'iShares Core S&P 500 ETF',
      'SPLG': 'SPDR Portfolio S&P 500 ETF',
      'SPYG': 'SPDR Portfolio S&P 500 Growth ETF',
      'SPYV': 'SPDR Portfolio S&P 500 Value ETF',

      // Total Market ETFs
      'VTI': 'Vanguard Total Stock Market ETF',
      'ITOT': 'iShares Core S&P Total U.S. Stock Market ETF',
      'SCHB': 'Schwab U.S. Broad Market ETF',
      'IWV': 'iShares Russell 3000 ETF',

      // Nasdaq/Tech ETFs
      'QQQ': 'Invesco QQQ Trust',
      'QQQM': 'Invesco NASDAQ 100 ETF',
      'ONEQ': 'Fidelity Nasdaq Composite Index ETF',
      'QTEC': 'First Trust NASDAQ-100 Technology Sector Index Fund',
      'IGV': 'iShares Expanded Tech-Software Sector ETF',
      'SOXX': 'iShares Semiconductor ETF',

      // Growth ETFs
      'VUG': 'Vanguard Growth ETF',
      'IWF': 'iShares Russell 1000 Growth ETF',
      'SCHG': 'Schwab U.S. Large-Cap Growth ETF',
      'VONG': 'Vanguard Russell 1000 Growth ETF',

      // Value ETFs
      'VTV': 'Vanguard Value ETF',
      'IWD': 'iShares Russell 1000 Value ETF',
      'SCHV': 'Schwab U.S. Large-Cap Value ETF',
      'VONV': 'Vanguard Russell 1000 Value ETF',

      // Mid-Cap ETFs
      'IJH': 'iShares Core S&P Mid-Cap ETF',
      'VO': 'Vanguard Mid-Cap ETF',
      'MDY': 'SPDR S&P MidCap 400 ETF Trust',
      'SCHM': 'Schwab U.S. Mid-Cap ETF',
      'IWR': 'iShares Russell Mid-Cap ETF',

      // Small-Cap ETFs
      'IJR': 'iShares Core S&P Small-Cap ETF',
      'VB': 'Vanguard Small-Cap ETF',
      'IWM': 'iShares Russell 2000 ETF',
      'SCHA': 'Schwab U.S. Small-Cap ETF',
      'VTWO': 'Vanguard Russell 2000 ETF',

      // Dividend ETFs
      'VIG': 'Vanguard Dividend Appreciation ETF',
      'SCHD': 'Schwab U.S. Dividend Equity ETF',
      'VYM': 'Vanguard High Dividend Yield ETF',
      'DGRO': 'iShares Core Dividend Growth ETF',
      'DVY': 'iShares Select Dividend ETF',
      'NOBL': 'ProShares S&P 500 Dividend Aristocrats ETF',
      'HDV': 'iShares Core High Dividend ETF',
      'SDY': 'SPDR S&P Dividend ETF',

      // SPDR Sector ETFs
      'XLK': 'Technology Select Sector SPDR Fund',
      'XLF': 'Financial Select Sector SPDR Fund',
      'XLE': 'Energy Select Sector SPDR Fund',
      'XLV': 'Health Care Select Sector SPDR Fund',
      'XLI': 'Industrial Select Sector SPDR Fund',
      'XLP': 'Consumer Staples Select Sector SPDR Fund',
      'XLY': 'Consumer Discretionary Select Sector SPDR Fund',
      'XLU': 'Utilities Select Sector SPDR Fund',
      'XLRE': 'Real Estate Select Sector SPDR Fund',
      'XLB': 'Materials Select Sector SPDR Fund',
      'XLC': 'Communication Services Select Sector SPDR Fund',

      // International Developed Markets
      'VEA': 'Vanguard FTSE Developed Markets ETF',
      'IEFA': 'iShares Core MSCI EAFE ETF',
      'EFA': 'iShares MSCI EAFE ETF',
      'SCHF': 'Schwab International Equity ETF',
      'VXUS': 'Vanguard Total International Stock ETF',
      'IXUS': 'iShares Core MSCI Total International Stock ETF',

      // Emerging Markets
      'VWO': 'Vanguard FTSE Emerging Markets ETF',
      'IEMG': 'iShares Core MSCI Emerging Markets ETF',
      'EEM': 'iShares MSCI Emerging Markets ETF',
      'SCHE': 'Schwab Emerging Markets Equity ETF',

      // Bond ETFs
      'AGG': 'iShares Core U.S. Aggregate Bond ETF',
      'BND': 'Vanguard Total Bond Market ETF',
      'SCHZ': 'Schwab U.S. Aggregate Bond ETF',
      'IUSB': 'iShares Core Total USD Bond Market ETF',
      'TLT': 'iShares 20+ Year Treasury Bond ETF',
      'IEF': 'iShares 7-10 Year Treasury Bond ETF',
      'SHY': 'iShares 1-3 Year Treasury Bond ETF',
      'LQD': 'iShares iBoxx $ Investment Grade Corporate Bond ETF',
      'HYG': 'iShares iBoxx $ High Yield Corporate Bond ETF',
      'MUB': 'iShares National Muni Bond ETF',
      'VCIT': 'Vanguard Intermediate-Term Corporate Bond ETF',
      'VCSH': 'Vanguard Short-Term Corporate Bond ETF',
      'TIP': 'iShares TIPS Bond ETF',

      // Real Estate
      'VNQ': 'Vanguard Real Estate ETF',
      'SCHH': 'Schwab U.S. REIT ETF',
      'IYR': 'iShares U.S. Real Estate ETF',
      'USRT': 'iShares Core U.S. REIT ETF',

      // Commodities
      'GLD': 'SPDR Gold Trust',
      'IAU': 'iShares Gold Trust',
      'SLV': 'iShares Silver Trust',
      'USO': 'United States Oil Fund',
      'DBC': 'Invesco DB Commodity Index Tracking Fund',
      'PDBC': 'Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF',

      // ESG/Sustainable
      'ESGU': 'iShares ESG Aware MSCI USA ETF',
      'VSGX': 'Vanguard ESG International Stock ETF',
      'ESGV': 'Vanguard ESG U.S. Stock ETF',
      'SUSA': 'iShares MSCI USA ESG Select ETF',

      // Clean Energy/Climate
      'ICLN': 'iShares Global Clean Energy ETF',
      'TAN': 'Invesco Solar ETF',
      'QCLN': 'First Trust NASDAQ Clean Edge Green Energy Index Fund',
      'PBW': 'Invesco WilderHill Clean Energy ETF',

      // Thematic ETFs
      'ARKK': 'ARK Innovation ETF',
      'ARKW': 'ARK Next Generation Internet ETF',
      'ARKG': 'ARK Genomic Revolution ETF',
      'ARKF': 'ARK Fintech Innovation ETF',
      'ARKQ': 'ARK Autonomous Technology & Robotics ETF',
      'BOTZ': 'Global X Robotics & Artificial Intelligence ETF',
      'FINX': 'Global X FinTech ETF',
      'CLOU': 'Global X Cloud Computing ETF',
      'HACK': 'ETFMG Prime Cyber Security ETF',

      // Leveraged/Inverse (Caution)
      'TQQQ': 'ProShares UltraPro QQQ',
      'SQQQ': 'ProShares UltraPro Short QQQ',
      'SPXL': 'Direxion Daily S&P 500 Bull 3X Shares',
      'SPXS': 'Direxion Daily S&P 500 Bear 3X Shares',
      'UPRO': 'ProShares UltraPro S&P500',
      'SOXL': 'Direxion Daily Semiconductor Bull 3X Shares',

      // Defensive/Low Volatility
      'USMV': 'iShares MSCI USA Min Vol Factor ETF',
      'SPLV': 'Invesco S&P 500 Low Volatility ETF',
      'EEMV': 'iShares MSCI Emerging Markets Min Vol Factor ETF'
    };
    return names[symbol.toUpperCase()] || `${symbol} ETF`;
  }

  /**
   * Helper: Get ETF description
   */
  static getETFDescription(symbol) {
    const descriptions = {
      // S&P 500 ETFs
      'SPY': 'Seeks to track the performance of the S&P 500 Index',
      'VOO': 'Seeks to track the performance of the S&P 500 Index',
      'IVV': 'Seeks to track the S&P 500 Index',
      'SPLG': 'Low-cost S&P 500 Index tracking ETF',

      // Total Market
      'VTI': 'Seeks to track the performance of the CRSP US Total Market Index',
      'ITOT': 'Tracks the S&P Total Market Index',
      'SCHB': 'Tracks the Dow Jones U.S. Broad Stock Market Index',

      // Nasdaq/Tech
      'QQQ': 'Tracks the Nasdaq-100 Index',
      'QQQM': 'Lower cost Nasdaq-100 Index tracking ETF',
      'SOXX': 'Tracks the PHLX Semiconductor Sector Index',
      'IGV': 'Tracks U.S. software companies',

      // Growth/Value
      'VUG': 'Tracks the CRSP US Large Cap Growth Index',
      'VTV': 'Tracks the CRSP US Large Cap Value Index',

      // Dividend
      'VIG': 'Tracks companies with a record of increasing dividends',
      'SCHD': 'Tracks the Dow Jones U.S. Dividend 100 Index',
      'VYM': 'Tracks high dividend yielding companies',

      // International
      'VEA': 'Tracks developed markets excluding the U.S.',
      'VWO': 'Tracks emerging market equities',
      'VXUS': 'Tracks non-U.S. stocks globally',

      // Bonds
      'AGG': 'Tracks the U.S. investment-grade bond market',
      'BND': 'Tracks the Bloomberg U.S. Aggregate Float Adjusted Index',
      'TLT': 'Tracks long-term U.S. Treasury bonds',

      // Real Estate
      'VNQ': 'Tracks U.S. real estate investment trusts (REITs)',

      // Commodities
      'GLD': 'Seeks to reflect the price of gold bullion',
      'SLV': 'Seeks to reflect the price of silver',

      // Thematic
      'ARKK': 'Actively managed innovation-focused ETF',
      'ICLN': 'Tracks global clean energy companies',
      'BOTZ': 'Tracks robotics and AI companies'
    };
    return descriptions[symbol.toUpperCase()] || 'Exchange Traded Fund';
  }

  /**
   * Helper: Get expense ratio for known ETFs
   */
  static getExpenseRatio(symbol) {
    const ratios = {
      // S&P 500 ETFs
      'SPY': 0.0945, 'VOO': 0.03, 'IVV': 0.03, 'SPLG': 0.02, 'SPYG': 0.04, 'SPYV': 0.04,

      // Total Market ETFs
      'VTI': 0.03, 'ITOT': 0.03, 'SCHB': 0.03, 'IWV': 0.20,

      // Nasdaq/Tech ETFs
      'QQQ': 0.20, 'QQQM': 0.15, 'ONEQ': 0.21, 'QTEC': 0.57, 'IGV': 0.41, 'SOXX': 0.35,

      // Growth ETFs
      'VUG': 0.04, 'IWF': 0.19, 'SCHG': 0.04, 'VONG': 0.07,

      // Value ETFs
      'VTV': 0.04, 'IWD': 0.19, 'SCHV': 0.04, 'VONV': 0.07,

      // Mid-Cap ETFs
      'IJH': 0.05, 'VO': 0.04, 'MDY': 0.23, 'SCHM': 0.04, 'IWR': 0.19,

      // Small-Cap ETFs
      'IJR': 0.06, 'VB': 0.05, 'IWM': 0.19, 'SCHA': 0.04, 'VTWO': 0.07,

      // Dividend ETFs
      'VIG': 0.06, 'SCHD': 0.06, 'VYM': 0.06, 'DGRO': 0.08, 'DVY': 0.38, 'NOBL': 0.35, 'HDV': 0.08, 'SDY': 0.35,

      // SPDR Sector ETFs
      'XLK': 0.10, 'XLF': 0.10, 'XLE': 0.10, 'XLV': 0.10, 'XLI': 0.10, 'XLP': 0.10, 'XLY': 0.10, 'XLU': 0.10, 'XLRE': 0.10, 'XLB': 0.10, 'XLC': 0.10,

      // International Developed Markets
      'VEA': 0.05, 'IEFA': 0.07, 'EFA': 0.33, 'SCHF': 0.06, 'VXUS': 0.07, 'IXUS': 0.07,

      // Emerging Markets
      'VWO': 0.08, 'IEMG': 0.09, 'EEM': 0.68, 'SCHE': 0.11,

      // Bond ETFs
      'AGG': 0.03, 'BND': 0.03, 'SCHZ': 0.03, 'IUSB': 0.06, 'TLT': 0.15, 'IEF': 0.15, 'SHY': 0.15, 'LQD': 0.14, 'HYG': 0.49, 'MUB': 0.05, 'VCIT': 0.04, 'VCSH': 0.04, 'TIP': 0.19,

      // Real Estate
      'VNQ': 0.12, 'SCHH': 0.07, 'IYR': 0.39, 'USRT': 0.08,

      // Commodities
      'GLD': 0.40, 'IAU': 0.25, 'SLV': 0.50, 'USO': 0.60, 'DBC': 0.87, 'PDBC': 0.59,

      // ESG/Sustainable
      'ESGU': 0.15, 'VSGX': 0.12, 'ESGV': 0.09, 'SUSA': 0.25,

      // Clean Energy/Climate
      'ICLN': 0.42, 'TAN': 0.69, 'QCLN': 0.60, 'PBW': 0.70,

      // Thematic ETFs
      'ARKK': 0.75, 'ARKW': 0.75, 'ARKG': 0.75, 'ARKF': 0.75, 'ARKQ': 0.75, 'BOTZ': 0.68, 'FINX': 0.68, 'CLOU': 0.68, 'HACK': 0.60,

      // Leveraged/Inverse
      'TQQQ': 0.88, 'SQQQ': 0.95, 'SPXL': 0.90, 'SPXS': 0.90, 'UPRO': 0.91, 'SOXL': 0.91,

      // Defensive/Low Volatility
      'USMV': 0.15, 'SPLV': 0.25, 'EEMV': 0.25
    };
    return ratios[symbol.toUpperCase()] || 0.10;
  }

  /**
   * Helper: Get AUM for known ETFs (in dollars)
   */
  static getAUM(symbol) {
    const aums = {
      // S&P 500 ETFs (Largest)
      'SPY': 580e9, 'VOO': 1.2e12, 'IVV': 500e9, 'SPLG': 30e9, 'SPYG': 25e9, 'SPYV': 18e9,

      // Total Market ETFs
      'VTI': 400e9, 'ITOT': 50e9, 'SCHB': 30e9, 'IWV': 15e9,

      // Nasdaq/Tech ETFs
      'QQQ': 280e9, 'QQQM': 30e9, 'ONEQ': 5e9, 'QTEC': 4e9, 'IGV': 10e9, 'SOXX': 12e9,

      // Growth ETFs
      'VUG': 150e9, 'IWF': 90e9, 'SCHG': 25e9, 'VONG': 12e9,

      // Value ETFs
      'VTV': 120e9, 'IWD': 70e9, 'SCHV': 20e9, 'VONV': 10e9,

      // Mid-Cap ETFs
      'IJH': 90e9, 'VO': 70e9, 'MDY': 25e9, 'SCHM': 15e9, 'IWR': 35e9,

      // Small-Cap ETFs
      'IJR': 75e9, 'VB': 60e9, 'IWM': 65e9, 'SCHA': 12e9, 'VTWO': 15e9,

      // Dividend ETFs
      'VIG': 90e9, 'SCHD': 60e9, 'VYM': 55e9, 'DGRO': 25e9, 'DVY': 18e9, 'NOBL': 12e9, 'HDV': 10e9, 'SDY': 20e9,

      // SPDR Sector ETFs
      'XLK': 65e9, 'XLF': 45e9, 'XLE': 30e9, 'XLV': 40e9, 'XLI': 22e9, 'XLP': 18e9, 'XLY': 20e9, 'XLU': 15e9, 'XLRE': 8e9, 'XLB': 7e9, 'XLC': 15e9,

      // International Developed Markets
      'VEA': 120e9, 'IEFA': 110e9, 'EFA': 80e9, 'SCHF': 35e9, 'VXUS': 95e9, 'IXUS': 40e9,

      // Emerging Markets
      'VWO': 90e9, 'IEMG': 85e9, 'EEM': 20e9, 'SCHE': 10e9,

      // Bond ETFs
      'AGG': 110e9, 'BND': 105e9, 'SCHZ': 30e9, 'IUSB': 25e9, 'TLT': 45e9, 'IEF': 25e9, 'SHY': 25e9, 'LQD': 35e9, 'HYG': 15e9, 'MUB': 30e9, 'VCIT': 50e9, 'VCSH': 45e9, 'TIP': 35e9,

      // Real Estate
      'VNQ': 40e9, 'SCHH': 8e9, 'IYR': 5e9, 'USRT': 3e9,

      // Commodities
      'GLD': 70e9, 'IAU': 35e9, 'SLV': 12e9, 'USO': 1.5e9, 'DBC': 1e9, 'PDBC': 5e9,

      // ESG/Sustainable
      'ESGU': 25e9, 'VSGX': 8e9, 'ESGV': 15e9, 'SUSA': 3e9,

      // Clean Energy/Climate
      'ICLN': 5e9, 'TAN': 2e9, 'QCLN': 1.5e9, 'PBW': 1e9,

      // Thematic ETFs
      'ARKK': 8e9, 'ARKW': 2e9, 'ARKG': 1.5e9, 'ARKF': 1.2e9, 'ARKQ': 1e9, 'BOTZ': 2.5e9, 'FINX': 1.8e9, 'CLOU': 1.2e9, 'HACK': 1.5e9,

      // Leveraged/Inverse
      'TQQQ': 25e9, 'SQQQ': 5e9, 'SPXL': 3e9, 'SPXS': 1e9, 'UPRO': 4e9, 'SOXL': 8e9,

      // Defensive/Low Volatility
      'USMV': 25e9, 'SPLV': 10e9, 'EEMV': 2e9
    };
    return aums[symbol.toUpperCase()] || 10e9;
  }

  /**
   * Helper: Get default profile for when API fails
   */
  static getDefaultProfile(symbol) {
    return {
      symbol: symbol,
      name: this.getETFName(symbol),
      description: this.getETFDescription(symbol),
      sector: 'ETF',
      industry: 'Exchange Traded Fund',
      website: '',
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      expenseRatio: this.getExpenseRatio(symbol),
      aum: this.getAUM(symbol),
      inceptionDate: '',
      exchange: 'NYSE Arca',
      image: null
    };
  }
}

module.exports = ETFAnalyzerService;
