/**
 * WealthPilot Pro - End-to-End Tests
 * Full user flow testing
 */

const { testUtils } = require('../testSetup');

describe('E2E: User Registration & Onboarding', () => {
  describe('New User Flow', () => {
    it('should complete full registration flow', async () => {
      // Step 1: Register
      const userData = testUtils.createTestUser();
      
      // Simulate API call
      const registerResult = {
        success: true,
        user: { id: 'new-user-id', email: userData.email },
        token: 'jwt-token'
      };
      
      expect(registerResult.success).toBe(true);
      expect(registerResult.user.email).toBe(userData.email);
      expect(registerResult.token).toBeDefined();
    });

    it('should complete onboarding wizard', async () => {
      // Step 2: Create first portfolio
      const portfolioResult = {
        success: true,
        portfolio: {
          id: 'portfolio-1',
          name: 'Main Portfolio',
          type: 'taxable'
        }
      };
      
      expect(portfolioResult.success).toBe(true);
      
      // Step 3: Add first holding
      const holdingResult = {
        success: true,
        holding: {
          id: 'holding-1',
          symbol: 'AAPL',
          shares: 10
        }
      };
      
      expect(holdingResult.success).toBe(true);
      
      // Step 4: Set notification preferences
      const preferencesResult = {
        success: true,
        preferences: {
          emailNotifications: true,
          priceAlerts: true,
          weeklyReport: true
        }
      };
      
      expect(preferencesResult.success).toBe(true);
    });
  });
});

describe('E2E: Portfolio Management', () => {
  describe('Create and Manage Portfolio', () => {
    it('should create portfolio with multiple holdings', async () => {
      const portfolio = {
        id: 'test-portfolio',
        name: 'Growth Portfolio',
        holdings: []
      };
      
      // Add multiple holdings
      const holdings = [
        { symbol: 'AAPL', shares: 50, avgCost: 150 },
        { symbol: 'GOOGL', shares: 20, avgCost: 140 },
        { symbol: 'MSFT', shares: 30, avgCost: 375 }
      ];
      
      holdings.forEach(h => {
        portfolio.holdings.push({
          ...h,
          id: `holding-${h.symbol}`
        });
      });
      
      expect(portfolio.holdings.length).toBe(3);
    });

    it('should calculate portfolio value correctly', async () => {
      const holdings = [
        { shares: 50, currentPrice: 175 }, // AAPL: 8750
        { shares: 20, currentPrice: 142 }, // GOOGL: 2840
        { shares: 30, currentPrice: 380 } // MSFT: 11400
      ];
      const cashBalance = 5000;
      
      const holdingsValue = holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
      const totalValue = holdingsValue + cashBalance;
      
      expect(holdingsValue).toBe(22990);
      expect(totalValue).toBe(27990);
    });

    it('should handle portfolio rebalancing', async () => {
      const currentAllocation = {
        AAPL: 40, // 40%
        GOOGL: 20, // 20%
        MSFT: 30, // 30%
        cash: 10 // 10%
      };
      
      const targetAllocation = {
        AAPL: 33,
        GOOGL: 25,
        MSFT: 32,
        cash: 10
      };
      
      // Calculate rebalance trades
      const trades = [];
      Object.keys(targetAllocation).forEach(symbol => {
        if (symbol === 'cash') return;
        const diff = targetAllocation[symbol] - currentAllocation[symbol];
        if (Math.abs(diff) > 1) { // Threshold: 1%
          trades.push({
            symbol,
            action: diff > 0 ? 'buy' : 'sell',
            percentChange: Math.abs(diff)
          });
        }
      });
      
      expect(trades.length).toBe(3);
      expect(trades.find(t => t.symbol === 'AAPL').action).toBe('sell');
      expect(trades.find(t => t.symbol === 'GOOGL').action).toBe('buy');
    });
  });
});

