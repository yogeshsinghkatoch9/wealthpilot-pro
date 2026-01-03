/**
 * Production-Grade DDoS Protection with Redis
 *
 * Features:
 * - Distributed rate limiting via Redis
 * - IP blacklisting/whitelisting with persistence
 * - Request fingerprinting
 * - Adaptive rate limiting under attack
 * - Bot detection
 * - Cluster-aware state management
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const redis = require('../services/redis/redisClient');

// Redis key prefixes
const KEYS = {
  blacklist: 'ddos:blacklist',
  whitelist: 'ddos:whitelist',
  suspicious: 'ddos:suspicious:',
  fingerprint: 'ddos:fp:',
  burst: 'ddos:burst:',
  globalState: 'ddos:global',
  attackMode: 'ddos:attack'
};

// Configuration
const CONFIG = {
  // Blacklist settings
  blacklistThreshold: 100,
  blacklistDurationSeconds: 1800, // 30 minutes

  // Burst protection
  burstWindowMs: 1000,
  maxBurstRequests: 50,

  // Suspicious activity
  suspiciousThreshold: 5,
  suspiciousDecaySeconds: 3600, // 1 hour

  // Fingerprint tracking
  fingerprintWindowSeconds: 300, // 5 minutes
  maxFingerprintRequests: 100,

  // Adaptive rate limiting
  attackThreshold: 1000,
  attackWindowSeconds: 60,

  // Request validation
  maxHeaderSize: 16384,
  maxPayloadSize: 10 * 1024 * 1024,

  // Bot patterns
  botUserAgents: [
    /curl/i, /wget/i, /python-requests/i, /scrapy/i,
    /bot/i, /crawl/i, /spider/i, /scan/i
  ],

  // Suspicious paths
  suspiciousPaths: [
    /\.env/i, /\.git/i, /wp-admin/i, /phpMyAdmin/i,
    /admin\.php/i, /shell/i, /eval/i, /base64/i
  ]
};

// Local whitelist (always allowed)
const localWhitelist = new Set(['127.0.0.1', '::1']);

/**
 * Generate request fingerprint
 */
function generateFingerprint(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.method,
    req.path.split('?')[0]
  ].join('|');

  return crypto.createHash('md5').update(components).digest('hex').slice(0, 16);
}

/**
 * Check if IP is blacklisted
 */
async function isBlacklisted(ip) {
  // Check local whitelist first
  if (localWhitelist.has(ip)) return false;

  // Check Redis whitelist
  if (await redis.sismember(KEYS.whitelist, ip)) return false;

  // Check Redis blacklist
  return await redis.sismember(KEYS.blacklist, ip);
}

/**
 * Check if IP is whitelisted
 */
async function isWhitelisted(ip) {
  if (localWhitelist.has(ip)) return true;
  return await redis.sismember(KEYS.whitelist, ip);
}

/**
 * Add IP to blacklist
 */
async function blacklistIP(ip, reason, durationSeconds = CONFIG.blacklistDurationSeconds) {
  if (localWhitelist.has(ip)) return false;
  if (await redis.sismember(KEYS.whitelist, ip)) return false;

  await redis.sadd(KEYS.blacklist, ip);

  // Store blacklist metadata
  await redis.hset(`${KEYS.blacklist}:meta`, ip, {
    reason,
    timestamp: Date.now(),
    expiresAt: Date.now() + (durationSeconds * 1000)
  });

  // Set expiration via sorted set for automatic cleanup
  await redis.getClient()?.zadd(
    `${KEYS.blacklist}:expiry`,
    Date.now() + (durationSeconds * 1000),
    ip
  );

  logger.warn(`IP blacklisted: ${ip} - Reason: ${reason} - Duration: ${durationSeconds}s`);

  // Schedule cleanup
  setTimeout(() => cleanupExpiredBlacklist(), durationSeconds * 1000 + 1000);

  return true;
}

/**
 * Remove IP from blacklist
 */
async function removeFromBlacklist(ip) {
  await redis.srem(KEYS.blacklist, ip);
  await redis.hdel(`${KEYS.blacklist}:meta`, ip);
  logger.info(`IP removed from blacklist: ${ip}`);
  return true;
}

/**
 * Add IP to whitelist
 */
