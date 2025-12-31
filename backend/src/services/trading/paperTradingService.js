/**
 * Paper Trading Service
 * Full simulation engine for virtual trading with real market data
 */

const prisma = require('../../db/prisma');
const logger = require('../../utils/logger');
const MarketDataService = require('../marketDataService');

const marketData = new MarketDataService(process.env.ALPHA_VANTAGE_API_KEY);

class PaperTradingService {
  constructor() {
    this.defaultBalance = 100000; // $100k starting balance
    this.orderMatchingInterval = null;
  }

  // ==================== ACCOUNT MANAGEMENT ====================

  /**
   * Get or create paper trading account for user
   */
  async getAccount(userId) {
    let account = await prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: true,
        orders: {
          where: { status: { in: ['pending', 'partial'] } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!account) {
      account = await this.createAccount(userId);
    }

    // Calculate total equity
    const positionValues = await this.calculatePositionValues(account.positions);
    const equity = account.cashBalance + positionValues.totalValue;

    return {
      ...account,
      equity,
      positionValues,
      performance: await this.calculatePerformance(account)
    };
  }

  /**
   * Create a new paper trading account
   */
  async createAccount(userId, initialBalance = null) {
    const balance = initialBalance || this.defaultBalance;

    return prisma.paperTradingAccount.create({
      data: {
        userId,
        cashBalance: balance,
        initialBalance: balance,
        positions: { create: [] },
        orders: { create: [] }
      },
      include: { positions: true, orders: true }
    });
  }

  /**
   * Reset paper trading account
   */
  async resetAccount(userId) {
    const account = await prisma.paperTradingAccount.findUnique({
      where: { userId }
    });

    if (!account) {
      return this.createAccount(userId);
    }

    // Delete all positions and orders
    await prisma.paperPosition.deleteMany({ where: { accountId: account.id } });
    await prisma.paperOrder.deleteMany({ where: { accountId: account.id } });

    // Reset balance
    return prisma.paperTradingAccount.update({
      where: { id: account.id },
      data: {
        cashBalance: account.initialBalance,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0
      },
      include: { positions: true, orders: true }
    });
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Place a paper trade order
   */
  async placeOrder(userId, orderData) {
    const { symbol, side, quantity, orderType, limitPrice, stopPrice, timeInForce = 'day' } = orderData;

    // Validate inputs
    if (!symbol || !side || !quantity) {
      throw new Error('Missing required fields: symbol, side, quantity');
    }

    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      throw new Error('Side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop', 'stop_limit'].includes(orderType?.toLowerCase() || 'market')) {
      throw new Error('Invalid order type');
    }

    const account = await this.getAccount(userId);
    const quote = await marketData.getQuote(symbol);

    if (!quote) {
      throw new Error(`Unable to fetch quote for ${symbol}`);
    }

    const currentPrice = quote.price || quote.latestPrice;
    const orderValue = currentPrice * quantity;

    // Check buying power for buy orders
    if (side.toLowerCase() === 'buy' && orderValue > account.cashBalance) {
      throw new Error(`Insufficient buying power. Required: $${orderValue.toFixed(2)}, Available: $${account.cashBalance.toFixed(2)}`);
    }

    // Check position for sell orders
    if (side.toLowerCase() === 'sell') {
      const position = account.positions.find(p => p.symbol === symbol.toUpperCase());
      if (!position || position.quantity < quantity) {
        throw new Error(`Insufficient shares. You have ${position?.quantity || 0} shares of ${symbol}`);
      }
    }

    // Create the order
    const order = await prisma.paperOrder.create({
      data: {
        accountId: account.id,
        symbol: symbol.toUpperCase(),
        side: side.toLowerCase(),
        quantity,
        orderType: orderType?.toLowerCase() || 'market',
        limitPrice: limitPrice || null,
        stopPrice: stopPrice || null,
        timeInForce,
        status: 'pending',
        submittedPrice: currentPrice
      }
    });

    // For market orders, execute immediately
    if (order.orderType === 'market') {
      return this.executeOrder(order.id, currentPrice);
    }

    return order;
  }

  /**
   * Execute an order at given price
   */
  async executeOrder(orderId, executionPrice) {
    const order = await prisma.paperOrder.findUnique({
      where: { id: orderId },
      include: { account: true }
    });

    if (!order || order.status !== 'pending') {
      throw new Error('Order not found or already processed');
    }

    const totalValue = executionPrice * order.quantity;
    const commission = 0; // Paper trading has no commission

    // Update order status
    await prisma.paperOrder.update({
      where: { id: orderId },
      data: {
        status: 'filled',
        filledPrice: executionPrice,
        filledQuantity: order.quantity,
        filledAt: new Date(),
        commission
      }
    });

    // Update position and cash balance
    if (order.side === 'buy') {
      await this.addToPosition(order.accountId, order.symbol, order.quantity, executionPrice);
      await prisma.paperTradingAccount.update({
        where: { id: order.accountId },
        data: { cashBalance: { decrement: totalValue } }
      });
    } else {
      const pnl = await this.reducePosition(order.accountId, order.symbol, order.quantity, executionPrice);
      await prisma.paperTradingAccount.update({
        where: { id: order.accountId },
        data: {
          cashBalance: { increment: totalValue },
          totalTrades: { increment: 1 },
          winningTrades: pnl > 0 ? { increment: 1 } : undefined,
          losingTrades: pnl < 0 ? { increment: 1 } : undefined,
          totalPnl: { increment: pnl }
        }
      });
    }

    return prisma.paperOrder.findUnique({
      where: { id: orderId },
      include: { account: { include: { positions: true } } }
    });
  }

  /**
   * Cancel a pending order
   */
  async cancelOrder(userId, orderId) {
    const order = await prisma.paperOrder.findUnique({
      where: { id: orderId },
      include: { account: true }
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.account.userId !== userId) {
      throw new Error('Access denied');
    }

    if (order.status !== 'pending') {
      throw new Error('Only pending orders can be cancelled');
    }

    return prisma.paperOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled' }
    });
  }

