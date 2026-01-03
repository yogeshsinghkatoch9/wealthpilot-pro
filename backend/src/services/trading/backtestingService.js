/**
 * Backtesting Service
 * Simulates trading strategies on historical data and calculates performance metrics
 */

const { prisma } = require('../../db/simpleDb');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const strategyEngine = require('./strategyEngine');


class BacktestingService {
  constructor() {
    this.defaultConfig = {
      initialCapital: 10000,
      commission: 0.001, // 0.1% per trade
      slippage: 0.0005, // 0.05% slippage
      positionSize: 1.0, // 100% of capital per position
      maxPositions: 1, // Max concurrent positions
      reinvestProfits: true
    };
  }

  /**
   * Run backtest for a strategy
   * @param {String} strategyId - Strategy ID
   * @param {String} symbol - Stock symbol
   * @param {Array} historicalData - Array of OHLCV data
   * @param {Object} config - Backtest configuration
   * @returns {Object} Backtest results
   */
  async runBacktest(strategyId, symbol, historicalData, config = {}) {
    const strategy = await strategyEngine.getStrategy(strategyId);

    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const backtestConfig = { ...this.defaultConfig, ...config };

    logger.info(`Starting backtest for strategy ${strategy.name} on ${symbol}`);
    logger.info(`Data points: ${historicalData.length}, Period: ${historicalData[0]?.date} to ${historicalData[historicalData.length - 1]?.date}`);

    // Initialize tracking variables
    let capital = backtestConfig.initialCapital;
    let position = null; // { shares, entryPrice, entryDate, entryIndex }
    const trades = [];
    const equityCurve = [];
    const signals = [];

    // Simulate trading
    for (let i = 50; i < historicalData.length; i++) { // Start at 50 to have enough data for indicators
      const dataSlice = historicalData.slice(0, i + 1);
      const currentBar = historicalData[i];
      const currentPrice = currentBar.close;

      // Generate signal
      const signal = await strategyEngine.generateSignal(strategyId, symbol, dataSlice);

      if (signal.action !== 'HOLD') {
        signals.push({
          date: currentBar.date,
          action: signal.action,
          price: signal.price,
          confidence: signal.confidence,
          reason: signal.reason
        });
      }

      // Execute trades based on signals
      if (!position && signal.action === 'BUY') {
        // Open long position
        const buyPrice = currentPrice * (1 + backtestConfig.slippage); // Apply slippage
        const shares = Math.floor((capital * backtestConfig.positionSize) / buyPrice);
        const cost = shares * buyPrice;
        const commissionCost = cost * backtestConfig.commission;
        const totalCost = cost + commissionCost;

        if (totalCost <= capital && shares > 0) {
          position = {
            shares,
            entryPrice: buyPrice,
            entryDate: currentBar.date,
            entryIndex: i,
            entryCapital: capital,
            commission: commissionCost
          };

          capital -= totalCost;

          logger.debug(`BUY: ${shares} shares @ $${buyPrice.toFixed(2)}, Capital: $${capital.toFixed(2)}`);
        }
      } else if (position && signal.action === 'SELL') {
        // Close long position
        const sellPrice = currentPrice * (1 - backtestConfig.slippage); // Apply slippage
        const proceeds = position.shares * sellPrice;
        const commissionCost = proceeds * backtestConfig.commission;
        const netProceeds = proceeds - commissionCost;

        capital += netProceeds;

        const profitLoss = netProceeds - (position.shares * position.entryPrice) - position.commission;
        const profitLossPct = (profitLoss / (position.shares * position.entryPrice)) * 100;

        const trade = {
          entryDate: position.entryDate,
          exitDate: currentBar.date,
          entryPrice: position.entryPrice,
          exitPrice: sellPrice,
          shares: position.shares,
          profitLoss,
          profitLossPct,
          duration: i - position.entryIndex,
          commission: position.commission + commissionCost
        };

        trades.push(trade);

        logger.debug(`SELL: ${position.shares} shares @ $${sellPrice.toFixed(2)}, P&L: $${profitLoss.toFixed(2)} (${profitLossPct.toFixed(2)}%)`);

        position = null;
      }

      // Calculate current equity
      const equity = position
        ? capital + (position.shares * currentPrice)
        : capital;

      equityCurve.push({
        date: currentBar.date,
        equity,
        drawdown: ((equity - backtestConfig.initialCapital) / backtestConfig.initialCapital) * 100
      });
    }

    // Close any open position at the end
    if (position) {
      const lastBar = historicalData[historicalData.length - 1];
      const sellPrice = lastBar.close * (1 - backtestConfig.slippage);
      const proceeds = position.shares * sellPrice;
      const commissionCost = proceeds * backtestConfig.commission;
      const netProceeds = proceeds - commissionCost;

      capital += netProceeds;

      const profitLoss = netProceeds - (position.shares * position.entryPrice) - position.commission;
      const profitLossPct = (profitLoss / (position.shares * position.entryPrice)) * 100;

      trades.push({
        entryDate: position.entryDate,
        exitDate: lastBar.date,
        entryPrice: position.entryPrice,
        exitPrice: sellPrice,
        shares: position.shares,
        profitLoss,
        profitLossPct,
        duration: historicalData.length - 1 - position.entryIndex,
        commission: position.commission + commissionCost
      });
    }

    // Calculate performance metrics
    const metrics = this.calculateMetrics(trades, equityCurve, backtestConfig.initialCapital);

    const result = {
      strategyId,
      symbol,
      startDate: historicalData[0].date,
      endDate: historicalData[historicalData.length - 1].date,
      initialCapital: backtestConfig.initialCapital,
      finalCapital: capital,
      ...metrics,
      trades,
      equityCurve,
      signals,
      config: backtestConfig
    };

    // Save backtest result to database
    await this.saveBacktestResult(strategy.user_id, result);

    logger.info(`Backtest completed. Total Return: ${metrics.totalReturn.toFixed(2)}%, Win Rate: ${metrics.winRate.toFixed(2)}%`);

    return result;
  }

