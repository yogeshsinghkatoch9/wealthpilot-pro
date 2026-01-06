/**
 * Sentry Error Tracking Configuration
 * Initializes Sentry for error monitoring and performance tracking
 */

const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

/**
 * Initialize Sentry with configuration
 */
function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.warn('⚠️ SENTRY_DSN not configured - error tracking disabled');
    return {
      captureException: (err) => logger.error('Uncaptured exception:', err),
      captureMessage: (msg) => logger.warn('Uncaptured message:', msg),
      isInitialized: false
    };
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: `wealthpilot-backend@${process.env.npm_package_version || '1.0.0'}`,

      // Performance monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Profile sampling rate (relative to tracesSampleRate)
      profilesSampleRate: 0.1,

      // Filter sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request && event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }

        // Remove sensitive data from request body
        if (event.request && event.request.data) {
          try {
            const data = JSON.parse(event.request.data);
            if (data.password) data.password = '[FILTERED]';
            if (data.token) data.token = '[FILTERED]';
            if (data.apiKey) data.apiKey = '[FILTERED]';
            event.request.data = JSON.stringify(data);
          } catch (e) {
            // Not JSON, leave as is
          }
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Request aborted',
        'Network request failed',
        'ECONNRESET',
        'ETIMEDOUT'
      ],

      // Attach stack traces to messages
      attachStacktrace: true
    });

    // Add Express middleware
    if (app) {
      app.use(Sentry.Handlers.requestHandler());
      app.use(Sentry.Handlers.tracingHandler());
    }

    logger.info('✓ Sentry error tracking initialized');

    return {
      captureException: Sentry.captureException.bind(Sentry),
      captureMessage: Sentry.captureMessage.bind(Sentry),
      setUser: Sentry.setUser.bind(Sentry),
      addBreadcrumb: Sentry.addBreadcrumb.bind(Sentry),
      errorHandler: Sentry.Handlers.errorHandler(),
      isInitialized: true
    };
  } catch (error) {
    logger.error('Failed to initialize Sentry:', error);
    return {
      captureException: (err) => logger.error('Uncaptured exception:', err),
      captureMessage: (msg) => logger.warn('Uncaptured message:', msg),
      isInitialized: false
    };
  }
}

/**
 * Wrap async route handlers to capture errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      Sentry.captureException(err);
      next(err);
    });
  };
}

/**
 * Set user context for error tracking
 */
function setUserContext(user) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.firstName ? `${user.firstName} ${user.lastName}` : undefined
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging
 */
function addBreadcrumb(message, category = 'info', data = {}) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info'
  });
}

module.exports = {
  initSentry,
  asyncHandler,
  setUserContext,
  addBreadcrumb,
  Sentry
};
