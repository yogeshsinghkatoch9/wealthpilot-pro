/**
 * Options Analysis Routes
 * Endpoints for options chain, Greeks, IV surface, and strategies
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const optionsAnalysis = require('../services/optionsAnalysis');
const MarketDataService = require('../services/marketDataService');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/options/:symbol/chain
 * Get options chain for a symbol
 */
router.get('/:symbol/chain', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiration = 30 } = req.query;
    const daysToExpiry = parseInt(expiration);

    // Get current stock price
    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const stockPrice = quote.price;

    // Get implied volatility (use historical volatility as proxy)
    const historical = await marketData.getHistoricalData(symbol.toUpperCase(), '3mo');
    let iv = 0.3; // Default 30%

    if (historical && historical.length > 20) {
      // Calculate historical volatility
      const returns = [];
      for (let i = 1; i < historical.length; i++) {
        returns.push(Math.log(historical[i].close / historical[i - 1].close));
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      iv = Math.sqrt(variance * 252); // Annualized
    }

    // Generate strikes around ATM (typically 10-15 strikes each direction)
    const strikeStep = stockPrice > 100 ? 5 : stockPrice > 50 ? 2.5 : 1;
    const strikes = [];
    const atmStrike = Math.round(stockPrice / strikeStep) * strikeStep;

    for (let i = -10; i <= 10; i++) {
      const strike = atmStrike + (i * strikeStep);
      if (strike > 0) strikes.push(strike);
    }

    const chain = optionsAnalysis.generateOptionsChain(stockPrice, iv, strikes, daysToExpiry);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      stockPrice: Math.round(stockPrice * 100) / 100,
      impliedVolatility: Math.round(iv * 10000) / 100,
      daysToExpiry,
      expirationDate: new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      chain
    });
  } catch (error) {
    logger.error('Options chain error:', error);
    res.status(500).json({ error: 'Failed to generate options chain' });
  }
});

/**
 * GET /api/options/:symbol/greeks
 * Get Greeks for specific option
 */
router.get('/:symbol/greeks', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'call', strike, expiration = 30 } = req.query;

    if (!strike) {
      return res.status(400).json({ error: 'Strike price required' });
    }

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const stockPrice = quote.price;
    const K = parseFloat(strike);
    const T = parseInt(expiration) / 365;
    const r = 0.05;

    // Estimate IV
    const historical = await marketData.getHistoricalData(symbol.toUpperCase(), '1mo');
    let iv = 0.3;
    if (historical && historical.length > 5) {
      const returns = [];
      for (let i = 1; i < historical.length; i++) {
        returns.push(Math.log(historical[i].close / historical[i - 1].close));
      }
      const variance = returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
      iv = Math.sqrt(variance * 252);
    }

    const greeks = optionsAnalysis.calculateGreeks(type.toLowerCase(), stockPrice, K, T, r, iv);
    const price = optionsAnalysis.blackScholes(type.toLowerCase(), stockPrice, K, T, r, iv);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      type: type.toLowerCase(),
      strike: K,
      stockPrice: Math.round(stockPrice * 100) / 100,
      optionPrice: Math.round(price * 100) / 100,
      impliedVolatility: Math.round(iv * 10000) / 100,
      daysToExpiry: parseInt(expiration),
      greeks,
      interpretation: {
        delta: `Option moves $${Math.abs(greeks.delta).toFixed(2)} for every $1 move in stock`,
        gamma: `Delta changes by ${greeks.gamma.toFixed(4)} for every $1 move in stock`,
        theta: `Option loses $${Math.abs(greeks.theta).toFixed(2)} per day from time decay`,
        vega: `Option moves $${greeks.vega.toFixed(2)} for every 1% change in IV`,
        rho: `Option moves $${greeks.rho.toFixed(2)} for every 1% change in interest rates`
      }
    });
  } catch (error) {
    logger.error('Greeks calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate Greeks' });
  }
});

/**
 * GET /api/options/:symbol/straddle
 * Calculate straddle strategy
 */
