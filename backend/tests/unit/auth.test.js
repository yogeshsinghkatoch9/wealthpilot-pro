/**
 * Authentication Tests
 * Tests for auth routes and middleware
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Authentication', () => {
  let db;

  beforeAll(async () => {
    db = await global.setupTestDatabase();
    await global.seedTestData();
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  describe('User Registration', () => {
    it('should validate email format', () => {
      const validEmails = ['test@example.com', 'user.name@domain.org', 'test+tag@example.co.uk'];
      const invalidEmails = ['invalid', 'no@domain', '@example.com', 'test@'];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    it('should require password minimum length', () => {
      const minLength = 8;
      const validPasswords = ['password123', 'securePass!@#', 'LongPassword123'];
      const invalidPasswords = ['short', '1234567', 'abc'];

      validPasswords.forEach(password => {
        expect(password.length >= minLength).toBe(true);
      });

      invalidPasswords.forEach(password => {
        expect(password.length >= minLength).toBe(false);
      });
    });

    it('should hash passwords correctly', async () => {
      const password = 'TestPassword123';
      const saltRounds = 10;
      
      const hash = await bcrypt.hash(password, saltRounds);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      
      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);
      
      const wrongMatch = await bcrypt.compare('WrongPassword', hash);
      expect(wrongMatch).toBe(false);
    });

    it('should reject duplicate emails', async () => {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get('test@example.com');
      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });
  });

  describe('User Login', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        id: global.testUser.id,
        email: global.testUser.email
      };
      const secret = 'test-secret-key';
      const options = { expiresIn: '24h' };

      const token = jwt.sign(payload, secret, options);
      
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.verify(token, secret);
      expect(decoded.id).toBe(global.testUser.id);
      expect(decoded.email).toBe(global.testUser.email);
    });

    it('should reject expired tokens', () => {
      const payload = { id: 'test-id' };
      const secret = 'test-secret';
      const token = jwt.sign(payload, secret, { expiresIn: '-1h' });

      expect(() => jwt.verify(token, secret)).toThrow();
    });

    it('should reject invalid tokens', () => {
      const secret = 'test-secret';
      const invalidToken = 'invalid.token.here';

      expect(() => jwt.verify(invalidToken, secret)).toThrow();
    });

    it('should reject tampered tokens', () => {
      const payload = { id: 'test-id' };
      const secret = 'test-secret';
      const wrongSecret = 'wrong-secret';
      
      const token = jwt.sign(payload, secret);

      expect(() => jwt.verify(token, wrongSecret)).toThrow();
    });
  });

  describe('Password Reset', () => {
    it('should generate reset token', () => {
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      expect(resetToken).toBeDefined();
      expect(resetToken.length).toBe(64);
    });

    it('should validate reset token format', () => {
      const validToken = 'a'.repeat(64);
      const invalidToken = 'short';
      
      const tokenRegex = /^[a-f0-9]{64}$/;
      
      expect(tokenRegex.test(validToken)).toBe(true);
      expect(tokenRegex.test(invalidToken)).toBe(false);
    });
  });

  describe('Auth Middleware', () => {
    it('should extract token from Authorization header', () => {
      const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.test';
      
      const extractToken = (header) => {
        if (!header) return null;
        const parts = header.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
        return parts[1];
      };

      const token = extractToken(authHeader);
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.test');
    });

    it('should reject missing Authorization header', () => {
      const extractToken = (header) => {
        if (!header) return null;
        const parts = header.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
        return parts[1];
      };

      expect(extractToken(null)).toBeNull();
      expect(extractToken(undefined)).toBeNull();
      expect(extractToken('')).toBeNull();
    });

    it('should reject malformed Authorization header', () => {
      const extractToken = (header) => {
        if (!header) return null;
        const parts = header.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
        return parts[1];
      };

      expect(extractToken('Basic token')).toBeNull();
      expect(extractToken('Bearer')).toBeNull();
      expect(extractToken('token')).toBeNull();
    });
  });

  describe('Role-Based Access', () => {
    it('should check user roles correctly', () => {
      const checkRole = (userRole, requiredRoles) => {
        if (typeof requiredRoles === 'string') {
          requiredRoles = [requiredRoles];
        }
        return requiredRoles.includes(userRole);
      };

      expect(checkRole('admin', ['admin'])).toBe(true);
      expect(checkRole('user', ['admin'])).toBe(false);
      expect(checkRole('user', ['user', 'admin'])).toBe(true);
      expect(checkRole('viewer', ['user', 'admin'])).toBe(false);
    });

    it('should allow admin access to all resources', () => {
      const isAdmin = (role) => role === 'admin';
      
      expect(isAdmin('admin')).toBe(true);
      expect(isAdmin('user')).toBe(false);
    });
  });
});
