/**
 * Watchlist Page Tests
 * Tests for watchlist creation, management, and stock tracking
 */

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock localStorage
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  }
});

Object.defineProperty(global, 'window', {
  value: { location: { href: '' } },
  writable: true
});

const { ApiClient } = require('../../src/api/client');

describe('Watchlist Management', () => {
  let client: InstanceType<typeof ApiClient>;

  beforeEach(() => {
    client = new ApiClient();
    client.setToken('test-token');
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  describe('Create Watchlist', () => {
    test('creates watchlist with name only', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          watchlist: {
            id: 'wl-123',
            name: 'Tech Stocks',
            items: [],
            createdAt: '2024-06-15T10:00:00Z'
          }
        })
      });

      const result = await client.createWatchlist({ name: 'Tech Stocks' });

      expect(result.watchlist.name).toBe('Tech Stocks');
      expect(result.watchlist.items).toHaveLength(0);
    });

    test('creates watchlist with description', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          watchlist: {
            id: 'wl-123',
            name: 'Dividend Kings',
            description: 'Stocks with 50+ years of dividend growth',
            items: []
          }
        })
      });

      const result = await client.createWatchlist({
        name: 'Dividend Kings',
        description: 'Stocks with 50+ years of dividend growth'
      });

      expect(result.watchlist.description).toBe('Stocks with 50+ years of dividend growth');
    });

    test('validates watchlist name length', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'name', message: 'Watchlist name must be 1-50 characters' }]
        })
      });

      await expect(client.createWatchlist({ name: '' }))
        .rejects.toThrow();
    });

    test('validates description length', async () => {
      const longDescription = 'A'.repeat(250);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'description', message: 'Description must be under 200 characters' }]
        })
      });

      await expect(client.createWatchlist({
        name: 'Test',
        description: longDescription
      })).rejects.toThrow();
    });
  });

  describe('Read Watchlists', () => {
    test('fetches all watchlists', async () => {
      const watchlistsData = {
        watchlists: [
          { id: 'wl-1', name: 'Tech Stocks', items: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] },
          { id: 'wl-2', name: 'Dividend Stocks', items: [{ symbol: 'JNJ' }, { symbol: 'KO' }] }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(watchlistsData)
      });

      const result = await client.getWatchlists();

      expect(result.watchlists).toHaveLength(2);
      expect(result.watchlists[0].name).toBe('Tech Stocks');
    });

    test('handles empty watchlists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ watchlists: [] })
      });

      const result = await client.getWatchlists();

      expect(result.watchlists).toHaveLength(0);
    });

    test('includes current quotes for watchlist items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{
            id: 'wl-1',
            name: 'Tech',
            items: [
              {
                symbol: 'AAPL',
                currentPrice: 175.50,
                change: 2.30,
                changePercent: 1.33
              }
            ]
          }]
        })
      });

      const result = await client.getWatchlists();

      const item = result.watchlists[0].items[0];
      expect(item.currentPrice).toBe(175.50);
      expect(item.changePercent).toBe(1.33);
    });
  });

  describe('Add to Watchlist', () => {
    test('adds stock to watchlist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          item: {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            addedAt: '2024-06-15T10:00:00Z'
          }
        })
      });

      const result = await client.addToWatchlist('wl-123', 'NVDA');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists/wl-123/items'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('NVDA')
        })
      );
      expect(result.item.symbol).toBe('NVDA');
    });

    test('adds stock with target price', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          item: {
            symbol: 'AAPL',
            targetPrice: 200.00
          }
        })
      });

      const result = await client.addToWatchlist('wl-123', 'AAPL', 200.00);

      expect(result.item.targetPrice).toBe(200.00);
    });

    test('adds stock with notes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          item: {
            symbol: 'AAPL',
            notes: 'Buy on dips below $170'
          }
        })
      });

      const result = await client.addToWatchlist('wl-123', 'AAPL', undefined, 'Buy on dips below $170');

      expect(result.item.notes).toBe('Buy on dips below $170');
    });

    test('handles duplicate stock in watchlist', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: jest.fn().mockResolvedValue({
          error: 'Stock already in watchlist'
        })
      });

      await expect(client.addToWatchlist('wl-123', 'AAPL'))
        .rejects.toThrow('Stock already in watchlist');
    });

    test('validates symbol format', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'symbol', message: 'Symbol must be 1-10 characters' }]
        })
      });

      await expect(client.addToWatchlist('wl-123', ''))
        .rejects.toThrow();
    });

    test('validates target price', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'targetPrice', message: 'Target price must be a positive number' }]
        })
      });

      await expect(client.addToWatchlist('wl-123', 'AAPL', -100))
        .rejects.toThrow();
    });

    test('validates notes length', async () => {
      const longNotes = 'A'.repeat(600);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'notes', message: 'Notes must be under 500 characters' }]
        })
      });

      await expect(client.addToWatchlist('wl-123', 'AAPL', undefined, longNotes))
        .rejects.toThrow();
    });
  });

  describe('Remove from Watchlist', () => {
    test('removes stock from watchlist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          message: 'Stock removed from watchlist'
        })
      });

      const result = await client.removeFromWatchlist('wl-123', 'AAPL');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists/wl-123/items/AAPL'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.success).toBe(true);
    });

    test('handles removal of non-existent stock', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({
          error: 'Stock not in watchlist'
        })
      });

      await expect(client.removeFromWatchlist('wl-123', 'UNKNOWN'))
        .rejects.toThrow('Stock not in watchlist');
    });
  });

  describe('Delete Watchlist', () => {
    test('deletes watchlist successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          message: 'Watchlist deleted'
        })
      });

      const result = await client.deleteWatchlist('wl-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/watchlists/wl-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.success).toBe(true);
    });

    test('handles deletion of non-existent watchlist', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({
          error: 'Watchlist not found'
        })
      });

      await expect(client.deleteWatchlist('nonexistent'))
        .rejects.toThrow('Watchlist not found');
    });
  });

  describe('Watchlist Item Details', () => {
    test('includes stock fundamentals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{
            id: 'wl-1',
            items: [{
              symbol: 'AAPL',
              name: 'Apple Inc.',
              currentPrice: 175.50,
              change: 2.30,
              changePercent: 1.33,
              marketCap: 2800000000000,
              pe: 28.5,
              dividendYield: 0.5
            }]
          }]
        })
      });

      const result = await client.getWatchlists();
      const item = result.watchlists[0].items[0];

      expect(item.marketCap).toBe(2800000000000);
      expect(item.pe).toBe(28.5);
      expect(item.dividendYield).toBe(0.5);
    });

    test('calculates distance from target price', () => {
      const currentPrice = 175.50;
      const targetPrice = 200.00;
      const distancePercent = ((targetPrice - currentPrice) / currentPrice) * 100;

      expect(distancePercent).toBeCloseTo(13.96, 1);
    });

    test('tracks price since added', () => {
      const priceWhenAdded = 150.00;
      const currentPrice = 175.00;
      const gainSinceAdded = currentPrice - priceWhenAdded;
      const gainPercentSinceAdded = (gainSinceAdded / priceWhenAdded) * 100;

      expect(gainSinceAdded).toBe(25);
      expect(gainPercentSinceAdded).toBeCloseTo(16.67, 1);
    });
  });

  describe('Watchlist Sorting and Filtering', () => {
    test('sorts items by change percent', () => {
      const items = [
        { symbol: 'AAPL', changePercent: 1.5 },
        { symbol: 'NVDA', changePercent: 5.2 },
        { symbol: 'META', changePercent: -2.3 }
      ];

      const sorted = [...items].sort((a, b) => b.changePercent - a.changePercent);

      expect(sorted[0].symbol).toBe('NVDA');
      expect(sorted[2].symbol).toBe('META');
    });

    test('filters gainers', () => {
      const items = [
        { symbol: 'AAPL', changePercent: 1.5 },
        { symbol: 'NVDA', changePercent: 5.2 },
        { symbol: 'META', changePercent: -2.3 }
      ];

      const gainers = items.filter(item => item.changePercent > 0);

      expect(gainers).toHaveLength(2);
    });

    test('filters losers', () => {
      const items = [
        { symbol: 'AAPL', changePercent: 1.5 },
        { symbol: 'NVDA', changePercent: 5.2 },
        { symbol: 'META', changePercent: -2.3 }
      ];

      const losers = items.filter(item => item.changePercent < 0);

      expect(losers).toHaveLength(1);
      expect(losers[0].symbol).toBe('META');
    });

    test('searches items by symbol', () => {
      const items = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        { symbol: 'META', name: 'Meta Platforms' }
      ];

      const query = 'NV';
      const filtered = items.filter(item =>
        item.symbol.toUpperCase().includes(query.toUpperCase()) ||
        item.name.toUpperCase().includes(query.toUpperCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].symbol).toBe('NVDA');
    });
  });

  describe('Watchlist Statistics', () => {
    test('calculates watchlist summary', () => {
      const items = [
        { changePercent: 5.2 },
        { changePercent: 1.5 },
        { changePercent: -2.3 },
        { changePercent: 3.1 }
      ];

      const gainers = items.filter(i => i.changePercent > 0).length;
      const losers = items.filter(i => i.changePercent < 0).length;
      const avgChange = items.reduce((sum, i) => sum + i.changePercent, 0) / items.length;

      expect(gainers).toBe(3);
      expect(losers).toBe(1);
      expect(avgChange).toBeCloseTo(1.875, 2);
    });

    test('finds best and worst performers', () => {
      const items = [
        { symbol: 'AAPL', changePercent: 1.5 },
        { symbol: 'NVDA', changePercent: 5.2 },
        { symbol: 'META', changePercent: -2.3 }
      ];

      const best = items.reduce((max, item) =>
        item.changePercent > max.changePercent ? item : max
      );
      const worst = items.reduce((min, item) =>
        item.changePercent < min.changePercent ? item : min
      );

      expect(best.symbol).toBe('NVDA');
      expect(worst.symbol).toBe('META');
    });
  });

  describe('Edge Cases', () => {
    test('handles stock with no trading data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{
            id: 'wl-1',
            items: [{
              symbol: 'PRIVATE',
              currentPrice: null,
              change: null,
              changePercent: null
            }]
          }]
        })
      });

      const result = await client.getWatchlists();
      const item = result.watchlists[0].items[0];

      expect(item.currentPrice).toBeNull();
    });

    test('handles very large watchlist', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        symbol: `STOCK${i}`,
        currentPrice: 100 + i
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{ id: 'wl-1', items }]
        })
      });

      const result = await client.getWatchlists();

      expect(result.watchlists[0].items).toHaveLength(100);
    });

    test('handles special characters in watchlist name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          watchlist: { name: "John's Stocks & Options (2024)" }
        })
      });

      const result = await client.createWatchlist({
        name: "John's Stocks & Options (2024)"
      });

      expect(result.watchlist.name).toBe("John's Stocks & Options (2024)");
    });

    test('handles international stock symbols', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          item: { symbol: 'TSLA.MX' }
        })
      });

      const result = await client.addToWatchlist('wl-123', 'TSLA.MX');

      expect(result.item.symbol).toBe('TSLA.MX');
    });
  });

  describe('Real-time Updates', () => {
    test('refreshes watchlist quotes', async () => {
      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{
            id: 'wl-1',
            items: [{ symbol: 'AAPL', currentPrice: 175.50 }]
          }]
        })
      });

      // Second call (refresh)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          watchlists: [{
            id: 'wl-1',
            items: [{ symbol: 'AAPL', currentPrice: 176.00 }]
          }]
        })
      });

      const initial = await client.getWatchlists();
      const refreshed = await client.getWatchlists();

      expect(initial.watchlists[0].items[0].currentPrice).toBe(175.50);
      expect(refreshed.watchlists[0].items[0].currentPrice).toBe(176.00);
    });
  });
});
export {};
