const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { paginationMiddleware, buildPaginationMeta } = require('../middleware/pagination');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/transactions
 * Get all transactions for user with pagination
 * Query params: page, limit, portfolioId, symbol, type, startDate, endDate, sortBy, sortOrder
 */
router.get('/', [
  paginationMiddleware('transactions'),
  query('portfolioId').optional().isUUID(),
  query('symbol').optional().trim().toUpperCase(),
  query('type').optional().isIn(['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { portfolioId, symbol, type, startDate, endDate } = req.query;
    const { page, limit, offset, sortBy, sortOrder } = req.pagination;

    const where = { userId: req.user.id };

    if (portfolioId) where.portfolioId = portfolioId;
    if (symbol) where.symbol = symbol;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) where.executedAt.gte = new Date(startDate);
      if (endDate) where.executedAt.lte = new Date(endDate);
    }

    // Map sort fields to valid Prisma fields
    const sortFieldMap = {
      'created_at': 'executedAt',
      'date': 'executedAt',
      'executedAt': 'executedAt',
      'symbol': 'symbol',
      'type': 'type',
      'amount': 'amount'
    };
    const orderField = sortFieldMap[sortBy] || 'executedAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          portfolio: {
            select: { id: true, name: true }
          }
        },
        orderBy: { [orderField]: orderDir },
        take: limit,
        skip: offset
      }),
      prisma.transaction.count({ where })
    ]);

    const pagination = buildPaginationMeta(total, page, limit);

    res.json({
      success: true,
      data: transactions.map(t => ({
        ...t,
        shares: t.shares ? Number(t.shares) : null,
        price: t.price ? Number(t.price) : null,
        amount: Number(t.amount),
        fees: Number(t.fees)
      })),
      pagination,
      // Legacy fields for backwards compatibility
      transactions: transactions.map(t => ({
        ...t,
        shares: t.shares ? Number(t.shares) : null,
        price: t.price ? Number(t.price) : null,
        amount: Number(t.amount),
        fees: Number(t.fees)
      })),
      total,
      limit,
      offset
    });
  } catch (err) {
    logger.error('Get transactions error:', err);
    res.status(500).json({ success: false, error: 'Failed to get transactions' });
  }
});

/**
 * POST /api/transactions
 * Create new transaction
 */
router.post('/', [
  body('portfolioId').isUUID(),
  body('symbol').trim().toUpperCase().notEmpty(),
  body('type').isIn(['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out']),
  body('shares').optional().isFloat({ gt: 0 }),
  body('price').optional().isFloat({ gt: 0 }),
  body('amount').isFloat(),
  body('fees').optional().isFloat({ min: 0 }),
  body('executedAt').isISO8601(),
  body('notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    logger.info('=== CREATE TRANSACTION REQUEST ===');
    logger.info('Body:', JSON.stringify(req.body));
    logger.info('User:', req.user?.id);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation errors:', JSON.stringify(errors.array()));
      return res.status(400).json({ errors: errors.array() });
    }

    const { portfolioId, symbol, type, shares, price, amount, fees, executedAt, notes } = req.body;
    logger.info(`Extracted data: portfolio=${portfolioId}, symbol=${symbol}, type=${type}, shares=${shares}, price=${price}, amount=${amount}`);

    // Verify portfolio ownership
    logger.info('Verifying portfolio ownership...');
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: req.user.id }
    });

    if (!portfolio) {
      logger.error('Portfolio not found or unauthorized');
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    logger.info('Portfolio verified:', portfolio.id);

    // Create transaction
    logger.info('Creating transaction...');
    const transaction = await prisma.transaction.create({
      data: {
        userId: req.user.id,
        portfolioId,
        symbol,
        type,
        shares,
        price,
        amount,
        fees: fees || 0,
        executedAt: new Date(executedAt),
        notes
      }
    });
    logger.info('Transaction created:', transaction.id);

    // Update holding based on transaction type
    if (type === 'buy') {
      await updateHoldingOnBuySimple(portfolioId, symbol, shares, price);
    } else if (type === 'sell') {
      await updateHoldingOnSellSimple(portfolioId, symbol, shares);
    } else if (type === 'dividend') {
      // Update cash balance if portfolio exists
      try {
        await prisma.portfolio.update({
          where: { id: portfolioId },
          data: { cashBalance: { increment: amount } }
        });
      } catch (err) {
        // Ignore if portfolio doesn't support cash balance
      }
    }

    logger.info(`Transaction created: ${type} ${shares || ''} ${symbol}`);
    res.status(201).json({
      ...transaction,
      shares: transaction.shares ? Number(transaction.shares) : null,
      price: transaction.price ? Number(transaction.price) : null,
      amount: Number(transaction.amount),
      fees: Number(transaction.fees)
    });
  } catch (err) {
    logger.error('Create transaction error:', err.message);
    logger.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'Failed to create transaction', details: err.message });
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete transaction
 */
