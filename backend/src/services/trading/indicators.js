/**
 * Technical Indicators Library
 * Provides all common technical analysis indicators for algorithmic trading
 */

class TechnicalIndicators {
  /**
   * Simple Moving Average (SMA)
   * @param {Array} data - Array of price values
   * @param {Number} period - Number of periods
   * @returns {Array} Array of SMA values
   */
  static SMA(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  /**
   * Exponential Moving Average (EMA)
   * @param {Array} data - Array of price values
   * @param {Number} period - Number of periods
   * @returns {Array} Array of EMA values
   */
  static EMA(data, period) {
    const result = [];
    const multiplier = 2 / (period + 1);

    // First EMA is SMA
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(...Array(period - 1).fill(null));
    result.push(ema);

    // Calculate EMA for remaining data
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }

    return result;
  }

  /**
   * Moving Average Convergence Divergence (MACD)
   * @param {Array} data - Array of closing prices
   * @param {Number} fastPeriod - Fast EMA period (default: 12)
   * @param {Number} slowPeriod - Slow EMA period (default: 26)
   * @param {Number} signalPeriod - Signal line period (default: 9)
   * @returns {Object} { macd, signal, histogram }
   */
  static MACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = this.EMA(data, fastPeriod);
    const slowEMA = this.EMA(data, slowPeriod);

    // MACD Line = Fast EMA - Slow EMA
    const macdLine = fastEMA.map((fast, i) => {
      if (fast === null || slowEMA[i] === null) return null;
      return fast - slowEMA[i];
    });

    // Signal Line = EMA of MACD Line
    const validMacd = macdLine.filter(v => v !== null);
    const signalLine = this.EMA(validMacd, signalPeriod);

    // Pad signal line with nulls
    const paddedSignal = [
      ...Array(macdLine.length - signalLine.length).fill(null),
      ...signalLine
    ];

    // Histogram = MACD Line - Signal Line
    const histogram = macdLine.map((macd, i) => {
      if (macd === null || paddedSignal[i] === null) return null;
      return macd - paddedSignal[i];
    });

