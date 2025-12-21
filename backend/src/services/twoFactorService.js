/**
 * Two-Factor Authentication Service
 * Implements TOTP (Time-based One-Time Password) for enhanced security
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../utils/logger');

class TwoFactorService {
  constructor() {
    this.appName = 'WealthPilot Pro';
    this.backupCodesCount = 10;
  }

  /**
   * Generate a new 2FA secret for a user
   * @param {string} email - User's email for the authenticator app label
   * @returns {Object} Secret object with base32 key and otpauth URL
   */
  generateSecret(email) {
    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${email})`,
      issuer: this.appName,
      length: 32
    });

    logger.info(`2FA secret generated for user: ${email}`);

    return {
      base32: secret.base32,
      otpauthUrl: secret.otpauth_url,
      ascii: secret.ascii
    };
  }

  /**
   * Generate QR code as data URL for authenticator app setup
   * @param {string} otpauthUrl - The otpauth URL from generateSecret
   * @returns {Promise<string>} Data URL of the QR code
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        margin: 2,
        width: 256,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      return qrDataUrl;
    } catch (err) {
      logger.error('Error generating QR code:', err);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Verify a TOTP token
   * @param {string} secret - The user's base32 secret
   * @param {string} token - The 6-digit token to verify
   * @param {number} window - Time window for token validation (default: 1)
   * @returns {boolean} Whether the token is valid
   */
  verifyToken(secret, token, window = 1) {
    try {
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: token.toString().replace(/\s/g, ''),
        window
      });

      if (verified) {
        logger.debug('2FA token verified successfully');
      } else {
        logger.warn('2FA token verification failed');
      }

      return verified;
    } catch (err) {
      logger.error('Error verifying 2FA token:', err);
      return false;
    }
  }

  /**
   * Generate backup codes for account recovery
   * @returns {Object} Array of codes and their hashed versions
   */
  generateBackupCodes() {
    const codes = [];
    const hashedCodes = [];

    for (let i = 0; i < this.backupCodesCount; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;

      codes.push(formattedCode);
      hashedCodes.push(this.hashBackupCode(formattedCode));
    }

    logger.info(`Generated ${this.backupCodesCount} backup codes`);

    return {
      plainCodes: codes, // Show to user once
      hashedCodes: hashedCodes // Store in database
    };
  }

  /**
   * Hash a backup code for storage
   * @param {string} code - Plain backup code
   * @returns {string} Hashed code
   */
  hashBackupCode(code) {
    return crypto
      .createHash('sha256')
      .update(code.replace(/-/g, '').toUpperCase())
      .digest('hex');
  }

  /**
   * Verify a backup code
   * @param {string} code - The backup code to verify
   * @param {Array<string>} hashedCodes - Array of hashed backup codes
   * @returns {number} Index of matched code, or -1 if not found
   */
  verifyBackupCode(code, hashedCodes) {
    const hashedInput = this.hashBackupCode(code);

    for (let i = 0; i < hashedCodes.length; i++) {
      if (hashedCodes[i] === hashedInput) {
        logger.info('Backup code verified successfully');
        return i;
      }
    }

    logger.warn('Backup code verification failed');
    return -1;
  }

  /**
   * Generate current TOTP for testing (development only)
   * @param {string} secret - The base32 secret
   * @returns {string} Current TOTP code
   */
  generateCurrentToken(secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Token generation not allowed in production');
    }

    return speakeasy.totp({
      secret,
      encoding: 'base32'
    });
  }
}

// Export singleton instance
const twoFactorService = new TwoFactorService();
module.exports = twoFactorService;
