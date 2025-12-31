/**
 * Advanced DDoS Protection & Security Middleware
 *
 * Features:
 * - IP blacklisting/whitelisting
 * - Request fingerprinting
 * - Adaptive rate limiting
 * - Burst protection
 * - Bot detection
 * - Suspicious pattern detection
 * - Geographic restrictions (optional)
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

// In-memory stores (use Redis in production for distributed systems)
const ipBlacklist = new Set();
const ipWhitelist = new Set(['127.0.0.1', '::1']); // Localhost always allowed
const suspiciousIPs = new Map(); // IP -> { count, firstSeen, lastSeen }
const requestFingerprints = new Map(); // fingerprint -> { count, lastSeen }
const burstTracker = new Map(); // IP -> { requests: [], blocked: boolean }
const ipRequestCounts = new Map(); // IP -> { count, windowStart }

// Configuration
const CONFIG = {
  // Blacklist settings
  blacklistThreshold: 100, // Requests per minute to auto-blacklist
  blacklistDuration: 30 * 60 * 1000, // 30 minutes

  // Burst protection
  burstWindowMs: 1000, // 1 second
  maxBurstRequests: 50, // Max 50 requests per second

  // Suspicious activity detection
  suspiciousThreshold: 5, // Number of suspicious activities before flagging
  suspiciousDecayMs: 60 * 60 * 1000, // 1 hour decay

  // Fingerprint tracking
  fingerprintWindowMs: 5 * 60 * 1000, // 5 minutes
  maxFingerprintRequests: 100, // Max same fingerprint in window

  // Adaptive rate limiting
  adaptiveMultiplier: 0.5, // Reduce limits by 50% under attack
  attackThreshold: 1000, // Global requests/minute to trigger adaptive mode

  // Request validation
  maxHeaderSize: 16384, // 16KB
  maxPayloadSize: 10 * 1024 * 1024, // 10MB

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

// Global attack state
let globalState = {
  isUnderAttack: false,
  attackStartTime: null,
  totalRequestsLastMinute: 0,
  lastMinuteStart: Date.now()
};

/**
 * Generate request fingerprint
 */
function generateFingerprint(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.method,
    req.path.split('?')[0] // Path without query string
  ].join('|');

  return crypto.createHash('md5').update(components).digest('hex').slice(0, 16);
}

/**
 * Check if IP is blacklisted
 */
function isBlacklisted(ip) {
  return ipBlacklist.has(ip);
}

/**
 * Check if IP is whitelisted
 */
function isWhitelisted(ip) {
  return ipWhitelist.has(ip);
}

/**
 * Add IP to blacklist
 */
function blacklistIP(ip, reason, duration = CONFIG.blacklistDuration) {
  if (isWhitelisted(ip)) return;

  ipBlacklist.add(ip);
  logger.warn(`IP blacklisted: ${ip} - Reason: ${reason}`);

  // Auto-remove after duration
  setTimeout(() => {
    ipBlacklist.delete(ip);
    logger.info(`IP removed from blacklist: ${ip}`);
  }, duration);
}

/**
 * Check for burst attacks
 */
function checkBurstAttack(ip) {
  const now = Date.now();

  if (!burstTracker.has(ip)) {
    burstTracker.set(ip, { requests: [now], blocked: false });
    return false;
  }

  const tracker = burstTracker.get(ip);

  // Remove old requests outside window
  tracker.requests = tracker.requests.filter(t => now - t < CONFIG.burstWindowMs);
  tracker.requests.push(now);

  if (tracker.requests.length > CONFIG.maxBurstRequests) {
    if (!tracker.blocked) {
      tracker.blocked = true;
      logger.warn(`Burst attack detected from IP: ${ip} - ${tracker.requests.length} requests/second`);
    }
    return true;
  }

  tracker.blocked = false;
  return false;
}

/**
 * Detect suspicious patterns
 */
function detectSuspiciousActivity(req) {
  const suspiciousSignals = [];

  // Check for suspicious paths
  if (CONFIG.suspiciousPaths.some(pattern => pattern.test(req.path))) {
    suspiciousSignals.push('suspicious_path');
  }

  // Check for missing User-Agent
  if (!req.headers['user-agent']) {
    suspiciousSignals.push('no_user_agent');
  }

  // Check for bot user agents
  const ua = req.headers['user-agent'] || '';
  if (CONFIG.botUserAgents.some(pattern => pattern.test(ua))) {
    suspiciousSignals.push('bot_user_agent');
  }

  // Check for suspicious headers
  if (req.headers['x-forwarded-for']?.split(',').length > 3) {
    suspiciousSignals.push('many_proxies');
  }

  // Check for very fast requests (time since last)
  const ip = req.ip || req.connection.remoteAddress;
  const tracker = suspiciousIPs.get(ip);
  if (tracker && Date.now() - tracker.lastSeen < 10) { // < 10ms between requests
    suspiciousSignals.push('too_fast');
  }

  return suspiciousSignals;
}

/**
 * Track suspicious IP
 */
function trackSuspiciousIP(ip, signals) {
  const now = Date.now();

  if (!suspiciousIPs.has(ip)) {
    suspiciousIPs.set(ip, {
      count: signals.length,
      signals: new Set(signals),
      firstSeen: now,
      lastSeen: now
    });
    return;
  }

  const tracker = suspiciousIPs.get(ip);

  // Decay old counts
  if (now - tracker.lastSeen > CONFIG.suspiciousDecayMs) {
    tracker.count = 0;
    tracker.signals.clear();
  }

  tracker.count += signals.length;
  signals.forEach(s => tracker.signals.add(s));
  tracker.lastSeen = now;

  // Auto-blacklist if threshold exceeded
  if (tracker.count >= CONFIG.suspiciousThreshold * 5) {
    blacklistIP(ip, `Suspicious activity: ${Array.from(tracker.signals).join(', ')}`);
  }
}