  /**
   * Calculate performance metrics
   * @param {Array} trades - Array of trade objects
   * @param {Array} equityCurve - Array of equity values
   * @param {Number} initialCapital - Initial capital
   * @returns {Object} Performance metrics
   */
  calculateMetrics(trades, equityCurve, initialCapital) {
    if (trades.length === 0) {
      return {
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        expectancy: 0
      };
    }

    const finalCapital = equityCurve[equityCurve.length - 1].equity;
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;

    const winningTrades = trades.filter(t => t.profitLoss > 0);
    const losingTrades = trades.filter(t => t.profitLoss < 0);

    const winRate = (winningTrades.length / trades.length) * 100;

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.profitLoss, 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profitLoss, 0) / losingTrades.length)
      : 0;

    // Calculate max drawdown
    let maxEquity = initialCapital;
    let maxDrawdown = 0;

    equityCurve.forEach(point => {
      if (point.equity > maxEquity) {
        maxEquity = point.equity;
      }
      const drawdown = ((maxEquity - point.equity) / maxEquity) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calculate Sharpe Ratio (simplified - assuming 0% risk-free rate)
    const returns = equityCurve.map((point, i) => {
      if (i === 0) return 0;
      return ((point.equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity) * 100;
    });

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Profit Factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profitLoss, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profitLoss, 0));
    const profitFactor = grossLoss !== 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy (average $ per trade)
    const expectancy = trades.reduce((sum, t) => sum + t.profitLoss, 0) / trades.length;

    return {
      totalReturn,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin,
      avgLoss,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      expectancy
    };
  }

  /**
   * Save backtest result to database
   * @param {String} userId - User ID
   * @param {Object} result - Backtest result
   */
  async saveBacktestResult(userId, result) {
    const backtestId = uuidv4();

    try {
      await prisma.$executeRaw`
        INSERT INTO backtest_results (
          id, strategy_id, user_id, symbol, start_date, end_date,
          initial_capital, final_capital, total_return, total_trades,
          winning_trades, losing_trades, win_rate, avg_win, avg_loss,
          max_drawdown, sharpe_ratio, profit_factor, expectancy,
          trades_data, equity_curve, created_at
        ) VALUES (
          ${backtestId}, ${result.strategyId}, ${userId}, ${result.symbol},
          ${result.startDate}, ${result.endDate}, ${result.initialCapital},
          ${result.finalCapital}, ${result.totalReturn}, ${result.totalTrades},
          ${result.winningTrades}, ${result.losingTrades}, ${result.winRate},
          ${result.avgWin}, ${result.avgLoss}, ${result.maxDrawdown},
          ${result.sharpeRatio}, ${result.profitFactor}, ${result.expectancy},
          ${JSON.stringify(result.trades)}, ${JSON.stringify(result.equityCurve)}, NOW()
        )
      `;

      logger.info(`Backtest result saved: ${backtestId}`);
      return backtestId;
    } catch (error) {
      logger.error('Error saving backtest result:', error);
      // Don't throw - backtest still completed, just couldn't save
      return null;
    }
  }

  /**
   * Get backtest result by ID
   * @param {String} backtestId - Backtest ID
   * @returns {Object} Backtest result
   */
  async getBacktestResult(backtestId) {
    try {
      const results = await prisma.$queryRaw`
        SELECT * FROM backtest_results WHERE id = ${backtestId}
      `;

      if (!results || results.length === 0) return null;

      const result = results[0];
      return {
        ...result,
        trades_data: typeof result.trades_data === 'string'
          ? JSON.parse(result.trades_data)
          : result.trades_data,
        equity_curve: typeof result.equity_curve === 'string'
          ? JSON.parse(result.equity_curve)
          : result.equity_curve
      };
    } catch (error) {
      logger.error('Error getting backtest result:', error);
      return null;
    }
  }

  /**
   * Get all backtest results for a strategy
   * @param {String} strategyId - Strategy ID
   * @returns {Array} Array of backtest results
   */
  async getStrategyBacktests(strategyId) {
    try {
      const results = await prisma.$queryRaw`
        SELECT * FROM backtest_results
        WHERE strategy_id = ${strategyId}
        ORDER BY created_at DESC
      `;

      return results.map(r => ({
        ...r,
        trades_data: typeof r.trades_data === 'string' ? JSON.parse(r.trades_data) : r.trades_data,
        equity_curve: typeof r.equity_curve === 'string' ? JSON.parse(r.equity_curve) : r.equity_curve
      }));
    } catch (error) {
      logger.error('Error getting strategy backtests:', error);
      return [];
    }
  }

  /**
   * Get all backtest results for a user
   * @param {String} userId - User ID
   * @returns {Array} Array of backtest results
   */
  async getUserBacktests(userId) {
    try {
      const results = await prisma.$queryRaw`
        SELECT br.*, ts.name as strategy_name, ts.strategy_type
        FROM backtest_results br
        LEFT JOIN trading_strategies ts ON br.strategy_id = ts.id
        WHERE br.user_id = ${userId}
        ORDER BY br.created_at DESC
      `;

      return results.map(r => ({
        ...r,
        trades_data: typeof r.trades_data === 'string' ? JSON.parse(r.trades_data) : r.trades_data,
        equity_curve: typeof r.equity_curve === 'string' ? JSON.parse(r.equity_curve) : r.equity_curve
      }));
    } catch (error) {
      logger.error('Error getting user backtests:', error);
      return [];
    }
  }

  /**
   * Delete backtest result
   * @param {String} backtestId - Backtest ID
   */
  async deleteBacktest(backtestId) {
    try {
      await prisma.$executeRaw`
        DELETE FROM backtest_results WHERE id = ${backtestId}
      `;
      logger.info(`Backtest deleted: ${backtestId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting backtest:', error);
      throw error;
    }
  }
}

module.exports = new BacktestingService();
