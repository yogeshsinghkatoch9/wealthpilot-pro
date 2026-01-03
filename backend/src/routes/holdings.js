const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/holdings
 * Get holdings for a portfolio (requires portfolioId query param)
 */
router.get('/', async (req, res) => {
  try {
    const { portfolioId } = req.query;

    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get holdings
    const holdings = await prisma.holding.findMany({
      where: { portfolioId },
      include: {
        taxLots: {
          orderBy: { purchaseDate: 'asc' }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Enrich with market data
    const enrichedHoldings = await Promise.all(
      holdings.map(async (holding) => {
        const quote = await MarketDataService.getQuote(holding.symbol);
        const shares = Number(holding.shares);
        const costBasis = Number(holding.avgCostBasis);
        const price = quote?.price || costBasis;

        return {
          ...holding,
          shares,
          avgCostBasis: costBasis,
          currentPrice: price,
          marketValue: shares * price,
          totalCost: shares * costBasis,
          gain: (shares * price) - (shares * costBasis),
          gainPct: ((price - costBasis) / costBasis) * 100,
          dayChange: quote?.change || 0,
          dayChangePct: quote?.changePercent || 0
        };
      })
    );

    res.json(enrichedHoldings);
  } catch (err) {
    logger.error('Get holdings error:', err);
    res.status(500).json({ error: 'Failed to get holdings' });
  }
});

/**
 * POST /api/holdings
 * Add new holding to portfolio
 */
router.post('/', [
  body('portfolioId').isUUID(),
  body('symbol').trim().toUpperCase().notEmpty(),
  body('shares').isFloat({ gt: 0 }),
  body('avgCostBasis').isFloat({ gt: 0 }),
  body('purchaseDate').optional().isISO8601(),
  body('notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { portfolioId, symbol, purchaseDate, notes } = req.body;
    // Convert string values to numbers (for form-urlencoded requests)
    const shares = parseFloat(req.body.shares);
    const avgCostBasis = parseFloat(req.body.avgCostBasis);

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get stock info
    const quote = await MarketDataService.getQuote(symbol);
    if (!quote) {
      return res.status(400).json({ error: 'Invalid stock symbol' });
    }

    // Check if holding exists
    const existingHolding = await prisma.holding.findFirst({
      where: {
        portfolioId,
        symbol
      }
    });

    if (existingHolding) {
      // Update existing holding - average the cost basis
      const existingShares = Number(existingHolding.shares);
      const existingCost = Number(existingHolding.avgCostBasis);
      const newShares = shares;
      const newCost = avgCostBasis;
      
      const totalShares = existingShares + newShares;
      const newAvgCost = ((existingShares * existingCost) + (newShares * newCost)) / totalShares;

      const now = new Date().toISOString();
      const holding = await prisma.holding.update({
        where: { id: existingHolding.id },
        data: {
          shares: totalShares,
          avgCostBasis: newAvgCost,
          updatedAt: now,
          taxLots: {
            create: {
              shares: newShares,
              costBasis: newCost,
              purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : now,
              createdAt: now
            }
          }
        },
        include: { taxLots: true }
      });

      logger.info(`Added ${shares} shares of ${symbol} to existing holding`);
      return res.json(holding);
    }

    // Create new holding
    const now = new Date().toISOString();
    logger.info(`Creating holding with createdAt: ${now}, type: ${typeof now}`);
    const holding = await prisma.holding.create({
      data: {
        portfolioId,
        symbol,
        shares,
        avgCostBasis,
        sector: quote.sector,
        assetType: quote.assetType || 'stock',
        notes,
        createdAt: now,
        updatedAt: now,
        taxLots: {
          create: {
            shares,
            costBasis: avgCostBasis,
            purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : now,
            createdAt: now
          }
        }
      },
      include: { taxLots: true }
    });

    // Create buy transaction
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        portfolioId,
        symbol,
        type: 'buy',
        shares,
        price: avgCostBasis,
        amount: shares * avgCostBasis,
        executedAt: purchaseDate ? new Date(purchaseDate).toISOString() : now,
        createdAt: now
      }
    });

    logger.info(`New holding created: ${symbol} in portfolio ${portfolio.name}`);
    res.status(201).json(holding);
  } catch (err) {
    logger.error('Create holding error:', err);
    res.status(500).json({ error: 'Failed to create holding' });
  }
});

/**
 * GET /api/holdings/all
 * Get all holdings across all portfolios with live prices
 */
router.get('/all', async (req, res) => {
  try {
    // Get all portfolios for the user
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        holdings: {
          include: {
            portfolio: {
              select: { name: true }
            }
          }
        }
      }
    });

    // Collect all holdings from all portfolios
    const allHoldings = [];
    const symbolsSet = new Set();

    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        allHoldings.push({
          ...holding,
          portfolioName: portfolio.name
        });
        symbolsSet.add(holding.symbol);
      }
    }

    if (allHoldings.length === 0) {
      return res.json([]);
    }

    // Fetch live quotes for all symbols
    const symbols = Array.from(symbolsSet);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Enrich holdings with live data and calculations
    const enrichedHoldings = allHoldings.map(h => {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares) || 0;
      const avgCost = Number(h.avgCostBasis) || 0;
      const currentPrice = Number(quote.price) || avgCost;
      const costTotal = shares * avgCost;
      const marketValue = shares * currentPrice;
      const gain = marketValue - costTotal;
      const gainPct = costTotal > 0 ? (gain / costTotal * 100) : 0;

      return {
        id: h.id,
        symbol: h.symbol,
        name: quote.name || h.symbol,
        shares,
        avgCostBasis: avgCost,
        currentPrice,
        marketValue,
        costTotal,
        gain,
        gainPct,
        change: Number(quote.change) || 0,
        changePct: Number(quote.changePercent) || 0,
        dayHigh: Number(quote.high) || currentPrice,
        dayLow: Number(quote.low) || currentPrice,
        volume: Number(quote.volume) || 0,
        sector: h.sector || quote.sector || 'Unknown',
        portfolioId: h.portfolioId,
        portfolioName: h.portfolioName
      };
    });

    // Sort by market value descending
    enrichedHoldings.sort((a, b) => b.marketValue - a.marketValue);

    res.json(enrichedHoldings);
  } catch (err) {
    logger.error('Get all holdings error:', err);
    res.status(500).json({ error: 'Failed to get holdings' });
  }
});

