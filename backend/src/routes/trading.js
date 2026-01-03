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
    const strategies = await strategyEngine.getUserStrategies(req.user.id);
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
    const strategy = await strategyEngine.getStrategy(req.params.id);

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

    const strategy = await strategyEngine.createStrategy(req.user.id, {
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
    const strategy = await strategyEngine.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updatedStrategy = await strategyEngine.updateStrategy(req.params.id, req.body);

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
    const strategy = await strategyEngine.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await strategyEngine.deleteStrategy(req.params.id);

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

    const strategy = await strategyEngine.getStrategy(strategyId);

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
    const strategy = await strategyEngine.getStrategy(req.params.strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { limit, symbol, executed } = req.query;

    const signals = await strategyEngine.getSignals(req.params.strategyId, {
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
 * POST /api/trading/backtest-simple
 * Run a simple portfolio backtest without requiring a pre-created strategy
 * This is a simplified endpoint for the frontend backtest page
 */
router.post('/backtest-simple', authenticate, async (req, res) => {
  try {
    const {
      allocation,      // Array of { symbol, weight } objects
      initialCapital,  // Starting investment amount
      monthlyContribution, // Optional monthly DCA amount
      startDate,       // YYYY-MM-DD
      endDate,         // YYYY-MM-DD
      rebalanceFrequency // 'never', 'monthly', 'quarterly', 'annually'
    } = req.body;

    if (!allocation || !Array.isArray(allocation) || allocation.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: allocation (array of {symbol, weight})'
      });
    }

    // Validate weights sum to 100
    const totalWeight = allocation.reduce((sum, a) => sum + (a.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 1) {
      return res.status(400).json({
        success: false,
        error: `Allocation weights must sum to 100%, got ${totalWeight}%`
      });
    }

    const capital = initialCapital || 100000;
    const monthly = monthlyContribution || 0;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Fetch historical data for all symbols
    const historicalDataBySymbol = {};
    for (const asset of allocation) {
      const data = await fetchHistoricalData(asset.symbol, '10y', startDate, endDate);
      if (data.length < 10) {
        return res.status(400).json({
          success: false,
          error: `Insufficient data for ${asset.symbol}`
        });
      }
      historicalDataBySymbol[asset.symbol] = data;
    }

    // Get common date range
    const allDates = new Set();
    Object.values(historicalDataBySymbol).forEach(data => {
      data.forEach(bar => allDates.add(bar.date));
    });
    const sortedDates = Array.from(allDates).sort();

    // Filter dates within range
    const filteredDates = sortedDates.filter(d => {
      const date = new Date(d);
      return date >= start && date <= end;
    });

    // Run simulation
    let portfolioValue = capital;
    let totalContributed = capital;
    const equityCurve = [];
    const holdings = {};

    // Initialize holdings
    allocation.forEach(asset => {
      holdings[asset.symbol] = {
        weight: asset.weight / 100,
        shares: 0,
        value: 0
      };
    });

    // Get initial prices and buy
    const firstDate = filteredDates[0];
    allocation.forEach(asset => {
      const data = historicalDataBySymbol[asset.symbol];
      const firstBar = data.find(d => d.date === firstDate);
      if (firstBar) {
        const targetValue = capital * (asset.weight / 100);
        holdings[asset.symbol].shares = targetValue / firstBar.close;
        holdings[asset.symbol].value = targetValue;
      }
    });

    let lastRebalanceMonth = -1;
    let monthlyContribDay = 1;

    // Track metrics
    let peakValue = capital;
    let maxDrawdown = 0;
    const monthlyReturns = [];
    let lastMonthValue = capital;

    for (let i = 0; i < filteredDates.length; i++) {
      const date = filteredDates[i];
      const dateObj = new Date(date);
      const month = dateObj.getMonth();
      const isNewMonth = month !== lastRebalanceMonth;

      // Monthly contribution
      if (isNewMonth && monthly > 0 && i > 0) {
        allocation.forEach(asset => {
          const data = historicalDataBySymbol[asset.symbol];
          const bar = data.find(d => d.date === date);
          if (bar) {
            const contribution = monthly * (asset.weight / 100);
            holdings[asset.symbol].shares += contribution / bar.close;
          }
        });
        totalContributed += monthly;
      }

      // Rebalance if needed
      if (isNewMonth && rebalanceFrequency !== 'never') {
        const shouldRebalance =
          rebalanceFrequency === 'monthly' ||
          (rebalanceFrequency === 'quarterly' && month % 3 === 0) ||
          (rebalanceFrequency === 'annually' && month === 0);

        if (shouldRebalance && i > 0) {
          // Calculate current portfolio value
          let currentValue = 0;
          allocation.forEach(asset => {
            const data = historicalDataBySymbol[asset.symbol];
            const bar = data.find(d => d.date === date);
            if (bar) {
              currentValue += holdings[asset.symbol].shares * bar.close;
            }
          });

          // Rebalance
          allocation.forEach(asset => {
            const data = historicalDataBySymbol[asset.symbol];
            const bar = data.find(d => d.date === date);
            if (bar) {
              const targetValue = currentValue * (asset.weight / 100);
              holdings[asset.symbol].shares = targetValue / bar.close;
            }
          });
        }
      }

      lastRebalanceMonth = month;

      // Calculate portfolio value
      portfolioValue = 0;
      allocation.forEach(asset => {
        const data = historicalDataBySymbol[asset.symbol];
        const bar = data.find(d => d.date === date);
        if (bar) {
          const value = holdings[asset.symbol].shares * bar.close;
          holdings[asset.symbol].value = value;
          portfolioValue += value;
        }
      });

      // Track drawdown
      if (portfolioValue > peakValue) {
        peakValue = portfolioValue;
      }
      const drawdown = ((portfolioValue - peakValue) / peakValue) * 100;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Track monthly returns
      if (isNewMonth && i > 0) {
        const monthReturn = ((portfolioValue - lastMonthValue) / lastMonthValue) * 100;
        monthlyReturns.push(monthReturn);
        lastMonthValue = portfolioValue;
      }

      equityCurve.push({
        date,
        value: portfolioValue,
        drawdown
      });
    }

    // Calculate metrics
    const totalReturn = ((portfolioValue - totalContributed) / totalContributed) * 100;
    const years = (end - start) / (365 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? (Math.pow(portfolioValue / capital, 1 / years) - 1) * 100 : 0;

    // Sharpe ratio (simplified, assuming 0% risk-free rate)
    const avgMonthlyReturn = monthlyReturns.length > 0
      ? monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length
      : 0;
    const variance = monthlyReturns.length > 0
      ? monthlyReturns.reduce((sum, r) => sum + Math.pow(r - avgMonthlyReturn, 2), 0) / monthlyReturns.length
      : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(12); // Annualized
    const sharpeRatio = volatility > 0 ? (cagr / volatility) : 0;

    // Win rate (positive months)
    const positiveMonths = monthlyReturns.filter(r => r > 0).length;
    const winRate = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length) * 100 : 0;

    // Sortino ratio
    const downsideReturns = monthlyReturns.filter(r => r < 0);
    const downsideVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(12);
    const sortinoRatio = downsideDeviation > 0 ? (cagr / downsideDeviation) : 0;

    res.json({
      success: true,
      result: {
        initialCapital: capital,
        finalValue: portfolioValue,
        totalContributed,
        totalReturn,
        cagr,
        maxDrawdown,
        sharpeRatio,
        sortinoRatio,
        volatility,
        winRate,
        startDate: filteredDates[0],
        endDate: filteredDates[filteredDates.length - 1],
        totalMonths: monthlyReturns.length,
        equityCurve: equityCurve.filter((_, i) => i % Math.max(1, Math.floor(equityCurve.length / 120)) === 0), // Sample for chart
        allocation
      }
    });
  } catch (error) {
    logger.error('Error running simple backtest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

    const strategy = await strategyEngine.getStrategy(strategyId);

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
    const result = await backtestingService.getBacktestResult(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Backtest not found' });
    }

    // Verify user owns this backtest
    const strategy = await strategyEngine.getStrategy(result.strategy_id);
    if (strategy && strategy.user_id !== req.user.id) {
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
    const strategy = await strategyEngine.getStrategy(req.params.strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    if (strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const results = await backtestingService.getStrategyBacktests(req.params.strategyId);

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
    const results = await backtestingService.getUserBacktests(req.user.id);
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
    const result = await backtestingService.getBacktestResult(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Backtest not found' });
    }

    // Verify user owns this backtest
    const strategy = await strategyEngine.getStrategy(result.strategy_id);
    if (strategy && strategy.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await backtestingService.deleteBacktest(req.params.id);

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

// ==================== PAPER TRADING ====================

const paperTradingService = require('../services/trading/paperTradingService');

/**
 * GET /api/trading/paper/account
 * Get paper trading account details
 */
router.get('/paper/account', authenticate, async (req, res) => {
  try {
    const account = await paperTradingService.getAccount(req.user.id);
    res.json({ success: true, account });
  } catch (error) {
    logger.error('Error fetching paper account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trading/paper/account/reset
 * Reset paper trading account to initial state
 */
router.post('/paper/account/reset', authenticate, async (req, res) => {
  try {
    const account = await paperTradingService.resetAccount(req.user.id);
    res.json({ success: true, account, message: 'Account reset successfully' });
  } catch (error) {
    logger.error('Error resetting paper account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/paper/positions
 * Get all paper trading positions
 */
router.get('/paper/positions', authenticate, async (req, res) => {
  try {
    const positions = await paperTradingService.getPositions(req.user.id);
    res.json({ success: true, positions });
  } catch (error) {
    logger.error('Error fetching paper positions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trading/paper/orders
 * Place a paper trade order
 */
router.post('/paper/orders', authenticate, async (req, res) => {
  try {
    const { symbol, side, quantity, orderType, limitPrice, stopPrice, timeInForce } = req.body;

    if (!symbol || !side || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, side, quantity'
      });
    }

    const order = await paperTradingService.placeOrder(req.user.id, {
      symbol,
      side,
      quantity: parseFloat(quantity),
      orderType: orderType || 'market',
      limitPrice: limitPrice ? parseFloat(limitPrice) : null,
      stopPrice: stopPrice ? parseFloat(stopPrice) : null,
      timeInForce: timeInForce || 'day'
    });

    res.json({ success: true, order });
  } catch (error) {
    logger.error('Error placing paper order:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/paper/orders
 * Get paper trading order history
 */
router.get('/paper/orders', authenticate, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const orders = await paperTradingService.getOrders(req.user.id, {
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json({ success: true, orders });
  } catch (error) {
    logger.error('Error fetching paper orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/trading/paper/orders/:orderId
 * Cancel a pending paper order
 */
router.delete('/paper/orders/:orderId', authenticate, async (req, res) => {
  try {
    const order = await paperTradingService.cancelOrder(req.user.id, req.params.orderId);
    res.json({ success: true, order, message: 'Order cancelled' });
  } catch (error) {
    logger.error('Error cancelling paper order:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/paper/statistics
 * Get paper trading statistics and performance
 */
router.get('/paper/statistics', authenticate, async (req, res) => {
  try {
    const statistics = await paperTradingService.getStatistics(req.user.id);
    res.json({ success: true, statistics });
  } catch (error) {
    logger.error('Error fetching paper statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
