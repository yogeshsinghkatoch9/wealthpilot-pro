/**
 * Yahoo Finance Options Data Service
 * Fetches real options chain data from Yahoo Finance
 */

const logger = require('../utils/logger');

class YahooOptionsService {
  constructor() {
    this.baseUrl = 'https://query1.finance.yahoo.com/v7/finance/options';
    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Get available expiration dates for a symbol
   */
  async getExpirationDates(symbol) {
    try {
      const url = `${this.baseUrl}/${symbol.toUpperCase()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.optionChain?.result?.[0];

      if (!result) {
        throw new Error('No options data available for this symbol');
      }

      return {
        symbol: result.underlyingSymbol,
        expirationDates: result.expirationDates || [],
        strikes: result.strikes || [],
        quote: {
          price: result.quote?.regularMarketPrice,
          change: result.quote?.regularMarketChange,
          changePercent: result.quote?.regularMarketChangePercent,
          volume: result.quote?.regularMarketVolume
        }
      };
    } catch (error) {
      logger.error('Error fetching expiration dates:', error);
      throw error;
    }
  }

  /**
   * Get options chain for a specific expiration date
   */
  async getOptionsChain(symbol, expirationDate = null) {
    try {
      const cacheKey = `${symbol}-${expirationDate || 'default'}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }

      let url = `${this.baseUrl}/${symbol.toUpperCase()}`;
      if (expirationDate) {
        url += `?date=${expirationDate}`;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.optionChain?.result?.[0];

      if (!result) {
        throw new Error('No options data available');
      }

      const options = result.options?.[0] || {};
      const quote = result.quote || {};

      const chainData = {
        symbol: result.underlyingSymbol,
        stockPrice: quote.regularMarketPrice,
        stockChange: quote.regularMarketChange,
        stockChangePercent: quote.regularMarketChangePercent,
        expirationDate: options.expirationDate,
        expirationDateFormatted: new Date(options.expirationDate * 1000).toISOString().split('T')[0],
        daysToExpiry: Math.ceil((options.expirationDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)),
        availableExpirations: result.expirationDates || [],
        strikes: result.strikes || [],
        calls: this.formatOptions(options.calls || [], quote.regularMarketPrice, 'call'),
        puts: this.formatOptions(options.puts || [], quote.regularMarketPrice, 'put')
      };

      this.cache.set(cacheKey, { data: chainData, timestamp: Date.now() });
      return chainData;
    } catch (error) {
      logger.error('Error fetching options chain:', error);
      throw error;
    }
  }

  /**
   * Format options data with additional calculations
   */
  formatOptions(options, stockPrice, type) {
    return options.map(opt => {
      const moneyness = type === 'call'
        ? ((stockPrice - opt.strike) / opt.strike) * 100
        : ((opt.strike - stockPrice) / opt.strike) * 100;

      return {
        contractSymbol: opt.contractSymbol,
        strike: opt.strike,
        lastPrice: opt.lastPrice || 0,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        mid: ((opt.bid || 0) + (opt.ask || 0)) / 2,
        change: opt.change || 0,
        changePercent: opt.percentChange || 0,
        volume: opt.volume || 0,
        openInterest: opt.openInterest || 0,
        impliedVolatility: Math.round((opt.impliedVolatility || 0) * 10000) / 100, // Convert to %
        inTheMoney: opt.inTheMoney || false,
        moneyness: Math.round(moneyness * 100) / 100,
        // Greeks (if available from Yahoo, otherwise null)
        delta: null,
        gamma: null,
        theta: null,
        vega: null
      };
    });
  }

  /**
   * Get combined chain with calls and puts side by side
   */
  async getCombinedChain(symbol, expirationDate = null) {
    const chain = await this.getOptionsChain(symbol, expirationDate);

    // Create strike-indexed map
    const strikeMap = new Map();

    chain.calls.forEach(call => {
      strikeMap.set(call.strike, { call, put: null, strike: call.strike });
    });

    chain.puts.forEach(put => {
      if (strikeMap.has(put.strike)) {
        strikeMap.get(put.strike).put = put;
      } else {
        strikeMap.set(put.strike, { call: null, put, strike: put.strike });
      }
    });

    // Sort by strike and convert to array
    const combined = Array.from(strikeMap.values())
      .sort((a, b) => a.strike - b.strike);

    return {
      ...chain,
      combined
    };
  }

  /**
   * Search for unusual options activity
   */
  async getUnusualActivity(symbol) {
    try {
      const chain = await this.getOptionsChain(symbol);
      const unusual = [];

      // Look for high volume relative to open interest
      [...chain.calls, ...chain.puts].forEach(opt => {
        const volumeToOI = opt.openInterest > 0 ? opt.volume / opt.openInterest : 0;

        if (volumeToOI > 0.5 && opt.volume > 100) {
          unusual.push({
            ...opt,
            type: chain.calls.includes(opt) ? 'call' : 'put',
            volumeToOI: Math.round(volumeToOI * 100) / 100,
            signal: volumeToOI > 2 ? 'Very High' : volumeToOI > 1 ? 'High' : 'Elevated'
          });
        }
      });

      // Sort by volume/OI ratio
      unusual.sort((a, b) => b.volumeToOI - a.volumeToOI);

      return {
        symbol: chain.symbol,
        stockPrice: chain.stockPrice,
        unusualActivity: unusual.slice(0, 20)
      };
    } catch (error) {
      logger.error('Error finding unusual activity:', error);
      throw error;
    }
  }
}

module.exports = new YahooOptionsService();
