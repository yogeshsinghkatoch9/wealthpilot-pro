/**
 * Input Validation Middleware
 * Provides comprehensive validation for API endpoints using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Handle validation result
 * Returns 400 with validation errors if validation fails
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    logger.warn('Validation failed', {
      path: req.path,
      errors: formattedErrors.map(e => `${e.field}: ${e.message}`).join(', ')
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors
    });
  }

  next();
};

/**
 * Common validation schemas
 */
const schemas = {
  // Authentication
  login: [
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    handleValidation
  ],

  register: [
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/\d/)
      .withMessage('Password must contain at least one number'),
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be 1-50 characters'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be 1-50 characters'),
    handleValidation
  ],

  // Portfolio
  createPortfolio: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Portfolio name must be 1-100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be under 500 characters'),
    body('currency')
      .optional()
      .isIn(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'])
      .withMessage('Invalid currency code'),
    body('benchmark')
      .optional()
      .trim()
      .isLength({ max: 10 })
      .withMessage('Benchmark symbol must be under 10 characters'),
    body('cashBalance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cash balance must be a positive number'),
    handleValidation
  ],

  updatePortfolio: [
    param('id')
      .isUUID()
      .withMessage('Invalid portfolio ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Portfolio name must be 1-100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be under 500 characters'),
    handleValidation
  ],

  // Holdings
  createHolding: [
    body('portfolioId')
      .isUUID()
      .withMessage('Invalid portfolio ID'),
    body('symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .toUpperCase()
      .withMessage('Symbol must be 1-10 characters'),
    body('shares')
      .isFloat({ min: 0.0001 })
      .withMessage('Shares must be a positive number'),
    body('avgCost')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Average cost must be a positive number'),
    body('sector')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Sector must be under 50 characters'),
    handleValidation
  ],

  // Transactions
  createTransaction: [
    body('portfolioId')
      .isUUID()
      .withMessage('Invalid portfolio ID'),
    body('symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .toUpperCase()
      .withMessage('Symbol must be 1-10 characters'),
    body('type')
      .isIn(['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'interest'])
      .withMessage('Invalid transaction type'),
    body('shares')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Shares must be a positive number'),
    body('price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    body('amount')
      .optional()
      .isFloat()
      .withMessage('Amount must be a number'),
    body('fees')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Fees must be a positive number'),
    handleValidation
  ],

  // Alerts
  createAlert: [
    body('symbol')
      .optional()
      .trim()
      .isLength({ min: 1, max: 10 })
      .toUpperCase()
      .withMessage('Symbol must be 1-10 characters'),
    body('type')
      .isIn(['price_above', 'price_below', 'price_change', 'portfolio_value', 'portfolio_gain', 'portfolio_loss', 'dividend', 'earnings'])
      .withMessage('Invalid alert type'),
    body('condition')
      .isObject()
      .withMessage('Condition must be an object'),
    body('message')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Message must be under 200 characters'),
    handleValidation
  ],

  // Watchlist
  createWatchlist: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Watchlist name must be 1-50 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Description must be under 200 characters'),
    handleValidation
  ],

  addWatchlistItem: [
    body('symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .toUpperCase()
      .withMessage('Symbol must be 1-10 characters'),
    body('targetPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Target price must be a positive number'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must be under 500 characters'),
    handleValidation
  ],

  // Common parameter validations
  uuidParam: [
    param('id')
      .isUUID()
      .withMessage('Invalid ID format'),
    handleValidation
  ],

  symbolParam: [
    param('symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .toUpperCase()
      .withMessage('Invalid symbol format'),
    handleValidation
  ],

  // Pagination
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be 1-100'),
    query('sort')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort must be "asc" or "desc"'),
    handleValidation
  ]
};

/**
 * Custom validators
 */
const customValidators = {
  /**
   * Validate stock symbol format
   */
  isStockSymbol: (value) => {
    if (!value) return false;
    const symbolRegex = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
    return symbolRegex.test(value.toUpperCase());
  },

  /**
   * Validate date range
   */
  isValidDateRange: (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start <= end;
  },

  /**
   * Validate JSON string
   */
  isValidJSON: (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Create custom validation chain
 * @param {Array} validators - Array of express-validator chains
 * @returns {Array} - Validation middleware array
 */
const validate = (...validators) => {
  return [...validators, handleValidation];
};

/**
 * Validate request body against a schema
 * @param {string} schemaName - Name of the schema to use
 * @returns {Array} - Validation middleware array
 */
const validateSchema = (schemaName) => {
  if (!schemas[schemaName]) {
    logger.warn(`Validation schema "${schemaName}" not found`);
    return [handleValidation];
  }
  return schemas[schemaName];
};

module.exports = {
  // Middleware helpers
  handleValidation,
  validate,
  validateSchema,

  // Pre-built schemas
  schemas,

  // Custom validators
  customValidators,

  // Re-export express-validator for custom use
  body,
  param,
  query,
  validationResult
};
