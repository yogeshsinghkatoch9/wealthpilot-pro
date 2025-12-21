# WealthPilot Pro - Comprehensive Security Implementation Plan

## 🔒 Security Overview

This document outlines critical security improvements to protect WealthPilot Pro from common vulnerabilities and attacks.

---

## 🎯 Security Priorities

### Critical (Implement Immediately)
1. ✅ **Rate Limiting** - Prevent brute force and DOS attacks
2. ✅ **CSRF Protection** - Prevent cross-site request forgery
3. ✅ **Input Sanitization** - Prevent injection attacks
4. ✅ **Security Headers** - Protect against common attacks
5. ✅ **Password Security** - Strong hashing and validation

### High Priority
6. ✅ **SQL Injection Prevention** - Parameterized queries only
7. ✅ **XSS Prevention** - Content Security Policy
8. ✅ **Session Security** - Secure token management
9. ✅ **API Key Protection** - Environment variable security
10. ✅ **Error Message Sanitization** - No sensitive data leaks

### Medium Priority
11. ⏳ **Request Validation** - Schema validation for all inputs
12. ⏳ **Audit Logging** - Track security events
13. ⏳ **IP Whitelisting** - Admin endpoint protection
14. ⏳ **2FA Support** - Two-factor authentication
15. ⏳ **API Versioning** - Backward compatibility & deprecation

---

## 🛡️ Implementation Details

### 1. Rate Limiting

**Problem:** Brute force attacks, API abuse, DOS
**Solution:** Implement express-rate-limit middleware

**Implementation:**
```javascript
// File: /backend/src/middleware/rateLimiter.js

const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints stricter limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later.'
});

// Market data moderate limiter
const marketLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Rate limit exceeded for market data'
});

module.exports = { apiLimiter, authLimiter, marketLimiter };
```

**Usage:**
```javascript
// In server.js
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

### 2. CSRF Protection

**Problem:** Attackers can forge requests from authenticated users
**Solution:** CSRF tokens for state-changing operations

**Implementation:**
```javascript
// File: /backend/src/middleware/csrf.js

const csrf = require('csurf');
const cookieParser = require('cookie-parser');

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

module.exports = csrfProtection;
```

### 3. Input Sanitization

**Problem:** SQL injection, XSS, NoSQL injection
**Solution:** Sanitize and validate all inputs

**Implementation:**
```javascript
// File: /backend/src/middleware/sanitizer.js

const validator = require('validator');
const xss = require('xss');

function sanitizeInput(input) {
  if (typeof input === 'string') {
    return xss(validator.trim(input));
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

function sanitizeMiddleware(req, res, next) {
  req.body = sanitizeInput(req.body);
  req.query = sanitizeInput(req.query);
  req.params = sanitizeInput(req.params);
  next();
}

module.exports = { sanitizeInput, sanitizeMiddleware };
```

### 4. Security Headers

**Problem:** Various browser-based attacks
**Solution:** HTTP security headers via helmet.js

**Implementation:**
```javascript
// File: /backend/src/middleware/security.js

const helmet = require('helmet');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'cdn.socket.io'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss://localhost:*', 'ws://localhost:*'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'same-origin' }
});

module.exports = securityHeaders;
```

### 5. Password Security

**Problem:** Weak passwords, password breaches
**Solution:** Strong validation + bcrypt hashing

**Implementation:**
```javascript
// File: /backend/src/utils/passwordValidator.js

const passwordValidator = require('password-validator');

const schema = new passwordValidator();

schema
  .is().min(8)                                    // Minimum length 8
  .is().max(100)                                  // Maximum length 100
  .has().uppercase()                              // Must have uppercase
  .has().lowercase()                              // Must have lowercase
  .has().digits(1)                                // Must have at least 1 digit
  .has().symbols()                                // Must have symbols
  .has().not().spaces()                           // No spaces
  .is().not().oneOf(['Password123!', 'Admin123!']); // Blacklist common

function validatePassword(password) {
  const errors = schema.validate(password, { details: true });
  return {
    valid: errors.length === 0,
    errors: errors.map(e => e.message)
  };
}

module.exports = { validatePassword };
```

### 6. SQL Injection Prevention

**Status:** ✅ Already implemented (using parameterized queries in better-sqlite3)

**Verification:**
```javascript
// GOOD - Parameterized query
const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
const user = stmt.get(email);

// BAD - String concatenation (NEVER DO THIS)
// const user = db.prepare(`SELECT * FROM users WHERE email = '${email}'`).get();
```

### 7. XSS Prevention

**Problem:** Malicious scripts injected into pages
**Solution:** CSP headers + input sanitization + output encoding

**Implementation:**
- CSP headers (see Security Headers above)
- Input sanitization (see Input Sanitization above)
- EJS auto-escapes by default (use `<%= %>` not `<%- %>`)

### 8. Session Security

**Problem:** Session hijacking, token theft
**Solution:** Secure JWT practices

**Implementation:**
```javascript
// File: /backend/src/utils/jwtHelper.js

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'wealthpilot-api',
    audience: 'wealthpilot-client'
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'wealthpilot-api',
      audience: 'wealthpilot-client'
    });
  } catch (error) {
    throw new Error('Invalid token');
  }
}

