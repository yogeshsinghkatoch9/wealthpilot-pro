/**
 * Simplified Watchlist Route - /api/watchlist (singular)
 * Provides a flat watchlist structure for easy frontend integration
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

// Default watchlist name
const DEFAULT_WATCHLIST_NAME = 'My Watchlist';

/**
 * Get or create user's default watchlist
 */
async function getDefaultWatchlist(userId) {
  let watchlist = await prisma.watchlist.findFirst({
    where: { userId, name: DEFAULT_WATCHLIST_NAME },
    include: { items: true }
  });

  if (!watchlist) {
    watchlist = await prisma.watchlist.create({
      data: {
        userId,
        name: DEFAULT_WATCHLIST_NAME,
        description: 'Default watchlist'
      },
      include: { items: true }
    });
  }

  return watchlist;
}

/**
 * GET /api/watchlist
 * Get all watchlist items (from default watchlist)
 */
router.get('/', async (req, res) => {
  try {
    const watchlist = await getDefaultWatchlist(req.user.id);

    // Enrich with market data
    const symbols = watchlist.items.map(i => i.symbol);
    const quotes = symbols.length > 0 ? await MarketDataService.getQuotes(symbols) : {};

    const items = watchlist.items.map(item => ({
      id: item.id,
      symbol: item.symbol,
      target_price: item.targetPrice ? Number(item.targetPrice) : null,
      targetPrice: item.targetPrice ? Number(item.targetPrice) : null,
      notes: item.notes,
      created_at: item.createdAt,
      quote: quotes[item.symbol] || null,
      currentPrice: quotes[item.symbol]?.price || null,
      change: quotes[item.symbol]?.change || 0,
      changePercent: quotes[item.symbol]?.changePercent || 0
    }));

    res.json({
      success: true,
      watchlist: items,
      items: items // Alias for compatibility
    });
  } catch (err) {
    logger.error('Get watchlist error:', err);
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

/**
 * POST /api/watchlist
 * Add a symbol to the default watchlist
 */
router.post('/', [
  body('symbol').trim().toUpperCase().notEmpty().withMessage('Symbol is required'),
  body('target_price').optional().isFloat({ gt: 0 }).toFloat(),
  body('targetPrice').optional().isFloat({ gt: 0 }).toFloat(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { symbol, notes } = req.body;
    const targetPrice = req.body.target_price || req.body.targetPrice || null;

    // Get or create default watchlist
    const watchlist = await getDefaultWatchlist(req.user.id);

    // Check if symbol already in watchlist
    const existing = await prisma.watchlistItem.findFirst({
      where: { watchlistId: watchlist.id, symbol }
    });

    if (existing) {
      return res.status(400).json({ error: 'Symbol already in watchlist' });
    }

    // Verify symbol exists
    let quote = null;
    try {
      quote = await MarketDataService.getQuote(symbol);
    } catch (e) {
      // Allow adding even if quote fails - symbol might be valid but API limited
      logger.warn(`Quote fetch failed for ${symbol}:`, e.message);
    }

    const item = await prisma.watchlistItem.create({
      data: {
        watchlistId: watchlist.id,
        symbol,
        targetPrice,
        notes
      }
    });

    res.status(201).json({
      success: true,
      item: {
        id: item.id,
        symbol: item.symbol,
        target_price: item.targetPrice ? Number(item.targetPrice) : null,
        targetPrice: item.targetPrice ? Number(item.targetPrice) : null,
        notes: item.notes,
        created_at: item.createdAt,
        quote: quote,
        currentPrice: quote?.price || null
      }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Symbol already in watchlist' });
    }
    logger.error('Add to watchlist error:', err);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

/**
 * PUT /api/watchlist/:id
 * Update a watchlist item
 */
router.put('/:id', [
  body('target_price').optional().isFloat({ gt: 0 }).toFloat(),
  body('targetPrice').optional().isFloat({ gt: 0 }).toFloat(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const targetPrice = req.body.target_price || req.body.targetPrice;
    const { notes } = req.body;

    // Verify item belongs to user
    const item = await prisma.watchlistItem.findFirst({
      where: { id },
      include: { watchlist: true }
    });

    if (!item || item.watchlist.userId !== req.user.id) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    const updateData = {};
    if (targetPrice !== undefined) updateData.targetPrice = targetPrice || null;
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.watchlistItem.update({
      where: { id },
      data: updateData
    });

    res.json({
      success: true,
      item: {
        id: updated.id,
        symbol: updated.symbol,
        target_price: updated.targetPrice ? Number(updated.targetPrice) : null,
        targetPrice: updated.targetPrice ? Number(updated.targetPrice) : null,
        notes: updated.notes
      }
    });
  } catch (err) {
    logger.error('Update watchlist item error:', err);
    res.status(500).json({ error: 'Failed to update watchlist item' });
  }
});

/**
 * DELETE /api/watchlist/:id
 * Remove a watchlist item
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify item belongs to user
    const item = await prisma.watchlistItem.findFirst({
      where: { id },
      include: { watchlist: true }
    });

    if (!item || item.watchlist.userId !== req.user.id) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    await prisma.watchlistItem.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Item removed from watchlist'
    });
  } catch (err) {
    logger.error('Delete watchlist item error:', err);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

/**
 * DELETE /api/watchlist/symbol/:symbol
 * Remove a watchlist item by symbol
 */
router.delete('/symbol/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Get user's default watchlist
    const watchlist = await getDefaultWatchlist(req.user.id);

    const deleted = await prisma.watchlistItem.deleteMany({
      where: {
        watchlistId: watchlist.id,
        symbol
      }
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Symbol not in watchlist' });
    }

    res.json({
      success: true,
      message: `${symbol} removed from watchlist`
    });
  } catch (err) {
    logger.error('Delete watchlist symbol error:', err);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

module.exports = router;
