/**
 * Market Breadth WebSocket Service
 * Real-time streaming of market breadth data to connected clients
 */

const LiveDataFetcher = require('./LiveDataFetcher');

const logger = require('../../utils/logger');
class MarketBreadthWebSocket {
  constructor(wss, db) {
    this.wss = wss;
    this.db = db;
    this.liveDataFetcher = new LiveDataFetcher(db);
    this.updateInterval = null;
    this.subscribers = new Map(); // Track which clients want which indices
    this.lastUpdate = new Map(); // Cache last update per index

    this.init();
  }

  init() {
    logger.info('[MarketBreadthWS] Initializing WebSocket service...');

    // Start periodic updates every 30 seconds
    this.startPeriodicUpdates();

    // Listen for new WebSocket connections
    this.wss.on('connection', (ws) => {
      logger.info('[MarketBreadthWS] New client connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          logger.error('[MarketBreadthWS] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.removeSubscriber(ws);
        logger.info('[MarketBreadthWS] Client disconnected');
      });

      // Send initial connection success
      this.sendToClient(ws, {
        type: 'connected',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle incoming client messages
   */
  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'subscribe_breadth':
        this.addSubscriber(ws, data.index || 'SPY');
        // Send immediate update
        this.sendBreadthUpdate(data.index || 'SPY');
        break;

      case 'unsubscribe_breadth':
        this.removeSubscriber(ws, data.index);
        break;

      case 'request_snapshot':
        this.sendSnapshot(ws, data.index || 'SPY');
        break;

      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        logger.warn('[MarketBreadthWS] Unknown message type:', data.type);
    }
  }

  /**
   * Add subscriber for an index
   */
  addSubscriber(ws, index) {
    const indexUpper = index.toUpperCase();

    if (!this.subscribers.has(indexUpper)) {
      this.subscribers.set(indexUpper, new Set());
    }

    this.subscribers.get(indexUpper).add(ws);
    logger.debug(`[MarketBreadthWS] Client subscribed to ${indexUpper}`);
  }

  /**
   * Remove subscriber
   */
  removeSubscriber(ws, index = null) {
    if (index) {
      const indexUpper = index.toUpperCase();
      const subs = this.subscribers.get(indexUpper);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) {
          this.subscribers.delete(indexUpper);
        }
      }
    } else {
      // Remove from all indices
      this.subscribers.forEach((subs, idx) => {
        subs.delete(ws);
        if (subs.size === 0) {
          this.subscribers.delete(idx);
        }
      });
    }
  }

