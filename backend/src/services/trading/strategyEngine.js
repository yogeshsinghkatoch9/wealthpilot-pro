/**
 * Strategy Engine
 * Core engine for executing trading strategies and generating signals
 */

const { prisma } = require('../../db/simpleDb');
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
      'sma_crossover': MovingAverageCrossover,
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
  async createStrategy(userId, strategyData) {
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

    try {
      const paramsJson = JSON.stringify(parameters);
      const symbolsStr = Array.isArray(symbols) ? symbols.join(',') : symbols || 'ALL';
      const tfValue = timeframe || '1h';
      const isPaper = is_paper_trading !== false;

      await prisma.$executeRawUnsafe(`
        INSERT INTO trading_strategies (
          id, user_id, name, description, strategy_type,
          parameters, symbols, timeframe, is_paper_trading, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, NOW(), NOW()
        )
      `, strategyId, userId, name, description || '', strategy_type, paramsJson, symbolsStr, tfValue, isPaper, true);

      logger.info(`Strategy created: ${name} (${strategy_type}) for user ${userId}`);
      return this.getStrategy(strategyId);
    } catch (error) {
      logger.error('Error creating strategy:', error);
      throw error;
    }
  }

  /**
   * Get strategy by ID
   * @param {String} strategyId - Strategy ID
   * @returns {Object} Strategy
   */
  async getStrategy(strategyId) {
    try {
      const strategies = await prisma.$queryRaw`
        SELECT * FROM trading_strategies WHERE id = ${strategyId}
      `;

      if (!strategies || strategies.length === 0) return null;

      const strategy = strategies[0];
      return {
        ...strategy,
        parameters: typeof strategy.parameters === 'string'
          ? JSON.parse(strategy.parameters)
          : strategy.parameters
      };
    } catch (error) {
      logger.error('Error getting strategy:', error);
      return null;
    }
  }

  /**
   * Get all strategies for a user
   * @param {String} userId - User ID
   * @returns {Array} User's strategies
   */
  async getUserStrategies(userId) {
    try {
      const strategies = await prisma.$queryRaw`
        SELECT * FROM trading_strategies
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

      return strategies.map(s => ({
        ...s,
        parameters: typeof s.parameters === 'string'
          ? JSON.parse(s.parameters)
          : s.parameters
      }));
    } catch (error) {
      logger.error('Error getting user strategies:', error);
      return [];
    }
  }

  /**
   * Update strategy
   * @param {String} strategyId - Strategy ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated strategy
   */
  async updateStrategy(strategyId, updates) {
    try {
      const { name, description, parameters, symbols, timeframe, is_active, is_paper_trading } = updates;

      // Build update query dynamically to handle JSONB casting
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (description !== undefined) {
        setClause.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (parameters !== undefined) {
        setClause.push(`parameters = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(parameters));
      }
      if (symbols !== undefined) {
        setClause.push(`symbols = $${paramIndex++}`);
        values.push(Array.isArray(symbols) ? symbols.join(',') : symbols);
      }
      if (timeframe !== undefined) {
        setClause.push(`timeframe = $${paramIndex++}`);
        values.push(timeframe);
      }
      if (is_active !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(is_active);
      }
      if (is_paper_trading !== undefined) {
        setClause.push(`is_paper_trading = $${paramIndex++}`);
        values.push(is_paper_trading);
      }

      setClause.push('updated_at = NOW()');
      values.push(strategyId);

      if (setClause.length > 1) {
        await prisma.$executeRawUnsafe(
          `UPDATE trading_strategies SET ${setClause.join(', ')} WHERE id = $${paramIndex}`,
          ...values
        );
      }

      return this.getStrategy(strategyId);
    } catch (error) {
      logger.error('Error updating strategy:', error);
      throw error;
    }
  }

  /**
   * Delete strategy
   * @param {String} strategyId - Strategy ID
   */
  async deleteStrategy(strategyId) {
    try {
      await prisma.$executeRaw`
        DELETE FROM trading_strategies WHERE id = ${strategyId}
      `;
      return true;
    } catch (error) {
      logger.error('Error deleting strategy:', error);
      throw error;
    }
  }

  /**
   * Generate trading signal for a strategy
   * @param {String} strategyId - Strategy ID
   * @param {String} symbol - Stock symbol
   * @param {Array} historicalData - OHLCV data
   * @returns {Object} Trading signal
   */
  async generateSignal(strategyId, symbol, historicalData) {
    const strategy = await this.getStrategy(strategyId);

    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const StrategyClass = this.strategies[strategy.strategy_type];

    if (!StrategyClass) {
      throw new Error(`Unknown strategy type: ${strategy.strategy_type}`);
    }

    const strategyInstance = new StrategyClass(strategy.parameters);
    // Strategy classes use 'analyze' method with signature (symbol, data)
    return strategyInstance.analyze(symbol, historicalData);
  }

  /**
   * Get available strategy types
   * @returns {Array} List of available strategy types
   */
  getAvailableStrategies() {
    return Object.keys(this.strategies).map(key => ({
      type: key,
      name: this.getStrategyDisplayName(key),
      description: this.getStrategyDescription(key)
    }));
  }

  getStrategyDisplayName(type) {
    const names = {
      'macd_crossover': 'MACD Crossover',
      'rsi': 'RSI Strategy',
      'sma_crossover': 'SMA Crossover',
      'ma_crossover': 'Moving Average Crossover',
      'bollinger': 'Bollinger Bands',
      'mean_reversion': 'Mean Reversion'
    };
    return names[type] || type;
  }

  getStrategyDescription(type) {
    const descriptions = {
      'macd_crossover': 'Trade based on MACD line crossing the signal line',
      'rsi': 'Trade based on RSI overbought/oversold levels',
      'sma_crossover': 'Trade when short SMA crosses long SMA',
      'ma_crossover': 'Trade when short MA crosses long MA',
      'bollinger': 'Trade based on price touching Bollinger Bands',
      'mean_reversion': 'Trade when price deviates from mean'
    };
    return descriptions[type] || '';
  }

  /**
   * Get signals for a strategy (stored signals from previous runs)
   * @param {String} strategyId - Strategy ID
   * @param {Object} options - Filter options
   * @returns {Array} Signals
   */
  async getSignals(strategyId, options = {}) {
    try {
      const { limit = 100, symbol, executed } = options;

      // For now, return empty array as signals are generated on-demand
      // In a full implementation, you would store signals in a trading_signals table
      const signals = await prisma.$queryRaw`
        SELECT * FROM trading_signals
        WHERE strategy_id = ${strategyId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return signals || [];
    } catch (error) {
      // Table may not exist yet - return empty array
      logger.warn('Could not fetch signals (table may not exist):', error.message);
      return [];
    }
  }
}

module.exports = new StrategyEngine();