module.exports = { generateToken, verifyToken };
```

**Cookie Security:**
```javascript
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### 9. API Key Protection

**Status:** ✅ Already using environment variables

**Best Practices:**
```bash
# .env file (NEVER commit to git)
JWT_SECRET=strong-random-secret-here
ALPHA_VANTAGE_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key

# .gitignore
.env
.env.local
.env.production
```

**Validation:**
```javascript
// File: /backend/src/utils/envValidator.js

function validateEnv() {
  const required = [
    'JWT_SECRET',
    'ALPHA_VANTAGE_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

module.exports = { validateEnv };
```

### 10. Error Message Sanitization

**Problem:** Stack traces and sensitive data in errors
**Solution:** Generic error messages to clients, detailed logs server-side

**Implementation:**
```javascript
// File: /backend/src/middleware/errorHandler.js

function errorHandler(err, req, res, next) {
  // Log full error server-side
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user: req.user?.id
  });

  // Generic error to client (no stack traces)
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An error occurred'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

module.exports = errorHandler;
```

---

## 📋 Security Checklist

### Authentication & Authorization
- ✅ JWT tokens with expiration
- ✅ Bcrypt password hashing (10 rounds)
- ✅ Session validation on every request
- ✅ User-specific data isolation
- ⏳ Password reset functionality
- ⏳ Email verification
- ⏳ Two-factor authentication

### Input Validation
- ✅ Parameterized SQL queries
- ⏳ Request schema validation (Joi/Yup)
- ⏳ XSS sanitization on all inputs
- ⏳ File upload validation
- ⏳ URL validation
- ⏳ Email validation

### Network Security
- ⏳ HTTPS enforcement (production)
- ⏳ CORS configuration
- ⏳ Rate limiting on all endpoints
- ✅ WebSocket authentication
- ⏳ IP whitelisting for admin routes

### Data Protection
- ✅ Environment variables for secrets
- ✅ No sensitive data in logs
- ✅ No sensitive data in error messages
- ⏳ Database encryption at rest
- ⏳ Data backup & recovery

### Headers & CORS
- ⏳ Helmet security headers
- ⏳ CSP headers
- ⏳ HSTS headers (production)
- ⏳ X-Frame-Options
- ⏳ X-Content-Type-Options

### Monitoring & Logging
- ⏳ Security event logging
- ⏳ Failed login tracking
- ⏳ Suspicious activity detection
- ⏳ Audit trail for sensitive operations
- ⏳ Error tracking (Sentry/similar)

---

## 🚀 Implementation Priority

### Phase 1: Critical Security (Immediate)
1. Install and configure rate limiting
2. Add security headers (helmet)
3. Implement input sanitization
4. Add CSRF protection
5. Enhance error handling

### Phase 2: Enhanced Security (This Week)
1. Request schema validation
2. Audit logging system
3. Password strength validation
4. Environment variable validation
5. CORS configuration

### Phase 3: Advanced Security (Next Week)
1. 2FA implementation
2. IP whitelisting for admin
3. API key rotation system
4. Security monitoring dashboard
5. Penetration testing

---

## 📦 Required NPM Packages

```bash
npm install --save \
  helmet \
  express-rate-limit \
  csurf \
  express-validator \
  xss \
  validator \
  password-validator \
  joi
```

---

## 🧪 Security Testing

### Manual Tests
1. **Rate Limiting Test**
   ```bash
   for i in {1..100}; do curl http://localhost:4000/api/portfolios; done
   ```

2. **SQL Injection Test**
   ```bash
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com OR 1=1--","password":"test"}'
   ```

3. **XSS Test**
   ```bash
   curl -X POST http://localhost:4000/api/portfolios \
     -H "Authorization: Bearer TOKEN" \
     -d '{"name":"<script>alert(1)</script>"}'
   ```

### Automated Security Scanning
```bash
# Install security scanners
npm install --save-dev \
  snyk \
  npm-audit \
  eslint-plugin-security

# Run scans
npm audit
npx snyk test
npx eslint . --ext .js --plugin security
```

---

## 🎓 Security Best Practices

1. **Never trust user input** - Validate everything
2. **Use HTTPS in production** - No exceptions
3. **Keep dependencies updated** - Run npm audit regularly
4. **Use environment variables** - Never hardcode secrets
5. **Log security events** - Track suspicious activity
6. **Implement rate limiting** - Prevent abuse
7. **Use security headers** - Defense in depth
8. **Sanitize error messages** - No stack traces to clients
9. **Hash passwords properly** - bcrypt with 10+ rounds
10. **Review code regularly** - Security audits

---

## 📚 Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

**Status:** In Progress
**Priority:** Critical
**Target Completion:** December 14, 2025
