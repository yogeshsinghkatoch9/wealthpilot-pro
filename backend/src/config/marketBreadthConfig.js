/**
 * Market Breadth Configuration
 * Central configuration for all market breadth data providers and settings
 */

require('dotenv').config({ path: '.env.market-breadth' });

const marketBreadthConfig = {
  // API Keys
  apiKeys: {
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
    fmp: process.env.FMP_API_KEY,
    polygon: process.env.POLYGON_API_KEY,
    nasdaq: process.env.NASDAQ_API_KEY,
    intrinio: process.env.INTRINIO_API_KEY
  },

  // API Base URLs
  apiUrls: {
    alphaVantage: 'https://www.alphavantage.co/query',
    fmp: 'https://financialmodelingprep.com/api/v3',
    polygon: 'https://api.polygon.io',
    nasdaq: 'https://data.nasdaq.com/api/v3',
    intrinio: 'https://api-v2.intrinio.com'
  },

  // Rate Limits (requests per minute)
  rateLimits: {
    alphaVantage: parseInt(process.env.ALPHA_VANTAGE_RATE_LIMIT) || 5,
    fmp: parseInt(process.env.FMP_RATE_LIMIT) || 300,
    polygon: parseInt(process.env.POLYGON_RATE_LIMIT) || 100,
    nasdaq: parseInt(process.env.NASDAQ_RATE_LIMIT) || 50,
    intrinio: parseInt(process.env.INTRINIO_RATE_LIMIT) || 100
  },

  // Cache TTL (seconds)
  cacheTTL: {
    realtime: parseInt(process.env.CACHE_TTL_REALTIME) || 10,
    intraday: parseInt(process.env.CACHE_TTL_INTRADAY) || 60,
    daily: parseInt(process.env.CACHE_TTL_DAILY) || 3600,
    historical: parseInt(process.env.CACHE_TTL_HISTORICAL) || 86400
  },

  // Refresh Intervals (milliseconds)
  refreshIntervals: {
    realtime: parseInt(process.env.REALTIME_REFRESH_INTERVAL) || 5000,
    breadth: parseInt(process.env.BREADTH_REFRESH_INTERVAL) || 60000,
    historical: parseInt(process.env.HISTORICAL_REFRESH_INTERVAL) || 300000
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // Provider Priority for Fallback (highest to lowest)
  providerPriority: {
    advanceDecline: ['fmp', 'nasdaq', 'polygon', 'intrinio', 'alphaVantage'],
    movingAverages: ['alphaVantage', 'fmp', 'polygon', 'intrinio'],
    newHighsLows: ['fmp', 'nasdaq', 'intrinio', 'polygon'],
    trin: ['polygon', 'intrinio', 'nasdaq'],
    tick: ['polygon', 'intrinio'],
    volume: ['polygon', 'fmp', 'alphaVantage', 'intrinio']
  },

  // Market Indices
  indices: {
    sp500: { symbol: 'SPY', name: 'S&P 500', constituents: 500 },
    nasdaq: { symbol: 'QQQ', name: 'NASDAQ 100', constituents: 100 },
    russell2000: { symbol: 'IWM', name: 'Russell 2000', constituents: 2000 },
    dowJones: { symbol: 'DIA', name: 'Dow Jones', constituents: 30 }
  },

  // Breadth Indicator Thresholds
  thresholds: {
    advanceDecline: {
      extremeBullish: 0.8,
      bullish: 0.6,
      neutral: 0.4,
      bearish: 0.2
    },
    percentAboveMA: {
      extremeBullish: 80,
      bullish: 60,
      neutral: 40,
      bearish: 20
    },
    newHighsLows: {
      extremeBullish: 100,
      bullish: 50,
      neutral: 0,
      bearish: -50,
      extremeBearish: -100
    },
    trin: {
      extremeBullish: 0.5,
      bullish: 0.8,
      neutral: 1.0,
      bearish: 1.3,
      extremeBearish: 2.0
    },
    mcclellan: {
      extremeBullish: 100,
      bullish: 50,
      neutral: 0,
      bearish: -50,
      extremeBearish: -100
    }
  },

  // Moving Average Periods
  movingAveragePeriods: [20, 50, 100, 200],

  // Historical Data Ranges
  historicalRanges: {
    '1D': { days: 1, interval: '5min' },
    '1W': { days: 7, interval: '15min' },
    '1M': { days: 30, interval: '1hour' },
    '3M': { days: 90, interval: '1day' },
    '6M': { days: 180, interval: '1day' },
    '1Y': { days: 365, interval: '1day' },
    '5Y': { days: 1825, interval: '1week' }
  },

  // WebSocket Configuration
  websocket: {
    enabled: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 10,
    providers: {
      polygon: {
        url: 'wss://socket.polygon.io/stocks',
        subscriptions: ['T.*', 'Q.*'] // Trades and Quotes
      }
    }
  },

  // Data Validation Rules
  validation: {
    maxAgeMinutes: 15, // Maximum age for real-time data
    minDataPoints: 10, // Minimum data points for calculation
    outlierStdDev: 3 // Standard deviations for outlier detection
  }
};

module.exports = marketBreadthConfig;
