/**
 * Technical Analysis Service
 * Provides real-time calculations for technical indicators
 * Using proper financial formulas
 */

const logger = require('../utils/logger');

class TechnicalAnalysisService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Calculate Simple Moving Average (SMA)
   * @param {number[]} prices - Array of closing prices
   * @param {number} period - Period for SMA
   * @returns {number[]} SMA values
   */
  calculateSMA(prices, period) {
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * @param {number[]} prices - Array of closing prices
   * @param {number} period - Period for EMA
   * @returns {number[]} EMA values
   */
  calculateEMA(prices, period) {
    const multiplier = 2 / (period + 1);
    const ema = [prices.slice(0, period).reduce((a, b) => a + b, 0) / period];

    for (let i = period; i < prices.length; i++) {
      ema.push((prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
    }
    return ema;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param {number[]} prices - Array of closing prices
   * @param {number} period - Period for RSI (default 14)
   * @returns {number[]} RSI values
   */
  calculateRSI(prices, period = 14) {
    const rsi = [];
    const gains = [];
    const losses = [];

    // Calculate price changes
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Calculate initial average gain/loss
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // First RSI value
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    // Subsequent RSI values using smoothed averages
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return rsi;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * @param {number[]} prices - Array of closing prices
   * @param {number} fastPeriod - Fast EMA period (default 12)
   * @param {number} slowPeriod - Slow EMA period (default 26)
   * @param {number} signalPeriod - Signal line period (default 9)
   * @returns {Object} MACD, signal, and histogram arrays
   */
  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);

    // Align arrays (slow EMA starts later)
    const offset = slowPeriod - fastPeriod;
    const macd = [];

    for (let i = 0; i < slowEMA.length; i++) {
      macd.push(fastEMA[i + offset] - slowEMA[i]);
    }

    const signal = this.calculateEMA(macd, signalPeriod);
    const histogram = [];

    for (let i = 0; i < signal.length; i++) {
      histogram.push(macd[i + signalPeriod - 1] - signal[i]);
    }

    return { macd, signal, histogram };
  }

  /**
   * Calculate Bollinger Bands
   * @param {number[]} prices - Array of closing prices
   * @param {number} period - Period for SMA (default 20)
   * @param {number} stdDev - Number of standard deviations (default 2)
   * @returns {Object} Upper, middle, and lower bands
   */
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const middle = this.calculateSMA(prices, period);
    const upper = [];
    const lower = [];

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
      const std = Math.sqrt(variance);

      const idx = i - period + 1;
      upper.push(middle[idx] + (stdDev * std));
      lower.push(middle[idx] - (stdDev * std));
    }

    return { upper, middle, lower };
  }

  /**
   * Calculate Stochastic Oscillator
   * @param {number[]} highs - High prices
   * @param {number[]} lows - Low prices
   * @param {number[]} closes - Closing prices
   * @param {number} kPeriod - %K period (default 14)
   * @param {number} dPeriod - %D period (default 3)
   * @returns {Object} %K and %D values
   */
  calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    const k = [];

    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const highest = Math.max(...highSlice);
      const lowest = Math.min(...lowSlice);
      const range = highest - lowest;

      k.push(range === 0 ? 50 : ((closes[i] - lowest) / range) * 100);
    }

    const d = this.calculateSMA(k, dPeriod);

    return { k, d };
  }

  /**
   * Calculate Average Directional Index (ADX)
   * @param {number[]} highs - High prices
   * @param {number[]} lows - Low prices
   * @param {number[]} closes - Closing prices
   * @param {number} period - Period (default 14)
   * @returns {Object} ADX, +DI, -DI values
   */
  calculateADX(highs, lows, closes, period = 14) {
    const trueRanges = [];
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < closes.length; i++) {
      // True Range
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);

      // Directional Movement
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smooth values using Wilder's smoothing
    const smoothTR = this.wilderSmooth(trueRanges, period);
    const smoothPlusDM = this.wilderSmooth(plusDM, period);
    const smoothMinusDM = this.wilderSmooth(minusDM, period);

    // Calculate +DI and -DI
    const plusDI = [];
    const minusDI = [];
    const dx = [];

    for (let i = 0; i < smoothTR.length; i++) {
      const pdi = smoothTR[i] === 0 ? 0 : (smoothPlusDM[i] / smoothTR[i]) * 100;
      const mdi = smoothTR[i] === 0 ? 0 : (smoothMinusDM[i] / smoothTR[i]) * 100;
      plusDI.push(pdi);
      minusDI.push(mdi);

      const diSum = pdi + mdi;
      dx.push(diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100);
    }

    // ADX is smoothed DX
    const adx = this.wilderSmooth(dx, period);

    return { adx, plusDI, minusDI };
  }

  /**
   * Wilder's Smoothing Method
   */
  wilderSmooth(values, period) {
    const result = [];
    let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
    result.push(sum / period);

    for (let i = period; i < values.length; i++) {
      result.push((result[result.length - 1] * (period - 1) + values[i]) / period);
    }
    return result;
  }

  /**
   * Calculate Fibonacci Retracement Levels
   * @param {number} high - Swing high price
   * @param {number} low - Swing low price
   * @returns {Object} Fibonacci levels
   */
  calculateFibonacciLevels(high, low) {
    const diff = high - low;
    return {
      level0: high,
      level236: high - diff * 0.236,
      level382: high - diff * 0.382,
      level500: high - diff * 0.500,
      level618: high - diff * 0.618,
      level786: high - diff * 0.786,
      level1000: low,
      // Extensions
      level1272: low - diff * 0.272,
      level1618: low - diff * 0.618,
      level2000: low - diff * 1.000
    };
  }

  /**
   * Calculate Volume Profile
   * @param {Object[]} candles - Array of {high, low, close, volume}
   * @param {number} buckets - Number of price buckets (default 24)
   * @returns {Object[]} Volume profile data
   */
  calculateVolumeProfile(candles, buckets = 24) {
    if (!candles.length) return [];

    const allPrices = candles.flatMap(c => [c.high, c.low]);
    const maxPrice = Math.max(...allPrices);
    const minPrice = Math.min(...allPrices);
    const bucketSize = (maxPrice - minPrice) / buckets;

    const profile = Array(buckets).fill(0).map((_, i) => ({
      priceLevel: minPrice + (i + 0.5) * bucketSize,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0
    }));

    candles.forEach(candle => {
      // Distribute volume across the candle's price range
      const lowBucket = Math.floor((candle.low - minPrice) / bucketSize);
      const highBucket = Math.min(Math.floor((candle.high - minPrice) / bucketSize), buckets - 1);
      const volumePerBucket = candle.volume / Math.max(1, highBucket - lowBucket + 1);

      const isBullish = candle.close >= candle.open;

      for (let b = Math.max(0, lowBucket); b <= highBucket; b++) {
        profile[b].volume += volumePerBucket;
        if (isBullish) {
          profile[b].buyVolume += volumePerBucket;
        } else {
          profile[b].sellVolume += volumePerBucket;
        }
      }
    });

    // Find POC (Point of Control)
    const maxVolume = Math.max(...profile.map(p => p.volume));
    profile.forEach(p => {
      p.isPOC = p.volume === maxVolume;
      p.volumePercent = maxVolume > 0 ? (p.volume / maxVolume) * 100 : 0;
    });

    return profile;
  }

  /**
   * Calculate Momentum Indicators
   * @param {number[]} prices - Closing prices
   * @param {number} period - Momentum period (default 10)
   * @returns {Object} Momentum, ROC, and Williams %R
   */
  calculateMomentum(prices, period = 10) {
    const momentum = [];
    const roc = [];

    for (let i = period; i < prices.length; i++) {
      // Momentum = current price - price n periods ago
      momentum.push(prices[i] - prices[i - period]);
      // Rate of Change = ((current - past) / past) * 100
      roc.push(((prices[i] - prices[i - period]) / prices[i - period]) * 100);
    }

    return { momentum, roc };
  }

  /**
   * Calculate Average True Range (ATR)
   * @param {number[]} highs
   * @param {number[]} lows
   * @param {number[]} closes
   * @param {number} period - ATR period (default 14)
   * @returns {number[]} ATR values
   */
  calculateATR(highs, lows, closes, period = 14) {
    const trueRanges = [highs[0] - lows[0]];

    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    return this.wilderSmooth(trueRanges, period);
  }

  /**
   * Calculate On-Balance Volume (OBV)
   * @param {number[]} closes - Closing prices
   * @param {number[]} volumes - Volume data
   * @returns {number[]} OBV values
   */
  calculateOBV(closes, volumes) {
    const obv = [0];

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
   * Calculate short interest metrics
   * @param {number} shortInterest - Number of shares sold short
   * @param {number} avgVolume - Average daily trading volume
   * @param {number} floatShares - Number of floating shares
   * @returns {Object} Short interest metrics
   */
  calculateShortInterestMetrics(shortInterest, avgVolume, floatShares) {
    return {
      shortInterest,
      daysTocover: avgVolume > 0 ? shortInterest / avgVolume : 0,
      shortPercentOfFloat: floatShares > 0 ? (shortInterest / floatShares) * 100 : 0,
      shortRatio: avgVolume > 0 ? shortInterest / avgVolume : 0
    };
  }

  /**
   * Get comprehensive technical analysis for a symbol
   * @param {Object} priceData - {dates, opens, highs, lows, closes, volumes}
   * @returns {Object} All technical indicators
   */
  getFullAnalysis(priceData) {
    const { dates, opens, highs, lows, closes, volumes } = priceData;

    if (!closes || closes.length < 26) {
      return { error: 'Insufficient data for analysis' };
    }

    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    const stochastic = this.calculateStochastic(highs, lows, closes, 14, 3);
    const adx = this.calculateADX(highs, lows, closes, 14);
    const momentum = this.calculateMomentum(closes, 10);
    const atr = this.calculateATR(highs, lows, closes, 14);
    const obv = this.calculateOBV(closes, volumes);

    // Get current values
    const currentPrice = closes[closes.length - 1];
    const currentRSI = rsi[rsi.length - 1];
    const currentMACD = macd.macd[macd.macd.length - 1];
    const currentSignal = macd.signal[macd.signal.length - 1];
    const currentK = stochastic.k[stochastic.k.length - 1];
    const currentD = stochastic.d[stochastic.d.length - 1];
    const currentADX = adx.adx[adx.adx.length - 1];

    // Generate signal summary
    let bullishSignals = 0;
    let bearishSignals = 0;

    // RSI signals
    if (currentRSI < 30) bullishSignals++;
    else if (currentRSI > 70) bearishSignals++;

    // MACD signals
    if (currentMACD > currentSignal) bullishSignals++;
    else bearishSignals++;

    // Stochastic signals
    if (currentK < 20 && currentK > currentD) bullishSignals++;
    else if (currentK > 80 && currentK < currentD) bearishSignals++;

    // Bollinger signals
    const currentUpper = bollinger.upper[bollinger.upper.length - 1];
    const currentLower = bollinger.lower[bollinger.lower.length - 1];
    if (currentPrice < currentLower) bullishSignals++;
    else if (currentPrice > currentUpper) bearishSignals++;

    // Overall signal
    let overallSignal = 'NEUTRAL';
    if (bullishSignals >= 3) overallSignal = 'STRONG BUY';
    else if (bullishSignals >= 2) overallSignal = 'BUY';
    else if (bearishSignals >= 3) overallSignal = 'STRONG SELL';
    else if (bearishSignals >= 2) overallSignal = 'SELL';

    return {
      price: {
        current: currentPrice,
        high52w: Math.max(...closes.slice(-252)),
        low52w: Math.min(...closes.slice(-252))
      },
      rsi: {
        value: Math.round(currentRSI * 100) / 100,
        signal: currentRSI < 30 ? 'OVERSOLD' : currentRSI > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
        series: rsi.slice(-60)
      },
      macd: {
        macd: Math.round(currentMACD * 1000) / 1000,
        signal: Math.round(currentSignal * 1000) / 1000,
        histogram: Math.round(macd.histogram[macd.histogram.length - 1] * 1000) / 1000,
        trend: currentMACD > currentSignal ? 'BULLISH' : 'BEARISH',
        series: {
          macd: macd.macd.slice(-60),
          signal: macd.signal.slice(-60),
          histogram: macd.histogram.slice(-60)
        }
      },
      bollinger: {
        upper: Math.round(currentUpper * 100) / 100,
        middle: Math.round(bollinger.middle[bollinger.middle.length - 1] * 100) / 100,
        lower: Math.round(currentLower * 100) / 100,
        bandwidth: Math.round(((currentUpper - currentLower) / bollinger.middle[bollinger.middle.length - 1]) * 10000) / 100,
        signal: currentPrice > currentUpper ? 'OVERBOUGHT' : currentPrice < currentLower ? 'OVERSOLD' : 'WITHIN BANDS',
        series: {
          upper: bollinger.upper.slice(-60),
          middle: bollinger.middle.slice(-60),
          lower: bollinger.lower.slice(-60)
        }
      },
      stochastic: {
        k: Math.round(currentK * 100) / 100,
        d: Math.round(currentD * 100) / 100,
        signal: currentK > 80 ? 'OVERBOUGHT' : currentK < 20 ? 'OVERSOLD' : 'NEUTRAL',
        series: {
          k: stochastic.k.slice(-60),
          d: stochastic.d.slice(-60)
        }
      },
      adx: {
        value: Math.round(currentADX * 100) / 100,
        plusDI: Math.round(adx.plusDI[adx.plusDI.length - 1] * 100) / 100,
        minusDI: Math.round(adx.minusDI[adx.minusDI.length - 1] * 100) / 100,
        trend: currentADX > 25 ? 'STRONG' : currentADX > 20 ? 'MODERATE' : 'WEAK',
        direction: adx.plusDI[adx.plusDI.length - 1] > adx.minusDI[adx.minusDI.length - 1] ? 'BULLISH' : 'BEARISH',
        series: {
          adx: adx.adx.slice(-60),
          plusDI: adx.plusDI.slice(-60),
          minusDI: adx.minusDI.slice(-60)
        }
      },
      momentum: {
        value: Math.round(momentum.momentum[momentum.momentum.length - 1] * 100) / 100,
        roc: Math.round(momentum.roc[momentum.roc.length - 1] * 100) / 100,
        trend: momentum.roc[momentum.roc.length - 1] > 0 ? 'POSITIVE' : 'NEGATIVE',
        series: {
          momentum: momentum.momentum.slice(-60),
          roc: momentum.roc.slice(-60)
        }
      },
      atr: {
        value: Math.round(atr[atr.length - 1] * 100) / 100,
        percent: Math.round((atr[atr.length - 1] / currentPrice) * 10000) / 100,
        series: atr.slice(-60)
      },
      obv: {
        value: obv[obv.length - 1],
        trend: obv[obv.length - 1] > obv[obv.length - 10] ? 'ACCUMULATION' : 'DISTRIBUTION',
        series: obv.slice(-60)
      },
      summary: {
        overallSignal,
        bullishSignals,
        bearishSignals,
        technicalScore: Math.round((bullishSignals / (bullishSignals + bearishSignals || 1)) * 100)
      },
      dates: dates.slice(-60)
    };
  }
}

module.exports = new TechnicalAnalysisService();
