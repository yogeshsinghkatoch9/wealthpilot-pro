/**
 * API Client Tests
 * Tests for the WealthPilot Pro API client
 */

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
    setItem: jest.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
    removeItem: jest.fn((key: string) => { delete mockLocalStorage[key]; }),
    clear: jest.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); })
  }
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    location: { href: '' }
  },
  writable: true
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Import after mocks are set up
const { ApiClient } = require('../../src/api/client');

describe('ApiClient', () => {
  let client: InstanceType<typeof ApiClient>;

  beforeEach(() => {
    client = new ApiClient();
    mockFetch.mockReset();
    (global.localStorage.clear as jest.Mock)();
    jest.clearAllMocks();
  });

  describe('Token Management', () => {
    test('setToken stores token and saves to localStorage', () => {
      client.setToken('test-token');

      expect(client.getToken()).toBe('test-token');
      expect(global.localStorage.setItem).toHaveBeenCalledWith('wealthpilot_token', 'test-token');
    });

    test('getToken retrieves from memory first', () => {
      client.token = 'memory-token';

      expect(client.getToken()).toBe('memory-token');
    });

    test('getToken falls back to localStorage', () => {
      client.token = null;
      mockLocalStorage['wealthpilot_token'] = 'stored-token';

      expect(client.getToken()).toBe('stored-token');
    });

    test('clearToken removes token from memory and localStorage', () => {
      client.setToken('test-token');
      client.clearToken();

      expect(client.token).toBeNull();
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('wealthpilot_token');
    });
  });

  describe('HTTP Methods', () => {
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, data: 'test' })
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue(mockSuccessResponse);
    });

    test('get() makes GET request', async () => {
      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('post() makes POST request with body', async () => {
      await client.post('/test', { key: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'value' })
        })
      );
    });

    test('put() makes PUT request with body', async () => {
      await client.put('/test', { key: 'updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ key: 'updated' })
        })
      );
    });

    test('delete() makes DELETE request', async () => {
      await client.delete('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    test('delete() includes body when provided', async () => {
      await client.delete('/test', { reason: 'sold' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ reason: 'sold' })
        })
      );
    });
  });

  describe('Request Handling', () => {
    test('includes authorization header when token is set', async () => {
      client.setToken('auth-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({})
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer auth-token'
          })
        })
      );
    });

    test('handleResponse returns data on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ portfolios: [] })
      });

      const result = await client.get('/portfolios');

      expect(result).toEqual({ portfolios: [] });
    });

    test('handleResponse throws error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ error: 'Bad request' })
      });

      await expect(client.get('/portfolios')).rejects.toThrow('Bad request');
    });

    test('handles JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      });

      const result = await client.get('/test');
      expect(result).toEqual({});
    });
  });

  describe('Authentication Endpoints', () => {
    test('login() calls correct endpoint and stores token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ token: 'new-token', user: { id: 1 } })
      });

      const result = await client.login('test@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
        })
      );
      expect(client.getToken()).toBe('new-token');
      expect(result).toEqual({ token: 'new-token', user: { id: 1 } });
    });

    test('register() calls correct endpoint and stores token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ token: 'new-token', user: { id: 1 } })
      });

      await client.register('test@example.com', 'password123', 'John', 'Doe');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
            firstName: 'John',
            lastName: 'Doe'
          })
        })
      );
      expect(client.getToken()).toBe('new-token');
    });

    test('logout() clears token', async () => {
      client.setToken('existing-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({})
      });

      await client.logout();

      expect(client.getToken()).toBeNull();
    });

    test('getCurrentUser() calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 1, email: 'test@example.com' })
      });

      const result = await client.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.any(Object)
      );
      expect(result).toEqual({ id: 1, email: 'test@example.com' });
    });

    test('changePassword() calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });

      await client.changePassword('oldpass', 'newpass');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass' })
        })
      );
    });
  });

  describe('Portfolio Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
    });

    test('getPortfolios() calls correct endpoint', async () => {
      await client.getPortfolios();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios'),
        expect.any(Object)
      );
    });

    test('getPortfolio() calls correct endpoint with ID', async () => {
      await client.getPortfolio('port-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.any(Object)
      );
    });

    test('createPortfolio() sends correct data', async () => {
      await client.createPortfolio({ name: 'My Portfolio', currency: 'USD' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'My Portfolio', currency: 'USD' })
        })
      );
    });

    test('updatePortfolio() sends correct data', async () => {
      await client.updatePortfolio('port-123', { name: 'Updated Name' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' })
        })
      );
    });

    test('deletePortfolio() calls correct endpoint', async () => {
      await client.deletePortfolio('port-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    test('getPortfolioPerformance() includes period parameter', async () => {
      await client.getPortfolioPerformance('port-123', '3M');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123/performance?period=3M'),
        expect.any(Object)
      );
    });
  });

  describe('Holdings Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
    });

    test('addHolding() sends correct data', async () => {
      await client.addHolding({
        portfolioId: 'port-123',
        symbol: 'AAPL',
        shares: 100,
        avgCost: 150.00
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/holdings'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    test('sellShares() sends correct data', async () => {
      await client.sellShares('holding-123', 50, 175.00, 'FIFO');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/holdings/holding-123/sell'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ shares: 50, price: 175.00, method: 'FIFO' })
        })
      );
    });

    test('deleteHolding() includes sellPrice when provided', async () => {
      await client.deleteHolding('holding-123', 180.00);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/holdings/holding-123'),
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ sellPrice: 180.00 })
        })
      );
    });
  });

  describe('Watchlist Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
    });

    test('getWatchlists() calls correct endpoint', async () => {
      await client.getWatchlists();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists'),
        expect.any(Object)
      );
    });

    test('addToWatchlist() sends correct data', async () => {
      await client.addToWatchlist('wl-123', 'AAPL', 200.00, 'Target price');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists/wl-123/items'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ symbol: 'AAPL', targetPrice: 200.00, notes: 'Target price' })
        })
      );
    });

    test('removeFromWatchlist() calls correct endpoint', async () => {
      await client.removeFromWatchlist('wl-123', 'AAPL');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists/wl-123/items/AAPL'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('Alert Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
    });

    test('getAlerts() calls correct endpoint', async () => {
      await client.getAlerts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/alerts'),
        expect.any(Object)
      );
    });

    test('createAlert() sends correct data', async () => {
      await client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/alerts'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    test('deleteAlert() calls correct endpoint', async () => {
      await client.deleteAlert('alert-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/alerts/alert-123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('Market Data Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ symbol: 'AAPL', price: 175.00 })
      });
    });

    test('getQuote() calls correct endpoint', async () => {
      await client.getQuote('AAPL');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/quote/AAPL'),
        expect.any(Object)
      );
    });

    test('getQuotes() formats symbols correctly', async () => {
      await client.getQuotes(['AAPL', 'MSFT', 'GOOGL']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/quotes?symbols=AAPL,MSFT,GOOGL'),
        expect.any(Object)
      );
    });

    test('searchStocks() encodes query', async () => {
      await client.searchStocks('Apple Inc');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/search?q=Apple%20Inc'),
        expect.any(Object)
      );
    });

    test('getHistoricalPrices() includes days parameter', async () => {
      await client.getHistoricalPrices('AAPL', 180);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/history/AAPL?days=180'),
        expect.any(Object)
      );
    });
  });

  describe('Analytics Endpoints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
    });

    test('getDashboard() calls correct endpoint', async () => {
      await client.getDashboard();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/dashboard'),
        expect.any(Object)
      );
    });

    test('getOverallPerformance() includes period', async () => {
      await client.getOverallPerformance('YTD');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/performance?period=YTD'),
        expect.any(Object)
      );
    });

    test('getTaxLots() calls correct endpoint', async () => {
      await client.getTaxLots();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/tax-lots'),
        expect.any(Object)
      );
    });
  });

  describe('Token Refresh', () => {
    test('attempts token refresh on 401 response', async () => {
      client.setToken('expired-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Token expired' })
      });

      // Refresh call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ token: 'new-token' })
      });

      // Retry call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      });

      const result = await client.get('/protected-resource');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: 'success' });
    });

    test('redirects to login when refresh fails', async () => {
      client.setToken('expired-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Token expired' })
      });

      // Refresh call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Refresh failed' })
      });

      await expect(client.get('/protected-resource')).rejects.toThrow('Session expired');
      expect((global.window as { location: { href: string } }).location.href).toBe('/login');
    });
  });
});
export {};
