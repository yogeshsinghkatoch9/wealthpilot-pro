/**
 * WealthPilot Pro - Holdings & Transactions Tests
 * Comprehensive test coverage for holdings and transaction operations
 */

const { mockDb, mockMarketData, testUtils } = require('../testSetup');

describe('Holdings Service', () => {
  let testUser;
  let testPortfolio;

  beforeEach(async () => {
    mockDb.reset();
    
    testUser = await mockDb.createUser({
      email: 'test@example.com',
      passwordHash: 'hashed'
    });

    testPortfolio = await mockDb.createPortfolio({
      userId: testUser.id,
      name: 'Test Portfolio',
      cashBalance: 50000
    });
  });

  describe('createHolding', () => {
    it('should create a new holding with valid data', async () => {
      const holdingData = testUtils.createTestHolding(testPortfolio.id);
      const holding = await mockDb.createHolding(holdingData);

      expect(holding).toBeDefined();
      expect(holding.id).toBeDefined();
      expect(holding.portfolioId).toBe(testPortfolio.id);
      expect(holding.symbol).toBe('AAPL');
      expect(holding.shares).toBe(100);
      expect(holding.avgCostBasis).toBe(150);
    });

    it('should create holding with different asset types', async () => {
      const etfHolding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'SPY',
        shares: 50,
        avgCostBasis: 475,
        assetType: 'etf'
      });

      expect(etfHolding.assetType).toBe('etf');
    });

    it('should handle fractional shares', async () => {
      const holding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AMZN',
        shares: 2.5,
        avgCostBasis: 178.35
      });

      expect(holding.shares).toBe(2.5);
    });

    it('should set sector for holding', async () => {
      const holding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150,
        sector: 'Technology'
      });

      expect(holding.sector).toBe('Technology');
    });
  });

  describe('getHoldingsByPortfolioId', () => {
    beforeEach(async () => {
      await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      });
      await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'GOOGL',
        shares: 50,
        avgCostBasis: 140
      });
      await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'MSFT',
        shares: 75,
        avgCostBasis: 375
      });
    });

    it('should retrieve all holdings for a portfolio', async () => {
      const holdings = await mockDb.getHoldingsByPortfolioId(testPortfolio.id);

      expect(holdings).toHaveLength(3);
      expect(holdings.map(h => h.symbol)).toContain('AAPL');
      expect(holdings.map(h => h.symbol)).toContain('GOOGL');
      expect(holdings.map(h => h.symbol)).toContain('MSFT');
    });

    it('should return empty array for portfolio with no holdings', async () => {
      const emptyPortfolio = await mockDb.createPortfolio({
        userId: testUser.id,
        name: 'Empty Portfolio'
      });

      const holdings = await mockDb.getHoldingsByPortfolioId(emptyPortfolio.id);
      expect(holdings).toHaveLength(0);
    });
  });

  describe('getHoldingBySymbol', () => {
    beforeEach(async () => {
      await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      });
    });

    it('should retrieve holding by symbol', async () => {
      const holding = await mockDb.getHoldingBySymbol(testPortfolio.id, 'AAPL');

      expect(holding).toBeDefined();
      expect(holding.symbol).toBe('AAPL');
      expect(holding.shares).toBe(100);
    });

    it('should return null for non-existent symbol', async () => {
      const holding = await mockDb.getHoldingBySymbol(testPortfolio.id, 'INVALID');
      expect(holding).toBeNull();
    });
  });

  describe('updateHolding', () => {
    let testHolding;

    beforeEach(async () => {
      testHolding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      });
    });

    it('should update shares count', async () => {
      const updated = await mockDb.updateHolding(testHolding.id, {
        shares: 150
      });

      expect(updated.shares).toBe(150);
    });

    it('should update average cost basis', async () => {
      const updated = await mockDb.updateHolding(testHolding.id, {
        avgCostBasis: 155.50
      });

      expect(updated.avgCostBasis).toBe(155.50);
    });

    it('should update notes', async () => {
      const updated = await mockDb.updateHolding(testHolding.id, {
        notes: 'Long-term hold'
      });

      expect(updated.notes).toBe('Long-term hold');
    });
  });

  describe('deleteHolding', () => {
    let testHolding;

    beforeEach(async () => {
      testHolding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      });
    });

    it('should delete holding', async () => {
      const result = await mockDb.deleteHolding(testHolding.id);
      expect(result).toBe(true);

      const holding = await mockDb.getHoldingById(testHolding.id);
      expect(holding).toBeNull();
    });
  });
});

