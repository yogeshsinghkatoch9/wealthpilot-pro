const { prisma } = require('@prisma/client');
const unifiedMarketData = require('./unifiedMarketData');
const logger = require('../utils/logger');

/**
 * Live Data Scheduler - Fetches real-time data every 30 seconds
 */
class LiveDataScheduler {
  constructor() {
    this.updateInterval = 30000; // 30 seconds for live updates
    this.isRunning = false;
    this.intervalId = null;
    this.wsService = null;
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

    // Schedule recurring updates
    this.intervalId = setInterval(() => {
      this.fetchLiveData();
    }, this.updateInterval);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Live data scheduler stopped');
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
                    price: quote.price,
                    previousClose: quote.previousClose,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume || 0,
                    updatedAt: new Date().toISOString()
                  },
                  update: {
                    price: quote.price,
                    previousClose: quote.previousClose,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume || 0,
                    updatedAt: new Date().toISOString()
                  }
                });

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
      nextUpdate: this.intervalId ? new Date(Date.now() + this.updateInterval).toISOString() : null
    };
  }
}

module.exports = new LiveDataScheduler();
