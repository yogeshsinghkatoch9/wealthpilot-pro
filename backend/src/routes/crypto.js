/**
 * Crypto Portfolio Routes
 * Complete API for crypto holdings management with real market data
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const cryptoService = require('../services/cryptoService');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// ============================================
// MARKET DATA ENDPOINTS
// ============================================

/**
 * GET /api/crypto/market
 * Get global crypto market data
 */
router.get('/market', async (req, res) => {
  try {
    const [global, fearGreed, gas] = await Promise.all([
      cryptoService.getGlobalData(),
      cryptoService.getFearGreedIndex(),
      cryptoService.getGasPrices()
    ]);

    // Get BTC and ETH prices
    const prices = await cryptoService.getPrices(['BTC', 'ETH']);

    res.json({
      success: true,
      global,
      btc: prices['BTC'],
      eth: prices['ETH'],
      fearGreed,
      gas
    });
  } catch (error) {
    logger.error('Market data error:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

/**
 * GET /api/crypto/prices
 * Get current prices for specific symbols
 */
router.get('/prices', async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'Symbols required' });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const prices = await cryptoService.getPrices(symbolList);

    res.json({ success: true, prices });
  } catch (error) {
    logger.error('Prices error:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

/**
 * GET /api/crypto/coin/:symbol
 * Get detailed coin information
 */
router.get('/coin/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const details = await cryptoService.getCoinDetails(symbol);

    if (!details) {
      return res.status(404).json({ error: 'Coin not found' });
    }

    res.json({ success: true, coin: details });
  } catch (error) {
    logger.error('Coin details error:', error);
    res.status(500).json({ error: 'Failed to fetch coin details' });
  }
});

/**
 * GET /api/crypto/history/:symbol
 * Get price history for charts
 */
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { days = 30 } = req.query;

    const history = await cryptoService.getPriceHistory(symbol, parseInt(days));

    if (!history) {
      return res.status(404).json({ error: 'History not found' });
    }

    res.json({ success: true, history });
  } catch (error) {
    logger.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

/**
 * GET /api/crypto/top
 * Get top coins by market cap
 */
router.get('/top', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const coins = await cryptoService.getTopCoins(parseInt(limit));

    res.json({ success: true, coins });
  } catch (error) {
    logger.error('Top coins error:', error);
    res.status(500).json({ error: 'Failed to fetch top coins' });
  }
});

