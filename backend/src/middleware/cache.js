/**
 * API Response Caching Middleware
 * Implements in-memory caching with configurable TTL for different endpoints
 */

const logger = require('../utils/logger');

class CacheStore {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
    this.stats.sets++;
  }

  delete(key) {
    if (this.cache.delete(key)) {
      this.stats.deletes++;
      return true;
    }
    return false;
  }

  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    let count = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.deletes += count;
    return count;
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
    return size;
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`
    };
  }
}

// Singleton cache store
const cacheStore = new CacheStore();

// Default TTL values in milliseconds
const TTL = {
  MARKET_DATA: 60 * 1000,        // 1 minute for market data
  SECTOR_DATA: 5 * 60 * 1000,    // 5 minutes for sector analysis
  STATIC_DATA: 60 * 60 * 1000,   // 1 hour for static data
  USER_DATA: 5 * 60 * 1000,      // 5 minutes for user-specific data
  INSIGHTS: 15 * 60 * 1000,      // 15 minutes for AI insights
  EARNINGS: 30 * 60 * 1000,      // 30 minutes for earnings calendar
  NEWS: 5 * 60 * 1000            // 5 minutes for news
};

/**
 * Generate cache key from request
 */
function generateCacheKey(req, options = {}) {
  const parts = [req.method, req.originalUrl];

  // Include user ID for user-specific caching
  if (options.perUser && req.user?.id) {
    parts.push(`user:${req.user.id}`);
  }

  // Include specific query params if specified
  if (options.queryParams && req.query) {
    const params = options.queryParams
      .filter(p => req.query[p])
      .map(p => `${p}:${req.query[p]}`);
    parts.push(...params);
  }

  return parts.join('|');
}

/**
 * Create caching middleware with options
 * @param {Object} options - Cache configuration
 * @param {number} options.ttl - Time to live in milliseconds
 * @param {boolean} options.perUser - Cache per user (default: false)
 * @param {string[]} options.queryParams - Query params to include in cache key
 * @param {Function} options.condition - Function to determine if request should be cached
 */
function cache(options = {}) {
  const {
    ttl = TTL.MARKET_DATA,
    perUser = false,
    queryParams = [],
    condition = () => true
  } = options;

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (!condition(req)) {
      return next();
    }

    const key = generateCacheKey(req, { perUser, queryParams });
    const cached = cacheStore.get(key);

    if (cached) {
      // Set cache headers
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', key.substring(0, 50));
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheStore.set(key, data, ttl);
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-TTL', Math.floor(ttl / 1000));
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for a specific pattern
 */
function invalidateCache(pattern) {
  return cacheStore.invalidatePattern(pattern);
}

/**
 * Clear user-specific cache
 */
function invalidateUserCache(userId) {
  return cacheStore.invalidatePattern(`user:${userId}`);
}

/**
 * Pre-configured cache middleware for common use cases
 */
const cacheMiddleware = {
  // Market data - short TTL, shared across users
  marketData: cache({ ttl: TTL.MARKET_DATA }),

  // Sector analysis - medium TTL
  sectorData: cache({ ttl: TTL.SECTOR_DATA }),

  // Static reference data - long TTL
  staticData: cache({ ttl: TTL.STATIC_DATA }),

  // User portfolios - medium TTL, per user
  userPortfolios: cache({
    ttl: TTL.USER_DATA,
    perUser: true
  }),

  // AI insights - longer TTL, per user
  insights: cache({
    ttl: TTL.INSIGHTS,
    perUser: true
  }),

  // Earnings calendar
  earnings: cache({ ttl: TTL.EARNINGS }),

  // News feed
  news: cache({ ttl: TTL.NEWS }),

  // Custom cache with options
  custom: cache
};

/**
 * Cache stats endpoint handler
 */
function cacheStatsHandler(req, res) {
  res.json({
    success: true,
    cache: cacheStore.getStats()
  });
}

/**
 * Cache clear endpoint handler (admin only)
 */
function cacheClearHandler(req, res) {
  const cleared = cacheStore.clear();
  logger.info(`Cache cleared: ${cleared} entries removed`);
  res.json({
    success: true,
    message: `Cache cleared: ${cleared} entries removed`
  });
}

module.exports = {
  cache,
  cacheMiddleware,
  cacheStore,
  invalidateCache,
  invalidateUserCache,
  cacheStatsHandler,
  cacheClearHandler,
  TTL
};
