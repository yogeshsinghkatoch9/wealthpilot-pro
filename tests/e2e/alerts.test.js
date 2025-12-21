/**
 * E2E Alerts Tests
 * Tests for alert creation and management flow
 */

const API_URL = process.env.API_URL || 'http://localhost:4000';

describe('Alerts E2E', () => {
  const testUser = {
    email: `alerts-test-${Date.now()}@example.com`,
    password: 'TestPassword123'
  };

  let authToken = null;
  let alertId = null;

  beforeAll(async () => {
    // Register and login test user
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const registerData = await registerResponse.json();
    authToken = registerData.token;
  });

  describe('Alert CRUD', () => {
    test('creates price above alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          type: 'price_above',
          condition: { price: 200 },
          message: 'AAPL crossed $200'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert).toBeDefined();
      expect(data.alert.symbol).toBe('AAPL');
      expect(data.alert.type).toBe('price_above');
      alertId = data.alert.id;
    });

    test('creates price below alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          symbol: 'TSLA',
          type: 'price_below',
          condition: { price: 200 },
          message: 'TSLA dropped below $200'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert.type).toBe('price_below');
    });

    test('fetches all alerts', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alerts).toBeDefined();
      expect(data.alerts.length).toBeGreaterThanOrEqual(2);
    });

    test('updates alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          condition: { price: 220 },
          message: 'Updated: AAPL crossed $220'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alert.condition.price).toBe(220);
    });

    test('toggles alert active status', async () => {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          isActive: false
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alert.isActive).toBe(false);
    });

    test('deletes alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Alert Validation', () => {
    test('rejects invalid alert type', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          type: 'invalid_type',
          condition: { price: 200 }
        })
      });

      expect(response.status).toBe(400);
    });

    test('rejects missing condition', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          type: 'price_above'
        })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Portfolio Alerts', () => {
    test('creates portfolio value alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          type: 'portfolio_value',
          condition: { value: 100000 },
          message: 'Portfolio reached $100K'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert.type).toBe('portfolio_value');
    });

    test('creates portfolio gain alert', async () => {
      const response = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          type: 'portfolio_gain',
          condition: { gainPercent: 10 },
          message: 'Portfolio up 10%'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert.type).toBe('portfolio_gain');
    });
  });
});
