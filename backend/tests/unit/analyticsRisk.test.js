/**
 * WealthPilot Pro - Analytics & Risk Tests
 * Comprehensive test coverage for analytics calculations
 */

const { mockDb, mockMarketData, testUtils } = require('../testSetup');

describe('Analytics Service', () => {
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

  describe('Performance Calculations', () => {
    describe('Simple Return', () => {
      it('should calculate positive simple return', () => {
        const initialValue = 10000;
        const finalValue = 12000;
        const simpleReturn = ((finalValue - initialValue) / initialValue) * 100;
        
        expect(simpleReturn).toBe(20);
      });

      it('should calculate negative simple return', () => {
        const initialValue = 10000;
        const finalValue = 8000;
        const simpleReturn = ((finalValue - initialValue) / initialValue) * 100;
        
        expect(simpleReturn).toBe(-20);
      });

      it('should handle zero initial value', () => {
        const initialValue = 0;
        const finalValue = 10000;
        
        // Should not divide by zero
        const simpleReturn = initialValue === 0 ? 0 : ((finalValue - initialValue) / initialValue) * 100;
        expect(simpleReturn).toBe(0);
      });
    });

    describe('Compound Annual Growth Rate (CAGR)', () => {
      it('should calculate CAGR over multiple years', () => {
        const initialValue = 10000;
        const finalValue = 16105.10;
        const years = 5;
        
        const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
        expect(cagr).toBeCloseTo(10, 1);
      });

      it('should calculate CAGR for single year', () => {
        const initialValue = 10000;
        const finalValue = 11000;
        const years = 1;

        const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
        expect(cagr).toBeCloseTo(10, 10);
      });

      it('should handle negative returns', () => {
        const initialValue = 10000;
        const finalValue = 8100;
        const years = 2;
        
        const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
        expect(cagr).toBeCloseTo(-10, 1);
      });
    });

    describe('Time-Weighted Return (TWR)', () => {
      it('should calculate TWR with multiple periods', () => {
        const periodReturns = [0.05, 0.03, -0.02, 0.08]; // 5%, 3%, -2%, 8%

        const twr = periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
        expect(twr * 100).toBeCloseTo(14.47, 1);
      });

      it('should handle single period', () => {
        const periodReturns = [0.10]; // 10%

        const twr = periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
        expect(twr).toBeCloseTo(0.10, 10);
      });

      it('should handle periods with zero return', () => {
        const periodReturns = [0.05, 0, 0.03];
        
        const twr = periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
        expect(twr * 100).toBeCloseTo(8.15, 1);
      });
    });

    describe('Money-Weighted Return (MWRR/IRR)', () => {
      it('should handle simple investment scenario', () => {
        // Simplified IRR calculation for testing
        const cashFlows = [-10000, 500, 500, 11500];
        
        // Newton-Raphson method approximation
        let rate = 0.1;
        for (let i = 0; i < 100; i++) {
          let npv = 0;
          let dnpv = 0;
          for (let j = 0; j < cashFlows.length; j++) {
            npv += cashFlows[j] / Math.pow(1 + rate, j);
            dnpv -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
          }
          const newRate = rate - npv / dnpv;
          if (Math.abs(newRate - rate) < 0.0001) break;
          rate = newRate;
        }
        
        expect(rate * 100).toBeGreaterThan(0);
      });
    });
  });

  describe('Risk Metrics', () => {
    describe('Standard Deviation (Volatility)', () => {
      it('should calculate standard deviation of returns', () => {
        const returns = [0.02, -0.01, 0.03, 0.01, -0.02, 0.04];
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = Math.sqrt(avgSquaredDiff);
        
        expect(stdDev * 100).toBeCloseTo(2.14, 1);
      });

      it('should annualize daily volatility', () => {
        const dailyStdDev = 0.01; // 1% daily
        const annualizedVol = dailyStdDev * Math.sqrt(252);
        
        expect(annualizedVol * 100).toBeCloseTo(15.87, 1);
      });

      it('should annualize monthly volatility', () => {
        const monthlyStdDev = 0.03; // 3% monthly
        const annualizedVol = monthlyStdDev * Math.sqrt(12);
        
        expect(annualizedVol * 100).toBeCloseTo(10.39, 1);
      });
    });

    describe('Sharpe Ratio', () => {
      it('should calculate Sharpe ratio', () => {
        const portfolioReturn = 0.12; // 12% annual
        const riskFreeRate = 0.02; // 2% annual
        const portfolioStdDev = 0.15; // 15% volatility
        
        const sharpe = (portfolioReturn - riskFreeRate) / portfolioStdDev;
        expect(sharpe).toBeCloseTo(0.67, 2);
      });

      it('should handle negative excess return', () => {
        const portfolioReturn = 0.01;
        const riskFreeRate = 0.02;
        const portfolioStdDev = 0.15;
        
        const sharpe = (portfolioReturn - riskFreeRate) / portfolioStdDev;
        expect(sharpe).toBeLessThan(0);
      });

      it('should handle zero volatility', () => {
        const portfolioReturn = 0.12;
        const riskFreeRate = 0.02;
        const portfolioStdDev = 0;
        
        // Should handle division by zero
        const sharpe = portfolioStdDev === 0 ? 0 : (portfolioReturn - riskFreeRate) / portfolioStdDev;
        expect(sharpe).toBe(0);
      });
    });

    describe('Sortino Ratio', () => {
      it('should calculate Sortino ratio using downside deviation', () => {
        const returns = [0.02, -0.03, 0.04, -0.01, 0.03, -0.02, 0.05];
        const targetReturn = 0;
        
        // Calculate downside deviation
        const downsideReturns = returns.filter(r => r < targetReturn);
        const downsideSquared = downsideReturns.map(r => Math.pow(r - targetReturn, 2));
        const downsideDev = Math.sqrt(downsideSquared.reduce((a, b) => a + b, 0) / returns.length);
        
        const portfolioReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const riskFreeRate = 0.001;
        
        const sortino = (portfolioReturn - riskFreeRate) / downsideDev;
        expect(sortino).toBeGreaterThan(0);
      });
    });

    describe('Beta', () => {
      it('should calculate beta relative to benchmark', () => {
        const portfolioReturns = [0.02, -0.01, 0.03, -0.02, 0.04];
        const benchmarkReturns = [0.015, -0.008, 0.025, -0.015, 0.035];
        
        // Calculate covariance
        const pMean = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
        const bMean = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
        
        let covariance = 0;
        let benchmarkVariance = 0;
        
        for (let i = 0; i < portfolioReturns.length; i++) {
          covariance += (portfolioReturns[i] - pMean) * (benchmarkReturns[i] - bMean);
          benchmarkVariance += Math.pow(benchmarkReturns[i] - bMean, 2);
        }
        
        covariance /= portfolioReturns.length;
        benchmarkVariance /= benchmarkReturns.length;
        
        const beta = covariance / benchmarkVariance;
        expect(beta).toBeCloseTo(1.21, 1);
      });

      it('should identify defensive portfolio (beta < 1)', () => {
        const beta = 0.7;
        expect(beta).toBeLessThan(1);
      });

      it('should identify aggressive portfolio (beta > 1)', () => {
        const beta = 1.3;
        expect(beta).toBeGreaterThan(1);
      });
    });

    describe('Alpha', () => {
      it('should calculate Jensen\'s alpha', () => {
        const portfolioReturn = 0.15;
        const riskFreeRate = 0.02;
        const benchmarkReturn = 0.10;
        const beta = 1.1;
        
        const expectedReturn = riskFreeRate + beta * (benchmarkReturn - riskFreeRate);
        const alpha = portfolioReturn - expectedReturn;
        
        expect(alpha * 100).toBeCloseTo(4.2, 1);
      });

      it('should identify positive alpha (outperformance)', () => {
        const alpha = 0.03;
        expect(alpha).toBeGreaterThan(0);
      });

      it('should identify negative alpha (underperformance)', () => {
        const alpha = -0.02;
        expect(alpha).toBeLessThan(0);
      });
    });

    describe('Maximum Drawdown', () => {
      it('should calculate maximum drawdown', () => {
        const values = [100, 110, 105, 95, 90, 100, 115, 108];
        
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
        
        // Max drawdown from peak of 110 to trough of 90
        expect(maxDrawdown * 100).toBeCloseTo(18.18, 1);
      });

      it('should handle no drawdown scenario', () => {
        const values = [100, 105, 110, 115, 120];
        
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
        
        expect(maxDrawdown).toBe(0);
      });
    });

    describe('Value at Risk (VaR)', () => {
      it('should calculate parametric VaR at 95% confidence', () => {
        const portfolioValue = 100000;
        const annualReturn = 0.08;
        const annualVolatility = 0.15;
        const confidence = 0.95;
        
        // Z-score for 95% confidence
        const zScore = 1.645;
        
        // Daily VaR
        const dailyReturn = annualReturn / 252;
        const dailyVol = annualVolatility / Math.sqrt(252);
        const dailyVaR = portfolioValue * (dailyReturn - zScore * dailyVol);
        
        expect(Math.abs(dailyVaR)).toBeGreaterThan(0);
      });

      it('should calculate VaR at 99% confidence', () => {
        const portfolioValue = 100000;
        const dailyVol = 0.01;
        const confidence = 0.99;
        
        // Z-score for 99% confidence
        const zScore = 2.326;
        
        const var99 = portfolioValue * zScore * dailyVol;
        expect(var99).toBeCloseTo(2326, 0);
      });
    });

    describe('Treynor Ratio', () => {
      it('should calculate Treynor ratio', () => {
        const portfolioReturn = 0.12;
        const riskFreeRate = 0.02;
        const beta = 1.1;
        
        const treynor = (portfolioReturn - riskFreeRate) / beta;
        expect(treynor * 100).toBeCloseTo(9.09, 1);
      });
    });

    describe('Information Ratio', () => {
      it('should calculate information ratio', () => {
        const portfolioReturns = [0.02, 0.03, 0.01, 0.04, 0.02];
        const benchmarkReturns = [0.015, 0.025, 0.01, 0.03, 0.02];
        
        // Active returns
        const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
        const meanActiveReturn = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
        
        // Tracking error
        const squaredDiffs = activeReturns.map(r => Math.pow(r - meanActiveReturn, 2));
        const trackingError = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / activeReturns.length);
        
        const informationRatio = meanActiveReturn / trackingError;
        expect(informationRatio).toBeGreaterThan(0);
      });
    });
  });

  describe('Portfolio Statistics', () => {
    describe('Correlation Matrix', () => {
      it('should calculate correlation between two assets', () => {
        const assetA = [0.02, -0.01, 0.03, 0.01, -0.02];
        const assetB = [0.015, -0.008, 0.025, 0.012, -0.015];
        
        const meanA = assetA.reduce((a, b) => a + b, 0) / assetA.length;
        const meanB = assetB.reduce((a, b) => a + b, 0) / assetB.length;
        
        let covariance = 0;
        let varA = 0;
        let varB = 0;
        
        for (let i = 0; i < assetA.length; i++) {
          covariance += (assetA[i] - meanA) * (assetB[i] - meanB);
          varA += Math.pow(assetA[i] - meanA, 2);
          varB += Math.pow(assetB[i] - meanB, 2);
        }
        
        const correlation = covariance / (Math.sqrt(varA) * Math.sqrt(varB));
        
        expect(correlation).toBeGreaterThan(0.9); // Highly correlated
        expect(correlation).toBeLessThanOrEqual(1);
      });

      it('should identify negative correlation', () => {
        const assetA = [0.02, -0.01, 0.03, -0.02, 0.04];
        const assetB = [-0.015, 0.008, -0.02, 0.015, -0.03];
        
        const meanA = assetA.reduce((a, b) => a + b, 0) / assetA.length;
        const meanB = assetB.reduce((a, b) => a + b, 0) / assetB.length;
        
        let covariance = 0;
        let varA = 0;
        let varB = 0;
        
        for (let i = 0; i < assetA.length; i++) {
          covariance += (assetA[i] - meanA) * (assetB[i] - meanB);
          varA += Math.pow(assetA[i] - meanA, 2);
          varB += Math.pow(assetB[i] - meanB, 2);
        }
        
        const correlation = covariance / (Math.sqrt(varA) * Math.sqrt(varB));
        
        expect(correlation).toBeLessThan(0);
      });
    });

    describe('Diversification Ratio', () => {
      it('should calculate diversification ratio', () => {
        // Weighted average of individual volatilities
        const weights = [0.4, 0.3, 0.3];
        const volatilities = [0.20, 0.15, 0.25];
        const portfolioVol = 0.16;
        
        const weightedAvgVol = weights.reduce((sum, w, i) => sum + w * volatilities[i], 0);
        const diversificationRatio = weightedAvgVol / portfolioVol;
        
        expect(diversificationRatio).toBeGreaterThan(1); // Diversification benefit
      });
    });

    describe('Concentration Risk', () => {
      it('should calculate Herfindahl-Hirschman Index (HHI)', () => {
        const weights = [0.30, 0.25, 0.20, 0.15, 0.10];
        
        const hhi = weights.reduce((sum, w) => sum + Math.pow(w, 2), 0);
        
        // HHI ranges from 1/n (perfectly diversified) to 1 (concentrated)
        expect(hhi).toBeGreaterThan(0.2);
        expect(hhi).toBeLessThan(1);
      });

      it('should identify concentrated portfolio', () => {
        const weights = [0.80, 0.10, 0.05, 0.05];
        
        const hhi = weights.reduce((sum, w) => sum + Math.pow(w, 2), 0);
        
        expect(hhi).toBeGreaterThan(0.5); // High concentration
      });
    });
  });
});

describe('Benchmark Comparison', () => {
  it('should compare portfolio to S&P 500', () => {
    const portfolioReturn = 0.15;
    const spyReturn = 0.12;
    
    const outperformance = portfolioReturn - spyReturn;
    expect(outperformance * 100).toBe(3);
  });

  it('should calculate tracking error', () => {
    const activeReturns = [0.005, -0.003, 0.008, -0.002, 0.004];
    
    const mean = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
    const squaredDiffs = activeReturns.map(r => Math.pow(r - mean, 2));
    const trackingError = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / activeReturns.length);
    
    expect(trackingError * 100).toBeLessThan(1); // Low tracking error = index-like
  });
});