/**
 * GET /api/crypto/search
 * Search for coins
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    const results = await cryptoService.search(q);
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search coins' });
  }
});

// ============================================
// PORTFOLIO MANAGEMENT ENDPOINTS
// ============================================

/**
 * GET /api/crypto
 * Get user's crypto holdings with current prices
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get holdings from database using Prisma ORM
    const holdings = await prisma.cryptoHolding.findMany({
      where: { userId },
      include: { transactions: { orderBy: { executedAt: 'desc' }, take: 5 } },
      orderBy: { updated_at: 'desc' }
    });

    if (holdings.length === 0) {
      return res.json({
        success: true,
        holdings: [],
        totals: {
          totalValue: 0,
          totalCost: 0,
          totalGain: 0,
          dayChange: 0
        }
      });
    }

    // Get current prices for all holdings
    const symbols = holdings.map(h => h.symbol);
    const prices = await cryptoService.getPrices(symbols);

    // Enrich holdings with current data
    const enrichedHoldings = holdings.map(h => {
      const priceData = prices[h.symbol];
      const currentPrice = priceData?.price || 0;
      const costBasis = h.quantity * h.avgCost;
      const marketValue = h.quantity * currentPrice;
      const gain = marketValue - costBasis;
      const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        avgCost: h.avgCost,
        exchange: h.exchange,
        walletAddress: h.walletAddress,
        currentPrice,
        costBasis,
        marketValue,
        gain,
        gainPercent,
        change24h: priceData?.change24h || 0,
        volume24h: priceData?.volume24h || 0,
        marketCap: priceData?.marketCap || 0,
        recentTransactions: h.transactions
      };
    });

    // Calculate totals
    const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.costBasis, 0);
    const totalGain = totalValue - totalCost;

    // Calculate weighted 24h change
    const dayChange = totalValue > 0 ? enrichedHoldings.reduce((sum, h) => {
      const weight = h.marketValue / totalValue;
      return sum + (h.change24h * weight);
    }, 0) : 0;

    res.json({
      success: true,
      holdings: enrichedHoldings,
      totals: {
        totalValue: Math.round(totalValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalGain: Math.round(totalGain * 100) / 100,
        gainPercent: totalCost > 0 ? Math.round((totalGain / totalCost) * 10000) / 100 : 0,
        dayChange: Math.round(dayChange * 100) / 100,
        dayChangeValue: Math.round((totalValue * dayChange / 100) * 100) / 100
      }
    });
  } catch (error) {
    logger.error('Get holdings error:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

/**
 * POST /api/crypto
 * Add a new crypto holding
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, name, quantity, avgCost, exchange, walletAddress, notes } = req.body;

    if (!symbol || !quantity || !avgCost) {
      return res.status(400).json({ error: 'Symbol, quantity, and average cost required' });
    }

    // Check if holding already exists
    const existing = await prisma.cryptoHolding.findUnique({
      where: { userId_symbol: { userId, symbol: symbol.toUpperCase() } }
    });

    if (existing) {
      // Update existing holding (calculate new average cost)
      const newQuantity = existing.quantity + parseFloat(quantity);
      const totalCost = (existing.quantity * existing.avgCost) + (parseFloat(quantity) * parseFloat(avgCost));
      const newAvgCost = totalCost / newQuantity;

      const updated = await prisma.cryptoHolding.update({
        where: { id: existing.id },
        data: {
          quantity: newQuantity,
          avgCost: newAvgCost,
          exchange: exchange || existing.exchange,
          walletAddress: walletAddress || existing.walletAddress,
          notes: notes || existing.notes
        }
      });

      res.json({
        success: true,
        message: 'Holding updated',
        holding: updated
      });
    } else {
      // Create new holding
      const holding = await prisma.cryptoHolding.create({
        data: {
          userId,
          symbol: symbol.toUpperCase(),
          name: name || symbol.toUpperCase(),
          quantity: parseFloat(quantity),
          avgCost: parseFloat(avgCost),
          exchange: exchange || null,
          walletAddress: walletAddress || null,
          notes: notes || null
        }
      });

      res.json({
        success: true,
        message: 'Holding added',
        holding
      });
    }
  } catch (error) {
    logger.error('Add holding error:', error);
    res.status(500).json({ error: 'Failed to add holding' });
  }
});

/**
 * PUT /api/crypto/:id
 * Update a crypto holding
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity, avgCost, exchange, walletAddress, notes } = req.body;

    // Verify ownership
    const existing = await prisma.cryptoHolding.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const holding = await prisma.cryptoHolding.update({
      where: { id },
      data: {
        quantity: quantity !== undefined ? parseFloat(quantity) : undefined,
        avgCost: avgCost !== undefined ? parseFloat(avgCost) : undefined,
        exchange: exchange !== undefined ? exchange : undefined,
        walletAddress: walletAddress !== undefined ? walletAddress : undefined,
        notes: notes !== undefined ? notes : undefined
      }
    });

    res.json({ success: true, message: 'Holding updated', holding });
  } catch (error) {
    logger.error('Update holding error:', error);
    res.status(500).json({ error: 'Failed to update holding' });
  }
});

/**
 * DELETE /api/crypto/:id
 * Remove a crypto holding
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.cryptoHolding.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    // Delete associated transactions first, then the holding
    await prisma.cryptoTransaction.deleteMany({ where: { holdingId: id } });
    await prisma.cryptoHolding.delete({ where: { id } });

    res.json({ success: true, message: 'Holding removed' });
  } catch (error) {
    logger.error('Delete holding error:', error);
    res.status(500).json({ error: 'Failed to remove holding' });
  }
});

/**
 * POST /api/crypto/:id/transaction
 * Add a transaction to a holding (buy/sell)
 */
