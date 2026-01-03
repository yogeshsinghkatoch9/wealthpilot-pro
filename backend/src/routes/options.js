/**
 * Options Analysis Routes
 * Endpoints for options chain, Greeks, IV surface, and strategies
 * Now with REAL market data from Yahoo Finance
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const optionsAnalysis = require('../services/optionsAnalysis');
const yahooOptions = require('../services/yahooOptionsService');
const MarketDataService = require('../services/marketDataService');
const db = require('../db');
const logger = require('../utils/logger');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/options/:symbol/expirations
 * Get available expiration dates for a symbol
 */
router.get('/:symbol/expirations', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooOptions.getExpirationDates(symbol);

    // Convert timestamps to readable dates
    const expirations = data.expirationDates.map(ts => ({
      timestamp: ts,
      date: new Date(ts * 1000).toISOString().split('T')[0],
      daysToExpiry: Math.ceil((ts * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      success: true,
      symbol: data.symbol,
      stockPrice: data.quote.price,
      expirations
    });
  } catch (error) {
    logger.error('Expirations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch expiration dates' });
  }
});

/**
 * GET /api/options/:symbol/chain
 * Get REAL options chain from Yahoo Finance
 */
router.get('/:symbol/chain', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiration } = req.query;

    // Try to get real data from Yahoo Finance
    try {
      const chain = await yahooOptions.getCombinedChain(symbol, expiration || null);

      // Calculate Greeks for each option using our analysis service
      const enrichedCalls = chain.calls.map(opt => {
        const T = chain.daysToExpiry / 365;
        const iv = (opt.impliedVolatility || 30) / 100;
        const greeks = optionsAnalysis.calculateGreeks('call', chain.stockPrice, opt.strike, T, 0.05, iv);
        return { ...opt, ...greeks };
      });

      const enrichedPuts = chain.puts.map(opt => {
        const T = chain.daysToExpiry / 365;
        const iv = (opt.impliedVolatility || 30) / 100;
        const greeks = optionsAnalysis.calculateGreeks('put', chain.stockPrice, opt.strike, T, 0.05, iv);
        return { ...opt, ...greeks };
      });

      res.json({
        success: true,
        source: 'yahoo_finance',
        symbol: chain.symbol,
        stockPrice: chain.stockPrice,
        stockChange: chain.stockChange,
        stockChangePercent: chain.stockChangePercent,
        expirationDate: chain.expirationDateFormatted,
        daysToExpiry: chain.daysToExpiry,
        availableExpirations: chain.availableExpirations,
        calls: enrichedCalls,
        puts: enrichedPuts,
        combined: chain.combined
      });
    } catch (yahooError) {
      // Fallback to synthetic data if Yahoo fails
      logger.warn('Yahoo options failed, using synthetic data:', yahooError.message);

      const quote = await marketData.getQuote(symbol.toUpperCase());
      if (!quote) {
        return res.status(404).json({ error: 'Symbol not found' });
      }

      const stockPrice = quote.price;
      const daysToExpiry = expiration ? parseInt(expiration) : 30;

      // Estimate IV from historical data
      const historical = await marketData.getHistoricalData(symbol.toUpperCase(), '3mo');
      let iv = 0.3;
      if (historical && historical.length > 20) {
        const returns = [];
        for (let i = 1; i < historical.length; i++) {
          returns.push(Math.log(historical[i].close / historical[i - 1].close));
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        iv = Math.sqrt(variance * 252);
      }

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
        source: 'synthetic',
        symbol: symbol.toUpperCase(),
        stockPrice: Math.round(stockPrice * 100) / 100,
        impliedVolatility: Math.round(iv * 10000) / 100,
        daysToExpiry,
        expirationDate: new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        chain
      });
    }
  } catch (error) {
    logger.error('Options chain error:', error);
    res.status(500).json({ error: 'Failed to fetch options chain' });
  }
});

/**
 * GET /api/options/:symbol/unusual
 * Get unusual options activity
 */
