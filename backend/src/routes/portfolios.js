const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const AnalyticsService = require('../services/analytics');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/portfolios:
 *   get:
 *     tags: [Portfolios]
 *     summary: Get all portfolios
 *     responses:
 *       200:
 *         description: List of portfolios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Portfolio'
 */
router.get('/', async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        holdings: {
          select: {
            id: true,
            symbol: true,
            shares: true,
            avgCostBasis: true,
            sector: true
          }
        }
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    // Enrich with market data
    const enrichedPortfolios = await Promise.all(
      portfolios.map(async (portfolio) => {
        // Get transaction count
        const transactionCount = await prisma.transaction.count({
          where: { portfolioId: portfolio.id }
        });
        const symbols = portfolio.holdings.map(h => h.symbol);
        const quotes = await MarketDataService.getQuotes(symbols);

        let totalValue = Number(portfolio.cashBalance);
        let totalCost = 0;
        let dayChange = 0;

        const enrichedHoldings = portfolio.holdings.map(holding => {
          const quote = quotes[holding.symbol] || {};
          const shares = Number(holding.shares);
          const costBasis = Number(holding.avgCostBasis);
          const price = Number(quote.price) || costBasis;
          const prevClose = Number(quote.previousClose) || price;

          const marketValue = shares * price;
          const cost = shares * costBasis;
          const gain = marketValue - cost;
          const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
          const dayGain = shares * (price - prevClose);

          totalValue += marketValue;
          totalCost += cost;
          dayChange += dayGain;

          return {
            ...holding,
            shares: shares,
            avgCostBasis: costBasis,
            price,
            marketValue,
            gain,
            gainPct,
            dayGain,
            dayGainPct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
          };
        });

        const totalGain = totalValue - totalCost - Number(portfolio.cashBalance);
        const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
        const dayChangePct = (totalValue - dayChange) > 0
          ? (dayChange / (totalValue - dayChange)) * 100
          : 0;

        return {
          ...portfolio,
          holdings: enrichedHoldings,
          totalValue,
          totalCost,
          totalGain,
          totalGainPct,
          dayChange,
          dayChangePct,
          holdingsCount: portfolio.holdings.length,
          transactionsCount: transactionCount
        };
      })
    );

    res.json(enrichedPortfolios);
  } catch (err) {
    logger.error('Get portfolios error:', err);
    res.status(500).json({ error: 'Failed to get portfolios' });
  }
});

/**
 * GET /api/portfolios/summary
 * Get aggregated summary across all portfolios
 */
router.get('/summary', async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        holdings: true
      }
    });

    // Aggregate metrics across all portfolios
    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;
    let totalCash = 0;
    let totalIncome = 0;
    let holdingsCount = 0;
    const allHoldings = [];
    const sectorMap = {};

    for (const portfolio of portfolios) {
      totalCash += Number(portfolio.cashBalance);
      const symbols = portfolio.holdings.map(h => h.symbol);
      if (symbols.length === 0) continue;

      const quotes = await MarketDataService.getQuotes(symbols);

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avgCostBasis);
        const price = Number(quote.price) || cost;
        const value = shares * price;
        const costBasis = shares * cost;
        const sector = quote.sector || h.sector || 'Unknown';

        totalValue += value;
        totalCost += costBasis;
        totalGain += (value - costBasis);
        totalIncome += value * (Number(quote.dividendYield) || 0) / 100;
        holdingsCount++;

        // Track sector allocation
        sectorMap[sector] = (sectorMap[sector] || 0) + value;

        allHoldings.push({
          symbol: h.symbol,
          name: quote.name || h.symbol,
          value,
          cost: costBasis,
          gain: value - costBasis,
          gainPct: costBasis > 0 ? ((value - costBasis) / costBasis * 100) : 0,
          sector,
          portfolioId: portfolio.id,
          portfolioName: portfolio.name
        });
      }
    }

    totalValue += totalCash;

    // Calculate sector allocation
    const sectors = Object.entries(sectorMap).map(([name, value]) => ({
      name,
      value: Number(value),
      weight: totalValue > 0 ? (Number(value) / totalValue * 100) : 0
    })).sort((a, b) => b.value - a.value);

    // Top holdings
    const topHoldings = [...allHoldings]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    res.json({
      totalValue,
      totalCost,
      totalGain,
      totalGainPct: totalCost > 0 ? (totalGain / totalCost * 100) : 0,
      totalCash,
      totalIncome,
      portfolioCount: portfolios.length,
      holdingsCount,
      sectors,
      topHoldings,
      portfolios: portfolios.map(p => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        cashBalance: Number(p.cashBalance),
        holdingsCount: p.holdings.length
      }))
    });
  } catch (err) {
    logger.error('Get portfolios summary error:', err);
    res.status(500).json({ error: 'Failed to get portfolios summary' });
  }
});

/**
 * GET /api/portfolios/:id
 * Get single portfolio with full details
 */
