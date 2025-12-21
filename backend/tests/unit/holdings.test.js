/**
 * Holdings Tests
 * Tests for holdings management and calculations
 */

describe('Holdings Management', () => {
  let db;

  beforeAll(async () => {
    db = await global.setupTestDatabase();
    await global.seedTestData();
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  describe('Holdings CRUD', () => {
    it('should create a new holding', () => {
      const newHolding = {
        id: global.generateId(),
        portfolioId: global.testPortfolio.id,
        symbol: 'GOOGL',
        shares: 50,
        costBasis: 2800.00,
        currentPrice: 2950.00
      };

      const result = db.prepare(`
        INSERT INTO holdings (id, portfolio_id, symbol, shares, cost_basis, current_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newHolding.id, newHolding.portfolioId, newHolding.symbol, newHolding.shares, newHolding.costBasis, newHolding.currentPrice);

      expect(result.changes).toBe(1);
    });

    it('should fetch holding by id', () => {
      const holding = db.prepare('SELECT * FROM holdings WHERE id = ?').get(global.testHolding.id);
      expect(holding).toBeDefined();
      expect(holding.symbol).toBe(global.testHolding.symbol);
    });

    it('should fetch all holdings for portfolio', () => {
      const holdings = db.prepare('SELECT * FROM holdings WHERE portfolio_id = ?').all(global.testPortfolio.id);
      expect(holdings).toBeDefined();
      expect(holdings.length).toBeGreaterThanOrEqual(1);
    });

    it('should update holding shares', () => {
      const newShares = 150;

      const result = db.prepare('UPDATE holdings SET shares = ? WHERE id = ?').run(newShares, global.testHolding.id);
      expect(result.changes).toBe(1);

      const holding = db.prepare('SELECT * FROM holdings WHERE id = ?').get(global.testHolding.id);
      expect(holding.shares).toBe(newShares);

      // Restore original
      db.prepare('UPDATE holdings SET shares = ? WHERE id = ?').run(global.testHolding.shares, global.testHolding.id);
    });

    it('should delete holding', () => {
      const tempId = global.generateId();

      db.prepare(`
        INSERT INTO holdings (id, portfolio_id, symbol, shares, cost_basis)
        VALUES (?, ?, ?, ?, ?)
      `).run(tempId, global.testPortfolio.id, 'TEMP', 10, 100);

      const result = db.prepare('DELETE FROM holdings WHERE id = ?').run(tempId);
      expect(result.changes).toBe(1);
    });
  });

  describe('Holdings Validation', () => {
    it('should validate symbol format', () => {
      const validateSymbol = (symbol) => {
        if (!symbol) return false;
        // Stock symbols are 1-5 uppercase letters
        return /^[A-Z]{1,5}$/.test(symbol.toUpperCase());
      };

      expect(validateSymbol('AAPL')).toBe(true);
      expect(validateSymbol('A')).toBe(true);
      expect(validateSymbol('GOOGL')).toBe(true);
      expect(validateSymbol('')).toBe(false);
      expect(validateSymbol('TOOLONG')).toBe(false);
      expect(validateSymbol('123')).toBe(false);
      expect(validateSymbol('aa-pl')).toBe(false);
    });

    it('should validate shares are positive', () => {
      const validateShares = (shares) => {
        return typeof shares === 'number' && shares > 0;
      };

      expect(validateShares(100)).toBe(true);
      expect(validateShares(0.5)).toBe(true);
      expect(validateShares(0)).toBe(false);
      expect(validateShares(-10)).toBe(false);
      expect(validateShares('100')).toBe(false);
    });

    it('should validate cost basis is non-negative', () => {
      const validateCostBasis = (costBasis) => {
        return typeof costBasis === 'number' && costBasis >= 0;
      };

      expect(validateCostBasis(100)).toBe(true);
      expect(validateCostBasis(0)).toBe(true);
      expect(validateCostBasis(-10)).toBe(false);
    });
  });

  describe('Holdings Calculations', () => {
    it('should calculate holding value', () => {
      const calculateValue = (shares, price) => shares * price;

      expect(calculateValue(100, 150)).toBe(15000);
      expect(calculateValue(0.5, 200)).toBe(100);
      expect(calculateValue(0, 100)).toBe(0);
    });

    it('should calculate unrealized gain/loss', () => {
      const calculateUnrealizedGainLoss = (shares, currentPrice, costBasis) => {
        const currentValue = shares * currentPrice;
        const totalCost = shares * costBasis;
        return {
          amount: currentValue - totalCost,
          percentage: totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0
        };
      };

      const gain = calculateUnrealizedGainLoss(100, 175, 150);
      expect(gain.amount).toBe(2500);
      expect(gain.percentage).toBeCloseTo(16.67, 1);

      const loss = calculateUnrealizedGainLoss(100, 140, 150);
      expect(loss.amount).toBe(-1000);
      expect(loss.percentage).toBeCloseTo(-6.67, 1);
    });

    it('should calculate average cost basis', () => {
      const transactions = [
        { shares: 50, price: 100 }, // $5000
        { shares: 30, price: 120 }, // $3600
        { shares: 20, price: 90 } // $1800
      ];

      const totalShares = transactions.reduce((sum, t) => sum + t.shares, 0);
      const totalCost = transactions.reduce((sum, t) => sum + (t.shares * t.price), 0);
      const avgCostBasis = totalCost / totalShares;

      expect(totalShares).toBe(100);
      expect(totalCost).toBe(10400);
      expect(avgCostBasis).toBe(104);
    });

    it('should calculate weight in portfolio', () => {
      const holdingValue = 15000;
      const portfolioValue = 50000;
      
      const weight = (holdingValue / portfolioValue) * 100;
      expect(weight).toBe(30);
    });
  });

  describe('Tax Lot Calculations', () => {
    it('should calculate FIFO cost basis', () => {
      const taxLots = [
        { date: '2023-01-01', shares: 50, price: 100 },
        { date: '2023-06-01', shares: 30, price: 120 },
        { date: '2023-12-01', shares: 20, price: 90 }
      ];

      const sellShares = 60;
      let remaining = sellShares;
      let totalCost = 0;
      const usedLots = [];

      // FIFO: First In, First Out
      for (const lot of taxLots) {
        if (remaining <= 0) break;
        const useShares = Math.min(lot.shares, remaining);
        totalCost += useShares * lot.price;
        remaining -= useShares;
        usedLots.push({ ...lot, usedShares: useShares });
      }

      // 50 shares at $100 + 10 shares at $120
      expect(totalCost).toBe(6200);
    });

    it('should calculate LIFO cost basis', () => {
      const taxLots = [
        { date: '2023-01-01', shares: 50, price: 100 },
        { date: '2023-06-01', shares: 30, price: 120 },
        { date: '2023-12-01', shares: 20, price: 90 }
      ];

      const sellShares = 60;
      let remaining = sellShares;
      let totalCost = 0;

      // LIFO: Last In, First Out
      for (let i = taxLots.length - 1; i >= 0 && remaining > 0; i--) {
        const lot = taxLots[i];
        const useShares = Math.min(lot.shares, remaining);
        totalCost += useShares * lot.price;
        remaining -= useShares;
      }

      // 20 shares at $90 + 30 shares at $120 + 10 shares at $100 = 1800 + 3600 + 1000 = 6400
      expect(totalCost).toBe(6400);
    });

    it('should calculate HIFO cost basis', () => {
      const taxLots = [
        { date: '2023-01-01', shares: 50, price: 100 },
        { date: '2023-06-01', shares: 30, price: 120 },
        { date: '2023-12-01', shares: 20, price: 90 }
      ];

      const sellShares = 60;
      let remaining = sellShares;
      let totalCost = 0;

      // HIFO: Highest In, First Out - sort by price descending
      const sortedLots = [...taxLots].sort((a, b) => b.price - a.price);

      for (const lot of sortedLots) {
        if (remaining <= 0) break;
        const useShares = Math.min(lot.shares, remaining);
        totalCost += useShares * lot.price;
        remaining -= useShares;
      }

      // 30 shares at $120 + 30 shares at $100
      expect(totalCost).toBe(6600);
    });

    it('should determine long-term vs short-term gains', () => {
      const isLongTerm = (purchaseDate) => {
        const purchase = new Date(purchaseDate);
        const now = new Date();
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        return (now - purchase) >= oneYear;
      };

      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      expect(isLongTerm(oldDate.toISOString())).toBe(true);

      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 6);
      expect(isLongTerm(recentDate.toISOString())).toBe(false);
    });
  });

  describe('Dividend Calculations', () => {
    it('should calculate dividend income', () => {
      const shares = 100;
      const dividendPerShare = 0.25;
      const frequency = 4; // quarterly

      const quarterlyIncome = shares * dividendPerShare;
      const annualIncome = quarterlyIncome * frequency;

      expect(quarterlyIncome).toBe(25);
      expect(annualIncome).toBe(100);
    });

    it('should calculate dividend yield', () => {
      const annualDividend = 4.00;
      const stockPrice = 150.00;
      
      const yield_ = (annualDividend / stockPrice) * 100;
      expect(yield_).toBeCloseTo(2.67, 1);
    });

    it('should calculate yield on cost', () => {
      const annualDividend = 4.00;
      const costBasis = 100.00;
      
      const yieldOnCost = (annualDividend / costBasis) * 100;
      expect(yieldOnCost).toBe(4);
    });
  });
});
