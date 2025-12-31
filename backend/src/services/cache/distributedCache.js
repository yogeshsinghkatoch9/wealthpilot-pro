/**
 * Distributed Cache Service
 *
 * Production-grade caching layer using Redis with fallback to in-memory
 * Supports:
 * - Multi-level caching (L1: memory, L2: Redis)
 * - Cache invalidation patterns
 * - Cache warming
 * - Statistics and monitoring
 */

const redis = require('../redis/redisClient');
const logger = require('../../utils/logger');

// L1 (in-memory) cache for ultra-fast access
const l1Cache = new Map();
const L1_MAX_SIZE = 500;
const L1_DEFAULT_TTL = 30000; // 30 seconds

// Cache statistics
const stats = {
  hits: 0,
  misses: 0,
  l1Hits: 0,
  l2Hits: 0,
  writes: 0,
  invalidations: 0
};

// TTL configurations by cache type
const TTL_CONFIG = {
  // User data
  user: 300, // 5 minutes
  userDashboard: 60, // 1 minute
  userSettings: 600, // 10 minutes

  // Portfolio data
  portfolio: 60, // 1 minute (includes live prices)
  portfolioFull: 120, // 2 minutes
  holdings: 30, // 30 seconds (volatile)

  // Market data
  quote: 15, // 15 seconds (real-time)
  quotes: 30, // 30 seconds
  historicalData: 3600, // 1 hour
  fundamentals: 86400, // 24 hours

  // ESG data
  esg: 86400, // 24 hours (doesn't change often)
  esgPortfolio: 3600, // 1 hour

  // Analytics
  analytics: 300, // 5 minutes
  reports: 600, // 10 minutes

  // Default
  default: 300 // 5 minutes
};

/**
 * Generate cache key
 */
function generateKey(prefix, ...parts) {
  return `cache:${prefix}:${parts.join(':')}`;
}

/**
 * Get TTL for cache type
 */
function getTTL(type) {
  return TTL_CONFIG[type] || TTL_CONFIG.default;
}

/**
 * L1 cache operations
 */
function l1Get(key) {
  const entry = l1Cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    l1Cache.delete(key);
    return null;
  }

  return entry.value;
}

function l1Set(key, value, ttlMs = L1_DEFAULT_TTL) {
  // Evict oldest entries if at capacity
  if (l1Cache.size >= L1_MAX_SIZE) {
    const firstKey = l1Cache.keys().next().value;
    l1Cache.delete(firstKey);
  }

  l1Cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function l1Delete(key) {
  l1Cache.delete(key);
}

function l1Clear() {
  l1Cache.clear();
}

/**
 * Multi-level cache get
 */
async function get(key, options = {}) {
  const { skipL1 = false, skipL2 = false } = options;

  // Try L1 cache first
  if (!skipL1) {
    const l1Value = l1Get(key);
    if (l1Value !== null) {
      stats.hits++;
      stats.l1Hits++;
      return l1Value;
    }
  }

  // Try L2 (Redis) cache
  if (!skipL2 && redis.isAvailable()) {
    const l2Value = await redis.get(key);
    if (l2Value !== null) {
      stats.hits++;
      stats.l2Hits++;

      // Populate L1 cache
      l1Set(key, l2Value);

      return l2Value;
    }
  }

  stats.misses++;
  return null;
}

/**
 * Multi-level cache set
 */
async function set(key, value, ttlSeconds = TTL_CONFIG.default) {
  stats.writes++;

  // Set in L1 cache (shorter TTL)
  l1Set(key, value, Math.min(ttlSeconds * 1000, L1_DEFAULT_TTL));

  // Set in L2 (Redis) cache
  if (redis.isAvailable()) {
    await redis.set(key, value, ttlSeconds);
  }

  return true;
}

/**
 * Delete from all cache levels
 */
async function del(key) {
  stats.invalidations++;
  l1Delete(key);

  if (redis.isAvailable()) {
    await redis.del(key);
  }

  return true;
}

/**
 * Delete by pattern (L2 only, clears all L1)
 */
async function delByPattern(pattern) {
  stats.invalidations++;

  // Clear L1 cache entirely (pattern matching not efficient)
  l1Clear();

  // Delete from Redis by pattern
  if (redis.isAvailable()) {
    return await redis.delByPattern(pattern);
  }

  return 0;
}

/**
 * Cache wrapper for functions
 */
async function cached(key, fetchFn, options = {}) {
  const { ttl, type, forceRefresh = false } = options;
  const ttlSeconds = ttl || getTTL(type);

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cachedValue = await get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }
  }

  // Fetch fresh data
  const value = await fetchFn();

  // Store in cache
  if (value !== null && value !== undefined) {
    await set(key, value, ttlSeconds);
  }

  return value;
}

/**
 * Memoize function with caching
 */
function memoize(fn, keyGenerator, options = {}) {
  return async (...args) => {
    const key = keyGenerator(...args);
    return cached(key, () => fn(...args), options);
  };
}

/**
 * Cache invalidation by tags
 */
const taggedKeys = new Map(); // tag -> Set of keys