router.get('/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        holdings: {
          include: {
            taxLots: {
              orderBy: { purchaseDate: 'asc' }
            }
          }
        },
        transactions: {
          orderBy: { executedAt: 'desc' },
          take: 50
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Enrich with market data
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalValue = Number(portfolio.cashBalance);
    let totalCost = 0;
    let dayChange = 0;

    const enrichedHoldings = await Promise.all(
      portfolio.holdings.map(async (holding) => {
        const quote = quotes[holding.symbol] || {};
        const shares = Number(holding.shares);
        const costBasis = Number(holding.avgCostBasis);
        const price = Number(quote.price) || costBasis;
        const prevClose = Number(quote.previousClose) || price;

        const marketValue = shares * price;
        const cost = shares * costBasis;
        const gain = marketValue - cost;
        const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
        const dayGain = shares * (price - prevClose);

        totalValue += marketValue;
        totalCost += cost;
        dayChange += dayGain;

        // Calculate tax lot gains
        const taxLots = holding.taxLots.map(lot => {
          const lotShares = Number(lot.shares);
          const lotCost = Number(lot.costBasis);
          const lotValue = lotShares * price;
          const lotGain = lotValue - (lotShares * lotCost);
          const holdingDays = Math.floor((new Date() - new Date(lot.purchaseDate)) / (1000 * 60 * 60 * 24));

          return {
            ...lot,
            shares: lotShares,
            costBasis: lotCost,
            currentValue: lotValue,
            gain: lotGain,
            gainPct: (lotGain / (lotShares * lotCost)) * 100,
            holdingDays,
            isLongTerm: holdingDays >= 365
          };
        });

        return {
          ...holding,
          shares,
          avgCostBasis: costBasis,
          price,
          previousClose: prevClose,
          change: quote.change,
          changePercent: quote.changePercent,
          marketValue,
          cost,
          gain,
          gainPct,
          dayGain,
          dayGainPct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
          weight: 0, // Will be calculated after total
          taxLots,
          // Additional quote data
          name: quote.name,
          sector: quote.sector || holding.sector,
          peRatio: quote.peRatio,
          dividend: quote.dividend,
          dividendYield: quote.dividendYield,
          week52High: quote.week52High,
          week52Low: quote.week52Low,
          marketCap: quote.marketCap,
          volume: quote.volume
        };
      })
    );

    // Calculate weights
    enrichedHoldings.forEach(h => {
      h.weight = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
    });

    const totalGain = totalValue - totalCost - Number(portfolio.cashBalance);
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    res.json({
      ...portfolio,
      holdings: enrichedHoldings,
      totalValue,
      totalCost,
      totalGain,
      totalGainPct,
      dayChange,
      dayChangePct: (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      cashWeight: totalValue > 0 ? (Number(portfolio.cashBalance) / totalValue) * 100 : 0
    });
  } catch (err) {
    logger.error('Get portfolio error:', err);
    res.status(500).json({ error: 'Failed to get portfolio' });
  }
});

/**
 * POST /api/portfolios
 * Create new portfolio
 */
router.post('/', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  body('benchmark').optional().trim(),
  body('cashBalance').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, currency, benchmark, cashBalance } = req.body;

    // Check for duplicate name
    const existing = await prisma.portfolio.findFirst({
      where: {
        userId: req.user.id,
        name
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Portfolio with this name already exists' });
    }

    const now = new Date().toISOString();
    const portfolio = await prisma.portfolio.create({
      data: {
        userId: req.user.id,
        name,
        description,
        currency: currency || 'USD',
        benchmark: benchmark || 'SPY',
        cashBalance: cashBalance || 0,
        createdAt: now,
        updatedAt: now
      }
    });

    logger.info(`Portfolio created: ${name} for user ${req.user.email}`);
    res.status(201).json(portfolio);
  } catch (err) {
    logger.error('Create portfolio error:', err);
    res.status(500).json({ error: 'Failed to create portfolio' });
  }
});

/**
 * POST /api/portfolios/:id/holdings
 * Add a new holding to portfolio
 */
router.post('/:id/holdings', [
  param('id').isUUID(),
  body('symbol').trim().notEmpty().isLength({ max: 20 }),
  body('name').optional().trim().isLength({ max: 200 }),
  body('quantity').isFloat({ gt: 0 }),
  body('cost_basis').isFloat({ gt: 0 }),
  body('asset_type').optional().isIn(['stock', 'etf', 'mutual_fund', 'crypto', 'bond'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const { symbol, name, quantity, cost_basis, asset_type } = req.body;
    logger.info(`Adding holding: ${symbol}`, { quantity, cost_basis });

    let holding = await prisma.holding.findFirst({
      where: { portfolioId: req.params.id, symbol: symbol.toUpperCase() }
    });

    if (holding) {
      const newShares = Number(holding.shares) + Number(quantity);
      const newCostBasis = ((Number(holding.shares) * Number(holding.avgCostBasis)) + (Number(quantity) * Number(cost_basis))) / newShares;
      holding = await prisma.holding.update({
        where: { id: holding.id },
        data: {
          shares: newShares,
          avgCostBasis: newCostBasis,
          updatedAt: new Date().toISOString()
        }
      });
    } else {
      const now = new Date().toISOString();
      holding = await prisma.holding.create({
        data: {
          portfolioId: req.params.id,
          symbol: symbol.toUpperCase(),
          shares: Number(quantity),
          avgCostBasis: Number(cost_basis),
          sector: asset_type || 'stock',
          createdAt: now,
          updatedAt: now
        }
      });
    }

    const transactionNow = new Date().toISOString();
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        portfolioId: req.params.id,
        symbol: symbol.toUpperCase(),
        type: 'buy',
        shares: Number(quantity),
        price: Number(cost_basis),
        amount: Number(quantity) * Number(cost_basis),
        executedAt: transactionNow,
        createdAt: transactionNow
      }
    });

    res.status(201).json(holding);
  } catch (err) {
    logger.error('Add holding error:', err);
    res.status(500).json({ error: 'Failed to add holding: ' + err.message });
  }
});

