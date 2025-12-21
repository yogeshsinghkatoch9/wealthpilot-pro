/**
 * Options Analysis Service
 * Provides Black-Scholes calculations, Greeks, IV Surface, and options strategies
 */

const logger = require('../utils/logger');

class OptionsAnalysisService {
  constructor() {
    this.riskFreeRate = 0.05; // 5% annual risk-free rate
  }

  /**
   * Standard Normal CDF (Cumulative Distribution Function)
   */
  normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Standard Normal PDF (Probability Density Function)
   */
  normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Calculate d1 and d2 for Black-Scholes
   */
  calculateD1D2(S, K, T, r, sigma) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return { d1, d2 };
  }

  /**
   * Black-Scholes Option Pricing
   * @param {string} type - 'call' or 'put'
   * @param {number} S - Current stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiration (years)
   * @param {number} r - Risk-free rate (decimal)
   * @param {number} sigma - Volatility (decimal)
   * @returns {number} Option price
   */
  blackScholes(type, S, K, T, r, sigma) {
    if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);

    const { d1, d2 } = this.calculateD1D2(S, K, T, r, sigma);

    if (type === 'call') {
      return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
  }

  /**
   * Calculate Option Greeks
   */
  calculateGreeks(type, S, K, T, r, sigma) {
    if (T <= 0) {
      return {
        delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0
      };
    }

    const { d1, d2 } = this.calculateD1D2(S, K, T, r, sigma);
    const pdf_d1 = this.normalPDF(d1);
    const cdf_d1 = this.normalCDF(d1);
    const cdf_d2 = this.normalCDF(d2);

    // Delta
    let delta = type === 'call' ? cdf_d1 : cdf_d1 - 1;

    // Gamma (same for calls and puts)
    const gamma = pdf_d1 / (S * sigma * Math.sqrt(T));

    // Theta (per day, negative for long positions)
    let theta;
    if (type === 'call') {
      theta = (-S * pdf_d1 * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * cdf_d2) / 365;
    } else {
      theta = (-S * pdf_d1 * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * this.normalCDF(-d2)) / 365;
    }

    // Vega (per 1% move in IV)
    const vega = S * Math.sqrt(T) * pdf_d1 / 100;

    // Rho (per 1% change in rate)
    let rho;
    if (type === 'call') {
      rho = K * T * Math.exp(-r * T) * cdf_d2 / 100;
    } else {
      rho = -K * T * Math.exp(-r * T) * this.normalCDF(-d2) / 100;
    }

    return {
      delta: Math.round(delta * 10000) / 10000,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(theta * 100) / 100,
      vega: Math.round(vega * 100) / 100,
      rho: Math.round(rho * 100) / 100
    };
  }

  /**
   * Calculate Implied Volatility using Newton-Raphson method
   * @param {number} marketPrice - Current option price
   * @param {string} type - 'call' or 'put'
   * @param {number} S - Current stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiration (years)
   * @param {number} r - Risk-free rate
   * @returns {number} Implied volatility
   */
  calculateIV(marketPrice, type, S, K, T, r) {
    if (T <= 0 || marketPrice <= 0) return 0;

    let sigma = 0.3; // Initial guess
    const tolerance = 0.0001;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const price = this.blackScholes(type, S, K, T, r, sigma);
      const vega = this.calculateGreeks(type, S, K, T, r, sigma).vega * 100;

      if (Math.abs(vega) < 0.0001) break;

      const diff = marketPrice - price;
      if (Math.abs(diff) < tolerance) break;

      sigma = sigma + diff / vega;

      // Keep sigma in reasonable bounds
      if (sigma < 0.01) sigma = 0.01;
      if (sigma > 5) sigma = 5;
    }

    return Math.round(sigma * 10000) / 10000;
  }

  /**
   * Generate Options Chain with Greeks
   * @param {number} stockPrice - Current stock price
   * @param {number} iv - Implied volatility (decimal)
   * @param {number[]} strikes - Array of strike prices
   * @param {number} daysToExpiry - Days until expiration
   * @returns {Object[]} Options chain data
   */
  generateOptionsChain(stockPrice, iv, strikes, daysToExpiry) {
    const T = daysToExpiry / 365;
    const r = this.riskFreeRate;

    return strikes.map(strike => {
      const callPrice = this.blackScholes('call', stockPrice, strike, T, r, iv);
      const putPrice = this.blackScholes('put', stockPrice, strike, T, r, iv);
      const callGreeks = this.calculateGreeks('call', stockPrice, strike, T, r, iv);
      const putGreeks = this.calculateGreeks('put', stockPrice, strike, T, r, iv);

      const moneyness = ((stockPrice - strike) / strike) * 100;

      return {
        strike,
        call: {
          bid: Math.round((callPrice * 0.98) * 100) / 100,
          ask: Math.round((callPrice * 1.02) * 100) / 100,
          mid: Math.round(callPrice * 100) / 100,
          ...callGreeks,
          iv: Math.round(iv * 10000) / 100
        },
        put: {
          bid: Math.round((putPrice * 0.98) * 100) / 100,
          ask: Math.round((putPrice * 1.02) * 100) / 100,
          mid: Math.round(putPrice * 100) / 100,
          ...putGreeks,
          iv: Math.round(iv * 10000) / 100
        },
        moneyness: Math.round(moneyness * 100) / 100,
        itm: moneyness > 0
      };
    });
  }

  /**
   * Calculate Straddle strategy
   */
  calculateStraddle(stockPrice, strike, iv, daysToExpiry) {
    const T = daysToExpiry / 365;
    const r = this.riskFreeRate;

    const callPrice = this.blackScholes('call', stockPrice, strike, T, r, iv);
    const putPrice = this.blackScholes('put', stockPrice, strike, T, r, iv);
    const callGreeks = this.calculateGreeks('call', stockPrice, strike, T, r, iv);
    const putGreeks = this.calculateGreeks('put', stockPrice, strike, T, r, iv);

    const totalCost = callPrice + putPrice;
    const breakEvenUp = strike + totalCost;
    const breakEvenDown = strike - totalCost;
    const maxLoss = totalCost;

    return {
      strategy: 'Long Straddle',
      strike,
      callPrice: Math.round(callPrice * 100) / 100,
      putPrice: Math.round(putPrice * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      breakEvenUp: Math.round(breakEvenUp * 100) / 100,
      breakEvenDown: Math.round(breakEvenDown * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      maxProfit: 'Unlimited',
      greeks: {
        delta: Math.round((callGreeks.delta + putGreeks.delta) * 10000) / 10000,
        gamma: Math.round((callGreeks.gamma + putGreeks.gamma) * 10000) / 10000,
        theta: Math.round((callGreeks.theta + putGreeks.theta) * 100) / 100,
        vega: Math.round((callGreeks.vega + putGreeks.vega) * 100) / 100
      },
      // Profit/Loss at different price levels
      payoff: this.calculatePayoff('straddle', strike, totalCost, stockPrice)
    };
  }

  /**
   * Calculate Strangle strategy
   */
  calculateStrangle(stockPrice, callStrike, putStrike, iv, daysToExpiry) {
    const T = daysToExpiry / 365;
    const r = this.riskFreeRate;

    const callPrice = this.blackScholes('call', stockPrice, callStrike, T, r, iv);
    const putPrice = this.blackScholes('put', stockPrice, putStrike, T, r, iv);

    const totalCost = callPrice + putPrice;

    return {
      strategy: 'Long Strangle',
      callStrike,
      putStrike,
      callPrice: Math.round(callPrice * 100) / 100,
      putPrice: Math.round(putPrice * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      breakEvenUp: Math.round((callStrike + totalCost) * 100) / 100,
      breakEvenDown: Math.round((putStrike - totalCost) * 100) / 100,
      maxLoss: Math.round(totalCost * 100) / 100,
      maxProfit: 'Unlimited'
    };
  }

  /**
   * Calculate Iron Condor strategy
   */
  calculateIronCondor(stockPrice, putBuyStrike, putSellStrike, callSellStrike, callBuyStrike, iv, daysToExpiry) {
    const T = daysToExpiry / 365;
    const r = this.riskFreeRate;

    const putBuy = this.blackScholes('put', stockPrice, putBuyStrike, T, r, iv);
    const putSell = this.blackScholes('put', stockPrice, putSellStrike, T, r, iv);
    const callSell = this.blackScholes('call', stockPrice, callSellStrike, T, r, iv);
    const callBuy = this.blackScholes('call', stockPrice, callBuyStrike, T, r, iv);

    const credit = (putSell - putBuy) + (callSell - callBuy);
    const maxLoss = Math.max(putSellStrike - putBuyStrike, callBuyStrike - callSellStrike) - credit;

    return {
      strategy: 'Iron Condor',
      legs: {
        putBuy: { strike: putBuyStrike, price: Math.round(putBuy * 100) / 100 },
        putSell: { strike: putSellStrike, price: Math.round(putSell * 100) / 100 },
        callSell: { strike: callSellStrike, price: Math.round(callSell * 100) / 100 },
        callBuy: { strike: callBuyStrike, price: Math.round(callBuy * 100) / 100 }
      },
      credit: Math.round(credit * 100) / 100,
      maxProfit: Math.round(credit * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      breakEvenLow: Math.round((putSellStrike - credit) * 100) / 100,
      breakEvenHigh: Math.round((callSellStrike + credit) * 100) / 100,
      profitRange: `${putSellStrike} - ${callSellStrike}`
    };
  }

  /**
   * Generate IV Surface data
   */
  generateIVSurface(stockPrice, baseIV, expirations, numStrikes = 11) {
    const surface = [];

    // Generate strikes around ATM
    const strikeStep = stockPrice * 0.025; // 2.5% steps
    const strikes = [];
    for (let i = -5; i <= 5; i++) {
      strikes.push(Math.round((stockPrice + i * strikeStep) * 100) / 100);
    }

    expirations.forEach(days => {
      const expRow = {
        expiration: days,
        strikes: {}
      };

      strikes.forEach(strike => {
        // Volatility smile: IV increases away from ATM
        const moneyness = Math.abs(strike - stockPrice) / stockPrice;
        const smile = 1 + moneyness * 0.5; // Simple smile model
        const termStructure = 1 + (30 - days) * 0.002; // Term structure adjustment
        const iv = baseIV * smile * Math.max(0.5, termStructure);

        expRow.strikes[strike] = Math.round(iv * 10000) / 100; // Convert to percentage
      });

      surface.push(expRow);
    });

    return {
      stockPrice,
      baseIV: Math.round(baseIV * 10000) / 100,
      strikes,
      expirations,
      surface
    };
  }

  /**
   * Calculate payoff profile for strategies
   */
  calculatePayoff(strategy, strike, cost, currentPrice) {
    const prices = [];
    const pnl = [];

    // Generate price range from -30% to +30% of current price
    for (let i = -30; i <= 30; i += 2) {
      const price = currentPrice * (1 + i / 100);
      prices.push(Math.round(price * 100) / 100);

      let profit;
      if (strategy === 'straddle') {
        profit = Math.max(price - strike, 0) + Math.max(strike - price, 0) - cost;
      } else if (strategy === 'call') {
        profit = Math.max(price - strike, 0) - cost;
      } else if (strategy === 'put') {
        profit = Math.max(strike - price, 0) - cost;
      }

      pnl.push(Math.round(profit * 100) / 100);
    }

    return { prices, pnl };
  }

  /**
   * Probability analysis
   */
  calculateProbabilities(stockPrice, strike, iv, daysToExpiry) {
    const T = daysToExpiry / 365;
    const r = this.riskFreeRate;

    const { d2 } = this.calculateD1D2(stockPrice, strike, T, r, iv);

    const probITM = this.normalCDF(d2); // Prob of finishing above strike
    const probOTM = 1 - probITM;

    // Expected move (1 standard deviation)
    const expectedMove = stockPrice * iv * Math.sqrt(T);

    return {
      probCallITM: Math.round(probITM * 10000) / 100,
      probPutITM: Math.round(probOTM * 10000) / 100,
      expectedMoveUp: Math.round((stockPrice + expectedMove) * 100) / 100,
      expectedMoveDown: Math.round((stockPrice - expectedMove) * 100) / 100,
      expectedMovePercent: Math.round((expectedMove / stockPrice) * 10000) / 100
    };
  }
}

module.exports = new OptionsAnalysisService();
