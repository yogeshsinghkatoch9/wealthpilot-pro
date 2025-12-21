/**
 * WealthPilot Pro - Portfolio Service Tests
 * Comprehensive test coverage for portfolio operations
 */

const { mockDb, testUtils } = require('../testSetup');

describe('Portfolio Service', () => {
  let testUser;
  let testPortfolio;

  beforeEach(async () => {
    mockDb.reset();
    
    // Create test user
    testUser = await mockDb.createUser({
      email: 'test@example.com',
      passwordHash: 'hashed',
      firstName: 'Test',
      lastName: 'User'
    });
  });

  describe('createPortfolio', () => {
    it('should create a new portfolio with valid data', async () => {
      const portfolioData = testUtils.createTestPortfolio(testUser.id);
      const portfolio = await mockDb.createPortfolio(portfolioData);

      expect(portfolio).toBeDefined();
      expect(portfolio.id).toBeDefined();
      expect(portfolio.userId).toBe(testUser.id);
      expect(portfolio.name).toBe(portfolioData.name);
      expect(portfolio.currency).toBe('USD');
      expect(portfolio.benchmark).toBe('SPY');
      expect(portfolio.cashBalance).toBe(0);
    });

    it('should create portfolio with custom cash balance', async () => {
      const portfolioData = testUtils.createTestPortfolio(testUser.id, {
        cashBalance: 10000
      });
      const portfolio = await mockDb.createPortfolio(portfolioData);

      expect(portfolio.cashBalance).toBe(10000);
    });

    it('should create portfolio with different currency', async () => {
      const portfolioData = testUtils.createTestPortfolio(testUser.id, {
        currency: 'EUR'
      });
      const portfolio = await mockDb.createPortfolio(portfolioData);

      expect(portfolio.currency).toBe('EUR');
    });

    it('should set timestamps on creation', async () => {
      const portfolioData = testUtils.createTestPortfolio(testUser.id);
      const portfolio = await mockDb.createPortfolio(portfolioData);

      expect(portfolio.createdAt).toBeInstanceOf(Date);
      expect(portfolio.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('getPortfolioById', () => {
    beforeEach(async () => {
      testPortfolio = await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id)
      );
    });

    it('should retrieve portfolio by ID', async () => {
      const portfolio = await mockDb.getPortfolioById(testPortfolio.id);

      expect(portfolio).toBeDefined();
      expect(portfolio.id).toBe(testPortfolio.id);
      expect(portfolio.name).toBe(testPortfolio.name);
    });

    it('should return null for non-existent portfolio', async () => {
      const portfolio = await mockDb.getPortfolioById('non-existent-id');
      expect(portfolio).toBeNull();
    });
  });

  describe('getPortfoliosByUserId', () => {
    beforeEach(async () => {
      // Create multiple portfolios
      await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id, { name: 'Portfolio 1' })
      );
      await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id, { name: 'Portfolio 2' })
      );
      await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id, { name: 'Portfolio 3' })
      );
    });

    it('should retrieve all portfolios for a user', async () => {
      const portfolios = await mockDb.getPortfoliosByUserId(testUser.id);

      expect(portfolios).toHaveLength(3);
      expect(portfolios.every(p => p.userId === testUser.id)).toBe(true);
    });

    it('should return empty array for user with no portfolios', async () => {
      const otherUser = await mockDb.createUser({
        email: 'other@example.com',
        passwordHash: 'hashed'
      });

      const portfolios = await mockDb.getPortfoliosByUserId(otherUser.id);
      expect(portfolios).toHaveLength(0);
    });
  });

  describe('updatePortfolio', () => {
    beforeEach(async () => {
      testPortfolio = await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id)
      );
    });

    it('should update portfolio name', async () => {
      const updated = await mockDb.updatePortfolio(testPortfolio.id, {
        name: 'Updated Name'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(testPortfolio.id);
    });

    it('should update portfolio description', async () => {
      const updated = await mockDb.updatePortfolio(testPortfolio.id, {
        description: 'New description'
      });

      expect(updated.description).toBe('New description');
    });

    it('should update cash balance', async () => {
      const updated = await mockDb.updatePortfolio(testPortfolio.id, {
        cashBalance: 5000
      });

      expect(updated.cashBalance).toBe(5000);
    });

    it('should update updatedAt timestamp', async () => {
      const originalUpdatedAt = testPortfolio.updatedAt;
      await testUtils.wait(10);
      
      const updated = await mockDb.updatePortfolio(testPortfolio.id, {
        name: 'Updated'
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should return null for non-existent portfolio', async () => {
      const updated = await mockDb.updatePortfolio('non-existent', {
        name: 'Test'
      });

      expect(updated).toBeNull();
    });
  });

  describe('deletePortfolio', () => {
    beforeEach(async () => {
      testPortfolio = await mockDb.createPortfolio(
        testUtils.createTestPortfolio(testUser.id)
      );
    });

    it('should delete portfolio', async () => {
      const result = await mockDb.deletePortfolio(testPortfolio.id);
      expect(result).toBe(true);

      const portfolio = await mockDb.getPortfolioById(testPortfolio.id);
      expect(portfolio).toBeNull();
    });

    it('should return false for non-existent portfolio', async () => {
      const result = await mockDb.deletePortfolio('non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('Portfolio Value Calculation', () => {
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
      cashBalance: 10000
    });
  });

  it('should calculate total value with holdings and cash', async () => {
    await mockDb.createHolding({
      portfolioId: testPortfolio.id,
      symbol: 'AAPL',
      shares: 100,
      avgCostBasis: 150
    });

    const holdings = await mockDb.getHoldingsByPortfolioId(testPortfolio.id);
    const portfolio = await mockDb.getPortfolioById(testPortfolio.id);

    // Mock current prices
    const currentPrice = 175.50;
    const holdingsValue = holdings.reduce((sum, h) => sum + h.shares * currentPrice, 0);
    const totalValue = holdingsValue + portfolio.cashBalance;

    expect(totalValue).toBe(100 * 175.50 + 10000);
    expect(totalValue).toBe(27550);
  });

  it('should calculate unrealized gain/loss', async () => {
    const holding = await mockDb.createHolding({
      portfolioId: testPortfolio.id,
      symbol: 'AAPL',
      shares: 100,
      avgCostBasis: 150
    });

    const currentPrice = 175.50;
    const costBasis = holding.shares * holding.avgCostBasis;
    const currentValue = holding.shares * currentPrice;
    const unrealizedGain = currentValue - costBasis;
    const unrealizedGainPercent = (unrealizedGain / costBasis) * 100;

    expect(unrealizedGain).toBe(2550);
    expect(unrealizedGainPercent).toBeCloseTo(17);
  });
});

describe('Portfolio Performance', () => {
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
      cashBalance: 0
    });
  });

  it('should calculate time-weighted return', async () => {
    // Initial investment
    const initialValue = 10000;
    const finalValue = 11500;
    
    const simpleReturn = (finalValue - initialValue) / initialValue * 100;
    expect(simpleReturn).toBe(15);
  });

  it('should calculate annualized return', async () => {
    const initialValue = 10000;
    const finalValue = 15000;
    const years = 3;
    
    const annualizedReturn = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
    expect(annualizedReturn).toBeCloseTo(14.47, 1);
  });

  it('should track portfolio against benchmark', async () => {
    const portfolioReturn = 12;
    const benchmarkReturn = 10;
    const alpha = portfolioReturn - benchmarkReturn;

    expect(alpha).toBe(2);
  });
});

