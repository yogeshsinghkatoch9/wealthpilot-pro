/**
 * Crypto Portfolio Routes
 * Complete API for crypto holdings management with real market data
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const cryptoService = require('../services/cryptoService');
const { prisma } = require('../db/simpleDb');
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

    // Get holdings from database using raw SQL (PostgreSQL)
    const holdings = await prisma.$queryRaw`
      SELECT * FROM crypto_holdings
      WHERE user_id = ${userId}
      ORDER BY market_value DESC
    `;

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
      const currentPrice = priceData?.price || h.current_price || 0;
      const marketValue = h.quantity * currentPrice;
      const gain = marketValue - h.cost_basis;
      const gainPercent = h.cost_basis > 0 ? (gain / h.cost_basis) * 100 : 0;

      return {
        ...h,
        current_price: currentPrice,
        market_value: marketValue,
        gain,
        gain_percent: gainPercent,
        change_24h: priceData?.change24h || 0,
        volume_24h: priceData?.volume24h || 0,
        market_cap: priceData?.marketCap || 0
      };
    });

    // Calculate totals
    const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.market_value, 0);
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.cost_basis, 0);
    const totalGain = totalValue - totalCost;

    // Calculate weighted 24h change
    const dayChange = totalValue > 0 ? enrichedHoldings.reduce((sum, h) => {
      const weight = h.market_value / totalValue;
      return sum + (h.change_24h * weight);
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
    const { symbol, name, quantity, costBasis, purchaseDate, notes } = req.body;

    if (!symbol || !quantity || !costBasis) {
      return res.status(400).json({ error: 'Symbol, quantity, and cost basis required' });
    }

    // Get current price
    const priceData = await cryptoService.getPrice(symbol.toUpperCase());
    const currentPrice = priceData?.price || 0;
    const marketValue = parseFloat(quantity) * currentPrice;

    // Check if holding already exists
    const existing = await prisma.$queryRaw`
      SELECT * FROM crypto_holdings WHERE user_id = ${userId} AND symbol = ${symbol.toUpperCase()}
    `;

    if (existing.length > 0) {
      // Update existing holding (average cost basis)
      const oldHolding = existing[0];
      const newQuantity = oldHolding.quantity + parseFloat(quantity);
      const newCostBasis = oldHolding.cost_basis + parseFloat(costBasis);

      await prisma.$executeRaw`
        UPDATE crypto_holdings
        SET quantity = ${newQuantity}, cost_basis = ${newCostBasis},
            current_price = ${currentPrice}, market_value = ${newQuantity * currentPrice},
            updated_at = NOW()
        WHERE id = ${oldHolding.id}
      `;

      res.json({
        success: true,
        message: 'Holding updated',
        holding: {
          id: oldHolding.id,
          symbol: symbol.toUpperCase(),
          quantity: newQuantity,
          costBasis: newCostBasis,
          avgCost: newCostBasis / newQuantity,
          currentPrice,
          marketValue: newQuantity * currentPrice
        }
      });
    } else {
      // Insert new holding
      const id = require('crypto').randomUUID();
      await prisma.$executeRaw`
        INSERT INTO crypto_holdings (
          id, user_id, symbol, name, quantity, cost_basis, current_price, market_value,
          purchase_date, notes, created_at, updated_at
        ) VALUES (
          ${id}, ${userId}, ${symbol.toUpperCase()}, ${name || symbol.toUpperCase()},
          ${parseFloat(quantity)}, ${parseFloat(costBasis)}, ${currentPrice}, ${marketValue},
          ${purchaseDate || null}, ${notes || null}, NOW(), NOW()
        )
      `;

      res.json({
        success: true,
        message: 'Holding added',
        holdingId: id
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
    const { quantity, costBasis, notes } = req.body;

    const holdings = await prisma.$queryRaw`
      SELECT * FROM crypto_holdings WHERE id = ${id} AND user_id = ${userId}
    `;

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const holding = holdings[0];

    // Get current price
    const priceData = await cryptoService.getPrice(holding.symbol);
    const currentPrice = priceData?.price || holding.current_price;

    const newQuantity = quantity !== undefined ? parseFloat(quantity) : holding.quantity;
    const newCostBasis = costBasis !== undefined ? parseFloat(costBasis) : holding.cost_basis;
    const marketValue = newQuantity * currentPrice;

    await prisma.$executeRaw`
      UPDATE crypto_holdings
      SET quantity = ${newQuantity}, cost_basis = ${newCostBasis},
          current_price = ${currentPrice}, market_value = ${marketValue},
          notes = ${notes || holding.notes}, updated_at = NOW()
      WHERE id = ${id}
    `;

    res.json({ success: true, message: 'Holding updated' });
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

    const result = await prisma.$executeRaw`
      DELETE FROM crypto_holdings WHERE id = ${id} AND user_id = ${userId}
    `;

    if (result === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }

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
    const { type, quantity, price, date, notes } = req.body;

    if (!type || !quantity || !price) {
      return res.status(400).json({ error: 'Type, quantity, and price required' });
    }

    const holdings = await prisma.$queryRaw`
      SELECT * FROM crypto_holdings WHERE id = ${id} AND user_id = ${userId}
    `;

    if (holdings.length === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const holding = holdings[0];
    const txQuantity = parseFloat(quantity);
    const txPrice = parseFloat(price);
    const txValue = txQuantity * txPrice;

    // Record transaction
    const txId = require('crypto').randomUUID();
    await prisma.$executeRaw`
      INSERT INTO crypto_transactions (
        id, user_id, holding_id, symbol, type, quantity, price, total_value, date, notes, created_at
      ) VALUES (
        ${txId}, ${userId}, ${id}, ${holding.symbol}, ${type}, ${txQuantity}, ${txPrice}, ${txValue},
        ${date || null}, ${notes || null}, NOW()
      )
    `;

    // Update holding based on transaction type
    if (type === 'buy') {
      const newQuantity = holding.quantity + txQuantity;
      const newCostBasis = holding.cost_basis + txValue;
      await prisma.$executeRaw`
        UPDATE crypto_holdings
        SET quantity = ${newQuantity}, cost_basis = ${newCostBasis}, updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (type === 'sell') {
      const newQuantity = Math.max(0, holding.quantity - txQuantity);
      // Proportional cost basis reduction
      const costReduction = holding.quantity > 0 ? (txQuantity / holding.quantity) * holding.cost_basis : 0;
      const newCostBasis = Math.max(0, holding.cost_basis - costReduction);

      if (newQuantity === 0) {
        // Remove holding if fully sold
        await prisma.$executeRaw`DELETE FROM crypto_holdings WHERE id = ${id}`;
      } else {
        await prisma.$executeRaw`
          UPDATE crypto_holdings
          SET quantity = ${newQuantity}, cost_basis = ${newCostBasis}, updated_at = NOW()
          WHERE id = ${id}
        `;
      }
    }

    res.json({ success: true, message: 'Transaction recorded' });
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

    const transactions = await prisma.$queryRaw`
      SELECT * FROM crypto_transactions
      WHERE user_id = ${userId} AND holding_id = ${id}
      ORDER BY date DESC, created_at DESC
    `;

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

    const transactions = await prisma.$queryRaw`
      SELECT * FROM crypto_transactions
      WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC
      LIMIT ${limit}
    `;

    res.json({ success: true, transactions });
  } catch (error) {
    logger.error('Get all transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * POST /api/crypto/refresh
 * Refresh all holdings with current prices
 */
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user.id;

    const holdings = await prisma.$queryRaw`
      SELECT * FROM crypto_holdings WHERE user_id = ${userId}
    `;

    if (holdings.length === 0) {
      return res.json({ success: true, message: 'No holdings to refresh', updated: 0 });
    }

    const symbols = holdings.map(h => h.symbol);
    const prices = await cryptoService.getPrices(symbols);

    let updated = 0;
    for (const holding of holdings) {
      const priceData = prices[holding.symbol];
      if (priceData) {
        const marketValue = holding.quantity * priceData.price;
        await prisma.$executeRaw`
          UPDATE crypto_holdings
          SET current_price = ${priceData.price}, market_value = ${marketValue}, updated_at = NOW()
          WHERE id = ${holding.id}
        `;
        updated++;
      }
    }

    res.json({ success: true, message: 'Prices refreshed', updated });
  } catch (error) {
    logger.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh prices' });
  }
});

module.exports = router;
