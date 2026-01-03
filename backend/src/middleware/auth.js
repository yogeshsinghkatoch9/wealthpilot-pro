const jwt = require('jsonwebtoken');
const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

// JWT_SECRET - MUST be set in production (no insecure fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production environment');
  }
  logger.warn('WARNING: JWT_SECRET not set. Set JWT_SECRET in .env for production!');
}
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 * Uses Prisma for database access (matches auth routes)
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.info('[Auth] No authorization header or invalid format');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    logger.info('[Auth] Token received (first 30 chars):', token.substring(0, 30) + '...');

    // Verify JWT token first
    const decoded = jwt.verify(token, JWT_SECRET);
    logger.info('[Auth] Token verified, user ID:', decoded.userId);

    // Check if session exists and is valid using Prisma
    const session = await prisma.session.findFirst({
      where: { token },
      include: { user: true }
    });

    if (!session) {
      logger.warn('[Auth] Session not found in database for token');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if session expired
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Check if user relation was loaded
    if (!session.user) {
      logger.error('[Auth] Session found but user relation not loaded. Session:', JSON.stringify(session));
      return res.status(500).json({ error: 'User data not found for session' });
    }

    // Attach user to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      plan: session.user.plan || 'free',
      theme: session.user.settings?.theme || 'dark',
      currency: session.user.settings?.currency || 'USD',
      timezone: session.user.settings?.timezone || 'America/New_York'
    };
    req.session = {
      id: session.id,
      token: session.token,
      expiresAt: session.expiresAt
    };

    next();
  } catch (err) {
    logger.error('[Auth] Error during authentication:', {
      name: err.name,
      message: err.message,
      url: req.originalUrl,
      method: req.method
    });
    if (err.name === 'JsonWebTokenError') {
      logger.warn('[Auth] JWT Error - Invalid token format or signature');
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      logger.warn('[Auth] JWT Error - Token has expired');
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.error('Auth middleware error:', err.message, err.stack);
    return res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const session = await prisma.session.findFirst({
      where: { token },
      include: { user: true }
    });

    if (session && new Date(session.expiresAt) > new Date()) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        plan: session.user.plan || 'free',
        theme: session.user.settings?.theme || 'dark',
        currency: session.user.settings?.currency || 'USD',
        timezone: session.user.settings?.timezone || 'America/New_York'
      };
      req.session = {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt
      };
    }

    next();
  } catch (err) {
    // Silently continue without auth
    next();
  }
};

/**
 * Check if user has specific plan level
 */
const requirePlan = (...plans) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({ 
        error: 'Upgrade required',
        requiredPlan: plans[0]
      });
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  requirePlan
};
