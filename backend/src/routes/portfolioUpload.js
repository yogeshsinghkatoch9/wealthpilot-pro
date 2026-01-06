const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const portfolioUploadService = require('../services/portfolioUploadService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Log when this route module is loaded
logger.info('Portfolio Upload routes module loaded successfully');

/**
 * GET /api/portfolio-upload/test
 * Simple test endpoint to verify route is mounted
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Portfolio upload route is working',
    timestamp: new Date().toISOString()
  });
});

// Use memory storage for Railway compatibility (ephemeral filesystem)
// Files are processed directly from buffer instead of disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.csv', '.xlsx', '.xls', '.json'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV, XLSX, and JSON files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * POST /api/portfolio-upload/upload
 * Upload portfolio file (CSV, Excel, or JSON)
 */
router.post('/upload', authenticate, upload.single('portfolio'), async (req, res) => {
  try {
    logger.info('Upload request received:', {
      hasFile: !!req.file,
      body: req.body,
      userId: req.user?.id,
      bufferSize: req.file?.buffer?.length || 0
    });

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { portfolioName, portfolioId } = req.body;
    const userId = req.user.id;
    const fileBuffer = req.file.buffer;
    const fileFormat = path.extname(req.file.originalname).substring(1).toLowerCase();
    const originalFilename = req.file.originalname;

    logger.info(`Processing upload for user ${userId}: ${originalFilename}`, {
      portfolioName,
      portfolioId,
      fileFormat,
      fileSize: req.file.size
    });

    // Create upload record
    const uploadId = portfolioUploadService.createUploadRecord(
      userId,
      originalFilename,
      fileFormat
    );

    // Process upload asynchronously using buffer
    portfolioUploadService.processUploadFromBuffer(
      uploadId,
      userId,
      fileBuffer,
      fileFormat,
      portfolioName,
      portfolioId
    )
      .then(result => {
        logger.info(`Upload ${uploadId} completed successfully`, result);
      })
      .catch(error => {
        logger.error(`Upload ${uploadId} failed:`, error);
      });

    // Return immediate response
    res.json({
      success: true,
      message: 'Portfolio upload started',
      uploadId,
      status: 'processing'
    });

  } catch (error) {
    logger.error('Error handling upload:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });

    // Handle multer errors
    if (error.name === 'MulterError') {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size exceeds 10MB limit'
        });
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          error: 'Unexpected file field. Use "portfolio" field name.'
        });
      }
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/portfolio-upload/status/:uploadId
 * Get upload status
 */
router.get('/status/:uploadId', authenticate, (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = portfolioUploadService.getUpload(uploadId);

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    // Verify ownership
    if (upload.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      upload: {
        id: upload.id,
        status: upload.status,
        filename: upload.original_filename,
        fileFormat: upload.file_format,
        uploadDate: upload.upload_date,
        portfolio_id: upload.portfolio_id,
        portfolioName: upload.portfolio_name,
        totalHoldings: upload.total_holdings,
        totalValue: upload.total_value,
        errorMessage: upload.error_message,
        metadata: upload.metadata
      }
    });
  } catch (error) {
    logger.error('Error getting upload status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/portfolio-upload/history
 * Get upload history for current user
 */
router.get('/history', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const uploads = portfolioUploadService.getUserUploads(userId, limit);

    res.json({
      success: true,
      uploads: uploads.map(u => ({
        id: u.id,
        filename: u.original_filename,
        fileFormat: u.file_format,
        uploadDate: u.upload_date,
        status: u.status,
        portfolio_id: u.portfolio_id,
        portfolioName: u.portfolio_name,
        totalHoldings: u.total_holdings,
        totalValue: u.total_value,
        errorMessage: u.error_message
      }))
    });
  } catch (error) {
    logger.error('Error getting upload history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/portfolio-upload/update-prices/:portfolioId
 * Update historical portfolio with current market prices
 */
router.post('/update-prices/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const userId = req.user.id;

    // Verify portfolio ownership
    const db = require('../db/sqliteCompat');
    const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
    

    const portfolio = db.prepare('SELECT user_id FROM portfolios WHERE id = ?').get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    if (portfolio.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    logger.info(`Updating prices for portfolio ${portfolioId}`);

    const result = await portfolioUploadService.updateHistoricalPortfolio(portfolioId);

    res.json({
      success: true,
      message: 'Portfolio prices updated successfully',
      ...result
    });

  } catch (error) {
    logger.error('Error updating portfolio prices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/portfolio-upload/snapshot/:portfolioId
 * Create manual snapshot for portfolio
 */
router.post('/snapshot/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const userId = req.user.id;

    // Verify portfolio ownership
    const db = require('../db/sqliteCompat');
    const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
    

    const portfolio = db.prepare('SELECT user_id FROM portfolios WHERE id = ?').get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    if (portfolio.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    await portfolioUploadService.createPortfolioSnapshot(portfolioId);

    res.json({
      success: true,
      message: 'Snapshot created successfully'
    });

  } catch (error) {
    logger.error('Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/portfolio-upload/snapshots/:portfolioId
 * Get historical snapshots for portfolio
 */
router.get('/snapshots/:portfolioId', authenticate, (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 365;

    // Verify portfolio ownership
    const db = require('../db/sqliteCompat');
    const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
    

    const portfolio = db.prepare('SELECT user_id FROM portfolios WHERE id = ?').get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    if (portfolio.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const snapshots = db.prepare(`
      SELECT
        id, portfolio_id, snapshot_date, total_value, total_cost,
        total_gain, total_gain_pct, holdings_count, created_at
      FROM portfolio_snapshots_history
      WHERE portfolio_id = ?
      ORDER BY snapshot_date DESC
      LIMIT ?
    `).all(portfolioId, limit);

    res.json({
      success: true,
      snapshots
    });

  } catch (error) {
    logger.error('Error getting snapshots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/portfolio-upload/:uploadId
 * Delete upload record (does not delete portfolio)
 */
router.delete('/:uploadId', authenticate, (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user.id;

    const upload = portfolioUploadService.getUpload(uploadId);

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    if (upload.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const db = require('../db/sqliteCompat');
    const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
    

    db.prepare('DELETE FROM uploaded_portfolios WHERE id = ?').run(uploadId);

    res.json({
      success: true,
      message: 'Upload record deleted'
    });

  } catch (error) {
    logger.error('Error deleting upload:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
