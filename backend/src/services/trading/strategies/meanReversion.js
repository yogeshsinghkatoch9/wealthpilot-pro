/**
 * Mean Reversion Strategy
 * Assumes price will revert to the mean (average) over time
 * Generates BUY signal when price is significantly below the mean
 * Generates SELL signal when price is significantly above the mean
 */

const Indicators = require('../indicators');

class MeanReversionStrategy {
  constructor(params = {}) {
    this.period = params.period || 20;
    this.deviationThreshold = params.deviationThreshold || 2; // Number of standard deviations
    this.minConfidence = params.minConfidence || 0.6;
    this.useRSIFilter = params.useRSIFilter !== false; // Default true
  }

  /**
   * Analyze historical data and generate trading signal
   * @param {String} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV objects
   * @returns {Object} Signal object
   */
  async analyze(symbol, data) {
    if (data.length < this.period) {
      return { action: 'HOLD', reason: 'Insufficient data for mean reversion calculation' };
    }

    const closes = data.map(d => d.close);

    // Calculate mean and standard deviation
    const sma = Indicators.SMA(closes, this.period);
    const currentSMA = sma[sma.length - 1];
    const currentPrice = closes[closes.length - 1];

    if (currentSMA === null) {
      return { action: 'HOLD', reason: 'Waiting for moving average to stabilize' };
    }

    // Calculate standard deviation
    const recentPrices = closes.slice(-this.period);
    const variance = recentPrices.reduce((sum, price) => {
      return sum + Math.pow(price - currentSMA, 2);
    }, 0) / this.period;
    const stdDev = Math.sqrt(variance);

    // Calculate z-score (how many std devs away from mean)
    const zScore = (currentPrice - currentSMA) / stdDev;

    // Optional RSI filter to confirm overbought/oversold
    let rsi = null;
    if (this.useRSIFilter) {
      const rsiValues = Indicators.RSI(closes, 14);
      rsi = rsiValues[rsiValues.length - 1];
    }

    let confidence = 0.5;

    // Price significantly below mean (BUY signal)
    if (zScore < -this.deviationThreshold) {
      // Higher deviation = higher confidence
      const extremeness = Math.min(1, Math.abs(zScore) / (this.deviationThreshold * 2));
      confidence = 0.6 + (extremeness * 0.3);

      // Boost confidence if RSI confirms oversold
      if (rsi && rsi < 30) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'BUY',
          price: currentPrice,
          confidence: confidence,
          reason: `Price ${Math.abs(zScore).toFixed(2)} std devs below mean. Expecting reversion to ${currentSMA.toFixed(2)}`,
          indicators: {
            price: currentPrice,
            mean: currentSMA,
            zScore: zScore.toFixed(2),
            stdDev: stdDev.toFixed(2),
            rsi: rsi ? rsi.toFixed(2) : null,
            deviationPercent: (((currentPrice - currentSMA) / currentSMA) * 100).toFixed(2) + '%'
          }
        };
      }
    }

    // Price significantly above mean (SELL signal)
    if (zScore > this.deviationThreshold) {
      // Higher deviation = higher confidence
      const extremeness = Math.min(1, Math.abs(zScore) / (this.deviationThreshold * 2));
      confidence = 0.6 + (extremeness * 0.3);

      // Boost confidence if RSI confirms overbought
      if (rsi && rsi > 70) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'SELL',
          price: currentPrice,
          confidence: confidence,
          reason: `Price ${Math.abs(zScore).toFixed(2)} std devs above mean. Expecting reversion to ${currentSMA.toFixed(2)}`,
          indicators: {
            price: currentPrice,
            mean: currentSMA,
            zScore: zScore.toFixed(2),
            stdDev: stdDev.toFixed(2),
            rsi: rsi ? rsi.toFixed(2) : null,
            deviationPercent: (((currentPrice - currentSMA) / currentSMA) * 100).toFixed(2) + '%'
          }
        };
      }
    }

    // Price near mean
    const deviationPercent = Math.abs((currentPrice - currentSMA) / currentSMA * 100);

    return {
      action: 'HOLD',
      price: currentPrice,
      reason: `Price ${deviationPercent.toFixed(2)}% from mean. Within normal range.`,
      indicators: {
        price: currentPrice,
        mean: currentSMA,
        zScore: zScore.toFixed(2),
        stdDev: stdDev.toFixed(2),
        rsi: rsi ? rsi.toFixed(2) : null
      }
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Mean Reversion (Z-Score)',
      description: 'Trades on the assumption that prices revert to the mean over time',
      parameters: {
        period: { value: this.period, description: 'Period for calculating mean' },
        deviationThreshold: { value: this.deviationThreshold, description: 'Standard deviation threshold for signals' },
        useRSIFilter: { value: this.useRSIFilter, description: 'Use RSI to confirm signals' },
        minConfidence: { value: this.minConfidence, description: 'Minimum confidence threshold' }
      }
    };
  }
}

module.exports = MeanReversionStrategy;