describe('Transaction Service', () => {
  let testUser;
  let testPortfolio;

  beforeEach(async () => {
    mockDb.reset();
    
    testUser = await mockDb.createUser({
      email: 'test@example.com',
      passwordHash: 'hashed'
    });

    testPortfolio = await mockDb.createPortfolio({
      userId: testUser.id,
      name: 'Test Portfolio',
      cashBalance: 50000
    });
  });

  describe('createTransaction', () => {
    it('should create a buy transaction', async () => {
      const transaction = await mockDb.createTransaction({
        userId: testUser.id,
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        type: 'buy',
        shares: 10,
        price: 175.50,
        amount: 1755.00,
        fees: 0,
        executedAt: new Date()
      });

      expect(transaction).toBeDefined();
      expect(transaction.type).toBe('buy');
      expect(transaction.symbol).toBe('AAPL');
      expect(transaction.shares).toBe(10);
      expect(transaction.price).toBe(175.50);
      expect(transaction.amount).toBe(1755.00);
    });

    it('should create a sell transaction', async () => {
      const transaction = await mockDb.createTransaction({
        userId: testUser.id,
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        type: 'sell',
        shares: 5,
        price: 180.00,
        amount: 900.00,
        fees: 0,
        executedAt: new Date()
      });

      expect(transaction.type).toBe('sell');
      expect(transaction.amount).toBe(900.00);
    });

    it('should create a dividend transaction', async () => {
      const transaction = await mockDb.createTransaction({
        userId: testUser.id,
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        type: 'dividend',
        amount: 25.00,
        executedAt: new Date()
      });

      expect(transaction.type).toBe('dividend');
      expect(transaction.amount).toBe(25.00);
    });

    it('should handle transaction fees', async () => {
      const transaction = await mockDb.createTransaction({
        userId: testUser.id,
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        type: 'buy',
        shares: 10,
        price: 175.50,
        amount: 1755.00,
        fees: 4.95,
        executedAt: new Date()
      });

      expect(transaction.fees).toBe(4.95);
    });
  });

  describe('getTransactionsByPortfolioId', () => {
    beforeEach(async () => {
      // Create multiple transactions
      const dates = [
        new Date('2024-01-15'),
        new Date('2024-02-10'),
        new Date('2024-03-05')
      ];

      for (const date of dates) {
        await mockDb.createTransaction({
          userId: testUser.id,
          portfolioId: testPortfolio.id,
          symbol: 'AAPL',
          type: 'buy',
          shares: 10,
          price: 175.50,
          amount: 1755.00,
          executedAt: date
        });
      }
    });

    it('should retrieve transactions in reverse chronological order', async () => {
      const transactions = await mockDb.getTransactionsByPortfolioId(testPortfolio.id);

      expect(transactions).toHaveLength(3);
      expect(new Date(transactions[0].executedAt)).toEqual(new Date('2024-03-05'));
      expect(new Date(transactions[2].executedAt)).toEqual(new Date('2024-01-15'));
    });

    it('should return empty array for portfolio with no transactions', async () => {
      const emptyPortfolio = await mockDb.createPortfolio({
        userId: testUser.id,
        name: 'Empty Portfolio'
      });

      const transactions = await mockDb.getTransactionsByPortfolioId(emptyPortfolio.id);
      expect(transactions).toHaveLength(0);
    });
  });

  describe('Transaction Impact on Holdings', () => {
    let testHolding;

    beforeEach(async () => {
      testHolding = await mockDb.createHolding({
        portfolioId: testPortfolio.id,
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      });
    });

    it('should calculate new average cost after buy', async () => {
      const existingShares = testHolding.shares;
      const existingCost = testHolding.avgCostBasis;
      const newShares = 50;
      const newPrice = 180;

      const totalShares = existingShares + newShares;
      const totalCost = (existingShares * existingCost) + (newShares * newPrice);
      const newAvgCost = totalCost / totalShares;

      expect(newAvgCost).toBe(160);
    });

    it('should calculate realized gain/loss on sell', async () => {
      const sellShares = 50;
      const sellPrice = 180;
      const costBasis = testHolding.avgCostBasis;

      const proceeds = sellShares * sellPrice;
      const cost = sellShares * costBasis;
      const realizedGain = proceeds - cost;

      expect(realizedGain).toBe(1500);
    });
  });
});

