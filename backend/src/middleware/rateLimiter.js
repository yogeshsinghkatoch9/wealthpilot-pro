/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 * Implements per-endpoint rate limits as per security requirements
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Helper to create rate limiters with consistent options
function createLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded: ${req.ip} on ${req.path}`);
      res.status(429).json(options.message);
    },
    ...options
  });
}

// General API rate limiter - 1000 requests per 15 minutes per IP
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  skip: (req) => {
    return req.path === '/health' || req.path === '/api/health';
  }
});

// Strict rate limiter for authentication endpoints - 5 attempts per 15 minutes
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many login attempts from this IP, please try again after 15 minutes.',
    retryAfter: 900
  }
});

// Password reset limiter - 3 attempts per hour
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 1 hour.',
    retryAfter: 3600
  }
});

// Registration limiter - 5 registrations per hour per IP
const registrationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many registration attempts from this IP. Please try again later.',
    retryAfter: 3600
  }
});

// Moderate rate limiter for market data - 120 requests per minute
const marketLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: {
    success: false,
    error: 'Rate limit exceeded for market data. Maximum 120 requests per minute.',
    retryAfter: 60
  }
});

// Market breadth specific limiter - 300 requests per minute (for real-time dashboard)
const marketBreadthLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    success: false,
    error: 'Rate limit exceeded for market breadth. Maximum 300 requests per minute.',
    retryAfter: 60
  }
});

// Export endpoints - 10 exports per hour
const exportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Export limit exceeded. Maximum 10 exports per hour.',
    retryAfter: 3600
  }
});

// AI insights endpoints - 30 requests per hour
const insightsLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'AI insights limit exceeded. Maximum 30 requests per hour.',
    retryAfter: 3600
  }
});

// Search endpoints - 60 requests per minute
const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    success: false,
    error: 'Search rate limit exceeded. Maximum 60 searches per minute.',
    retryAfter: 60
  }
});

// Portfolio operations - 100 requests per minute
const portfolioLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Portfolio rate limit exceeded. Maximum 100 requests per minute.',
    retryAfter: 60
  }
});

// Alert creation - 20 per hour
const alertLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Alert creation limit exceeded. Maximum 20 alerts per hour.',
    retryAfter: 3600
  }
});

// Push notification subscription - 10 per hour
const pushSubscriptionLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many subscription attempts. Please try again later.',
    retryAfter: 3600
  }
});

// Sharing operations - 20 per hour
const sharingLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Sharing limit exceeded. Maximum 20 share operations per hour.',
    retryAfter: 3600
  }
});

// Premium user limiter - higher limits
const premiumLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: {
    success: false,
    error: 'Rate limit exceeded for premium tier.',
    retryAfter: 900
  },
  skip: (req) => req.user?.plan !== 'premium'
});

// Strict limiter for sensitive operations - 10 per hour
const sensitiveLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many sensitive operations. Please try again later.',
    retryAfter: 3600
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  registrationLimiter,
  marketLimiter,
  marketBreadthLimiter,
  exportLimiter,
  insightsLimiter,
  searchLimiter,
  portfolioLimiter,
  alertLimiter,
  pushSubscriptionLimiter,
  sharingLimiter,
  premiumLimiter,
  sensitiveLimiter,
  createLimiter
};
