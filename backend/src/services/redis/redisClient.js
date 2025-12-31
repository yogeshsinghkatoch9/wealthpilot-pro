/**
 * Redis Client Service
 *
 * Production-grade Redis integration for:
 * - Distributed caching
 * - Rate limiting state
 * - Session storage
 * - Pub/Sub messaging
 * - Job queues
 *
 * Supports both standalone Redis and Redis Cluster
 */

const Redis = require('ioredis');
const logger = require('../../utils/logger');

// Configuration
const CONFIG = {
  // Connection settings
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,

  // TLS for production
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,

  // Connection pool
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('Redis: Max retry attempts reached');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis: Retrying connection in ${delay}ms (attempt ${times})`);
    return delay;
  },

  // Cluster mode
  clusterMode: process.env.REDIS_CLUSTER === 'true',
  clusterNodes: process.env.REDIS_CLUSTER_NODES?.split(',') || [],

  // Key prefixes for namespacing
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'wealthpilot:',

  // Default TTLs (in seconds)
  defaultTTL: 300, // 5 minutes
  sessionTTL: 86400, // 24 hours
  cacheTTL: 60, // 1 minute for volatile data
  rateLimitTTL: 900 // 15 minutes
};

// Redis client instance
let client = null;
let subscriber = null;
let isConnected = false;
let connectionError = null;

/**
 * Initialize Redis client
 */
function initialize() {
  if (client) {
    return client;
  }

  try {
    if (CONFIG.clusterMode && CONFIG.clusterNodes.length > 0) {
      // Cluster mode
      const nodes = CONFIG.clusterNodes.map(node => {
        const [host, port] = node.split(':');
        return { host, port: parseInt(port) || 6379 };
      });

      client = new Redis.Cluster(nodes, {
        redisOptions: {
          password: CONFIG.password,
          tls: CONFIG.tls
        },
        scaleReads: 'slave'
      });

      logger.info('Redis: Connecting in cluster mode');
    } else {
      // Standalone mode
      client = new Redis({
        host: CONFIG.host,
        port: CONFIG.port,
        password: CONFIG.password,
        db: CONFIG.db,
        tls: CONFIG.tls,
        maxRetriesPerRequest: CONFIG.maxRetriesPerRequest,
        retryStrategy: CONFIG.retryStrategy,
        keyPrefix: CONFIG.keyPrefix,
        lazyConnect: true
      });

      logger.info(`Redis: Connecting to ${CONFIG.host}:${CONFIG.port}`);
    }

    // Event handlers
    client.on('connect', () => {
      logger.info('Redis: Connected successfully');
      isConnected = true;
      connectionError = null;
    });

    client.on('ready', () => {
      logger.info('Redis: Ready to accept commands');
    });

    client.on('error', (err) => {
      logger.error('Redis: Connection error:', err.message);
      connectionError = err;
    });

    client.on('close', () => {
      logger.warn('Redis: Connection closed');
      isConnected = false;
    });

    client.on('reconnecting', () => {
      logger.info('Redis: Reconnecting...');
    });

    // Connect
    client.connect().catch(err => {
      logger.error('Redis: Initial connection failed:', err.message);
      connectionError = err;
    });

    return client;
  } catch (err) {
    logger.error('Redis: Failed to initialize:', err.message);
    connectionError = err;
    return null;
  }
}

/**
 * Get Redis client (with fallback)
 */
function getClient() {
  if (!client) {
    initialize();
  }
  return client;
}

/**
 * Check if Redis is available
 */
function isAvailable() {
  return isConnected && client !== null;
}

/**
 * Get connection status
 */
function getStatus() {
  return {
    connected: isConnected,
    error: connectionError?.message || null,
    host: CONFIG.host,
    port: CONFIG.port,
    clusterMode: CONFIG.clusterMode
  };
}

// ==================== CACHING OPERATIONS ====================

/**
 * Get cached value
 */
async function get(key) {
  if (!isAvailable()) return null;

  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.error(`Redis GET error for ${key}:`, err.message);
    return null;
  }
}

/**
 * Set cached value
 */
async function set(key, value, ttlSeconds = CONFIG.defaultTTL) {
  if (!isAvailable()) return false;

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (err) {
    logger.error(`Redis SET error for ${key}:`, err.message);
    return false;
  }
}

/**
 * Delete cached value
 */
async function del(key) {
  if (!isAvailable()) return false;

  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.error(`Redis DEL error for ${key}:`, err.message);
    return false;
  }
}

/**
 * Delete by pattern
 */
async function delByPattern(pattern) {
  if (!isAvailable()) return 0;

  try {
    const fullPattern = CONFIG.keyPrefix + pattern;
    const keys = await client.keys(fullPattern);
    if (keys.length > 0) {
      // Remove prefix before deleting (ioredis adds it back)
      const keysWithoutPrefix = keys.map(k => k.replace(CONFIG.keyPrefix, ''));
      await client.del(...keysWithoutPrefix);
    }
    return keys.length;
  } catch (err) {
    logger.error(`Redis DEL pattern error for ${pattern}:`, err.message);
    return 0;
  }
}

/**
 * Check if key exists
 */
async function exists(key) {
  if (!isAvailable()) return false;

  try {
    return await client.exists(key) === 1;
  } catch (err) {
    logger.error(`Redis EXISTS error for ${key}:`, err.message);
    return false;
  }
}

/**
 * Set expiration on key
 */
async function expire(key, ttlSeconds) {
  if (!isAvailable()) return false;

  try {
    await client.expire(key, ttlSeconds);
    return true;
  } catch (err) {
    logger.error(`Redis EXPIRE error for ${key}:`, err.message);
    return false;
  }
}

/**
 * Get TTL of key
 */
async function ttl(key) {
  if (!isAvailable()) return -1;

  try {
    return await client.ttl(key);
  } catch (err) {
    logger.error(`Redis TTL error for ${key}:`, err.message);
    return -1;
  }
}

// ==================== RATE LIMITING ====================

/**
 * Increment rate limit counter
 * Uses sliding window algorithm
 */
async function rateLimit(key, windowMs, maxRequests) {
  if (!isAvailable()) {
    // Fallback: allow request but log warning
    logger.warn('Redis unavailable for rate limiting, allowing request');
    return { allowed: true, remaining: maxRequests, resetIn: windowMs };
  }

  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `ratelimit:${key}`;

    // Use sorted set for sliding window
    const multi = client.multi();

    // Remove old entries outside window
    multi.zremrangebyscore(redisKey, 0, windowStart);

    // Count current entries
    multi.zcard(redisKey);

    // Add current request
    multi.zadd(redisKey, now, `${now}-${Math.random()}`);

    // Set expiration
    multi.expire(redisKey, Math.ceil(windowMs / 1000));

    const results = await multi.exec();
    const currentCount = results[1][1];

    const allowed = currentCount < maxRequests;
    const remaining = Math.max(0, maxRequests - currentCount - 1);

    // Calculate reset time
    const oldestEntry = await client.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetIn = oldestEntry.length > 0
      ? Math.max(0, parseInt(oldestEntry[1]) + windowMs - now)
      : windowMs;

    return { allowed, remaining, resetIn, currentCount };
  } catch (err) {
    logger.error(`Redis rate limit error for ${key}:`, err.message);
    return { allowed: true, remaining: maxRequests, resetIn: windowMs };
  }
}

/**
 * Check rate limit without incrementing
 */
async function checkRateLimit(key, windowMs, maxRequests) {
  if (!isAvailable()) {
    return { allowed: true, remaining: maxRequests };
  }

  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `ratelimit:${key}`;

    // Count entries in window
    const count = await client.zcount(redisKey, windowStart, now);

    return {
      allowed: count < maxRequests,
      remaining: Math.max(0, maxRequests - count),
      currentCount: count
    };
  } catch (err) {
    logger.error(`Redis check rate limit error for ${key}:`, err.message);
    return { allowed: true, remaining: maxRequests };
  }
}

// ==================== HASH OPERATIONS ====================

/**
 * Set hash field
 */
async function hset(key, field, value) {
  if (!isAvailable()) return false;

  try {
    await client.hset(key, field, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.error(`Redis HSET error:`, err.message);
    return false;
  }
}

/**
 * Get hash field
 */
async function hget(key, field) {
  if (!isAvailable()) return null;

  try {
    const value = await client.hget(key, field);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.error(`Redis HGET error:`, err.message);
    return null;
  }
}

/**
 * Get all hash fields
 */
async function hgetall(key) {
  if (!isAvailable()) return null;

  try {
    const hash = await client.hgetall(key);
    if (!hash || Object.keys(hash).length === 0) return null;

    const result = {};
    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result;
  } catch (err) {
    logger.error(`Redis HGETALL error:`, err.message);
    return null;
  }
}

/**
 * Delete hash field
 */
async function hdel(key, field) {
  if (!isAvailable()) return false;

  try {
    await client.hdel(key, field);
    return true;
  } catch (err) {
    logger.error(`Redis HDEL error:`, err.message);
    return false;
  }
}

// ==================== SET OPERATIONS ====================

/**
 * Add to set
 */
async function sadd(key, ...members) {
  if (!isAvailable()) return false;

  try {
    await client.sadd(key, ...members);
    return true;
  } catch (err) {
    logger.error(`Redis SADD error:`, err.message);
    return false;
  }
}

/**
 * Remove from set
 */
async function srem(key, ...members) {
  if (!isAvailable()) return false;

  try {
    await client.srem(key, ...members);
    return true;
  } catch (err) {
    logger.error(`Redis SREM error:`, err.message);
    return false;
  }
}

/**
 * Check if member in set
 */
async function sismember(key, member) {
  if (!isAvailable()) return false;

  try {
    return await client.sismember(key, member) === 1;
  } catch (err) {
    logger.error(`Redis SISMEMBER error:`, err.message);
    return false;
  }
}

/**
 * Get all set members
 */
async function smembers(key) {
  if (!isAvailable()) return [];

  try {
    return await client.smembers(key);
  } catch (err) {
    logger.error(`Redis SMEMBERS error:`, err.message);
    return [];
  }
}

// ==================== PUB/SUB ====================

/**
 * Get subscriber client
 */
function getSubscriber() {
  if (!subscriber && client) {
    subscriber = client.duplicate();
    subscriber.on('error', (err) => {
      logger.error('Redis subscriber error:', err.message);
    });
  }
  return subscriber;
}

/**
 * Publish message
 */
async function publish(channel, message) {
  if (!isAvailable()) return false;

  try {
    await client.publish(channel, JSON.stringify(message));
    return true;
  } catch (err) {
    logger.error(`Redis PUBLISH error:`, err.message);
    return false;
  }
}

/**
 * Subscribe to channel
 */
async function subscribe(channel, callback) {
  const sub = getSubscriber();
  if (!sub) return false;

  try {
    await sub.subscribe(channel);
    sub.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
    return true;
  } catch (err) {
    logger.error(`Redis SUBSCRIBE error:`, err.message);
    return false;
  }
}

// ==================== UTILITIES ====================

/**
 * Flush all keys (use with caution!)
 */
async function flushAll() {
  if (!isAvailable()) return false;

  if (process.env.NODE_ENV === 'production') {
    logger.error('Redis FLUSHALL blocked in production');
    return false;
  }

  try {
    await client.flushall();
    logger.warn('Redis: All keys flushed');
    return true;
  } catch (err) {
    logger.error(`Redis FLUSHALL error:`, err.message);
    return false;
  }
}

/**
 * Get Redis info
 */
async function info() {
  if (!isAvailable()) return null;

  try {
    const infoStr = await client.info();
    const info = {};
    infoStr.split('\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        info[key.trim()] = value.trim();
      }
    });
    return info;
  } catch (err) {
    logger.error(`Redis INFO error:`, err.message);
    return null;
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
  if (client) {
    await client.quit();
    client = null;
    isConnected = false;
  }
  logger.info('Redis: Connections closed');
}

// Initialize on module load
initialize();

module.exports = {
  // Client access
  getClient,
  isAvailable,
  getStatus,

  // Basic operations
  get,
  set,
  del,
  delByPattern,
  exists,
  expire,
  ttl,

  // Rate limiting
  rateLimit,
  checkRateLimit,

  // Hash operations
  hset,
  hget,
  hgetall,
  hdel,

  // Set operations
  sadd,
  srem,
  sismember,
  smembers,

  // Pub/Sub
  publish,
  subscribe,
  getSubscriber,

  // Utilities
  flushAll,
  info,
  shutdown,

  // Configuration
  CONFIG
};
