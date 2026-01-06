/**
 * Technical Analysis Routes
 * Provides endpoints for all technical indicators with real calculations
 * Uses DB-first approach via stockDataManager for optimal performance
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const technicalAnalysis = require('../services/technicalAnalysis');
const stockDataManager = require('../services/stockDataManager');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

/**
 * Helper to fetch historical price data using DB-first approach
 * This checks the database before hitting external APIs
 */
async function fetchHistoricalData(symbol, range = '6mo') {
  try {
    // Convert range to days for stockDataManager
    const rangeDays = {
      '1d': 1, '5d': 5, '1w': 7, '1mo': 30, '3mo': 90,
      '6mo': 180, '1y': 365, '2y': 730, '5y': 1825, 'ytd': 365
    };
    const days = rangeDays[range.toLowerCase()] || 180;

    // Use DB-first approach - checks database before API
    const data = await stockDataManager.getHistoricalData(symbol, days);

    if (!data || !data.length) {
      throw new Error('No data available');
    }

    // Format data for technical analysis calculations
    const dates = [];
    const opens = [];
    const highs = [];
    const lows = [];
    const closes = [];
    const volumes = [];

    data.forEach(d => {
      dates.push(d.date);
      opens.push(d.open);
      highs.push(d.high);
      lows.push(d.low);
      closes.push(d.close);
      volumes.push(d.volume);
    });

    return { dates, opens, highs, lows, closes, volumes };
  } catch (error) {
    logger.error(`Failed to fetch historical data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * GET /api/technicals/:symbol
 * Get full technical analysis for a symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { range = '6mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const analysis = technicalAnalysis.getFullAnalysis(priceData);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      range,
      ...analysis
    });
  } catch (error) {
    logger.error('Technical analysis error:', error);
    res.status(500).json({ error: 'Failed to calculate technical analysis' });
  }
});

/**
 * GET /api/technicals/:symbol/rsi
 * Get RSI for a symbol
 */
router.get('/:symbol/rsi', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 14, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const rsi = technicalAnalysis.calculateRSI(priceData.closes, parseInt(period));

    const currentRSI = rsi[rsi.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period: parseInt(period),
      current: Math.round(currentRSI * 100) / 100,
      signal: currentRSI < 30 ? 'OVERSOLD' : currentRSI > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
      series: rsi.slice(-60).map((v, i) => ({
        date: priceData.dates[priceData.dates.length - 60 + i] || '',
        value: Math.round(v * 100) / 100
      }))
    });
  } catch (error) {
    logger.error('RSI calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate RSI' });
  }
});

/**
 * GET /api/technicals/:symbol/macd
 * Get MACD for a symbol
 */
router.get('/:symbol/macd', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { fast = 12, slow = 26, signal = 9, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const macd = technicalAnalysis.calculateMACD(
      priceData.closes,
      parseInt(fast),
      parseInt(slow),
      parseInt(signal)
    );

    const currentMACD = macd.macd[macd.macd.length - 1];
    const currentSignal = macd.signal[macd.signal.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      parameters: { fast: parseInt(fast), slow: parseInt(slow), signal: parseInt(signal) },
      current: {
        macd: Math.round(currentMACD * 1000) / 1000,
        signal: Math.round(currentSignal * 1000) / 1000,
        histogram: Math.round(macd.histogram[macd.histogram.length - 1] * 1000) / 1000
      },
      trend: currentMACD > currentSignal ? 'BULLISH' : 'BEARISH',
      crossover: Math.abs(currentMACD - currentSignal) < 0.01 ? 'POTENTIAL' : 'NONE',
      series: {
        macd: macd.macd.slice(-60),
        signal: macd.signal.slice(-60),
        histogram: macd.histogram.slice(-60)
      }
    });
  } catch (error) {
    logger.error('MACD calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate MACD' });
  }
});

/**
 * GET /api/technicals/:symbol/bollinger
 * Get Bollinger Bands for a symbol
 */
router.get('/:symbol/bollinger', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 20, stdDev = 2, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const bb = technicalAnalysis.calculateBollingerBands(
      priceData.closes,
      parseInt(period),
      parseFloat(stdDev)
    );

    const currentPrice = priceData.closes[priceData.closes.length - 1];
    const currentUpper = bb.upper[bb.upper.length - 1];
    const currentLower = bb.lower[bb.lower.length - 1];
    const currentMiddle = bb.middle[bb.middle.length - 1];

    const bandwidth = ((currentUpper - currentLower) / currentMiddle) * 100;
    const percentB = ((currentPrice - currentLower) / (currentUpper - currentLower)) * 100;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      parameters: { period: parseInt(period), stdDev: parseFloat(stdDev) },
      current: {
        price: Math.round(currentPrice * 100) / 100,
        upper: Math.round(currentUpper * 100) / 100,
        middle: Math.round(currentMiddle * 100) / 100,
        lower: Math.round(currentLower * 100) / 100,
        bandwidth: Math.round(bandwidth * 100) / 100,
        percentB: Math.round(percentB * 100) / 100
      },
      signal: percentB > 100 ? 'OVERBOUGHT' : percentB < 0 ? 'OVERSOLD' : 'WITHIN BANDS',
      squeeze: bandwidth < 10 ? true : false,
      series: {
        upper: bb.upper.slice(-60),
        middle: bb.middle.slice(-60),
        lower: bb.lower.slice(-60),
        closes: priceData.closes.slice(-60)
      },
      dates: priceData.dates.slice(-60)
    });
  } catch (error) {
    logger.error('Bollinger Bands error:', error);
    res.status(500).json({ error: 'Failed to calculate Bollinger Bands' });
  }
});

/**
 * GET /api/technicals/:symbol/stochastic
 * Get Stochastic Oscillator for a symbol
 */
router.get('/:symbol/stochastic', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { kPeriod = 14, dPeriod = 3, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const stoch = technicalAnalysis.calculateStochastic(
      priceData.highs,
      priceData.lows,
      priceData.closes,
      parseInt(kPeriod),
      parseInt(dPeriod)
    );

    const currentK = stoch.k[stoch.k.length - 1];
    const currentD = stoch.d[stoch.d.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      parameters: { kPeriod: parseInt(kPeriod), dPeriod: parseInt(dPeriod) },
      current: {
        k: Math.round(currentK * 100) / 100,
        d: Math.round(currentD * 100) / 100
      },
      signal: currentK > 80 ? 'OVERBOUGHT' : currentK < 20 ? 'OVERSOLD' : 'NEUTRAL',
      crossover: currentK > currentD ? 'BULLISH' : 'BEARISH',
      series: {
        k: stoch.k.slice(-60),
        d: stoch.d.slice(-60)
      },
      dates: priceData.dates.slice(-60)
    });
  } catch (error) {
    logger.error('Stochastic error:', error);
    res.status(500).json({ error: 'Failed to calculate Stochastic' });
  }
});

/**
 * GET /api/technicals/:symbol/adx
 * Get ADX for a symbol
 */
router.get('/:symbol/adx', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 14, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const adx = technicalAnalysis.calculateADX(
      priceData.highs,
      priceData.lows,
      priceData.closes,
      parseInt(period)
    );

    const currentADX = adx.adx[adx.adx.length - 1];
    const currentPlusDI = adx.plusDI[adx.plusDI.length - 1];
    const currentMinusDI = adx.minusDI[adx.minusDI.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period: parseInt(period),
      current: {
        adx: Math.round(currentADX * 100) / 100,
        plusDI: Math.round(currentPlusDI * 100) / 100,
        minusDI: Math.round(currentMinusDI * 100) / 100
      },
      trendStrength: currentADX > 25 ? 'STRONG' : currentADX > 20 ? 'MODERATE' : 'WEAK',
      direction: currentPlusDI > currentMinusDI ? 'BULLISH' : 'BEARISH',
      series: {
        adx: adx.adx.slice(-60),
        plusDI: adx.plusDI.slice(-60),
        minusDI: adx.minusDI.slice(-60)
      },
      dates: priceData.dates.slice(-60)
    });
  } catch (error) {
    logger.error('ADX error:', error);
    res.status(500).json({ error: 'Failed to calculate ADX' });
  }
});

/**
 * GET /api/technicals/:symbol/fibonacci
 * Get Fibonacci retracement levels for a symbol
 */
router.get('/:symbol/fibonacci', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);

    const high = Math.max(...priceData.highs);
    const low = Math.min(...priceData.lows);
    const currentPrice = priceData.closes[priceData.closes.length - 1];

    const levels = technicalAnalysis.calculateFibonacciLevels(high, low);

    // Determine nearest support/resistance
    const levelsArray = Object.values(levels).sort((a, b) => b - a);
    let nearestSupport = low;
    let nearestResistance = high;

    for (const level of levelsArray) {
      if (level < currentPrice && level > nearestSupport) {
        nearestSupport = level;
      }
      if (level > currentPrice && level < nearestResistance) {
        nearestResistance = level;
      }
    }

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      range,
      swingHigh: Math.round(high * 100) / 100,
      swingLow: Math.round(low * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      levels: {
        '0%': Math.round(levels.level0 * 100) / 100,
        '23.6%': Math.round(levels.level236 * 100) / 100,
        '38.2%': Math.round(levels.level382 * 100) / 100,
        '50%': Math.round(levels.level500 * 100) / 100,
        '61.8%': Math.round(levels.level618 * 100) / 100,
        '78.6%': Math.round(levels.level786 * 100) / 100,
        '100%': Math.round(levels.level1000 * 100) / 100
      },
      extensions: {
        '127.2%': Math.round(levels.level1272 * 100) / 100,
        '161.8%': Math.round(levels.level1618 * 100) / 100,
        '200%': Math.round(levels.level2000 * 100) / 100
      },
      nearestSupport: Math.round(nearestSupport * 100) / 100,
      nearestResistance: Math.round(nearestResistance * 100) / 100,
      priceHistory: {
        dates: priceData.dates.slice(-60),
        closes: priceData.closes.slice(-60),
        highs: priceData.highs.slice(-60),
        lows: priceData.lows.slice(-60)
      }
    });
  } catch (error) {
    logger.error('Fibonacci error:', error);
    res.status(500).json({ error: 'Failed to calculate Fibonacci levels' });
  }
});

/**
 * GET /api/technicals/:symbol/volume-profile
 * Get Volume Profile for a symbol
 */
router.get('/:symbol/volume-profile', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { range = '3mo', buckets = 24 } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);

    // Create candles array
    const candles = priceData.dates.map((date, i) => ({
      date,
      open: priceData.opens[i],
      high: priceData.highs[i],
      low: priceData.lows[i],
      close: priceData.closes[i],
      volume: priceData.volumes[i]
    }));

    const profile = technicalAnalysis.calculateVolumeProfile(candles, parseInt(buckets));

    // Find value area (70% of volume)
    const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
    const totalVolume = profile.reduce((sum, p) => sum + p.volume, 0);
    let valueAreaVolume = 0;
    const valueAreaLevels = [];

    for (const level of sortedByVolume) {
      if (valueAreaVolume < totalVolume * 0.7) {
        valueAreaLevels.push(level.priceLevel);
        valueAreaVolume += level.volume;
      }
    }

    const poc = profile.find(p => p.isPOC);
    const vah = Math.max(...valueAreaLevels);
    const val = Math.min(...valueAreaLevels);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      range,
      profile: profile.map(p => ({
        priceLevel: Math.round(p.priceLevel * 100) / 100,
        volume: Math.round(p.volume),
        buyVolume: Math.round(p.buyVolume),
        sellVolume: Math.round(p.sellVolume),
        volumePercent: Math.round(p.volumePercent * 10) / 10,
        isPOC: p.isPOC
      })),
      keyLevels: {
        poc: poc ? Math.round(poc.priceLevel * 100) / 100 : null,
        vah: Math.round(vah * 100) / 100,
        val: Math.round(val * 100) / 100
      },
      currentPrice: Math.round(priceData.closes[priceData.closes.length - 1] * 100) / 100
    });
  } catch (error) {
    logger.error('Volume Profile error:', error);
    res.status(500).json({ error: 'Failed to calculate Volume Profile' });
  }
});

/**
 * GET /api/technicals/:symbol/momentum
 * Get Momentum indicators for a symbol
 */
router.get('/:symbol/momentum', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 10, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const momentum = technicalAnalysis.calculateMomentum(priceData.closes, parseInt(period));

    const currentMomentum = momentum.momentum[momentum.momentum.length - 1];
    const currentROC = momentum.roc[momentum.roc.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period: parseInt(period),
      current: {
        momentum: Math.round(currentMomentum * 100) / 100,
        roc: Math.round(currentROC * 100) / 100
      },
      trend: currentROC > 0 ? 'POSITIVE' : 'NEGATIVE',
      strength: Math.abs(currentROC) > 10 ? 'STRONG' : Math.abs(currentROC) > 5 ? 'MODERATE' : 'WEAK',
      series: {
        momentum: momentum.momentum.slice(-60),
        roc: momentum.roc.slice(-60)
      },
      dates: priceData.dates.slice(-60)
    });
  } catch (error) {
    logger.error('Momentum error:', error);
    res.status(500).json({ error: 'Failed to calculate Momentum' });
  }
});

/**
 * GET /api/technicals/:symbol/atr
 * Get ATR for a symbol
 */
router.get('/:symbol/atr', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = 14, range = '3mo' } = req.query;

    const priceData = await fetchHistoricalData(symbol.toUpperCase(), range);
    const atr = technicalAnalysis.calculateATR(
      priceData.highs,
      priceData.lows,
      priceData.closes,
      parseInt(period)
    );

    const currentATR = atr[atr.length - 1];
    const currentPrice = priceData.closes[priceData.closes.length - 1];

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period: parseInt(period),
      current: {
        atr: Math.round(currentATR * 100) / 100,
        atrPercent: Math.round((currentATR / currentPrice) * 10000) / 100
      },
      volatility: currentATR / currentPrice > 0.03 ? 'HIGH' : currentATR / currentPrice > 0.015 ? 'MODERATE' : 'LOW',
      stopLossLevels: {
        tight: Math.round((currentPrice - currentATR) * 100) / 100,
        normal: Math.round((currentPrice - (currentATR * 1.5)) * 100) / 100,
        wide: Math.round((currentPrice - (currentATR * 2)) * 100) / 100
      },
      series: atr.slice(-60),
      dates: priceData.dates.slice(-60)
    });
  } catch (error) {
    logger.error('ATR error:', error);
    res.status(500).json({ error: 'Failed to calculate ATR' });
  }
});

/**
 * GET /api/technicals/screener
 * Screen stocks by technical criteria
 */
router.get('/screener', async (req, res) => {
  try {
    const { rsiMin, rsiMax, macdSignal, bollingerSignal, symbols } = req.query;

    // Default symbols to screen
    const stockList = symbols ? symbols.split(',') : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];

    const results = [];

    for (const symbol of stockList) {
      try {
        const priceData = await fetchHistoricalData(symbol.toUpperCase(), '3mo');
        const analysis = technicalAnalysis.getFullAnalysis(priceData);

        // Apply filters
        if (rsiMin && analysis.rsi.value < parseFloat(rsiMin)) continue;
        if (rsiMax && analysis.rsi.value > parseFloat(rsiMax)) continue;
        if (macdSignal && analysis.macd.trend !== macdSignal.toUpperCase()) continue;
        if (bollingerSignal && analysis.bollinger.signal !== bollingerSignal.toUpperCase()) continue;

        results.push({
          symbol: symbol.toUpperCase(),
          price: analysis.price.current,
          rsi: analysis.rsi.value,
          rsiSignal: analysis.rsi.signal,
          macd: analysis.macd.macd,
          macdTrend: analysis.macd.trend,
          bollingerSignal: analysis.bollinger.signal,
          adx: analysis.adx.value,
          overallSignal: analysis.summary.overallSignal,
          technicalScore: analysis.summary.technicalScore
        });
      } catch (err) {
        // Skip symbols that fail
        logger.debug(`Screener skipped ${symbol}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      count: results.length,
      results: results.sort((a, b) => b.technicalScore - a.technicalScore)
    });
  } catch (error) {
    logger.error('Screener error:', error);
    res.status(500).json({ error: 'Failed to run technical screener' });
  }
});

module.exports = router;
