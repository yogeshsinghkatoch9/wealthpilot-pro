/**
 * Stock Data Manager Service
 * Central orchestration for all stock data operations
 *
 * Features:
 * - Initial data fetch when ticker added (1 year history)
 * - Incremental updates (only fetch new data)
 * - Database-first approach (check DB before API)
 * - Multi-provider fallback
 * - Automatic retry with exponential backoff
 */

const { prisma } = require('../db/simpleDb');
const UnifiedMarketDataService = require('./unifiedMarketData');
const jobQueue = require('./jobQueue');
const logger = require('../utils/logger');

// Create singleton instance of UnifiedMarketDataService
const unifiedMarketData = new UnifiedMarketDataService();

class StockDataManager {
  constructor() {
    this.pendingFetches = new Set(); // Track in-flight fetches to avoid duplicates
    this.HISTORY_DAYS = 1825; // 5 years of history
    this.STALE_THRESHOLD_HOURS = 18; // Consider data stale after 18 hours
  }

  // ==================== PUBLIC API ====================

  /**
   * Called when a new ticker is added to portfolio or watchlist
   * Triggers initial data fetch if needed
   */
  async onTickerAdded(symbol) {
    const upperSymbol = symbol.toUpperCase().trim();
    logger.info(`[StockDataManager] Ticker added: ${upperSymbol}`);

    try {
      // Check if we already have data for this symbol
      const tracker = await prisma.stockDataTracker.findUnique({
        where: { symbol: upperSymbol }
      });

      if (tracker?.initialFetchCompleted) {
        logger.info(`[StockDataManager] ${upperSymbol} already has data, checking for updates`);
        await this.checkForUpdates(upperSymbol);
        return { status: 'exists', symbol: upperSymbol };
      }

      // Trigger initial fetch
      if (!this.pendingFetches.has(upperSymbol)) {
        this.pendingFetches.add(upperSymbol);

        // Create or update tracker to show fetch started
        await prisma.stockDataTracker.upsert({
          where: { symbol: upperSymbol },
          create: {
            symbol: upperSymbol,
            isActive: true,
            initialFetchStarted: new Date()
          },
          update: {
            isActive: true,
            initialFetchStarted: new Date()
          }
        });

        // Queue the initial fetch job
        await jobQueue.addJob('stock-initial-fetch', { symbol: upperSymbol }, { priority: 10 });

        return { status: 'queued', symbol: upperSymbol };
      }

      return { status: 'pending', symbol: upperSymbol };

    } catch (error) {
      logger.error(`[StockDataManager] Error on ticker added ${upperSymbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get historical data for a symbol
   * Database-first approach: check DB, fetch if missing
   */
  async getHistoricalData(symbol, days = 365) {
    const upperSymbol = symbol.toUpperCase().trim();

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Check tracker
      const tracker = await prisma.stockDataTracker.findUnique({
        where: { symbol: upperSymbol }
      });

      // If we have complete data, return from DB
      if (tracker?.historyStartDate && tracker?.historyEndDate) {
        const trackerStart = new Date(tracker.historyStartDate);
        const trackerEnd = new Date(tracker.historyEndDate);

        // Check if we have the requested range
        if (trackerStart <= startDate && this.isRecentEnough(trackerEnd)) {
          const history = await prisma.stockHistory.findMany({
            where: {
              symbol: upperSymbol,
              date: {
                gte: startDate,
                lte: endDate
              }
            },
            orderBy: { date: 'asc' }
          });

          if (history.length > 0) {
            logger.debug(`[StockDataManager] Returning ${history.length} records from DB for ${upperSymbol}`);
            return this.formatHistoryResponse(history);
          }
        }
      }

      // Need to fetch data
      logger.info(`[StockDataManager] Fetching historical data for ${upperSymbol}`);

      // Trigger async fetch if not already pending
      if (!this.pendingFetches.has(upperSymbol)) {
        this.onTickerAdded(upperSymbol);
      }

      // For immediate response, fetch from API directly (5 years of data)
      const apiData = await unifiedMarketData.fetchHistoricalData(upperSymbol, '5y');

      if (apiData && apiData.length > 0) {
        // Store in background (don't await)
        this.storeHistoricalData(upperSymbol, apiData).catch(err => {
          logger.error(`[StockDataManager] Background store failed:`, err.message);
        });

        return apiData;
      }

      return [];

    } catch (error) {
      logger.error(`[StockDataManager] Error getting history for ${upperSymbol}:`, error.message);

      // Fallback to API (5 years of data)
      try {
        return await unifiedMarketData.fetchHistoricalData(upperSymbol, '5y');
      } catch (apiError) {
        logger.error(`[StockDataManager] API fallback failed:`, apiError.message);
        return [];
      }
    }
  }

  /**
   * Get real-time quote for a symbol
   */
  async getQuote(symbol) {
    const upperSymbol = symbol.toUpperCase().trim();

    try {
      // Try to get from StockQuote table first (updated by LiveDataScheduler)
      const cachedQuote = await prisma.stockQuote.findUnique({
        where: { symbol: upperSymbol }
      });

      // If cached quote is fresh (< 60 seconds old), return it
      if (cachedQuote && this.isQuoteFresh(cachedQuote.updatedAt)) {
        return this.formatQuoteResponse(cachedQuote);
      }

      // Fetch fresh quote
      const quote = await unifiedMarketData.fetchQuote(upperSymbol);

      if (quote) {
        // Update cache in background
        this.updateQuoteCache(upperSymbol, quote).catch(err => {
          logger.error(`[StockDataManager] Quote cache update failed:`, err.message);
        });

        return quote;
      }

      // Return cached if API failed
      if (cachedQuote) {
        return this.formatQuoteResponse(cachedQuote);
      }

      return null;

    } catch (error) {
      logger.error(`[StockDataManager] Error getting quote for ${upperSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get quotes for multiple symbols
   */
  async getQuotes(symbols) {
    const quotes = {};

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async symbol => {
          const quote = await this.getQuote(symbol);
          return { symbol: symbol.toUpperCase(), quote };
        })
      );

      batchResults.forEach(({ symbol, quote }) => {
        if (quote) quotes[symbol] = quote;
      });

      // Small delay between batches
      if (i + batchSize < symbols.length) {
        await this.delay(100);
      }
    }

    return quotes;
  }

  /**
   * Check for and fetch updates for a symbol
   */
  async checkForUpdates(symbol) {
    const upperSymbol = symbol.toUpperCase().trim();

    try {
      const tracker = await prisma.stockDataTracker.findUnique({
        where: { symbol: upperSymbol }
      });

      if (!tracker) {
        return this.onTickerAdded(upperSymbol);
      }

      // Check if history needs update
      if (tracker.historyEndDate && !this.isRecentEnough(tracker.historyEndDate)) {
        await jobQueue.addJob('stock-incremental-update', { symbol: upperSymbol }, { priority: 5 });
      }

      return { status: 'checked', symbol: upperSymbol };

    } catch (error) {
      logger.error(`[StockDataManager] Error checking updates for ${upperSymbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all tracked symbols
   */
  async getTrackedSymbols() {
    try {
      const trackers = await prisma.stockDataTracker.findMany({
        where: { isActive: true },
        select: { symbol: true, historyEndDate: true, lastQuoteUpdate: true }
      });
      return trackers;
    } catch (error) {
      logger.error(`[StockDataManager] Error getting tracked symbols:`, error.message);
      return [];
    }
  }

  /**
   * Trigger daily update for all tracked symbols
   */
  async runDailyUpdate() {
    logger.info('[StockDataManager] Starting daily update for all tracked symbols');

    try {
      const trackers = await prisma.stockDataTracker.findMany({
        where: {
          isActive: true,
          initialFetchCompleted: { not: null }
        }
      });

      let queued = 0;
      for (const tracker of trackers) {
        if (!this.isRecentEnough(tracker.historyEndDate)) {
          await jobQueue.addJob('stock-incremental-update', { symbol: tracker.symbol }, { priority: 3 });
          queued++;
        }
      }

      logger.info(`[StockDataManager] Queued ${queued} symbols for incremental update`);
      return { queued, total: trackers.length };

    } catch (error) {
      logger.error('[StockDataManager] Daily update failed:', error.message);
      throw error;
    }
  }

  /**
   * Populate data for all existing holdings and watchlist items
   */
  async populateExistingSymbols() {
    logger.info('[StockDataManager] Populating data for existing symbols');

    try {
      // Get all unique symbols from holdings
      const holdings = await prisma.holdings.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      // Get all unique symbols from watchlists
      const watchlistItems = await prisma.watchlistItem.findMany({
        select: { symbol: true },
        distinct: ['symbol']
      });

      // Combine and deduplicate
      const allSymbols = [...new Set([
        ...holdings.map(h => h.symbol.toUpperCase()),
        ...watchlistItems.map(w => w.symbol.toUpperCase()),
        // Add major indices/benchmarks
        'SPY', 'QQQ', 'DIA', 'IWM', 'VTI'
      ])];

      logger.info(`[StockDataManager] Found ${allSymbols.length} unique symbols to populate`);

      let queued = 0;
      for (const symbol of allSymbols) {
        const result = await this.onTickerAdded(symbol);
        if (result.status === 'queued') queued++;
      }

      logger.info(`[StockDataManager] Queued ${queued} symbols for initial fetch`);
      return { queued, total: allSymbols.length };

    } catch (error) {
      logger.error('[StockDataManager] Population failed:', error.message);
      throw error;
    }
  }

  // ==================== INTERNAL METHODS ====================

  /**
   * Store historical data in database
   */
  async storeHistoricalData(symbol, data) {
    if (!data || data.length === 0) return;

    const upperSymbol = symbol.toUpperCase().trim();

    try {
      // Prepare records for insert
      const records = data.map(d => ({
        symbol: upperSymbol,
        date: new Date(d.date),
        open: parseFloat(d.open) || 0,
        high: parseFloat(d.high) || 0,
        low: parseFloat(d.low) || 0,
        close: parseFloat(d.close) || 0,
        adjClose: parseFloat(d.adjClose || d.close) || 0,
        volume: BigInt(Math.round(d.volume || 0)),
        changePercent: d.changePercent || null
      }));

      // Batch insert with skipDuplicates
      const result = await prisma.stockHistory.createMany({
        data: records,
        skipDuplicates: true
      });

      // Update tracker
      const dates = records.map(r => r.date).sort((a, b) => a - b);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      // Get total record count
      const count = await prisma.stockHistory.count({
        where: { symbol: upperSymbol }
      });

      await prisma.stockDataTracker.upsert({
        where: { symbol: upperSymbol },
        create: {
          symbol: upperSymbol,
          isActive: true,
          historyStartDate: startDate,
          historyEndDate: endDate,
          historyRecordCount: count,
          lastHistoryUpdate: new Date(),
          initialFetchCompleted: new Date(),
          primaryDataSource: 'yahoo'
        },
        update: {
          historyStartDate: startDate,
          historyEndDate: endDate,
          historyRecordCount: count,
          lastHistoryUpdate: new Date(),
          initialFetchCompleted: new Date(),
          errorCount: 0,
          lastError: null
        }
      });

      // Remove from pending
      this.pendingFetches.delete(upperSymbol);

      logger.info(`[StockDataManager] Stored ${result.count} records for ${upperSymbol} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);

      return result;

    } catch (error) {
      logger.error(`[StockDataManager] Error storing history for ${upperSymbol}:`, error.message);

      // Update tracker with error
      await prisma.stockDataTracker.upsert({
        where: { symbol: upperSymbol },
        create: {
          symbol: upperSymbol,
          isActive: true,
          errorCount: 1,
          lastError: error.message,
          lastErrorAt: new Date()
        },
        update: {
          errorCount: { increment: 1 },
          lastError: error.message,
          lastErrorAt: new Date()
        }
      });

      this.pendingFetches.delete(upperSymbol);
      throw error;
    }
  }

  /**
   * Update quote cache in database
   */
  async updateQuoteCache(symbol, quote) {
    const upperSymbol = symbol.toUpperCase().trim();

    try {
      await prisma.stockQuote.upsert({
        where: { symbol: upperSymbol },
        create: {
          symbol: upperSymbol,
          name: quote.name || upperSymbol,
          price: quote.price || 0,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume ? BigInt(quote.volume) : null,
          change: quote.change,
          changePercent: quote.changePercent,
          marketCap: quote.marketCap ? BigInt(quote.marketCap) : null,
          peRatio: quote.peRatio,
          week52High: quote.week52High,
          week52Low: quote.week52Low
        },
        update: {
          price: quote.price || 0,
          previousClose: quote.previousClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume ? BigInt(quote.volume) : null,
          change: quote.change,
          changePercent: quote.changePercent,
          marketCap: quote.marketCap ? BigInt(quote.marketCap) : null,
          peRatio: quote.peRatio,
          week52High: quote.week52High,
          week52Low: quote.week52Low
        }
      });

      // Also update tracker
      await prisma.stockDataTracker.upsert({
        where: { symbol: upperSymbol },
        create: {
          symbol: upperSymbol,
          isActive: true,
          lastQuoteUpdate: new Date()
        },
        update: {
          lastQuoteUpdate: new Date()
        }
      });

    } catch (error) {
      logger.error(`[StockDataManager] Error updating quote cache for ${upperSymbol}:`, error.message);
    }
  }

  // ==================== HELPER METHODS ====================

  formatHistoryResponse(history) {
    return history.map(h => ({
      date: h.date.toISOString().split('T')[0],
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
      adjClose: h.adjClose,
      volume: Number(h.volume),
      changePercent: h.changePercent
    }));
  }

  formatQuoteResponse(quote) {
    return {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      previousClose: quote.previousClose,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      volume: quote.volume ? Number(quote.volume) : null,
      change: quote.change,
      changePercent: quote.changePercent,
      marketCap: quote.marketCap ? Number(quote.marketCap) : null,
      peRatio: quote.peRatio,
      week52High: quote.week52High,
      week52Low: quote.week52Low
    };
  }

  isRecentEnough(date) {
    if (!date) return false;
    const now = new Date();
    const targetDate = new Date(date);
    const hoursDiff = (now - targetDate) / (1000 * 60 * 60);
    return hoursDiff < this.STALE_THRESHOLD_HOURS;
  }

  isQuoteFresh(updatedAt) {
    if (!updatedAt) return false;
    const now = new Date();
    const updated = new Date(updatedAt);
    const secondsDiff = (now - updated) / 1000;
    return secondsDiff < 60; // Fresh if less than 60 seconds old
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== STATUS & STATS ====================

  async getStatus() {
    try {
      const [totalTracked, withData, pendingCount, errorCount] = await Promise.all([
        prisma.stockDataTracker.count(),
        prisma.stockDataTracker.count({ where: { initialFetchCompleted: { not: null } } }),
        prisma.stockDataTracker.count({ where: { initialFetchStarted: { not: null }, initialFetchCompleted: null } }),
        prisma.stockDataTracker.count({ where: { errorCount: { gt: 0 } } })
      ]);

      const totalHistoryRecords = await prisma.stockHistory.count();

      return {
        totalTracked,
        withData,
        pending: pendingCount,
        errors: errorCount,
        totalHistoryRecords,
        pendingFetches: this.pendingFetches.size
      };
    } catch (error) {
      logger.error('[StockDataManager] Error getting status:', error.message);
      return { error: error.message };
    }
  }
}

// Export singleton instance
const stockDataManager = new StockDataManager();
module.exports = stockDataManager;