router.get('/:symbol/straddle', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { strike, expiration = 30 } = req.query;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const stockPrice = quote.price;
    const K = strike ? parseFloat(strike) : Math.round(stockPrice);
    const daysToExpiry = parseInt(expiration);

    // Estimate IV
    const iv = await estimateIV(symbol, stockPrice);

    const straddle = optionsAnalysis.calculateStraddle(stockPrice, K, iv, daysToExpiry);
    const probabilities = optionsAnalysis.calculateProbabilities(stockPrice, K, iv, daysToExpiry);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      stockPrice: Math.round(stockPrice * 100) / 100,
      impliedVolatility: Math.round(iv * 10000) / 100,
      daysToExpiry,
      ...straddle,
      probabilities
    });
  } catch (error) {
    logger.error('Straddle calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate straddle' });
  }
});

/**
 * GET /api/options/:symbol/iv-surface
 * Get implied volatility surface
 */
router.get('/:symbol/iv-surface', async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const stockPrice = quote.price;

    // Estimate base IV
    const iv = await estimateIV(symbol, stockPrice);

    // Generate IV surface for multiple expirations
    const expirations = [7, 14, 30, 45, 60, 90, 120, 180];
    const surface = optionsAnalysis.generateIVSurface(stockPrice, iv, expirations, 11);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ...surface
    });
  } catch (error) {
    logger.error('IV Surface error:', error);
    res.status(500).json({ error: 'Failed to generate IV surface' });
  }
});

/**
 * GET /api/options/:symbol/iron-condor
 * Calculate iron condor strategy
 */
router.get('/:symbol/iron-condor', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { width = 5, expiration = 30 } = req.query;

    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const stockPrice = quote.price;
    const w = parseFloat(width);
    const daysToExpiry = parseInt(expiration);

    // Calculate standard iron condor strikes
    const atmStrike = Math.round(stockPrice);
    const putBuyStrike = atmStrike - (w * 2);
    const putSellStrike = atmStrike - w;
    const callSellStrike = atmStrike + w;
    const callBuyStrike = atmStrike + (w * 2);

    const iv = await estimateIV(symbol, stockPrice);

    const ironCondor = optionsAnalysis.calculateIronCondor(
      stockPrice, putBuyStrike, putSellStrike, callSellStrike, callBuyStrike, iv, daysToExpiry
    );

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      stockPrice: Math.round(stockPrice * 100) / 100,
      impliedVolatility: Math.round(iv * 10000) / 100,
      daysToExpiry,
      ...ironCondor
    });
  } catch (error) {
    logger.error('Iron Condor error:', error);
    res.status(500).json({ error: 'Failed to calculate iron condor' });
  }
});

/**
 * POST /api/options/calculate
 * Calculate custom option price and Greeks
 */
router.post('/calculate', async (req, res) => {
  try {
    const { type, stockPrice, strike, daysToExpiry, volatility, riskFreeRate = 0.05 } = req.body;

    if (!type || !stockPrice || !strike || !daysToExpiry || !volatility) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const S = parseFloat(stockPrice);
    const K = parseFloat(strike);
    const T = parseInt(daysToExpiry) / 365;
    const r = parseFloat(riskFreeRate);
    const sigma = parseFloat(volatility) / 100; // Convert from percentage

    const price = optionsAnalysis.blackScholes(type.toLowerCase(), S, K, T, r, sigma);
    const greeks = optionsAnalysis.calculateGreeks(type.toLowerCase(), S, K, T, r, sigma);
    const probabilities = optionsAnalysis.calculateProbabilities(S, K, sigma, parseInt(daysToExpiry));

    res.json({
      success: true,
      input: {
        type: type.toLowerCase(),
        stockPrice: S,
        strike: K,
        daysToExpiry: parseInt(daysToExpiry),
        volatility: parseFloat(volatility),
        riskFreeRate: r * 100
      },
      optionPrice: Math.round(price * 100) / 100,
      greeks,
      probabilities,
      breakEven: type.toLowerCase() === 'call'
        ? Math.round((K + price) * 100) / 100
        : Math.round((K - price) * 100) / 100
    });
  } catch (error) {
    logger.error('Option calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate option' });
  }
});

/**
 * Helper function to estimate IV from historical volatility
 */
async function estimateIV(symbol, stockPrice) {
  try {
    const historical = await marketData.getHistoricalData(symbol.toUpperCase(), '3mo');

    if (historical && historical.length > 20) {
      const returns = [];
      for (let i = 1; i < historical.length; i++) {
        returns.push(Math.log(historical[i].close / historical[i - 1].close));
      }
      const variance = returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
      return Math.sqrt(variance * 252);
    }
  } catch (err) {
    logger.debug('Could not estimate IV, using default');
  }

  return 0.3; // Default 30%
}

module.exports = router;
