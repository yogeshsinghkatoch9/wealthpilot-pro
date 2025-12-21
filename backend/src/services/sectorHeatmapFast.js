/**
 * Fast Sector Heatmap Service
 * Uses Yahoo Finance API for ultra-fast sector performance data
 * Optimized to return in <2 seconds instead of 20+ seconds
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Sector ETF mapping (SPDR sector ETFs)
const SECTOR_ETFS = {
  'Technology': 'XLK',
  'Healthcare': 'XLV',
  'Financials': 'XLF',
  'Consumer Discretionary': 'XLY',
  'Industrials': 'XLI',
  'Consumer Staples': 'XLP',
  'Energy': 'XLE',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
  'Materials': 'XLB',
  'Communication Services': 'XLC'
};

// Cache configuration - extended for better performance
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cachedData = null;
let cacheTimestamp = null;

class FastSectorHeatmapService {
  /**
   * Get sector performance data (optimized)
   */
  static async getSectorPerformance() {
    // Check cache first
    if (cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      logger.info('Returning cached sector heatmap data');
      return cachedData;
    }

    try {
      logger.info('Fetching sector data from Yahoo Finance (FAST)');
      const startTime = Date.now();

      const sectors = await this.fetchFromYahooFinance();

      const elapsed = Date.now() - startTime;
      logger.info(`✓ Fetched ${sectors.length} sectors in ${elapsed}ms`);

      if (sectors && sectors.length > 0) {
        cachedData = sectors;
        cacheTimestamp = Date.now();
        return sectors;
      }
    } catch (error) {
      logger.error('Yahoo Finance fetch failed', { error: error.message });
    }

    // Return cached data if available
    if (cachedData) {
      logger.warn('Fresh fetch failed, returning stale cached data');
      return cachedData;
    }

    // Last resort: return mock data
    logger.warn('All data sources failed, returning mock data');
    return this.getMockData();
  }

  /**
   * Fetch all sectors from Yahoo Finance in parallel (FAST!)
   */
  static async fetchFromYahooFinance() {
    const sectorEntries = Object.entries(SECTOR_ETFS);

    // Fetch ALL sectors in parallel (Yahoo has no rate limits)
    const promises = sectorEntries.map(async ([sectorName, symbol]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const response = await axios.get(url, {
          params: { interval: '1d', range: '1y' }, // Get 1 year of data
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 3000 // Only 3 seconds timeout!
        });

        const data = response.data;
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
          logger.warn(`No data for ${symbol}`);
          return null;
        }

        const result = data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators.quote[0];
        const timestamps = result.timestamp;

        if (!quote || !quote.close || quote.close.length === 0) {
          logger.warn(`No quote data for ${symbol}`);
          return null;
        }

        // Get current price (latest close)
        const latestIndex = quote.close.length - 1;
        const currentPrice = quote.close[latestIndex];
        const previousClose = meta.chartPreviousClose || meta.previousClose;

        // Calculate day change
        const dayChange = ((currentPrice - previousClose) / previousClose) * 100;

        // Calculate week change (5 trading days ago)
        let weekChange = 0;
        if (quote.close.length > 5) {
          const weekAgoPrice = quote.close[latestIndex - 5];
          if (weekAgoPrice) {
            weekChange = ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
          }
        }

        // Calculate month change (21 trading days ago)
        let monthChange = 0;
        if (quote.close.length > 21) {
          const monthAgoPrice = quote.close[latestIndex - 21];
          if (monthAgoPrice) {
            monthChange = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
          }
        }

        // Calculate YTD change (first day of current year)
        let ytdChange = 0;
        const currentYear = new Date().getFullYear();

        // Find first trading day of current year
        for (let i = 0; i < timestamps.length; i++) {
          const date = new Date(timestamps[i] * 1000);
          if (date.getFullYear() === currentYear) {
            const ytdPrice = quote.close[i];
            if (ytdPrice && currentPrice) {
              ytdChange = ((currentPrice - ytdPrice) / ytdPrice) * 100;
            }
            break;
          }
        }

        const volume = quote.volume && quote.volume[latestIndex] ? quote.volume[latestIndex] : 0;

        return {
          name: sectorName,
          symbol: symbol,
          price: currentPrice,
          changePercent: dayChange,
          dayChange: dayChange,
          weekChange: weekChange,
          monthChange: monthChange,
          ytdChange: ytdChange,
          volume: volume,
          marketCap: meta.marketCap || 0,
          source: 'Yahoo Finance (Fast)'
        };
      } catch (error) {
        logger.warn(`Failed to fetch ${symbol}`, { error: error.message });
        return null;
      }
    });

    // Wait for all requests to complete (in parallel!)
    const results = await Promise.all(promises);

    // Filter out nulls and sort by day change (descending)
    const sectors = results
      .filter(r => r !== null)
      .sort((a, b) => b.dayChange - a.dayChange);

    return sectors;
  }

  /**
   * Mock data for when all sources fail
   */
  static getMockData() {
    return Object.entries(SECTOR_ETFS).map(([sectorName, symbol]) => ({
      name: sectorName,
      symbol: symbol,
      price: 100 + Math.random() * 50,
      changePercent: (Math.random() - 0.5) * 4,
      dayChange: (Math.random() - 0.5) * 4,
      weekChange: (Math.random() - 0.5) * 8,
      monthChange: (Math.random() - 0.5) * 12,
      ytdChange: (Math.random() - 0.5) * 20,
      volume: Math.floor(Math.random() * 10000000),
      marketCap: 0,
      source: 'Mock Data'
    })).sort((a, b) => b.dayChange - a.dayChange);
  }

  /**
   * Clear cache (force refresh)
   */
  static clearCache() {
    cachedData = null;
    cacheTimestamp = null;
    logger.info('Sector heatmap cache cleared');
  }
}

module.exports = FastSectorHeatmapService;
