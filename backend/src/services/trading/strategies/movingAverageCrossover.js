/**
 * Moving Average Crossover Strategy
 * Generates BUY signal when fast MA crosses above slow MA (golden cross)
 * Generates SELL signal when fast MA crosses below slow MA (death cross)
 */

const Indicators = require('../indicators');

class MovingAverageCrossoverStrategy {
  constructor(params = {}) {
    this.fastPeriod = params.fastPeriod || 50;
    this.slowPeriod = params.slowPeriod || 200;
    this.maType = params.maType || 'SMA'; // 'SMA' or 'EMA'
    this.minConfidence = params.minConfidence || 0.6;
  }

  /**
   * Analyze historical data and generate trading signal
   * @param {String} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV objects
   * @returns {Object} Signal object
   */
  async analyze(symbol, data) {
    if (data.length < this.slowPeriod) {
      return { action: 'HOLD', reason: 'Insufficient data for MA calculation' };
    }

    const closes = data.map(d => d.close);

    // Calculate moving averages
    let fastMA, slowMA;
    if (this.maType === 'EMA') {
      fastMA = Indicators.EMA(closes, this.fastPeriod);
      slowMA = Indicators.EMA(closes, this.slowPeriod);
    } else {
      fastMA = Indicators.SMA(closes, this.fastPeriod);
      slowMA = Indicators.SMA(closes, this.slowPeriod);
    }

    const currentFast = fastMA[fastMA.length - 1];
    const currentSlow = slowMA[slowMA.length - 1];
    const prevFast = fastMA[fastMA.length - 2];
    const prevSlow = slowMA[slowMA.length - 2];
    const currentPrice = closes[closes.length - 1];

    if (currentFast === null || currentSlow === null) {
      return { action: 'HOLD', reason: 'Waiting for moving averages to stabilize' };
    }

    // Check for crossover
    const goldenCross = prevFast <= prevSlow && currentFast > currentSlow;
    const deathCross = prevFast >= prevSlow && currentFast < currentSlow;

    // Calculate confidence based on separation
    let confidence = 0.5;

    if (goldenCross || deathCross) {
      // Calculate percentage separation
      const separation = Math.abs((currentFast - currentSlow) / currentSlow) * 100;

      // More separation = higher confidence
      confidence = 0.6 + Math.min(0.3, separation * 0.1);

      // Check if price is above/below both MAs (trend confirmation)
      if (goldenCross && currentPrice > currentFast) {
        confidence += 0.1;
      } else if (deathCross && currentPrice < currentFast) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);
    }

    // Generate signal
    if (goldenCross && confidence >= this.minConfidence) {
      return {
        action: 'BUY',
        price: currentPrice,
        confidence: confidence,
        reason: `Golden Cross: ${this.maType}(${this.fastPeriod}) crossed above ${this.maType}(${this.slowPeriod})`,
        indicators: {
          fastMA: currentFast,
          slowMA: currentSlow,
          separation: ((currentFast - currentSlow) / currentSlow * 100).toFixed(2) + '%'
        }
      };
    }

    if (deathCross && confidence >= this.minConfidence) {
      return {
        action: 'SELL',
        price: currentPrice,
        confidence: confidence,
        reason: `Death Cross: ${this.maType}(${this.fastPeriod}) crossed below ${this.maType}(${this.slowPeriod})`,
        indicators: {
          fastMA: currentFast,
          slowMA: currentSlow,
          separation: ((currentSlow - currentFast) / currentSlow * 100).toFixed(2) + '%'
        }
      };
    }

    // Determine current trend
    const trend = currentFast > currentSlow ? 'bullish' : 'bearish';

    return {
      action: 'HOLD',
      price: currentPrice,
      reason: `No crossover detected. Current trend: ${trend}`,
      indicators: {
        fastMA: currentFast,
        slowMA: currentSlow,
        trend: trend
      }
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Moving Average Crossover',
      description: 'Classic golden cross / death cross strategy using moving averages',
      parameters: {
        fastPeriod: { value: this.fastPeriod, description: 'Fast moving average period' },
        slowPeriod: { value: this.slowPeriod, description: 'Slow moving average period' },
        maType: { value: this.maType, description: 'Moving average type (SMA or EMA)' },
        minConfidence: { value: this.minConfidence, description: 'Minimum confidence threshold' }
      }
    };
  }
}

module.exports = MovingAverageCrossoverStrategy;