/**
 * GET /api/holdings/:id
 * Get single holding with full details
 */
router.get('/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const holding = await prisma.holding.findUnique({
      where: { id: req.params.id },
      include: {
        portfolio: true,
        taxLots: {
          orderBy: { purchaseDate: 'asc' }
        }
      }
    });

    if (!holding || holding.portfolio.userId !== req.user.id) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    // Enrich with market data
    const quote = await MarketDataService.getQuote(holding.symbol);
    const shares = Number(holding.shares);
    const costBasis = Number(holding.avgCostBasis);
    const price = quote?.price || costBasis;

    const enriched = {
      ...holding,
      shares,
      avgCostBasis: costBasis,
      currentPrice: price,
      marketValue: shares * price,
      totalCost: shares * costBasis,
      gain: (shares * price) - (shares * costBasis),
      gainPct: ((price - costBasis) / costBasis) * 100,
      dayChange: quote?.change || 0,
      dayChangePct: quote?.changePercent || 0,
      quote
    };

    res.json(enriched);
  } catch (err) {
    logger.error('Get holding error:', err);
    res.status(500).json({ error: 'Failed to get holding' });
  }
});

/**
 * PUT /api/holdings/:id
 * Update holding
 */
router.put('/:id', [
  param('id').isUUID(),
  body('shares').optional().isFloat({ gt: 0 }),
  body('avgCostBasis').optional().isFloat({ gt: 0 }),
  body('notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const holding = await prisma.holding.findUnique({
      where: { id: req.params.id },
      include: { portfolio: true }
    });

    if (!holding || holding.portfolio.userId !== req.user.id) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const { shares, avgCostBasis, notes } = req.body;

    const updated = await prisma.holding.update({
      where: { id: req.params.id },
      data: {
        ...(shares !== undefined && { shares }),
        ...(avgCostBasis !== undefined && { avgCostBasis }),
        ...(notes !== undefined && { notes }),
        updatedAt: new Date().toISOString()
      }
    });

    logger.info(`Holding updated: ${holding.symbol}`);
    res.json(updated);
  } catch (err) {
    logger.error('Update holding error:', err);
    res.status(500).json({ error: 'Failed to update holding' });
  }
});

/**
 * DELETE /api/holdings/:id
 * Delete holding (sell all shares)
 */
