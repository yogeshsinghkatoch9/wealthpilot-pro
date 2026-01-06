/**
 * RSI (Relative Strength Index) Strategy
 * Generates BUY signal when RSI is oversold (< 30)
 * Generates SELL signal when RSI is overbought (> 70)
 */

const Indicators = require('../indicators');

class RSIStrategy {
  constructor(params = {}) {
    this.period = params.period || 14;
    this.oversoldThreshold = params.oversoldThreshold || 30;
    this.overboughtThreshold = params.overboughtThreshold || 70;
    this.minConfidence = params.minConfidence || 0.6;
  }

  /**
   * Analyze historical data and generate trading signal
   * @param {String} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV objects
   * @returns {Object} Signal object
   */
  async analyze(symbol, data) {
    if (data.length < this.period + 1) {
      return { action: 'HOLD', reason: 'Insufficient data for RSI calculation' };
    }

    const closes = data.map(d => d.close);
    const rsi = Indicators.RSI(closes, this.period);

    const currentRSI = rsi[rsi.length - 1];
    const prevRSI = rsi[rsi.length - 2];
    const currentPrice = closes[closes.length - 1];

    if (currentRSI === null) {
      return { action: 'HOLD', reason: 'Waiting for RSI to stabilize' };
    }

    // Calculate confidence based on how extreme the RSI is
    let confidence = 0.5;

    // Oversold condition - potential BUY
    if (currentRSI < this.oversoldThreshold) {
      // More oversold = higher confidence
      const extremeness = (this.oversoldThreshold - currentRSI) / this.oversoldThreshold;
      confidence = 0.6 + (extremeness * 0.3);

      // Check if RSI is starting to turn up (increasing momentum)
      if (currentRSI > prevRSI) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'BUY',
          price: currentPrice,
          confidence: confidence,
          reason: `RSI is oversold at ${currentRSI.toFixed(2)} (threshold: ${this.oversoldThreshold})`,
          indicators: {
            rsi: currentRSI,
            prevRSI: prevRSI,
            oversoldThreshold: this.oversoldThreshold
          }
        };
      }
    }

    // Overbought condition - potential SELL
    if (currentRSI > this.overboughtThreshold) {
      // More overbought = higher confidence
      const extremeness = (currentRSI - this.overboughtThreshold) / (100 - this.overboughtThreshold);
      confidence = 0.6 + (extremeness * 0.3);

      // Check if RSI is starting to turn down (decreasing momentum)
      if (currentRSI < prevRSI) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'SELL',
          price: currentPrice,
          confidence: confidence,
          reason: `RSI is overbought at ${currentRSI.toFixed(2)} (threshold: ${this.overboughtThreshold})`,
          indicators: {
            rsi: currentRSI,
            prevRSI: prevRSI,
            overboughtThreshold: this.overboughtThreshold
          }
        };
      }
    }

    // Neutral zone
    return {
      action: 'HOLD',
      price: currentPrice,
      reason: `RSI at ${currentRSI.toFixed(2)} is in neutral zone`,
      indicators: {
        rsi: currentRSI,
        oversoldThreshold: this.oversoldThreshold,
        overboughtThreshold: this.overboughtThreshold
      }
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'RSI Overbought/Oversold',
      description: 'Buys when RSI is oversold (<30), sells when RSI is overbought (>70)',
      parameters: {
        period: { value: this.period, description: 'RSI calculation period' },
        oversoldThreshold: { value: this.oversoldThreshold, description: 'Oversold threshold for BUY signals' },
        overboughtThreshold: { value: this.overboughtThreshold, description: 'Overbought threshold for SELL signals' },
        minConfidence: { value: this.minConfidence, description: 'Minimum confidence threshold' }
      }
    };
  }
}

module.exports = RSIStrategy;
