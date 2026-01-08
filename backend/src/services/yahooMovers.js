/**
 * Yahoo Finance Market Movers Service
 * Fetches real-time top gainers, losers, crypto, ETFs, mutual funds from Yahoo Finance
 */

const axios = require('axios');
const logger = require('../utils/logger');
const UnifiedMarketDataService = require('./unifiedMarketData');

class YahooMoversService {
  constructor() {
    this.baseUrl = 'https://query1.finance.yahoo.com/v1/finance';
    this.screenerUrl = 'https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved';
    this.cache = new Map();
    this.cacheTTL = 60 * 1000; // 1 minute cache
    this.unifiedMarket = new UnifiedMarketDataService();

    // Yahoo Finance screener IDs for different categories
    this.screeners = {
      gainers: 'day_gainers',
      losers: 'day_losers',
      mostActive: 'most_actives',
      trending: 'trending_tickers',
      cryptoGainers: 'all_cryptocurrencies_us',
      etfGainers: 'top_etfs_us'
    };

    logger.info('Yahoo Movers Service initialized');
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch Yahoo Finance screener data
   */
  async fetchScreener(screenerId, count = 10) {
    const cacheKey = `screener_${screenerId}_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(this.screenerUrl, {
        params: {
          scrIds: screenerId,
          count: count,
          formatted: true
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const data = response.data?.finance?.result?.[0]?.quotes || [];
      const formatted = data.map(q => this.formatQuote(q));
      this.setCache(cacheKey, formatted);
      return formatted;
    } catch (err) {
      logger.debug(`Yahoo screener ${screenerId} failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Format Yahoo quote to standard format
   * Handles both screener format (with .raw) and quote format (direct values)
   */
  formatQuote(q) {
    // Helper to extract value from Yahoo's nested format
    const getValue = (field) => {
      if (field === null || field === undefined) return 0;
      if (typeof field === 'object' && field.raw !== undefined) return field.raw;
      return field;
    };

    return {
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: getValue(q.regularMarketPrice) || getValue(q.price) || 0,
      change: getValue(q.regularMarketChange) || getValue(q.change) || 0,
      changePercent: getValue(q.regularMarketChangePercent) || getValue(q.changePercent) || 0,
      volume: getValue(q.regularMarketVolume) || getValue(q.volume) || 0,
      marketCap: getValue(q.marketCap) || 0,
      previousClose: getValue(q.regularMarketPreviousClose) || getValue(q.previousClose) || 0,
      high: getValue(q.regularMarketDayHigh) || getValue(q.high) || 0,
      low: getValue(q.regularMarketDayLow) || getValue(q.low) || 0
    };
  }

  /**
   * Get top gainers - stocks with highest % gain
   */
  async getTopGainers(count = 10) {
    const data = await this.fetchScreener('day_gainers', count);
    if (data.length > 0) return data;

    // Fallback: fetch popular stocks and sort
    return this.fetchAndSortSymbols('gainers', count);
  }

  /**
   * Get top losers - stocks with highest % loss
   */
  async getTopLosers(count = 10) {
    const data = await this.fetchScreener('day_losers', count);
    if (data.length > 0) return data;

    return this.fetchAndSortSymbols('losers', count);
  }

  /**
   * Get most active stocks by volume
   */
  async getMostActive(count = 10) {
    const data = await this.fetchScreener('most_actives', count);
    if (data.length > 0) return data;

    return this.fetchAndSortSymbols('active', count);
  }

  /**
   * Get top crypto by market cap and change
   */
  async getTopCrypto(count = 10) {
    const cacheKey = `crypto_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const cryptoSymbols = [
      'BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD',
      'DOGE-USD', 'ADA-USD', 'AVAX-USD', 'DOT-USD', 'MATIC-USD',
      'LINK-USD', 'UNI-USD', 'ATOM-USD', 'LTC-USD', 'SHIB-USD'
    ];

    try {
      const quotes = await this.fetchMultipleQuotes(cryptoSymbols);
      const sorted = quotes
        .filter(q => q.price > 0)
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, count)
        .map(q => ({
          ...q,
          symbol: q.symbol.replace('-USD', ''),
          name: q.name.replace(' USD', '')
        }));

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      logger.debug(`Crypto fetch failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get top ETFs
   */
  async getTopETFs(count = 10) {
    const cacheKey = `etfs_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Popular ETFs across different categories
    const etfSymbols = [
      'SPY', 'QQQ', 'IWM', 'DIA', 'VTI',     // Index
      'ARKK', 'ARKG', 'ARKW', 'ARKF',         // ARK
      'XLK', 'XLF', 'XLE', 'XLV', 'XLY',      // Sectors
      'GLD', 'SLV', 'USO', 'UNG',             // Commodities
      'TLT', 'HYG', 'LQD', 'BND',             // Bonds
      'VWO', 'EEM', 'EFA', 'IEMG',            // International
      'SOXL', 'TQQQ', 'SQQQ', 'SPXU'          // Leveraged
    ];

    try {
      const quotes = await this.fetchMultipleQuotes(etfSymbols);
      const sorted = quotes
        .filter(q => q.price > 0)
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, count);

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      logger.debug(`ETF fetch failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get top mutual funds
   */
  async getTopMutualFunds(count = 10) {
    const cacheKey = `mutualfunds_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Popular mutual funds
    const mfSymbols = [
      'VFIAX', 'VTSAX', 'FXAIX', 'VBTLX', 'VTIAX',
      'SWPPX', 'SWTSX', 'VWUSX', 'VIGAX', 'VDIGX',
      'FSKAX', 'FCNTX', 'FBGRX', 'FBALX', 'FDGRX',
      'PRGFX', 'PRWCX', 'TRBCX', 'AGTHX', 'ANCFX'
    ];

    try {
      const quotes = await this.fetchMultipleQuotes(mfSymbols);
      const sorted = quotes
        .filter(q => q.price > 0)
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, count);

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      logger.debug(`Mutual fund fetch failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch multiple quotes using unified market service (works reliably)
   */
  async fetchMultipleQuotes(symbols) {
    try {
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const quote = await this.unifiedMarket.fetchQuote(symbol);
            if (quote && quote.price > 0) {
              return {
                symbol: quote.symbol,
                name: quote.name || symbol,
                price: quote.price,
                change: quote.change || 0,
                changePercent: quote.changePercent || 0,
                volume: quote.volume || 0,
                previousClose: quote.previousClose || 0,
                high: quote.high || 0,
                low: quote.low || 0
              };
            }
            return null;
          } catch (err) {
            return null;
          }
        })
      );
      return quotes.filter(q => q !== null);
    } catch (err) {
      logger.debug(`Multi-quote fetch failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Fallback: fetch popular symbols and sort
   */
  async fetchAndSortSymbols(type, count) {
    const symbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD',
      'JPM', 'BAC', 'GS', 'V', 'MA', 'JNJ', 'UNH', 'PFE',
      'WMT', 'COST', 'HD', 'XOM', 'CVX', 'INTC', 'NFLX', 'DIS',
      'PLTR', 'COIN', 'NET', 'CRWD', 'SNOW', 'DDOG', 'CRM', 'UBER',
      'OKLO', 'IONQ', 'RGTI', 'SMCI', 'ARM', 'AVGO', 'MU', 'QCOM'
    ];

    const quotes = await this.fetchMultipleQuotes(symbols);

    if (type === 'gainers') {
      return quotes
        .filter(q => q.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, count);
    } else if (type === 'losers') {
      return quotes
        .filter(q => q.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, count);
    } else {
      return quotes
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, count);
    }
  }

  /**
   * Get top crypto gainers
   */
  async getCryptoGainers(count = 5) {
    const crypto = await this.getTopCrypto(15);
    return crypto
      .filter(c => c.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, count);
  }

  /**
   * Get top crypto losers
   */
  async getCryptoLosers(count = 5) {
    const crypto = await this.getTopCrypto(15);
    return crypto
      .filter(c => c.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, count);
  }

  /**
   * Get metals prices (Gold, Silver, Platinum, Copper, Palladium)
   */
  async getMetals(count = 10) {
    const cacheKey = `metals_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const metalSymbols = [
      'GC=F',   // Gold Futures
      'SI=F',   // Silver Futures
      'PL=F',   // Platinum Futures
      'HG=F',   // Copper Futures
      'PA=F',   // Palladium Futures
      'GLD',    // Gold ETF
      'SLV',    // Silver ETF
      'PPLT',   // Platinum ETF
      'PALL',   // Palladium ETF
      'CPER'    // Copper ETF
    ];

    try {
      const quotes = await this.fetchMultipleQuotes(metalSymbols);
      const metals = quotes.map(q => ({
        ...q,
        symbol: q.symbol.replace('=F', ''),
        name: this.getMetalName(q.symbol)
      }));
      this.setCache(cacheKey, metals);
      return metals;
    } catch (err) {
      logger.debug(`Metals fetch failed: ${err.message}`);
      return [];
    }
  }

  getMetalName(symbol) {
    const names = {
      'GC=F': 'Gold', 'SI=F': 'Silver', 'PL=F': 'Platinum',
      'HG=F': 'Copper', 'PA=F': 'Palladium', 'GLD': 'Gold ETF',
      'SLV': 'Silver ETF', 'PPLT': 'Platinum ETF', 'PALL': 'Palladium ETF',
      'CPER': 'Copper ETF'
    };
    return names[symbol] || symbol;
  }

  /**
   * Get metals gainers
   */
  async getMetalsGainers(count = 5) {
    const metals = await this.getMetals(10);
    return metals
      .filter(m => m.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, count);
  }

  /**
   * Get metals losers
   */
  async getMetalsLosers(count = 5) {
    const metals = await this.getMetals(10);
    return metals
      .filter(m => m.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, count);
  }

  /**
   * Get currency/forex pairs
   */
  async getCurrencies(count = 10) {
    const cacheKey = `currencies_${count}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const forexSymbols = [
      'EURUSD=X',  // EUR/USD
      'GBPUSD=X',  // GBP/USD
      'USDJPY=X',  // USD/JPY
      'AUDUSD=X',  // AUD/USD
      'USDCAD=X',  // USD/CAD
      'USDCHF=X',  // USD/CHF
      'NZDUSD=X',  // NZD/USD
      'EURGBP=X',  // EUR/GBP
      'EURJPY=X',  // EUR/JPY
      'GBPJPY=X',  // GBP/JPY
      'DX-Y.NYB'   // US Dollar Index
    ];

    try {
      const quotes = await this.fetchMultipleQuotes(forexSymbols);
      const currencies = quotes.map(q => ({
        ...q,
        symbol: q.symbol.replace('=X', '').replace('-Y.NYB', ''),
        name: this.getCurrencyName(q.symbol)
      }));
      this.setCache(cacheKey, currencies);
      return currencies;
    } catch (err) {
      logger.debug(`Currencies fetch failed: ${err.message}`);
      return [];
    }
  }

  getCurrencyName(symbol) {
    const names = {
      'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'USDJPY=X': 'USD/JPY',
      'AUDUSD=X': 'AUD/USD', 'USDCAD=X': 'USD/CAD', 'USDCHF=X': 'USD/CHF',
      'NZDUSD=X': 'NZD/USD', 'EURGBP=X': 'EUR/GBP', 'EURJPY=X': 'EUR/JPY',
      'GBPJPY=X': 'GBP/JPY', 'DX-Y.NYB': 'US Dollar Index'
    };
    return names[symbol] || symbol;
  }

  /**
   * Get currency gainers
   */
  async getCurrencyGainers(count = 5) {
    const currencies = await this.getCurrencies(11);
    return currencies
      .filter(c => c.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, count);
  }

  /**
   * Get currency losers
   */
  async getCurrencyLosers(count = 5) {
    const currencies = await this.getCurrencies(11);
    return currencies
      .filter(c => c.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, count);
  }

  /**
   * Get all market movers in one call
   */
  async getAllMovers() {
    const cacheKey = 'all_movers';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    logger.info('[YahooMovers] Fetching all market movers...');

    const [
      gainers, losers, active,
      cryptoGainers, cryptoLosers,
      metalsGainers, metalsLosers,
      currencyGainers, currencyLosers,
      etfs, mutualFunds
    ] = await Promise.all([
      this.getTopGainers(10),
      this.getTopLosers(10),
      this.getMostActive(10),
      this.getCryptoGainers(5),
      this.getCryptoLosers(5),
      this.getMetalsGainers(5),
      this.getMetalsLosers(5),
      this.getCurrencyGainers(5),
      this.getCurrencyLosers(5),
      this.getTopETFs(10),
      this.getTopMutualFunds(10)
    ]);

    const result = {
      gainers,
      losers,
      active,
      cryptoGainers,
      cryptoLosers,
      metalsGainers,
      metalsLosers,
      currencyGainers,
      currencyLosers,
      etfs,
      mutualFunds,
      lastUpdated: new Date().toISOString()
    };

    this.setCache(cacheKey, result);
    logger.info(`[YahooMovers] Fetched all categories`);

    return result;
  }
}

module.exports = new YahooMoversService();
