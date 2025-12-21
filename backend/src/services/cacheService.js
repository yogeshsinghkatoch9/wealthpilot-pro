const NodeCache = require('node-cache');
const logger = require('../utils/logger');

/**
 * Cache Service for performance optimization
 * Uses in-memory caching with TTL (Time To Live)
 */
class CacheService {
  constructor() {
    // Initialize multiple cache instances for different data types

    // Market data cache - 10 seconds TTL for LIVE DATA
    this.marketDataCache = new NodeCache({
      stdTTL: 10, // 10 seconds for real-time quotes
      checkperiod: 5, // Check for expired keys every 5 seconds
      useClones: false // Don't clone objects (better performance)
    });

    // Analytics cache - 15 minutes TTL
    this.analyticsCache = new NodeCache({
      stdTTL: 900, // 15 minutes
      checkperiod: 120,
      useClones: false
    });

    // Portfolio data cache - 2 minutes TTL
    this.portfolioCache = new NodeCache({
      stdTTL: 120, // 2 minutes
      checkperiod: 30,
      useClones: false
    });

    // User data cache - 10 minutes TTL
    this.userCache = new NodeCache({
      stdTTL: 600, // 10 minutes
      checkperiod: 60,
      useClones: false
    });

    // Report cache - 30 minutes TTL
    this.reportCache = new NodeCache({
      stdTTL: 1800, // 30 minutes
      checkperiod: 300,
      useClones: false
    });

    this.setupEventListeners();
    logger.info('Cache service initialized');
  }

  /**
   * Setup event listeners for cache statistics
   */
  setupEventListeners() {
    const caches = {
      marketData: this.marketDataCache,
      analytics: this.analyticsCache,
      portfolio: this.portfolioCache,
      user: this.userCache,
      report: this.reportCache
    };

    Object.entries(caches).forEach(([name, cache]) => {
      cache.on('set', (key) => {
        logger.debug(`Cache SET [${name}]: ${key}`);
      });

      cache.on('del', (key) => {
        logger.debug(`Cache DEL [${name}]: ${key}`);
      });

      cache.on('expired', (key) => {
        logger.debug(`Cache EXPIRED [${name}]: ${key}`);
      });
    });
  }

  // ==================== MARKET DATA CACHING ====================

  /**
   * Get market quote from cache or fetch function
   */
  async getMarketQuote(symbol, fetchFn) {
    const key = `quote:${symbol}`;

    // Check cache first
    const cached = this.marketDataCache.get(key);
    if (cached) {
      logger.debug(`Cache HIT: Market quote for ${symbol}`);
      return cached;
    }

    // Cache miss - fetch data
    logger.debug(`Cache MISS: Market quote for ${symbol}`);
    const data = await fetchFn();

    if (data) {
      this.marketDataCache.set(key, data);
    }

    return data;
  }

  /**
   * Get historical data from cache
   */
  async getHistoricalData(symbol, period, fetchFn) {
    const key = `historical:${symbol}:${period}`;

    const cached = this.marketDataCache.get(key);
    if (cached) {
      logger.debug(`Cache HIT: Historical data for ${symbol} (${period})`);
      return cached;
    }

    logger.debug(`Cache MISS: Historical data for ${symbol} (${period})`);
    const data = await fetchFn();

    if (data) {
      // Historical data can be cached longer (1 hour for old data)
      this.marketDataCache.set(key, data, 3600);
    }

    return data;
  }

  /**
   * Invalidate market data for a symbol
   */
  invalidateMarketData(symbol) {
    const keys = this.marketDataCache.keys();
    const symbolKeys = keys.filter(k => k.includes(symbol));

    symbolKeys.forEach(key => {
      this.marketDataCache.del(key);
    });

    logger.info(`Invalidated ${symbolKeys.length} cache entries for ${symbol}`);
  }

  // ==================== ANALYTICS CACHING ====================

  /**
   * Get analytics result from cache
   */
  async getAnalytics(portfolioId, analysisType, period, fetchFn) {
    const key = `analytics:${portfolioId}:${analysisType}:${period || 'default'}`;

    const cached = this.analyticsCache.get(key);
    if (cached) {
      logger.debug(`Cache HIT: Analytics ${analysisType} for portfolio ${portfolioId}`);
      return cached;
    }

    logger.debug(`Cache MISS: Analytics ${analysisType} for portfolio ${portfolioId}`);
    const data = await fetchFn();

    if (data && !data.error) {
      this.analyticsCache.set(key, data);
    }

    return data;
  }

  /**
   * Invalidate analytics cache for a portfolio
   */
  invalidatePortfolioAnalytics(portfolioId) {
    const keys = this.analyticsCache.keys();
    const portfolioKeys = keys.filter(k => k.includes(`analytics:${portfolioId}`));

    portfolioKeys.forEach(key => {
      this.analyticsCache.del(key);
    });

    logger.info(`Invalidated ${portfolioKeys.length} analytics cache entries for portfolio ${portfolioId}`);
  }

  // ==================== PORTFOLIO CACHING ====================

  /**
   * Get portfolio data from cache
   */
  getPortfolio(portfolioId) {
    const key = `portfolio:${portfolioId}`;
    return this.portfolioCache.get(key);
  }

