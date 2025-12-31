/**
 * Backup Management API Routes
 * Admin endpoints for database backup operations
 */

const express = require('express');
const router = express.Router();
const backupService = require('../services/aws/backupService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// All backup routes require authentication
router.use(authenticate);

// Admin check middleware
const requireAdmin = (req, res, next) => {
  // Check if user has admin role or is the system admin
  if (req.user.role !== 'admin' && req.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

/**
 * @route GET /api/backup/status
 * @desc Get backup service status
 */
router.get('/status', requireAdmin, (req, res) => {
  try {
    const status = backupService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('[BackupAPI] Status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get backup status'
    });
  }
});

/**
 * @route GET /api/backup/list
 * @desc List all available backups
 */
router.get('/list', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const backups = await backupService.listBackups(limit);

    res.json({
      success: true,
      data: {
        count: backups.length,
        backups
      }
    });
  } catch (error) {
    logger.error('[BackupAPI] List backups failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list backups'
    });
  }
});

/**
 * @route GET /api/backup/history
 * @desc Get backup operation history
 */
router.get('/history', requireAdmin, async (req, res) => {
  try {
    const history = await backupService.getBackupHistory();

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('[BackupAPI] Get history failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get backup history'
    });
  }
});

/**
 * @route POST /api/backup/create
 * @desc Create a new database backup
 */
router.post('/create', requireAdmin, async (req, res) => {
  try {
    const { type = 'full' } = req.body;

    if (!['full', 'schema', 'data'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid backup type. Must be: full, schema, or data'
      });
    }

    logger.info(`[BackupAPI] Creating ${type} backup requested by ${req.user.email}`);

    const result = await backupService.createBackup(type);

    res.json({
      success: true,
      message: 'Backup created successfully',
      data: result
    });
  } catch (error) {
    logger.error('[BackupAPI] Create backup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create backup',
      message: error.message
    });
  }
});

/**
 * @route POST /api/backup/restore
 * @desc Restore database from a backup
 * DANGEROUS: This will overwrite the current database
 */
router.post('/restore', requireAdmin, async (req, res) => {
  try {
    const { filename, location = 'local', confirm } = req.body;

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Backup filename is required'
      });
    }

    if (confirm !== 'I understand this will overwrite the database') {
      return res.status(400).json({
        success: false,
        error: 'Please confirm by setting confirm to: "I understand this will overwrite the database"'
      });
    }

    logger.warn(`[BackupAPI] Database restore initiated by ${req.user.email} from ${filename}`);

    const result = await backupService.restoreBackup(filename, location);

    res.json({
      success: true,
      message: 'Database restored successfully',
      data: result
    });
  } catch (error) {
    logger.error('[BackupAPI] Restore failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restore backup',
      message: error.message
    });
  }
});

/**
 * @route POST /api/backup/cleanup
 * @desc Clean up old backups based on retention policy
 */
router.post('/cleanup', requireAdmin, async (req, res) => {
  try {
    logger.info(`[BackupAPI] Cleanup requested by ${req.user.email}`);

    const result = await backupService.cleanupOldBackups();

    res.json({
      success: true,
      message: 'Cleanup completed',
      data: {
        deletedLocal: result.local,
        deletedS3: result.s3
      }
    });
  } catch (error) {
    logger.error('[BackupAPI] Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup backups'
    });
  }
});

/**
 * @route POST /api/backup/schedule
 * @desc Configure automated backup schedule
 */
router.post('/schedule', requireAdmin, (req, res) => {
  try {
    const { schedule, enabled = true } = req.body;

    if (enabled) {
      // Default: daily at 2 AM
      const cronSchedule = schedule || '0 2 * * *';
      backupService.scheduleBackups(cronSchedule);

      res.json({
        success: true,
        message: 'Backup schedule configured',
        data: { schedule: cronSchedule, enabled: true }
      });
    } else {
      backupService.stopScheduledBackups();

      res.json({
        success: true,
        message: 'Scheduled backups disabled',
        data: { enabled: false }
      });
    }
  } catch (error) {
    logger.error('[BackupAPI] Schedule configuration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to configure backup schedule'
    });
  }
});

module.exports = router;
