/**
 * Global Error Handler Middleware
 * Sanitizes errors and prevents sensitive data leakage
 */

const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  // Log full error details server-side
  logger.error('Error occurred:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Prepare error response
  const errorResponse = {
    success: false,
    error: sanitizeErrorMessage(err, statusCode),
    timestamp: new Date().toISOString()
  };

  // Add error code if available
  if (err.code) {
    errorResponse.code = err.code;
  }

  // Include stack trace only in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Sanitize error message to prevent sensitive data leakage
 * @param {Error} err - Error object
 * @param {number} statusCode - HTTP status code
 * @returns {string} - Sanitized error message
 */
function sanitizeErrorMessage(err, statusCode) {
  // In production, use generic messages for server errors
  if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
    return 'An internal server error occurred. Please try again later.';
  }

  // Sanitize database errors
  if (err.message && err.message.includes('SQLITE_')) {
    return 'A database error occurred. Please try again.';
  }

  // Sanitize file system errors
  if (err.message && err.message.includes('ENOENT')) {
    return 'The requested resource was not found.';
  }

  // Remove sensitive paths from error messages
  let message = err.message || 'An error occurred';
  message = message.replace(/\/Users\/[^\/]+/g, '[PATH]');
  message = message.replace(/\/home\/[^\/]+/g, '[PATH]');
  message = message.replace(/C:\\Users\\[^\\]+/g, '[PATH]');

  // Remove potential email addresses
  message = message.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');

  // Remove potential API keys
  message = message.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');

  return message;
}

/**
 * Not Found (404) handler
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
function notFoundHandler(req, res) {
  logger.warn('404 Not Found:', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: 'The requested resource was not found',
    path: req.path
  });
}

/**
 * Async error wrapper for route handlers
 * @param {function} fn - Async route handler
 * @returns {function} - Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
