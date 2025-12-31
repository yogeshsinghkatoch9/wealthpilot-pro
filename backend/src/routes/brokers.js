/**
 * Broker Integration Routes
 * API endpoints for connecting and managing brokerage accounts
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { BrokerFactory } = require('../services/brokers/brokerFactory');
const { prisma } = require('../db/simpleDb');

// Encryption helper for credentials
const ENCRYPTION_KEY = process.env.BROKER_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// ==================== BROKER DISCOVERY ====================

/**
 * GET /api/brokers/supported
 * Get list of supported brokers
 */
router.get('/supported', (req, res) => {
  try {
    const brokers = BrokerFactory.getSupportedBrokers();
    res.json({ success: true, brokers });
  } catch (error) {
    logger.error('Error fetching supported brokers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONNECTION MANAGEMENT ====================

/**
 * GET /api/brokers/connections
 * Get all broker connections for the authenticated user
 */
router.get('/connections', authenticate, async (req, res) => {
  try {
    const connections = await prisma.brokerConnection.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        brokerType: true,
        accountId: true,
        name: true,
        isPaper: true,
        isActive: true,
        isDefault: true,
        lastSyncAt: true,
        lastError: true,
        settings: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, connections });
  } catch (error) {
    logger.error('Error fetching broker connections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brokers/connections/:id
 * Get specific broker connection
 */
router.get('/connections/:id', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      select: {
        id: true,
        brokerType: true,
        accountId: true,
        name: true,
        isPaper: true,
        isActive: true,
        isDefault: true,
        lastSyncAt: true,
        lastError: true,
        settings: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    res.json({ success: true, connection });
  } catch (error) {
    logger.error('Error fetching broker connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/brokers/connections
 * Create a new broker connection
 */
router.post('/connections', authenticate, async (req, res) => {
  try {
    const { brokerType, name, apiKey, secretKey, isPaper, settings } = req.body;

    if (!brokerType || !apiKey || !secretKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: brokerType, apiKey, secretKey'
      });
    }

    // Verify broker is supported
    const supportedBrokers = BrokerFactory.getSupportedBrokers();
    if (!supportedBrokers.find(b => b.id === brokerType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported broker: ${brokerType}`
      });
    }

    // Test connection with provided credentials
    const broker = BrokerFactory.create(brokerType, {
      apiKey,
      secretKey,
      paper: isPaper !== false
    });

    let accountInfo;
    try {
      accountInfo = await broker.connect();
      await broker.disconnect();
    } catch (connectionError) {
      return res.status(400).json({
        success: false,
        error: `Failed to connect to ${brokerType}: ${connectionError.message}`
      });
    }

    // Create connection with encrypted credentials
    const connection = await prisma.brokerConnection.create({
      data: {
        userId: req.user.id,
        brokerType: brokerType.toLowerCase(),
        accountId: accountInfo?.id || accountInfo?.account_number || null,
        name: name || `${brokerType} ${isPaper ? 'Paper' : 'Live'} Account`,
        isPaper: isPaper !== false,
        isActive: true,
        settings: settings ? JSON.stringify(settings) : null,
        credentials: {
          create: {
            encryptedApiKey: encrypt(apiKey),
            encryptedSecret: encrypt(secretKey)
          }
        }
      },
      select: {
        id: true,
        brokerType: true,
        accountId: true,
        name: true,
        isPaper: true,
        isActive: true,
        createdAt: true
      }
    });

    logger.info(`Broker connection created: ${connection.id} for user ${req.user.id}`);

    res.json({
      success: true,
      connection,
      message: `Successfully connected to ${brokerType}`
    });
  } catch (error) {
    logger.error('Error creating broker connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/brokers/connections/:id
 * Update a broker connection
 */
router.put('/connections/:id', authenticate, async (req, res) => {
  try {
    const { name, isActive, isDefault, settings } = req.body;

    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.brokerConnection.updateMany({
        where: { userId: req.user.id, id: { not: req.params.id } },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.brokerConnection.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        isDefault: isDefault !== undefined ? isDefault : undefined,
        settings: settings !== undefined ? JSON.stringify(settings) : undefined
      },
      select: {
        id: true,
        brokerType: true,
        accountId: true,
        name: true,
        isPaper: true,
        isActive: true,
        isDefault: true,
        lastSyncAt: true,
        settings: true,
        updatedAt: true
      }
    });

    res.json({ success: true, connection: updated });
  } catch (error) {
    logger.error('Error updating broker connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/brokers/connections/:id
 * Delete a broker connection
 */
router.delete('/connections/:id', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    await prisma.brokerConnection.delete({
      where: { id: req.params.id }
    });

    logger.info(`Broker connection deleted: ${req.params.id}`);

    res.json({ success: true, message: 'Connection deleted' });
  } catch (error) {
    logger.error('Error deleting broker connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ACCOUNT DATA ====================

/**
 * GET /api/brokers/connections/:id/account
 * Get account details from broker
 */
router.get('/connections/:id/account', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    if (!connection.isActive) {
      return res.status(400).json({ success: false, error: 'Connection is not active' });
    }

    // Decrypt credentials and create broker instance
    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const account = await broker.getAccount();
    await broker.disconnect();

    // Update last sync
    await prisma.brokerConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastError: null }
    });

    res.json({ success: true, account });
  } catch (error) {
    logger.error('Error fetching broker account:', error);

    // Update connection with error
    await prisma.brokerConnection.update({
      where: { id: req.params.id },
      data: { lastError: error.message }
    }).catch(() => {});

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brokers/connections/:id/positions
 * Get positions from broker
 */
router.get('/connections/:id/positions', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    if (!connection.isActive) {
      return res.status(400).json({ success: false, error: 'Connection is not active' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const positions = await broker.getPositions();
    await broker.disconnect();

    // Update last sync
    await prisma.brokerConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastError: null }
    });

    res.json({ success: true, positions });
  } catch (error) {
    logger.error('Error fetching broker positions:', error);

    await prisma.brokerConnection.update({
      where: { id: req.params.id },
      data: { lastError: error.message }
    }).catch(() => {});

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brokers/connections/:id/orders
 * Get orders from broker
 */
router.get('/connections/:id/orders', authenticate, async (req, res) => {
  try {
    const { status } = req.query;

    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    if (!connection.isActive) {
      return res.status(400).json({ success: false, error: 'Connection is not active' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const orders = await broker.getOrders(status || 'all');
    await broker.disconnect();

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('Error fetching broker orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== TRADING ====================

/**
 * POST /api/brokers/connections/:id/orders
 * Place an order through broker
 */
router.post('/connections/:id/orders', authenticate, async (req, res) => {
  try {
    const { symbol, side, quantity, orderType, limitPrice, stopPrice, timeInForce } = req.body;

    if (!symbol || !side || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, side, quantity'
      });
    }

    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    if (!connection.isActive) {
      return res.status(400).json({ success: false, error: 'Connection is not active' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const order = await broker.placeOrder({
      symbol: symbol.toUpperCase(),
      side: side.toLowerCase(),
      quantity: parseFloat(quantity),
      orderType: orderType || 'market',
      limitPrice: limitPrice ? parseFloat(limitPrice) : null,
      stopPrice: stopPrice ? parseFloat(stopPrice) : null,
      timeInForce: timeInForce || 'day'
    });

    await broker.disconnect();

    // Store order in database
    await prisma.brokerOrder.create({
      data: {
        connectionId: connection.id,
        brokerOrderId: order.id,
        symbol: symbol.toUpperCase(),
        side: side.toLowerCase(),
        quantity: parseFloat(quantity),
        orderType: orderType || 'market',
        limitPrice: limitPrice ? parseFloat(limitPrice) : null,
        stopPrice: stopPrice ? parseFloat(stopPrice) : null,
        timeInForce: timeInForce || 'day',
        status: order.status
      }
    });

    logger.info(`Order placed via ${connection.brokerType}: ${order.id}`);

    res.json({ success: true, order });
  } catch (error) {
    logger.error('Error placing broker order:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/brokers/connections/:id/orders/:orderId
 * Cancel an order through broker
 */
router.delete('/connections/:id/orders/:orderId', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const result = await broker.cancelOrder(req.params.orderId);
    await broker.disconnect();

    // Update local order record
    await prisma.brokerOrder.updateMany({
      where: {
        connectionId: connection.id,
        brokerOrderId: req.params.orderId
      },
      data: { status: 'cancelled' }
    });

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error cancelling broker order:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== MARKET DATA ====================

/**
 * GET /api/brokers/connections/:id/quote/:symbol
 * Get quote from broker
 */
router.get('/connections/:id/quote/:symbol', authenticate, async (req, res) => {
  try {
    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const quote = await broker.getQuote(req.params.symbol.toUpperCase());
    await broker.disconnect();

    res.json({ success: true, quote });
  } catch (error) {
    logger.error('Error fetching broker quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brokers/connections/:id/bars/:symbol
 * Get historical bars from broker
 */
router.get('/connections/:id/bars/:symbol', authenticate, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;

    const connection = await prisma.brokerConnection.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: { credentials: true }
    });

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    const credentials = {
      apiKey: decrypt(connection.credentials.encryptedApiKey),
      secretKey: decrypt(connection.credentials.encryptedSecret),
      paper: connection.isPaper
    };

    const broker = BrokerFactory.create(connection.brokerType, credentials);
    await broker.connect();

    const bars = await broker.getBars(
      req.params.symbol.toUpperCase(),
      timeframe || '1Day',
      parseInt(limit) || 100
    );
    await broker.disconnect();

    res.json({ success: true, bars });
  } catch (error) {
    logger.error('Error fetching broker bars:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ORDER HISTORY ====================

/**
 * GET /api/brokers/orders
 * Get all broker orders for the user (from local database)
 */
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { connectionId, symbol, status, limit, offset } = req.query;

    const where = {
      connection: { userId: req.user.id }
    };

    if (connectionId) where.connectionId = connectionId;
    if (symbol) where.symbol = symbol.toUpperCase();
    if (status) where.status = status;

    const orders = await prisma.brokerOrder.findMany({
      where,
      include: {
        connection: {
          select: {
            id: true,
            brokerType: true,
            name: true,
            isPaper: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit) || 50,
      skip: parseInt(offset) || 0
    });

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('Error fetching broker orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONNECTION TEST ====================

/**
 * POST /api/brokers/test
 * Test broker credentials without saving
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    const { brokerType, apiKey, secretKey, isPaper } = req.body;

    if (!brokerType || !apiKey || !secretKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: brokerType, apiKey, secretKey'
      });
    }

    const broker = BrokerFactory.create(brokerType, {
      apiKey,
      secretKey,
      paper: isPaper !== false
    });

    const account = await broker.connect();
    await broker.disconnect();

    res.json({
      success: true,
      message: 'Connection successful',
      account: {
        id: account.id || account.account_number,
        status: account.status,
        buyingPower: account.buying_power,
        cash: account.cash,
        portfolioValue: account.portfolio_value
      }
    });
  } catch (error) {
    logger.error('Broker test failed:', error);
    res.status(400).json({
      success: false,
      error: `Connection failed: ${error.message}`
    });
  }
});

module.exports = router;
