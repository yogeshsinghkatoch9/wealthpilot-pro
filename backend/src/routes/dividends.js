const express = require('express');
const { query, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');
const { paginationMiddleware, buildPaginationMeta } = require('../middleware/pagination');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/dividends/calendar
 * Get upcoming dividend events for holdings
 */
router.get('/calendar', async (req, res) => {
  try {
    // Get all user's holdings
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: { holdings: true }
    });

    const symbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    
    // Get dividend data for each symbol
    const calendar = [];
    for (const symbol of symbols) {
      const dividends = await MarketDataService.getDividendHistory(symbol);
      const quote = await MarketDataService.getQuote(symbol);
      
      // Get next expected dividend (estimate from history)
      if (dividends.length > 0) {
        const lastDiv = dividends[0];
        const frequency = lastDiv.frequency || 'quarterly';
        const monthsAhead = frequency === 'quarterly' ? 3 : frequency === 'monthly' ? 1 : 12;
        
        const nextExDate = new Date(lastDiv.exDate);
        nextExDate.setMonth(nextExDate.getMonth() + monthsAhead);
        
        if (nextExDate > new Date()) {
          calendar.push({
            symbol,
            name: quote?.name || symbol,
            exDate: nextExDate,
            payDate: new Date(nextExDate.getTime() + 14 * 24 * 60 * 60 * 1000),
            amount: Number(lastDiv.amount),
            frequency,
            yield: quote?.dividendYield || 0
          });
        }
      }
    }

    // Sort by ex-date
    calendar.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    res.json(calendar);
  } catch (err) {
    logger.error('Get dividend calendar error:', err);
    res.status(500).json({ error: 'Failed to get dividend calendar' });
  }
});

/**
 * GET /api/dividends/income
 * Get dividend income history with pagination for transactions
 * Query params: page, limit, portfolioId, year
 */
router.get('/income', [
  paginationMiddleware('dividends'),
  query('portfolioId').optional().isUUID(),
  query('year').optional().isInt({ min: 2000, max: 2100 }).toInt()
], async (req, res) => {
  try {
    const { portfolioId, year = new Date().getFullYear() } = req.query;
    const { page, limit, offset } = req.pagination;

    const where = {
      userId: req.user.id,
      type: 'dividend',
      executedAt: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1)
      }
    };

    if (portfolioId) {
      where.portfolioId = portfolioId;
    }

    // Get total count and paginated dividends
    const [dividends, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.transaction.count({ where })
    ]);

    // For summary stats, we need all records (can cache this)
    const allDividends = await prisma.transaction.findMany({
      where,
      orderBy: { executedAt: 'desc' }
    });

    // Group by month and symbol for summaries
    const byMonth = {};
    const bySymbol = {};
    let total = 0;

    for (const div of allDividends) {
      const month = new Date(div.executedAt).toISOString().slice(0, 7);
      const amount = Number(div.amount);

      byMonth[month] = (byMonth[month] || 0) + amount;
      bySymbol[div.symbol] = (bySymbol[div.symbol] || 0) + amount;
      total += amount;
    }

    const pagination = buildPaginationMeta(totalCount, page, limit);

    res.json({
      success: true,
      year,
      total,
      byMonth: Object.entries(byMonth)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      bySymbol: Object.entries(bySymbol)
        .map(([symbol, amount]) => ({ symbol, amount }))
        .sort((a, b) => b.amount - a.amount),
      data: dividends.map(d => ({
        ...d,
        amount: Number(d.amount)
      })),
      pagination,
      // Legacy field for backwards compatibility
      transactions: dividends.map(d => ({
        ...d,
        amount: Number(d.amount)
      }))
    });
  } catch (err) {
    logger.error('Get dividend income error:', err);
    res.status(500).json({ success: false, error: 'Failed to get dividend income' });
  }
});

/**
 * GET /api/dividends/screener
 * Screen for dividend stocks
 */
router.get('/screener', [
  query('minYield').optional().isFloat({ min: 0 }).toFloat(),
  query('maxYield').optional().isFloat({ min: 0 }).toFloat(),
  query('sector').optional().trim()
], async (req, res) => {
  try {
    const { minYield = 0, maxYield = 20, sector } = req.query;

    // Get dividend stocks from database
    const where = {
      dividendYield: {
        gte: minYield,
        lte: maxYield
      }
    };

    if (sector) {
      where.sector = sector;
    }

    const stocks = await prisma.stockQuote.findMany({
      where,
      orderBy: { dividendYield: 'desc' },
      take: 50
    });

    res.json(stocks.map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: Number(s.price),
      dividend: Number(s.dividend),
      dividendYield: Number(s.dividendYield),
      peRatio: Number(s.peRatio),
      sector: s.sector,
      change: Number(s.change),
      changePercent: Number(s.changePercent)
    })));
  } catch (err) {
    logger.error('Dividend screener error:', err);
    res.status(500).json({ error: 'Screener failed' });
  }
});

module.exports = router;