router.delete('/:id', [
  param('id').isUUID()
], async (req, res) => {
  try {
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await prisma.transaction.delete({
      where: { id: req.params.id }
    });

    logger.info(`Transaction deleted: ${transaction.id}`);
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    logger.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

/**
 * POST /api/transactions/import
 * Bulk import transactions from CSV
 */
router.post('/import', [
  body('portfolioId').isUUID(),
  body('transactions').isArray({ min: 1 })
], async (req, res) => {
  try {
    const { portfolioId, transactions } = req.body;

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: req.user.id }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const results = { imported: 0, errors: [] };

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      try {
        await prisma.transaction.create({
          data: {
            userId: req.user.id,
            portfolioId,
            symbol: t.symbol?.toUpperCase(),
            type: t.type,
            shares: t.shares,
            price: t.price,
            amount: t.amount || (t.shares * t.price),
            fees: t.fees || 0,
            executedAt: new Date(t.date || t.executedAt),
            notes: t.notes
          }
        });

        // Update holding
        if (t.type === 'buy') {
          await updateHoldingOnBuy(portfolioId, t.symbol.toUpperCase(), t.shares, t.price, t.date);
        } else if (t.type === 'sell') {
          await updateHoldingOnSell(portfolioId, t.symbol.toUpperCase(), t.shares);
        }

        results.imported++;
      } catch (err) {
        results.errors.push({ row: i + 1, error: err.message });
      }
    }

    logger.info(`Imported ${results.imported} transactions`);
    res.json(results);
  } catch (err) {
    logger.error('Import transactions error:', err);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

// Helper functions
async function updateHoldingOnBuy(portfolioId, symbol, shares, price, purchaseDate) {
  const existing = await prisma.holding.findFirst({
    where: { portfolioId, symbol }
  });

  if (existing) {
    const existingShares = Number(existing.shares);
    const existingCost = Number(existing.avgCostBasis);
    const totalShares = existingShares + shares;
    const newAvgCost = ((existingShares * existingCost) + (shares * price)) / totalShares;

    await prisma.holding.update({
      where: { id: existing.id },
      data: {
        shares: totalShares,
        avgCostBasis: newAvgCost,
        taxLots: {
          create: {
            shares,
            costBasis: price,
            purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date()
          }
        }
      }
    });
  } else {
    await prisma.holding.create({
      data: {
        portfolioId,
        symbol,
        shares,
        avgCostBasis: price,
        taxLots: {
          create: {
            shares,
            costBasis: price,
            purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date()
          }
        }
      }
    });
  }
}

async function updateHoldingOnSell(portfolioId, symbol, shares) {
  const holding = await prisma.holding.findFirst({
    where: { portfolioId, symbol },
    include: { taxLots: { orderBy: { purchaseDate: 'asc' } } }
  });

  if (!holding) return;

  const newShares = Number(holding.shares) - shares;
  
  if (newShares <= 0) {
    await prisma.holding.delete({ where: { id: holding.id } });
  } else {
    // FIFO: Remove from oldest lots first
    let remainingToSell = shares;
    for (const lot of holding.taxLots) {
      if (remainingToSell <= 0) break;
      
      const lotShares = Number(lot.shares);
      if (lotShares <= remainingToSell) {
        await prisma.taxLot.delete({ where: { id: lot.id } });
        remainingToSell -= lotShares;
      } else {
        await prisma.taxLot.update({
          where: { id: lot.id },
          data: { shares: lotShares - remainingToSell }
        });
        remainingToSell = 0;
      }
    }

    await prisma.holding.update({
      where: { id: holding.id },
      data: { shares: newShares }
    });
  }
}

// Simplified helper functions without taxLots
async function updateHoldingOnBuySimple(portfolioId, symbol, shares, price) {
  const existing = await prisma.holding.findFirst({
    where: { portfolioId, symbol }
  });

  if (existing) {
    const existingShares = Number(existing.shares);
    const existingCost = Number(existing.avgCostBasis || existing.avg_cost_basis || 0);
    const totalShares = existingShares + shares;
    const newAvgCost = ((existingShares * existingCost) + (shares * price)) / totalShares;

    await prisma.holding.update({
      where: { id: existing.id },
      data: {
        shares: totalShares,
        avgCostBasis: newAvgCost,
        avg_cost_basis: newAvgCost
      }
    });
  } else {
    await prisma.holding.create({
      data: {
        portfolioId,
        symbol,
        name: symbol,
        shares,
        avgCostBasis: price,
        avg_cost_basis: price,
        sector: null,
        assetType: 'stock',
        asset_type: 'stock'
      }
    });
  }
}

async function updateHoldingOnSellSimple(portfolioId, symbol, shares) {
  const holding = await prisma.holding.findFirst({
    where: { portfolioId, symbol }
  });

  if (!holding) return;

  const newShares = Number(holding.shares) - shares;

  if (newShares <= 0) {
    await prisma.holding.delete({ where: { id: holding.id } });
  } else {
    await prisma.holding.update({
      where: { id: holding.id },
      data: { shares: newShares }
    });
  }
}

module.exports = router;