async function whitelistIP(ip) {
  await redis.sadd(KEYS.whitelist, ip);
  await redis.srem(KEYS.blacklist, ip);
  logger.info(`IP whitelisted: ${ip}`);
  return true;
}

/**
 * Remove IP from whitelist
 */
async function removeFromWhitelist(ip) {
  if (localWhitelist.has(ip)) return false;
  await redis.srem(KEYS.whitelist, ip);
  return true;
}

/**
 * Clean up expired blacklist entries
 */
async function cleanupExpiredBlacklist() {
  try {
    const client = redis.getClient();
    if (!client) return;

    const now = Date.now();
    const expiredIPs = await client.zrangebyscore(`${KEYS.blacklist}:expiry`, 0, now);

    for (const ip of expiredIPs) {
      await redis.srem(KEYS.blacklist, ip);
      await redis.hdel(`${KEYS.blacklist}:meta`, ip);
      await client.zrem(`${KEYS.blacklist}:expiry`, ip);
      logger.info(`Blacklist entry expired: ${ip}`);
    }
  } catch (err) {
    logger.error('Blacklist cleanup error:', err.message);
  }
}

/**
 * Check for burst attacks using Redis
 */
async function checkBurstAttack(ip) {
  const key = `${KEYS.burst}${ip}`;
  const now = Date.now();
  const windowStart = now - CONFIG.burstWindowMs;

  const result = await redis.rateLimit(key, CONFIG.burstWindowMs, CONFIG.maxBurstRequests);

  if (!result.allowed) {
    logger.warn(`Burst attack detected from IP: ${ip} - ${result.currentCount} requests/second`);
    return true;
  }

  return false;
}

/**
 * Detect suspicious patterns
 */
function detectSuspiciousActivity(req) {
  const suspiciousSignals = [];

  if (CONFIG.suspiciousPaths.some(pattern => pattern.test(req.path))) {
    suspiciousSignals.push('suspicious_path');
  }

  if (!req.headers['user-agent']) {
    suspiciousSignals.push('no_user_agent');
  }

  const ua = req.headers['user-agent'] || '';
  if (CONFIG.botUserAgents.some(pattern => pattern.test(ua))) {
    suspiciousSignals.push('bot_user_agent');
  }

  if (req.headers['x-forwarded-for']?.split(',').length > 3) {
    suspiciousSignals.push('many_proxies');
  }

  return suspiciousSignals;
}

/**
 * Track suspicious IP in Redis
 */
async function trackSuspiciousIP(ip, signals) {
  const key = `${KEYS.suspicious}${ip}`;

  // Get current data
  let data = await redis.get(key) || { count: 0, signals: [], firstSeen: Date.now() };

  data.count += signals.length;
  data.signals = [...new Set([...data.signals, ...signals])];
  data.lastSeen = Date.now();

  await redis.set(key, data, CONFIG.suspiciousDecaySeconds);

  // Auto-blacklist if threshold exceeded
  if (data.count >= CONFIG.suspiciousThreshold * 5) {
    await blacklistIP(ip, `Suspicious activity: ${data.signals.join(', ')}`);
  }

  return data;
}

/**
 * Check fingerprint rate using Redis
 */
async function checkFingerprintRate(fingerprint, ip) {
  const key = `${KEYS.fingerprint}${fingerprint}`;
  const result = await redis.rateLimit(
    key,
    CONFIG.fingerprintWindowSeconds * 1000,
    CONFIG.maxFingerprintRequests
  );

  if (!result.allowed) {
    logger.warn(`Fingerprint rate limit exceeded: ${ip} - ${fingerprint}`);
    return true;
  }

  return false;
}

/**
 * Update global attack state in Redis
 */
async function updateGlobalState() {
  const client = redis.getClient();
  if (!client) return { isUnderAttack: false };

  const now = Date.now();
  const windowKey = `${KEYS.globalState}:${Math.floor(now / 60000)}`; // Per-minute window

  // Increment request count
  const count = await client.incr(windowKey);
  if (count === 1) {
    await client.expire(windowKey, 120); // Keep for 2 minutes
  }

  // Check if under attack
  const isUnderAttack = count > CONFIG.attackThreshold;

  if (isUnderAttack) {
    const wasUnderAttack = await redis.get(KEYS.attackMode);
    if (!wasUnderAttack) {
      await redis.set(KEYS.attackMode, { startTime: now, requestCount: count }, 300);
      logger.error(`DDOS ATTACK DETECTED - ${count} requests/minute`);
    }
  } else {
    const attackData = await redis.get(KEYS.attackMode);
    if (attackData && count < CONFIG.attackThreshold * 0.5) {
      await redis.del(KEYS.attackMode);
      logger.info('DDOS attack subsided');
    }
  }

  return { isUnderAttack, requestCount: count };
}