router.post('/:id/transaction', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, quantity, price, exchange, txHash, notes } = req.body;

    if (!type || !quantity || !price) {
      return res.status(400).json({ error: 'Type, quantity, and price required' });
    }

    // Verify holding exists and belongs to user
    const holding = await prisma.cryptoHolding.findFirst({
      where: { id, userId }
    });

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const txQuantity = parseFloat(quantity);
    const txPrice = parseFloat(price);

    // Record transaction
    const transaction = await prisma.cryptoTransaction.create({
      data: {
        holdingId: id,
        type,
        quantity: txQuantity,
        price: txPrice,
        fees: 0,
        exchange: exchange || null,
        txHash: txHash || null,
        notes: notes || null,
        executedAt: new Date()
      }
    });

    // Update holding based on transaction type
    if (type === 'buy') {
      const newQuantity = holding.quantity + txQuantity;
      const totalCost = (holding.quantity * holding.avgCost) + (txQuantity * txPrice);
      const newAvgCost = totalCost / newQuantity;

      await prisma.cryptoHolding.update({
        where: { id },
        data: { quantity: newQuantity, avgCost: newAvgCost }
      });
    } else if (type === 'sell') {
      const newQuantity = Math.max(0, holding.quantity - txQuantity);

      if (newQuantity === 0) {
        // Delete holding and all transactions if fully sold
        await prisma.cryptoTransaction.deleteMany({ where: { holdingId: id } });
        await prisma.cryptoHolding.delete({ where: { id } });
      } else {
        await prisma.cryptoHolding.update({
          where: { id },
          data: { quantity: newQuantity }
        });
      }
    }

    res.json({ success: true, message: 'Transaction recorded', transaction });
  } catch (error) {
    logger.error('Transaction error:', error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

/**
 * GET /api/crypto/:id/transactions
 * Get transaction history for a holding
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify holding belongs to user
    const holding = await prisma.cryptoHolding.findFirst({
      where: { id, userId }
    });

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const transactions = await prisma.cryptoTransaction.findMany({
      where: { holdingId: id },
      orderBy: { executedAt: 'desc' }
    });

    res.json({ success: true, transactions });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/crypto/transactions/all
 * Get all crypto transactions for user
 */
router.get('/transactions/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    // Get all holdings for user, then get their transactions
    const holdings = await prisma.cryptoHolding.findMany({
      where: { userId },
      select: { id: true }
    });

    const holdingIds = holdings.map(h => h.id);

    const transactions = await prisma.cryptoTransaction.findMany({
      where: { holdingId: { in: holdingIds } },
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: { holding: { select: { symbol: true, name: true } } }
    });

    res.json({ success: true, transactions });
  } catch (error) {
    logger.error('Get all transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * POST /api/crypto/refresh
 * Refresh all holdings with current prices (updates UI display only)
 */
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user.id;

    const holdings = await prisma.cryptoHolding.findMany({
      where: { userId }
    });

    if (holdings.length === 0) {
      return res.json({ success: true, message: 'No holdings to refresh', updated: 0 });
    }

    const symbols = holdings.map(h => h.symbol);
    const prices = await cryptoService.getPrices(symbols);

    // Return enriched holdings with current prices
    const enrichedHoldings = holdings.map(h => {
      const priceData = prices[h.symbol];
      const currentPrice = priceData?.price || 0;
      const costBasis = h.quantity * h.avgCost;
      const marketValue = h.quantity * currentPrice;

      return {
        ...h,
        currentPrice,
        costBasis,
        marketValue,
        gain: marketValue - costBasis,
        change24h: priceData?.change24h || 0
      };
    });

    res.json({
      success: true,
      message: 'Prices refreshed',
      holdings: enrichedHoldings,
      updated: holdings.length
    });
  } catch (error) {
    logger.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh prices' });
  }
});

module.exports = router;
