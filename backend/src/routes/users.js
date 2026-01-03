const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * PUT /api/users/profile
 */
router.put('/profile', [
  body('firstName').optional().trim().isLength({ max: 50 }),
  body('lastName').optional().trim().isLength({ max: 50 }),
  body('phone').optional().trim(),
  body('timezone').optional().trim(),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  body('theme').optional().isIn(['light', 'dark', 'system'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, timezone, currency, theme } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
        ...(theme !== undefined && { theme })
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        timezone: true,
        currency: true,
        theme: true
      }
    });

    res.json(user);
  } catch (err) {
    logger.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PUT /api/users/settings
 */
router.put('/settings', async (req, res) => {
  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...req.body },
      update: req.body
    });

    res.json(settings);
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/users/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        holdings: true,
        _count: { select: { transactions: true } }
      }
    });

    const recentTransactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { executedAt: 'desc' },
      take: 10,
      include: {
        portfolio: { select: { name: true } }
      }
    });

    const alerts = await prisma.alert.findMany({
      where: { userId: req.user.id, isActive: true, isTriggered: false },
      take: 5
    });

    // Calculate totals
    const MarketDataService = require('../services/marketData');
    let totalValue = 0;
    let totalGain = 0;
    let dayChange = 0;

    for (const portfolio of portfolios) {
      const symbols = portfolio.holdings.map(h => h.symbol);
      const quotes = await MarketDataService.getQuotes(symbols);

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avgCostBasis);
        const price = Number(quote.price) || cost;
        const prevClose = Number(quote.previousClose) || price;

        totalValue += shares * price;
        totalGain += shares * (price - cost);
        dayChange += shares * (price - prevClose);
      }
      totalValue += Number(portfolio.cashBalance);
    }

    res.json({
      summary: {
        totalValue,
        totalGain,
        totalGainPct: totalValue > 0 ? (totalGain / (totalValue - totalGain)) * 100 : 0,
        dayChange,
        dayChangePct: totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
        portfolioCount: portfolios.length,
        holdingsCount: portfolios.reduce((sum, p) => sum + p.holdings.length, 0)
      },
      portfolios: portfolios.map(p => ({
        id: p.id,
        name: p.name,
        holdingsCount: p.holdings.length,
        transactionsCount: p._count.transactions
      })),
      recentTransactions: recentTransactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        shares: t.shares ? Number(t.shares) : null,
        price: t.price ? Number(t.price) : null
      })),
      activeAlerts: alerts
    });
  } catch (err) {
    logger.error('Get dashboard error:', err);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * DELETE /api/users/account
 */
router.delete('/account', async (req, res) => {
  try {
    await prisma.user.delete({
      where: { id: req.user.id }
    });

    logger.info(`Account deleted: ${req.user.email}`);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    logger.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