/**
 * Get current protection status
 */
async function getProtectionStatus() {
  const attackData = await redis.get(KEYS.attackMode);
  const blacklistMembers = await redis.smembers(KEYS.blacklist);
  const whitelistMembers = await redis.smembers(KEYS.whitelist);

  return {
    isUnderAttack: !!attackData,
    attackStartTime: attackData?.startTime || null,
    attackDuration: attackData ? Math.round((Date.now() - attackData.startTime) / 1000) : 0,
    blacklistedIPs: blacklistMembers.length,
    whitelistedIPs: whitelistMembers.length + localWhitelist.size,
    redisConnected: redis.isAvailable()
  };
}

/**
 * Get blacklist with metadata
 */
async function getBlacklist() {
  const members = await redis.smembers(KEYS.blacklist);
  const meta = await redis.hgetall(`${KEYS.blacklist}:meta`) || {};

  return members.map(ip => ({
    ip,
    ...meta[ip]
  }));
}

/**
 * Get whitelist
 */
async function getWhitelist() {
  const redisWhitelist = await redis.smembers(KEYS.whitelist);
  return [...localWhitelist, ...redisWhitelist];
}

/**
 * Main DDoS protection middleware
 */
async function ddosProtection(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  // Update global state
  const globalState = await updateGlobalState();

  // Skip for local whitelist
  if (localWhitelist.has(ip)) {
    return next();
  }

  // Check whitelist (Redis)
  if (await isWhitelisted(ip)) {
    return next();
  }

  // Block blacklisted IPs
  if (await isBlacklisted(ip)) {
    logger.warn(`Blocked blacklisted IP: ${ip}`);
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'IP_BLOCKED'
    });
  }

  // Check for burst attacks
  if (await checkBurstAttack(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please slow down.',
      code: 'BURST_LIMIT',
      retryAfter: 1
    });
  }

  // Detect suspicious activity
  const suspiciousSignals = detectSuspiciousActivity(req);
  if (suspiciousSignals.length > 0) {
    await trackSuspiciousIP(ip, suspiciousSignals);

    if (suspiciousSignals.includes('suspicious_path')) {
      logger.warn(`Blocked suspicious request: ${ip} -> ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Invalid request',
        code: 'SUSPICIOUS_REQUEST'
      });
    }
  }

  // Check fingerprint rate
  const fingerprint = generateFingerprint(req);
  if (await checkFingerprintRate(fingerprint, ip)) {
    return res.status(429).json({
      success: false,
      error: 'Request pattern rate limit exceeded',
      code: 'FINGERPRINT_LIMIT',
      retryAfter: 60
    });
  }

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (globalState.isUnderAttack) {
    res.setHeader('X-Attack-Mode', 'active');
  }

  next();
}

/**
 * Request size limiter middleware
 */
function requestSizeLimiter(req, res, next) {
  const headerSize = JSON.stringify(req.headers).length;
  if (headerSize > CONFIG.maxHeaderSize) {
    logger.warn(`Oversized headers from: ${req.ip} - ${headerSize} bytes`);
    return res.status(431).json({
      success: false,
      error: 'Request headers too large',
      code: 'HEADERS_TOO_LARGE'
    });
  }
  next();
}

/**
 * Slowloris protection middleware
 */
function slowlorisProtection(req, res, next) {
  req.setTimeout(10000, () => {
    logger.warn(`Request timeout from: ${req.ip}`);
    res.status(408).json({
      success: false,
      error: 'Request timeout',
      code: 'REQUEST_TIMEOUT'
    });
  });
  next();
}

// Run cleanup periodically
setInterval(cleanupExpiredBlacklist, 60000);

module.exports = {
  ddosProtection,
  requestSizeLimiter,
  slowlorisProtection,
  getProtectionStatus,
  isBlacklisted,
  isWhitelisted,
  blacklistIP,
  removeFromBlacklist,
  whitelistIP,
  removeFromWhitelist,
  getBlacklist,
  getWhitelist,
  CONFIG
};