async function setWithTags(key, value, ttlSeconds, tags = []) {
  await set(key, value, ttlSeconds);

  // Track key by tags
  for (const tag of tags) {
    if (!taggedKeys.has(tag)) {
      taggedKeys.set(tag, new Set());
    }
    taggedKeys.get(tag).add(key);
  }

  return true;
}

async function invalidateByTag(tag) {
  const keys = taggedKeys.get(tag);
  if (!keys) return 0;

  let count = 0;
  for (const key of keys) {
    await del(key);
    count++;
  }

  taggedKeys.delete(tag);
  return count;
}

/**
 * Cache warming
 */
async function warm(warmers) {
  const results = [];

  for (const warmer of warmers) {
    try {
      const { key, fetchFn, ttl, type } = warmer;
      const value = await fetchFn();
      await set(key, value, ttl || getTTL(type));
      results.push({ key, success: true });
    } catch (err) {
      results.push({ key: warmer.key, success: false, error: err.message });
    }
  }

  return results;
}

/**
 * Get cache statistics
 */
function getStats() {
  const hitRate = stats.hits + stats.misses > 0
    ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)
    : 0;

  return {
    ...stats,
    hitRate: `${hitRate}%`,
    l1Size: l1Cache.size,
    l1MaxSize: L1_MAX_SIZE,
    redisAvailable: redis.isAvailable()
  };
}

/**
 * Reset statistics
 */
function resetStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.l1Hits = 0;
  stats.l2Hits = 0;
  stats.writes = 0;
  stats.invalidations = 0;
  return stats;
}

/**
 * Clear all caches
 */
async function clearAll() {
  l1Clear();
  taggedKeys.clear();

  if (redis.isAvailable()) {
    await redis.delByPattern('cache:*');
  }

  return { cleared: true };
}

// ==================== PRE-BUILT CACHE FUNCTIONS ====================

/**
 * Portfolio cache operations
 */
const portfolioCache = {
  async get(portfolioId) {
    return get(generateKey('portfolio', portfolioId));
  },

  async set(portfolioId, data) {
    return set(generateKey('portfolio', portfolioId), data, getTTL('portfolio'));
  },

  async getFull(portfolioId) {
    return get(generateKey('portfolio', portfolioId, 'full'));
  },

  async setFull(portfolioId, data) {
    return setWithTags(
      generateKey('portfolio', portfolioId, 'full'),
      data,
      getTTL('portfolioFull'),
      [`portfolio:${portfolioId}`]
    );
  },

  async invalidate(portfolioId) {
    return invalidateByTag(`portfolio:${portfolioId}`);
  }
};

/**
 * User cache operations
 */
const userCache = {
  async getDashboard(userId) {
    return get(generateKey('user', userId, 'dashboard'));
  },

  async setDashboard(userId, data) {
    return setWithTags(
      generateKey('user', userId, 'dashboard'),
      data,
      getTTL('userDashboard'),
      [`user:${userId}`]
    );
  },

  async getSettings(userId) {
    return get(generateKey('user', userId, 'settings'));
  },

  async setSettings(userId, data) {
    return setWithTags(
      generateKey('user', userId, 'settings'),
      data,
      getTTL('userSettings'),
      [`user:${userId}`]
    );
  },

  async invalidate(userId) {
    return invalidateByTag(`user:${userId}`);
  }
};

/**
 * Market data cache operations
 */
const marketCache = {
  async getQuote(symbol) {
    return get(generateKey('market', 'quote', symbol.toUpperCase()));
  },

  async setQuote(symbol, data) {
    return set(generateKey('market', 'quote', symbol.toUpperCase()), data, getTTL('quote'));
  },

  async getQuotes(symbols) {
    const key = generateKey('market', 'quotes', symbols.sort().join(','));
    return get(key);
  },

  async setQuotes(symbols, data) {
    const key = generateKey('market', 'quotes', symbols.sort().join(','));
    return set(key, data, getTTL('quotes'));
  },

  async getHistorical(symbol, period) {
    return get(generateKey('market', 'history', symbol.toUpperCase(), period));
  },

  async setHistorical(symbol, period, data) {
    return set(generateKey('market', 'history', symbol.toUpperCase(), period), data, getTTL('historicalData'));
  }
};

/**
 * ESG cache operations
 */
const esgCache = {
  async getStock(symbol) {
    return get(generateKey('esg', 'stock', symbol.toUpperCase()));
  },

  async setStock(symbol, data) {
    return set(generateKey('esg', 'stock', symbol.toUpperCase()), data, getTTL('esg'));
  },

  async getPortfolio(portfolioId) {
    return get(generateKey('esg', 'portfolio', portfolioId));
  },

  async setPortfolio(portfolioId, data) {
    return setWithTags(
      generateKey('esg', 'portfolio', portfolioId),
      data,
      getTTL('esgPortfolio'),
      [`portfolio:${portfolioId}`]
    );
  }
};

module.exports = {
  // Core operations
  get,
  set,
  del,
  delByPattern,
  cached,
  memoize,

  // Tags
  setWithTags,
  invalidateByTag,

  // Warming
  warm,

  // Stats
  getStats,
  resetStats,

  // Clear
  clearAll,

  // Utilities
  generateKey,
  getTTL,
  TTL_CONFIG,

  // Pre-built caches
  portfolioCache,
  userCache,
  marketCache,
  esgCache
};
