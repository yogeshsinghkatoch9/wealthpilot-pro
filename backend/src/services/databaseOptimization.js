/**
 * Database Optimization Service
 *
 * Features:
 * - Query performance monitoring
 * - Index analysis and recommendations
 * - Connection pool management
 * - Query caching
 * - Slow query detection
 * - Database health checks
 * - Automatic maintenance
 */

const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

// Query performance tracking
const queryStats = new Map();
const slowQueries = [];
const SLOW_QUERY_THRESHOLD_MS = 1000; // 1 second
const MAX_SLOW_QUERIES = 100;

// Cache for frequently accessed data
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default TTL

// Configuration
const CONFIG = {
  enableQueryTracking: process.env.NODE_ENV !== 'production',
  enableCaching: true,
  maxCacheEntries: 1000,
  slowQueryThreshold: SLOW_QUERY_THRESHOLD_MS,
  connectionPoolSize: parseInt(process.env.DATABASE_POOL_SIZE) || 10,
  connectionTimeout: 10000 // 10 seconds
};

/**
 * Query wrapper with performance tracking
 */
async function trackedQuery(name, queryFn) {
  const startTime = Date.now();
  let success = true;
  let error = null;

  try {
    const result = await queryFn();
    return result;
  } catch (err) {
    success = false;
    error = err;
    throw err;
  } finally {
    const duration = Date.now() - startTime;

    // Track query stats
    if (CONFIG.enableQueryTracking) {
      if (!queryStats.has(name)) {
        queryStats.set(name, {
          name,
          count: 0,
          totalTime: 0,
          avgTime: 0,
          maxTime: 0,
          minTime: Infinity,
          errors: 0
        });
      }

      const stats = queryStats.get(name);
      stats.count++;
      stats.totalTime += duration;
      stats.avgTime = stats.totalTime / stats.count;
      stats.maxTime = Math.max(stats.maxTime, duration);
      stats.minTime = Math.min(stats.minTime, duration);
      if (!success) stats.errors++;

      // Track slow queries
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        slowQueries.push({
          name,
          duration,
          timestamp: new Date().toISOString(),
          error: error?.message
        });

        // Keep only recent slow queries
        if (slowQueries.length > MAX_SLOW_QUERIES) {
          slowQueries.shift();
        }

        logger.warn(`Slow query detected: ${name} took ${duration}ms`);
      }
    }
  }
}

/**
 * Cache wrapper for query results
 */
async function cachedQuery(key, queryFn, ttl = CACHE_TTL) {
  if (!CONFIG.enableCaching) {
    return queryFn();
  }

  const cached = queryCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const result = await queryFn();

  // Store in cache
  if (queryCache.size >= CONFIG.maxCacheEntries) {
    // Remove oldest entry
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }

  queryCache.set(key, {
    value: result,
    expiresAt: Date.now() + ttl
  });

  return result;
}

/**
 * Invalidate cache entries by pattern
 */
