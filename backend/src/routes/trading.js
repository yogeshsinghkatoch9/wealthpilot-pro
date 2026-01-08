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

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const UnifiedMarketDataService = require('../services/unifiedMarketData');
const unifiedMarketData = new UnifiedMarketDataService();

// Legacy service for backward compatibility
const paperTradingService = require('../services/trading/paperTradingService');

/**
 * Helper: Get real-time market price for a symbol
 */
async function getRealMarketPrice(symbol) {
  try {
    // Try UnifiedMarketDataService first (most reliable)
    const quote = await unifiedMarketData.fetchQuote(symbol);
    if (quote && quote.price) {
      return {
        price: quote.price,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: quote.changePercent,
        provider: quote.provider,
        timestamp: quote.timestamp
      };
    }

    // Fallback to MarketDataService
    const fallbackQuote = await marketData.fetchQuote(symbol);
    if (fallbackQuote && fallbackQuote.price) {
      return {
        price: fallbackQuote.price,
        previousClose: fallbackQuote.previousClose,
        change: fallbackQuote.change,
        changePercent: fallbackQuote.changePercent,
        provider: 'MarketDataService',
        timestamp: new Date().toISOString()
      };
    }

    return null;
  } catch (error) {
    logger.error(`Failed to fetch market price for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Helper: Calculate real P&L for positions using live market prices
 */
async function calculateRealPnL(positions) {
  const enrichedPositions = await Promise.all(positions.map(async (position) => {
    const marketQuote = await getRealMarketPrice(position.symbol);
    const currentPrice = marketQuote?.price || position.avg_cost;
    const marketValue = currentPrice * position.quantity;
    const costBasis = position.avg_cost * position.quantity;
    const unrealizedPnl = marketValue - costBasis;
    const unrealizedPnlPercent = position.avg_cost > 0
      ? ((currentPrice - position.avg_cost) / position.avg_cost) * 100
      : 0;

    return {
      id: position.id,
      accountId: position.account_id,
      symbol: position.symbol,
      quantity: position.quantity,
      avgCost: position.avg_cost,
      currentPrice,
      marketValue,
      costBasis,
      unrealizedPnl,
      unrealizedPnlPercent,
      dayChange: marketQuote?.change || 0,
      dayChangePercent: marketQuote?.changePercent || 0,
      provider: marketQuote?.provider || 'cached',
      priceTimestamp: marketQuote?.timestamp || new Date().toISOString(),
      createdAt: position.created_at,
      updatedAt: position.updated_at
    };
  }));

  return enrichedPositions;
}

/**
 * Helper: Generate unique ID for database records
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== ACCOUNTS ENDPOINTS ====================

/**
 * GET /api/trading/accounts
 * List all paper trading accounts for the authenticated user (from database)
 */
router.get('/accounts', authenticate, async (req, res) => {
  try {
    // Query real database for user's paper trading accounts
    const accounts = await prisma.paper_trading_accounts.findMany({
      where: { user_id: req.user.id },
      include: {
        paper_positions: true,
        paper_orders: {
          where: { status: { in: ['pending', 'partial'] } },
          orderBy: { created_at: 'desc' },
          take: 10
        }
      }
    });

    // If no accounts exist, return empty array with suggestion to create one
    if (accounts.length === 0) {
      return res.json({
        success: true,
        accounts: [],
        message: 'No paper trading accounts found. Create one with POST /api/trading/accounts'
      });
    }

    // Enrich each account with real market data P&L
    const enrichedAccounts = await Promise.all(accounts.map(async (account) => {
      const positionsWithPnL = await calculateRealPnL(account.paper_positions);
      const totalPositionValue = positionsWithPnL.reduce((sum, p) => sum + p.marketValue, 0);
      const totalUnrealizedPnl = positionsWithPnL.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const equity = account.cash_balance + totalPositionValue;
      const totalReturn = account.initial_balance > 0
        ? ((equity - account.initial_balance) / account.initial_balance) * 100
        : 0;

      return {
        id: account.id,
        userId: account.user_id,
        cashBalance: account.cash_balance,
        initialBalance: account.initial_balance,
        equity,
        totalPositionValue,
        totalUnrealizedPnl,
        totalRealizedPnl: account.total_pnl,
        totalReturn,
        totalTrades: account.total_trades,
        winningTrades: account.winning_trades,
        losingTrades: account.losing_trades,
        winRate: account.total_trades > 0
          ? (account.winning_trades / account.total_trades) * 100
          : 0,
        positionCount: account.paper_positions.length,
        pendingOrderCount: account.paper_orders.length,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      };
    }));

    res.json({ success: true, accounts: enrichedAccounts });
  } catch (error) {
    logger.error('Error fetching paper trading accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trading/accounts
 * Create a new paper trading account (save to database)
 */
router.post('/accounts', authenticate, async (req, res) => {
  try {
    const { initialBalance = 100000 } = req.body;

    // Check if user already has an account (schema has unique constraint on user_id)
    const existingAccount = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id }
    });

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        error: 'Paper trading account already exists. Use POST /api/trading/accounts/reset to reset it.',
        existingAccountId: existingAccount.id
      });
    }

    // Create new account in database
    const account = await prisma.paper_trading_accounts.create({
      data: {
        id: generateId(),
        user_id: req.user.id,
        cash_balance: parseFloat(initialBalance),
        initial_balance: parseFloat(initialBalance),
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        total_pnl: 0
      }
    });

    logger.info(`Created paper trading account ${account.id} for user ${req.user.id} with balance $${initialBalance}`);

    res.json({
      success: true,
      account: {
        id: account.id,
        userId: account.user_id,
        cashBalance: account.cash_balance,
        initialBalance: account.initial_balance,
        equity: account.cash_balance,
        totalPositionValue: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        positionCount: 0,
        pendingOrderCount: 0,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      },
      message: 'Paper trading account created successfully'
    });
  } catch (error) {
    logger.error('Error creating paper trading account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/accounts/:id
 * Get account details with positions (from database with real P&L)
 */
router.get('/accounts/:id', authenticate, async (req, res) => {
  try {
    const account = await prisma.paper_trading_accounts.findUnique({
      where: { id: req.params.id },
      include: {
        paper_positions: true,
        paper_orders: {
          orderBy: { created_at: 'desc' },
          take: 50
        }
      }
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Verify ownership
    if (account.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Calculate real P&L for all positions using live market prices
    const positionsWithPnL = await calculateRealPnL(account.paper_positions);
    const totalPositionValue = positionsWithPnL.reduce((sum, p) => sum + p.marketValue, 0);
    const totalUnrealizedPnl = positionsWithPnL.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const equity = account.cash_balance + totalPositionValue;
    const totalReturn = account.initial_balance > 0
      ? ((equity - account.initial_balance) / account.initial_balance) * 100
      : 0;

    res.json({
      success: true,
      account: {
        id: account.id,
        userId: account.user_id,
        cashBalance: account.cash_balance,
        initialBalance: account.initial_balance,
        equity,
        totalPositionValue,
        totalUnrealizedPnl,
        totalRealizedPnl: account.total_pnl,
        totalReturn,
        totalTrades: account.total_trades,
        winningTrades: account.winning_trades,
        losingTrades: account.losing_trades,
        winRate: account.total_trades > 0
          ? (account.winning_trades / account.total_trades) * 100
          : 0,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      },
      positions: positionsWithPnL,
      recentOrders: account.paper_orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        orderType: order.order_type,
        limitPrice: order.limit_price,
        stopPrice: order.stop_price,
        status: order.status,
        submittedPrice: order.submitted_price,
        filledPrice: order.filled_price,
        filledQuantity: order.filled_quantity,
        filledAt: order.filled_at,
        commission: order.commission,
        createdAt: order.created_at
      }))
    });
  } catch (error) {
    logger.error('Error fetching paper trading account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ORDERS ENDPOINTS ====================

/**
 * POST /api/trading/orders
 * Place a paper trade order using real market prices
 */
router.post('/orders', authenticate, async (req, res) => {
  try {
    const { symbol, side, quantity, orderType = 'market', limitPrice, stopPrice, timeInForce = 'day' } = req.body;

    // Validate required fields
    if (!symbol || !side || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, side, quantity'
      });
    }

    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Side must be "buy" or "sell"' });
    }

    const validOrderTypes = ['market', 'limit', 'stop', 'stop_limit'];
    if (!validOrderTypes.includes(orderType.toLowerCase())) {
      return res.status(400).json({ success: false, error: `Invalid order type. Must be one of: ${validOrderTypes.join(', ')}` });
    }

    // Get or create account
    let account = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id },
      include: { paper_positions: true }
    });

    if (!account) {
      // Auto-create account with default balance
      account = await prisma.paper_trading_accounts.create({
        data: {
          id: generateId(),
          user_id: req.user.id,
          cash_balance: 100000,
          initial_balance: 100000,
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          total_pnl: 0
        },
        include: { paper_positions: true }
      });
    }

    // Fetch REAL current market price
    const marketQuote = await getRealMarketPrice(symbol.toUpperCase());
    if (!marketQuote) {
      return res.status(400).json({
        success: false,
        error: `Unable to fetch real-time market price for ${symbol}. Please try again.`
      });
    }

    const currentPrice = marketQuote.price;
    const orderQty = parseFloat(quantity);
    const orderValue = currentPrice * orderQty;

    // Validate buying power for buy orders
    if (side.toLowerCase() === 'buy' && orderValue > account.cash_balance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient buying power. Required: $${orderValue.toFixed(2)}, Available: $${account.cash_balance.toFixed(2)}`
      });
    }

    // Validate position for sell orders
    if (side.toLowerCase() === 'sell') {
      const position = account.paper_positions.find(p => p.symbol === symbol.toUpperCase());
      if (!position || position.quantity < orderQty) {
        return res.status(400).json({
          success: false,
          error: `Insufficient shares. You have ${position?.quantity || 0} shares of ${symbol}`
        });
      }
    }

    // Create order in database
    const orderId = generateId();
    const order = await prisma.paper_orders.create({
      data: {
        id: orderId,
        account_id: account.id,
        symbol: symbol.toUpperCase(),
        side: side.toLowerCase(),
        quantity: orderQty,
        order_type: orderType.toLowerCase(),
        limit_price: limitPrice ? parseFloat(limitPrice) : null,
        stop_price: stopPrice ? parseFloat(stopPrice) : null,
        time_in_force: timeInForce,
        status: 'pending',
        submitted_price: currentPrice
      }
    });

    logger.info(`Created paper order ${orderId}: ${side} ${orderQty} ${symbol} @ $${currentPrice} (${marketQuote.provider})`);

    // For market orders, execute immediately at real price
    if (orderType.toLowerCase() === 'market') {
      const executedOrder = await executeOrderAtRealPrice(order.id, currentPrice, account, side.toLowerCase(), orderQty, symbol.toUpperCase());
      return res.json({
        success: true,
        order: executedOrder,
        execution: {
          price: currentPrice,
          provider: marketQuote.provider,
          timestamp: marketQuote.timestamp
        }
      });
    }

    // For limit/stop orders, return pending order
    res.json({
      success: true,
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        orderType: order.order_type,
        limitPrice: order.limit_price,
        stopPrice: order.stop_price,
        status: order.status,
        submittedPrice: order.submitted_price,
        marketPrice: currentPrice,
        provider: marketQuote.provider,
        createdAt: order.created_at
      },
      message: `${orderType} order placed. Will execute when price conditions are met.`
    });
  } catch (error) {
    logger.error('Error placing paper order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper: Execute order at real market price
 */
async function executeOrderAtRealPrice(orderId, executionPrice, account, side, quantity, symbol) {
  const totalValue = executionPrice * quantity;

  // Update order to filled
  await prisma.paper_orders.update({
    where: { id: orderId },
    data: {
      status: 'filled',
      filled_price: executionPrice,
      filled_quantity: quantity,
      filled_at: new Date(),
      commission: 0
    }
  });

  if (side === 'buy') {
    // Check if position exists
    const existingPosition = await prisma.paper_positions.findFirst({
      where: { account_id: account.id, symbol }
    });

    if (existingPosition) {
      // Average up/down the position
      const totalShares = existingPosition.quantity + quantity;
      const totalCost = (existingPosition.avg_cost * existingPosition.quantity) + (executionPrice * quantity);
      const newAvgCost = totalCost / totalShares;

      await prisma.paper_positions.update({
        where: { id: existingPosition.id },
        data: {
          quantity: totalShares,
          avg_cost: newAvgCost
        }
      });
    } else {
      // Create new position
      await prisma.paper_positions.create({
        data: {
          id: generateId(),
          account_id: account.id,
          symbol,
          quantity,
          avg_cost: executionPrice
        }
      });
    }

    // Deduct cash
    await prisma.paper_trading_accounts.update({
      where: { id: account.id },
      data: { cash_balance: { decrement: totalValue } }
    });

    logger.info(`Executed BUY: ${quantity} ${symbol} @ $${executionPrice} = $${totalValue}`);
  } else {
    // SELL - reduce position and calculate P&L
    const position = await prisma.paper_positions.findFirst({
      where: { account_id: account.id, symbol }
    });

    if (!position) {
      throw new Error('Position not found');
    }

    const realizedPnl = (executionPrice - position.avg_cost) * quantity;
    const isWin = realizedPnl > 0;

    if (position.quantity === quantity) {
      // Close entire position
      await prisma.paper_positions.delete({ where: { id: position.id } });
    } else {
      // Partial close
      await prisma.paper_positions.update({
        where: { id: position.id },
        data: { quantity: { decrement: quantity } }
      });
    }

    // Add cash and update P&L stats
    await prisma.paper_trading_accounts.update({
      where: { id: account.id },
      data: {
        cash_balance: { increment: totalValue },
        total_trades: { increment: 1 },
        winning_trades: isWin ? { increment: 1 } : undefined,
        losing_trades: !isWin ? { increment: 1 } : undefined,
        total_pnl: { increment: realizedPnl }
      }
    });

    logger.info(`Executed SELL: ${quantity} ${symbol} @ $${executionPrice} = $${totalValue} (P&L: $${realizedPnl.toFixed(2)})`);
  }

  // Return updated order
  const updatedOrder = await prisma.paper_orders.findUnique({
    where: { id: orderId }
  });

  return {
    id: updatedOrder.id,
    symbol: updatedOrder.symbol,
    side: updatedOrder.side,
    quantity: updatedOrder.quantity,
    orderType: updatedOrder.order_type,
    status: updatedOrder.status,
    submittedPrice: updatedOrder.submitted_price,
    filledPrice: updatedOrder.filled_price,
    filledQuantity: updatedOrder.filled_quantity,
    filledAt: updatedOrder.filled_at,
    commission: updatedOrder.commission,
    createdAt: updatedOrder.created_at
  };
}

/**
 * GET /api/trading/orders
 * Get order history from database
 */
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, symbol, limit = 50, offset = 0 } = req.query;

    const account = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id }
    });

    if (!account) {
      return res.json({ success: true, orders: [], total: 0 });
    }

    // Build where clause
    const where = { account_id: account.id };
    if (status) where.status = status;
    if (symbol) where.symbol = symbol.toUpperCase();

    // Get orders with count
    const [orders, total] = await Promise.all([
      prisma.paper_orders.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.paper_orders.count({ where })
    ]);

    res.json({
      success: true,
      orders: orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        orderType: order.order_type,
        limitPrice: order.limit_price,
        stopPrice: order.stop_price,
        timeInForce: order.time_in_force,
        status: order.status,
        submittedPrice: order.submitted_price,
        filledPrice: order.filled_price,
        filledQuantity: order.filled_quantity,
        filledAt: order.filled_at,
        commission: order.commission,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error fetching paper orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== POSITIONS ENDPOINTS ====================

/**
 * GET /api/trading/positions
 * Get current positions with real P&L using live market prices
 */
router.get('/positions', authenticate, async (req, res) => {
  try {
    const account = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id },
      include: { paper_positions: true }
    });

    if (!account) {
      return res.json({ success: true, positions: [], summary: null });
    }

    // Calculate real P&L for all positions using live market prices
    const positionsWithPnL = await calculateRealPnL(account.paper_positions);

    // Calculate summary
    const totalMarketValue = positionsWithPnL.reduce((sum, p) => sum + p.marketValue, 0);
    const totalCostBasis = positionsWithPnL.reduce((sum, p) => sum + p.costBasis, 0);
    const totalUnrealizedPnl = positionsWithPnL.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalDayChange = positionsWithPnL.reduce((sum, p) => sum + (p.dayChange * p.quantity), 0);

    res.json({
      success: true,
      positions: positionsWithPnL,
      summary: {
        positionCount: positionsWithPnL.length,
        totalMarketValue,
        totalCostBasis,
        totalUnrealizedPnl,
        totalUnrealizedPnlPercent: totalCostBasis > 0
          ? (totalUnrealizedPnl / totalCostBasis) * 100
          : 0,
        totalDayChange,
        cashBalance: account.cash_balance,
        equity: account.cash_balance + totalMarketValue
      }
    });
  } catch (error) {
    logger.error('Error fetching paper positions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/trading/positions/:id
 * Close position at real market price
 */
router.delete('/positions/:id', authenticate, async (req, res) => {
  try {
    const position = await prisma.paper_positions.findUnique({
      where: { id: req.params.id },
      include: { paper_trading_accounts: true }
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    // Verify ownership
    if (position.paper_trading_accounts.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Get REAL current market price for closing
    const marketQuote = await getRealMarketPrice(position.symbol);
    if (!marketQuote) {
      return res.status(400).json({
        success: false,
        error: `Unable to fetch real-time market price for ${position.symbol}. Cannot close position.`
      });
    }

    const closePrice = marketQuote.price;
    const totalValue = closePrice * position.quantity;
    const realizedPnl = (closePrice - position.avg_cost) * position.quantity;
    const isWin = realizedPnl > 0;

    // Create a sell order record
    const orderId = generateId();
    await prisma.paper_orders.create({
      data: {
        id: orderId,
        account_id: position.account_id,
        symbol: position.symbol,
        side: 'sell',
        quantity: position.quantity,
        order_type: 'market',
        status: 'filled',
        submitted_price: closePrice,
        filled_price: closePrice,
        filled_quantity: position.quantity,
        filled_at: new Date(),
        commission: 0
      }
    });

    // Delete the position
    await prisma.paper_positions.delete({ where: { id: position.id } });

    // Update account: add cash, update stats
    await prisma.paper_trading_accounts.update({
      where: { id: position.account_id },
      data: {
        cash_balance: { increment: totalValue },
        total_trades: { increment: 1 },
        winning_trades: isWin ? { increment: 1 } : undefined,
        losing_trades: !isWin ? { increment: 1 } : undefined,
        total_pnl: { increment: realizedPnl }
      }
    });

    logger.info(`Closed position ${position.id}: SELL ${position.quantity} ${position.symbol} @ $${closePrice} (P&L: $${realizedPnl.toFixed(2)})`);

    res.json({
      success: true,
      closedPosition: {
        id: position.id,
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avg_cost,
        closePrice,
        costBasis: position.avg_cost * position.quantity,
        proceeds: totalValue,
        realizedPnl,
        realizedPnlPercent: ((closePrice - position.avg_cost) / position.avg_cost) * 100,
        priceProvider: marketQuote.provider,
        closedAt: new Date().toISOString()
      },
      message: `Position closed. Realized P&L: $${realizedPnl.toFixed(2)}`
    });
  } catch (error) {
    logger.error('Error closing paper position:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LEGACY PAPER TRADING ROUTES (backward compatibility) ====================

/**
 * GET /api/trading/paper/account
 * Get paper trading account details (legacy endpoint)
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
 * POST /api/trading/accounts/reset
 * Reset paper trading account (new endpoint)
 */
router.post('/accounts/reset', authenticate, async (req, res) => {
  try {
    const account = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'No account found to reset' });
    }

    // Delete all positions and orders
    await prisma.paper_positions.deleteMany({ where: { account_id: account.id } });
    await prisma.paper_orders.deleteMany({ where: { account_id: account.id } });

    // Reset account to initial state
    const resetAccount = await prisma.paper_trading_accounts.update({
      where: { id: account.id },
      data: {
        cash_balance: account.initial_balance,
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        total_pnl: 0
      }
    });

    logger.info(`Reset paper trading account ${account.id} for user ${req.user.id}`);

    res.json({
      success: true,
      account: {
        id: resetAccount.id,
        userId: resetAccount.user_id,
        cashBalance: resetAccount.cash_balance,
        initialBalance: resetAccount.initial_balance,
        equity: resetAccount.cash_balance,
        totalPositionValue: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0
      },
      message: 'Account reset successfully'
    });
  } catch (error) {
    logger.error('Error resetting paper account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/paper/positions
 * Get all paper trading positions (legacy endpoint)
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
 * Place a paper trade order (legacy endpoint)
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
 * Get paper trading order history (legacy endpoint)
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
 * Cancel a pending paper order (legacy endpoint)
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
 * DELETE /api/trading/orders/:orderId
 * Cancel a pending paper order (new endpoint)
 */
router.delete('/orders/:orderId', authenticate, async (req, res) => {
  try {
    const order = await prisma.paper_orders.findUnique({
      where: { id: req.params.orderId },
      include: { paper_trading_accounts: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.paper_trading_accounts.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending orders can be cancelled' });
    }

    const cancelledOrder = await prisma.paper_orders.update({
      where: { id: order.id },
      data: { status: 'cancelled' }
    });

    logger.info(`Cancelled paper order ${order.id}`);

    res.json({
      success: true,
      order: {
        id: cancelledOrder.id,
        symbol: cancelledOrder.symbol,
        side: cancelledOrder.side,
        quantity: cancelledOrder.quantity,
        orderType: cancelledOrder.order_type,
        status: cancelledOrder.status,
        cancelledAt: new Date().toISOString()
      },
      message: 'Order cancelled'
    });
  } catch (error) {
    logger.error('Error cancelling paper order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trading/paper/statistics
 * Get paper trading statistics and performance (legacy endpoint)
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

/**
 * GET /api/trading/statistics
 * Get paper trading statistics with real P&L (new endpoint)
 */
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const account = await prisma.paper_trading_accounts.findUnique({
      where: { user_id: req.user.id },
      include: {
        paper_positions: true,
        paper_orders: {
          where: { status: 'filled' },
          orderBy: { filled_at: 'desc' },
          take: 20
        }
      }
    });

    if (!account) {
      return res.json({ success: true, statistics: null, message: 'No paper trading account found' });
    }

    // Calculate real P&L for positions
    const positionsWithPnL = await calculateRealPnL(account.paper_positions);
    const totalMarketValue = positionsWithPnL.reduce((sum, p) => sum + p.marketValue, 0);
    const totalUnrealizedPnl = positionsWithPnL.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const equity = account.cash_balance + totalMarketValue;
    const totalReturn = ((equity - account.initial_balance) / account.initial_balance) * 100;

    res.json({
      success: true,
      statistics: {
        account: {
          id: account.id,
          cashBalance: account.cash_balance,
          initialBalance: account.initial_balance,
          equity,
          totalReturn,
          totalReturnDollar: equity - account.initial_balance,
          positionsValue: totalMarketValue,
          unrealizedPnl: totalUnrealizedPnl,
          realizedPnl: account.total_pnl,
          totalTrades: account.total_trades,
          winningTrades: account.winning_trades,
          losingTrades: account.losing_trades,
          winRate: account.total_trades > 0
            ? (account.winning_trades / account.total_trades) * 100
            : 0
        },
        positions: positionsWithPnL,
        recentTrades: account.paper_orders.map(order => ({
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          filledPrice: order.filled_price,
          filledAt: order.filled_at
        })),
        tradeCount: account.total_trades
      }
    });
  } catch (error) {
    logger.error('Error fetching paper statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
