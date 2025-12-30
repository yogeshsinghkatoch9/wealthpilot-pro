/**
 * Trading Routes
 * API endpoints for algorithmic trading strategies, backtesting, and signals
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const strategyEngine = require('../services/trading/strategyEngine');
const backtestingService = require('../services/trading/backtestingService');
const MarketDataService = require('../services/marketDataService');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

// ==================== STRATEGY MANAGEMENT ====================

/**
 * GET /api/trading/strategies
 * Get all strategies for the authenticated user
 */
router.get('/strategies', authenticate, async (req, res) => {
  try {
    const strategies = strategyEngine.getUserStrategies(req.user.id);
    res.json({ success: true, strategies });
  } catch (error) {
    logger.error('Error fetching strategies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/strategies/:id
 * Get specific strategy by ID
 */
router.get('/strategies/:id', authenticate, async (req, res) => {
  try {
    const strategy = strategyEngine.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, strategy });
  } catch (error) {
    logger.error('Error fetching strategy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trading/strategies
 * Create a new trading strategy
 */
router.post('/strategies', authenticate, async (req, res) => {
  try {
    const { name, description, strategy_type, parameters, symbols, timeframe, is_paper_trading } = req.body;

    if (!name || !strategy_type || !parameters) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, strategy_type, parameters'
      });
    }

    const strategy = strategyEngine.createStrategy(req.user.id, {
      name,
      description,
      strategy_type,
      parameters,
      symbols,
      timeframe,
      is_paper_trading
    });

    res.json({ success: true, strategy });
  } catch (error) {
    logger.error('Error creating strategy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/trading/strategies/:id
 * Update a trading strategy
 */
router.put('/strategies/:id', authenticate, async (req, res) => {
  try {
    const strategy = strategyEngine.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updatedStrategy = strategyEngine.updateStrategy(req.params.id, req.body);

    res.json({ success: true, strategy: updatedStrategy });
  } catch (error) {
    logger.error('Error updating strategy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/trading/strategies/:id
 * Delete a trading strategy
 */
router.delete('/strategies/:id', authenticate, async (req, res) => {
  try {
    const strategy = strategyEngine.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    strategyEngine.deleteStrategy(req.params.id);

    res.json({ success: true, message: 'Strategy deleted' });
  } catch (error) {
    logger.error('Error deleting strategy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SIGNAL GENERATION ====================

/**
 * POST /api/trading/signals/generate
 * Generate trading signal for a symbol using a strategy
 */
router.post('/signals/generate', authenticate, async (req, res) => {
  try {
    const { strategyId, symbol, period } = req.body;

    if (!strategyId || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: strategyId, symbol'
      });
    }

    const strategy = strategyEngine.getStrategy(strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Fetch historical data (simplified - you may want to fetch from your own database)
    // For now, we'll use a mock data fetcher
    const historicalData = await fetchHistoricalData(symbol, period || '6mo');

    const signal = await strategyEngine.generateSignal(strategyId, symbol, historicalData);

    res.json({ success: true, signal });
  } catch (error) {
    logger.error('Error generating signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/signals/:strategyId
 * Get signals for a strategy
 */
router.get('/signals/:strategyId', authenticate, async (req, res) => {
  try {
    const strategy = strategyEngine.getStrategy(req.params.strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { limit, symbol, executed } = req.query;

    const signals = strategyEngine.getSignals(req.params.strategyId, {
      limit: limit ? parseInt(limit) : 100,
      symbol,
      executed: executed === 'true' ? true : executed === 'false' ? false : undefined
    });

    res.json({ success: true, signals });
  } catch (error) {
    logger.error('Error fetching signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BACKTESTING ====================

/**
 * POST /api/trading/backtest
 * Run backtest for a strategy
 */
router.post('/backtest', authenticate, async (req, res) => {
  try {
    const { strategyId, symbol, startDate, endDate, config } = req.body;

    if (!strategyId || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: strategyId, symbol'
      });
    }

    const strategy = strategyEngine.getStrategy(strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Fetch historical data
    const historicalData = await fetchHistoricalData(symbol, '5y', startDate, endDate);

    if (historicalData.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient historical data for backtesting'
      });
    }

    // Run backtest
    const result = await backtestingService.runBacktest(strategyId, symbol, historicalData, config);

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error running backtest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/backtests/:id
 * Get specific backtest result
 */
router.get('/backtests/:id', authenticate, async (req, res) => {
  try {
    const result = backtestingService.getBacktestResult(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Backtest not found' });
    }

    // Verify user owns this backtest
    const strategy = strategyEngine.getStrategy(result.strategy_id);
    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error fetching backtest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/backtests/strategy/:strategyId
 * Get all backtests for a strategy
 */
router.get('/backtests/strategy/:strategyId', authenticate, async (req, res) => {
  try {
    const strategy = strategyEngine.getStrategy(req.params.strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const results = backtestingService.getStrategyBacktests(req.params.strategyId);

    res.json({ success: true, results });
  } catch (error) {
    logger.error('Error fetching backtests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/backtests/user/all
 * Get all backtests for the authenticated user
 */
router.get('/backtests/user/all', authenticate, async (req, res) => {
  try {
    const results = backtestingService.getUserBacktests(req.user.id);
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Error fetching user backtests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/trading/backtests/:id
 * Delete a backtest result
 */
router.delete('/backtests/:id', authenticate, async (req, res) => {
  try {
    const result = backtestingService.getBacktestResult(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Backtest not found' });
    }

    // Verify user owns this backtest
    const strategy = strategyEngine.getStrategy(result.strategy_id);
    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    backtestingService.deleteBacktest(req.params.id);

    res.json({ success: true, message: 'Backtest deleted' });
  } catch (error) {
    logger.error('Error deleting backtest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Fetch historical data for a symbol using real market data
 * @param {String} symbol - Stock symbol
 * @param {String} period - Time period (1mo, 3mo, 6mo, 1y, 5y)
 * @param {String} startDate - Start date (optional)
 * @param {String} endDate - End date (optional)
 * @returns {Array} Array of OHLCV objects
 */
async function fetchHistoricalData(symbol, period = '1y', startDate, endDate) {
  const days = period === '1mo' ? 30 : period === '3mo' ? 90 : period === '6mo' ? 180 : period === '1y' ? 365 : 1825;

  try {
    // Try to fetch real historical data from Yahoo Finance
    const range = period === '1mo' ? '1mo' : period === '3mo' ? '3mo' : period === '6mo' ? '6mo' : period === '1y' ? '1y' : '5y';
    const interval = days <= 30 ? '1d' : days <= 90 ? '1d' : '1d';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const json = await response.json();

    if (json.chart?.result?.[0]) {
      const result = json.chart.result[0];
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};

      const data = [];
      for (let i = 0; i < timestamps.length; i++) {
        const date = new Date(timestamps[i] * 1000);

        // Skip if any OHLCV data is null
        if (!quotes.open?.[i] || !quotes.high?.[i] || !quotes.low?.[i] || !quotes.close?.[i]) {
          continue;
        }

        data.push({
          date: date.toISOString().split('T')[0],
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume?.[i] || 0
        });
      }

      if (data.length > 0) {
        logger.info(`Fetched ${data.length} historical records for ${symbol}`);
        return data;
      }
    }

    // NO FALLBACK TO MOCK DATA - return empty array if API fails
    logger.warn(`No historical data available for ${symbol} - API returned no data`);
    return [];

  } catch (error) {
    logger.error(`Historical data fetch error for ${symbol}:`, error.message);
    // NO FALLBACK TO MOCK DATA - return empty array on error
    return [];
  }
}

// REMOVED: generateMockHistoricalData() - All data must come from real APIs

module.exports = router;
