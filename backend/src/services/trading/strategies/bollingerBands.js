/**
 * Bollinger Bands Strategy
 * Generates BUY signal when price touches or crosses below lower band (oversold)
 * Generates SELL signal when price touches or crosses above upper band (overbought)
 */

const Indicators = require('../indicators');

class BollingerBandsStrategy {
  constructor(params = {}) {
    this.period = params.period || 20;
    this.stdDev = params.stdDev || 2;
    this.touchThreshold = params.touchThreshold || 0.02; // 2% threshold for "touching" band
    this.minConfidence = params.minConfidence || 0.6;
  }

  /**
   * Analyze historical data and generate trading signal
   * @param {String} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV objects
   * @returns {Object} Signal object
   */
  async analyze(symbol, data) {
    if (data.length < this.period) {
      return { action: 'HOLD', reason: 'Insufficient data for Bollinger Bands calculation' };
    }

    const closes = data.map(d => d.close);
    const bb = Indicators.BollingerBands(closes, this.period, this.stdDev);

    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];

    const currentUpper = bb.upper[bb.upper.length - 1];
    const currentMiddle = bb.middle[bb.middle.length - 1];
    const currentLower = bb.lower[bb.lower.length - 1];

    const prevUpper = bb.upper[bb.upper.length - 2];
    const prevLower = bb.lower[bb.lower.length - 2];

    if (currentUpper === null || currentLower === null) {
      return { action: 'HOLD', reason: 'Waiting for Bollinger Bands to stabilize' };
    }

    // Calculate band width (volatility measure)
    const bandWidth = ((currentUpper - currentLower) / currentMiddle) * 100;

    // Calculate price position within bands
    const pricePosition = ((currentPrice - currentLower) / (currentUpper - currentLower)) * 100;

    let confidence = 0.5;

    // Check for lower band touch/cross (oversold - BUY signal)
    const touchingLowerBand = currentPrice <= currentLower * (1 + this.touchThreshold);
    const crossedBelowLowerBand = prevPrice >= prevLower && currentPrice < currentLower;

    if (touchingLowerBand || crossedBelowLowerBand) {
      // Calculate how far below the band
      const penetration = ((currentLower - currentPrice) / currentLower) * 100;

      // More penetration = higher confidence
      confidence = 0.6 + Math.min(0.3, Math.abs(penetration) * 0.1);

      // Boost confidence if band width is narrow (volatility squeeze)
      if (bandWidth < 10) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'BUY',
          price: currentPrice,
          confidence: confidence,
          reason: `Price at lower Bollinger Band (${currentLower.toFixed(2)}). Potential bounce.`,
          indicators: {
            price: currentPrice,
            upperBand: currentUpper,
            middleBand: currentMiddle,
            lowerBand: currentLower,
            bandWidth: bandWidth.toFixed(2) + '%',
            pricePosition: pricePosition.toFixed(2) + '%'
          }
        };
      }
    }

    // Check for upper band touch/cross (overbought - SELL signal)
    const touchingUpperBand = currentPrice >= currentUpper * (1 - this.touchThreshold);
    const crossedAboveUpperBand = prevPrice <= prevUpper && currentPrice > currentUpper;

    if (touchingUpperBand || crossedAboveUpperBand) {
      // Calculate how far above the band
      const penetration = ((currentPrice - currentUpper) / currentUpper) * 100;

      // More penetration = higher confidence
      confidence = 0.6 + Math.min(0.3, penetration * 0.1);

      // Boost confidence if band width is narrow
      if (bandWidth < 10) {
        confidence += 0.1;
      }

      confidence = Math.min(0.95, confidence);

      if (confidence >= this.minConfidence) {
        return {
          action: 'SELL',
          price: currentPrice,
          confidence: confidence,
          reason: `Price at upper Bollinger Band (${currentUpper.toFixed(2)}). Potential reversal.`,
          indicators: {
            price: currentPrice,
            upperBand: currentUpper,
            middleBand: currentMiddle,
            lowerBand: currentLower,
            bandWidth: bandWidth.toFixed(2) + '%',
            pricePosition: pricePosition.toFixed(2) + '%'
          }
        };
      }
    }

    // Determine position within bands
    let position;
    if (pricePosition > 80) position = 'near upper band';
    else if (pricePosition < 20) position = 'near lower band';
    else position = 'mid-range';

    return {
      action: 'HOLD',
      price: currentPrice,
      reason: `Price is ${position}. Waiting for band touch.`,
      indicators: {
        price: currentPrice,
        upperBand: currentUpper,
        middleBand: currentMiddle,
        lowerBand: currentLower,
        bandWidth: bandWidth.toFixed(2) + '%',
        pricePosition: pricePosition.toFixed(2) + '%'
      }
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Bollinger Bands Mean Reversion',
      description: 'Buys at lower band, sells at upper band. Classic mean reversion strategy.',
      parameters: {
        period: { value: this.period, description: 'Moving average period for middle band' },
        stdDev: { value: this.stdDev, description: 'Standard deviations for band width' },
        touchThreshold: { value: this.touchThreshold, description: 'Threshold for detecting band touch (%)' },
        minConfidence: { value: this.minConfidence, description: 'Minimum confidence threshold' }
      }
    };
  }
}

module.exports = BollingerBandsStrategy;
