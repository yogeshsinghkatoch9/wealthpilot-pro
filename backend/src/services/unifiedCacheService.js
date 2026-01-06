/**
 * Unified Cache Service
 * Automatically uses Redis when available, falls back to in-memory cache
 * Enables horizontal scaling with shared cache across instances
 */

const logger = require('../utils/logger');

class UnifiedCacheService {
  constructor() {
    this.redisCache = null;
    this.memoryCache = null;
    this.useRedis = false;

    this.initialize();
  }

  async initialize() {
    // Try to initialize Redis first
    if (process.env.REDIS_URL || process.env.REDIS_ENABLED === 'true') {
      try {
        this.redisCache = require('./redisCacheService');

        // Wait a moment for Redis to connect
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (this.redisCache.isAvailable()) {
          this.useRedis = true;
          logger.info('Unified Cache: Using Redis for distributed caching');
        } else {
          logger.warn('Unified Cache: Redis not available, using in-memory cache');
          this.memoryCache = require('./cacheService');
        }
      } catch (err) {
        logger.warn('Unified Cache: Redis failed to load, using in-memory cache:', err.message);
        this.memoryCache = require('./cacheService');
      }
    } else {
      // No Redis configured, use in-memory cache
      this.memoryCache = require('./cacheService');
      logger.info('Unified Cache: Using in-memory cache (set REDIS_URL for distributed caching)');
    }
  }

  /**
   * Get the active cache instance
   */
  getCache() {
    if (this.useRedis && this.redisCache?.isAvailable()) {
      return this.redisCache;
    }
    return this.memoryCache;
  }

  /**
   * Check if using distributed cache
   */
  isDistributed() {
    return this.useRedis && this.redisCache?.isAvailable();
  }

  // ==================== MARKET DATA ====================

  async getMarketQuote(symbol, fetchFn) {
    return this.getCache().getMarketQuote(symbol, fetchFn);
  }

  async getHistoricalData(symbol, period, fetchFn) {
    return this.getCache().getHistoricalData(symbol, period, fetchFn);
  }

  invalidateMarketData(symbol) {
    return this.getCache().invalidateMarketData(symbol);
  }

  // ==================== ANALYTICS ====================

  async getAnalytics(portfolioId, analysisType, period, fetchFn) {
    return this.getCache().getAnalytics(portfolioId, analysisType, period, fetchFn);
  }

  invalidatePortfolioAnalytics(portfolioId) {
    return this.getCache().invalidatePortfolioAnalytics(portfolioId);
  }

  // ==================== PORTFOLIO ====================

  getPortfolio(portfolioId) {
    return this.getCache().getPortfolio(portfolioId);
  }

  setPortfolio(portfolioId, data) {
    return this.getCache().setPortfolio(portfolioId, data);
  }

  getPortfolioHoldings(portfolioId) {
    return this.getCache().getPortfolioHoldings(portfolioId);
  }

  setPortfolioHoldings(portfolioId, holdings) {
    return this.getCache().setPortfolioHoldings(portfolioId, holdings);
  }

  invalidatePortfolio(portfolioId) {
    return this.getCache().invalidatePortfolio(portfolioId);
  }

  // ==================== USER ====================

  getUser(userId) {
    return this.getCache().getUser(userId);
  }

  setUser(userId, userData) {
    return this.getCache().setUser(userId, userData);
  }

  getUserPortfolios(userId) {
    return this.getCache().getUserPortfolios(userId);
  }

  setUserPortfolios(userId, portfolios) {
    return this.getCache().setUserPortfolios(userId, portfolios);
  }

  invalidateUser(userId) {
    return this.getCache().invalidateUser(userId);
  }

  // ==================== SESSION (Redis only) ====================

  async getSession(token) {
    if (this.useRedis && this.redisCache?.isAvailable()) {
      return this.redisCache.getSession(token);
    }
    // In-memory doesn't support session caching (not shared)
    return null;
  }

  async setSession(token, sessionData, ttl = null) {
    if (this.useRedis && this.redisCache?.isAvailable()) {
      return this.redisCache.setSession(token, sessionData, ttl);
    }
  }

  async deleteSession(token) {
    if (this.useRedis && this.redisCache?.isAvailable()) {
      return this.redisCache.deleteSession(token);
    }
  }

  // ==================== GENERIC ====================

  async get(cacheName, key, fetchFn, ttl = null) {
    return this.getCache().get(cacheName, key, fetchFn, ttl);
  }

  set(cacheName, key, value, ttl = null) {
    return this.getCache().set(cacheName, key, value, ttl);
  }

  del(cacheName, key) {
    return this.getCache().del(cacheName, key);
  }

  // ==================== MANAGEMENT ====================

  getStats() {
    const cache = this.getCache();
    const stats = cache.getStats();

    return {
      type: this.isDistributed() ? 'redis' : 'memory',
      distributed: this.isDistributed(),
      ...stats
    };
  }

  flushAll() {
    return this.getCache().flushAll();
  }

  flush(cacheName) {
    return this.getCache().flush(cacheName);
  }

  async close() {
    if (this.redisCache?.close) {
      await this.redisCache.close();
    }
  }
}

// Create singleton instance
const unifiedCacheService = new UnifiedCacheService();

module.exports = unifiedCacheService;
