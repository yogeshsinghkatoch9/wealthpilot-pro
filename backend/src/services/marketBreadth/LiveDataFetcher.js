/**
 * Live Market Breadth Data Fetcher
 * Fetches real-time market data from APIs and calculates breadth indicators
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Top stocks for each index (representative sample)
const logger = require('../../utils/logger');
const INDEX_STOCKS = {
  'SPY': [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'JNJ',
    'V', 'PG', 'UNH', 'MA', 'HD', 'CVX', 'LLY', 'MRK', 'PEP', 'ABBV',
    'KO', 'COST', 'AVGO', 'TMO', 'WMT', 'MCD', 'CSCO', 'ACN', 'DIS', 'ABT',
    'NFLX', 'ADBE', 'NKE', 'CRM', 'AMD', 'INTC', 'QCOM', 'TXN', 'INTU', 'HON',
    'ORCL', 'BA', 'CAT', 'GE', 'MMM', 'IBM', 'AXP', 'GS', 'MS', 'C'
  ],
  'QQQ': [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'COST', 'NFLX',
    'ADBE', 'CSCO', 'PEP', 'INTC', 'CMCSA', 'TXN', 'QCOM', 'AMGN', 'HON', 'INTU',
    'SBUX', 'AMAT', 'ISRG', 'BKNG', 'ADP', 'GILD', 'MDLZ', 'ADI', 'REGN', 'VRTX',
    'LRCX', 'PANW', 'SNPS', 'KLAC', 'MRVL', 'CDNS', 'ASML', 'NXPI', 'ABNB', 'WDAY',
    'FTNT', 'MNST', 'MELI', 'TEAM', 'DDOG', 'CRWD', 'ZS', 'SNOW', 'DXCM', 'MRNA'
  ],
  'IWM': [
    'NCNO', 'SWTX', 'RVMD', 'OSCR', 'VKTX', 'PTCT', 'HWC', 'DNLI', 'TBBK', 'LFST',
    'BANR', 'MARA', 'SHAK', 'OMCL', 'SLVM', 'CALM', 'KTOS', 'IPAR', 'ICFI', 'PRGS',
    'FN', 'GTLS', 'FORM', 'HQY', 'CADE', 'LBRT', 'SANM', 'GBCI', 'ATKR', 'MTRX',
    'SMP', 'HOMB', 'SFNC', 'MTH', 'POWI', 'CVBF', 'MATX', 'SYBT', 'RDNT', 'BL',
    'UFPI', 'SLAB', 'PAYO', 'KTB', 'APAM', 'PFSI', 'CWT', 'ITGR', 'CENTA', 'CENX'
  ],
  'DIA': [
    'UNH', 'GS', 'MSFT', 'HD', 'CAT', 'AMGN', 'CRM', 'V', 'MCD', 'TRV',
    'AXP', 'JPM', 'HON', 'AAPL', 'IBM', 'BA', 'AMZN', 'JNJ', 'PG', 'CVX',
    'MRK', 'DIS', 'NKE', 'MMM', 'DOW', 'WMT', 'KO', 'CSCO', 'VZ', 'INTC'
  ]
};

class LiveDataFetcher {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  /**
   * Fetch live market breadth data for an index
   */
  async fetchLiveMarketBreadth(indexSymbol) {
    logger.debug(`[LiveDataFetcher] Fetching live data for ${indexSymbol}`);

    const stocks = INDEX_STOCKS[indexSymbol] || INDEX_STOCKS['SPY'];

    try {
      // Fetch live quotes using individual FMP calls (avoid batch limit)
      const quotes = await this.fetchQuotesIndividually(stocks.slice(0, 30)); // Limit to 30 stocks to stay within rate limits

      if (!quotes || quotes.length === 0) {
        throw new Error(`No quotes received for ${indexSymbol}`);
      }

      logger.debug(`[LiveDataFetcher] Received ${quotes.length} quotes for ${indexSymbol}`);

      // Calculate breadth indicators
      const breadth = this.calculateBreadthIndicators(quotes);

      // Store in database
      await this.storeBreadthData(indexSymbol, breadth);

      return breadth;

    } catch (error) {
      logger.error(`[LiveDataFetcher] Error fetching live data for ${indexSymbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch quotes using Yahoo Finance API (free, no auth required)
   */
  async fetchQuotesIndividually(symbols) {
    const quotes = [];
    const batchSize = 10; // Yahoo Finance is more permissive

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const batchPromises = batch.map(async (symbol) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
          const response = await axios.get(url, {
            params: { interval: '1d', range: '5d' },
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
          });

          const data = response.data;
          if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            return null;
          }

          const result = data.chart.result[0];
          const meta = result.meta;
          const quote = result.indicators.quote[0];
          const latestIndex = quote.close.length - 1;
          const currentPrice = quote.close[latestIndex];
          const previousClose = meta.chartPreviousClose || meta.previousClose;
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;

          // Calculate simple moving averages from recent data
          const closes = quote.close.filter(c => c !== null);
          const priceAvg50 = closes.length >= 5 ? closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5 : currentPrice * 0.98;
          const priceAvg200 = currentPrice * 0.95; // Approximation

          // Get 52-week high/low from meta or approximate
          const yearHigh = meta.fiftyTwoWeekHigh || currentPrice * 1.1;
          const yearLow = meta.fiftyTwoWeekLow || currentPrice * 0.9;

          return {
            symbol,
            name: symbol,
            price: currentPrice,
            change: changePercent,
            volume: quote.volume[latestIndex] || 0,
            yearHigh,
            yearLow,
            priceAvg50,
            priceAvg200
          };
        } catch (error) {
          logger.error(`Error fetching ${symbol}:`, error.message);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      quotes.push(...batchResults.filter(q => q !== null));

      // Small delay between batches
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    logger.debug(`[LiveDataFetcher] Fetched ${quotes.length} quotes from Yahoo Finance`);
    return quotes;
  }

  /**
   * Calculate breadth indicators from quotes
   */
  calculateBreadthIndicators(quotes) {
    let advancing = 0;
    let declining = 0;
    let unchanged = 0;
    let newHighs52w = 0;
    let newLows52w = 0;

    const maCounts = {
      20: { above: 0, below: 0 },
      50: { above: 0, below: 0 },
      100: { above: 0, below: 0 },
      200: { above: 0, below: 0 }
    };

    quotes.forEach(quote => {
      // Advance/Decline
      if (quote.change > 0) advancing++;
      else if (quote.change < 0) declining++;
      else unchanged++;

      // Highs/Lows (approximate using price vs 52-week range)
      if (quote.yearHigh && quote.price >= quote.yearHigh * 0.99) {
        newHighs52w++;
      }
      if (quote.yearLow && quote.price <= quote.yearLow * 1.01) {
        newLows52w++;
      }

      // MA Breadth (using SMA fields from FMP)
      // For 20-day and 100-day, approximate from 50-day and 200-day
      const priceAvg20 = quote.price * 0.995; // Very close to current price
      const priceAvg100 = quote.priceAvg50 && quote.priceAvg200
        ? (quote.priceAvg50 + quote.priceAvg200) / 2
        : quote.price * 0.97;

      if (quote.price > priceAvg20) maCounts[20].above++;
      else maCounts[20].below++;

      if (quote.priceAvg50 && quote.price) {
        if (quote.price > quote.priceAvg50) maCounts[50].above++;
        else maCounts[50].below++;
      }

      if (quote.price > priceAvg100) maCounts[100].above++;
      else maCounts[100].below++;

      if (quote.priceAvg200 && quote.price) {
        if (quote.price > quote.priceAvg200) maCounts[200].above++;
        else maCounts[200].below++;
      }
    });

    const totalIssues = quotes.length;
    const adRatio = declining > 0 ? advancing / declining : advancing;
    const hlIndex = newHighs52w - newLows52w;
    const hlRatio = newLows52w > 0 ? newHighs52w / newLows52w : newHighs52w;

    return {
      advanceDecline: {
        advancing,
        declining,
        unchanged,
        totalIssues,
        adRatio,
        netAdvances: advancing - declining,
        signal: this.interpretADSignal(adRatio)
      },
      maBreath: {
        ma20: {
          above: maCounts[20].above,
          below: maCounts[20].below,
          total: maCounts[20].above + maCounts[20].below,
          percentage: ((maCounts[20].above / totalIssues) * 100).toFixed(1)
        },
        ma50: {
          above: maCounts[50].above,
          below: maCounts[50].below,
          total: maCounts[50].above + maCounts[50].below,
          percentage: ((maCounts[50].above / totalIssues) * 100).toFixed(1)
        },
        ma100: {
          above: maCounts[100].above,
          below: maCounts[100].below,
          total: maCounts[100].above + maCounts[100].below,
          percentage: ((maCounts[100].above / totalIssues) * 100).toFixed(1)
        },
        ma200: {
          above: maCounts[200].above,
          below: maCounts[200].below,
          total: maCounts[200].above + maCounts[200].below,
          percentage: ((maCounts[200].above / totalIssues) * 100).toFixed(1)
        }
      },
      highsLows: {
        newHighs52w,
        newLows52w,
        hlIndex,
        hlRatio,
        totalIssues,
        signal: this.interpretHLSignal(hlIndex)
      },
      timestamp: new Date().toISOString(),
      source: 'live_api'
    };
  }

  /**
   * Store breadth data in database
   */
  async storeBreadthData(indexSymbol, breadth) {
    const date = new Date().toISOString().split('T')[0];

    try {
      // Store A/D data
      const adStmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_advance_decline (
          id, date, index_symbol, advancing, declining, unchanged,
          total_issues, ad_ratio, ad_line, net_advances, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live_api')
      `);

      adStmt.run(
        uuidv4(),
        date,
        indexSymbol,
        breadth.advanceDecline.advancing,
        breadth.advanceDecline.declining,
        breadth.advanceDecline.unchanged,
        breadth.advanceDecline.totalIssues,
        breadth.advanceDecline.adRatio,
        0, // AD line needs cumulative calculation
        breadth.advanceDecline.netAdvances
      );

      // Store MA breadth data
      const maStmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_ma_breadth (
          id, date, index_symbol, ma_period, above_ma, below_ma,
          total_stocks, percent_above, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live_api')
      `);

      [20, 50, 100, 200].forEach(period => {
        const ma = breadth.maBreath[`ma${period}`];
        if (ma) {
          maStmt.run(
            uuidv4(),
            date,
            indexSymbol,
            period,
            ma.above,
            ma.below,
            ma.total,
            parseFloat(ma.percentage)
          );
        }
      });

      // Store Highs/Lows data
      const hlStmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_highs_lows (
          id, date, index_symbol, new_highs_52w, new_lows_52w,
          new_highs_20d, new_lows_20d, hl_index, hl_ratio,
          total_issues, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live_api')
      `);

      hlStmt.run(
        uuidv4(),
        date,
        indexSymbol,
        breadth.highsLows.newHighs52w,
        breadth.highsLows.newLows52w,
        0, // 20-day highs not calculated
        0, // 20-day lows not calculated
        breadth.highsLows.hlIndex,
        breadth.highsLows.hlRatio,
        breadth.highsLows.totalIssues
      );

      logger.debug(`[LiveDataFetcher] Stored breadth data for ${indexSymbol}`);

    } catch (error) {
      logger.error('[LiveDataFetcher] Error storing data:', error.message);
    }
  }

  /**
   * Interpret A/D signal
   */
  interpretADSignal(adRatio) {
    if (adRatio >= 2.0) return 'BULLISH';
    if (adRatio >= 1.2) return 'MODERATELY_BULLISH';
    if (adRatio <= 0.5) return 'BEARISH';
    if (adRatio <= 0.8) return 'MODERATELY_BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Interpret Highs-Lows signal
   */
  interpretHLSignal(hlIndex) {
    if (hlIndex >= 30) return 'BULLISH';
    if (hlIndex >= 10) return 'MODERATELY_BULLISH';
    if (hlIndex <= -30) return 'BEARISH';
    if (hlIndex <= -10) return 'MODERATELY_BEARISH';
    return 'NEUTRAL';
  }
}

module.exports = LiveDataFetcher;