function invalidateCache(pattern) {
  if (typeof pattern === 'string') {
    queryCache.delete(pattern);
    return 1;
  }

  let count = 0;
  for (const key of queryCache.keys()) {
    if (pattern.test(key)) {
      queryCache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Clear entire cache
 */
function clearCache() {
  const size = queryCache.size;
  queryCache.clear();
  return size;
}

/**
 * Get query statistics
 */
function getQueryStats() {
  const stats = Array.from(queryStats.values());
  return {
    queries: stats.sort((a, b) => b.totalTime - a.totalTime),
    slowQueries: [...slowQueries].reverse(),
    cacheStats: {
      entries: queryCache.size,
      maxEntries: CONFIG.maxCacheEntries,
      enabled: CONFIG.enableCaching
    }
  };
}

/**
 * Database health check
 */
async function healthCheck() {
  const startTime = Date.now();
  const results = {
    status: 'healthy',
    checks: {},
    responseTime: 0
  };

  try {
    // Basic connectivity
    const connectStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    results.checks.connectivity = {
      status: 'pass',
      responseTime: Date.now() - connectStart
    };

    // Check table counts for key tables
    const [usersCount, portfoliosCount, holdingsCount] = await Promise.all([
      prisma.users.count(),
      prisma.portfolios.count(),
      prisma.holdings.count()
    ]);

    results.checks.tables = {
      status: 'pass',
      users: usersCount,
      portfolios: portfoliosCount,
      holdings: holdingsCount
    };

    // Check for recent activity
    const recentSession = await prisma.sessions.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    results.checks.activity = {
      status: 'pass',
      lastSession: recentSession?.createdAt || 'none'
    };

  } catch (error) {
    results.status = 'unhealthy';
    results.error = error.message;
    logger.error('Database health check failed:', error);
  }

  results.responseTime = Date.now() - startTime;
  return results;
}

/**
 * Analyze indexes and provide recommendations
 */
async function analyzeIndexes() {
  const recommendations = [];

  try {
    // For PostgreSQL, get index usage statistics
    const indexStats = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as rows_read,
        idx_tup_fetch as rows_fetched
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 50
    `;

    // Find unused indexes
    const unusedIndexes = indexStats.filter(idx => idx.scans === 0n || idx.scans === 0);
    if (unusedIndexes.length > 0) {
      recommendations.push({
        type: 'unused_indexes',
        severity: 'medium',
        message: `${unusedIndexes.length} indexes have never been used`,
        indexes: unusedIndexes.slice(0, 10).map(i => i.indexname)
      });
    }

    // Get table sizes
    const tableSizes = await prisma.$queryRaw`
      SELECT
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_size_pretty(pg_indexes_size(relid)) as indexes_size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 20
    `;

    return {
      indexStats: indexStats.slice(0, 20),
      tableSizes,
      recommendations
    };
  } catch (error) {
    // Handle case where this is SQLite or stats not available
    logger.debug('Index analysis not available:', error.message);
    return {
      indexStats: [],
      tableSizes: [],
      recommendations: [],
      note: 'Detailed index analysis requires PostgreSQL'
    };
  }
}

/**
 * Get connection pool status
 */
async function getConnectionPoolStatus() {
  try {
    // For PostgreSQL
    const connections = await prisma.$queryRaw`
      SELECT
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    return {
      connections: connections[0] || {},
      poolSize: CONFIG.connectionPoolSize,
      timeout: CONFIG.connectionTimeout
    };
  } catch (error) {
    logger.debug('Connection pool status not available:', error.message);
    return {
      connections: { note: 'Stats not available' },
      poolSize: CONFIG.connectionPoolSize,
      timeout: CONFIG.connectionTimeout
    };
  }
}

/**
 * Run VACUUM ANALYZE for maintenance (PostgreSQL)
 */
async function runMaintenance(tableName = null) {
  try {
    if (tableName) {
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE "${tableName}"`);
      logger.info(`Maintenance completed for table: ${tableName}`);
    } else {
      await prisma.$executeRaw`VACUUM ANALYZE`;
      logger.info('Full database maintenance completed');
    }
    return { success: true, message: 'Maintenance completed' };
  } catch (error) {
    logger.error('Database maintenance failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Optimized batch operations
 */
async function batchInsert(model, data, batchSize = 100) {
  const results = [];
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const result = await prisma[model].createMany({
      data: batch,
      skipDuplicates: true
    });
    results.push(result);
  }
  return results;
}

async function batchUpdate(model, updates, batchSize = 50) {
  const results = [];
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ where, data }) =>
        prisma[model].update({ where, data }).catch(e => ({ error: e.message }))
      )
    );
    results.push(...batchResults);
  }
  return results;
}

async function batchDelete(model, ids, batchSize = 100) {
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const result = await prisma[model].deleteMany({
      where: { id: { in: batch } }
    });
    results.push(result);
  }
  return results;
}

/**
 * Optimized queries for common operations
 */
const optimizedQueries = {
  // Get portfolio with all related data in single query
  async getFullPortfolio(portfolioId) {
    return cachedQuery(`portfolio:full:${portfolioId}`, () =>
      prisma.portfolios.findUnique({
        where: { id: portfolioId },
        include: {
          holdings: {
            include: {
              taxLots: true
            }
          },
          transactions: {
            take: 50,
            orderBy: { executedAt: 'desc' }
          },
          snapshots: {
            take: 30,
            orderBy: { snapshotDate: 'desc' }
          }
        }
      }),
      60000 // 1 minute TTL
    );
  },

  // Get user dashboard data efficiently
  async getUserDashboard(userId) {
    return cachedQuery(`user:dashboard:${userId}`, async () => {
      const [portfolios, watchlists, alerts, notifications] = await Promise.all([
        prisma.portfolios.findMany({
          where: { userId },
          include: {
            holdings: { select: { id: true, symbol: true, shares: true, avgCostBasis: true } }
          }
        }),
        prisma.watchlist.findMany({
          where: { userId },
          include: { items: true }
        }),
        prisma.alerts.findMany({
          where: { userId, isActive: true },
          take: 10
        }),
        prisma.notification.findMany({
          where: { userId, isRead: false },
          take: 20,
          orderBy: { createdAt: 'desc' }
        })
      ]);

      return { portfolios, watchlists, alerts, notifications };
    }, 30000); // 30 second TTL
  },

  // Get market data with caching
  async getStockQuotes(symbols) {
    const cacheKey = `quotes:${symbols.sort().join(',')}`;
    return cachedQuery(cacheKey, () =>
      prisma.stockQuote.findMany({
        where: { symbol: { in: symbols } }
      }),
      30000 // 30 second TTL for market data
    );
  }
};

/**
 * Reset statistics
 */
function resetStats() {
  queryStats.clear();
  slowQueries.length = 0;
  return { message: 'Statistics reset' };
}

/**
 * Get comprehensive database status
 */
async function getDatabaseStatus() {
  const [health, poolStatus, stats] = await Promise.all([
    healthCheck(),
    getConnectionPoolStatus(),
    Promise.resolve(getQueryStats())
  ]);

  return {
    health,
    pool: poolStatus,
    queryStats: stats,
    config: CONFIG
  };
}

module.exports = {
  // Query utilities
  trackedQuery,
  cachedQuery,
  invalidateCache,
  clearCache,

  // Monitoring
  getQueryStats,
  healthCheck,
  analyzeIndexes,
  getConnectionPoolStatus,
  getDatabaseStatus,
  resetStats,

  // Maintenance
  runMaintenance,

  // Batch operations
  batchInsert,
  batchUpdate,
  batchDelete,

  // Optimized queries
  optimizedQueries,

  // Configuration
  CONFIG
};