  /**
   * Get order history
   */
  async getOrders(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const account = await prisma.paperTradingAccount.findUnique({ where: { userId } });

    if (!account) return [];

    const where = { accountId: account.id };
    if (status) where.status = status;

    return prisma.paperOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Add to or create position
   */
  async addToPosition(accountId, symbol, quantity, price) {
    const existing = await prisma.paperPosition.findFirst({
      where: { accountId, symbol: symbol.toUpperCase() }
    });

    if (existing) {
      // Average down/up
      const totalShares = existing.quantity + quantity;
      const totalCost = (existing.avgCost * existing.quantity) + (price * quantity);
      const newAvgCost = totalCost / totalShares;

      return prisma.paperPosition.update({
        where: { id: existing.id },
        data: {
          quantity: totalShares,
          avgCost: newAvgCost
        }
      });
    }

    return prisma.paperPosition.create({
      data: {
        accountId,
        symbol: symbol.toUpperCase(),
        quantity,
        avgCost: price
      }
    });
  }

  /**
   * Reduce or close position
   */
  async reducePosition(accountId, symbol, quantity, sellPrice) {
    const position = await prisma.paperPosition.findFirst({
      where: { accountId, symbol: symbol.toUpperCase() }
    });

    if (!position || position.quantity < quantity) {
      throw new Error('Insufficient position');
    }

    const pnl = (sellPrice - position.avgCost) * quantity;

    if (position.quantity === quantity) {
      // Close position entirely
      await prisma.paperPosition.delete({ where: { id: position.id } });
    } else {
      // Partial close
      await prisma.paperPosition.update({
        where: { id: position.id },
        data: { quantity: { decrement: quantity } }
      });
    }

    return pnl;
  }

  /**
   * Get all positions with current values
   */
  async getPositions(userId) {
    const account = await prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: { positions: true }
    });

    if (!account) return [];

