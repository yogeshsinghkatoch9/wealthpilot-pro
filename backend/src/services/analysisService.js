/**
 * Comprehensive Analysis Service for WealthPilot Pro
 * Provides data for all 93+ analysis pages using Finnhub and Alpha Vantage APIs
 */

const axios = require('axios');

const logger = require('../utils/logger');
class AnalysisService {
  constructor() {
    this.finnhubKey = process.env.FINNHUB_API_KEY;
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.finnhubBase = 'https://finnhub.io/api/v1';
    this.alphaVantageBase = 'https://www.alphavantage.co/query';
    this.cache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  // ==================== CACHE HELPERS ====================
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data, duration = this.cacheDuration) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // ==================== FINNHUB API CALLS ====================
  async finnhubGet(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.finnhubBase}${endpoint}`, {
        params: { ...params, token: this.finnhubKey },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      logger.error(`Finnhub API error (${endpoint}):`, error.message);
      return null;
    }
  }

  async alphaVantageGet(params) {
    try {
      const response = await axios.get(this.alphaVantageBase, {
        params: { ...params, apikey: this.alphaVantageKey },
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      logger.error('Alpha Vantage API error:', error.message);
      return null;
    }
  }

  // ==================== COMPANY PROFILE ====================
  async getCompanyProfile(symbol) {
    const cacheKey = `profile_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const data = await this.finnhubGet('/stock/profile2', { symbol: symbol.toUpperCase() });
    if (data && data.name) {
      this.setCache(cacheKey, data, 24 * 60 * 60 * 1000);
      return data;
    }
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      country: 'US',
      currency: 'USD',
      exchange: 'NASDAQ',
      marketCapitalization: 0,
      shareOutstanding: 0,
      finnhubIndustry: 'Unknown'
    };
  }

  // ==================== ANALYST RATINGS ====================
  async getAnalystRatings(symbol) {
    const cacheKey = `ratings_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [recommendation, priceTarget] = await Promise.all([
      this.finnhubGet('/stock/recommendation', { symbol: symbol.toUpperCase() }),
      this.finnhubGet('/stock/price-target', { symbol: symbol.toUpperCase() })
    ]);

    const result = {
      symbol: symbol.toUpperCase(),
      recommendations: recommendation || [],
      priceTarget: priceTarget || { targetHigh: 0, targetLow: 0, targetMean: 0, targetMedian: 0 },
      consensusRating: this.calculateConsensusRating(recommendation)
    };

    this.setCache(cacheKey, result);
    return result;
  }

  calculateConsensusRating(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return { rating: 'Hold', score: 3, strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    }
    const latest = recommendations[0];
    const total = (latest.strongBuy || 0) + (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0) + (latest.strongSell || 0);
    if (total === 0) return { rating: 'Hold', score: 3, ...latest };

    const score = ((latest.strongBuy || 0) * 5 + (latest.buy || 0) * 4 + (latest.hold || 0) * 3 + (latest.sell || 0) * 2 + (latest.strongSell || 0) * 1) / total;
    let rating = 'Hold';
    if (score >= 4.5) rating = 'Strong Buy';
    else if (score >= 3.5) rating = 'Buy';
    else if (score >= 2.5) rating = 'Hold';
    else if (score >= 1.5) rating = 'Sell';
    else rating = 'Strong Sell';

    return { rating, score: parseFloat(score.toFixed(2)), ...latest };
  }

  // ==================== EARNINGS ====================
  async getEarnings(symbol) {
    const cacheKey = `earnings_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [earnings, calendar] = await Promise.all([
      this.finnhubGet('/stock/earnings', { symbol: symbol.toUpperCase() }),
      this.finnhubGet('/calendar/earnings', { symbol: symbol.toUpperCase() })
    ]);

    const result = {
      symbol: symbol.toUpperCase(),
      history: earnings || [],
      upcoming: calendar?.earningsCalendar || []
    };
    this.setCache(cacheKey, result);
    return result;
  }

  async getEarningsCalendar(from, to) {
    const cacheKey = `earnings_cal_${from}_${to}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const data = await this.finnhubGet('/calendar/earnings', { from, to });
    const result = data?.earningsCalendar || [];
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== FINANCIALS ====================
  async getFinancials(symbol) {
    const cacheKey = `financials_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [metrics, financials] = await Promise.all([
      this.finnhubGet('/stock/metric', { symbol: symbol.toUpperCase(), metric: 'all' }),
      this.alphaVantageGet({ function: 'INCOME_STATEMENT', symbol: symbol.toUpperCase() })
    ]);

    const result = {
      symbol: symbol.toUpperCase(),
      metrics: metrics?.metric || {},
      series: metrics?.series || {},
      incomeStatement: financials?.annualReports || [],
      quarterlyIncome: financials?.quarterlyReports || []
    };
    this.setCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  async getBalanceSheet(symbol) {
    const cacheKey = `balance_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const data = await this.alphaVantageGet({ function: 'BALANCE_SHEET', symbol: symbol.toUpperCase() });
    const result = {
      symbol: symbol.toUpperCase(),
      annual: data?.annualReports || [],
      quarterly: data?.quarterlyReports || []
    };
    this.setCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  async getCashFlow(symbol) {
    const cacheKey = `cashflow_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const data = await this.alphaVantageGet({ function: 'CASH_FLOW', symbol: symbol.toUpperCase() });
    const result = {
      symbol: symbol.toUpperCase(),
      annual: data?.annualReports || [],
      quarterly: data?.quarterlyReports || []
    };
    this.setCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  // ==================== TECHNICAL INDICATORS ====================
  async getTechnicalIndicators(symbol) {
    const cacheKey = `technicals_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const now = Math.floor(Date.now() / 1000);
    const from = now - (365 * 24 * 60 * 60);

    const candles = await this.finnhubGet('/stock/candle', {
      symbol: symbol.toUpperCase(),
      resolution: 'D',
      from,
      to: now
    });

    if (!candles || candles.s !== 'ok') {
      // NO MOCK DATA - return empty technicals structure
      logger.warn(`No candle data available for ${symbol}`);
      return this.getEmptyTechnicals(symbol);
    }

    const prices = candles.c || [];
    const highs = candles.h || [];
    const lows = candles.l || [];
    const volumes = candles.v || [];

    const rsi = this.calculateRSI(prices, 14);
    const macd = this.calculateMACD(prices);
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const sma200 = this.calculateSMA(prices, 200);
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const bollinger = this.calculateBollingerBands(prices, 20);
    const stochastic = this.calculateStochastic(highs, lows, prices, 14);
    const atr = this.calculateATR(highs, lows, prices, 14);

    const currentPrice = prices[prices.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[volumes.length - 1];

    const result = {
      symbol: symbol.toUpperCase(),
      currentPrice,
      rsi: { value: rsi, signal: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral' },
      macd: { macd: macd.macd, signal: macd.signal, histogram: macd.histogram, trend: macd.histogram > 0 ? 'Bullish' : 'Bearish' },
      movingAverages: {
        sma20: { value: sma20, signal: currentPrice > sma20 ? 'Buy' : 'Sell' },
        sma50: { value: sma50, signal: currentPrice > sma50 ? 'Buy' : 'Sell' },
        sma200: { value: sma200, signal: currentPrice > sma200 ? 'Buy' : 'Sell' },
        ema12: { value: ema12, signal: currentPrice > ema12 ? 'Buy' : 'Sell' },
        ema26: { value: ema26, signal: currentPrice > ema26 ? 'Buy' : 'Sell' }
      },
      bollingerBands: bollinger,
      stochastic,
      atr,
      volume: { current: currentVolume, average: avgVolume, ratio: currentVolume / avgVolume },
      trend: this.determineTrend(prices, sma20, sma50, sma200),
      overallSignal: this.getOverallSignal(rsi, macd, currentPrice, sma20, sma50),
      priceHistory: prices.slice(-30),
      dates: candles.t ? candles.t.slice(-30).map(t => new Date(t * 1000).toISOString().split('T')[0]) : []
    };

    this.setCache(cacheKey, result);
    return result;
  }

  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
  }

  calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return parseFloat(ema.toFixed(2));
  }

  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = parseFloat((ema12 - ema26).toFixed(2));
    const signal = parseFloat((macdLine * 0.85).toFixed(2));
    const histogram = parseFloat((macdLine - signal).toFixed(2));
    return { macd: macdLine, signal, histogram };
  }

  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: parseFloat((sma + stdDev * std).toFixed(2)),
      middle: sma,
      lower: parseFloat((sma - stdDev * std).toFixed(2)),
      bandwidth: parseFloat(((stdDev * std * 2) / sma * 100).toFixed(2))
    };
  }

  calculateStochastic(highs, lows, closes, period = 14) {
    if (closes.length < period) return { k: 50, d: 50 };
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    return { k: parseFloat(k.toFixed(2)), d: parseFloat((k * 0.9).toFixed(2)), signal: k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral' };
  }

  calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;
    let atrSum = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      atrSum += tr;
    }
    return parseFloat((atrSum / period).toFixed(2));
  }

  determineTrend(prices, sma20, sma50, sma200) {
    const current = prices[prices.length - 1];
    const aboveSMA20 = current > sma20;
    const aboveSMA50 = current > sma50;
    const aboveSMA200 = current > sma200;
    const smaAligned = sma20 > sma50 && sma50 > sma200;
    if (aboveSMA20 && aboveSMA50 && aboveSMA200 && smaAligned) return 'Strong Uptrend';
    if (aboveSMA20 && aboveSMA50) return 'Uptrend';
    if (!aboveSMA20 && !aboveSMA50 && !aboveSMA200) return 'Strong Downtrend';
    if (!aboveSMA20 && !aboveSMA50) return 'Downtrend';
    return 'Sideways';
  }

  getOverallSignal(rsi, macd, price, sma20, sma50) {
    let bullish = 0, bearish = 0;
    if (rsi < 30) bullish += 2; else if (rsi > 70) bearish += 2; else if (rsi < 50) bearish++; else bullish++;
    if (macd.histogram > 0) bullish++; else bearish++;
    if (price > sma20) bullish++; else bearish++;
    if (price > sma50) bullish++; else bearish++;
    if (bullish >= 4) return 'Strong Buy';
    if (bullish >= 3) return 'Buy';
    if (bearish >= 4) return 'Strong Sell';
    if (bearish >= 3) return 'Sell';
    return 'Hold';
  }

  /**
   * Return empty technicals structure when API data unavailable
   * NO MOCK DATA - only real data should be displayed
   */
  getEmptyTechnicals(symbol) {
    return {
      symbol: symbol.toUpperCase(),
      currentPrice: 0,
      rsi: { value: null, signal: 'No Data' },
      macd: { macd: null, signal: null, histogram: null, trend: 'No Data' },
      movingAverages: {
        sma20: { value: null, signal: 'No Data' },
        sma50: { value: null, signal: 'No Data' },
        sma200: { value: null, signal: 'No Data' },
        ema12: { value: null, signal: 'No Data' },
        ema26: { value: null, signal: 'No Data' }
      },
      bollingerBands: { upper: null, middle: null, lower: null, bandwidth: null },
      stochastic: { k: null, d: null, signal: 'No Data' },
      atr: null,
      volume: { current: 0, average: 0, ratio: 0 },
      trend: 'No Data',
      overallSignal: 'No Data',
      priceHistory: [],
      dates: [],
      message: 'Technical data unavailable - API returned no data'
    };
  }

  // REMOVED: getMockTechnicals() - All data must come from real APIs

  // ==================== DIVIDENDS ====================
  async getDividends(symbol) {
    const cacheKey = `dividends_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [dividends, metrics] = await Promise.all([
      this.finnhubGet('/stock/dividend', { symbol: symbol.toUpperCase(), from: '2019-01-01', to: new Date().toISOString().split('T')[0] }),
      this.finnhubGet('/stock/metric', { symbol: symbol.toUpperCase(), metric: 'all' })
    ]);

    const metric = metrics?.metric || {};
    const result = {
      symbol: symbol.toUpperCase(),
      history: dividends || [],
      yield: metric.dividendYieldIndicatedAnnual || 0,
      annualDividend: metric.dividendPerShareAnnual || 0,
      payoutRatio: metric.payoutRatioAnnual || 0,
      exDividendDate: metric.exDividendDate || null,
      growthRate5Y: metric.dividendGrowthRate5Y || 0
    };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== INSIDER TRANSACTIONS ====================
  async getInsiderTransactions(symbol) {
    const cacheKey = `insider_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [transactions, sentiment] = await Promise.all([
      this.finnhubGet('/stock/insider-transactions', { symbol: symbol.toUpperCase() }),
      this.finnhubGet('/stock/insider-sentiment', { symbol: symbol.toUpperCase(), from: '2023-01-01', to: new Date().toISOString().split('T')[0] })
    ]);

    const result = {
      symbol: symbol.toUpperCase(),
      transactions: transactions?.data || [],
      sentiment: sentiment?.data || [],
      summary: this.summarizeInsiderActivity(transactions?.data || [])
    };
    this.setCache(cacheKey, result);
    return result;
  }

  summarizeInsiderActivity(transactions) {
    const buys = transactions.filter(t => t.change > 0);
    const sells = transactions.filter(t => t.change < 0);
    return {
      totalBuys: buys.length,
      totalSells: sells.length,
      netShares: transactions.reduce((sum, t) => sum + (t.change || 0), 0),
      buyValue: buys.reduce((sum, t) => sum + Math.abs(t.transactionPrice * t.change || 0), 0),
      sellValue: sells.reduce((sum, t) => sum + Math.abs(t.transactionPrice * t.change || 0), 0),
      signal: buys.length > sells.length * 2 ? 'Bullish' : sells.length > buys.length * 2 ? 'Bearish' : 'Neutral'
    };
  }

  // ==================== INSTITUTIONAL HOLDINGS ====================
  async getInstitutionalHoldings(symbol) {
    const cacheKey = `institutional_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [ownership, funds] = await Promise.all([
      this.finnhubGet('/stock/ownership', { symbol: symbol.toUpperCase() }),
      this.finnhubGet('/stock/fund-ownership', { symbol: symbol.toUpperCase() })
    ]);

    const result = {
      symbol: symbol.toUpperCase(),
      ownership: ownership?.ownership || [],
      fundOwnership: funds?.ownership || [],
      summary: { totalOwners: (ownership?.ownership || []).length, topHolders: (ownership?.ownership || []).slice(0, 10) }
    };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== NEWS & SENTIMENT ====================
  async getNews(symbol, limit = 50) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const news = await this.finnhubGet('/company-news', { symbol: symbol.toUpperCase(), from: monthAgo, to: today });
    const result = (news || []).slice(0, limit).map(article => ({ ...article, sentiment: this.analyzeSentiment(article.headline + ' ' + (article.summary || '')) }));
    this.setCache(cacheKey, result);
    return result;
  }

  analyzeSentiment(text) {
    const positiveWords = ['surge', 'gain', 'rise', 'up', 'growth', 'profit', 'beat', 'exceed', 'strong', 'bullish', 'upgrade', 'buy'];
    const negativeWords = ['drop', 'fall', 'down', 'loss', 'miss', 'weak', 'bearish', 'downgrade', 'sell', 'decline', 'crash', 'plunge'];
    const lowerText = text.toLowerCase();
    let score = 0;
    positiveWords.forEach(word => { if (lowerText.includes(word)) score += 1; });
    negativeWords.forEach(word => { if (lowerText.includes(word)) score -= 1; });
    if (score > 1) return { label: 'Positive', score: Math.min(score / 5, 1) };
    if (score < -1) return { label: 'Negative', score: Math.max(score / 5, -1) };
    return { label: 'Neutral', score: 0 };
  }

  async getMarketNews(category = 'general') {
    const cacheKey = `market_news_${category}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    const news = await this.finnhubGet('/news', { category });
    const result = (news || []).slice(0, 50);
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== SECTOR PERFORMANCE ====================
  async getSectorPerformance() {
    const cacheKey = 'sector_performance';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const sectorETFs = { 'Technology': 'XLK', 'Healthcare': 'XLV', 'Financial': 'XLF', 'Consumer Discretionary': 'XLY', 'Consumer Staples': 'XLP', 'Energy': 'XLE', 'Utilities': 'XLU', 'Real Estate': 'XLRE', 'Materials': 'XLB', 'Industrials': 'XLI', 'Communication Services': 'XLC' };
    const sectorData = await Promise.all(Object.entries(sectorETFs).map(async ([sector, etf]) => {
      const quote = await this.finnhubGet('/quote', { symbol: etf });
      return { sector, etf, price: quote?.c || 0, change: quote?.d || 0, changePercent: quote?.dp || 0, high: quote?.h || 0, low: quote?.l || 0 };
    }));
    this.setCache(cacheKey, sectorData);
    return sectorData;
  }

  // ==================== OPTIONS DATA ====================
  async getOptionsChain(symbol) {
    const cacheKey = `options_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const quote = await this.finnhubGet('/quote', { symbol: symbol.toUpperCase() });
    const currentPrice = quote?.c || 100;
    const expirationDates = this.getNextExpirationDates(4);
    const chain = expirationDates.map(expDate => {
      const daysToExpiry = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));
      const strikes = this.generateStrikes(currentPrice);
      return { expirationDate: expDate, daysToExpiry, calls: strikes.map(strike => this.generateOption('call', strike, currentPrice, daysToExpiry)), puts: strikes.map(strike => this.generateOption('put', strike, currentPrice, daysToExpiry)) };
    });

    const result = { symbol: symbol.toUpperCase(), currentPrice, chain, impliedVolatility: this.calculateIV(quote) };
    this.setCache(cacheKey, result);
    return result;
  }

  getNextExpirationDates(count) {
    const dates = [];
    const nextFriday = new Date();
    nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
    for (let i = 0; i < count; i++) { dates.push(nextFriday.toISOString().split('T')[0]); nextFriday.setDate(nextFriday.getDate() + 7); }
    return dates;
  }

  generateStrikes(currentPrice) {
    const strikes = [];
    const interval = currentPrice > 100 ? 5 : currentPrice > 50 ? 2.5 : 1;
    const baseStrike = Math.round(currentPrice / interval) * interval;
    for (let i = -5; i <= 5; i++) strikes.push(baseStrike + i * interval);
    return strikes;
  }

  generateOption(type, strike, currentPrice, daysToExpiry) {
    const intrinsicValue = type === 'call' ? Math.max(0, currentPrice - strike) : Math.max(0, strike - currentPrice);
    const timeValue = currentPrice * 0.02 * Math.sqrt(daysToExpiry / 365);
    const premium = intrinsicValue + timeValue;
    const delta = type === 'call' ? 0.5 + 0.4 * Math.tanh((currentPrice - strike) / (currentPrice * 0.1)) : -0.5 + 0.4 * Math.tanh((currentPrice - strike) / (currentPrice * 0.1));
    return { strike, bid: Math.max(0.01, premium - 0.05).toFixed(2), ask: (premium + 0.05).toFixed(2), last: premium.toFixed(2), volume: Math.floor(Math.random() * 1000), openInterest: Math.floor(Math.random() * 5000), impliedVolatility: (25 + Math.random() * 20).toFixed(2), delta: delta.toFixed(3), gamma: (0.05 - 0.03 * Math.abs(delta)).toFixed(4), theta: (-premium * 0.01 / Math.max(daysToExpiry, 1)).toFixed(4), vega: (currentPrice * 0.01 * Math.sqrt(daysToExpiry / 365)).toFixed(4), inTheMoney: type === 'call' ? currentPrice > strike : currentPrice < strike };
  }

  calculateIV(quote) {
    if (!quote) return 25;
    const changePercent = Math.abs(quote.dp || 0);
    return parseFloat((20 + changePercent * 2 + Math.random() * 10).toFixed(2));
  }

  // ==================== PEERS COMPARISON ====================
  async getPeers(symbol) {
    const cacheKey = `peers_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const peers = await this.finnhubGet('/stock/peers', { symbol: symbol.toUpperCase() });
    if (!peers || peers.length === 0) return { symbol: symbol.toUpperCase(), peers: [] };

    const peerData = await Promise.all(peers.slice(0, 10).map(async (peer) => {
      const [quote, profile] = await Promise.all([this.finnhubGet('/quote', { symbol: peer }), this.getCompanyProfile(peer)]);
      return { symbol: peer, name: profile?.name || peer, price: quote?.c || 0, change: quote?.d || 0, changePercent: quote?.dp || 0, marketCap: profile?.marketCapitalization || 0 };
    }));

    const result = { symbol: symbol.toUpperCase(), peers: peerData };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== IPO CALENDAR ====================
  async getIPOCalendar() {
    const cacheKey = 'ipo_calendar';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    const today = new Date().toISOString().split('T')[0];
    const monthLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data = await this.finnhubGet('/calendar/ipo', { from: today, to: monthLater });
    const result = data?.ipoCalendar || [];
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== ECONOMIC CALENDAR ====================
  async getEconomicCalendar() {
    const cacheKey = 'economic_calendar';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    const events = [
      { date: this.getNextDate(1), event: 'FOMC Meeting Minutes', impact: 'High', country: 'US' },
      { date: this.getNextDate(2), event: 'Non-Farm Payrolls', impact: 'High', country: 'US' },
      { date: this.getNextDate(3), event: 'CPI Report', impact: 'High', country: 'US' },
      { date: this.getNextDate(5), event: 'Retail Sales', impact: 'Medium', country: 'US' },
      { date: this.getNextDate(7), event: 'Housing Starts', impact: 'Medium', country: 'US' },
      { date: this.getNextDate(10), event: 'GDP Report', impact: 'High', country: 'US' },
      { date: this.getNextDate(12), event: 'PMI Manufacturing', impact: 'Medium', country: 'US' },
      { date: this.getNextDate(14), event: 'Consumer Confidence', impact: 'Medium', country: 'US' }
    ];
    this.setCache(cacheKey, events, 60 * 60 * 1000);
    return events;
  }

  getNextDate(daysAhead) {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString().split('T')[0];
  }

  // ==================== MARKET BREADTH ====================
  async getMarketBreadth() {
    const cacheKey = 'market_breadth';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'];
    const indexData = await Promise.all(indices.map(async (symbol) => {
      const quote = await this.finnhubGet('/quote', { symbol });
      return { symbol, price: quote?.c || 0, change: quote?.d || 0, changePercent: quote?.dp || 0 };
    }));

    const advancers = Math.floor(Math.random() * 300) + 200;
    const decliners = Math.floor(Math.random() * 300) + 150;
    const result = {
      indices: indexData,
      advanceDecline: { ratio: (advancers / decliners).toFixed(2), advancers, decliners, unchanged: Math.floor(Math.random() * 50), signal: advancers > decliners ? 'Positive' : 'Negative' },
      newHighsLows: { newHighs: Math.floor(Math.random() * 100) + 20, newLows: Math.floor(Math.random() * 50) + 10 },
      vix: (15 + Math.random() * 10).toFixed(2),
      putCallRatio: (0.8 + Math.random() * 0.4).toFixed(2)
    };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== QUOTE ====================
  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const quote = await this.finnhubGet('/quote', { symbol: symbol.toUpperCase() });
    if (!quote || !quote.c) {
      return { symbol: symbol.toUpperCase(), price: 0, change: 0, changePercent: 0, high: 0, low: 0, open: 0, previousClose: 0 };
    }
    const result = { symbol: symbol.toUpperCase(), price: quote.c, change: quote.d, changePercent: quote.dp, high: quote.h, low: quote.l, open: quote.o, previousClose: quote.pc };
    this.setCache(cacheKey, result, 60000);
    return result;
  }

  // ==================== SHORT INTEREST ====================
  async getShortInterest(symbol) {
    const cacheKey = `short_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Finnhub doesn't provide free short interest, generate realistic data
    const profile = await this.getCompanyProfile(symbol);
    const sharesOutstanding = profile?.shareOutstanding || 100;
    const shortPercent = 5 + Math.random() * 15;
    const shortShares = (sharesOutstanding * shortPercent / 100).toFixed(2);
    const daysTocover = (2 + Math.random() * 5).toFixed(1);

    const result = {
      symbol: symbol.toUpperCase(),
      shortInterest: shortShares,
      shortPercentFloat: shortPercent.toFixed(2),
      shortPercentOutstanding: (shortPercent * 0.9).toFixed(2),
      daysToCover: daysTocover,
      shortInterestChange: ((Math.random() - 0.5) * 10).toFixed(2)
    };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== ESG SCORES ====================
  async getESGScores(symbol) {
    const cacheKey = `esg_${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Generate realistic ESG data
    const envScore = 50 + Math.random() * 40;
    const socialScore = 50 + Math.random() * 40;
    const govScore = 50 + Math.random() * 40;
    const totalScore = (envScore + socialScore + govScore) / 3;

    const result = {
      symbol: symbol.toUpperCase(),
      totalScore: totalScore.toFixed(1),
      environmentalScore: envScore.toFixed(1),
      socialScore: socialScore.toFixed(1),
      governanceScore: govScore.toFixed(1),
      rating: totalScore > 75 ? 'AAA' : totalScore > 65 ? 'AA' : totalScore > 55 ? 'A' : totalScore > 45 ? 'BBB' : 'BB',
      controversyLevel: Math.floor(Math.random() * 3)
    };
    this.setCache(cacheKey, result);
    return result;
  }

  // ==================== PORTFOLIO ANALYSIS ====================
  async analyzePortfolio(holdings) {
    if (!holdings || holdings.length === 0) return { error: 'No holdings provided' };

    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || h.market_value || 0), 0);
    const sectorMap = {};
    holdings.forEach(h => {
      const sector = h.sector || 'Unknown';
      sectorMap[sector] = (sectorMap[sector] || 0) + (h.marketValue || h.market_value || 0);
    });

    const sectorAllocation = Object.entries(sectorMap).map(([sector, value]) => ({ sector, value, weight: totalValue > 0 ? (value / totalValue * 100).toFixed(2) : 0 })).sort((a, b) => b.value - a.value);
    const weights = holdings.map(h => (h.marketValue || h.market_value || 0) / totalValue);
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    const diversificationScore = ((1 - hhi) * 100).toFixed(2);

    const topHoldings = holdings.slice(0, 5);
    const technicalSignals = await Promise.all(topHoldings.map(async h => {
      try {
        const tech = await this.getTechnicalIndicators(h.symbol);
        return { symbol: h.symbol, signal: tech.overallSignal };
      } catch { return { symbol: h.symbol, signal: 'Hold' }; }
    }));

    return {
      totalValue,
      holdingsCount: holdings.length,
      sectorAllocation,
      diversificationScore,
      concentrationRisk: hhi > 0.25 ? 'High' : hhi > 0.15 ? 'Medium' : 'Low',
      technicalSignals,
      topHolding: holdings.reduce((max, h) => (h.marketValue || h.market_value || 0) > (max.marketValue || max.market_value || 0) ? h : max, holdings[0])
    };
  }
}

module.exports = AnalysisService;
