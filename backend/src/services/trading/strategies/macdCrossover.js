/**
 * MACD Crossover Strategy
 * Generates BUY signal when MACD crosses above signal line
 * Generates SELL signal when MACD crosses below signal line
 */

const Indicators = require('../indicators');

class MACDCrossoverStrategy {
  constructor(params = {}) {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.signalPeriod = params.signalPeriod || 9;
    this.minConfidence = params.minConfidence || 0.6;
  }

  /**
   * Analyze historical data and generate trading signal
   * @param {String} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV objects: { date, open, high, low, close, volume }
   * @returns {Object} Signal: { action, price, confidence, reason, indicators }
   */
  async analyze(symbol, data) {
    if (data.length < this.slowPeriod + this.signalPeriod) {
      return { action: 'HOLD', reason: 'Insufficient data for MACD calculation' };
    }

    const closes = data.map(d => d.close);
    const macdData = Indicators.MACD(closes, this.fastPeriod, this.slowPeriod, this.signalPeriod);

    const { macd, signal, histogram } = macdData;

    // Get last few values
    const currentMacd = macd[macd.length - 1];
    const currentSignal = signal[signal.length - 1];
    const prevMacd = macd[macd.length - 2];
    const prevSignal = signal[signal.length - 2];
    const currentHistogram = histogram[histogram.length - 1];
    const prevHistogram = histogram[histogram.length - 2];

    if (currentMacd === null || currentSignal === null) {
      return { action: 'HOLD', reason: 'Waiting for indicators to stabilize' };
    }

    const currentPrice = closes[closes.length - 1];

    // Check for crossover
    const crossedAbove = prevMacd <= prevSignal && currentMacd > currentSignal;
    const crossedBelow = prevMacd >= prevSignal && currentMacd < currentSignal;

    // Calculate confidence based on histogram strength
    let confidence = 0.5;

    if (crossedAbove || crossedBelow) {
      // Higher confidence if histogram is growing
      const histogramGrowth = Math.abs(currentHistogram) / Math.abs(prevHistogram || 1);
      confidence = Math.min(0.9, 0.5 + (histogramGrowth * 0.2));

      // Boost confidence if MACD is far from signal line
      const separation = Math.abs(currentMacd - currentSignal);
      confidence += separation * 0.01;
      confidence = Math.min(0.95, confidence);
    }

    // Generate signal
    if (crossedAbove && confidence >= this.minConfidence) {
      return {
        action: 'BUY',
        price: currentPrice,
        confidence: confidence,
        reason: `MACD crossed above signal line (${currentMacd.toFixed(2)} > ${currentSignal.toFixed(2)})`,
        indicators: {
          macd: currentMacd,
          signal: currentSignal,
          histogram: currentHistogram
        }
      };
    }

    if (crossedBelow && confidence >= this.minConfidence) {
      return {
        action: 'SELL',
        price: currentPrice,
        confidence: confidence,
        reason: `MACD crossed below signal line (${currentMacd.toFixed(2)} < ${currentSignal.toFixed(2)})`,
        indicators: {
          macd: currentMacd,
          signal: currentSignal,
          histogram: currentHistogram
        }
      };
    }

    return {
      action: 'HOLD',
      price: currentPrice,
      reason: 'No crossover detected',
      indicators: {
        macd: currentMacd,
        signal: currentSignal,
        histogram: currentHistogram
      }
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'MACD Crossover',
      description: 'Buys when MACD crosses above signal line, sells when it crosses below',
      parameters: {
        fastPeriod: { value: this.fastPeriod, description: 'Fast EMA period' },
        slowPeriod: { value: this.slowPeriod, description: 'Slow EMA period' },
        signalPeriod: { value: this.signalPeriod, description: 'Signal line period' },
        minConfidence: { value: this.minConfidence, description: 'Minimum confidence threshold' }
      }
    };
  }
}

module.exports = MACDCrossoverStrategy;
