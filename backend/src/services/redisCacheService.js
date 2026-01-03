/**
 * Redis Cache Service for Horizontal Scaling
 * Drop-in replacement for node-cache when Redis is available
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisCacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.prefix = 'wp:'; // WealthPilot prefix

    // TTL defaults (in seconds)
    this.ttls = {
      marketData: 10, // 10 seconds for real-time quotes
      analytics: 900, // 15 minutes
      portfolio: 120, // 2 minutes
      user: 600, // 10 minutes
      report: 1800, // 30 minutes
      session: 604800 // 7 days
    };

    this.connect();
  }

  /**
   * Connect to Redis
   */
  connect() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis cache connected');
      });

      this.redis.on('error', (err) => {
        logger.error('Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      // Attempt connection
      this.redis.connect().catch(err => {
        logger.warn('Redis not available, falling back to in-memory cache:', err.message);
        this.isConnected = false;
      });

    } catch (err) {
      logger.warn('Redis initialization failed:', err.message);
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable() {
    return this.isConnected && this.redis;
  }

  /**
   * Build cache key with prefix and namespace
   */
  buildKey(namespace, key) {
    return `${this.prefix}${namespace}:${key}`;
  }

  // ==================== MARKET DATA CACHING ====================

  async getMarketQuote(symbol, fetchFn) {
    const key = this.buildKey('quote', symbol);

    if (this.isAvailable()) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          logger.debug(`Redis HIT: Market quote for ${symbol}`);
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.error('Redis get error:', err.message);
      }
    }

    logger.debug(`Cache MISS: Market quote for ${symbol}`);
    const data = await fetchFn();

    if (data && this.isAvailable()) {
      try {
        await this.redis.setex(key, this.ttls.marketData, JSON.stringify(data));
      } catch (err) {
        logger.error('Redis set error:', err.message);
      }
    }

    return data;
  }

  async getHistoricalData(symbol, period, fetchFn) {
    const key = this.buildKey('historical', `${symbol}:${period}`);

    if (this.isAvailable()) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          logger.debug(`Redis HIT: Historical data for ${symbol} (${period})`);
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.error('Redis get error:', err.message);
      }
    }

    logger.debug(`Cache MISS: Historical data for ${symbol} (${period})`);
    const data = await fetchFn();

    if (data && this.isAvailable()) {
      try {
        await this.redis.setex(key, 3600, JSON.stringify(data)); // 1 hour TTL
      } catch (err) {
        logger.error('Redis set error:', err.message);
      }
    }

    return data;
  }

  async invalidateMarketData(symbol) {
    if (!this.isAvailable()) return;

    try {
      const pattern = `${this.prefix}*:*${symbol}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} Redis entries for ${symbol}`);
      }
    } catch (err) {
      logger.error('Redis invalidate error:', err.message);
    }
  }

  // ==================== ANALYTICS CACHING ====================

  async getAnalytics(portfolioId, analysisType, period, fetchFn) {
    const key = this.buildKey('analytics', `${portfolioId}:${analysisType}:${period || 'default'}`);

    if (this.isAvailable()) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          logger.debug(`Redis HIT: Analytics ${analysisType} for portfolio ${portfolioId}`);
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.error('Redis get error:', err.message);
      }
    }

    logger.debug(`Cache MISS: Analytics ${analysisType} for portfolio ${portfolioId}`);
    const data = await fetchFn();

    if (data && !data.error && this.isAvailable()) {
      try {
        await this.redis.setex(key, this.ttls.analytics, JSON.stringify(data));
      } catch (err) {
        logger.error('Redis set error:', err.message);
      }
    }

    return data;
  }

  async invalidatePortfolioAnalytics(portfolioId) {
    if (!this.isAvailable()) return;

    try {
      const pattern = `${this.prefix}analytics:${portfolioId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} analytics entries for portfolio ${portfolioId}`);
      }
    } catch (err) {
      logger.error('Redis invalidate error:', err.message);
    }
  }

  // ==================== PORTFOLIO CACHING ====================

  async getPortfolio(portfolioId) {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.redis.get(this.buildKey('portfolio', portfolioId));
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.error('Redis get error:', err.message);
      return null;
    }
  }

  async setPortfolio(portfolioId, data) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.setex(
        this.buildKey('portfolio', portfolioId),
        this.ttls.portfolio,
        JSON.stringify(data)
      );
    } catch (err) {
      logger.error('Redis set error:', err.message);
    }
  }

  async getPortfolioHoldings(portfolioId) {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.redis.get(this.buildKey('holdings', portfolioId));
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.error('Redis get error:', err.message);
      return null;
    }
  }

  async setPortfolioHoldings(portfolioId, holdings) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.setex(
        this.buildKey('holdings', portfolioId),
        this.ttls.portfolio,
        JSON.stringify(holdings)
      );
    } catch (err) {
      logger.error('Redis set error:', err.message);
    }
  }

  async invalidatePortfolio(portfolioId) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.del(
        this.buildKey('portfolio', portfolioId),
        this.buildKey('holdings', portfolioId)
      );
      await this.invalidatePortfolioAnalytics(portfolioId);
      logger.info(`Invalidated cache for portfolio ${portfolioId}`);
    } catch (err) {
      logger.error('Redis invalidate error:', err.message);
    }
  }

  // ==================== SESSION CACHING ====================

  async getSession(token) {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.redis.get(this.buildKey('session', token));
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.error('Redis get error:', err.message);
      return null;
    }
  }

  async setSession(token, sessionData, ttlSeconds = null) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.setex(
        this.buildKey('session', token),
        ttlSeconds || this.ttls.session,
        JSON.stringify(sessionData)
      );
    } catch (err) {
      logger.error('Redis set error:', err.message);
    }
  }

  async deleteSession(token) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.del(this.buildKey('session', token));
    } catch (err) {
      logger.error('Redis delete error:', err.message);
    }
  }

  // ==================== GENERIC METHODS ====================

  async get(namespace, key, fetchFn = null, ttl = null) {
    const fullKey = this.buildKey(namespace, key);

    if (this.isAvailable()) {
      try {
        const cached = await this.redis.get(fullKey);
        if (cached) {
          logger.debug(`Redis HIT [${namespace}]: ${key}`);
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.error('Redis get error:', err.message);
      }
    }

    logger.debug(`Cache MISS [${namespace}]: ${key}`);

    if (fetchFn) {
      const data = await fetchFn();

      if (data !== undefined && data !== null && this.isAvailable()) {
        try {
          const expiry = ttl || this.ttls[namespace] || 300;
          await this.redis.setex(fullKey, expiry, JSON.stringify(data));
        } catch (err) {
          logger.error('Redis set error:', err.message);
        }
      }

      return data;
    }

    return undefined;
  }

  async set(namespace, key, value, ttl = null) {
    if (!this.isAvailable()) return;

    try {
      const fullKey = this.buildKey(namespace, key);
      const expiry = ttl || this.ttls[namespace] || 300;
      await this.redis.setex(fullKey, expiry, JSON.stringify(value));
    } catch (err) {
      logger.error('Redis set error:', err.message);
    }
  }

  async del(namespace, key) {
    if (!this.isAvailable()) return;

    try {
      await this.redis.del(this.buildKey(namespace, key));
    } catch (err) {
      logger.error('Redis del error:', err.message);
    }
  }

  // ==================== CACHE MANAGEMENT ====================

  async getStats() {
    if (!this.isAvailable()) {
      return { status: 'disconnected' };
    }

    try {
      const info = await this.redis.info('stats');
      const keyspace = await this.redis.info('keyspace');
      const memory = await this.redis.info('memory');

      return {
        status: 'connected',
        info: info.split('\n').slice(0, 10).join('\n'),
        keyspace,
        memory: memory.split('\n').find(l => l.startsWith('used_memory_human')) || 'unknown'
      };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }

  async flushAll() {
    if (!this.isAvailable()) return;

    try {
      // Only flush keys with our prefix
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      logger.info('All WealthPilot cache entries flushed from Redis');
    } catch (err) {
      logger.error('Redis flush error:', err.message);
    }
  }

  async flush(namespace) {
    if (!this.isAvailable()) return;

    try {
      const keys = await this.redis.keys(`${this.prefix}${namespace}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      logger.info(`Redis cache flushed: ${namespace}`);
    } catch (err) {
      logger.error('Redis flush error:', err.message);
    }
  }

  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      logger.info('Redis connection closed');
    }
  }
}

// Create singleton instance
const redisCacheService = new RedisCacheService();

module.exports = redisCacheService;
