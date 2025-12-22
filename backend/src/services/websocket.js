/**
 * WealthPilot Pro - WebSocket Service
 * Real-time updates for quotes, alerts, and portfolio changes
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db/simpleDb');

const logger = require('../utils/logger');
// JWT Secret - must be set in production
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-only-insecure-key' : (() => { throw new Error('JWT_SECRET required in production'); })());

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.clients = new Map(); // Map<userId, Set<WebSocket>>
    this.subscriptions = new Map(); // Map<symbol, Set<WebSocket>>
    this.moversSubscriptions = new Set(); // Set of clients subscribed to market movers

    this.setupHandlers();
    this.startHeartbeat();
    this.startQuoteUpdates();
    this.startMoversUpdates();

    logger.debug('✅ WebSocket server initialized');
  }

  setupHandlers() {
    this.wss.on('connection', (ws, req) => {
      logger.debug('WebSocket client connected');
      
      ws.isAlive = true;
      ws.userId = null;
      ws.subscribedSymbols = new Set();

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (message) => {
        this.handleMessage(ws, message);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        logger.error('WebSocket error:', err);
      });

      // Send welcome message
      this.send(ws, { type: 'connected', message: 'WebSocket connected' });
    });
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'auth':
          this.handleAuth(ws, data.token);
          break;
        case 'subscribe':
          this.handleSubscribe(ws, data.symbols);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, data.symbols);
          break;
        case 'subscribe_breadth':
          this.handleBreadthSubscribe(ws, data.index);
          break;
        case 'unsubscribe_breadth':
          this.handleBreadthUnsubscribe(ws, data.index);
          break;
        case 'subscribe_movers':
          this.handleMoversSubscribe(ws);
          break;
        case 'unsubscribe_movers':
          this.handleMoversUnsubscribe(ws);
          break;
        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          logger.debug('Unknown message type:', data.type);
      }
    } catch (err) {
      logger.error('Failed to parse WebSocket message:', err);
    }
  }

  async handleAuth(ws, token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      ws.userId = decoded.userId;

      // Add to clients map
      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId).add(ws);

      // Get user's holdings and auto-subscribe using Prisma
      const holdings = await prisma.holding.findMany({
        where: {
          portfolio: { userId: ws.userId }
        },
        select: { symbol: true },
        distinct: ['symbol']
      });

      const symbols = holdings.map(h => h.symbol);

      if (symbols.length > 0) {
        this.handleSubscribe(ws, symbols);
      }

      this.send(ws, {
        type: 'authenticated',
        userId: ws.userId,
        subscribedSymbols: Array.from(ws.subscribedSymbols)
      });

      logger.debug(`User ${ws.userId} authenticated via WebSocket`);
    } catch (err) {
      logger.error('WebSocket auth error:', err.message);
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
    }
  }

  handleSubscribe(ws, symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];
    
    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();
      
      // Add to client's subscriptions
      ws.subscribedSymbols.add(upperSymbol);
      
      // Add to global subscriptions map
      if (!this.subscriptions.has(upperSymbol)) {
        this.subscriptions.set(upperSymbol, new Set());
      }
      this.subscriptions.get(upperSymbol).add(ws);
    }
    
    this.send(ws, { 
      type: 'subscribed', 
      symbols: Array.from(ws.subscribedSymbols) 
    });
  }

  handleUnsubscribe(ws, symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];
    
    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();
      
      ws.subscribedSymbols.delete(upperSymbol);
      
      if (this.subscriptions.has(upperSymbol)) {
        this.subscriptions.get(upperSymbol).delete(ws);
      }
    }
    
    this.send(ws, { 
      type: 'unsubscribed', 
      symbols: Array.from(ws.subscribedSymbols) 
    });
  }

  handleDisconnect(ws) {
    // Remove from clients map
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
      }
    }

    // Remove from subscriptions
    for (const symbol of ws.subscribedSymbols) {
      if (this.subscriptions.has(symbol)) {
        this.subscriptions.get(symbol).delete(ws);
      }
    }

    // Remove from breadth subscriptions
    if (ws.breadthSubscriptions) {
      ws.breadthSubscriptions.forEach(index => {
        const subs = this.breadthSubscriptions?.get(index);
        if (subs) {
          subs.delete(ws);
        }
      });
    }

    // Remove from movers subscriptions
    this.moversSubscriptions.delete(ws);

    logger.debug('WebSocket client disconnected');
  }

  // Send message to single client
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Broadcast to all clients subscribed to a symbol
  broadcastQuote(symbol, quote) {
    const subscribers = this.subscriptions.get(symbol.toUpperCase());
    if (!subscribers) return;
    
    const message = JSON.stringify({
      type: 'quote',
      symbol: symbol.toUpperCase(),
      data: quote,
      timestamp: Date.now()
    });
    
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Broadcast to specific user
  broadcastToUser(userId, data) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;
    
    const message = JSON.stringify(data);
    
    for (const ws of userClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Broadcast alert trigger
  broadcastAlert(userId, alert) {
    this.broadcastToUser(userId, {
      type: 'alert',
      alert,
      timestamp: Date.now()
    });
  }

  // Broadcast portfolio update
  broadcastPortfolioUpdate(userId, portfolio) {
    this.broadcastToUser(userId, {
      type: 'portfolio_update',
      portfolio,
      timestamp: Date.now()
    });
  }

  // Heartbeat to detect dead connections
  startHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds
  }

  // Periodic quote updates - LIVE REAL DATA
  startQuoteUpdates() {
    const MarketDataService = require('./marketData');

    setInterval(async () => {
      // Get all subscribed symbols
      const symbols = Array.from(this.subscriptions.keys());
      if (symbols.length === 0) return;

      logger.debug(`📈 Fetching LIVE quotes for ${symbols.length} subscribed symbols...`);

      // Fetch quotes in batches to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        try {
          // Fetch REAL LIVE quotes from market data service
          const quotes = await MarketDataService.getQuotes(batch);

          // Broadcast each quote to subscribers
          for (const quote of quotes) {
            if (quote && quote.symbol) {
              this.broadcastQuote(quote.symbol, {
                symbol: quote.symbol,
                name: quote.name,
                price: quote.price,
                previousClose: quote.previousClose,
                change: quote.price - quote.previousClose,
                changePercent: ((quote.price - quote.previousClose) / quote.previousClose) * 100,
                volume: quote.volume,
                marketCap: quote.marketCap,
                pe: quote.pe,
                high: quote.high,
                low: quote.low,
                open: quote.open,
                lastUpdated: new Date().toISOString()
              });
            }
          }
        } catch (err) {
          logger.error('Failed to fetch quotes for batch:', err.message);
        }

        // Rate limit between batches (1 second delay)
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Also check price alerts
      await this.checkAlerts();
    }, 15000); // Every 15 seconds (to respect API rate limits)
  }

  // Check alerts against LIVE current prices
  async checkAlerts() {
    try {
      const MarketDataService = require('./marketData');

      // Get all active alerts from database
      const db = require('../db/database');
      const activeAlerts = db.all(`
        SELECT * FROM alerts
        WHERE is_active = 1
        AND (triggered_at IS NULL OR triggered_at < datetime('now', '-1 hour'))
      `);

      if (activeAlerts.length === 0) return;

      // Get unique symbols from alerts
      const symbols = [...new Set(activeAlerts.map(a => a.symbol))];

      // Fetch LIVE quotes for all alert symbols
      const quotes = await MarketDataService.getQuotes(symbols);
      const quoteMap = new Map(quotes.map(q => [q.symbol, q]));

      // Check each alert against live price
      for (const alert of activeAlerts) {
        const quote = quoteMap.get(alert.symbol);
        if (!quote) continue;

        const price = Number(quote.price);
        const changePercent = Math.abs(((price - quote.previousClose) / quote.previousClose) * 100);
        let triggered = false;

        // Check trigger conditions based on alert type
        if (alert.condition === 'above' && price >= alert.target_value) {
          triggered = true;
        } else if (alert.condition === 'below' && price <= alert.target_value) {
          triggered = true;
        } else if (alert.alert_type === 'percent_change' && changePercent >= alert.target_value) {
          triggered = true;
        }

        if (triggered) {
          // Mark alert as triggered in database
          db.run(`
            UPDATE alerts
            SET triggered_at = datetime('now'), is_active = 0
            WHERE id = ?
          `, [alert.id]);

          // Record in alert history
          db.run(`
            INSERT INTO alert_history (id, alert_id, user_id, symbol, message, trigger_price, triggered_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            require('uuid').v4(),
            alert.id,
            alert.user_id,
            alert.symbol,
            alert.message || `${alert.symbol} ${alert.condition} $${alert.target_value}`,
            price
          ]);

          // Broadcast alert to user via WebSocket
          this.broadcastAlert(alert.user_id, {
            id: alert.id,
            symbol: alert.symbol,
            condition: alert.condition,
            targetValue: alert.target_value,
            currentPrice: price,
            message: alert.message || `${alert.symbol} alert triggered at $${price.toFixed(2)}`,
            triggeredAt: new Date().toISOString()
          });

          logger.debug(`🔔 Alert triggered: ${alert.symbol} ${alert.condition} ${alert.target_value} (current: $${price})`);
        }
      }
    } catch (err) {
      logger.error('Alert check error:', err);
    }
  }

  // ============================================================================
  // MARKET BREADTH SUBSCRIPTION HANDLERS
  // ============================================================================

  /**
   * Handle market breadth subscription
   */
  handleBreadthSubscribe(ws, index = 'SPY') {
    const indexUpper = index.toUpperCase();

    if (!ws.breadthSubscriptions) {
      ws.breadthSubscriptions = new Set();
    }

    ws.breadthSubscriptions.add(indexUpper);

    // Add to global breadth subscriptions map
    if (!this.breadthSubscriptions) {
      this.breadthSubscriptions = new Map();
    }

    if (!this.breadthSubscriptions.has(indexUpper)) {
      this.breadthSubscriptions.set(indexUpper, new Set());
    }

    this.breadthSubscriptions.get(indexUpper).add(ws);

    logger.debug(`[WS] Client subscribed to market breadth: ${indexUpper}`);

    // Send immediate update if available
    if (this.lastBreadthUpdate && this.lastBreadthUpdate.has(indexUpper)) {
      this.send(ws, this.lastBreadthUpdate.get(indexUpper));
    }
  }

  /**
   * Handle market breadth unsubscription
   */
  handleBreadthUnsubscribe(ws, index) {
    if (!index) {
      // Unsubscribe from all
      if (ws.breadthSubscriptions) {
        ws.breadthSubscriptions.forEach(idx => {
          const subs = this.breadthSubscriptions?.get(idx);
          if (subs) {
            subs.delete(ws);
          }
        });
        ws.breadthSubscriptions.clear();
      }
    } else {
      const indexUpper = index.toUpperCase();
      if (ws.breadthSubscriptions) {
        ws.breadthSubscriptions.delete(indexUpper);
      }

      const subs = this.breadthSubscriptions?.get(indexUpper);
      if (subs) {
        subs.delete(ws);
      }
    }

    logger.debug(`[WS] Client unsubscribed from market breadth: ${index || 'ALL'}`);
  }

  /**
   * Broadcast market breadth update
   */
  broadcastBreadthUpdate(index, data) {
    const indexUpper = index.toUpperCase();

    // Cache this update
    if (!this.lastBreadthUpdate) {
      this.lastBreadthUpdate = new Map();
    }

    const update = {
      type: 'breadth_update',
      index: indexUpper,
      data,
      timestamp: new Date().toISOString()
    };

    this.lastBreadthUpdate.set(indexUpper, update);

    // Broadcast to subscribers
    const subscribers = this.breadthSubscriptions?.get(indexUpper);
    if (subscribers && subscribers.size > 0) {
      let sent = 0;
      subscribers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, update);
          sent++;
        }
      });
      logger.debug(`[WS] Broadcasted ${indexUpper} breadth update to ${sent} clients`);
    }
  }

  // ============================================================================
  // MARKET MOVERS SUBSCRIPTION HANDLERS
  // ============================================================================

  /**
   * Handle market movers subscription
   */
  handleMoversSubscribe(ws) {
    this.moversSubscriptions.add(ws);
    logger.debug(`[WS] Client subscribed to market movers (${this.moversSubscriptions.size} total)`);

    // Send immediate update if available
    if (this.lastMoversUpdate) {
      this.send(ws, this.lastMoversUpdate);
    }
  }

  /**
   * Handle market movers unsubscription
   */
  handleMoversUnsubscribe(ws) {
    this.moversSubscriptions.delete(ws);
    logger.debug(`[WS] Client unsubscribed from market movers (${this.moversSubscriptions.size} remaining)`);
  }

  /**
   * Broadcast market movers update
   */
  broadcastMoversUpdate(data) {
    // Cache this update
    this.lastMoversUpdate = {
      type: 'movers_update',
      data,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all subscribers
    if (this.moversSubscriptions.size > 0) {
      let sent = 0;
      this.moversSubscriptions.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, this.lastMoversUpdate);
          sent++;
        }
      });
      logger.debug(`[WS] Broadcasted market movers update to ${sent} clients`);
    }
  }

  /**
   * Start periodic market movers updates
   */
  startMoversUpdates() {
    setInterval(async () => {
      // Only fetch if there are subscribers
      if (this.moversSubscriptions.size === 0) return;

      try {
        const axios = require('axios');

        // Comprehensive list of stocks (same as API endpoint)
        const symbols = [
          // FAANG + Tech Giants
          'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
          'NFLX', 'AMD', 'INTC', 'CRM', 'ORCL', 'CSCO', 'ADBE', 'AVGO',
          'TXN', 'QCOM', 'INTU', 'NOW', 'SNOW', 'MU', 'AMAT', 'LRCX',

          // Financial Services
          'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'V', 'MA', 'PYPL', 'SQ', 'COIN',

          // Healthcare
          'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'LLY', 'MRK', 'ABT', 'AMGN', 'GILD',

          // Consumer
          'WMT', 'HD', 'COST', 'LOW', 'TGT', 'SBUX', 'NKE', 'MCD', 'PEP', 'KO', 'PG',

          // Industrials
          'BA', 'CAT', 'DE', 'GE', 'HON', 'UPS', 'LMT', 'RTX', 'MMM', 'FDX',

          // Energy
          'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX',

          // Communication
          'DIS', 'CMCSA', 'T', 'VZ', 'TMUS',

          // EV & Auto
          'F', 'GM', 'RIVN', 'LCID', 'NIO',

          // Cloud & SaaS
          'TEAM', 'WDAY', 'DDOG', 'NET', 'ZS', 'CRWD', 'TWLO', 'ZM',

          // Crypto & Meme
          'MSTR', 'RIOT', 'MARA', 'PLTR', 'RBLX', 'GME', 'AMC',

          // Other Popular
          'UBER', 'LYFT', 'DASH', 'ABNB', 'SHOP', 'BABA', 'DKNG'
        ];

        // Fetch live quotes from Yahoo Finance
        const quotesArray = [];
        for (const symbol of symbols) {
          try {
            const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
              params: { interval: '1d', range: '2d' },
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const quote = response.data.chart.result[0];
            if (quote && quote.meta && quote.indicators.quote[0]) {
              const current = quote.meta.regularMarketPrice;
              const previous = quote.meta.previousClose || quote.meta.chartPreviousClose;

              quotesArray.push({
                symbol: quote.meta.symbol,
                name: quote.meta.shortName || quote.meta.symbol,
                price: current,
                previousClose: previous,
                volume: quote.meta.regularMarketVolume || 0
              });
            }
          } catch (err) {
            // Skip failed symbols
          }
        }

        const quotes = quotesArray;

        // Calculate changes and sort
        const quotesWithChange = quotes
          .filter(q => q && q.price && q.previousClose)
          .map(q => ({
            symbol: q.symbol,
            name: q.name || q.symbol,
            price: q.price,
            change: q.price - q.previousClose,
            changePercent: ((q.price - q.previousClose) / q.previousClose) * 100,
            volume: q.volume || 0
          }));

        // Sort for gainers (top 20 by % change)
        const gainers = quotesWithChange
          .filter(q => q.changePercent > 0)
          .sort((a, b) => b.changePercent - a.changePercent)
          .slice(0, 20)
          .map(q => ({
            symbol: q.symbol,
            name: q.name,
            price: Number(q.price.toFixed(2)),
            change: Number(q.change.toFixed(2)),
            changePercent: Number(q.changePercent.toFixed(2))
          }));

        // Sort for losers (top 20 by % change, negative)
        const losers = quotesWithChange
          .filter(q => q.changePercent < 0)
          .sort((a, b) => a.changePercent - b.changePercent)
          .slice(0, 20)
          .map(q => ({
            symbol: q.symbol,
            name: q.name,
            price: Number(q.price.toFixed(2)),
            change: Number(q.change.toFixed(2)),
            changePercent: Number(q.changePercent.toFixed(2))
          }));

        // Sort for most active (top 20 by volume)
        const active = quotesWithChange
          .filter(q => q.volume > 0)
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 20)
          .map(q => ({
            symbol: q.symbol,
            name: q.name,
            price: Number(q.price.toFixed(2)),
            volume: q.volume,
            changePercent: Number(q.changePercent.toFixed(2))
          }));

        // Broadcast the update
        this.broadcastMoversUpdate({
          gainers,
          losers,
          active,
          lastUpdated: new Date().toISOString()
        });

        logger.debug(`📊 Market movers updated: ${gainers.length} gainers, ${losers.length} losers, ${active.length} active`);

      } catch (err) {
        logger.error('[WS] Market movers update error:', err);
      }
    }, 30000); // Every 30 seconds

    logger.debug('✅ Market movers WebSocket updates started (30s interval)');
  }

  // Get connection stats
  getStats() {
    return {
      totalConnections: this.wss.clients.size,
      authenticatedUsers: this.clients.size,
      subscribedSymbols: this.subscriptions.size,
      breadthSubscriptions: this.breadthSubscriptions?.size || 0,
      moversSubscriptions: this.moversSubscriptions.size,
      symbolSubscriptions: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([symbol, clients]) => [symbol, clients.size])
      )
    };
  }
}


module.exports = WebSocketService;