router.get('/:symbol/unusual', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooOptions.getUnusualActivity(symbol);
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Unusual activity error:', error);
    res.status(500).json({ error: 'Failed to fetch unusual activity' });
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
    const iv = await estimateIV(symbol, stockPrice);
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
    const sigma = parseFloat(volatility) / 100;

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

// ============================================
// OPTIONS POSITIONS MANAGEMENT
// ============================================

/**
 * GET /api/options/positions
 * Get user's options positions
 */
router.get('/positions', async (req, res) => {
  try {
    const userId = req.user.id;

    const positions = await db.prepare(`
      SELECT * FROM options_positions
      WHERE user_id = ? AND status = 'open'
      ORDER BY expiration_date ASC
    `).all(userId);

    // Enrich with current prices and Greeks
    const enrichedPositions = await Promise.all(positions.map(async pos => {
      try {
        const quote = await marketData.getQuote(pos.symbol);
        const currentPrice = quote?.price || pos.entry_price;
        const T = Math.max(0, (new Date(pos.expiration_date) - Date.now()) / (365 * 24 * 60 * 60 * 1000));
        const iv = pos.implied_volatility / 100;

        const greeks = optionsAnalysis.calculateGreeks(pos.option_type, currentPrice, pos.strike, T, 0.05, iv);
        const optionPrice = optionsAnalysis.blackScholes(pos.option_type, currentPrice, pos.strike, T, 0.05, iv);

        const pnl = (optionPrice - pos.avg_cost) * pos.quantity * 100;
        const pnlPercent = ((optionPrice - pos.avg_cost) / pos.avg_cost) * 100;

        return {
          ...pos,
          currentStockPrice: currentPrice,
          currentOptionPrice: Math.round(optionPrice * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          daysToExpiry: Math.ceil(T * 365),
          greeks
        };
      } catch (err) {
        return { ...pos, error: 'Could not fetch current data' };
      }
    }));

    // Calculate portfolio Greeks
    const portfolioGreeks = enrichedPositions.reduce((acc, pos) => {
      if (pos.greeks) {
        const multiplier = pos.quantity * 100;
        acc.delta += (pos.greeks.delta || 0) * multiplier;
        acc.gamma += (pos.greeks.gamma || 0) * multiplier;
        acc.theta += (pos.greeks.theta || 0) * multiplier;
        acc.vega += (pos.greeks.vega || 0) * multiplier;
      }
      return acc;
    }, { delta: 0, gamma: 0, theta: 0, vega: 0 });

    const totalPnL = enrichedPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

    res.json({
      success: true,
      positions: enrichedPositions,
      portfolioGreeks: {
        delta: Math.round(portfolioGreeks.delta * 100) / 100,
        gamma: Math.round(portfolioGreeks.gamma * 100) / 100,
        theta: Math.round(portfolioGreeks.theta * 100) / 100,
        vega: Math.round(portfolioGreeks.vega * 100) / 100
      },
      totalPnL: Math.round(totalPnL * 100) / 100
    });
  } catch (error) {
    logger.error('Get positions error:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

/**
 * POST /api/options/positions
 * Add a new options position
 */
router.post('/positions', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      symbol,
      optionType,
      strike,
      expirationDate,
      quantity,
      avgCost,
      impliedVolatility = 30
    } = req.body;

    if (!symbol || !optionType || !strike || !expirationDate || !quantity || !avgCost) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify the symbol exists
    const quote = await marketData.getQuote(symbol.toUpperCase());
    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const result = await db.prepare(`
      INSERT INTO options_positions (
        user_id, symbol, option_type, strike, expiration_date,
        quantity, avg_cost, entry_price, implied_volatility, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))
    `).run(
      userId,
      symbol.toUpperCase(),
      optionType.toLowerCase(),
      parseFloat(strike),
      expirationDate,
      parseInt(quantity),
      parseFloat(avgCost),
      quote.price,
      parseFloat(impliedVolatility)
    );

    res.json({
      success: true,
      message: 'Position added successfully',
      positionId: result.lastInsertRowid
    });
  } catch (error) {
    logger.error('Add position error:', error);
    res.status(500).json({ error: 'Failed to add position' });
  }
});

/**
 * PUT /api/options/positions/:id
 * Update an options position
 */
router.put('/positions/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity, avgCost } = req.body;

    await db.prepare(`
      UPDATE options_positions
      SET quantity = ?, avg_cost = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(parseInt(quantity), parseFloat(avgCost), id, userId);

    res.json({ success: true, message: 'Position updated' });
  } catch (error) {
    logger.error('Update position error:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

/**
 * DELETE /api/options/positions/:id
 * Close an options position
 */
router.delete('/positions/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { closePrice } = req.body;

    await db.prepare(`
      UPDATE options_positions
      SET status = 'closed', close_price = ?, closed_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(parseFloat(closePrice || 0), id, userId);

    res.json({ success: true, message: 'Position closed' });
  } catch (error) {
    logger.error('Close position error:', error);
    res.status(500).json({ error: 'Failed to close position' });
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

  return 0.3;
}

module.exports = router;
