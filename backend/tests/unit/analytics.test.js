/**
 * Analytics Tests
 * Tests for portfolio analytics and risk metrics
 */

describe('Analytics', () => {
  describe('Performance Metrics', () => {
    it('should calculate simple return', () => {
      const calculateSimpleReturn = (endValue, startValue) => {
        if (startValue === 0) return 0;
        return ((endValue - startValue) / startValue) * 100;
      };

      expect(calculateSimpleReturn(11000, 10000)).toBe(10);
      expect(calculateSimpleReturn(9000, 10000)).toBe(-10);
      expect(calculateSimpleReturn(10000, 10000)).toBe(0);
    });

    it('should calculate logarithmic return', () => {
      const calculateLogReturn = (endValue, startValue) => {
        if (startValue <= 0 || endValue <= 0) return 0;
        return Math.log(endValue / startValue) * 100;
      };

      const logReturn = calculateLogReturn(11000, 10000);
      expect(logReturn).toBeCloseTo(9.53, 1);
    });

    it('should calculate time-weighted return', () => {
      // TWR for multiple periods
      const periodReturns = [0.05, -0.02, 0.08, 0.03]; // 5%, -2%, 8%, 3%
      
      const twr = periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      expect(twr * 100).toBeCloseTo(14.44, 1);
    });

    it('should calculate money-weighted return (XIRR approximation)', () => {
      const cashFlows = [
        { date: new Date('2023-01-01'), amount: -10000 }, // Initial investment
        { date: new Date('2023-06-01'), amount: -5000 }, // Additional investment
        { date: new Date('2023-12-31'), amount: 16500 } // End value
      ];

      // Simple approximation
      const totalInvested = Math.abs(cashFlows.filter(cf => cf.amount < 0).reduce((s, cf) => s + cf.amount, 0));
      const endValue = cashFlows.filter(cf => cf.amount > 0).reduce((s, cf) => s + cf.amount, 0);
      const simpleReturn = ((endValue - totalInvested) / totalInvested) * 100;

      expect(simpleReturn).toBe(10);
    });
  });

  describe('Risk Metrics', () => {
    it('should calculate standard deviation', () => {
      const returns = [0.05, -0.02, 0.08, 0.03, -0.01, 0.04, 0.06, -0.03, 0.02, 0.05];
      
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
      const variance = squaredDiffs.reduce((s, d) => s + d, 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);

      expect(mean).toBeCloseTo(0.027, 2);
      expect(stdDev).toBeCloseTo(0.036, 2);
    });

    it('should calculate Sharpe ratio', () => {
      const calculateSharpeRatio = (portfolioReturn, riskFreeRate, stdDev) => {
        if (stdDev === 0) return 0;
        return (portfolioReturn - riskFreeRate) / stdDev;
      };

      // Portfolio return: 12%, Risk-free: 2%, Std Dev: 15%
      const sharpe = calculateSharpeRatio(0.12, 0.02, 0.15);
      expect(sharpe).toBeCloseTo(0.67, 1);
    });

    it('should calculate Sortino ratio', () => {
      const calculateSortinoRatio = (portfolioReturn, riskFreeRate, downsideDeviation) => {
        if (downsideDeviation === 0) return 0;
        return (portfolioReturn - riskFreeRate) / downsideDeviation;
      };

      // Sortino uses downside deviation instead of total std dev
      const sortino = calculateSortinoRatio(0.12, 0.02, 0.10);
      expect(sortino).toBeCloseTo(1, 10);
    });

    it('should calculate Value at Risk (VaR)', () => {
      const calculateVaR = (portfolioValue, stdDev, confidenceLevel = 0.95) => {
        // Using normal distribution z-scores
        const zScores = { 0.90: 1.28, 0.95: 1.65, 0.99: 2.33 };
        const z = zScores[confidenceLevel] || 1.65;
        return portfolioValue * stdDev * z;
      };

      // $100,000 portfolio, 15% annual std dev, 95% confidence
      const var95 = calculateVaR(100000, 0.15, 0.95);
      expect(var95).toBe(24750);
    });

    it('should calculate maximum drawdown', () => {
      const calculateMaxDrawdown = (values) => {
        let maxDrawdown = 0;
        let peak = values[0];

        for (const value of values) {
          if (value > peak) {
            peak = value;
          }
          const drawdown = (peak - value) / peak;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }

        return maxDrawdown * 100;
      };

      const portfolioValues = [100, 110, 105, 115, 90, 95, 120, 100, 130];
      const maxDD = calculateMaxDrawdown(portfolioValues);
      
      // Max drawdown is from 115 to 90 = 21.74%
      expect(maxDD).toBeCloseTo(21.74, 1);
    });

    it('should calculate Beta', () => {
      const calculateBeta = (portfolioReturns, benchmarkReturns) => {
        const n = portfolioReturns.length;
        if (n !== benchmarkReturns.length || n < 2) return 0;

        const avgPortfolio = portfolioReturns.reduce((s, r) => s + r, 0) / n;
        const avgBenchmark = benchmarkReturns.reduce((s, r) => s + r, 0) / n;

        let covariance = 0;
        let benchmarkVariance = 0;

        for (let i = 0; i < n; i++) {
          const portDiff = portfolioReturns[i] - avgPortfolio;
          const benchDiff = benchmarkReturns[i] - avgBenchmark;
          covariance += portDiff * benchDiff;
          benchmarkVariance += benchDiff * benchDiff;
        }

        if (benchmarkVariance === 0) return 0;
        return covariance / benchmarkVariance;
      };

      const portfolioReturns = [0.05, -0.02, 0.08, 0.03, -0.01];
      const marketReturns = [0.04, -0.01, 0.06, 0.02, -0.02];

      const beta = calculateBeta(portfolioReturns, marketReturns);
      expect(beta).toBeGreaterThan(0);
    });

    it('should calculate Alpha', () => {
      const calculateAlpha = (portfolioReturn, riskFreeRate, beta, marketReturn) => {
        return portfolioReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
      };

      // Portfolio: 15%, Risk-free: 2%, Beta: 1.2, Market: 10%
      const alpha = calculateAlpha(0.15, 0.02, 1.2, 0.10);
      expect(alpha).toBeCloseTo(0.034, 2);
    });

    it('should calculate R-squared', () => {
      const calculateRSquared = (portfolioReturns, benchmarkReturns) => {
        const n = portfolioReturns.length;
        if (n !== benchmarkReturns.length || n < 2) return 0;

        const avgPort = portfolioReturns.reduce((s, r) => s + r, 0) / n;
        const avgBench = benchmarkReturns.reduce((s, r) => s + r, 0) / n;

        let numerator = 0;
        let denomPort = 0;
        let denomBench = 0;

        for (let i = 0; i < n; i++) {
          const portDiff = portfolioReturns[i] - avgPort;
          const benchDiff = benchmarkReturns[i] - avgBench;
          numerator += portDiff * benchDiff;
          denomPort += portDiff * portDiff;
          denomBench += benchDiff * benchDiff;
        }

        const correlation = numerator / Math.sqrt(denomPort * denomBench);
        return correlation * correlation;
      };

      const portfolioReturns = [0.05, -0.02, 0.08, 0.03, -0.01];
      const marketReturns = [0.04, -0.01, 0.06, 0.02, -0.02];

      const rSquared = calculateRSquared(portfolioReturns, marketReturns);
      expect(rSquared).toBeGreaterThan(0);
      expect(rSquared).toBeLessThanOrEqual(1);
    });
  });

  describe('Allocation Analysis', () => {
    it('should calculate sector allocation', () => {
      const holdings = [
        { symbol: 'AAPL', sector: 'Technology', value: 30000 },
        { symbol: 'MSFT', sector: 'Technology', value: 20000 },
        { symbol: 'JPM', sector: 'Financials', value: 25000 },
        { symbol: 'JNJ', sector: 'Healthcare', value: 15000 },
        { symbol: 'XOM', sector: 'Energy', value: 10000 }
      ];

      const totalValue = holdings.reduce((s, h) => s + h.value, 0);
      
      const sectorAllocation = holdings.reduce((acc, h) => {
        if (!acc[h.sector]) {
          acc[h.sector] = { value: 0, weight: 0 };
        }
        acc[h.sector].value += h.value;
        return acc;
      }, {});

      Object.keys(sectorAllocation).forEach(sector => {
        sectorAllocation[sector].weight = (sectorAllocation[sector].value / totalValue) * 100;
      });

      expect(sectorAllocation['Technology'].weight).toBe(50);
      expect(sectorAllocation['Financials'].weight).toBe(25);
      expect(sectorAllocation['Healthcare'].weight).toBe(15);
      expect(sectorAllocation['Energy'].weight).toBe(10);
    });

    it('should detect concentration risk', () => {
      const checkConcentrationRisk = (holdings, threshold = 25) => {
        const totalValue = holdings.reduce((s, h) => s + h.value, 0);
        const concentrated = holdings.filter(h => (h.value / totalValue) * 100 > threshold);
        return concentrated.map(h => ({
          symbol: h.symbol,
          weight: (h.value / totalValue) * 100
        }));
      };

      const holdings = [
        { symbol: 'AAPL', value: 50000 },
        { symbol: 'GOOGL', value: 20000 },
        { symbol: 'MSFT', value: 15000 },
        { symbol: 'AMZN', value: 15000 }
      ];

      const concentrated = checkConcentrationRisk(holdings);
      expect(concentrated).toHaveLength(1);
      expect(concentrated[0].symbol).toBe('AAPL');
      expect(concentrated[0].weight).toBe(50);
    });

    it('should calculate asset class allocation', () => {
      const holdings = [
        { symbol: 'VTI', assetClass: 'US Stocks', value: 40000 },
        { symbol: 'VXUS', assetClass: 'International Stocks', value: 20000 },
        { symbol: 'BND', assetClass: 'Bonds', value: 30000 },
        { symbol: 'VNQ', assetClass: 'REITs', value: 10000 }
      ];

      const totalValue = holdings.reduce((s, h) => s + h.value, 0);
      
      const allocation = {};
      holdings.forEach(h => {
        if (!allocation[h.assetClass]) {
          allocation[h.assetClass] = 0;
        }
        allocation[h.assetClass] += (h.value / totalValue) * 100;
      });

      expect(allocation['US Stocks']).toBe(40);
      expect(allocation['Bonds']).toBe(30);
    });
  });

  describe('Correlation Analysis', () => {
    it('should calculate correlation coefficient', () => {
      const calculateCorrelation = (returns1, returns2) => {
        const n = returns1.length;
        if (n !== returns2.length || n < 2) return 0;

        const avg1 = returns1.reduce((s, r) => s + r, 0) / n;
        const avg2 = returns2.reduce((s, r) => s + r, 0) / n;

        let numerator = 0;
        let denom1 = 0;
        let denom2 = 0;

        for (let i = 0; i < n; i++) {
          const diff1 = returns1[i] - avg1;
          const diff2 = returns2[i] - avg2;
          numerator += diff1 * diff2;
          denom1 += diff1 * diff1;
          denom2 += diff2 * diff2;
        }

        if (denom1 === 0 || denom2 === 0) return 0;
        return numerator / Math.sqrt(denom1 * denom2);
      };

      // Positively correlated
      const stock1 = [0.05, 0.08, -0.02, 0.03, 0.06];
      const stock2 = [0.04, 0.07, -0.01, 0.02, 0.05];
      const posCorr = calculateCorrelation(stock1, stock2);
      expect(posCorr).toBeGreaterThan(0.9);

      // Negatively correlated
      const bond = [-0.02, -0.04, 0.03, -0.01, -0.03];
      const negCorr = calculateCorrelation(stock1, bond);
      expect(negCorr).toBeLessThan(0);
    });

    it('should identify diversification opportunities', () => {
      const correlationMatrix = {
        'AAPL-MSFT': 0.85,
        'AAPL-BND': -0.20,
        'AAPL-GLD': 0.10,
        'MSFT-BND': -0.25,
        'MSFT-GLD': 0.05,
        'BND-GLD': 0.30
      };

      const findDiversifiers = (symbol, threshold = 0.3) => {
        const diversifiers = [];
        Object.entries(correlationMatrix).forEach(([pair, corr]) => {
          if (pair.includes(symbol) && Math.abs(corr) < threshold) {
            const other = pair.split('-').find(s => s !== symbol);
            diversifiers.push({ symbol: other, correlation: corr });
          }
        });
        return diversifiers;
      };

      const aaplDiversifiers = findDiversifiers('AAPL');
      expect(aaplDiversifiers.some(d => d.symbol === 'GLD')).toBe(true);
      expect(aaplDiversifiers.some(d => d.symbol === 'BND')).toBe(true);
    });
  });

  describe('Income Analysis', () => {
    it('should calculate total dividend income', () => {
      const holdings = [
        { shares: 100, annualDividend: 0.92 }, // AAPL
        { shares: 50, annualDividend: 2.24 }, // MSFT
        { shares: 200, annualDividend: 4.56 } // JPM
      ];

      const totalIncome = holdings.reduce((sum, h) => sum + (h.shares * h.annualDividend), 0);
      
      // 100*0.92 + 50*2.24 + 200*4.56 = 92 + 112 + 912 = 1116
      expect(totalIncome).toBe(1116);
    });

    it('should calculate portfolio yield', () => {
      const portfolioValue = 100000;
      const annualIncome = 3000;
      
      const yield_ = (annualIncome / portfolioValue) * 100;
      expect(yield_).toBe(3);
    });

    it('should project dividend growth', () => {
      const currentDividend = 1000;
      const growthRate = 0.07; // 7% annual growth
      const years = 5;

      const futureDividend = currentDividend * Math.pow(1 + growthRate, years);
      expect(futureDividend).toBeCloseTo(1402.55, 0);
    });
  });
});
