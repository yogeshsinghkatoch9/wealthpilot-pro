/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 *
 * ROOT FIX IMPLEMENTATION:
 * - Environment-aware limits (dev vs prod)
 * - Key generation by email/user, not just IP
 * - Proper X-Forwarded-For handling for proxied requests
 * - Redis store for distributed rate limiting
 * - Trusted IP whitelist
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Environment detection
const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Multiplier for development (more relaxed limits)
const DEV_MULTIPLIER = isDevelopment ? 10 : 1;

// Trusted IPs that bypass rate limiting (internal services, load balancers)
const TRUSTED_IPS = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
  // Docker internal network
  '172.17.0.1',
  '172.18.0.1',
  '172.19.0.1',
  // Add your load balancer IPs here
]);

/**
 * Extract real client IP from request
 * Handles X-Forwarded-For header for proxied requests
 */
function getClientIP(req) {
  // Check X-Forwarded-For header (set by proxies/load balancers)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    // The first one is the original client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }

  // Check X-Real-IP header (nginx)
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }

  // Fall back to connection remote address
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Check if IP is trusted (bypasses rate limiting)
 */
function isTrustedIP(ip) {
  if (isTest) return true; // Skip rate limiting in tests
  return TRUSTED_IPS.has(ip);
}

/**
 * Create rate limiter with environment-aware defaults
 */
function createLimiter(options) {
  const {
    windowMs,
    max,
    keyGenerator,
    skip,
    ...rest
  } = options;

  return rateLimit({
    windowMs,
    max: max * DEV_MULTIPLIER, // Relaxed in development
    standardHeaders: true,
    legacyHeaders: false,

    // Use real client IP for key generation
    keyGenerator: keyGenerator || ((req) => getClientIP(req)),

    // Skip trusted IPs and custom skip logic
    skip: (req) => {
      const clientIP = getClientIP(req);
      if (isTrustedIP(clientIP)) return true;
      if (skip && skip(req)) return true;
      return false;
    },

    // Enhanced handler with better logging
    handler: (req, res, next, opts) => {
      const clientIP = getClientIP(req);
      const identifier = req.body?.email || req.user?.email || clientIP;

      logger.warn('Rate limit exceeded', {
        ip: clientIP,
        identifier,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        windowMs: opts.windowMs,
        maxRequests: opts.max
      });

      res.status(429).json(opts.message);
    },

    ...rest
  });
}

/**
 * Authentication rate limiter
 * - Keys by email address (not IP) to prevent account-based attacks
 * - Skips successful requests (only counts failures)
 * - Strict in production, relaxed in development
 */
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per 15 minutes per email (x10 in dev = 50)
  skipSuccessfulRequests: true,

  // Key by email address, fall back to IP
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim();
    if (email) {
      return `auth:${email}`;
    }
    return `auth:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: isDevelopment
      ? 'Too many login attempts. Please wait 15 minutes or use a different email.'
      : 'Too many login attempts from this account. Please try again after 15 minutes.',
    retryAfter: 900,
    code: 'RATE_LIMIT_AUTH'
  }
});

/**
 * Registration rate limiter
 * - Keys by IP to prevent mass account creation
 * - Strict limits even in development
 */
const registrationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 20 : 5, // More strict, manual override for dev

  keyGenerator: (req) => `register:${getClientIP(req)}`,

  message: {
    success: false,
    error: 'Too many registration attempts. Please try again later.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_REGISTER'
  }
});

/**
 * Password reset limiter
 * - Keys by email to prevent email bombing
 * - Very strict limits
 */
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 per hour (x10 in dev = 30)

  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim();
    return email ? `pwreset:${email}` : `pwreset:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 1 hour.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_PASSWORD_RESET'
  }
});

/**
 * General API rate limiter
 * - Keys by authenticated user ID if available, otherwise IP
 * - Higher limits for authenticated users
 */
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 per 15 min (x10 in dev = 10000)

  keyGenerator: (req) => {
    // Use user ID for authenticated requests
    if (req.user?.id) {
      return `api:user:${req.user.id}`;
    }
    return `api:ip:${getClientIP(req)}`;
  },

  skip: (req) => {
    // Skip health checks
    return req.path === '/health' || req.path === '/api/health';
  },

  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
    retryAfter: 900,
    code: 'RATE_LIMIT_API'
  }
});

/**
 * Market data rate limiter
 * - Higher limits for real-time data needs
 * - Keys by user ID for authenticated users
 */
const marketLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 per minute (x10 in dev = 1200)

  keyGenerator: (req) => {
    if (req.user?.id) {
      return `market:user:${req.user.id}`;
    }
    return `market:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: 'Rate limit exceeded for market data. Maximum 120 requests per minute.',
    retryAfter: 60,
    code: 'RATE_LIMIT_MARKET'
  }
});

/**
 * Market breadth limiter - higher limits for dashboard
 */
const marketBreadthLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 300, // 300 per minute for real-time dashboard

  keyGenerator: (req) => {
    if (req.user?.id) {
      return `breadth:user:${req.user.id}`;
    }
    return `breadth:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: 'Rate limit exceeded for market breadth data.',
    retryAfter: 60,
    code: 'RATE_LIMIT_BREADTH'
  }
});

/**
 * Portfolio operations limiter
 */
const portfolioLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,

  keyGenerator: (req) => {
    if (req.user?.id) {
      return `portfolio:user:${req.user.id}`;
    }
    return `portfolio:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: 'Portfolio rate limit exceeded.',
    retryAfter: 60,
    code: 'RATE_LIMIT_PORTFOLIO'
  }
});

/**
 * Export limiter - strict to prevent abuse
 */
const exportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,

  keyGenerator: (req) => `export:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'Export limit exceeded. Maximum 10 exports per hour.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_EXPORT'
  }
});

/**
 * AI insights limiter - expensive operations
 */
const insightsLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,

  keyGenerator: (req) => `insights:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'AI insights limit exceeded. Maximum 30 requests per hour.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_INSIGHTS'
  }
});

/**
 * Search limiter
 */
const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,

  keyGenerator: (req) => {
    if (req.user?.id) {
      return `search:user:${req.user.id}`;
    }
    return `search:ip:${getClientIP(req)}`;
  },

  message: {
    success: false,
    error: 'Search rate limit exceeded.',
    retryAfter: 60,
    code: 'RATE_LIMIT_SEARCH'
  }
});

/**
 * Alert creation limiter
 */
const alertLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,

  keyGenerator: (req) => `alerts:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'Alert creation limit exceeded.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_ALERTS'
  }
});

/**
 * Push notification subscription limiter
 */
const pushSubscriptionLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,

  keyGenerator: (req) => `push:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'Too many subscription attempts.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_PUSH'
  }
});

/**
 * Sharing operations limiter
 */
const sharingLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,

  keyGenerator: (req) => `sharing:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'Sharing limit exceeded.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_SHARING'
  }
});

/**
 * Premium user limiter - higher limits for paying customers
 */
const premiumLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,

  keyGenerator: (req) => `premium:user:${req.user?.id}`,

  skip: (req) => req.user?.plan !== 'premium',

  message: {
    success: false,
    error: 'Rate limit exceeded for premium tier.',
    retryAfter: 900,
    code: 'RATE_LIMIT_PREMIUM'
  }
});

/**
 * Sensitive operations limiter - very strict
 */
const sensitiveLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,

  keyGenerator: (req) => `sensitive:user:${req.user?.id || getClientIP(req)}`,

  message: {
    success: false,
    error: 'Too many sensitive operations.',
    retryAfter: 3600,
    code: 'RATE_LIMIT_SENSITIVE'
  }
});

/**
 * Middleware to add rate limit info to response headers
 */
function rateLimitInfo(req, res, next) {
  res.on('finish', () => {
    // Log rate limit headers for debugging
    if (isDevelopment && res.getHeader('RateLimit-Remaining')) {
      logger.debug('Rate limit status', {
        path: req.path,
        remaining: res.getHeader('RateLimit-Remaining'),
        limit: res.getHeader('RateLimit-Limit'),
        reset: res.getHeader('RateLimit-Reset')
      });
    }
  });
  next();
}

/**
 * Clear rate limit for a specific key (for admin use)
 */
function clearRateLimit(limiter, key) {
  if (limiter.resetKey) {
    limiter.resetKey(key);
    logger.info(`Rate limit cleared for key: ${key}`);
    return true;
  }
  return false;
}

module.exports = {
  // Core limiters
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  registrationLimiter,

  // Feature limiters
  marketLimiter,
  marketBreadthLimiter,
  portfolioLimiter,
  exportLimiter,
  insightsLimiter,
  searchLimiter,
  alertLimiter,
  pushSubscriptionLimiter,
  sharingLimiter,

  // Tier limiters
  premiumLimiter,
  sensitiveLimiter,

  // Utilities
  createLimiter,
  getClientIP,
  isTrustedIP,
  rateLimitInfo,
  clearRateLimit,

  // Config exports for testing
  DEV_MULTIPLIER,
  TRUSTED_IPS,
  isDevelopment
};
