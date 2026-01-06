/**
 * Market Breadth API Routes
 * Exposes all market breadth and internals indicators
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const path = require('path');
const MarketBreadthService = require('../services/marketBreadth/MarketBreadthService');
const LiveDataFetcher = require('../services/marketBreadth/LiveDataFetcher');
// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');

// Initialize database and services
const breadthService = new MarketBreadthService(db);
const liveDataFetcher = new LiveDataFetcher(db);

/**
 * ====================================================================
 * ADVANCE/DECLINE LINE ENDPOINTS
 * ====================================================================
 */

/**
 * GET /api/market-breadth/advance-decline/:index
 * Get current and historical A/D line data - LIVE FROM API
 */
router.get('/advance-decline/:index', async (req, res) => {
  try {
    const { index } = req.params;
    const { period = '1Y' } = req.query;

    const validIndices = ['SPY', 'QQQ', 'IWM', 'DIA'];
    if (!validIndices.includes(index.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid index. Must be one of: ${validIndices.join(', ')}`
      });
    }

    logger.debug(`[MarketBreadth] Fetching LIVE A/D data for ${index.toUpperCase()}`);

    // Fetch live market breadth data
    const breadth = await liveDataFetcher.fetchLiveMarketBreadth(index.toUpperCase());

    // Get historical data from database for charting
    const periodDays = period === '1M' ? 30 :
      period === '3M' ? 90 :
        period === '6M' ? 180 :
          period === '1Y' ? 365 :
            period === '5Y' ? 1825 : 365;
    const stmt = db.prepare(`
      SELECT * FROM market_advance_decline
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    const dbData = stmt.all(index.toUpperCase(), periodDays);
    const adData = dbData.length > 0 ? dbData.reverse().map(record => ({
      date: record.date,
      advancing: record.advancing,
      declining: record.declining,
      unchanged: record.unchanged,
      netAdvances: record.net_advances,
      adLine: record.ad_line,
      adRatio: record.ad_ratio
    })) : [];

    // Add today's live data point
    const today = new Date().toISOString().split('T')[0];
    adData.push({
      date: today,
      advancing: breadth.advanceDecline.advancing,
      declining: breadth.advanceDecline.declining,
      unchanged: breadth.advanceDecline.unchanged,
      netAdvances: breadth.advanceDecline.netAdvances,
      adLine: adData.length > 0 ? adData[adData.length - 1].adLine + breadth.advanceDecline.netAdvances : breadth.advanceDecline.netAdvances,
      adRatio: breadth.advanceDecline.adRatio
    });

    res.json({
      success: true,
      data: {
        indexSymbol: index.toUpperCase(),
        period,
        currentADLine: adData[adData.length - 1].adLine,
        adData,
        advancing: breadth.advanceDecline.advancing,
        declining: breadth.advanceDecline.declining,
        totalIssues: breadth.advanceDecline.totalIssues,
        signal: breadth.advanceDecline.signal,
        calculatedAt: breadth.timestamp,
        source: 'live_api'
      }
    });

  } catch (error) {
    logger.error('A/D Line error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to interpret A/D signal
function interpretADSignal(adRatio) {
  if (adRatio >= 2.0) return 'BULLISH';
  if (adRatio <= 0.5) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * GET /api/market-breadth/advance-decline/historical/:index
 * Get historical A/D line data from database
 */
router.get('/advance-decline/historical/:index', (req, res) => {
  try {
    const { index } = req.params;
    const { days = 252 } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM market_advance_decline
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    const data = stmt.all(index.toUpperCase(), parseInt(days));

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('Historical A/D error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ====================================================================
 * PERCENTAGE ABOVE MOVING AVERAGES ENDPOINTS
 * ====================================================================
 */

/**
 * GET /api/market-breadth/percent-above-ma/:index
 * Get % of stocks above moving averages - LIVE FROM API
 */
router.get('/percent-above-ma/:index', async (req, res) => {
  try {
    const { index } = req.params;
    const { periods = '20,50,100,200' } = req.query;

    const validIndices = ['SPY', 'QQQ', 'IWM', 'DIA'];
    if (!validIndices.includes(index.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid index. Must be one of: ${validIndices.join(', ')}`
      });
    }

    const maPeriods = periods.split(',').map(p => parseInt(p));
    logger.debug(`[MarketBreadth] Fetching LIVE MA Breadth data for ${index.toUpperCase()}`);

    // Fetch live market breadth data
    const breadth = await liveDataFetcher.fetchLiveMarketBreadth(index.toUpperCase());

    // Build results from live data
    const results = {};
    for (const period of maPeriods) {
      const ma = breadth.maBreath[`ma${period}`];
      if (ma) {
        results[`ma${period}`] = {
          period,
          aboveMA: ma.above,
          total: ma.total,
          percentage: parseFloat(ma.percentage),
          signal: interpretMASignal(parseFloat(ma.percentage))
        };
      }
    }

    // Calculate overall signal
    const signals = Object.values(results).map(r => r.signal);
    const bullishCount = signals.filter(s => s.includes('BULLISH')).length;
    const bearishCount = signals.filter(s => s === 'BEARISH').length;

    let overallSignal = 'NEUTRAL';
    if (bullishCount >= 2) overallSignal = 'BULLISH';
    else if (bearishCount >= 2) overallSignal = 'BEARISH';

    res.json({
      success: true,
      data: {
        indexSymbol: index.toUpperCase(),
        maPeriods: results,
        overallSignal,
        calculatedAt: breadth.timestamp,
        source: 'live_api'
      }
    });

  } catch (error) {
    logger.error('MA Breadth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to interpret MA signal
function interpretMASignal(percentage) {
  if (percentage >= 70) return 'BULLISH';
  if (percentage >= 55) return 'MODERATELY_BULLISH';
  if (percentage <= 30) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * GET /api/market-breadth/percent-above-ma/historical/:index/:period
 * Get historical MA breadth data
 */
router.get('/percent-above-ma/historical/:index/:period', (req, res) => {
  try {
    const { index, period } = req.params;
    const { days = 90 } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM market_ma_breadth
      WHERE index_symbol = ? AND ma_period = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    const data = stmt.all(index.toUpperCase(), parseInt(period), parseInt(days));

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('Historical MA Breadth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ====================================================================
 * NEW HIGHS - NEW LOWS ENDPOINTS
 * ====================================================================
 */

/**
 * GET /api/market-breadth/highs-lows/:index
 * Get new highs and lows data - LIVE FROM API
 */
router.get('/highs-lows/:index', async (req, res) => {
  try {
    const { index } = req.params;

    const validIndices = ['SPY', 'QQQ', 'IWM', 'DIA'];
    if (!validIndices.includes(index.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid index. Must be one of: ${validIndices.join(', ')}`
      });
    }

    logger.debug(`[MarketBreadth] Fetching LIVE Highs/Lows data for ${index.toUpperCase()}`);

    // Fetch live market breadth data
    const breadth = await liveDataFetcher.fetchLiveMarketBreadth(index.toUpperCase());

    // Return live highs/lows data
    res.json({
      success: true,
      data: {
        indexSymbol: index.toUpperCase(),
        newHighs52w: breadth.highsLows.newHighs52w,
        newLows52w: breadth.highsLows.newLows52w,
        newHighs20d: breadth.highsLows.newHighs20d || 0,
        newLows20d: breadth.highsLows.newLows20d || 0,
        hlIndex: breadth.highsLows.hlIndex,
        hlRatio: breadth.highsLows.hlRatio,
        totalIssues: breadth.highsLows.totalIssues,
        signal: breadth.highsLows.signal,
        calculatedAt: breadth.timestamp,
        source: 'live_api'
      }
    });

  } catch (error) {
    logger.error('Highs-Lows error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to interpret Highs-Lows signal
function interpretHLSignal(hlIndex) {
  if (hlIndex >= 50) return 'BULLISH';
  if (hlIndex >= 20) return 'MODERATELY_BULLISH';
  if (hlIndex <= -50) return 'BEARISH';
  if (hlIndex <= -20) return 'MODERATELY_BEARISH';
  return 'NEUTRAL';
}

/**
 * GET /api/market-breadth/highs-lows/historical/:index
 * Get historical highs-lows data
 */
router.get('/highs-lows/historical/:index', (req, res) => {
  try {
    const { index } = req.params;
    const { days = 90 } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM market_highs_lows
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    const data = stmt.all(index.toUpperCase(), parseInt(days));

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('Historical Highs-Lows error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ====================================================================
 * COMPREHENSIVE MARKET HEALTH ENDPOINTS
 * ====================================================================
 */

/**
 * GET /api/market-breadth/health/:index
 * Get overall market health summary for an index - LIVE DATA
 */
router.get('/health/:index', async (req, res) => {
  try {
    const { index } = req.params;

    logger.debug(`[MarketBreadth] Fetching LIVE health data for ${index.toUpperCase()}`);

    // Fetch live market breadth data
    const breadth = await liveDataFetcher.fetchLiveMarketBreadth(index.toUpperCase());

    // Calculate composite health score (0-100)
    let healthScore = 50; // Start neutral

    // A/D Line contribution
    if (breadth.advanceDecline.signal === 'BULLISH') healthScore += 15;
    else if (breadth.advanceDecline.signal.includes('BEARISH')) healthScore -= 15;

    // MA Breadth contribution
    const ma50Pct = parseFloat(breadth.maBreath.ma50.percentage);
    const ma200Pct = parseFloat(breadth.maBreath.ma200.percentage);

    if (ma50Pct >= 70 || ma200Pct >= 70) healthScore += 15;
    else if (ma50Pct <= 30 || ma200Pct <= 30) healthScore -= 15;

    // Highs-Lows contribution
    if (breadth.highsLows.signal.includes('BULLISH')) {
      healthScore += 15;
    } else if (breadth.highsLows.signal.includes('BEARISH')) {
      healthScore -= 15;
    }

    // Determine overall signal
    let overallSignal = 'NEUTRAL';
    if (healthScore >= 65) overallSignal = 'BULLISH';
    else if (healthScore <= 35) overallSignal = 'BEARISH';

    const healthData = {
      indexSymbol: index.toUpperCase(),
      healthScore: Math.max(0, Math.min(100, healthScore)),
      overallSignal,
      indicators: {
        advanceDecline: {
          signal: breadth.advanceDecline.signal,
          currentADLine: 0, // Not calculated in live mode
          advancing: breadth.advanceDecline.advancing,
          declining: breadth.advanceDecline.declining
        },
        maBreath: {
          signal: ma50Pct >= 60 ? 'BULLISH' : ma50Pct <= 40 ? 'BEARISH' : 'NEUTRAL',
          ma50: {
            period: 50,
            aboveMA: breadth.maBreath.ma50.above,
            total: breadth.maBreath.ma50.total,
            percentage: parseFloat(breadth.maBreath.ma50.percentage),
            signal: ma50Pct >= 70 ? 'BULLISH' : ma50Pct >= 55 ? 'MODERATELY_BULLISH' : ma50Pct <= 30 ? 'BEARISH' : 'NEUTRAL'
          },
          ma200: {
            period: 200,
            aboveMA: breadth.maBreath.ma200.above,
            total: breadth.maBreath.ma200.total,
            percentage: parseFloat(breadth.maBreath.ma200.percentage),
            signal: ma200Pct >= 70 ? 'BULLISH' : ma200Pct >= 55 ? 'MODERATELY_BULLISH' : ma200Pct <= 30 ? 'BEARISH' : 'NEUTRAL'
          }
        },
        highsLows: {
          signal: breadth.highsLows.signal,
          hlIndex: breadth.highsLows.hlIndex,
          newHighs: breadth.highsLows.newHighs52w,
          newLows: breadth.highsLows.newLows52w
        }
      },
      calculatedAt: breadth.timestamp,
      source: 'live_api'
    };

    res.json({
      success: true,
      data: healthData
    });

  } catch (error) {
    logger.error('Market Health error:', error);

    // Fallback to database if API fails
    try {
      const adStmt = db.prepare('SELECT * FROM market_advance_decline WHERE index_symbol = ? ORDER BY date DESC LIMIT 1');
      const adRecord = adStmt.get(index.toUpperCase());

      const maStmt = db.prepare('SELECT * FROM market_ma_breadth WHERE index_symbol = ? AND ma_period IN (50, 200) ORDER BY date DESC, ma_period');
      const maRecords = maStmt.all(index.toUpperCase());

      const hlStmt = db.prepare('SELECT * FROM market_highs_lows WHERE index_symbol = ? ORDER BY date DESC LIMIT 1');
      const hlRecord = hlStmt.get(index.toUpperCase());

      if (adRecord || maRecords.length > 0 || hlRecord) {
        const ma50Record = maRecords.find(r => r.ma_period === 50);
        const ma200Record = maRecords.find(r => r.ma_period === 200);

        res.json({
          success: true,
          data: {
            indexSymbol: index.toUpperCase(),
            healthScore: 50,
            overallSignal: 'NEUTRAL',
            indicators: {
              advanceDecline: {
                signal: adRecord ? interpretADSignal(adRecord.ad_ratio) : 'NEUTRAL',
                currentADLine: adRecord ? adRecord.ad_line : 0,
                advancing: adRecord ? adRecord.advancing : 0,
                declining: adRecord ? adRecord.declining : 0
              },
              maBreath: {
                signal: 'NEUTRAL',
                ma50: ma50Record ? {
                  period: 50,
                  aboveMA: ma50Record.above_ma,
                  total: ma50Record.total_stocks,
                  percentage: ma50Record.percent_above,
                  signal: interpretMASignal(ma50Record.percent_above)
                } : null,
                ma200: ma200Record ? {
                  period: 200,
                  aboveMA: ma200Record.above_ma,
                  total: ma200Record.total_stocks,
                  percentage: ma200Record.percent_above,
                  signal: interpretMASignal(ma200Record.percent_above)
                } : null
              },
              highsLows: {
                signal: hlRecord ? interpretHLSignal(hlRecord.hl_index) : 'NEUTRAL',
                hlIndex: hlRecord ? hlRecord.hl_index : 0,
                newHighs: hlRecord ? hlRecord.new_highs_52w : 0,
                newLows: hlRecord ? hlRecord.new_lows_52w : 0
              }
            },
            calculatedAt: new Date().toISOString(),
            source: 'database_fallback'
          }
        });
      } else {
        throw error;
      }
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

/**
 * GET /api/market-breadth/all/:index
 * Get all breadth indicators in a single request
 */
router.get('/all/:index', async (req, res) => {
  try {
    const { index } = req.params;

    // Fetch A/D Line data
    const adStmt = db.prepare(`
      SELECT * FROM market_advance_decline
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT 90
    `);
    const adRecords = adStmt.all(index.toUpperCase());
    const latestAD = adRecords[0];

    // Fetch MA Breadth data for all periods
    const maStmt = db.prepare(`
      SELECT * FROM market_ma_breadth
      WHERE index_symbol = ? AND ma_period IN (20, 50, 100, 200)
      ORDER BY date DESC, ma_period
      LIMIT 4
    `);
    const maRecords = maStmt.all(index.toUpperCase());

    // Fetch Highs-Lows data
    const hlStmt = db.prepare(`
      SELECT * FROM market_highs_lows
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT 1
    `);
    const hlRecord = hlStmt.get(index.toUpperCase());

    // Build response data
    const adLine = latestAD ? {
      indexSymbol: index.toUpperCase(),
      period: '3M',
      currentADLine: latestAD.ad_line,
      adData: adRecords.reverse().map(r => ({
        date: r.date,
        advancing: r.advancing,
        declining: r.declining,
        unchanged: r.unchanged,
        netAdvances: r.net_advances,
        adLine: r.ad_line,
        adRatio: r.ad_ratio
      })),
      advancing: latestAD.advancing,
      declining: latestAD.declining,
      totalIssues: latestAD.total_issues || 500,
      signal: interpretADSignal(latestAD.ad_ratio),
      calculatedAt: new Date().toISOString()
    } : null;

    const maPeriods = {};
    [20, 50, 100, 200].forEach(period => {
      const record = maRecords.find(r => r.ma_period === period);
      if (record) {
        maPeriods[`ma${period}`] = {
          period,
          aboveMA: record.above_ma,
          total: record.total_stocks,
          percentage: record.percent_above,
          signal: interpretMASignal(record.percent_above)
        };
      }
    });

    const signals = Object.values(maPeriods).map(r => r.signal);
    const bullishCount = signals.filter(s => s.includes('BULLISH')).length;
    const bearishCount = signals.filter(s => s === 'BEARISH').length;
    const maOverallSignal = bullishCount >= 2 ? 'BULLISH' : bearishCount >= 2 ? 'BEARISH' : 'NEUTRAL';

    const maBreath = {
      indexSymbol: index.toUpperCase(),
      maPeriods,
      overallSignal: maOverallSignal,
      calculatedAt: new Date().toISOString()
    };

    const highsLows = hlRecord ? {
      indexSymbol: index.toUpperCase(),
      newHighs52w: hlRecord.new_highs_52w,
      newLows52w: hlRecord.new_lows_52w,
      newHighs20d: hlRecord.new_highs_20d,
      newLows20d: hlRecord.new_lows_20d,
      hlIndex: hlRecord.hl_index,
      hlRatio: hlRecord.hl_ratio,
      totalIssues: hlRecord.total_issues || 500,
      signal: interpretHLSignal(hlRecord.hl_index),
      calculatedAt: new Date().toISOString()
    } : null;

    res.json({
      success: true,
      data: {
        indexSymbol: index.toUpperCase(),
        advanceDecline: adLine,
        maBreath,
        highsLows,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('All Breadth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ====================================================================
 * PROVIDER HEALTH & MONITORING
 * ====================================================================
 */

/**
 * GET /api/market-breadth/provider-health
 * Get status of all data providers
 */
router.get('/provider-health', (req, res) => {
  try {
    const health = breadthService.getProviderHealth();

    res.json({
      success: true,
      providers: health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Provider Health error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/market-breadth/api-usage
 * Get API usage statistics
 */
router.get('/api-usage', (req, res) => {
  try {
    const { days = 7 } = req.query;

    const stmt = db.prepare(`
      SELECT provider, COUNT(*) as total_calls,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
             AVG(response_time_ms) as avg_response_time,
             date(timestamp) as date
      FROM api_usage_log
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY provider, date(timestamp)
      ORDER BY date DESC
    `);

    const data = stmt.all(parseInt(days));

    res.json({
      success: true,
      data,
      period: `${days} days`
    });

  } catch (error) {
    logger.error('API Usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ====================================================================
 * UTILITY ENDPOINTS
 * ====================================================================
 */

/**
 * GET /api/market-breadth/indices
 * Get list of supported indices
 */
router.get('/indices', (req, res) => {
  const config = require('../config/marketBreadthConfig');

  res.json({
    success: true,
    indices: Object.values(config.indices)
  });
});

/**
 * GET /api/market-breadth/thresholds
 * Get indicator thresholds configuration
 */
router.get('/thresholds', (req, res) => {
  const config = require('../config/marketBreadthConfig');

  res.json({
    success: true,
    thresholds: config.thresholds
  });
});

/**
 * POST /api/market-breadth/refresh/:index
 * Force refresh of all indicators for an index (clears cache)
 */
router.post('/refresh/:index', async (req, res) => {
  try {
    const { index } = req.params;

    // Clear cache for this index
    breadthService.cache.clear();

    // Recalculate all indicators
    const [adLine, maBreath, highsLows] = await Promise.all([
      breadthService.calculateAdvanceDeclineLine(index.toUpperCase(), '1Y'),
      breadthService.calculatePercentAboveMA(index.toUpperCase(), [20, 50, 100, 200]),
      breadthService.calculateNewHighsLows(index.toUpperCase())
    ]);

    res.json({
      success: true,
      message: `Refreshed all indicators for ${index.toUpperCase()}`,
      data: { adLine, maBreath, highsLows }
    });

  } catch (error) {
    logger.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
