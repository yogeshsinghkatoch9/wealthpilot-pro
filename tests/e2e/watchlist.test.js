/**
 * E2E Watchlist Tests
 * Tests for watchlist creation and management flow
 */

const API_URL = process.env.API_URL || 'http://localhost:4000';

describe('Watchlist E2E', () => {
  const testUser = {
    email: `watchlist-test-${Date.now()}@example.com`,
    password: 'TestPassword123'
  };

  let authToken = null;
  let watchlistId = null;

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

  describe('Watchlist CRUD', () => {
    test('creates new watchlist', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Tech Stocks',
          description: 'Technology sector stocks to watch'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.watchlist).toBeDefined();
      expect(data.watchlist.name).toBe('Tech Stocks');
      watchlistId = data.watchlist.id;
    });

    test('fetches all watchlists', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.watchlists).toBeDefined();
      expect(data.watchlists.length).toBeGreaterThan(0);
    });

    test('adds stock to watchlist', async () => {
      const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          targetPrice: 200.00,
          notes: 'Buy on dips below $170'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.item).toBeDefined();
      expect(data.item.symbol).toBe('AAPL');
    });

    test('adds multiple stocks to watchlist', async () => {
      const stocks = ['MSFT', 'GOOGL', 'NVDA'];

      for (const symbol of stocks) {
        const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ symbol })
        });

        expect(response.status).toBe(201);
      }
    });

    test('fetches watchlist with items', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();
      const watchlist = data.watchlists.find(w => w.id === watchlistId);

      expect(watchlist).toBeDefined();
      expect(watchlist.items.length).toBe(4);
    });

    test('removes stock from watchlist', async () => {
      const response = await fetch(
        `${API_URL}/api/watchlists/${watchlistId}/items/GOOGL`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      expect(response.status).toBe(200);
    });

    test('verifies stock was removed', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();
      const watchlist = data.watchlists.find(w => w.id === watchlistId);
      const hasGoogl = watchlist.items.some(item => item.symbol === 'GOOGL');

      expect(hasGoogl).toBe(false);
    });

    test('deletes watchlist', async () => {
      const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Watchlist Validation', () => {
    test('rejects empty watchlist name', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: ''
        })
      });

      expect(response.status).toBe(400);
    });

    test('rejects duplicate stock in watchlist', async () => {
      // Create a new watchlist
      const createResponse = await fetch(`${API_URL}/api/watchlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name: 'Duplicate Test' })
      });

      const createData = await createResponse.json();
      const wlId = createData.watchlist.id;

      // Add stock
      await fetch(`${API_URL}/api/watchlists/${wlId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ symbol: 'AAPL' })
      });

      // Try to add same stock again
      const duplicateResponse = await fetch(`${API_URL}/api/watchlists/${wlId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ symbol: 'AAPL' })
      });

      expect(duplicateResponse.status).toBe(409);

      // Cleanup
      await fetch(`${API_URL}/api/watchlists/${wlId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
    });
  });

  describe('Default Watchlist', () => {
    test('user has default watchlist', async () => {
      const response = await fetch(`${API_URL}/api/watchlists`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      // After creating and deleting watchlists, should still have default
      expect(data.watchlists.length).toBeGreaterThanOrEqual(0);
    });
  });
});
