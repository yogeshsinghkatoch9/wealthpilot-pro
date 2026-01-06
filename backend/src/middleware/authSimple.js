const jwt = require('jsonwebtoken');
// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const logger = require('../utils/logger');

// JWT_SECRET - MUST be set (no insecure fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Simple authentication middleware using direct SQL
 * Works with existing SQLite database without Prisma
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if session exists and is valid in database
    const session = db.prepare(`
      SELECT s.*, u.email, u.first_name, u.last_name, u.plan, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if session has expired
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if user is active
    if (!session.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Attach user info to request
    req.user = {
      id: session.user_id,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name,
      plan: session.plan,
      isActive: session.is_active
    };

    req.session = {
      id: session.id,
      token: session.token,
      expiresAt: session.expires_at
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
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

    const session = db.prepare(`
      SELECT s.*, u.email, u.first_name, u.last_name, u.plan, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token);

    if (session) {
      const expiresAt = new Date(session.expires_at);
      if (expiresAt > new Date() && session.is_active) {
        req.user = {
          id: session.user_id,
          email: session.email,
          firstName: session.first_name,
          lastName: session.last_name,
          plan: session.plan,
          isActive: session.is_active
        };
        req.session = {
          id: session.id,
          token: session.token,
          expiresAt: session.expires_at
        };
      }
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
