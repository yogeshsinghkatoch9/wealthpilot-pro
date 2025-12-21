/**
 * Market Breadth Service
 * Master orchestration service for all market breadth indicators
 * Handles fallback logic, caching, and data aggregation from multiple providers
 */

const AlphaVantageClient = require('./apiClient/AlphaVantageClient');
const FMPClient = require('./apiClient/FMPClient');
const PolygonClient = require('./apiClient/PolygonClient');
const config = require('../../config/marketBreadthConfig');
const { v4: uuidv4 } = require('uuid');

const logger = require('../../utils/logger');
class MarketBreadthService {
  constructor(db) {
    this.db = db;

    // Initialize API clients
    this.clients = {
      alphaVantage: new AlphaVantageClient(),
      fmp: new FMPClient(),
      polygon: new PolygonClient()
    };

    // Cache for recent calculations
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute

    // Provider health tracking
    this.providerHealth = {
      alphaVantage: { available: true, lastError: null, errorCount: 0 },
      fmp: { available: true, lastError: null, errorCount: 0 },
      polygon: { available: true, lastError: null, errorCount: 0 }
    };
  }

  /**
   * ===================================================================
   * PRIORITY INDICATOR 1: ADVANCE/DECLINE LINE
   * ===================================================================
   * Calculates cumulative A/D line for given index
   */
  async calculateAdvanceDeclineLine(indexSymbol = 'SPY', period = '1Y') {
    logger.debug(`[MarketBreadth] Calculating A/D Line for ${indexSymbol}`);

    try {
      // Try to get from cache first
      const cacheKey = `ad_line_${indexSymbol}_${period}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Get index constituents
      const constituents = await this.getIndexConstituents(indexSymbol);
      if (!constituents || constituents.length === 0) {
        throw new Error(`No constituents found for ${indexSymbol}`);
      }

      // Get historical data for all constituents
      const symbols = constituents.map(c => c.stock_symbol).slice(0, 100); // Limit for performance
      const quotes = await this.fetchBatchQuotes(symbols);

      // Calculate daily A/D
      const adData = await this.calculateDailyAdvanceDecline(quotes);

      // Calculate cumulative A/D line
      let cumulativeAD = 0;
      const adLine = adData.map(day => {
        cumulativeAD += day.netAdvances;
        return {
          ...day,
          adLine: cumulativeAD
        };
      });

      // Store in database
      await this.storeAdvanceDeclineData(indexSymbol, adLine);

      // Cache result
      const result = {
        indexSymbol,
        period,
        currentADLine: cumulativeAD,
        adData: adLine.slice(0, 252), // Last year of data
        advancing: adLine[adLine.length - 1]?.advancing || 0,
        declining: adLine[adLine.length - 1]?.declining || 0,
        totalIssues: constituents.length,
        signal: this.interpretADLine(adLine),
        calculatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, result);
      return result;

    } catch (error) {
      logger.error('[MarketBreadth] A/D Line calculation error:', error);
      throw error;
    }
  }

  /**
   * Calculate daily advance/decline from batch quotes
   */
  async calculateDailyAdvanceDecline(quotes) {
    const dailyData = {};

    quotes.forEach(quote => {
      const date = quote.date || new Date().toISOString().split('T')[0];

      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          advancing: 0,
          declining: 0,
          unchanged: 0,
          netAdvances: 0
        };
      }

      if (quote.change > 0) dailyData[date].advancing++;
      else if (quote.change < 0) dailyData[date].declining++;
      else dailyData[date].unchanged++;
    });

    return Object.values(dailyData)
      .map(day => ({
        ...day,
        netAdvances: day.advancing - day.declining,
        adRatio: day.declining > 0 ? day.advancing / day.declining : day.advancing
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /**
   * Interpret A/D Line signal
   */
  interpretADLine(adLine) {
    if (adLine.length < 20) return 'NEUTRAL';

    const recent = adLine.slice(-20);
    const trend = recent[recent.length - 1].adLine - recent[0].adLine;

    const lastADRatio = recent[recent.length - 1].adRatio;

    if (trend > 0 && lastADRatio > config.thresholds.advanceDecline.extremeBullish) {
      return 'BULLISH';
    } else if (trend < 0 && lastADRatio < config.thresholds.advanceDecline.bearish) {
      return 'BEARISH';
    }

    return 'NEUTRAL';
  }

  /**
   * ===================================================================
   * PRIORITY INDICATOR 2: PERCENTAGE ABOVE MOVING AVERAGES
   * ===================================================================
   * Calculates % of stocks above 50/100/200 day MAs
   */
  async calculatePercentAboveMA(indexSymbol = 'SPY', maPeriods = [50, 100, 200]) {
    logger.debug(`[MarketBreadth] Calculating % above MAs for ${indexSymbol}`);

    try {
      const cacheKey = `pct_above_ma_${indexSymbol}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Get constituents
      const constituents = await this.getIndexConstituents(indexSymbol);
      const symbols = constituents.map(c => c.stock_symbol).slice(0, 100);

      const results = {};

      for (const period of maPeriods) {
        let aboveMA = 0;
        let total = 0;

        // Process in batches to avoid rate limits
        for (let i = 0; i < symbols.length; i += 10) {
          const batch = symbols.slice(i, i + 10);

          await Promise.all(batch.map(async (symbol) => {
            try {
              const historical = await this.fetchHistoricalData(symbol, period + 10);
              if (historical.length >= period) {
                const prices = historical.slice(0, period).map(d => d.close);
                const ma = prices.reduce((a, b) => a + b, 0) / period;
                const currentPrice = historical[0].close;

                if (currentPrice > ma) aboveMA++;
                total++;
              }
            } catch (error) {
              logger.error(`Error processing ${symbol}:`, error.message);
            }
          }));

          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const percentage = total > 0 ? (aboveMA / total) * 100 : 0;

        results[`ma${period}`] = {
          period,
          aboveMA,
          total,
          percentage,
          signal: this.interpretMABreadth(percentage)
        };

        // Store in database
        await this.storeMABreadthData(indexSymbol, period, aboveMA, total, percentage);
      }

      const result = {
        indexSymbol,
        maPeriods: results,
        overallSignal: this.getOverallMASignal(results),
        calculatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, result);
      return result;

    } catch (error) {
      logger.error('[MarketBreadth] % above MA calculation error:', error);
      throw error;
    }
  }

  /**
   * Interpret MA breadth signal
   */
  interpretMABreadth(percentage) {
    if (percentage >= config.thresholds.percentAboveMA.extremeBullish) return 'BULLISH';
    if (percentage >= config.thresholds.percentAboveMA.bullish) return 'MODERATELY_BULLISH';
    if (percentage <= config.thresholds.percentAboveMA.bearish) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Get overall MA signal from all periods
   */
  getOverallMASignal(results) {
    const signals = Object.values(results).map(r => r.signal);
    const bullishCount = signals.filter(s => s.includes('BULLISH')).length;
    const bearishCount = signals.filter(s => s === 'BEARISH').length;

    if (bullishCount >= 2) return 'BULLISH';
    if (bearishCount >= 2) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * ===================================================================
   * PRIORITY INDICATOR 3: NEW HIGHS - NEW LOWS
   * ===================================================================
   * Tracks 52-week highs and lows
   */
  async calculateNewHighsLows(indexSymbol = 'SPY') {
    logger.debug(`[MarketBreadth] Calculating New Highs-Lows for ${indexSymbol}`);

    try {
      const cacheKey = `highs_lows_${indexSymbol}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const constituents = await this.getIndexConstituents(indexSymbol);
      const symbols = constituents.map(c => c.stock_symbol).slice(0, 100);

      let newHighs52w = 0;
      let newLows52w = 0;
      let newHighs20d = 0;
      let newLows20d = 0;

      // Process in batches
      for (let i = 0; i < symbols.length; i += 10) {
        const batch = symbols.slice(i, i + 10);

        await Promise.all(batch.map(async (symbol) => {
          try {
            const historical = await this.fetchHistoricalData(symbol, 260); // ~1 year
            if (historical.length >= 252) {
              const currentPrice = historical[0].close;
              const prices52w = historical.slice(0, 252).map(d => d.high);
              const prices20d = historical.slice(0, 20).map(d => d.high);

              const high52w = Math.max(...prices52w);
              const low52w = Math.min(...prices52w.map((_, i) => historical[i].low));
              const high20d = Math.max(...prices20d);
              const low20d = Math.min(...prices20d.map((_, i) => historical[i].low));

              if (currentPrice >= high52w * 0.999) newHighs52w++; // Within 0.1% of high
              if (currentPrice <= low52w * 1.001) newLows52w++;

              if (currentPrice >= high20d * 0.999) newHighs20d++;
              if (currentPrice <= low20d * 1.001) newLows20d++;
            }
          } catch (error) {
            logger.error(`Error processing ${symbol}:`, error.message);
          }
        }));

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const hlIndex = newHighs52w - newLows52w;
      const hlRatio = newLows52w > 0 ? newHighs52w / newLows52w : newHighs52w;

      // Store in database
      await this.storeHighsLowsData(indexSymbol, {
        newHighs52w,
        newLows52w,
        newHighs20d,
        newLows20d,
        hlIndex,
        hlRatio
      });

      const result = {
        indexSymbol,
        newHighs52w,
        newLows52w,
        newHighs20d,
        newLows20d,
        hlIndex,
        hlRatio,
        totalIssues: constituents.length,
        signal: this.interpretHighsLows(hlIndex),
        calculatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, result);
      return result;

    } catch (error) {
      logger.error('[MarketBreadth] Highs-Lows calculation error:', error);
      throw error;
    }
  }

  /**
   * Interpret Highs-Lows signal
   */
  interpretHighsLows(hlIndex) {
    if (hlIndex >= config.thresholds.newHighsLows.extremeBullish) return 'BULLISH';
    if (hlIndex >= config.thresholds.newHighsLows.bullish) return 'MODERATELY_BULLISH';
    if (hlIndex <= config.thresholds.newHighsLows.extremeBearish) return 'BEARISH';
    if (hlIndex <= config.thresholds.newHighsLows.bearish) return 'MODERATELY_BEARISH';
    return 'NEUTRAL';
  }

  /**
   * ===================================================================
   * HELPER METHODS
   * ===================================================================
   */

  /**
   * Get index constituents with fallback logic
   */
  async getIndexConstituents(indexSymbol) {
    const indexMap = {
      'SPY': 'sp500',
      'QQQ': 'nasdaq',
      'DIA': 'dow',
      'IWM': 'russell2000'
    };

    const index = indexMap[indexSymbol] || 'sp500';

    // Try FMP first
    try {
      const constituents = await this.clients.fmp.getIndexConstituents(index);
      this.markProviderHealthy('fmp');
      return constituents;
    } catch (error) {
      logger.error('[FMP] Failed to get constituents:', error.message);
      this.markProviderUnhealthy('fmp', error);
      // Fallback to database cache or default list
      return this.getConstituentsFromDatabase(indexSymbol);
    }
  }

  /**
   * Fetch batch quotes with provider fallback
   */
  async fetchBatchQuotes(symbols) {
    const providers = ['fmp', 'polygon'];

    for (const provider of providers) {
      if (!this.providerHealth[provider].available) continue;

      try {
        const quotes = await this.clients[provider].getBatchQuotes(symbols);
        this.markProviderHealthy(provider);
        return quotes;
      } catch (error) {
        logger.error(`[${provider}] Failed to fetch quotes:`, error.message);
        this.markProviderUnhealthy(provider, error);
      }
    }

    throw new Error('All providers failed to fetch batch quotes');
  }

  /**
   * Fetch historical data with provider fallback
   */
  async fetchHistoricalData(symbol, days = 252) {
    const providers = ['fmp', 'alphaVantage', 'polygon'];

    for (const provider of providers) {
      if (!this.providerHealth[provider].available) continue;

      try {
        let data;
        if (provider === 'fmp') {
          data = await this.clients.fmp.getHistoricalPrices(symbol);
        } else if (provider === 'alphaVantage') {
          data = await this.clients.alphaVantage.getDailyData(symbol);
        } else if (provider === 'polygon') {
          const to = new Date().toISOString().split('T')[0];
          const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          data = await this.clients.polygon.getAggregates(symbol, 1, 'day', from, to);
        }

        this.markProviderHealthy(provider);
        return data.slice(0, days);
      } catch (error) {
        logger.error(`[${provider}] Failed to fetch historical data:`, error.message);
        this.markProviderUnhealthy(provider, error);
      }
    }

    throw new Error(`All providers failed to fetch historical data for ${symbol}`);
  }

  /**
   * Mark provider as healthy
   */
  markProviderHealthy(provider) {
    this.providerHealth[provider].available = true;
    this.providerHealth[provider].errorCount = 0;
    this.providerHealth[provider].lastError = null;
  }

  /**
   * Mark provider as unhealthy
   */
  markProviderUnhealthy(provider, error) {
    this.providerHealth[provider].errorCount++;
    this.providerHealth[provider].lastError = error.message;

    // Disable provider after 3 consecutive errors
    if (this.providerHealth[provider].errorCount >= 3) {
      this.providerHealth[provider].available = false;
      logger.warn(`[${provider}] Marked as unavailable after 3 errors`);
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Database storage methods
   */
  async storeAdvanceDeclineData(indexSymbol, adLine) {
    const latestDay = adLine[adLine.length - 1];
    if (!latestDay) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_advance_decline (
        id, date, index_symbol, advancing, declining, unchanged,
        total_issues, ad_ratio, ad_line, net_advances, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      latestDay.date,
      indexSymbol,
      latestDay.advancing,
      latestDay.declining,
      latestDay.unchanged || 0,
      latestDay.advancing + latestDay.declining,
      latestDay.adRatio,
      latestDay.adLine,
      latestDay.netAdvances,
      'calculated'
    );
  }

  async storeMABreadthData(indexSymbol, period, aboveMA, total, percentage) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_ma_breadth (
        id, date, index_symbol, ma_period, above_ma, below_ma,
        total_stocks, percent_above, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      new Date().toISOString().split('T')[0],
      indexSymbol,
      period,
      aboveMA,
      total - aboveMA,
      total,
      percentage,
      'calculated'
    );
  }

  async storeHighsLowsData(indexSymbol, data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_highs_lows (
        id, date, index_symbol, new_highs_52w, new_lows_52w,
        new_highs_20d, new_lows_20d, hl_index, hl_ratio,
        total_issues, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      new Date().toISOString().split('T')[0],
      indexSymbol,
      data.newHighs52w,
      data.newLows52w,
      data.newHighs20d,
      data.newLows20d,
      data.hlIndex,
      data.hlRatio,
      data.totalIssues || 0,
      'calculated'
    );
  }

  async getConstituentsFromDatabase(indexSymbol) {
    const stmt = this.db.prepare(`
      SELECT * FROM index_constituents
      WHERE index_symbol = ? AND is_active = 1
      ORDER BY weight DESC
    `);

    return stmt.all(indexSymbol);
  }

  /**
   * Get provider health status
   */
  getProviderHealth() {
    return this.providerHealth;
  }
}

module.exports = MarketBreadthService;