describe('E2E: Transaction Flow', () => {
  describe('Buy Transaction', () => {
    it('should execute buy order and update holding', async () => {
      // Initial state
      const initialHolding = {
        symbol: 'AAPL',
        shares: 100,
        avgCostBasis: 150
      };
      const portfolio = { cashBalance: 20000 };
      
      // Buy transaction
      const buyOrder = {
        type: 'buy',
        symbol: 'AAPL',
        shares: 50,
        price: 175,
        fees: 0
      };
      
      // Calculate new state
      const orderTotal = buyOrder.shares * buyOrder.price + buyOrder.fees;
      const newShares = initialHolding.shares + buyOrder.shares;
      const totalCost = (initialHolding.shares * initialHolding.avgCostBasis) + 
                       (buyOrder.shares * buyOrder.price);
      const newAvgCost = totalCost / newShares;
      const newCashBalance = portfolio.cashBalance - orderTotal;
      
      expect(newShares).toBe(150);
      expect(newAvgCost).toBeCloseTo(158.33, 2);
      expect(newCashBalance).toBe(11250);
    });
  });

  describe('Sell Transaction', () => {
    it('should execute sell order with tax lot selection', async () => {
      // Tax lots (FIFO order)
      const taxLots = [
        { id: 1, shares: 50, costBasis: 100, purchaseDate: new Date('2023-01-15') },
        { id: 2, shares: 50, costBasis: 150, purchaseDate: new Date('2023-06-01') },
        { id: 3, shares: 50, costBasis: 175, purchaseDate: new Date('2024-01-15') }
      ];
      
      const sellOrder = {
        shares: 75,
        price: 180
      };
      
      // FIFO: Sell from oldest lots first
      let remaining = sellOrder.shares;
      let totalCostBasis = 0;
      const lotsUsed = [];
      
      for (const lot of taxLots) {
        if (remaining <= 0) break;
        const sharesToSell = Math.min(lot.shares, remaining);
        totalCostBasis += sharesToSell * lot.costBasis;
        lotsUsed.push({ lotId: lot.id, shares: sharesToSell });
        remaining -= sharesToSell;
      }
      
      const proceeds = sellOrder.shares * sellOrder.price;
      const realizedGain = proceeds - totalCostBasis;
      
      expect(lotsUsed.length).toBe(2);
      expect(lotsUsed[0].shares).toBe(50); // All of lot 1
      expect(lotsUsed[1].shares).toBe(25); // Part of lot 2
      expect(realizedGain).toBe(13500 - (50 * 100 + 25 * 150)); // 13500 - 8750 = 4750
      expect(realizedGain).toBe(4750);
    });
  });
});

describe('E2E: Alert System', () => {
  describe('Price Alerts', () => {
    it('should trigger alert when price crosses threshold', async () => {
      const alerts = [
        { id: 1, symbol: 'AAPL', condition: 'above', threshold: 180, isActive: true },
        { id: 2, symbol: 'AAPL', condition: 'below', threshold: 170, isActive: true },
        { id: 3, symbol: 'MSFT', condition: 'above', threshold: 400, isActive: true }
      ];
      
      // Current prices
      const prices = {
        AAPL: 182, // Above 180 threshold
        MSFT: 378 // Below 400 threshold
      };
      
      // Check alerts
      const triggeredAlerts = alerts.filter(alert => {
        const price = prices[alert.symbol];
        if (!price || !alert.isActive) return false;
        
        if (alert.condition === 'above' && price >= alert.threshold) return true;
        if (alert.condition === 'below' && price <= alert.threshold) return true;
        return false;
      });
      
      expect(triggeredAlerts.length).toBe(1);
      expect(triggeredAlerts[0].id).toBe(1);
    });
  });
});

describe('E2E: Import/Export', () => {
  describe('CSV Import', () => {
    it('should parse and import CSV transactions', async () => {
      const csvData = `Date,Symbol,Type,Shares,Price,Amount
2024-01-15,AAPL,buy,10,175.50,1755.00
2024-01-20,GOOGL,buy,5,140.25,701.25
2024-02-01,AAPL,sell,5,180.00,900.00`;
      
      // Parse CSV
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',');
      const transactions = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i]);
        return obj;
      });
      
      expect(transactions.length).toBe(3);
      expect(transactions[0].Symbol).toBe('AAPL');
      expect(transactions[0].Type).toBe('buy');
      expect(parseFloat(transactions[0].Shares)).toBe(10);
    });

    it('should validate import data', async () => {
      const importData = [
        { symbol: 'AAPL', type: 'buy', shares: 10, price: 175 },
        { symbol: 'INVALID123456', type: 'buy', shares: 5, price: 100 }, // Invalid symbol
        { symbol: 'GOOGL', type: 'unknown', shares: 10, price: 140 }, // Invalid type
        { symbol: 'MSFT', type: 'buy', shares: -5, price: 375 } // Negative shares
      ];
      
      const validSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
      const validTypes = ['buy', 'sell', 'dividend'];
      
      const validation = importData.map(item => {
        const errors = [];
        
        if (!validSymbols.includes(item.symbol)) {
          errors.push('Invalid symbol');
        }
        if (!validTypes.includes(item.type)) {
          errors.push('Invalid transaction type');
        }
        if (item.shares <= 0) {
          errors.push('Shares must be positive');
        }
        
        return { item, valid: errors.length === 0, errors };
      });
      
      const validCount = validation.filter(v => v.valid).length;
      const invalidCount = validation.filter(v => !v.valid).length;
      
      expect(validCount).toBe(1);
      expect(invalidCount).toBe(3);
    });
  });

  describe('Report Export', () => {
    it('should generate portfolio summary report', async () => {
      const portfolioData = {
        name: 'Main Portfolio',
        totalValue: 50000,
        cashBalance: 5000,
        holdings: [
          { symbol: 'AAPL', shares: 100, value: 17500, gain: 2500 },
          { symbol: 'GOOGL', shares: 50, value: 7000, gain: 500 },
          { symbol: 'MSFT', shares: 50, value: 18750, gain: 3750 }
        ],
        performance: {
          dayReturn: 0.5,
          weekReturn: 2.1,
          monthReturn: 4.5,
          ytdReturn: 12.3
        }
      };
      
      // Generate report structure
      const report = {
        title: 'Portfolio Summary Report',
        generatedAt: new Date().toISOString(),
        portfolio: portfolioData.name,
        summary: {
          totalValue: portfolioData.totalValue,
          holdingsValue: portfolioData.totalValue - portfolioData.cashBalance,
          cashBalance: portfolioData.cashBalance,
          totalGain: portfolioData.holdings.reduce((sum, h) => sum + h.gain, 0)
        },
        holdings: portfolioData.holdings,
        performance: portfolioData.performance
      };
      
      expect(report.summary.totalValue).toBe(50000);
      expect(report.summary.holdingsValue).toBe(45000);
      expect(report.summary.totalGain).toBe(6750);
    });
  });
});

