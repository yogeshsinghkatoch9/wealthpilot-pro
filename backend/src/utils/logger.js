const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

// Custom format for structured logging
const structuredFormat = winston.format.printf(({ level, message, timestamp, requestId, userId, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  const reqStr = requestId ? `[${requestId}]` : '';
  const userStr = userId ? `[user:${userId}]` : '';
  return `${timestamp} ${level.toUpperCase()} ${reqStr}${userStr} ${message} ${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'wealthpilot-api',
    env: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        structuredFormat
      )
    })
  ]
});

// Add file transports in production with rotation
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  }));
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true
  }));
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'access.log'),
    level: 'http',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    tailable: true
  }));
}

// Helper to create child logger with request context
logger.child = (meta) => {
  return {
    info: (msg, ...args) => logger.info(msg, { ...meta, ...args[0] }),
    warn: (msg, ...args) => logger.warn(msg, { ...meta, ...args[0] }),
    error: (msg, ...args) => logger.error(msg, { ...meta, ...args[0] }),
    debug: (msg, ...args) => logger.debug(msg, { ...meta, ...args[0] }),
    http: (msg, ...args) => logger.http(msg, { ...meta, ...args[0] })
  };
};

// Stream for Morgan HTTP logging
logger.stream = {
  write: (message) => logger.http(message.trim())
};

module.exports = logger;
