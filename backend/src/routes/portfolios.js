const crypto = require('crypto');
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const Database = require('../db/database');
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
    // Use Prisma for PostgreSQL (production) or SQLite Database adapter (local)
    let portfolios;

    if (prisma) {
      // PostgreSQL mode - use Prisma (lowercase model names for production)
      const rawPortfolios = await prisma.portfolios.findMany({
        where: { user_id: req.user.id },
        include: { holdings: true }
      });

      portfolios = rawPortfolios.map(p => ({
        id: p.id,
        userId: p.user_id || p.userId,
        name: p.name,
        description: p.description,
        currency: p.currency,
        benchmark: p.benchmark,
        cash_balance: Number(p.cash_balance || p.cash_balance) || 0,
        is_default: p.is_default || p.is_default,
        created_at: p.created_at || p.created_at,
        holdings: (p.holdings || []).map(h => ({
          id: h.id,
          symbol: h.symbol,
          shares: Number(h.shares),
          avgCostBasis: Number(h.avg_cost_basis || h.avg_cost_basis),
          sector: h.sector
        }))
      }));
    } else {
      // SQLite mode - use Database adapter
      const rawPortfolios = Database.getPortfoliosByUser(req.user.id);
      portfolios = rawPortfolios.map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.name,
        description: p.description,
        currency: p.currency,
        benchmark: p.benchmark,
        cash_balance: p.cash_balance || 0,
        is_default: p.is_default === 1,
        created_at: p.created_at,
        holdings: Database.getHoldingsByPortfolio(p.id).map(h => ({
          id: h.id,
          symbol: h.symbol,
          shares: h.shares,
          avgCostBasis: h.avg_cost_basis,
          sector: h.sector
        }))
      }));
    }

    // Enrich with market data
    const enrichedPortfolios = await Promise.all(
      portfolios.map(async (portfolio) => {
        // Get transaction count
        let transactionCount = 0;
        if (prisma) {
          transactionCount = await prisma.transactions.count({
            where: { portfolio_id: portfolio.id }
          });
        } else {
          const transactions = Database.getTransactionsByPortfolio(portfolio.id) || [];
          transactionCount = transactions.length;
        }
        const symbols = portfolio.holdings.map(h => h.symbol);
        const quotes = await MarketDataService.getQuotes(symbols);

        let totalValue = Number(portfolio.cash_balance);
        let totalCost = 0;
        let dayChange = 0;

        const enrichedHoldings = portfolio.holdings.map(holding => {
          const quote = quotes[holding.symbol] || {};
          const shares = Number(holding.shares);
          const costBasis = Number(holding.avg_cost_basis);
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

        const totalGain = totalValue - totalCost - Number(portfolio.cash_balance);
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
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
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
      totalCash += Number(portfolio.cash_balance || portfolio.cash_balance);
      const symbols = (portfolio.holdings || []).map(h => h.symbol);
      if (symbols.length === 0) continue;

      const quotes = await MarketDataService.getQuotes(symbols);

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis || h.avg_cost_basis);
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
          portfolio_id: portfolio.id,
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
        is_default: p.is_default || p.is_default,
        cash_balance: Number(p.cash_balance || p.cash_balance),
        holdingsCount: (p.holdings || []).length
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

    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      include: {
        holdings: {
          include: {
            tax_lots: {
              orderBy: { purchase_date: 'asc' }
            }
          }
        },
        transactions: {
          orderBy: { executed_at: 'desc' },
          take: 50
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Enrich with market data
    const symbols = (portfolio.holdings || []).map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    const cashBalance = Number(portfolio.cash_balance || portfolio.cash_balance) || 0;
    let totalValue = cashBalance;
    let totalCost = 0;
    let dayChange = 0;

    const enrichedHoldings = await Promise.all(
      (portfolio.holdings || []).map(async (holding) => {
        const quote = quotes[holding.symbol] || {};
        const shares = Number(holding.shares);
        const costBasis = Number(holding.avg_cost_basis || holding.avg_cost_basis);
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
        const taxLots = (holding.tax_lots || holding.taxLots || []).map(lot => {
          const lotShares = Number(lot.shares);
          const lotCost = Number(lot.cost_basis || lot.costBasis);
          const lotValue = lotShares * price;
          const lotGain = lotValue - (lotShares * lotCost);
          const purchaseDate = lot.purchase_date || lot.purchaseDate;
          const holdingDays = Math.floor((new Date() - new Date(purchaseDate)) / (1000 * 60 * 60 * 24));

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

    const totalGain = totalValue - totalCost - cashBalance;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    res.json({
      ...portfolio,
      cashBalance,
      holdings: enrichedHoldings,
      totalValue,
      totalCost,
      totalGain,
      totalGainPct,
      dayChange,
      dayChangePct: (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      cashWeight: totalValue > 0 ? (cashBalance / totalValue) * 100 : 0
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

    let portfolio;

    if (prisma) {
      // PostgreSQL mode - use Prisma (lowercase model/column names for production)
      const existing = await prisma.portfolios.findFirst({
        where: { user_id: req.user.id, name }
      });

      if (existing) {
        return res.status(400).json({ error: 'Portfolio with this name already exists' });
      }

      portfolio = await prisma.portfolios.create({
        data: { id: crypto.randomUUID(),
          user_id: req.user.id,
          name,
          description: description || null,
          currency: currency || 'USD',
          benchmark: benchmark || 'SPY',
          cash_balance: cashBalance || 0,
          is_default: false, updated_at: new Date()
        }
      });

      logger.info(`Portfolio created: ${name} for user ${req.user.email}`);
      res.status(201).json({
        id: portfolio.id,
        userId: portfolio.user_id || portfolio.userId,
        name: portfolio.name,
        description: portfolio.description,
        currency: portfolio.currency,
        benchmark: portfolio.benchmark,
        cash_balance: portfolio.cash_balance || portfolio.cash_balance,
        created_at: portfolio.created_at || portfolio.created_at
      });
    } else {
      // SQLite mode - use Database adapter
      const userPortfolios = Database.getPortfoliosByUser(req.user.id);
      const existing = userPortfolios.find(p => p.name === name);

      if (existing) {
        return res.status(400).json({ error: 'Portfolio with this name already exists' });
      }

      portfolio = Database.createPortfolio(
        req.user.id,
        name,
        description,
        currency || 'USD',
        benchmark || 'SPY',
        cashBalance || 0,
        false // isDefault
      );

      logger.info(`Portfolio created: ${name} for user ${req.user.email}`);
      res.status(201).json({
        id: portfolio.id,
        userId: portfolio.user_id,
        name: portfolio.name,
        description: portfolio.description,
        currency: portfolio.currency,
        benchmark: portfolio.benchmark,
        cash_balance: portfolio.cash_balance,
        created_at: portfolio.created_at
      });
    }
  } catch (err) {
    logger.error('Create portfolio error:', err);
    res.status(500).json({ error: 'Failed to create portfolio' });
  }
});

/**
 * GET /api/portfolios/:id/holdings
 * Get all holdings for a portfolio with current prices
 */
router.get('/:id/holdings', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const portfolio = await prisma.portfolios.findFirst({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get holdings
    const holdings = await prisma.holdings.findMany({
      where: { portfolio_id: req.params.id },
      orderBy: { symbol: 'asc' }
    });

    // Get current quotes for all holdings
    const symbols = holdings.map(h => h.symbol);
    let quotes = {};

    if (symbols.length > 0) {
      const MarketDataService = require('../services/marketData');
      quotes = await MarketDataService.getQuotes(symbols);
    }

    // Enrich holdings with current prices
    const enrichedHoldings = holdings.map(h => {
      const quote = quotes[h.symbol] || {};
      const avgCost = Number(h.avg_cost_basis || h.avg_cost_basis);
      const currentPrice = quote.price || avgCost;
      const marketValue = h.shares * currentPrice;
      const costTotal = h.shares * avgCost;
      const gain = marketValue - costTotal;
      const gainPercent = costTotal > 0 ? (gain / costTotal) * 100 : 0;

      return {
        id: h.id,
        symbol: h.symbol,
        shares: Number(h.shares),
        avgCostBasis: avgCost,
        currentPrice,
        marketValue,
        costTotal,
        gain,
        gainPercent,
        sector: h.sector || quote.sector,
        assetType: h.asset_type || h.assetType,
        change: quote.change || 0,
        changePercent: quote.changePercent || 0
      };
    });

    res.json(enrichedHoldings);
  } catch (err) {
    logger.error('Get holdings error:', err);
    res.status(500).json({ error: 'Failed to get holdings' });
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

    const { symbol, name, quantity, cost_basis, asset_type } = req.body;
    logger.info(`Adding holding: ${symbol}`, { quantity, cost_basis });

    let holding;

    if (prisma) {
      // PostgreSQL mode - use Prisma
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: req.params.id, user_id: req.user.id }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      // Check if holding already exists
      const existingHolding = await prisma.holdings.findFirst({
        where: { portfolio_id: req.params.id, symbol: symbol.toUpperCase() }
      });

      if (existingHolding) {
        const oldShares = Number(existingHolding.shares);
        const oldCost = Number(existingHolding.avg_cost_basis || existingHolding.avg_cost_basis);
        const newShares = oldShares + Number(quantity);
        const newCostBasis = ((oldShares * oldCost) + (Number(quantity) * Number(cost_basis))) / newShares;

        holding = await prisma.holdings.update({
          where: { id: existingHolding.id },
          data: { shares: newShares, avg_cost_basis: newCostBasis }
        });
      } else {
        holding = await prisma.holdings.create({
          data: { id: crypto.randomUUID(),
            portfolio_id: req.params.id,
            symbol: symbol.toUpperCase(),
            shares: Number(quantity),
            avg_cost_basis: Number(cost_basis),
            sector: null,
            asset_type: asset_type || 'stock'
          }
        });
      }

      // Create transaction record
      await prisma.transactions.create({
        data: { id: crypto.randomUUID(),
          user_id: req.user.id,
          portfolio_id: req.params.id,
          symbol: symbol.toUpperCase(),
          type: 'buy',
          shares: Number(quantity),
          price: Number(cost_basis),
          amount: Number(quantity) * Number(cost_basis),
          executed_at: new Date()
        }
      });

      res.status(201).json({
        id: holding.id,
        portfolio_id: holding.portfolio_id,
        symbol: holding.symbol,
        shares: holding.shares,
        avgCostBasis: holding.avg_cost_basis,
        sector: holding.sector
      });
    } else {
      // SQLite mode - use Database adapter
      const portfolio = Database.getPortfolioById(req.params.id);

      if (!portfolio || portfolio.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      let sqliteHolding = Database.getHoldingBySymbol(req.params.id, symbol.toUpperCase());

      if (sqliteHolding) {
        const newShares = Number(sqliteHolding.shares) + Number(quantity);
        const newCostBasis = ((Number(sqliteHolding.shares) * Number(sqliteHolding.avg_cost_basis)) + (Number(quantity) * Number(cost_basis))) / newShares;
        sqliteHolding = Database.updateHolding(sqliteHolding.id, newShares, newCostBasis);
      } else {
        sqliteHolding = Database.createHolding(
          req.params.id,
          symbol.toUpperCase(),
          name || symbol.toUpperCase(),
          Number(quantity),
          Number(cost_basis),
          asset_type || 'stock',
          asset_type || 'stock'
        );
      }

      Database.createTransaction(
        req.user.id,
        req.params.id,
        symbol.toUpperCase(),
        'buy',
        Number(quantity),
        Number(cost_basis)
      );

      res.status(201).json({
        id: sqliteHolding.id,
        portfolio_id: sqliteHolding.portfolio_id,
        symbol: sqliteHolding.symbol,
        shares: sqliteHolding.shares,
        avgCostBasis: sqliteHolding.avg_cost_basis,
        sector: sqliteHolding.sector
      });
    }
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
    const existing = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const { name, description, currency, benchmark, cashBalance, isDefault } = req.body;

    // If setting as default, unset others
    if (isDefault) {
      await prisma.portfolios.updateMany({
        where: { user_id: req.user.id },
        data: { is_default: false }
      });
    }

    const portfolio = await prisma.portfolios.update({
      where: { id: req.params.id },
      data: { id: crypto.randomUUID(),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(currency && { currency }),
        ...(benchmark && { benchmark }),
        ...(cashBalance !== undefined && { cash_balance: cashBalance }),
        ...(isDefault !== undefined && { is_default: isDefault }),
        updated_at: new Date()
      }
    });

    logger.info(`Portfolio updated: ${portfolio.name}`);
    res.json({
      ...portfolio,
      userId: portfolio.user_id,
      cash_balance: portfolio.cash_balance,
      is_default: portfolio.is_default,
      created_at: portfolio.created_at,
      updated_at: portfolio.updated_at
    });
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
    const existing = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    if (existing.is_default || existing.is_default) {
      return res.status(400).json({ error: 'Cannot delete default portfolio' });
    }

    await prisma.portfolios.delete({
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

    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      include: {
        holdings: true,
        portfolio_snapshots: {
          orderBy: { snapshot_date: 'desc' },
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
    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
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
    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
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
    const portfolio = await prisma.portfolios.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
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
    const portfolio = await prisma.portfolios.findFirst({
      where: { id, user_id: req.user.id }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Build filter conditions
    const where = { portfolio_id: id };
    if (type) where.type = type;
    if (symbol) where.symbol = symbol.toUpperCase();

    // Get transactions from database
    const transactions = await prisma.transactions.findMany({
      where,
      orderBy: { executed_at: 'desc' },
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
        executed_at: true,
        created_at: true
      }
    });

    // Get total count for pagination
    const total = await prisma.transactions.count({ where });

    // Format response
    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      date: (t.executed_at || t.executedAt).toISOString(),
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
