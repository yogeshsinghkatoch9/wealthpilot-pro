/**
 * E2E Authentication Tests
 * Tests for user registration, login, and authentication flows
 */

const API_URL = process.env.API_URL || 'http://localhost:4000';

describe('Authentication E2E', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'Test',
    lastName: 'User'
  };

  let authToken = null;

  describe('User Registration', () => {
    test('registers new user successfully', async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(testUser.email);
      authToken = data.token;
    });

    test('rejects duplicate email registration', async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('email');
    });

    test('validates password requirements', async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'weak@example.com',
          password: 'weak'
        })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('User Login', () => {
    test('logs in with valid credentials', async () => {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBeDefined();
      authToken = data.token;
    });

    test('rejects invalid password', async () => {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrongpassword'
        })
      });

      expect(response.status).toBe(401);
    });

    test('rejects non-existent user', async () => {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated Routes', () => {
    test('accesses protected route with valid token', async () => {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.email).toBe(testUser.email);
    });

    test('rejects protected route without token', async () => {
      const response = await fetch(`${API_URL}/api/auth/me`);

      expect(response.status).toBe(401);
    });

    test('rejects protected route with invalid token', async () => {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Password Change', () => {
    test('changes password with valid current password', async () => {
      const newPassword = 'NewPassword456';

      const response = await fetch(`${API_URL}/api/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          currentPassword: testUser.password,
          newPassword
        })
      });

      expect(response.status).toBe(200);

      // Update password for future tests
      testUser.password = newPassword;
    });

    test('rejects password change with wrong current password', async () => {
      const response = await fetch(`${API_URL}/api/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword789'
        })
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Logout', () => {
    test('logs out successfully', async () => {
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
    });
  });
});
