const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/watchlists
 */
router.get('/', async (req, res) => {
  try {
    const watchlists = await prisma.watchlist.findMany({
      where: { user_id: req.user.id },
      include: { items: true },
      orderBy: { name: 'asc' }
    });

    // Enrich with market data
    const enriched = await Promise.all(watchlists.map(async (wl) => {
      const symbols = wl.items.map(i => i.symbol);
      const quotes = await MarketDataService.getQuotes(symbols);

      const items = wl.items.map(item => ({
        ...item,
        targetPrice: item.targetPrice ? Number(item.targetPrice) : null,
        quote: quotes[item.symbol] || null
      }));

      return { ...wl, items };
    }));

    res.json(enriched);
  } catch (err) {
    logger.error('Get watchlists error:', err);
    res.status(500).json({ error: 'Failed to get watchlists' });
  }
});

/**
 * POST /api/watchlists
 */
router.post('/', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    const watchlist = await prisma.watchlist.create({
      data: { user_id: req.user.id, name, description }
    });

    res.status(201).json(watchlist);
  } catch (err) {
    logger.error('Create watchlist error:', err);
    res.status(500).json({ error: 'Failed to create watchlist' });
  }
});

/**
 * POST /api/watchlists/:id/items
 */
router.post('/:id/items', [
  param('id').isUUID(),
  body('symbol').trim().toUpperCase().notEmpty(),
  body('targetPrice').optional().isFloat({ gt: 0 }),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const watchlist = await prisma.watchlist.findFirst({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    const { symbol, targetPrice, notes } = req.body;

    // Verify symbol exists
    const quote = await MarketDataService.getQuote(symbol);
    if (!quote) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const item = await prisma.watchlistItem.create({
      data: {
        watchlistId: req.params.id,
        symbol,
        targetPrice,
        notes
      }
    });

    res.status(201).json({ ...item, quote });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Symbol already in watchlist' });
    }
    logger.error('Add watchlist item error:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/**
 * DELETE /api/watchlists/:id/items/:symbol
 */
router.delete('/:id/items/:symbol', async (req, res) => {
  try {
    const watchlist = await prisma.watchlist.findFirst({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    await prisma.watchlistItem.deleteMany({
      where: {
        watchlistId: req.params.id,
        symbol: req.params.symbol.toUpperCase()
      }
    });

    res.json({ message: 'Item removed' });
  } catch (err) {
    logger.error('Delete watchlist item error:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

/**
 * DELETE /api/watchlists/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const watchlist = await prisma.watchlist.findFirst({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    await prisma.watchlist.delete({ where: { id: req.params.id } });
    res.json({ message: 'Watchlist deleted' });
  } catch (err) {
    logger.error('Delete watchlist error:', err);
    res.status(500).json({ error: 'Failed to delete watchlist' });
  }
});

module.exports = router;
