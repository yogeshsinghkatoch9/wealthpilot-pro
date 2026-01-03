/**
 * Request Logger Middleware
 * Logs incoming HTTP requests with timing information
 */

const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request start
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent')?.substring(0, 100)
  };

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Choose log level based on status code
    if (statusCode >= 500) {
      logger.error('Request completed', { ...logData, statusCode, duration: `${duration}ms` });
    } else if (statusCode >= 400) {
      logger.warn('Request completed', { ...logData, statusCode, duration: `${duration}ms` });
    } else {
      logger.info('Request completed', { ...logData, statusCode, duration: `${duration}ms` });
    }
  });

  next();
};

module.exports = requestLogger;
