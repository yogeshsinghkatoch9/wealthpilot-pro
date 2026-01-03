/**
 * Security Headers Middleware
 * Implements comprehensive HTTP security headers using Helmet.js
 */

const helmet = require('helmet');

const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Tailwind and inline styles
        'cdn.tailwindcss.com',
        'fonts.googleapis.com'
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline Chart.js configs
        'cdn.tailwindcss.com',
        'cdn.jsdelivr.net',
        'cdn.socket.io'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https:',
        'blob:'
      ],
      connectSrc: [
        "'self'",
        'wss://localhost:*',
        'ws://localhost:*',
        'https://query1.finance.yahoo.com', // Yahoo Finance API
        'https://www.alphavantage.co' // Alpha Vantage API
      ],
      fontSrc: [
        "'self'",
        'fonts.gstatic.com',
        'data:'
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  // Prevent clickjacking
  frameguard: {
    action: 'deny'
  },

  // Prevent MIME type sniffing
  noSniff: true,

  // XSS filter
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: {
    policy: 'same-origin'
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  }
});

module.exports = securityHeaders;
