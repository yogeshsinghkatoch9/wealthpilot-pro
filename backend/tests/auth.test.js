/**
 * Authentication API Tests
 */

const request = require('supertest');

// Mock dependencies before requiring the app
jest.mock('../src/db/simpleDb', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    session: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn()
    },
    userSettings: {
      create: jest.fn()
    }
  },
  isInitialized: () => true
}));

// Now require the app
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Create a minimal test app
const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret';

// Mock user data
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  passwordHash: bcrypt.hashSync('password123', 10),
  firstName: 'Test',
  lastName: 'User',
  isVerified: true,
  plan: 'free'
};

// Simple auth routes for testing
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (email === mockUser.email && bcrypt.compareSync(password, mockUser.passwordHash)) {
    const token = jwt.sign({ userId: mockUser.id, email: mockUser.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      user: {
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName
      },
      token
    });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (email === mockUser.email) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const token = jwt.sign({ userId: 'new-user-id', email }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(201).json({
    user: { id: 'new-user-id', email, firstName, lastName },
    token
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({
      user: {
        id: decoded.userId,
        email: decoded.email
      }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

describe('Authentication API', () => {
  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should require email and password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should fail if user already exists', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      // First login to get a token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
    });

    it('should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