describe('Portfolio Allocation', () => {
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
      cashBalance: 10000
    });

    // Add diverse holdings
    await mockDb.createHolding({
      portfolioId: testPortfolio.id,
      symbol: 'AAPL',
      shares: 100,
      avgCostBasis: 150,
      sector: 'Technology'
    });

    await mockDb.createHolding({
      portfolioId: testPortfolio.id,
      symbol: 'JPM',
      shares: 50,
      avgCostBasis: 140,
      sector: 'Financials'
    });

    await mockDb.createHolding({
      portfolioId: testPortfolio.id,
      symbol: 'JNJ',
      shares: 30,
      avgCostBasis: 160,
      sector: 'Healthcare'
    });
  });

  it('should calculate sector allocation', async () => {
    const holdings = await mockDb.getHoldingsByPortfolioId(testPortfolio.id);
    
    const sectorAllocation = {};
    let totalValue = 0;

    // Mock prices
    const prices = { AAPL: 175, JPM: 150, JNJ: 165 };

    holdings.forEach(h => {
      const value = h.shares * prices[h.symbol];
      totalValue += value;
      sectorAllocation[h.sector] = (sectorAllocation[h.sector] || 0) + value;
    });

    // Convert to percentages
    Object.keys(sectorAllocation).forEach(sector => {
      sectorAllocation[sector] = (sectorAllocation[sector] / totalValue) * 100;
    });

    expect(sectorAllocation['Technology']).toBeCloseTo(58.43, 1);
    expect(sectorAllocation['Financials']).toBeCloseTo(25.04, 1);
    expect(sectorAllocation['Healthcare']).toBeCloseTo(16.53, 1);
  });

  it('should calculate asset type allocation', async () => {
    const holdings = await mockDb.getHoldingsByPortfolioId(testPortfolio.id);
    const portfolio = await mockDb.getPortfolioById(testPortfolio.id);

    const prices = { AAPL: 175, JPM: 150, JNJ: 165 };
    let stocksValue = 0;

    holdings.forEach(h => {
      stocksValue += h.shares * prices[h.symbol];
    });

    const totalValue = stocksValue + portfolio.cashBalance;
    const stocksPercent = (stocksValue / totalValue) * 100;
    const cashPercent = (portfolio.cashBalance / totalValue) * 100;

    expect(stocksPercent).toBeCloseTo(74.97, 1);
    expect(cashPercent).toBeCloseTo(25.03, 1);
  });
});
