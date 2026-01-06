const jwt = require('jsonwebtoken');
const Database = require('../db/database');
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

    let session;

    if (prisma) {
      // PostgreSQL mode - use Prisma (lowercase model names for production)
      session = await prisma.sessions.findFirst({
        where: { token },
        include: { users: true }
      });

      if (!session) {
        logger.warn('[Auth] Session not found in database for token');
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Check if session expired (handle both camelCase and snake_case)
      const expiresAt = session.expiresAt || session.expires_at;
      if (new Date(expiresAt) < new Date()) {
        return res.status(401).json({ error: 'Token expired' });
      }

      // Attach user to request (users relation from production schema)
      const user = session.users;
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.first_name || user.firstName,
        lastName: user.last_name || user.lastName,
        plan: user.plan || 'free',
        theme: 'dark',
        currency: 'USD',
        timezone: 'America/New_York'
      };
      req.session = {
        id: session.id,
        token: session.token,
        expiresAt: expiresAt
      };
    } else {
      // SQLite mode - use Database adapter
      session = Database.getSessionByToken(token);

      if (!session) {
        logger.warn('[Auth] Session not found in database for token');
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Check if session expired
      if (new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Token expired' });
      }

      // Attach user to request
      req.user = {
        id: session.user_id,
        email: session.email,
        firstName: session.first_name,
        lastName: session.last_name,
        plan: session.plan || 'free',
        theme: 'dark',
        currency: 'USD',
        timezone: 'America/New_York'
      };
      req.session = {
        id: session.id,
        token: session.token,
        expiresAt: session.expires_at
      };
    }

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

    const session = await prisma.sessions.findFirst({
      where: { token },
      include: { users: true }
    });

    const expiresAt = session?.expiresAt || session?.expires_at;
    if (session && new Date(expiresAt) > new Date()) {
      const user = session.users;
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.first_name || user.firstName,
        lastName: user.last_name || user.lastName,
        plan: user.plan || 'free',
        theme: 'dark',
        currency: 'USD',
        timezone: 'America/New_York'
      };
      req.session = {
        id: session.id,
        token: session.token,
        expiresAt: expiresAt
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
