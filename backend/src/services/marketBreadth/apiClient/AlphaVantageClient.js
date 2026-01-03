/**
 * Alpha Vantage API Client
 * Provides technical indicators and basic breadth data
 */

const BaseAPIClient = require('./BaseAPIClient');
const config = require('../../../config/marketBreadthConfig');

const logger = require('../../../utils/logger');
class AlphaVantageClient extends BaseAPIClient {
  constructor() {
    super({
      providerName: 'AlphaVantage',
      baseUrl: config.apiUrls.alphaVantage,
      apiKey: config.apiKeys.alphaVantage,
      requestsPerMinute: config.rateLimits.alphaVantage,
      timeout: 15000
    });
  }

  /**
   * Get intraday data
   */
  async getIntradayData(symbol, interval = '5min', outputSize = 'compact') {
    const params = {
      function: 'TIME_SERIES_INTRADAY',
      symbol,
      interval,
      outputsize: outputSize,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseTimeSeriesIntraday(data, interval);
  }

  /**
   * Get daily data
   */
  async getDailyData(symbol, outputSize = 'full') {
    const params = {
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol,
      outputsize: outputSize,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseTimeSeriesDaily(data);
  }

  /**
   * Get SMA (Simple Moving Average)
   */
  async getSMA(symbol, interval = 'daily', timePeriod = 50, seriesType = 'close') {
    const params = {
      function: 'SMA',
      symbol,
      interval,
      time_period: timePeriod,
      series_type: seriesType,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseIndicatorData(data);
  }

  /**
   * Get EMA (Exponential Moving Average)
   */
  async getEMA(symbol, interval = 'daily', timePeriod = 50, seriesType = 'close') {
    const params = {
      function: 'EMA',
      symbol,
      interval,
      time_period: timePeriod,
      series_type: seriesType,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseIndicatorData(data);
  }

  /**
   * Get RSI (Relative Strength Index)
   */
  async getRSI(symbol, interval = 'daily', timePeriod = 14, seriesType = 'close') {
    const params = {
      function: 'RSI',
      symbol,
      interval,
      time_period: timePeriod,
      series_type: seriesType,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseIndicatorData(data);
  }

  /**
   * Get MACD
   */
  async getMACD(symbol, interval = 'daily', seriesType = 'close') {
    const params = {
      function: 'MACD',
      symbol,
      interval,
      series_type: seriesType,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseIndicatorData(data);
  }

  /**
   * Get quote endpoint (real-time price)
   */
  async getQuote(symbol) {
    const params = {
      function: 'GLOBAL_QUOTE',
      symbol,
      apikey: this.apiKey
    };

    const data = await this.get('', params);
    return this.parseQuote(data);
  }

  /**
   * Batch quote request (multiple symbols)
   */
  async getBatchQuotes(symbols) {
    // Alpha Vantage doesn't support batch quotes, so we do sequential requests
    // with rate limiting
    const quotes = [];

    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
      } catch (error) {
        logger.error(`Error fetching quote for ${symbol}:`, error.message);
        quotes.push({ symbol, error: error.message });
      }
    }

    return quotes;
  }

  /**
   * Parse intraday time series
   */
  parseTimeSeriesIntraday(data, interval) {
    const key = `Time Series (${interval})`;
    const timeSeries = data[key];

    if (!timeSeries) {
      throw new Error('Invalid intraday data format');
    }

    return Object.entries(timeSeries).map(([timestamp, values]) => ({
      timestamp,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'])
    }));
  }

  /**
   * Parse daily time series
   */
  parseTimeSeriesDaily(data) {
    const timeSeries = data['Time Series (Daily)'];

    if (!timeSeries) {
      throw new Error('Invalid daily data format');
    }

    return Object.entries(timeSeries).map(([date, values]) => ({
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      adjustedClose: parseFloat(values['5. adjusted close']),
      volume: parseInt(values['6. volume']),
      dividendAmount: parseFloat(values['7. dividend amount']),
      splitCoefficient: parseFloat(values['8. split coefficient'])
    }));
  }

  /**
   * Parse technical indicator data
   */
  parseIndicatorData(data) {
    const metaData = data['Meta Data'];
    const indicatorKey = Object.keys(data).find(key => key.startsWith('Technical Analysis'));

    if (!indicatorKey) {
      throw new Error('Invalid indicator data format');
    }

    const indicator = data[indicatorKey];

    return {
      meta: {
        symbol: metaData['1: Symbol'],
        indicator: metaData['2: Indicator'],
        lastRefreshed: metaData['3: Last Refreshed']
      },
      data: Object.entries(indicator).map(([timestamp, values]) => ({
        timestamp,
        ...Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key.replace(/^\d+\.\s*/, ''),
            parseFloat(value)
          ])
        )
      }))
    };
  }

  /**
   * Parse quote data
   */
  parseQuote(data) {
    const quote = data['Global Quote'];

    if (!quote) {
      throw new Error('Invalid quote data format');
    }

    return {
      symbol: quote['01. symbol'],
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      price: parseFloat(quote['05. price']),
      volume: parseInt(quote['06. volume']),
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', ''))
    };
  }

  /**
   * Parse API response (override)
   */
  parseResponse(data) {
    // Check for error messages
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    if (data['Note']) {
      // API call frequency limit reached
      throw new Error(`Rate limit exceeded: ${data['Note']}`);
    }

    if (data['Information']) {
      // Premium endpoint or other info message
      throw new Error(`API Info: ${data['Information']}`);
    }

    return data;
  }
}

module.exports = AlphaVantageClient;
