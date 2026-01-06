const express = require('express');
const bcrypt = require('bcryptjs'); // Use pure JS version for cross-platform compatibility
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/settings
 * Get user settings and profile
 */
router.get('/', async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
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
        created_at: true,
        settings: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure settings exist
    let settings = user.settings;
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { user_id: req.user.id }
      });
    }

    res.json({
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        currency: user.currency,
        theme: user.theme,
        plan: user.plan,
        planExpiresAt: user.planExpiresAt,
        created_at: user.createdAt
      },
      preferences: settings
    });
  } catch (err) {
    logger.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/settings
 * Update user settings (preferences)
 */
router.put('/', [
  body('emailNotifications').optional().isBoolean(),
  body('pushNotifications').optional().isBoolean(),
  body('alertsEnabled').optional().isBoolean(),
  body('dividendAlerts').optional().isBoolean(),
  body('earningsAlerts').optional().isBoolean(),
  body('priceAlerts').optional().isBoolean(),
  body('weeklyReport').optional().isBoolean(),
  body('monthlyReport').optional().isBoolean(),
  body('defaultPortfolioId').optional().isString(),
  body('dashboardLayout').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const settings = await prisma.userSettings.upsert({
      where: { user_id: req.user.id },
      create: {
        user_id: req.user.id,
        ...req.body
      },
      update: req.body
    });

    res.json(settings);
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/settings/profile
 * Get user profile information
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
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
        created_at: true,
        lastLoginAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    logger.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/settings/profile
 * Update user profile
 */
router.put('/profile', [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
  body('phone').optional().trim(),
  body('timezone').optional().trim(),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR']),
  body('theme').optional().isIn(['light', 'dark', 'auto'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, timezone, currency, theme } = req.body;

    const user = await prisma.users.update({
      where: { id: req.user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
        ...(theme !== undefined && { theme })
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        timezone: true,
        currency: true,
        theme: true
      }
    });

    logger.info(`Profile updated: ${req.user.email}`);
    res.json(user);
  } catch (err) {
    logger.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * POST /api/settings/password
 * Change user password
 */
router.post('/password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current user with password
    const user = await prisma.users.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password with secure settings (12 rounds)
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.users.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash }
    });

    logger.info(`Password changed: ${req.user.email}`);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    logger.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * GET /api/settings/api-keys
 * Get user's API keys (not showing actual keys)
 */
router.get('/api-keys', async (req, res) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { user_id: req.user.id },
      select: {
        id: true,
        name: true,
        last_used_at: true,
        expires_at: true,
        is_active: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(apiKeys);
  } catch (err) {
    logger.error('Get API keys error:', err);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

/**
 * POST /api/settings/api-keys
 * Create a new API key
 */
router.post('/api-keys', [
  body('name').trim().notEmpty().withMessage('API key name is required').isLength({ max: 100 }),
  body('expiresIn').optional().isInt({ min: 1 }).withMessage('Expiration must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, expiresIn } = req.body;

    // Generate random API key
    const apiKey = 'wp_' + crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(apiKey, 10);

    // Calculate expiration date
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);
    }

    const newApiKey = await prisma.apiKey.create({
      data: {
        user_id: req.user.id,
        name,
        keyHash,
        expiresAt
      },
      select: {
        id: true,
        name: true,
        expires_at: true,
        created_at: true
      }
    });

    logger.info(`API key created: ${name} for user ${req.user.email}`);

    // Return the actual key only once
    res.json({
      ...newApiKey,
      apiKey, // Only shown once!
      message: 'API key created. Save it now - you won\'t be able to see it again!'
    });
  } catch (err) {
    logger.error('Create API key error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * PUT /api/settings/api-keys/:id
 * Update API key (activate/deactivate)
 */
router.put('/api-keys/:id', [
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { isActive } = req.body;

    // Verify ownership
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, user_id: req.user.id }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        is_active: true,
        last_used_at: true,
        expires_at: true,
        created_at: true
      }
    });

    logger.info(`API key ${isActive ? 'activated' : 'deactivated'}: ${apiKey.name}`);
    res.json(apiKey);
  } catch (err) {
    logger.error('Update API key error:', err);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

/**
 * DELETE /api/settings/api-keys/:id
 * Delete an API key
 */
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, user_id: req.user.id }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.delete({
      where: { id }
    });

    logger.info(`API key deleted: ${existingKey.name} for user ${req.user.email}`);
    res.json({ message: 'API key deleted successfully' });
  } catch (err) {
    logger.error('Delete API key error:', err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

/**
 * GET /api/settings/sessions
 * Get active sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await prisma.sessions.findMany({
      where: {
        user_id: req.user.id,
        expires_at: { gt: new Date() }
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        created_at: true,
        expires_at: true
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(sessions);
  } catch (err) {
    logger.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * DELETE /api/settings/sessions/:id
 * Revoke a session
 */
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const session = await prisma.sessions.findFirst({
      where: { id, user_id: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await prisma.sessions.delete({
      where: { id }
    });

    logger.info(`Session revoked for user ${req.user.email}`);
    res.json({ message: 'Session revoked successfully' });
  } catch (err) {
    logger.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * DELETE /api/settings/account
 * Delete user account (WARNING: Irreversible!)
 */
router.delete('/account', [
  body('password').notEmpty().withMessage('Password is required to delete account'),
  body('confirmation').equals('DELETE').withMessage('Type DELETE to confirm')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;

    // Get user with password
    const user = await prisma.users.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Delete user (cascade will delete all related data)
    await prisma.users.delete({
      where: { id: req.user.id }
    });

    logger.info(`Account deleted: ${user.email}`);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    logger.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * POST /api/settings/export-data
 * Export all user data
 */
router.post('/export-data', async (req, res) => {
  try {
    // Gather all user data
    const [user, portfolios, transactions, watchlists, alerts] = await Promise.all([
      prisma.users.findUnique({
        where: { id: req.user.id },
        include: { settings: true }
      }),
      prisma.portfolios.findMany({
        where: { user_id: req.user.id },
        include: { holdings: true }
      }),
      prisma.transactions.findMany({
        where: { user_id: req.user.id }
      }),
      prisma.watchlist.findMany({
        where: { user_id: req.user.id },
        include: { items: true }
      }),
      prisma.alerts.findMany({
        where: { user_id: req.user.id }
      })
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        timezone: user.timezone,
        currency: user.currency,
        created_at: user.createdAt,
        settings: user.settings
      },
      portfolios,
      transactions,
      watchlists,
      alerts
    };

    logger.info(`Data exported for user ${req.user.email}`);
    res.json(exportData);
  } catch (err) {
    logger.error('Export data error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * POST /api/settings/onboarding
 * Save onboarding preferences
 */
router.post('/onboarding', async (req, res) => {
  try {
    const { goal, riskTolerance, importChoice, alerts } = req.body;
    const userId = req.user.id;

    // Update user preferences - using simple JSON storage
    const prefsResult = await db.query(
      `UPDATE users SET
        preferences = COALESCE(preferences, '{}'::jsonb) ||
        jsonb_build_object(
          'investment_goal', $1::text,
          'risk_tolerance', $2::text,
          'onboarding_completed', true
        ),
        updated_at = NOW()
       WHERE id = $3
       RETURNING preferences`,
      [goal, riskTolerance, userId]
    );

    res.json({
      success: true,
      message: 'Onboarding preferences saved',
      data: { goal, riskTolerance, alerts }
    });
  } catch (error) {
    logger.error('Save onboarding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save onboarding preferences'
    });
  }
});

/**
 * GET /api/settings/onboarding
 * Get onboarding status
 */
router.get('/onboarding', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, completed: false });
    }

    const prefs = result.rows[0].preferences || {};

    res.json({
      success: true,
      completed: prefs.onboarding_completed || false,
      goal: prefs.investment_goal,
      riskTolerance: prefs.risk_tolerance
    });
  } catch (error) {
    logger.error('Get onboarding status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding status'
    });
  }
});

module.exports = router;