  /**
   * Start periodic updates
   */
  startPeriodicUpdates() {
    // Update every 30 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateAllSubscribedIndices();
    }, 30000);

    // Initial update
    setTimeout(() => this.updateAllSubscribedIndices(), 2000);

    logger.info('[MarketBreadthWS] Started periodic updates (30s interval)');
  }

  /**
   * Update all indices that have subscribers
   */
  async updateAllSubscribedIndices() {
    const indices = Array.from(this.subscribers.keys());

    for (const index of indices) {
      await this.sendBreadthUpdate(index);
    }
  }

  /**
   * Fetch and broadcast breadth update for an index
   */
  async sendBreadthUpdate(index) {
    try {
      const indexUpper = index.toUpperCase();
      logger.debug(`[MarketBreadthWS] Fetching live data for ${indexUpper}...`);

      // Fetch live breadth data
      const breadth = await this.liveDataFetcher.fetchLiveMarketBreadth(indexUpper);

      // Calculate derived metrics
      const healthScore = this.calculateHealthScore(breadth);
      const trends = this.calculateTrends(indexUpper, breadth);

      const update = {
        type: 'breadth_update',
        index: indexUpper,
        timestamp: breadth.timestamp,
        data: {
          advanceDecline: breadth.advanceDecline,
          maBreath: breadth.maBreath,
          highsLows: breadth.highsLows,
          healthScore,
          trends,
          source: breadth.source
        }
      };

      // Cache this update
      this.lastUpdate.set(indexUpper, update);

      // Broadcast to all subscribers of this index
      const subscribers = this.subscribers.get(indexUpper);
      if (subscribers && subscribers.size > 0) {
        subscribers.forEach(ws => {
          this.sendToClient(ws, update);
        });
        logger.debug(`[MarketBreadthWS] Broadcasted ${indexUpper} update to ${subscribers.size} clients`);
      }

    } catch (error) {
      logger.error(`[MarketBreadthWS] Error updating ${index}:`, error);

      // Send error to subscribers
      const subscribers = this.subscribers.get(index.toUpperCase());
      if (subscribers) {
        subscribers.forEach(ws => {
          this.sendToClient(ws, {
            type: 'error',
            index: index.toUpperCase(),
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
      }
    }
  }

  /**
   * Send snapshot of current data
   */
  sendSnapshot(ws, index) {
    const cached = this.lastUpdate.get(index.toUpperCase());
    if (cached) {
      this.sendToClient(ws, cached);
    } else {
      // Trigger a new fetch
      this.sendBreadthUpdate(index);
    }
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(breadth) {
    let score = 50; // Start neutral

    // A/D contribution (30 points)
    const adRatio = breadth.advanceDecline.adRatio;
    if (adRatio > 2) score += 30;
    else if (adRatio > 1.5) score += 20;
    else if (adRatio > 1) score += 10;
    else if (adRatio < 0.5) score -= 30;
    else if (adRatio < 0.75) score -= 20;
    else if (adRatio < 1) score -= 10;

    // MA Breadth contribution (40 points)
    const ma50Pct = parseFloat(breadth.maBreath.ma50.percentage);
    const ma200Pct = parseFloat(breadth.maBreath.ma200.percentage);
    const avgMA = (ma50Pct + ma200Pct) / 2;

    if (avgMA > 70) score += 20;
    else if (avgMA > 55) score += 10;
    else if (avgMA < 30) score -= 20;
    else if (avgMA < 45) score -= 10;

    // Highs/Lows contribution (30 points)
    const hlIndex = breadth.highsLows.hlIndex;
    if (hlIndex > 20) score += 15;
    else if (hlIndex > 10) score += 10;
    else if (hlIndex > 5) score += 5;
    else if (hlIndex < -20) score -= 15;
    else if (hlIndex < -10) score -= 10;
    else if (hlIndex < -5) score -= 5;

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    let signal = 'NEUTRAL';
    if (score >= 70) signal = 'BULLISH';
    else if (score >= 55) signal = 'MODERATELY_BULLISH';
    else if (score <= 30) signal = 'BEARISH';
    else if (score <= 45) signal = 'MODERATELY_BEARISH';

    return {
      score: Math.round(score),
      signal,
      components: {
        advanceDecline: Math.round((adRatio - 1) * 30),
        maBreadth: Math.round((avgMA - 50) / 2),
        highsLows: Math.round(hlIndex / 2)
      }
    };
  }

  /**
   * Calculate trends (compare to previous data)
   */
  calculateTrends(index, currentBreadth) {
    // Get historical data from last hour for trend
    const stmt = this.db.prepare(`
      SELECT * FROM market_advance_decline
      WHERE index_symbol = ?
      ORDER BY date DESC
      LIMIT 5
    `);

    const historical = stmt.all(index);

    let adTrend = 'stable';
    if (historical.length > 0) {
      const prevAdRatio = historical[0].ad_ratio;
      const currentAdRatio = currentBreadth.advanceDecline.adRatio;

      if (currentAdRatio > prevAdRatio * 1.1) adTrend = 'improving';
      else if (currentAdRatio < prevAdRatio * 0.9) adTrend = 'weakening';
    }

    return {
      advanceDecline: adTrend,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send data to a specific client
   */
  sendToClient(ws, data) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(data) {
    this.wss.clients.forEach(client => {
      this.sendToClient(client, data);
    });
  }

  /**
   * Stop periodic updates
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('[MarketBreadthWS] Stopped periodic updates');
    }
  }
}

module.exports = MarketBreadthWebSocket;
