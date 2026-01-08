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
    const portfolioId = req.query.portfolio_id || req.query.portfolioId;

    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    // Verify portfolio ownership
    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: portfolioId,
        user_id: req.user.id
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get holdings
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id: portfolioId },
      include: { 
        tax_lots: {
          orderBy: { purchase_date: 'asc' }
        }
      },
      orderBy: { created_at: 'asc' }
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
          avg_cost_basis: costBasis,
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
 * Accepts both camelCase and snake_case field names for flexibility
 */
router.post('/', async (req, res) => {
  try {
    // Support both field name formats (camelCase and snake_case)
    const portfolioId = req.body.portfolioId || req.body.portfolio_id;
    const symbol = (req.body.symbol || '').trim().toUpperCase();
    const shares = parseFloat(req.body.shares || req.body.quantity);
    const avgCostBasis = parseFloat(req.body.avgCostBasis || req.body.purchase_price || req.body.avg_cost_basis);
    const purchaseDate = req.body.purchaseDate || req.body.purchase_date;
    const notes = req.body.notes || '';
    const assetType = req.body.asset_type || req.body.assetType || 'stock';
    const name = req.body.name || symbol;

    // Validation
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    if (isNaN(shares) || shares <= 0) {
      return res.status(400).json({ error: 'Valid quantity/shares is required' });
    }
    if (isNaN(avgCostBasis) || avgCostBasis <= 0) {
      return res.status(400).json({ error: 'Valid purchase price is required' });
    }

    // Verify portfolio ownership
    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: portfolioId,
        user_id: req.user.id
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Try to get stock info (but allow adding even if quote fails)
    let quote = null;
    try {
      quote = await MarketDataService.getQuote(symbol);
    } catch (err) {
      logger.warn(`Could not fetch quote for ${symbol}, proceeding with user data`);
    }

    // Check if holding exists
    const existingHolding = await prisma.holdings.findFirst({
      where: { portfolio_id: portfolioId,
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
      const holding = await prisma.holdings.update({
        where: { id: existingHolding.id },
        data: {
          shares: totalShares,
          avg_cost_basis: newAvgCost,
          updated_at: now,
          tax_lots: {
            create: {
              id: crypto.randomUUID(),
              shares: newShares,
              cost_basis: newCost,
              purchase_date: purchaseDate ? new Date(purchaseDate) : new Date(now),
              created_at: now
            }
          }
        },
        include: { tax_lots: true }
      });

      logger.info(`Added ${shares} shares of ${symbol} to existing holding`);
      return res.json(holding);
    }

    // Create new holding
    const now = new Date().toISOString();
    logger.info(`Creating holding: ${symbol} in portfolio ${portfolio.name}`);
    const holding = await prisma.holdings.create({
      data: {
        id: crypto.randomUUID(),
        portfolio_id: portfolioId,
        symbol,
        shares,
        avg_cost_basis: avgCostBasis,
        sector: quote?.sector || null,
        asset_type: quote?.assetType || assetType || 'stock',
        notes: notes || null,
        created_at: now,
        updated_at: now,
        tax_lots: {
          create: {
            id: crypto.randomUUID(),
            shares,
            cost_basis: avgCostBasis,
            purchase_date: purchaseDate ? new Date(purchaseDate) : new Date(now),
            created_at: now
          }
        }
      },
      include: { tax_lots: true }
    });

    // Create buy transaction
    await prisma.transactions.create({ 
      data: { id: crypto.randomUUID(),
        user_id: req.user.id,
        portfolio_id: portfolioId,
        symbol,
        type: 'buy',
        shares,
        price: avgCostBasis,
        amount: shares * avgCostBasis,
        executed_at: purchaseDate ? new Date(purchaseDate).toISOString() : now,
        created_at: now
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
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { 
        holdings: {
          include: { 
            portfolios: {
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
        avg_cost_basis: avgCost,
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
        portfolio_id: h.portfolio_id,
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
    const holding = await prisma.holdings.findUnique({
      where: { id: req.params.id },
      include: { 
        portfolios: true,
        tax_lots: {
          orderBy: { purchase_date: 'asc' }
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
      avg_cost_basis: costBasis,
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

    const holding = await prisma.holdings.findUnique({
      where: { id: req.params.id },
      include: { portfolios: true }
    });

    if (!holding || holding.portfolio.userId !== req.user.id) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const { shares, avgCostBasis, notes } = req.body;

    const updated = await prisma.holdings.update({
      where: { id: req.params.id },
      data: { id: crypto.randomUUID(),
        ...(shares !== undefined && { shares }),
        ...(avgCostBasis !== undefined && { avgCostBasis }),
        ...(notes !== undefined && { notes }),
        updated_at: new Date().toISOString()
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
    const holding = await prisma.holdings.findUnique({
      where: { id: req.params.id },
      include: { portfolios: true }
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
    await prisma.transactions.create({ 
      data: { id: crypto.randomUUID(),
        user_id: req.user.id,
        portfolio_id: holding.portfolio_id,
        symbol: holding.symbol,
        type: 'sell',
        shares,
        price,
        amount: shares * price,
        executed_at: now,
        created_at: now
      }
    });

    // Delete holding
    await prisma.holdings.delete({
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

    const holding = await prisma.holdings.findUnique({
      where: { id: req.params.id },
      include: { 
        portfolios: true,
        tax_lots: {
          orderBy: { purchase_date: 'asc' }
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
      await prisma.holdings.delete({ where: { id: req.params.id } });
    } else {
      // Recalculate average cost
      const remainingLots = await prisma.taxLot.findMany({
        where: { holdingId: req.params.id }
      });
      const totalRemainingCost = remainingLots.reduce(
        (sum, lot) => sum + (Number(lot.shares) * Number(lot.costBasis)), 0
      );
      const newAvgCost = totalRemainingCost / newShares;

      await prisma.holdings.update({
        where: { id: req.params.id },
        data: { id: crypto.randomUUID(),
          shares: newShares,
          avg_cost_basis: newAvgCost
        }
      });
    }

    // Create sell transaction
    const sellTime = new Date().toISOString();
    await prisma.transactions.create({ 
      data: { id: crypto.randomUUID(),
        user_id: req.user.id,
        portfolio_id: holding.portfolio_id,
        symbol: holding.symbol,
        type: 'sell',
        shares,
        price,
        amount: proceeds,
        notes: `Cost basis: $${totalCostBasis.toFixed(2)}, Gain: $${gain.toFixed(2)}`,
        executed_at: sellTime,
        created_at: sellTime
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
