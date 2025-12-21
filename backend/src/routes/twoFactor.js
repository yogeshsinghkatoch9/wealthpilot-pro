/**
 * Two-Factor Authentication Routes
 * Handles 2FA setup, verification, and management
 */

const express = require('express');
const router = express.Router();
const twoFactorService = require('../services/twoFactorService');
const Database = require('../db/database');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/2fa/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Initialize 2FA setup
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 2FA setup data including QR code
 */
router.post('/setup', async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if 2FA is already enabled
    const user = Database.getUserById(userId);
    if (user?.two_factor_enabled) {
      return res.status(400).json({
        error: '2FA is already enabled. Disable it first to set up again.'
      });
    }

    // Generate new secret
    const secret = twoFactorService.generateSecret(userEmail);

    // Generate QR code
    const qrCode = await twoFactorService.generateQRCode(secret.otpauthUrl);

    // Store temporary secret (not enabled until verified)
    Database.db.prepare(`
      UPDATE users SET two_factor_secret = ?, two_factor_pending = 1
      WHERE id = ?
    `).run(secret.base32, userId);

    res.json({
      message: 'Scan the QR code with your authenticator app',
      qrCode,
      manualEntryKey: secret.base32,
      instructions: [
        '1. Open your authenticator app (Google Authenticator, Authy, etc.)',
        '2. Scan the QR code or enter the key manually',
        '3. Enter the 6-digit code to verify setup'
      ]
    });
  } catch (err) {
    logger.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

/**
 * @swagger
 * /api/2fa/verify-setup:
 *   post:
 *     tags: [Auth]
 *     summary: Verify 2FA setup with initial token
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: "123456" }
 */
router.post('/verify-setup', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Get pending secret
    const user = Database.getUserById(userId);
    if (!user?.two_factor_secret || !user?.two_factor_pending) {
      return res.status(400).json({
        error: 'No pending 2FA setup. Please start setup first.'
      });
    }

    // Verify token
    const isValid = twoFactorService.verifyToken(user.two_factor_secret, token);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid token. Please try again.' });
    }

    // Generate backup codes
    const backupCodes = twoFactorService.generateBackupCodes();

    // Enable 2FA and store backup codes
    Database.db.prepare(`
      UPDATE users
      SET two_factor_enabled = 1,
          two_factor_pending = 0,
          backup_codes = ?
      WHERE id = ?
    `).run(JSON.stringify(backupCodes.hashedCodes), userId);

    logger.info(`2FA enabled for user: ${userId}`);

    res.json({
      message: '2FA has been successfully enabled',
      backupCodes: backupCodes.plainCodes,
      warning: 'Save these backup codes in a safe place. They will not be shown again!'
    });
  } catch (err) {
    logger.error('2FA verify-setup error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA setup' });
  }
});

/**
 * @swagger
 * /api/2fa/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify 2FA token during login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, token]
 *             properties:
 *               userId: { type: string }
 *               token: { type: string }
 */
router.post('/verify', async (req, res) => {
  try {
    const { userId, token, isBackupCode } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: 'User ID and token are required' });
    }

    const user = Database.getUserById(userId);
    if (!user?.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is not enabled for this user' });
    }

    let isValid = false;

    if (isBackupCode) {
      // Verify backup code
      const hashedCodes = JSON.parse(user.backup_codes || '[]');
      const codeIndex = twoFactorService.verifyBackupCode(token, hashedCodes);

      if (codeIndex >= 0) {
        // Remove used backup code
        hashedCodes.splice(codeIndex, 1);
        Database.db.prepare(`
          UPDATE users SET backup_codes = ? WHERE id = ?
        `).run(JSON.stringify(hashedCodes), userId);

        isValid = true;
        logger.info(`Backup code used for user: ${userId}. ${hashedCodes.length} codes remaining.`);
      }
    } else {
      // Verify TOTP
      isValid = twoFactorService.verifyToken(user.two_factor_secret, token);
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    res.json({
      verified: true,
      message: '2FA verification successful'
    });
  } catch (err) {
    logger.error('2FA verify error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

/**
 * @swagger
 * /api/2fa/disable:
 *   post:
 *     tags: [Auth]
 *     summary: Disable 2FA
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string }
 */
router.post('/disable', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    const user = Database.getUserById(userId);
    if (!user?.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify 2FA token
    const isValid = twoFactorService.verifyToken(user.two_factor_secret, token);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA token' });
    }

    // Disable 2FA
    Database.db.prepare(`
      UPDATE users
      SET two_factor_enabled = 0,
          two_factor_secret = NULL,
          two_factor_pending = 0,
          backup_codes = NULL
      WHERE id = ?
    `).run(userId);

    logger.info(`2FA disabled for user: ${userId}`);

    res.json({ message: '2FA has been disabled successfully' });
  } catch (err) {
    logger.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

/**
 * @swagger
 * /api/2fa/status:
 *   get:
 *     tags: [Auth]
 *     summary: Get 2FA status for current user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/status', (req, res) => {
  try {
    const userId = req.user.id;
    const user = Database.getUserById(userId);

    const backupCodes = user?.backup_codes ? JSON.parse(user.backup_codes) : [];

    res.json({
      enabled: !!user?.two_factor_enabled,
      pending: !!user?.two_factor_pending,
      backupCodesRemaining: backupCodes.length
    });
  } catch (err) {
    logger.error('2FA status error:', err);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

/**
 * @swagger
 * /api/2fa/regenerate-backup-codes:
 *   post:
 *     tags: [Auth]
 *     summary: Generate new backup codes
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 */
router.post('/regenerate-backup-codes', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = Database.getUserById(userId);
    if (!user?.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify token
    const isValid = twoFactorService.verifyToken(user.two_factor_secret, token);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA token' });
    }

    // Generate new backup codes
    const backupCodes = twoFactorService.generateBackupCodes();

    // Store new codes
    Database.db.prepare(`
      UPDATE users SET backup_codes = ? WHERE id = ?
    `).run(JSON.stringify(backupCodes.hashedCodes), userId);

    logger.info(`Backup codes regenerated for user: ${userId}`);

    res.json({
      message: 'New backup codes generated',
      backupCodes: backupCodes.plainCodes,
      warning: 'Previous backup codes are now invalid. Save these new codes!'
    });
  } catch (err) {
    logger.error('Regenerate backup codes error:', err);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

module.exports = router;
