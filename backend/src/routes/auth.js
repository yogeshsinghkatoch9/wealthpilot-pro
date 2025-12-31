const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');

// JWT_SECRET - MUST be set (no insecure fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const router = express.Router();

// Strict rate limiting for auth endpoints to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for auth from IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many authentication attempts. Please try again in 15 minutes.' });
  }
});

// Apply rate limiter to login and register
router.use('/login', authLimiter);
router.use('/register', authLimiter);

// Generate secure verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

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

    // Mark user as verified (email verification disabled)
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true }
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'Registration successful! You can now login.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
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

    // Generate unique session ID to prevent token collisions
    const sessionId = uuidv4();

    // Create session token with unique identifier
    const token = jwt.sign(
      { userId: user.id, email: user.email, sessionId },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Delete any existing sessions with duplicate tokens (shouldn't happen with sessionId)
    await prisma.session.deleteMany({
      where: { token }
    }).catch(() => {});

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
      httpOnly: true, // Secure: prevent XSS from stealing tokens
      secure: process.env.NODE_ENV === 'production', // Use secure in production (HTTPS)
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
    }).catch(() => {});

    // Generate unique session ID for new token
    const sessionId = uuidv4();

    // Create new token with unique identifier
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email, sessionId },
      JWT_SECRET,
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

/**
 * GET /api/auth/verify-email
 * Verify email with token
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find verification token
    const verificationRecord = await prisma.verificationToken.findUnique({
      where: { token }
    });

    if (!verificationRecord) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    // Check if token is expired
    if (new Date() > verificationRecord.expiresAt) {
      // Delete expired token
      await prisma.verificationToken.delete({
        where: { id: verificationRecord.id }
      });
      return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
    }

    // Find and update user
    const user = await prisma.user.findUnique({
      where: { email: verificationRecord.email }
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      // Delete token since already verified
      await prisma.verificationToken.delete({
        where: { id: verificationRecord.id }
      });
      return res.json({ message: 'Email already verified. You can now login.' });
    }

    // Update user to verified
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true }
    });

    // Delete the verification token
    await prisma.verificationToken.delete({
      where: { id: verificationRecord.id }
    });

    // Send welcome email
    try {
      await emailService.send({
        to: user.email,
        subject: 'Welcome to WealthPilot Pro!',
        template: 'welcome',
        data: {
          name: user.firstName || user.email.split('@')[0],
          loginUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
        }
      });
    } catch (emailErr) {
      logger.warn('Failed to send welcome email:', emailErr.message);
    }

    logger.info(`Email verified for user: ${user.email}`);

    res.json({
      message: 'Email verified successfully! You can now login.',
      verified: true
    });
  } catch (err) {
    logger.error('Email verification error:', err);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists with this email, a verification link will be sent.' });
    }

    if (user.isVerified) {
      return res.json({ message: 'Email is already verified. You can login.' });
    }

    // Delete any existing verification tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { email }
    });

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);

    await prisma.verificationToken.create({
      data: {
        email,
        token: verificationToken,
        type: 'email_verification',
        expiresAt: tokenExpiresAt
      }
    });

    // Send verification email
    const baseUrl = process.env.FRONTEND_URL || `http://${req.get('host')}`;
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    try {
      await emailService.send({
        to: email,
        subject: 'Verify Your Email - WealthPilot Pro',
        template: 'emailVerification',
        data: {
          name: user.firstName || email.split('@')[0],
          verificationUrl,
          expiresIn: '24 hours'
        }
      });
      logger.info(`Verification email resent to: ${email}`);
    } catch (emailErr) {
      logger.error('Failed to resend verification email:', emailErr);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification email sent! Please check your inbox.' });
  } catch (err) {
    logger.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

module.exports = router;
