/**
 * Health Check API Tests
 */

const request = require('supertest');
const express = require('express');

// Create a minimal test app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Readiness check
app.get('/api/ready', (req, res) => {
  res.json({
    status: 'ready',
    database: 'connected',
    cache: 'connected'
  });
});

describe('Health Check API', () => {
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/ready', () => {
    it('should return ready status', async () => {
      const response = await request(app)
        .get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
    });
  });
});