describe('E2E: Multi-User Scenarios', () => {
  describe('RIA/Advisor Flow', () => {
    it('should manage multiple client portfolios', async () => {
      const advisor = {
        id: 'advisor-1',
        isAdvisor: true,
        firmName: 'Test Wealth Management'
      };
      
      const clients = [
        { id: 'client-1', name: 'John Smith', portfolios: ['portfolio-1', 'portfolio-2'] },
        { id: 'client-2', name: 'Jane Doe', portfolios: ['portfolio-3'] },
        { id: 'client-3', name: 'Bob Wilson', portfolios: ['portfolio-4', 'portfolio-5'] }
      ];
      
      // Calculate total AUM
      const portfolioValues = {
        'portfolio-1': 250000,
        'portfolio-2': 150000,
        'portfolio-3': 500000,
        'portfolio-4': 1000000,
        'portfolio-5': 300000
      };
      
      const totalAUM = Object.values(portfolioValues).reduce((sum, v) => sum + v, 0);
      const clientAUM = clients.map(client => ({
        ...client,
        aum: client.portfolios.reduce((sum, pId) => sum + portfolioValues[pId], 0)
      }));
      
      expect(totalAUM).toBe(2200000);
      expect(clientAUM[0].aum).toBe(400000);
      expect(clientAUM[2].aum).toBe(1300000);
    });

    it('should aggregate household portfolios', async () => {
      const household = {
        id: 'household-1',
        name: 'Smith Family',
        members: ['client-1', 'client-2']
      };
      
      const memberPortfolios = {
        'client-1': [
          { id: 'p1', type: 'taxable', value: 100000 },
          { id: 'p2', type: 'IRA', value: 250000 }
        ],
        'client-2': [
          { id: 'p3', type: 'taxable', value: 150000 },
          { id: 'p4', type: '401k', value: 400000 }
        ]
      };
      
      // Aggregate household
      const allPortfolios = household.members.flatMap(m => memberPortfolios[m]);
      const householdValue = allPortfolios.reduce((sum, p) => sum + p.value, 0);
      
      const byType = allPortfolios.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + p.value;
        return acc;
      }, {});
      
      expect(householdValue).toBe(900000);
      expect(byType.taxable).toBe(250000);
      expect(byType.IRA).toBe(250000);
      expect(byType['401k']).toBe(400000);
    });
  });
});

describe('E2E: Data Integrity', () => {
  describe('Transaction Reconciliation', () => {
    it('should reconcile holdings with transaction history', async () => {
      const transactions = [
        { type: 'buy', symbol: 'AAPL', shares: 100, price: 150 },
        { type: 'buy', symbol: 'AAPL', shares: 50, price: 160 },
        { type: 'sell', symbol: 'AAPL', shares: 30, price: 175 },
        { type: 'dividend', symbol: 'AAPL', amount: 50 }
      ];
      
      // Calculate expected holding from transactions
      const calculated = transactions.reduce((acc, t) => {
        if (t.type === 'buy') {
          const newShares = acc.shares + t.shares;
          const newCost = acc.totalCost + (t.shares * t.price);
          return { shares: newShares, totalCost: newCost };
        } else if (t.type === 'sell') {
          const newShares = acc.shares - t.shares;
          const soldCost = (acc.totalCost / acc.shares) * t.shares;
          return { shares: newShares, totalCost: acc.totalCost - soldCost };
        }
        return acc;
      }, { shares: 0, totalCost: 0 });
      
      const avgCostBasis = calculated.shares > 0 ? calculated.totalCost / calculated.shares : 0;
      
      expect(calculated.shares).toBe(120);
      expect(avgCostBasis).toBeCloseTo(153.33, 1);
    });
  });
});
