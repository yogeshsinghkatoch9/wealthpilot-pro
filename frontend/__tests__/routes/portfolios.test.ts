/**
 * Portfolio CRUD Tests
 * Tests for portfolio creation, reading, updating, and deletion
 */

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
    setItem: jest.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
    removeItem: jest.fn((key: string) => { delete mockLocalStorage[key]; }),
    clear: jest.fn()
  }
});

Object.defineProperty(global, 'window', {
  value: { location: { href: '' } },
  writable: true
});

const { ApiClient } = require('../../src/api/client');

describe('Portfolio CRUD Operations', () => {
  let client: InstanceType<typeof ApiClient>;

  beforeEach(() => {
    client = new ApiClient();
    client.setToken('test-token');
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  describe('Create Portfolio', () => {
    test('creates portfolio with required fields', async () => {
      const newPortfolio = {
        name: 'My New Portfolio',
        currency: 'USD'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: {
            id: 'port-new-123',
            ...newPortfolio,
            totalValue: 0,
            cashBalance: 0,
            createdAt: '2024-06-15T10:00:00Z'
          }
        })
      });

      const result = await client.createPortfolio(newPortfolio);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newPortfolio)
        })
      );
      expect(result.portfolio.id).toBe('port-new-123');
      expect(result.portfolio.name).toBe('My New Portfolio');
    });

    test('creates portfolio with all optional fields', async () => {
      const fullPortfolio = {
        name: 'Complete Portfolio',
        description: 'A portfolio with all fields filled',
        currency: 'EUR',
        benchmark: 'SPY',
        cashBalance: 5000
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: { id: 'port-full-123', ...fullPortfolio }
        })
      });

      const result = await client.createPortfolio(fullPortfolio);

      expect(result.portfolio.description).toBe('A portfolio with all fields filled');
      expect(result.portfolio.benchmark).toBe('SPY');
      expect(result.portfolio.cashBalance).toBe(5000);
    });

    test('handles validation error on empty name', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          success: false,
          error: 'Validation failed',
          details: [{ field: 'name', message: 'Portfolio name must be 1-100 characters' }]
        })
      });

      await expect(client.createPortfolio({ name: '' }))
        .rejects.toThrow('Validation failed');
    });

    test('handles invalid currency code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          success: false,
          error: 'Validation failed',
          details: [{ field: 'currency', message: 'Invalid currency code' }]
        })
      });

      await expect(client.createPortfolio({ name: 'Test', currency: 'INVALID' }))
        .rejects.toThrow();
    });
  });

  describe('Read Portfolio', () => {
    test('fetches single portfolio by ID', async () => {
      const portfolioData = {
        id: 'port-123',
        name: 'Retirement Portfolio',
        totalValue: 150000,
        totalGain: 25000,
        totalGainPercent: 20,
        cashBalance: 5000,
        holdings: [
          { symbol: 'AAPL', shares: 100, value: 17500 },
          { symbol: 'GOOGL', shares: 50, value: 7000 }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(portfolioData)
      });

      const result = await client.getPortfolio('port-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.any(Object)
      );
      expect(result.id).toBe('port-123');
      expect(result.holdings).toHaveLength(2);
    });

    test('fetches all portfolios', async () => {
      const portfoliosData = {
        portfolios: [
          { id: 'port-1', name: 'Retirement', totalValue: 100000 },
          { id: 'port-2', name: 'Brokerage', totalValue: 50000 },
          { id: 'port-3', name: 'Savings', totalValue: 25000 }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(portfoliosData)
      });

      const result = await client.getPortfolios();

      expect(result.portfolios).toHaveLength(3);
      expect(result.portfolios[0].name).toBe('Retirement');
    });

    test('handles portfolio not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Portfolio not found' })
      });

      await expect(client.getPortfolio('nonexistent'))
        .rejects.toThrow('Portfolio not found');
    });

    test('fetches portfolio performance', async () => {
      const performanceData = {
        period: '1M',
        startValue: 140000,
        currentValue: 150000,
        gain: 10000,
        gainPercent: 7.14,
        benchmarkReturn: 5.5
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(performanceData)
      });

      const result = await client.getPortfolioPerformance('port-123', '1M');

      expect(result.gain).toBe(10000);
      expect(result.benchmarkReturn).toBe(5.5);
    });

    test('fetches portfolio allocation', async () => {
      const allocationData = {
        bySector: [
          { sector: 'Technology', percent: 45 },
          { sector: 'Healthcare', percent: 30 },
          { sector: 'Finance', percent: 25 }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(allocationData)
      });

      const result = await client.getPortfolioAllocation('port-123');

      expect(result.bySector).toHaveLength(3);
      expect(result.bySector[0].sector).toBe('Technology');
    });

    test('fetches portfolio risk metrics', async () => {
      const riskData = {
        beta: 1.15,
        sharpeRatio: 1.8,
        volatility: 18.5,
        maxDrawdown: -12.3
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(riskData)
      });

      const result = await client.getPortfolioRisk('port-123');

      expect(result.beta).toBe(1.15);
      expect(result.sharpeRatio).toBe(1.8);
    });
  });

  describe('Update Portfolio', () => {
    test('updates portfolio name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: { id: 'port-123', name: 'Updated Portfolio Name' }
        })
      });

      const result = await client.updatePortfolio('port-123', {
        name: 'Updated Portfolio Name'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Portfolio Name' })
        })
      );
      expect(result.portfolio.name).toBe('Updated Portfolio Name');
    });

    test('updates portfolio description', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: {
            id: 'port-123',
            description: 'New description for portfolio'
          }
        })
      });

      const result = await client.updatePortfolio('port-123', {
        description: 'New description for portfolio'
      });

      expect(result.portfolio.description).toBe('New description for portfolio');
    });

    test('updates multiple fields at once', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'Updated description',
        benchmark: 'QQQ'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: { id: 'port-123', ...updates }
        })
      });

      const result = await client.updatePortfolio('port-123', updates);

      expect(result.portfolio.name).toBe('Updated Name');
      expect(result.portfolio.benchmark).toBe('QQQ');
    });

    test('handles unauthorized update', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({
          error: 'Not authorized to update this portfolio'
        })
      });

      await expect(client.updatePortfolio('other-user-port', { name: 'Hack' }))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('Delete Portfolio', () => {
    test('deletes portfolio successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          message: 'Portfolio deleted successfully'
        })
      });

      const result = await client.deletePortfolio('port-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/port-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.success).toBe(true);
    });

    test('handles delete of non-existent portfolio', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Portfolio not found' })
      });

      await expect(client.deletePortfolio('nonexistent'))
        .rejects.toThrow('Portfolio not found');
    });

    test('handles unauthorized deletion', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({
          error: 'Not authorized to delete this portfolio'
        })
      });

      await expect(client.deletePortfolio('other-user-port'))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('Portfolio Holdings', () => {
    test('adds holding to portfolio', async () => {
      const holdingData = {
        portfolioId: 'port-123',
        symbol: 'AAPL',
        shares: 100,
        avgCost: 150.00
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          holding: {
            id: 'hold-new-123',
            ...holdingData,
            currentPrice: 175.00,
            value: 17500,
            gain: 2500
          }
        })
      });

      const result = await client.addHolding(holdingData);

      expect(result.holding.symbol).toBe('AAPL');
      expect(result.holding.value).toBe(17500);
    });

    test('updates holding shares', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          holding: { id: 'hold-123', shares: 150 }
        })
      });

      const result = await client.updateHolding('hold-123', { shares: 150 });

      expect(result.holding.shares).toBe(150);
    });

    test('sells shares from holding', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          transaction: {
            type: 'sell',
            shares: 50,
            price: 180.00,
            proceeds: 9000,
            gain: 1500
          }
        })
      });

      const result = await client.sellShares('hold-123', 50, 180.00, 'FIFO');

      expect(result.transaction.type).toBe('sell');
      expect(result.transaction.proceeds).toBe(9000);
    });

    test('deletes holding from portfolio', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          message: 'Holding deleted'
        })
      });

      const result = await client.deleteHolding('hold-123');

      expect(result.success).toBe(true);
    });
  });

  describe('Portfolio Transactions', () => {
    test('fetches transactions with filters', async () => {
      const transactionsData = {
        transactions: [
          { id: 'tx-1', type: 'buy', symbol: 'AAPL', shares: 10, price: 150 },
          { id: 'tx-2', type: 'dividend', symbol: 'AAPL', amount: 50 }
        ],
        total: 2,
        page: 1
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(transactionsData)
      });

      const result = await client.getTransactions({
        portfolioId: 'port-123',
        type: 'buy',
        limit: 50
      });

      expect(result.transactions).toHaveLength(2);
    });

    test('creates new transaction', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        symbol: 'MSFT',
        type: 'buy',
        shares: 25,
        price: 380.00
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          transaction: { id: 'tx-new', ...transactionData }
        })
      });

      const result = await client.createTransaction(transactionData);

      expect(result.transaction.symbol).toBe('MSFT');
      expect(result.transaction.type).toBe('buy');
    });

    test('imports multiple transactions', async () => {
      const transactions = [
        { symbol: 'AAPL', type: 'buy', shares: 10, price: 150 },
        { symbol: 'GOOGL', type: 'buy', shares: 5, price: 140 }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          imported: 2,
          failed: 0
        })
      });

      const result = await client.importTransactions('port-123', transactions);

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('Portfolio Dividends', () => {
    test('fetches portfolio dividends', async () => {
      const dividendData = {
        dividends: [
          { symbol: 'AAPL', amount: 125, date: '2024-05-15' },
          { symbol: 'MSFT', amount: 75, date: '2024-06-01' }
        ],
        totalReceived: 200,
        ytdTotal: 800
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(dividendData)
      });

      const result = await client.getPortfolioDividends('port-123');

      expect(result.dividends).toHaveLength(2);
      expect(result.totalReceived).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    test('handles very large portfolio value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'port-123',
          totalValue: 999999999.99,
          holdings: []
        })
      });

      const result = await client.getPortfolio('port-123');

      expect(result.totalValue).toBe(999999999.99);
    });

    test('handles fractional shares', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          holding: {
            symbol: 'AAPL',
            shares: 0.5678
          }
        })
      });

      const result = await client.addHolding({
        portfolioId: 'port-123',
        symbol: 'AAPL',
        shares: 0.5678,
        avgCost: 175.00
      });

      expect(result.holding.shares).toBe(0.5678);
    });

    test('handles special characters in portfolio name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          portfolio: { name: "John's Portfolio & Investments (2024)" }
        })
      });

      const result = await client.createPortfolio({
        name: "John's Portfolio & Investments (2024)"
      });

      expect(result.portfolio.name).toBe("John's Portfolio & Investments (2024)");
    });
  });
});
export {};