    return {
      macd: macdLine,
      signal: paddedSignal,
      histogram: histogram
    };
  }

  /**
   * Relative Strength Index (RSI)
   * @param {Array} data - Array of closing prices
   * @param {Number} period - RSI period (default: 14)
   * @returns {Array} Array of RSI values (0-100)
   */
  static RSI(data, period = 14) {
    const result = [];
    const changes = [];

    // Calculate price changes
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }

    result.push(null); // First value has no RSI

    for (let i = 0; i < changes.length; i++) {
      if (i < period - 1) {
        result.push(null);
        continue;
      }

      const slice = changes.slice(i - period + 1, i + 1);
      const gains = slice.filter(v => v > 0).reduce((a, b) => a + b, 0) / period;
      const losses = Math.abs(slice.filter(v => v < 0).reduce((a, b) => a + b, 0)) / period;

      if (losses === 0) {
        result.push(100);
      } else {
        const rs = gains / losses;
        const rsi = 100 - (100 / (1 + rs));
        result.push(rsi);
      }
    }

    return result;
  }

  /**
   * Bollinger Bands
   * @param {Array} data - Array of closing prices
   * @param {Number} period - Period for SMA (default: 20)
   * @param {Number} stdDev - Number of standard deviations (default: 2)
   * @returns {Object} { upper, middle, lower }
   */
  static BollingerBands(data, period = 20, stdDev = 2) {
    const middle = this.SMA(data, period);
    const upper = [];
    const lower = [];

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(null);
        lower.push(null);
        continue;
      }

      const slice = data.slice(i - period + 1, i + 1);
      const sma = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
      const std = Math.sqrt(variance);

      upper.push(sma + (stdDev * std));
      lower.push(sma - (stdDev * std));
    }

    return { upper, middle, lower };
  }

  /**
   * Stochastic Oscillator
   * @param {Array} highs - Array of high prices
   * @param {Array} lows - Array of low prices
   * @param {Array} closes - Array of closing prices
   * @param {Number} period - %K period (default: 14)
   * @param {Number} smoothK - %K smoothing (default: 3)
   * @param {Number} smoothD - %D smoothing (default: 3)
   * @returns {Object} { k, d }
   */
  static Stochastic(highs, lows, closes, period = 14, smoothK = 3, smoothD = 3) {
    const rawK = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        rawK.push(null);
        continue;
      }

      const highSlice = highs.slice(i - period + 1, i + 1);
      const lowSlice = lows.slice(i - period + 1, i + 1);
      const highest = Math.max(...highSlice);
      const lowest = Math.min(...lowSlice);

      const k = ((closes[i] - lowest) / (highest - lowest)) * 100;
      rawK.push(k);
    }

    // Smooth %K
    const k = this.SMA(rawK.filter(v => v !== null), smoothK);
    const paddedK = [...Array(rawK.filter(v => v === null).length + smoothK - 1).fill(null), ...k];

    // %D is SMA of %K
    const d = this.SMA(k, smoothD);
    const paddedD = [...Array(rawK.filter(v => v === null).length + smoothK + smoothD - 2).fill(null), ...d];

    return { k: paddedK, d: paddedD };
  }

  /**
   * Average True Range (ATR)
   * @param {Array} highs - Array of high prices
   * @param {Array} lows - Array of low prices
   * @param {Array} closes - Array of closing prices
   * @param {Number} period - ATR period (default: 14)
   * @returns {Array} Array of ATR values
   */
  static ATR(highs, lows, closes, period = 14) {
    const tr = [null]; // First TR is undefined

    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const trueRange = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      tr.push(trueRange);
    }

    return this.EMA(tr.filter(v => v !== null), period);
  }

  /**
   * On-Balance Volume (OBV)
   * @param {Array} closes - Array of closing prices
   * @param {Array} volumes - Array of volumes
   * @returns {Array} Array of OBV values
   */
  static OBV(closes, volumes) {
    const obv = [volumes[0]];

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv.push(obv[i - 1] + volumes[i]);
      } else if (closes[i] < closes[i - 1]) {
        obv.push(obv[i - 1] - volumes[i]);
      } else {
        obv.push(obv[i - 1]);
      }
    }

    return obv;
  }

  /**
   * Commodity Channel Index (CCI)
   * @param {Array} highs - Array of high prices
   * @param {Array} lows - Array of low prices
   * @param {Array} closes - Array of closing prices
   * @param {Number} period - CCI period (default: 20)
   * @returns {Array} Array of CCI values
   */
  static CCI(highs, lows, closes, period = 20) {
    const typicalPrice = closes.map((close, i) => (highs[i] + lows[i] + close) / 3);
    const sma = this.SMA(typicalPrice, period);
    const result = [];

    for (let i = 0; i < typicalPrice.length; i++) {
      if (i < period - 1) {
        result.push(null);
        continue;
      }

      const slice = typicalPrice.slice(i - period + 1, i + 1);
      const meanDev = slice.reduce((sum, val) => sum + Math.abs(val - sma[i]), 0) / period;
      const cci = (typicalPrice[i] - sma[i]) / (0.015 * meanDev);
      result.push(cci);
    }

    return result;
  }

  /**
   * Detect crossover (value crosses above threshold)
   * @param {Array} values - Array of indicator values
   * @param {Number|Array} threshold - Threshold value or array
   * @returns {Array} Array of booleans indicating crossover points
   */
  static crossAbove(values, threshold) {
    const thresholds = Array.isArray(threshold) ? threshold : Array(values.length).fill(threshold);
    const crossovers = [false];

    for (let i = 1; i < values.length; i++) {
      if (values[i] === null || values[i - 1] === null) {
        crossovers.push(false);
        continue;
      }

      const crossed = values[i] > thresholds[i] && values[i - 1] <= thresholds[i - 1];
      crossovers.push(crossed);
    }

    return crossovers;
  }

  /**
   * Detect crossunder (value crosses below threshold)
   * @param {Array} values - Array of indicator values
   * @param {Number|Array} threshold - Threshold value or array
   * @returns {Array} Array of booleans indicating crossunder points
   */
  static crossBelow(values, threshold) {
    const thresholds = Array.isArray(threshold) ? threshold : Array(values.length).fill(threshold);
    const crossunders = [false];

    for (let i = 1; i < values.length; i++) {
      if (values[i] === null || values[i - 1] === null) {
        crossunders.push(false);
        continue;
      }

      const crossed = values[i] < thresholds[i] && values[i - 1] >= thresholds[i - 1];
      crossunders.push(crossed);
    }

    return crossunders;
  }
}

module.exports = TechnicalIndicators;
