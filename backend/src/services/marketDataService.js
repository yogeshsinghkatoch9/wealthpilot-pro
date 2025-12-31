const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

// Use shared database adapter (supports both SQLite and PostgreSQL)
const db = require('../db/database');

/**
 * Validate stock symbol to prevent SSRF attacks
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const cleaned = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^]{1,10}$/.test(cleaned)) return null;
  return cleaned;
}

class MarketDataService {
  constructor(apiKey) {
    this.alphaVantageKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY;
    if (!this.alphaVantageKey) {
      logger.warn('ALPHA_VANTAGE_API_KEY not set - some market data features may be limited');
    }
    this.lastFetchTime = {};
    this.minFetchInterval = 15000;
    this.wsService = null; // WebSocket service for broadcasting
  }

  setWebSocketService(wsService) {
    this.wsService = wsService;
    logger.info('WebSocket service connected to market data');
  }

  setAlertsService(alertsService) {
    this.alertsService = alertsService;
    logger.info('Alerts service connected to market data');
  }

  async fetchFromYahooFinance(symbol) {
    // Validate symbol to prevent SSRF
    const validSymbol = validateSymbol(symbol);
    if (!validSymbol) {
      throw new Error('Invalid symbol');
    }
    symbol = validSymbol;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
      const response = await axios.get(url, {
        params: { interval: '1d', range: '1d' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000
      });

      const data = response.data;
      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error('No data from Yahoo Finance');
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const quote = result.indicators.quote[0];
      const latestIndex = quote.close.length - 1;
      const currentPrice = quote.close[latestIndex];
      const previousClose = meta.chartPreviousClose || meta.previousClose;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;

      return {
        symbol, price: currentPrice, open: quote.open[latestIndex] || currentPrice,
        high: quote.high[latestIndex] || currentPrice, low: quote.low[latestIndex] || currentPrice,
        volume: quote.volume[latestIndex] || 0, previousClose, change, changePercent,
        timestamp: new Date().toISOString(), source: 'yahoo'
      };
    } catch (error) {
      logger.error(`Yahoo Finance error for ${symbol}:`, error.message);
      throw error;
    }
  }

  async fetchQuote(symbol) {
    // Try cache first (5 minute TTL)
    return await cacheService.getMarketQuote(symbol, async () => {
      try {
        const quote = await this.fetchFromYahooFinance(symbol);
        logger.info(`Fetched ${symbol}: $${quote.price} (${quote.changePercent.toFixed(2)}%)`);
        return quote;
      } catch (error) {
        logger.error(`Failed to fetch ${symbol}:`, error.message);
        return null;
      }
    });
  }

  async fetchQuotes(symbols) {
    const uniqueSymbols = [...new Set(symbols)];
    const promises = uniqueSymbols.map(symbol => this.fetchQuote(symbol));
    const results = await Promise.allSettled(promises);
    return results.filter(r => r.status === 'fulfilled' && r.value !== null).map(r => r.value);
  }

  /**
   * Get historical price data from Yahoo Finance
   * @param {string} symbol - Stock symbol
   * @param {string} range - Time range (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
   * @returns {Promise<Array>} Historical price data with date, open, high, low, close, volume
   */
  async getHistoricalData(symbol, range = '6mo') {
    const validSymbol = validateSymbol(symbol);
    if (!validSymbol) {
      throw new Error('Invalid symbol');
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${validSymbol}`;
      const response = await axios.get(url, {
        params: { interval: '1d', range },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });

      const result = response.data.chart.result[0];
      if (!result || !result.timestamp) {
        throw new Error('No data available');
      }

      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];

      // Build array of price data
      const data = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quotes.close[i] != null) {
          data.push({
            date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
            open: quotes.open[i] || quotes.close[i],
            high: quotes.high[i] || quotes.close[i],
            low: quotes.low[i] || quotes.close[i],
            close: quotes.close[i],
            volume: quotes.volume[i] || 0
          });
        }
      }

      logger.info(`Fetched ${data.length} days of historical data for ${validSymbol}`);
      return data;
    } catch (error) {
      logger.error(`Failed to fetch historical data for ${symbol}:`, error.message);
      throw error;
    }
  }

  async updateStockQuotes(quotes) {
    const updateStmt = db.prepare(`
      INSERT INTO stock_quotes (symbol, price, change_amount, change_percent, volume, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        price = excluded.price, change_amount = excluded.change_amount,
        change_percent = excluded.change_percent, volume = excluded.volume,
        updated_at = excluded.updated_at
    `);

    const updateMany = db.transaction((quotes) => {
      for (const quote of quotes) {
        updateStmt.run(quote.symbol, quote.price, quote.change, quote.changePercent, quote.volume || 0, quote.timestamp);
      }
    });

    try {
      updateMany(quotes);
      logger.info(`Updated ${quotes.length} stock quotes`);

      // Broadcast to WebSocket clients
      if (this.wsService) {
        for (const quote of quotes) {
          this.wsService.broadcastQuote(quote.symbol, {
            symbol: quote.symbol,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            volume: quote.volume,
            timestamp: quote.timestamp
          });
        }
        logger.info(`Broadcasted ${quotes.length} quotes via WebSocket`);
      }

      // Check price alerts
      if (this.alertsService) {
        for (const quote of quotes) {
          const triggeredAlerts = this.alertsService.checkAlerts(quote.symbol, quote.price);
          for (const alert of triggeredAlerts) {
            this.alertsService.broadcastAlert(alert);
          }
        }
      }

      return quotes.length;
    } catch (error) {
      logger.error('Error updating quotes:', error);
      throw error;
    }
  }

  getActiveSymbols() {
    const query = 'SELECT DISTINCT h.symbol FROM holdings h WHERE h.shares > 0';
    const rows = db.prepare(query).all();
    return rows.map(r => r.symbol);
  }

  async updateAllPrices() {
    const symbols = this.getActiveSymbols();
    if (symbols.length === 0) return 0;
    
    logger.info(`Updating prices for ${symbols.length} symbols`);
    const quotes = await this.fetchQuotes(symbols);
    if (quotes.length === 0) return 0;
    
    return await this.updateStockQuotes(quotes);
  }

  startPeriodicUpdates(intervalSeconds = 30) {
    logger.info(`Starting price updates every ${intervalSeconds}s`);
    this.updateAllPrices().catch(err => logger.error('Initial update error:', err));
    
    this.updateInterval = setInterval(() => {
      this.updateAllPrices().catch(err => logger.error('Update error:', err));
    }, intervalSeconds * 1000);
    
    return this.updateInterval;
  }

  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      logger.info('Stopped price updates');
    }
  }

  /**
   * Get API usage statistics
   */
  getApiStats() {
    return {
      finnhub: {
        calls: this.apiCallCount?.finnhub || 0,
        remaining: 60 - (this.apiCallCount?.finnhub || 0),
        limit: 60,
        resetTime: new Date(Date.now() + 60000).toISOString()
      },
      alphaVantage: {
        calls: this.apiCallCount?.alphaVantage || 0,
        remaining: 5 - (this.apiCallCount?.alphaVantage || 0),
        limit: 5,
        resetTime: new Date(Date.now() + 60000).toISOString()
      },
      yahoo: {
        calls: this.apiCallCount?.yahoo || 0,
        remaining: 100,
        limit: 100,
        resetTime: new Date(Date.now() + 60000).toISOString()
      },
      lastUpdate: new Date().toISOString()
    };
  }
}

module.exports = MarketDataService;
