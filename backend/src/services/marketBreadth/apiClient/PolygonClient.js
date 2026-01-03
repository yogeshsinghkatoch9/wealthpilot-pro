/**
 * Polygon.io API Client
 * Provides high-frequency tick data and real-time updates
 */

const BaseAPIClient = require('./BaseAPIClient');
const config = require('../../../config/marketBreadthConfig');
const WebSocket = require('ws');

const logger = require('../../../utils/logger');
class PolygonClient extends BaseAPIClient {
  constructor() {
    super({
      providerName: 'Polygon',
      baseUrl: config.apiUrls.polygon,
      apiKey: config.apiKeys.polygon,
      requestsPerMinute: config.rateLimits.polygon,
      timeout: 10000
    });

    this.ws = null;
    this.wsSubscriptions = new Set();
    this.wsCallbacks = new Map();
  }

  /**
   * Get aggregates (bars) for a symbol
   */
  async getAggregates(symbol, multiplier, timespan, from, to) {
    const endpoint = `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=desc&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || [];
  }

  /**
   * Get previous day's data
   */
  async getPreviousClose(symbol) {
    const endpoint = `/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results && data.results[0] ? data.results[0] : null;
  }

  /**
   * Get snapshot - all tickers
   */
  async getSnapshotAllTickers() {
    const endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get snapshot - single ticker
   */
  async getSnapshotTicker(symbol) {
    const endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get gainers/losers
   */
  async getGainersLosers(direction = 'gainers') {
    const endpoint = `/v2/snapshot/locale/us/markets/stocks/${direction}?apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.tickers || [];
  }

  /**
   * Get market status
   */
  async getMarketStatus() {
    const endpoint = `/v1/marketstatus/now?apiKey=${this.apiKey}`;
    return await this.get(endpoint);
  }

  /**
   * Get grouped daily bars (all tickers)
   */
  async getGroupedDaily(date) {
    const endpoint = `/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || [];
  }

  /**
   * Get ticker details
   */
  async getTickerDetails(symbol) {
    const endpoint = `/v3/reference/tickers/${symbol}?apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || null;
  }

  /**
   * Get all tickers
   */
  async getAllTickers(market = 'stocks', limit = 1000) {
    const endpoint = `/v3/reference/tickers?market=${market}&active=true&limit=${limit}&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || [];
  }

  /**
   * Get trades (tick data)
   */
  async getTrades(symbol, timestamp, limit = 50000) {
    const endpoint = `/v3/trades/${symbol}?timestamp=${timestamp}&order=desc&limit=${limit}&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || [];
  }

  /**
   * Get quotes
   */
  async getQuotes(symbol, timestamp, limit = 50000) {
    const endpoint = `/v3/quotes/${symbol}?timestamp=${timestamp}&order=desc&limit=${limit}&apiKey=${this.apiKey}`;
    const data = await this.get(endpoint);

    return data.results || [];
  }

  /**
   * Calculate TICK index from real-time data
   */
  async calculateTickIndex(symbols) {
    const snapshots = await Promise.all(
      symbols.map(symbol => this.getSnapshotTicker(symbol).catch(() => null))
    );

    let upticks = 0;
    let downticks = 0;

    snapshots.forEach(snapshot => {
      if (snapshot && snapshot.ticker) {
        const change = snapshot.ticker.todaysChange || 0;
        if (change > 0) upticks++;
        else if (change < 0) downticks++;
      }
    });

    return {
      tickValue: upticks - downticks,
      upticks,
      downticks,
      total: upticks + downticks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate TRIN (Arms Index)
   */
  async calculateTRIN(symbols) {
    const snapshots = await Promise.all(
      symbols.map(symbol => this.getSnapshotTicker(symbol).catch(() => null))
    );

    let advancing = 0;
    let declining = 0;
    let advancingVolume = 0;
    let decliningVolume = 0;

    snapshots.forEach(snapshot => {
      if (snapshot && snapshot.ticker) {
        const change = snapshot.ticker.todaysChange || 0;
        const volume = snapshot.day?.v || 0;

        if (change > 0) {
          advancing++;
          advancingVolume += volume;
        } else if (change < 0) {
          declining++;
          decliningVolume += volume;
        }
      }
    });

    const adRatio = declining > 0 ? advancing / declining : 0;
    const volRatio = decliningVolume > 0 ? advancingVolume / decliningVolume : 0;
    const trin = volRatio > 0 ? adRatio / volRatio : 0;

    return {
      trinValue: trin,
      advancing,
      declining,
      advancingVolume,
      decliningVolume,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Initialize WebSocket connection for real-time data
   */
  connectWebSocket(onMessage, onError) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.info('[Polygon] WebSocket already connected');
      return;
    }

    const wsUrl = 'wss://socket.polygon.io/stocks';
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      logger.info('[Polygon] WebSocket connected');

      // Authenticate
      this.ws.send(JSON.stringify({
        action: 'auth',
        params: this.apiKey
      }));
    });

    this.ws.on('message', (data) => {
      try {
        const messages = JSON.parse(data);
        if (Array.isArray(messages)) {
          messages.forEach(msg => {
            if (msg.ev === 'status' && msg.status === 'auth_success') {
              logger.info('[Polygon] WebSocket authenticated');
              this.resubscribeAll();
            } else if (onMessage) {
              onMessage(msg);
            }
          });
        }
      } catch (error) {
        logger.error('[Polygon] WebSocket message parse error:', error);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('[Polygon] WebSocket error:', error);
      if (onError) onError(error);
    });

    this.ws.on('close', () => {
      logger.info('[Polygon] WebSocket closed');
      // Attempt reconnection after delay
      setTimeout(() => this.connectWebSocket(onMessage, onError), 5000);
    });
  }

  /**
   * Subscribe to ticker updates
   */
  subscribeTicker(symbol) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('[Polygon] WebSocket not connected');
      return;
    }

    const subscription = `T.${symbol}`;
    this.wsSubscriptions.add(subscription);

    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: subscription
    }));

    logger.debug(`[Polygon] Subscribed to ${subscription}`);
  }

  /**
   * Unsubscribe from ticker
   */
  unsubscribeTicker(symbol) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscription = `T.${symbol}`;
    this.wsSubscriptions.delete(subscription);

    this.ws.send(JSON.stringify({
      action: 'unsubscribe',
      params: subscription
    }));

    logger.debug(`[Polygon] Unsubscribed from ${subscription}`);
  }

  /**
   * Resubscribe to all tickers (after reconnection)
   */
  resubscribeAll() {
    if (this.wsSubscriptions.size > 0) {
      logger.debug(`[Polygon] Resubscribing to ${this.wsSubscriptions.size} subscriptions`);
      this.wsSubscriptions.forEach(subscription => {
        this.ws.send(JSON.stringify({
          action: 'subscribe',
          params: subscription
        }));
      });
    }
  }

  /**
   * Close WebSocket connection
   */
  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.wsSubscriptions.clear();
      logger.info('[Polygon] WebSocket disconnected');
    }
  }

  /**
   * Parse API response (override)
   */
  parseResponse(data) {
    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Unknown Polygon API error');
    }

    if (data.status === 'NOT_FOUND') {
      throw new Error(`Resource not found: ${data.request_id}`);
    }

    return data;
  }
}

module.exports = PolygonClient;
