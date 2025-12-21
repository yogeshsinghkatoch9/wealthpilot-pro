/**
 * Strategy Engine
 * Core engine for executing trading strategies and generating signals
 */

// Use SQLite compatibility layer for Railway support
const db = require('../../db/sqliteCompat');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const Indicators = require('./indicators');

// Import strategy implementations
const MACDCrossoverStrategy = require('./strategies/macdCrossover');
const RSIStrategy = require('./strategies/rsiStrategy');
const MovingAverageCrossover = require('./strategies/movingAverageCrossover');
const BollingerBandsStrategy = require('./strategies/bollingerBands');
const MeanReversionStrategy = require('./strategies/meanReversion');


class StrategyEngine {
  constructor() {
    this.strategies = {
      'macd_crossover': MACDCrossoverStrategy,
      'rsi': RSIStrategy,
      'ma_crossover': MovingAverageCrossover,
      'bollinger': BollingerBandsStrategy,
      'mean_reversion': MeanReversionStrategy
    };
  }

  /**
   * Create a new trading strategy
   * @param {String} userId - User ID
   * @param {Object} strategyData - Strategy configuration
   * @returns {Object} Created strategy
   */
  createStrategy(userId, strategyData) {
    const strategyId = uuidv4();
    const {
      name,
      description,
      strategy_type,
      parameters,
      symbols,
      timeframe,
      is_paper_trading
    } = strategyData;

    const stmt = db.prepare(`
      INSERT INTO trading_strategies (
        id, user_id, name, description, strategy_type,
        parameters, symbols, timeframe, is_paper_trading
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      strategyId,
      userId,
      name,
      description || '',
      strategy_type,
      JSON.stringify(parameters),
      symbols || 'ALL',
      timeframe || '1h',
      is_paper_trading !== undefined ? is_paper_trading : 1
    );

    logger.info(`Strategy created: ${name} (${strategy_type}) for user ${userId}`);

    return this.getStrategy(strategyId);
  }

  /**
   * Get strategy by ID
   * @param {String} strategyId - Strategy ID
   * @returns {Object} Strategy
   */
  getStrategy(strategyId) {
    const strategy = db.prepare(`
      SELECT * FROM trading_strategies WHERE id = ?
    `).get(strategyId);

    if (strategy) {
      strategy.parameters = JSON.parse(strategy.parameters);
    }

    return strategy;
  }

  /**
   * Get all strategies for a user
   * @param {String} userId - User ID
   * @returns {Array} Array of strategies
   */
  getUserStrategies(userId) {
    const strategies = db.prepare(`
      SELECT * FROM trading_strategies
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    return strategies.map(s => ({
      ...s,
      parameters: JSON.parse(s.parameters)
    }));
  }

  /**
   * Update strategy
   * @param {String} strategyId - Strategy ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated strategy
   */
  updateStrategy(strategyId, updates) {
    const fields = [];
    const values = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'parameters') {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(strategyId);

    const stmt = db.prepare(`
      UPDATE trading_strategies
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getStrategy(strategyId);
  }

  /**
   * Delete strategy
   * @param {String} strategyId - Strategy ID
   */
  deleteStrategy(strategyId) {
    db.prepare('DELETE FROM trading_strategies WHERE id = ?').run(strategyId);
    logger.info(`Strategy deleted: ${strategyId}`);
  }

  /**
   * Generate signal for a symbol using a strategy
   * @param {String} strategyId - Strategy ID
   * @param {String} symbol - Stock symbol
   * @param {Array} historicalData - Array of OHLCV data
   * @returns {Object} Signal object
   */
  async generateSignal(strategyId, symbol, historicalData) {
    const strategy = this.getStrategy(strategyId);

    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const StrategyClass = this.strategies[strategy.strategy_type];

    if (!StrategyClass) {
      throw new Error(`Unknown strategy type: ${strategy.strategy_type}`);
    }

    // Instantiate strategy with parameters
    const strategyInstance = new StrategyClass(strategy.parameters);

    // Generate signal
    const signal = await strategyInstance.analyze(symbol, historicalData);

    // Save signal to database
    if (signal && signal.action !== 'HOLD') {
      this.saveSignal(strategy.id, strategy.user_id, symbol, signal);
    }

    return signal;
  }

  /**
   * Save trading signal to database
   * @param {String} strategyId - Strategy ID
   * @param {String} userId - User ID
   * @param {String} symbol - Stock symbol
   * @param {Object} signal - Signal data
   */
  saveSignal(strategyId, userId, symbol, signal) {
    const signalId = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO strategy_signals (
        id, strategy_id, user_id, symbol, signal_type,
        price, confidence, indicators, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      signalId,
      strategyId,
      userId,
      symbol,
      signal.action,
      signal.price,
      signal.confidence || 0.5,
      JSON.stringify(signal.indicators || {}),
      signal.reason || ''
    );

    logger.info(`Signal saved: ${signal.action} ${symbol} @ ${signal.price}`);
    return signalId;
  }

  /**
   * Get signals for a strategy
   * @param {String} strategyId - Strategy ID
   * @param {Object} options - Query options
   * @returns {Array} Array of signals
   */
  getSignals(strategyId, options = {}) {
    const { limit = 100, symbol, executed } = options;

    let query = 'SELECT * FROM strategy_signals WHERE strategy_id = ?';
    const params = [strategyId];

    if (symbol) {
      query += ' AND symbol = ?';
      params.push(symbol);
    }

    if (executed !== undefined) {
      query += ' AND executed = ?';
      params.push(executed ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const signals = db.prepare(query).all(...params);

    return signals.map(s => ({
      ...s,
      indicators: JSON.parse(s.indicators || '{}')
    }));
  }

  /**
   * Mark signal as executed
   * @param {String} signalId - Signal ID
   */
  markSignalExecuted(signalId) {
    db.prepare(`
      UPDATE strategy_signals
      SET executed = 1, executed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(signalId);
  }

  /**
   * Get strategy performance summary
   * @param {String} strategyId - Strategy ID
   * @returns {Object} Performance metrics
   */
  getStrategyPerformance(strategyId) {
    const signals = this.getSignals(strategyId, { executed: true });

    const buySignals = signals.filter(s => s.signal_type === 'BUY');
    const sellSignals = signals.filter(s => s.signal_type === 'SELL');

    return {
      total_signals: signals.length,
      buy_signals: buySignals.length,
      sell_signals: sellSignals.length,
      avg_confidence: signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length || 0,
      recent_signals: signals.slice(0, 10)
    };
  }
}

module.exports = new StrategyEngine();