/**
 * PUT /api/portfolios/:id
 * Update portfolio
 */
router.put('/:id', [
  param('id').isUUID(),
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  body('benchmark').optional().trim(),
  body('cashBalance').optional().isFloat({ min: 0 }),
  body('isDefault').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check ownership
    const existing = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const { name, description, currency, benchmark, cashBalance, isDefault } = req.body;

    // If setting as default, unset others
    if (isDefault) {
      await prisma.portfolio.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    const portfolio = await prisma.portfolio.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(currency && { currency }),
        ...(benchmark && { benchmark }),
        ...(cashBalance !== undefined && { cashBalance }),
        ...(isDefault !== undefined && { isDefault }),
        updatedAt: new Date().toISOString()
      }
    });

    logger.info(`Portfolio updated: ${portfolio.name}`);
    res.json(portfolio);
  } catch (err) {
    logger.error('Update portfolio error:', err);
    res.status(500).json({ error: 'Failed to update portfolio' });
  }
});

/**
 * DELETE /api/portfolios/:id
 * Delete portfolio
 */
router.delete('/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check ownership
    const existing = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    if (existing.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default portfolio' });
    }

    await prisma.portfolio.delete({
      where: { id: req.params.id }
    });

    logger.info(`Portfolio deleted: ${existing.name}`);
    res.json({ message: 'Portfolio deleted successfully' });
  } catch (err) {
    logger.error('Delete portfolio error:', err);
    res.status(500).json({ error: 'Failed to delete portfolio' });
  }
});

/**
 * GET /api/portfolios/:id/performance
 * Get portfolio performance analytics
 */
router.get('/:id/performance', [
  param('id').isUUID(),
  query('period').optional().isIn(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        holdings: true,
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 365
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const period = req.query.period || '1M';
    const performance = await AnalyticsService.calculatePerformance(portfolio, period);

    res.json(performance);
  } catch (err) {
    logger.error('Get performance error:', err);
    res.status(500).json({ error: 'Failed to get performance' });
  }
});

/**
 * GET /api/portfolios/:id/allocation
 * Get portfolio allocation breakdown
 */
router.get('/:id/allocation', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        holdings: true
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const allocation = await AnalyticsService.calculateAllocation(portfolio);
    res.json(allocation);
  } catch (err) {
    logger.error('Get allocation error:', err);
    res.status(500).json({ error: 'Failed to get allocation' });
  }
});

/**
 * GET /api/portfolios/:id/dividends
 * Get portfolio dividend analysis
 */
router.get('/:id/dividends', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        holdings: true,
        transactions: {
          where: { type: 'dividend' },
          orderBy: { executedAt: 'desc' }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const dividends = await AnalyticsService.calculateDividends(portfolio);
    res.json(dividends);
  } catch (err) {
    logger.error('Get dividends error:', err);
    res.status(500).json({ error: 'Failed to get dividends' });
  }
});

/**
 * GET /api/portfolios/:id/risk
 * Get portfolio risk metrics
 */
router.get('/:id/risk', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        holdings: true
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const risk = await AnalyticsService.calculateRisk(portfolio);
    res.json(risk);
  } catch (err) {
    logger.error('Get risk error:', err);
    res.status(500).json({ error: 'Failed to get risk metrics' });
  }
});

/**
 * GET /api/portfolios/:id/transactions
 * Get portfolio transactions from database
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, type, symbol } = req.query;

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Build filter conditions
    const where = { portfolioId: id };
    if (type) where.type = type;
    if (symbol) where.symbol = symbol.toUpperCase();

    // Get transactions from database
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        symbol: true,
        type: true,
        shares: true,
        price: true,
        amount: true,
        fees: true,
        notes: true,
        executedAt: true,
        createdAt: true
      }
    });

    // Get total count for pagination
    const total = await prisma.transaction.count({ where });

    // Format response
    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      date: t.executedAt.toISOString(),
      type: t.type,
      symbol: t.symbol,
      shares: parseFloat(t.shares) || 0,
      price: parseFloat(t.price) || 0,
      amount: parseFloat(t.amount) || 0,
      fees: parseFloat(t.fees) || 0,
      notes: t.notes || ''
    }));

    res.json({
      transactions: formattedTransactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + formattedTransactions.length < total
      }
    });
  } catch (err) {
    logger.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

module.exports = router;
