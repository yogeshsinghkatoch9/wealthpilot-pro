/**
 * Input Sanitization Middleware
 * Protects against XSS and injection attacks
 */

const validator = require('validator');
const xss = require('xss');

/**
 * Recursively sanitize input data
 * @param {*} input - Input to sanitize
 * @returns {*} - Sanitized input
 */
function sanitizeInput(input) {
  // Handle strings
  if (typeof input === 'string') {
    // Trim whitespace
    let sanitized = validator.trim(input);

    // Remove XSS attacks
    sanitized = xss(sanitized, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style']
    });

    return sanitized;
  }

  // Handle arrays
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }

  // Handle objects
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeInput(key);
      sanitized[sanitizedKey] = sanitizeInput(value);
    }
    return sanitized;
  }

  // Return other types as-is (numbers, booleans, null, undefined)
  return input;
}

/**
 * Express middleware to sanitize all request data
 */
function sanitizeMiddleware(req, res, next) {
  try {
    // Sanitize body
    if (req.body) {
      req.body = sanitizeInput(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeInput(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeInput(req.params);
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid input data'
    });
  }
}

/**
 * Validate and sanitize email
 * @param {string} email - Email to validate
 * @returns {object} - { valid: boolean, sanitized: string, error: string }
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, sanitized: '', error: 'Email is required' };
  }

  const sanitized = validator.trim(email.toLowerCase());

  if (!validator.isEmail(sanitized)) {
    return { valid: false, sanitized, error: 'Invalid email format' };
  }

  return { valid: true, sanitized, error: null };
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @returns {object} - { valid: boolean, sanitized: string, error: string }
 */
function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, sanitized: '', error: 'URL is required' };
  }

  const sanitized = validator.trim(url);

  if (!validator.isURL(sanitized, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true
  })) {
    return { valid: false, sanitized, error: 'Invalid URL format' };
  }

  return { valid: true, sanitized, error: null };
}

/**
 * Sanitize SQL-like input (additional layer beyond parameterized queries)
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeSQL(input) {
  if (typeof input !== 'string') return input;

  // Remove SQL comment markers
  let sanitized = input.replace(/--/g, '');
  sanitized = sanitized.replace(/\/\*/g, '');
  sanitized = sanitized.replace(/\*\//g, '');

  // Remove dangerous SQL keywords (for extra safety)
  const dangerousKeywords = [
    'DROP', 'DELETE', 'INSERT', 'UPDATE', 'EXEC', 'EXECUTE',
    'CREATE', 'ALTER', 'TRUNCATE', 'UNION', 'DECLARE'
  ];

  const regex = new RegExp(`\\b(${dangerousKeywords.join('|')})\\b`, 'gi');
  sanitized = sanitized.replace(regex, '');

  return validator.trim(sanitized);
}

module.exports = {
  sanitizeInput,
  sanitizeMiddleware,
  validateEmail,
  validateURL,
  sanitizeSQL
};
