/**
 * Backtesting Service
 * Simulates trading strategies on historical data and calculates performance metrics
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
    try {
      const backtest = await prisma.backtestResult.create({
        data: {
          userId,
          strategyName: result.strategyName || 'Custom Strategy',
          strategyType: result.strategyType || 'custom',
          symbol: result.symbol,
          startDate: new Date(result.startDate),
          endDate: new Date(result.endDate),
          initialCapital: result.initialCapital,
          finalValue: result.finalCapital,
          totalReturn: result.finalCapital - result.initialCapital,
          totalReturnPct: result.totalReturn,
          annualizedReturn: result.annualizedReturn || null,
          sharpeRatio: result.sharpeRatio || null,
          maxDrawdown: result.maxDrawdown || null,
          maxDrawdownPct: result.maxDrawdown || null,
          winRate: result.winRate || null,
          totalTrades: result.totalTrades || 0,
          winningTrades: result.winningTrades || null,
          losingTrades: result.losingTrades || null,
          avgWin: result.avgWin || null,
          avgLoss: result.avgLoss || null,
          profitFactor: result.profitFactor || null,
          parameters: result.config ? JSON.stringify(result.config) : null,
          trades: result.trades ? JSON.stringify(result.trades) : null,
          equityCurve: result.equityCurve ? JSON.stringify(result.equityCurve) : null
        }
      });

      logger.info(`Backtest result saved: ${backtest.id}`);
      return backtest.id;
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
      const result = await prisma.backtestResult.findUnique({
        where: { id: backtestId }
      });

      if (!result) return null;

      return {
        ...result,
        trades: result.trades ? JSON.parse(result.trades) : [],
        equityCurve: result.equityCurve ? JSON.parse(result.equityCurve) : [],
        parameters: result.parameters ? JSON.parse(result.parameters) : {}
      };
    } catch (error) {
      logger.error('Error getting backtest result:', error);
      return null;
    }
  }

  /**
   * Get all backtest results for a strategy type
   * @param {String} strategyType - Strategy type
   * @returns {Array} Array of backtest results
   */
  async getStrategyBacktests(strategyType) {
    try {
      const results = await prisma.backtestResult.findMany({
        where: { strategyType },
        orderBy: { createdAt: 'desc' }
      });

      return results.map(r => ({
        ...r,
        trades: r.trades ? JSON.parse(r.trades) : [],
        equityCurve: r.equityCurve ? JSON.parse(r.equityCurve) : [],
        parameters: r.parameters ? JSON.parse(r.parameters) : {}
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
      const results = await prisma.backtestResult.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      return results.map(r => ({
        ...r,
        trades: r.trades ? JSON.parse(r.trades) : [],
        equityCurve: r.equityCurve ? JSON.parse(r.equityCurve) : [],
        parameters: r.parameters ? JSON.parse(r.parameters) : {}
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
      await prisma.backtestResult.delete({
        where: { id: backtestId }
      });
      logger.info(`Backtest deleted: ${backtestId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting backtest:', error);
      throw error;
    }
  }
}

module.exports = new BacktestingService();