describe('Market Data Integration', () => {
  describe('getQuote', () => {
    it('should return quote for valid symbol', async () => {
      const quote = await mockMarketData.getQuote('AAPL');

      expect(quote).toBeDefined();
      expect(quote.symbol).toBe('AAPL');
      expect(quote.price).toBe(175.50);
      expect(quote.change).toBe(2.30);
      expect(quote.changePercent).toBe(1.33);
    });

    it('should return generated quote for unknown symbol', async () => {
      const quote = await mockMarketData.getQuote('UNKNOWN');

      expect(quote).toBeDefined();
      expect(quote.symbol).toBe('UNKNOWN');
      expect(typeof quote.price).toBe('number');
    });
  });

  describe('getBatchQuotes', () => {
    it('should return quotes for multiple symbols', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT'];
      const quotes = await mockMarketData.getBatchQuotes(symbols);

      expect(Object.keys(quotes)).toHaveLength(3);
      expect(quotes['AAPL'].price).toBe(175.50);
      expect(quotes['GOOGL'].price).toBe(140.25);
      expect(quotes['MSFT'].price).toBe(378.90);
    });
  });

  describe('getHistoricalData', () => {
    it('should return historical data for 1 year', async () => {
      const history = await mockMarketData.getHistoricalData('AAPL', '1Y');

      expect(history.length).toBeGreaterThan(300);
      expect(history[0]).toHaveProperty('date');
      expect(history[0]).toHaveProperty('open');
      expect(history[0]).toHaveProperty('high');
      expect(history[0]).toHaveProperty('low');
      expect(history[0]).toHaveProperty('close');
      expect(history[0]).toHaveProperty('volume');
    });

    it('should return historical data for 1 month', async () => {
      const history = await mockMarketData.getHistoricalData('AAPL', '1M');

      expect(history.length).toBeGreaterThan(25);
      expect(history.length).toBeLessThan(35);
    });
  });
});

describe('Cost Basis Calculations', () => {
  describe('FIFO Method', () => {
    it('should calculate FIFO cost basis', () => {
      const taxLots = [
        { shares: 50, costBasis: 100, purchaseDate: new Date('2024-01-01') },
        { shares: 50, costBasis: 150, purchaseDate: new Date('2024-02-01') },
        { shares: 50, costBasis: 200, purchaseDate: new Date('2024-03-01') }
      ];

      const sharesToSell = 75;
      let remaining = sharesToSell;
      let totalCost = 0;

      // Sort by purchase date (oldest first)
      taxLots.sort((a, b) => a.purchaseDate - b.purchaseDate);

      for (const lot of taxLots) {
        if (remaining <= 0) break;
        const sharesToUse = Math.min(lot.shares, remaining);
        totalCost += sharesToUse * lot.costBasis;
        remaining -= sharesToUse;
      }

      // First 50 at $100, next 25 at $150
      expect(totalCost).toBe(50 * 100 + 25 * 150);
      expect(totalCost).toBe(8750);
    });
  });

  describe('LIFO Method', () => {
    it('should calculate LIFO cost basis', () => {
      const taxLots = [
        { shares: 50, costBasis: 100, purchaseDate: new Date('2024-01-01') },
        { shares: 50, costBasis: 150, purchaseDate: new Date('2024-02-01') },
        { shares: 50, costBasis: 200, purchaseDate: new Date('2024-03-01') }
      ];

      const sharesToSell = 75;
      let remaining = sharesToSell;
      let totalCost = 0;

      // Sort by purchase date (newest first)
      taxLots.sort((a, b) => b.purchaseDate - a.purchaseDate);

      for (const lot of taxLots) {
        if (remaining <= 0) break;
        const sharesToUse = Math.min(lot.shares, remaining);
        totalCost += sharesToUse * lot.costBasis;
        remaining -= sharesToUse;
      }

      // First 50 at $200, next 25 at $150
      expect(totalCost).toBe(50 * 200 + 25 * 150);
      expect(totalCost).toBe(13750);
    });
  });

  describe('HIFO Method', () => {
    it('should calculate HIFO cost basis', () => {
      const taxLots = [
        { shares: 50, costBasis: 100, purchaseDate: new Date('2024-01-01') },
        { shares: 50, costBasis: 200, purchaseDate: new Date('2024-02-01') },
        { shares: 50, costBasis: 150, purchaseDate: new Date('2024-03-01') }
      ];

      const sharesToSell = 75;
      let remaining = sharesToSell;
      let totalCost = 0;

      // Sort by cost basis (highest first)
      taxLots.sort((a, b) => b.costBasis - a.costBasis);

      for (const lot of taxLots) {
        if (remaining <= 0) break;
        const sharesToUse = Math.min(lot.shares, remaining);
        totalCost += sharesToUse * lot.costBasis;
        remaining -= sharesToUse;
      }

      // First 50 at $200, next 25 at $150
      expect(totalCost).toBe(50 * 200 + 25 * 150);
      expect(totalCost).toBe(13750);
    });
  });
});