  /**
   * Set portfolio data in cache
   */
  setPortfolio(portfolioId, data) {
    const key = `portfolio:${portfolioId}`;
    this.portfolioCache.set(key, data);
  }

  /**
   * Get portfolio holdings from cache
   */
  getPortfolioHoldings(portfolioId) {
    const key = `holdings:${portfolioId}`;
    return this.portfolioCache.get(key);
  }

  /**
   * Set portfolio holdings in cache
   */
  setPortfolioHoldings(portfolioId, holdings) {
    const key = `holdings:${portfolioId}`;
    this.portfolioCache.set(key, holdings);
  }

  /**
   * Invalidate portfolio cache
   */
  invalidatePortfolio(portfolioId) {
    this.portfolioCache.del(`portfolio:${portfolioId}`);
    this.portfolioCache.del(`holdings:${portfolioId}`);

    // Also invalidate analytics since portfolio changed
    this.invalidatePortfolioAnalytics(portfolioId);

    logger.info(`Invalidated cache for portfolio ${portfolioId}`);
  }

  // ==================== USER CACHING ====================

  /**
   * Get user data from cache
   */
  getUser(userId) {
    const key = `user:${userId}`;
    return this.userCache.get(key);
  }

  /**
   * Set user data in cache
   */
  setUser(userId, userData) {
    const key = `user:${userId}`;
    this.userCache.set(key, userData);
  }

  /**
   * Get user portfolios from cache
   */
  getUserPortfolios(userId) {
    const key = `user_portfolios:${userId}`;
    return this.userCache.get(key);
  }

  /**
   * Set user portfolios in cache
   */
  setUserPortfolios(userId, portfolios) {
    const key = `user_portfolios:${userId}`;
    this.userCache.set(key, portfolios);
  }

  /**
   * Invalidate user cache
   */
  invalidateUser(userId) {
    this.userCache.del(`user:${userId}`);
    this.userCache.del(`user_portfolios:${userId}`);
    logger.info(`Invalidated cache for user ${userId}`);
  }

  // ==================== REPORT CACHING ====================

  /**
   * Get report from cache
   */
  getReport(reportId) {
    const key = `report:${reportId}`;
    return this.reportCache.get(key);
  }

  /**
   * Set report in cache
   */
  setReport(reportId, reportData) {
    const key = `report:${reportId}`;
    this.reportCache.set(key, reportData);
  }

  /**
   * Invalidate report cache
   */
  invalidateReport(reportId) {
    this.reportCache.del(`report:${reportId}`);
    logger.info(`Invalidated cache for report ${reportId}`);
  }

  // ==================== GENERAL CACHING ====================

  /**
   * Generic cache get with auto-fetch
   */
  async get(cacheName, key, fetchFn, ttl = null) {
    const cache = this.getCache(cacheName);

    const cached = cache.get(key);
    if (cached !== undefined) {
      logger.debug(`Cache HIT [${cacheName}]: ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS [${cacheName}]: ${key}`);

    if (fetchFn) {
      const data = await fetchFn();

      if (data !== undefined && data !== null) {
        if (ttl) {
          cache.set(key, data, ttl);
        } else {
          cache.set(key, data);
        }
      }

      return data;
    }

    return undefined;
  }

  /**
   * Generic cache set
   */
  set(cacheName, key, value, ttl = null) {
    const cache = this.getCache(cacheName);

    if (ttl) {
      cache.set(key, value, ttl);
    } else {
      cache.set(key, value);
    }
  }

  /**
   * Generic cache delete
   */
  del(cacheName, key) {
    const cache = this.getCache(cacheName);
    cache.del(key);
  }

  /**
   * Get cache instance by name
   */
  getCache(cacheName) {
    switch (cacheName) {
      case 'marketData':
        return this.marketDataCache;
      case 'analytics':
        return this.analyticsCache;
      case 'portfolio':
        return this.portfolioCache;
      case 'user':
        return this.userCache;
      case 'report':
        return this.reportCache;
      default:
        throw new Error(`Unknown cache: ${cacheName}`);
    }
  }

  // ==================== CACHE MANAGEMENT ====================

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      marketData: this.marketDataCache.getStats(),
      analytics: this.analyticsCache.getStats(),
      portfolio: this.portfolioCache.getStats(),
      user: this.userCache.getStats(),
      report: this.reportCache.getStats()
    };
  }

  /**
   * Flush all caches
   */
  flushAll() {
    this.marketDataCache.flushAll();
    this.analyticsCache.flushAll();
    this.portfolioCache.flushAll();
    this.userCache.flushAll();
    this.reportCache.flushAll();

    logger.info('All caches flushed');
  }

  /**
   * Flush specific cache
   */
  flush(cacheName) {
    const cache = this.getCache(cacheName);
    cache.flushAll();
    logger.info(`Cache flushed: ${cacheName}`);
  }

  /**
   * Get cache keys
   */
  getKeys(cacheName) {
    const cache = this.getCache(cacheName);
    return cache.keys();
  }

  /**
   * Get cache size
   */
  getSize(cacheName) {
    const cache = this.getCache(cacheName);
    return cache.keys().length;
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
