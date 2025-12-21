const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').optional().trim().escape(),
  body('lastName').optional().trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user first
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
        createdAt: true
      }
    });

    // Create user settings separately (more reliable)
    await prisma.userSettings.create({
      data: {
        userId: user.id
      }
    }).catch(err => {
      logger.warn('Failed to create user settings:', err.message);
      // Non-critical, continue
    });

    // Create default portfolio
    await prisma.portfolio.create({
      data: {
        userId: user.id,
        name: 'My Portfolio',
        description: 'Default portfolio',
        isDefault: true
      }
    });

    // Create default watchlist
    await prisma.watchlist.create({
      data: {
        userId: user.id,
        name: 'My Watchlist',
        description: 'Default watchlist'
      }
    });

    // Create session
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip
      }
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      user,
      token,
      expiresAt
    });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip
      }
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    logger.info(`User logged in: ${email}`);

    // Set token as HTTP-only cookie for browser-based auth
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        theme: user.theme,
        currency: user.currency,
        timezone: user.timezone
      },
      token,
      expiresAt
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (invalidate session)
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await prisma.session.delete({
      where: { id: req.session.id }
    });

    logger.info(`User logged out: ${req.user.email}`);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh auth token
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    // Delete old session
    await prisma.session.delete({
      where: { id: req.session.id }
    });

    // Create new token
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        userId: req.user.id,
        token,
        expiresAt,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip
      }
    });

    res.json({ token, expiresAt });
  } catch (err) {
    logger.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        timezone: true,
        currency: true,
        theme: true,
        plan: true,
        planExpiresAt: true,
        isVerified: true,
        createdAt: true,
        settings: true
      }
    });

    res.json(user);
  } catch (err) {
    logger.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    // Invalidate all other sessions
    await prisma.session.deleteMany({
      where: {
        userId: req.user.id,
        NOT: { id: req.session.id }
      }
    });

    logger.info(`Password changed for user: ${req.user.email}`);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    logger.error('Password change error:', err);
    res.status(500).json({ error: 'Password change failed' });
  }
});

module.exports = router;
