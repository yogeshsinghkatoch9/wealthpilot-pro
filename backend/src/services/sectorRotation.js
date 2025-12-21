const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Database = require('../db/database');
const SectorCalculations = require('./sectorCalculations');

/**
 * Comprehensive Sector Rotation Service
 * Fetches live data from Polygon.io and Alpha Vantage
 * Calculates momentum, money flow, and rotation signals
 * Implements professional trading indicators (ROC, RSI, MFI, RS)
 */

// 11 SPDR Sector ETFs
const logger = require('../utils/logger');
const SECTOR_ETFS = {
  'Technology': 'XLK',
  'Financials': 'XLF',
  'Healthcare': 'XLV',
  'Energy': 'XLE',
  'Industrials': 'XLI',
  'Consumer Staples': 'XLP',
  'Consumer Discretionary': 'XLY',
  'Communication Services': 'XLC',
  'Real Estate': 'XLRE',
  'Materials': 'XLB',
  'Utilities': 'XLU'
};

// Benchmark
const BENCHMARK = 'SPY';

class SectorRotationService {
  constructor() {
    this.polygonKey = process.env.POLYGON_API_KEY;
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.db = Database;
    this.cache = new Map(); // In-memory cache
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Main method: Get complete sector rotation data
   * @returns {Object} Complete rotation analysis
   */
  async getSectorRotationData() {
    try {
      logger.info('[SectorRotation] Fetching comprehensive rotation data...');

      // Fetch historical data for all sectors + benchmark (parallel)
      const symbols = [...Object.values(SECTOR_ETFS), BENCHMARK];
      const historicalDataPromises = symbols.map(symbol =>
        this.getHistoricalData(symbol, 60) // 60 days for calculations
      );

      const historicalResults = await Promise.allSettled(historicalDataPromises);
      const historicalData = {};

      // Process results
      symbols.forEach((symbol, index) => {
        if (historicalResults[index].status === 'fulfilled') {
          historicalData[symbol] = historicalResults[index].value;
        } else {
          logger.error(`[SectorRotation] Failed to fetch ${symbol}:`, historicalResults[index].reason);
          historicalData[symbol] = [];
        }
      });

      // Get benchmark data
      const benchmarkData = historicalData[BENCHMARK] || [];

      // Calculate metrics for each sector
      const sectors = [];
      const sectorPerformance = {};

      for (const [sectorName, symbol] of Object.entries(SECTOR_ETFS)) {
        const priceData = historicalData[symbol] || [];

        if (priceData.length === 0) {
          logger.warn(`[SectorRotation] No data for ${symbol}, using defaults`);
          continue;
        }

        // Calculate all indicators
        const roc5 = SectorCalculations.calculateROC(priceData, 5);
        const roc20 = SectorCalculations.calculateROC(priceData, 20);
        const roc50 = SectorCalculations.calculateROC(priceData, 50);
        const rsi = SectorCalculations.calculateRSI(priceData, 14);
        const mfi = SectorCalculations.calculateMFI(priceData, 14);
        const relativeStrength = SectorCalculations.calculateRelativeStrength(
          priceData,
          benchmarkData,
          20
        );
        const moneyFlow = SectorCalculations.calculateMoneyFlow(priceData, 5);

        // Generate rotation signal
        const rotationSignal = SectorCalculations.generateRotationSignal({
          roc5,
          roc20,
          rsi,
          mfi,
          relativeStrength
        });

        // Current price data
        const latestBar = priceData[priceData.length - 1];
        const previousBar = priceData[priceData.length - 2];

        const change = latestBar.close - previousBar.close;
        const changePercent = (change / previousBar.close) * 100;

        const sectorData = {
          sectorName,
          sectorCode: symbol,
          price: latestBar.close,
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          volume: latestBar.volume,

          // Momentum indicators
          roc5: parseFloat(roc5.toFixed(2)),
          roc20: parseFloat(roc20.toFixed(2)),
          roc50: parseFloat(roc50.toFixed(2)),

          // Oscillators
          rsi: parseFloat(rsi.toFixed(2)),
          mfi: parseFloat(mfi.toFixed(2)),

          // Relative performance
          relativeStrength: parseFloat(relativeStrength.toFixed(2)),
          moneyFlow: parseFloat(moneyFlow.toFixed(2)),

          // Signals
          signal: rotationSignal.signal,
          signalStrength: rotationSignal.strength,
          signalReason: rotationSignal.reason,

          // Additional metadata
          lastUpdate: new Date().toISOString()
        };

        sectors.push(sectorData);
        sectorPerformance[symbol] = roc20; // Use 20-day ROC for cycle determination
      }

      // Determine economic cycle
      const economicCycle = SectorCalculations.determineEconomicCycle(sectorPerformance);

      // Identify rotation pairs
      const formattedSectors = sectors.map(s => ({
        name: s.sectorName,
        code: s.sectorCode,
        relativeStrength: s.relativeStrength,
        moneyFlow: s.moneyFlow
      }));
      const rotationPairs = SectorCalculations.identifyRotationPairs(formattedSectors);

      // Sort sectors by relative strength
      sectors.sort((a, b) => b.relativeStrength - a.relativeStrength);

      // Identify top inflows and outflows
      const topInflows = sectors
        .filter(s => s.moneyFlow > 0)
        .sort((a, b) => b.moneyFlow - a.moneyFlow)
        .slice(0, 3);

      const topOutflows = sectors
        .filter(s => s.moneyFlow < 0)
        .sort((a, b) => a.moneyFlow - b.moneyFlow)
        .slice(0, 3);

      const result = {
        timestamp: new Date().toISOString(),
        economicCycle,
        sectors,
        rotationPairs,
        topInflows,
        topOutflows,
        benchmark: {
          symbol: BENCHMARK,
          price: benchmarkData[benchmarkData.length - 1]?.close || 0,
          change: benchmarkData[benchmarkData.length - 1]?.close -
                  benchmarkData[benchmarkData.length - 2]?.close || 0
        }
      };

      logger.debug(`[SectorRotation] Analysis complete: ${sectors.length} sectors, ${rotationPairs.length} rotation pairs`);
      return result;

    } catch (error) {
      logger.error('[SectorRotation] Error in getSectorRotationData:', error);
      throw error;
    }
  }

  /**
   * Fetch historical OHLCV data from Polygon.io with Alpha Vantage fallback
   * @param {string} symbol - Ticker symbol
   * @param {number} days - Number of days to fetch
   * @returns {Array} Array of {date, open, high, low, close, volume}
   */
  async getHistoricalData(symbol, days = 60) {
    // Check cache first
    const cacheKey = `historical_${symbol}_${days}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      // Try Polygon.io first (primary source - most reliable paid API)
      const data = await this.fetchPolygonHistorical(symbol, days);

      // Cache the result
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (polygonError) {
      logger.warn(`[SectorRotation] Polygon failed for ${symbol}, trying Yahoo Finance...`);

      try {
        // Fallback to Yahoo Finance (free, no API key required)
        const data = await this.fetchYahooFinanceHistorical(symbol, days);

        // Cache the result
        this.cache.set(cacheKey, { data, timestamp: Date.now() });

        return data;
      } catch (yahooError) {
        logger.warn(`[SectorRotation] Yahoo Finance failed for ${symbol}, trying Alpha Vantage...`);

        try {
          // Last fallback to Alpha Vantage
          const data = await this.fetchAlphaVantageHistorical(symbol, days);

          // Cache the result
          this.cache.set(cacheKey, { data, timestamp: Date.now() });

          return data;
        } catch (alphaError) {
          logger.error(`[SectorRotation] All APIs failed for ${symbol}`);
          logger.error(`  - Polygon: ${polygonError.message}`);
          logger.error(`  - Yahoo: ${yahooError.message}`);
          logger.error(`  - Alpha Vantage: ${alphaError.message}`);
          throw new Error(`Failed to fetch data for ${symbol} from all sources`);
        }
      }
    }
  }

  /**
   * Fetch historical data from Polygon.io
   * @param {string} symbol - Ticker symbol
   * @param {number} days - Number of days
   * @returns {Array} OHLCV data
   */
  async fetchPolygonHistorical(symbol, days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days - 10); // Extra buffer for market holidays

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${this.polygonKey}`;

    logger.debug(`[SectorRotation] Fetching Polygon data for ${symbol}...`);

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.status !== 'OK' || !response.data.results) {
      throw new Error(`Polygon API error for ${symbol}: ${response.data.status}`);
    }

    // Transform Polygon format to our format
    const bars = response.data.results.map(bar => ({
      date: new Date(bar.t).toISOString().split('T')[0],
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));

    logger.debug(`[SectorRotation] Fetched ${bars.length} bars for ${symbol} from Polygon`);
    return bars.slice(-days); // Return only requested days
  }

  /**
   * Fetch historical data from Yahoo Finance (no API key required)
   * @param {string} symbol - Ticker symbol
   * @param {number} days - Number of days
   * @returns {Array} OHLCV data
   */
  async fetchYahooFinanceHistorical(symbol, days) {
    // Calculate timestamps (Yahoo uses Unix timestamps)
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = Math.floor((Date.now() - (days + 10) * 24 * 60 * 60 * 1000) / 1000);

    // Yahoo Finance v8 API (no authentication required)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startDate}&period2=${endDate}&interval=1d`;

    logger.debug(`[SectorRotation] Fetching Yahoo Finance data for ${symbol}...`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data.chart || !response.data.chart.result || response.data.chart.result.length === 0) {
      throw new Error(`Yahoo Finance API error for ${symbol}`);
    }

    const result = response.data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      bars.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: quotes.open[i] || quotes.close[i],
        high: quotes.high[i] || quotes.close[i],
        low: quotes.low[i] || quotes.close[i],
        close: quotes.close[i],
        volume: quotes.volume[i] || 0
      });
    }

    // Filter out invalid data and sort
    const validBars = bars.filter(bar => bar.close && !isNaN(bar.close));
    validBars.sort((a, b) => new Date(a.date) - new Date(b.date));

    logger.debug(`[SectorRotation] Fetched ${validBars.length} bars for ${symbol} from Yahoo Finance`);
    return validBars.slice(-days);
  }

  /**
   * Fetch historical data from Alpha Vantage (fallback)
   * @param {string} symbol - Ticker symbol
   * @param {number} days - Number of days
   * @returns {Array} OHLCV data
   */
  async fetchAlphaVantageHistorical(symbol, days) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${this.alphaVantageKey}`;

    logger.debug(`[SectorRotation] Fetching Alpha Vantage data for ${symbol}...`);

    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data['Time Series (Daily)']) {
      throw new Error(`Alpha Vantage API error for ${symbol}`);
    }

    const timeSeries = response.data['Time Series (Daily)'];
    const bars = [];

    for (const [date, values] of Object.entries(timeSeries)) {
      bars.push({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      });
    }

    // Sort by date (oldest first)
    bars.sort((a, b) => new Date(a.date) - new Date(b.date));

    logger.debug(`[SectorRotation] Fetched ${bars.length} bars for ${symbol} from Alpha Vantage`);
    return bars.slice(-days); // Return only requested days
  }

  /**
   * Save sector rotation data to database for historical tracking
   * @param {Object} rotationData - Complete rotation data object
   */
  async saveSectorRotationData(rotationData) {
    try {
      const now = new Date().toISOString();

      // Save sector performance
      for (const sector of rotationData.sectors) {
        // Update or insert sector data
        this.db.run(`
          INSERT OR REPLACE INTO SectorData (
            id, sectorName, sectorCode, currentPrice, change, changePercent,
            volume, marketCap, ytdReturn, updatedAt, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          sector.sectorName,
          sector.sectorCode,
          sector.price,
          sector.change,
          sector.changePercent,
          sector.volume,
          0, // marketCap (can calculate later)
          sector.roc50, // Use 50-day ROC as YTD proxy
          now,
          now
        ]);

        // Insert into SectorPerformance for historical tracking
        this.db.run(`
          INSERT OR IGNORE INTO SectorPerformance (
            id, sectorName, sectorCode, date, open, high, low, close,
            volume, returnPct, relativeStrength, momentumScore, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          sector.sectorName,
          sector.sectorCode,
          now.split('T')[0],
          sector.price, // Open (using close as proxy)
          sector.price,
          sector.price,
          sector.price,
          sector.volume,
          sector.changePercent,
          sector.relativeStrength,
          sector.moneyFlow,
          now
        ]);
      }

      // Save rotation pairs
      for (const pair of rotationData.rotationPairs) {
        this.db.run(`
          INSERT INTO SectorRotation (
            id, fromSector, toSector, date, flowAmount, flowPercent, reason, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          pair.fromSector,
          pair.toSector,
          now.split('T')[0],
          pair.flowAmount,
          pair.strengthDifference,
          pair.confidence,
          now
        ]);
      }

      logger.info('[SectorRotation] Data saved to database successfully');
    } catch (error) {
      logger.error('[SectorRotation] Error saving data:', error);
      // Don't throw - saving to DB is non-critical
    }
  }

  /**
   * Get historical sector rotation data from database
   * @param {number} days - Number of days to fetch
   * @returns {Array} Historical rotation data
   */
  async getHistoricalRotations(days = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const rotations = this.db.all(`
        SELECT * FROM SectorRotation
        WHERE date >= ?
        ORDER BY date DESC
      `, [cutoffDate.toISOString().split('T')[0]]);

      return rotations;
    } catch (error) {
      logger.error('[SectorRotation] Error fetching historical rotations:', error);
      return [];
    }
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache() {
    this.cache.clear();
    logger.info('[SectorRotation] Cache cleared');
  }
}

module.exports = new SectorRotationService();
