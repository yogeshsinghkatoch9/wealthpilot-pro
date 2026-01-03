// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const path = require('path');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');


class PriceAlertsService {
  constructor() {
    this.wsService = null;
    this.initializeTable();
  }

  setWebSocketService(wsService) {
    this.wsService = wsService;
    logger.info('WebSocket connected to price alerts');
  }

  initializeTable() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        condition TEXT NOT NULL,
        target_price REAL NOT NULL,
        current_price REAL,
        triggered INTEGER DEFAULT 0,
        triggered_at TEXT,
        message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    logger.info('Price alerts table initialized');
  }

  createAlert(userId, symbol, condition, targetPrice, message) {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO price_alerts (id, user_id, symbol, condition, target_price, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(id, userId, symbol.toUpperCase(), condition, targetPrice, message || '');
      logger.info(`Alert created: ${symbol} ${condition} ${targetPrice}`);
      return { id, symbol, condition, targetPrice, message };
    } catch (error) {
      logger.error('Error creating alert:', error);
      throw error;
    }
  }

  getUserAlerts(userId, includeTriggered = false) {
    const query = `
      SELECT * FROM price_alerts
      WHERE user_id = ? ${includeTriggered ? '' : 'AND triggered = 0'}
      ORDER BY created_at DESC
    `;
    return db.prepare(query).all(userId);
  }

  deleteAlert(alertId, userId) {
    const stmt = db.prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?');
    const result = stmt.run(alertId, userId);
    return result.changes > 0;
  }

  checkAlerts(symbol, currentPrice) {
    const alerts = db.prepare(`
      SELECT * FROM price_alerts
      WHERE symbol = ? AND triggered = 0
    `).all(symbol.toUpperCase());

    const triggered = [];

    for (const alert of alerts) {
      let shouldTrigger = false;

      switch (alert.condition) {
        case 'above':
          shouldTrigger = currentPrice > alert.target_price;
          break;
        case 'below':
          shouldTrigger = currentPrice < alert.target_price;
          break;
        case 'equals':
          shouldTrigger = Math.abs(currentPrice - alert.target_price) < 0.01;
          break;
      }

      if (shouldTrigger) {
        this.triggerAlert(alert.id, currentPrice);
        triggered.push({
          ...alert,
          currentPrice,
          triggeredAt: new Date().toISOString()
        });
      }
    }

    return triggered;
  }

  triggerAlert(alertId, currentPrice) {
    const stmt = db.prepare(`
      UPDATE price_alerts
      SET triggered = 1, current_price = ?, triggered_at = ?
      WHERE id = ?
    `);

    stmt.run(currentPrice, new Date().toISOString(), alertId);
    logger.info(`Alert triggered: ${alertId} at price ${currentPrice}`);
  }

  broadcastAlert(alert) {
    if (!this.wsService) return;

    this.wsService.broadcastToUser(alert.user_id, {
      type: 'alert',
      alert: {
        id: alert.id,
        symbol: alert.symbol,
        condition: alert.condition,
        targetPrice: alert.target_price,
        currentPrice: alert.currentPrice,
        message: alert.message || `${alert.symbol} is ${alert.condition} $${alert.target_price}`,
        triggeredAt: alert.triggeredAt
      }
    });

    logger.info(`Broadcasted alert to user ${alert.user_id}`);
  }
}

const priceAlertsService = new PriceAlertsService();
module.exports = priceAlertsService;
