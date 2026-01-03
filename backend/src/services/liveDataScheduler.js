const { prisma } = require('../db/simpleDb');
const UnifiedMarketDataService = require('./unifiedMarketData');
const logger = require('../utils/logger');

// Create singleton instance
const unifiedMarketData = new UnifiedMarketDataService();

/**
 * Live Data Scheduler - Fetches real-time data every 30 seconds
 * Also triggers daily history updates and ensures new symbols get historical data
 */
class LiveDataScheduler {
  constructor() {
    this.updateInterval = 30000; // 30 seconds for live updates
    this.historyCheckInterval = 3600000; // 1 hour for history check
    this.isRunning = false;
    this.intervalId = null;
    this.historyIntervalId = null;
    this.wsService = null;
    this.lastHistoryCheck = null;
  }

  setWebSocketService(wsService) {
    this.wsService = wsService;
    logger.info('WebSocket connected to live data scheduler');
  }

  /**
   * Start the live data scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn('Live data scheduler already running');
      return;
    }

    logger.info(`🔴 LIVE DATA SCHEDULER STARTED - Updates every ${this.updateInterval / 1000}s`);
    this.isRunning = true;

    // Initial fetch
    this.fetchLiveData();

    // Initial history population check
    this.checkAndPopulateHistory();

    // Schedule recurring quote updates
    this.intervalId = setInterval(() => {
      this.fetchLiveData();
    }, this.updateInterval);

    // Schedule periodic history checks (every hour)
    this.historyIntervalId = setInterval(() => {
      this.checkAndPopulateHistory();
    }, this.historyCheckInterval);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.historyIntervalId) {
      clearInterval(this.historyIntervalId);
      this.historyIntervalId = null;
    }
    this.isRunning = false;
    logger.info('Live data scheduler stopped');
  }

  /**
   * Check and populate historical data for all symbols
   * Ensures every symbol in holdings/watchlists has historical data
   */
  async checkAndPopulateHistory() {
    try {
      // Lazy load to avoid circular dependency
      const stockDataManager = require('./stockDataManager');

      logger.info('📊 Checking historical data for all symbols...');

      // Get all unique symbols
      const holdings = await prisma.holding.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      const watchlistItems = await prisma.watchlistItem.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      const symbols = [...new Set([
        ...holdings.map(h => h.symbol.toUpperCase()),
        ...watchlistItems.map(w => w.symbol.toUpperCase()),
        'SPY', 'QQQ', 'DIA', 'IWM', 'VTI'
      ])];

      // Check which symbols need historical data
      let populated = 0;
      for (const symbol of symbols) {
        const tracker = await prisma.stockDataTracker.findUnique({
          where: { symbol }
        });

        // If no tracker or no completed fetch, trigger data population
        if (!tracker || !tracker.initialFetchCompleted) {
          await stockDataManager.onTickerAdded(symbol);
          populated++;
        }
      }

      if (populated > 0) {
        logger.info(`📈 Triggered historical data fetch for ${populated} symbols`);
      } else {
        logger.info(`✅ All ${symbols.length} symbols have historical data`);
      }

      this.lastHistoryCheck = new Date();

    } catch (error) {
      logger.error('History population check failed:', error.message);
    }
  }

  /**
   * Fetch live data for all active symbols
   */
  async fetchLiveData() {
    try {
      logger.info('📊 Fetching live market data...');

      // Get all unique symbols from holdings and watchlists
      const holdings = await prisma.holding.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      const watchlistItems = await prisma.watchlistItem.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      const symbols = [...new Set([
        ...holdings.map(h => h.symbol),
        ...watchlistItems.map(w => w.symbol),
        // Add major indices
        'SPY', 'QQQ', 'DIA', 'IWM', 'VTI'
      ])];

      logger.info(`📈 Updating ${symbols.length} symbols from live APIs`);

      // Fetch quotes in batches to avoid rate limits
      const batchSize = 10;
      let totalUpdated = 0;

      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        const quotes = await Promise.all(
          batch.map(async symbol => {
            try {
              const quote = await unifiedMarketData.fetchQuote(symbol);
              if (quote) {
                // Update database
                await prisma.stockQuote.upsert({
                  where: { symbol },
                  create: {
                    symbol,
                    name: quote.name || symbol,
                    price: quote.price || 0,
                    previousClose: quote.previousClose,
                    open: quote.open,
                    high: quote.high,
                    low: quote.low,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume ? BigInt(Math.round(quote.volume)) : null,
                    marketCap: quote.marketCap ? BigInt(Math.round(quote.marketCap)) : null,
                    peRatio: quote.peRatio,
                    week52High: quote.week52High,
                    week52Low: quote.week52Low
                  },
                  update: {
                    name: quote.name || symbol,
                    price: quote.price || 0,
                    previousClose: quote.previousClose,
                    open: quote.open,
                    high: quote.high,
                    low: quote.low,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume ? BigInt(Math.round(quote.volume)) : null,
                    marketCap: quote.marketCap ? BigInt(Math.round(quote.marketCap)) : null,
                    peRatio: quote.peRatio,
                    week52High: quote.week52High,
                    week52Low: quote.week52Low
                  }
                });

                // Also update the tracker's lastQuoteUpdate
                await prisma.stockDataTracker.upsert({
                  where: { symbol },
                  create: { symbol, isActive: true, lastQuoteUpdate: new Date() },
                  update: { lastQuoteUpdate: new Date() }
                }).catch(() => {}); // Ignore errors

                totalUpdated++;
                return quote;
              }
            } catch (error) {
              logger.error(`Error fetching ${symbol}:`, error.message);
              return null;
            }
          })
        );

        // Broadcast updates via WebSocket
        if (this.wsService) {
          const validQuotes = quotes.filter(q => q !== null);
          if (validQuotes.length > 0) {
            this.wsService.broadcast('quotes_update', {
              quotes: validQuotes,
              timestamp: new Date().toISOString()
            });
          }
        }

        // Small delay between batches to respect rate limits
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`✅ Updated ${totalUpdated}/${symbols.length} quotes from live APIs`);

    } catch (error) {
      logger.error('Live data fetch error:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      updateInterval: this.updateInterval,
      historyCheckInterval: this.historyCheckInterval,
      nextUpdate: this.intervalId ? new Date(Date.now() + this.updateInterval).toISOString() : null,
      lastHistoryCheck: this.lastHistoryCheck ? this.lastHistoryCheck.toISOString() : null
    };
  }
}

module.exports = new LiveDataScheduler();