    return this.enrichPositions(account.positions);
  }

  /**
   * Enrich positions with current market data
   */
  async enrichPositions(positions) {
    const enriched = await Promise.all(positions.map(async (pos) => {
      try {
        const quote = await marketData.getQuote(pos.symbol);
        const currentPrice = quote?.price || quote?.latestPrice || pos.avgCost;
        const marketValue = currentPrice * pos.quantity;
        const costBasis = pos.avgCost * pos.quantity;
        const unrealizedPnl = marketValue - costBasis;
        const unrealizedPnlPct = ((currentPrice - pos.avgCost) / pos.avgCost) * 100;

        return {
          ...pos,
          currentPrice,
          marketValue,
          costBasis,
          unrealizedPnl,
          unrealizedPnlPct,
          dayChange: quote?.change || 0,
          dayChangePct: quote?.changePercent || 0
        };
      } catch (error) {
        return {
          ...pos,
          currentPrice: pos.avgCost,
          marketValue: pos.avgCost * pos.quantity,
          costBasis: pos.avgCost * pos.quantity,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0
        };
      }
    }));

    return enriched;
  }

  // ==================== ANALYTICS ====================

  /**
   * Calculate total position values
   */
  async calculatePositionValues(positions) {
    if (!positions || positions.length === 0) {
      return { totalValue: 0, totalCost: 0, totalUnrealizedPnl: 0 };
    }

    const enriched = await this.enrichPositions(positions);

    return {
      totalValue: enriched.reduce((sum, p) => sum + p.marketValue, 0),
      totalCost: enriched.reduce((sum, p) => sum + p.costBasis, 0),
      totalUnrealizedPnl: enriched.reduce((sum, p) => sum + p.unrealizedPnl, 0)
    };
  }

  /**
   * Calculate account performance
   */
  async calculatePerformance(account) {
    const winRate = account.totalTrades > 0
      ? (account.winningTrades / account.totalTrades) * 100
      : 0;

    const positionValues = await this.calculatePositionValues(account.positions);
    const equity = account.cashBalance + positionValues.totalValue;
    const totalReturn = ((equity - account.initialBalance) / account.initialBalance) * 100;

    return {
      totalReturn,
      totalReturnDollar: equity - account.initialBalance,
      equity,
      cashBalance: account.cashBalance,
      positionsValue: positionValues.totalValue,
      unrealizedPnl: positionValues.totalUnrealizedPnl,
      realizedPnl: account.totalPnl,
      totalTrades: account.totalTrades,
      winningTrades: account.winningTrades,
      losingTrades: account.losingTrades,
      winRate
    };
  }

  /**
   * Get trading statistics
   */
  async getStatistics(userId) {
    const account = await this.getAccount(userId);

    if (!account) {
      return null;
    }

    const orders = await prisma.paperOrder.findMany({
      where: { accountId: account.id, status: 'filled' },
      orderBy: { filledAt: 'desc' }
    });

    // Calculate daily returns
    const trades = orders.map(o => ({
      date: o.filledAt,
      pnl: o.side === 'sell' ? (o.filledPrice - o.submittedPrice) * o.quantity : 0
    }));

    return {
      account: account.performance,
      positions: await this.enrichPositions(account.positions),
      recentTrades: orders.slice(0, 10),
      tradeCount: orders.length
    };
  }

  // ==================== ORDER MATCHING (Limit/Stop Orders) ====================

  /**
   * Check and execute pending limit/stop orders
   */
  async checkPendingOrders() {
    const pendingOrders = await prisma.paperOrder.findMany({
      where: {
        status: 'pending',
        orderType: { in: ['limit', 'stop', 'stop_limit'] }
      }
    });

    for (const order of pendingOrders) {
      try {
        const quote = await marketData.getQuote(order.symbol);
        if (!quote) continue;

        const currentPrice = quote.price || quote.latestPrice;
        let shouldExecute = false;

        if (order.orderType === 'limit') {
          // Buy limit: execute when price <= limit
          // Sell limit: execute when price >= limit
          if (order.side === 'buy' && currentPrice <= order.limitPrice) {
            shouldExecute = true;
          } else if (order.side === 'sell' && currentPrice >= order.limitPrice) {
            shouldExecute = true;
          }
        } else if (order.orderType === 'stop') {
          // Buy stop: execute when price >= stop
          // Sell stop: execute when price <= stop
          if (order.side === 'buy' && currentPrice >= order.stopPrice) {
            shouldExecute = true;
          } else if (order.side === 'sell' && currentPrice <= order.stopPrice) {
            shouldExecute = true;
          }
        }

        if (shouldExecute) {
          await this.executeOrder(order.id, currentPrice);
          logger.info(`Paper order ${order.id} executed at $${currentPrice}`);
        }
      } catch (error) {
        logger.error(`Error checking order ${order.id}:`, error.message);
      }
    }
  }

  /**
   * Start order matching service
   */
  startOrderMatching(intervalMs = 30000) {
    if (this.orderMatchingInterval) {
      clearInterval(this.orderMatchingInterval);
    }

    this.orderMatchingInterval = setInterval(() => {
      this.checkPendingOrders().catch(err =>
        logger.error('Order matching error:', err)
      );
    }, intervalMs);

    logger.info('Paper trading order matching started');
  }

  /**
   * Stop order matching service
   */
  stopOrderMatching() {
    if (this.orderMatchingInterval) {
      clearInterval(this.orderMatchingInterval);
      this.orderMatchingInterval = null;
      logger.info('Paper trading order matching stopped');
    }
  }
}

module.exports = new PaperTradingService();
