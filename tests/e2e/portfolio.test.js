/**
 * E2E Portfolio Tests
 * Tests for complete portfolio management flow
 */

const API_URL = process.env.API_URL || 'http://localhost:4000';

describe('Portfolio E2E', () => {
  const testUser = {
    email: `portfolio-test-${Date.now()}@example.com`,
    password: 'TestPassword123'
  };

  let authToken = null;
  let portfolioId = null;
  let holdingId = null;

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

  describe('Portfolio CRUD', () => {
    test('creates new portfolio', async () => {
      const response = await fetch(`${API_URL}/api/portfolios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'E2E Test Portfolio',
          description: 'Portfolio for E2E testing',
          currency: 'USD'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.portfolio).toBeDefined();
      expect(data.portfolio.name).toBe('E2E Test Portfolio');
      portfolioId = data.portfolio.id;
    });

    test('fetches portfolio list', async () => {
      const response = await fetch(`${API_URL}/api/portfolios`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.portfolios).toBeDefined();
      expect(data.portfolios.length).toBeGreaterThan(0);
    });

    test('fetches single portfolio', async () => {
      const response = await fetch(`${API_URL}/api/portfolios/${portfolioId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe(portfolioId);
      expect(data.name).toBe('E2E Test Portfolio');
    });

    test('updates portfolio', async () => {
      const response = await fetch(`${API_URL}/api/portfolios/${portfolioId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Updated E2E Portfolio',
          description: 'Updated description'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.portfolio.name).toBe('Updated E2E Portfolio');
    });
  });

  describe('Holdings Management', () => {
    test('adds holding to portfolio', async () => {
      const response = await fetch(`${API_URL}/api/holdings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          portfolioId,
          symbol: 'AAPL',
          shares: 10,
          avgCost: 150.00
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.holding).toBeDefined();
      expect(data.holding.symbol).toBe('AAPL');
      holdingId = data.holding.id;
    });

    test('fetches portfolio with holdings', async () => {
      const response = await fetch(`${API_URL}/api/portfolios/${portfolioId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.holdings).toBeDefined();
      expect(data.holdings.length).toBeGreaterThan(0);
      expect(data.holdings[0].symbol).toBe('AAPL');
    });

    test('updates holding', async () => {
      const response = await fetch(`${API_URL}/api/holdings/${holdingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          shares: 15,
          avgCost: 155.00
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.holding.shares).toBe(15);
    });

    test('deletes holding', async () => {
      const response = await fetch(`${API_URL}/api/holdings/${holdingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Portfolio Analytics', () => {
    beforeAll(async () => {
      // Add a holding back for analytics tests
      const response = await fetch(`${API_URL}/api/holdings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          portfolioId,
          symbol: 'MSFT',
          shares: 5,
          avgCost: 380.00
        })
      });
      const data = await response.json();
      holdingId = data.holding?.id;
    });

    test('fetches portfolio performance', async () => {
      const response = await fetch(
        `${API_URL}/api/portfolios/${portfolioId}/performance?period=1M`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    test('fetches portfolio allocation', async () => {
      const response = await fetch(
        `${API_URL}/api/portfolios/${portfolioId}/allocation`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    test('fetches portfolio risk metrics', async () => {
      const response = await fetch(
        `${API_URL}/api/portfolios/${portfolioId}/risk`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });
  });

  describe('Portfolio Cleanup', () => {
    test('deletes portfolio', async () => {
      const response = await fetch(`${API_URL}/api/portfolios/${portfolioId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
    });

    test('verifies portfolio is deleted', async () => {
      const response = await fetch(`${API_URL}/api/portfolios/${portfolioId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(404);
    });
  });
});