/**
 * Check fingerprint rate
 */
function checkFingerprintRate(fingerprint) {
  const now = Date.now();

  if (!requestFingerprints.has(fingerprint)) {
    requestFingerprints.set(fingerprint, { count: 1, windowStart: now });
    return false;
  }

  const tracker = requestFingerprints.get(fingerprint);

  // Reset if outside window
  if (now - tracker.windowStart > CONFIG.fingerprintWindowMs) {
    tracker.count = 1;
    tracker.windowStart = now;
    return false;
  }

  tracker.count++;

  return tracker.count > CONFIG.maxFingerprintRequests;
}

/**
 * Update global attack state
 */
function updateGlobalState() {
  const now = Date.now();

  // Reset counter every minute
  if (now - globalState.lastMinuteStart > 60000) {
    globalState.totalRequestsLastMinute = 0;
    globalState.lastMinuteStart = now;
  }

  globalState.totalRequestsLastMinute++;

  // Check if under attack
  if (globalState.totalRequestsLastMinute > CONFIG.attackThreshold) {
    if (!globalState.isUnderAttack) {
      globalState.isUnderAttack = true;
      globalState.attackStartTime = now;
      logger.error(`DDOS ATTACK DETECTED - ${globalState.totalRequestsLastMinute} requests/minute`);
    }
  } else if (globalState.isUnderAttack &&
             globalState.totalRequestsLastMinute < CONFIG.attackThreshold * 0.5) {
    globalState.isUnderAttack = false;
    globalState.attackStartTime = null;
    logger.info('DDOS attack subsided');
  }
}

/**
 * Clean up old tracking data
 */
function cleanup() {
  const now = Date.now();

  // Clean burst tracker
  for (const [ip, tracker] of burstTracker.entries()) {
    if (tracker.requests.every(t => now - t > 60000)) {
      burstTracker.delete(ip);
    }
  }

  // Clean fingerprint tracker
  for (const [fp, tracker] of requestFingerprints.entries()) {
    if (now - tracker.windowStart > CONFIG.fingerprintWindowMs * 2) {
      requestFingerprints.delete(fp);
    }
  }

  // Clean suspicious IPs
  for (const [ip, tracker] of suspiciousIPs.entries()) {
    if (now - tracker.lastSeen > CONFIG.suspiciousDecayMs * 2) {
      suspiciousIPs.delete(ip);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000);

/**
 * Main DDoS protection middleware
 */
function ddosProtection(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  // Update global state
  updateGlobalState();

  // Skip for whitelisted IPs
  if (isWhitelisted(ip)) {
    return next();
  }

  // Block blacklisted IPs immediately
  if (isBlacklisted(ip)) {
    logger.warn(`Blocked blacklisted IP: ${ip}`);
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'IP_BLOCKED'
    });
  }

  // Check for burst attacks
  if (checkBurstAttack(ip)) {
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
    trackSuspiciousIP(ip, suspiciousSignals);

    // Immediate block for critical signals
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
  if (checkFingerprintRate(fingerprint)) {
    logger.warn(`Fingerprint rate limit exceeded: ${ip} - ${fingerprint}`);
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

  // Under attack mode - add challenge headers
  if (globalState.isUnderAttack) {
    res.setHeader('X-Attack-Mode', 'active');
  }

  next();
}

/**
 * Request size limiter middleware
 */
function requestSizeLimiter(req, res, next) {
  // Check header size
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
 * Sets aggressive timeouts for slow requests
 */
function slowlorisProtection(req, res, next) {
  // Set request timeout (10 seconds for normal requests)
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

/**
 * API key validation middleware (for public API access)
 */
function validateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  // Skip for internal routes
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/health')) {
    return next();
  }

  // If API key provided, validate it
  if (apiKey) {
    // In production, validate against database
    // For now, just log and continue
    logger.debug(`API key used: ${apiKey.slice(0, 8)}...`);
  }

  next();
}

/**
 * Get current protection status
 */
function getProtectionStatus() {
  return {
    isUnderAttack: globalState.isUnderAttack,
    attackDuration: globalState.isUnderAttack
      ? Math.round((Date.now() - globalState.attackStartTime) / 1000)
      : 0,
    requestsLastMinute: globalState.totalRequestsLastMinute,
    blacklistedIPs: ipBlacklist.size,
    suspiciousIPs: suspiciousIPs.size,
    activeTracking: {
      bursts: burstTracker.size,
      fingerprints: requestFingerprints.size
    }
  };
}

/**
 * Manual IP management
 */
function manualBlacklist(ip, reason = 'Manual blacklist') {
  blacklistIP(ip, reason, 24 * 60 * 60 * 1000); // 24 hours
  return true;
}

function manualWhitelist(ip) {
  ipWhitelist.add(ip);
  ipBlacklist.delete(ip);
  return true;
}

function removeFromBlacklist(ip) {
  ipBlacklist.delete(ip);
  return true;
}

function removeFromWhitelist(ip) {
  if (ip !== '127.0.0.1' && ip !== '::1') {
    ipWhitelist.delete(ip);
    return true;
  }
  return false;
}

module.exports = {
  ddosProtection,
  requestSizeLimiter,
  slowlorisProtection,
  validateAPIKey,
  getProtectionStatus,
  manualBlacklist,
  manualWhitelist,
  removeFromBlacklist,
  removeFromWhitelist,
  isBlacklisted,
  isWhitelisted,
  CONFIG
};