router.delete('/:id', [
  param('id').isUUID(),
  body('sellPrice').optional().isFloat({ gt: 0 })
], async (req, res) => {
  try {
    const holding = await prisma.holding.findUnique({
      where: { id: req.params.id },
      include: { portfolio: true }
    });

    if (!holding || holding.portfolio.userId !== req.user.id) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const { sellPrice } = req.body;
    const shares = Number(holding.shares);

    // Get current price if sell price not provided
    let price = sellPrice;
    if (!price) {
      const quote = await MarketDataService.getQuote(holding.symbol);
      price = quote?.price || Number(holding.avgCostBasis);
    }

    // Create sell transaction
    const now = new Date().toISOString();
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        portfolioId: holding.portfolioId,
        symbol: holding.symbol,
        type: 'sell',
        shares,
        price,
        amount: shares * price,
        executedAt: now,
        createdAt: now
      }
    });

    // Delete holding
    await prisma.holding.delete({
      where: { id: req.params.id }
    });

    logger.info(`Holding deleted: ${holding.symbol}`);
    res.json({ 
      message: 'Holding sold',
      proceeds: shares * price
    });
  } catch (err) {
    logger.error('Delete holding error:', err);
    res.status(500).json({ error: 'Failed to delete holding' });
  }
});

/**
 * POST /api/holdings/:id/sell
 * Sell partial shares
 */
router.post('/:id/sell', [
  param('id').isUUID(),
  body('shares').isFloat({ gt: 0 }),
  body('price').isFloat({ gt: 0 }),
  body('method').optional().isIn(['FIFO', 'LIFO', 'HIFO', 'SPECIFIC'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const holding = await prisma.holding.findUnique({
      where: { id: req.params.id },
      include: { 
        portfolio: true,
        taxLots: {
          orderBy: { purchaseDate: 'asc' }
        }
      }
    });

    if (!holding || holding.portfolio.userId !== req.user.id) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const { shares, price, method = 'FIFO' } = req.body;

    if (shares > Number(holding.shares)) {
      return res.status(400).json({ error: 'Cannot sell more shares than owned' });
    }

    // Calculate cost basis based on method
    let remainingToSell = shares;
    let totalCostBasis = 0;
    const lotsToUpdate = [];
    const lotsToDelete = [];

    // Sort lots based on method
    const sortedLots = [...holding.taxLots];
    if (method === 'LIFO') {
      sortedLots.reverse();
    } else if (method === 'HIFO') {
      sortedLots.sort((a, b) => Number(b.costBasis) - Number(a.costBasis));
    }

    for (const lot of sortedLots) {
      if (remainingToSell <= 0) break;

      const lotShares = Number(lot.shares);
      const lotCost = Number(lot.costBasis);

      if (lotShares <= remainingToSell) {
        // Sell entire lot
        totalCostBasis += lotShares * lotCost;
        remainingToSell -= lotShares;
        lotsToDelete.push(lot.id);
      } else {
        // Partial lot sale
        totalCostBasis += remainingToSell * lotCost;
        lotsToUpdate.push({
          id: lot.id,
          shares: lotShares - remainingToSell
        });
        remainingToSell = 0;
      }
    }

    const proceeds = shares * price;
    const gain = proceeds - totalCostBasis;

    // Update/delete tax lots
    for (const lotId of lotsToDelete) {
      await prisma.taxLot.delete({ where: { id: lotId } });
    }
    for (const lot of lotsToUpdate) {
      await prisma.taxLot.update({
        where: { id: lot.id },
        data: { shares: lot.shares }
      });
    }

    // Update holding
    const newShares = Number(holding.shares) - shares;
    if (newShares <= 0) {
      await prisma.holding.delete({ where: { id: req.params.id } });
    } else {
      // Recalculate average cost
      const remainingLots = await prisma.taxLot.findMany({
        where: { holdingId: req.params.id }
      });
      const totalRemainingCost = remainingLots.reduce(
        (sum, lot) => sum + (Number(lot.shares) * Number(lot.costBasis)), 0
      );
      const newAvgCost = totalRemainingCost / newShares;

      await prisma.holding.update({
        where: { id: req.params.id },
        data: {
          shares: newShares,
          avgCostBasis: newAvgCost
        }
      });
    }

    // Create sell transaction
    const sellTime = new Date().toISOString();
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        portfolioId: holding.portfolioId,
        symbol: holding.symbol,
        type: 'sell',
        shares,
        price,
        amount: proceeds,
        notes: `Cost basis: $${totalCostBasis.toFixed(2)}, Gain: $${gain.toFixed(2)}`,
        executedAt: sellTime,
        createdAt: sellTime
      }
    });

    logger.info(`Sold ${shares} shares of ${holding.symbol}`);
    res.json({
      sharesSold: shares,
      price,
      proceeds,
      costBasis: totalCostBasis,
      gain,
      gainPct: (gain / totalCostBasis) * 100
    });
  } catch (err) {
    logger.error('Sell shares error:', err);
    res.status(500).json({ error: 'Failed to sell shares' });
  }
});

module.exports = router;
