/**
 * Portfolio Tests
 * Tests for portfolio CRUD operations and calculations
 */

describe('Portfolio Management', () => {
  let db;

  beforeAll(async () => {
    db = await global.setupTestDatabase();
    await global.seedTestData();
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  describe('Portfolio CRUD', () => {
    it('should create a new portfolio', () => {
      const newPortfolio = {
        id: global.generateId(),
        userId: global.testUser.id,
        name: 'New Test Portfolio',
        description: 'A newly created portfolio'
      };

      const result = db.prepare(`
        INSERT INTO portfolios (id, user_id, name, description)
        VALUES (?, ?, ?, ?)
      `).run(newPortfolio.id, newPortfolio.userId, newPortfolio.name, newPortfolio.description);

      expect(result.changes).toBe(1);
    });

    it('should fetch portfolio by id', () => {
      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(global.testPortfolio.id);
      expect(portfolio).toBeDefined();
      expect(portfolio.name).toBe(global.testPortfolio.name);
    });

    it('should fetch all portfolios for user', () => {
      const portfolios = db.prepare('SELECT * FROM portfolios WHERE user_id = ?').all(global.testUser.id);
      expect(portfolios).toBeDefined();
      expect(portfolios.length).toBeGreaterThanOrEqual(1);
    });

    it('should update portfolio', () => {
      const newName = 'Updated Portfolio Name';

      const result = db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(newName, global.testPortfolio.id);
      expect(result.changes).toBe(1);

      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(global.testPortfolio.id);
      expect(portfolio.name).toBe(newName);
    });

    it('should soft delete portfolio', () => {
      const result = db.prepare("UPDATE portfolios SET deleted_at = datetime('now') WHERE id = ?").run(global.testPortfolio.id);
      expect(result.changes).toBe(1);

      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(global.testPortfolio.id);
      expect(portfolio.deleted_at).toBeDefined();

      // Restore for other tests
      db.prepare('UPDATE portfolios SET deleted_at = NULL WHERE id = ?').run(global.testPortfolio.id);
    });

    it('should not return deleted portfolios in normal queries', () => {
      const deletedId = global.generateId();

      db.prepare(`
        INSERT INTO portfolios (id, user_id, name, deleted_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(deletedId, global.testUser.id, 'Deleted Portfolio');

      const portfolios = db.prepare('SELECT * FROM portfolios WHERE user_id = ? AND deleted_at IS NULL').all(global.testUser.id);
      const foundDeleted = portfolios.find(p => p.id === deletedId);
      expect(foundDeleted).toBeUndefined();
    });
  });

  describe('Portfolio Validation', () => {
    it('should require portfolio name', () => {
      const validatePortfolio = (portfolio) => {
        const errors = [];
        if (!portfolio.name || portfolio.name.trim() === '') {
          errors.push('Portfolio name is required');
        }
        if (portfolio.name && portfolio.name.length > 100) {
          errors.push('Portfolio name must be less than 100 characters');
        }
        return errors;
      };

      expect(validatePortfolio({ name: '' })).toContain('Portfolio name is required');
      expect(validatePortfolio({ name: null })).toContain('Portfolio name is required');
      expect(validatePortfolio({ name: 'Valid Name' })).toHaveLength(0);
      expect(validatePortfolio({ name: 'a'.repeat(101) })).toContain('Portfolio name must be less than 100 characters');
    });

    it('should validate user ownership', () => {
      const checkOwnership = (portfolioId, userId) => {
        const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ? AND user_id = ?').get(portfolioId, userId);
        return !!portfolio;
      };

      const isOwner = checkOwnership(global.testPortfolio.id, global.testUser.id);
      expect(isOwner).toBe(true);

      const notOwner = checkOwnership(global.testPortfolio.id, 'wrong-user-id');
      expect(notOwner).toBe(false);
    });
  });

  describe('Portfolio Calculations', () => {
    it('should calculate total portfolio value', () => {
      const holdings = [
        { shares: 100, currentPrice: 150.00 },
        { shares: 50, currentPrice: 200.00 },
        { shares: 200, currentPrice: 50.00 }
      ];

      const totalValue = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
      
      // 100*150 + 50*200 + 200*50 = 15000 + 10000 + 10000 = 35000
      expect(totalValue).toBe(35000);
    });

    it('should calculate total cost basis', () => {
      const holdings = [
        { shares: 100, costBasis: 120.00 },
        { shares: 50, costBasis: 180.00 },
        { shares: 200, costBasis: 45.00 }
      ];

      const totalCost = holdings.reduce((sum, h) => sum + (h.shares * h.costBasis), 0);
      
      // 100*120 + 50*180 + 200*45 = 12000 + 9000 + 9000 = 30000
      expect(totalCost).toBe(30000);
    });

    it('should calculate gain/loss', () => {
      const calculateGainLoss = (currentValue, costBasis) => {
        return {
          amount: currentValue - costBasis,
          percentage: ((currentValue - costBasis) / costBasis) * 100
        };
      };

      const result = calculateGainLoss(35000, 30000);
      expect(result.amount).toBe(5000);
      expect(result.percentage).toBeCloseTo(16.67, 1);
    });

    it('should calculate allocation percentages', () => {
      const holdings = [
        { symbol: 'AAPL', value: 15000 },
        { symbol: 'GOOGL', value: 10000 },
        { symbol: 'MSFT', value: 10000 }
      ];

      const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
      
      const allocations = holdings.map(h => ({
        symbol: h.symbol,
        allocation: (h.value / totalValue) * 100
      }));

      expect(allocations[0].allocation).toBeCloseTo(42.86, 1);
      expect(allocations[1].allocation).toBeCloseTo(28.57, 1);
      expect(allocations[2].allocation).toBeCloseTo(28.57, 1);
      
      const totalAllocation = allocations.reduce((sum, a) => sum + a.allocation, 0);
      expect(totalAllocation).toBeCloseTo(100, 0);
    });

    it('should handle empty portfolio', () => {
      const holdings = [];
      
      const totalValue = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
      expect(totalValue).toBe(0);
    });
  });

  describe('Portfolio Performance', () => {
    it('should calculate daily return', () => {
      const calculateDailyReturn = (todayValue, yesterdayValue) => {
        if (yesterdayValue === 0) return 0;
        return ((todayValue - yesterdayValue) / yesterdayValue) * 100;
      };

      expect(calculateDailyReturn(10500, 10000)).toBe(5);
      expect(calculateDailyReturn(9500, 10000)).toBe(-5);
      expect(calculateDailyReturn(10000, 10000)).toBe(0);
      expect(calculateDailyReturn(10000, 0)).toBe(0);
    });

    it('should calculate cumulative return', () => {
      const calculateCumulativeReturn = (currentValue, initialValue) => {
        if (initialValue === 0) return 0;
        return ((currentValue - initialValue) / initialValue) * 100;
      };

      expect(calculateCumulativeReturn(15000, 10000)).toBe(50);
      expect(calculateCumulativeReturn(8000, 10000)).toBe(-20);
    });

    it('should calculate annualized return', () => {
      const calculateAnnualizedReturn = (totalReturn, years) => {
        if (years <= 0) return 0;
        return (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
      };

      // 50% return over 3 years
      const annualized = calculateAnnualizedReturn(50, 3);
      expect(annualized).toBeCloseTo(14.47, 1);
    });

    it('should compare against benchmark', () => {
      const portfolioReturn = 12.5;
      const benchmarkReturn = 10.0;
      
      const alpha = portfolioReturn - benchmarkReturn;
      expect(alpha).toBe(2.5);
      
      const outperformed = portfolioReturn > benchmarkReturn;
      expect(outperformed).toBe(true);
    });
  });
});
