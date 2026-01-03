const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { prisma } = require('../db/simpleDb');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * GET /api/margins/portfolio/:portfolioId
 * Fetch margin data for all holdings in a portfolio
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.userId;
    const years = parseInt(req.query.years) || 5;

    // If portfolioId is 'all', fetch all portfolios for the user
    let portfolios;
    if (portfolioId === 'all') {
      portfolios = await prisma.portfolio.findMany({
        where: { userId },
        include: { positions: true }
      });
    } else {
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: portfolioId, userId },
        include: { positions: true }
      });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      portfolios = [portfolio];
    }

    // Collect all unique symbols from all positions
    const symbolsSet = new Set();
    portfolios.forEach(portfolio => {
      portfolio.positions.forEach(pos => symbolsSet.add(pos.symbol));
    });
    const symbols = Array.from(symbolsSet);

    // Fetch margin data for all symbols in parallel batches
    const marginData = [];
    const errors = [];
    const BATCH_SIZE = 5; // Process 5 symbols at a time to avoid rate limits

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (symbol) => {
        try {
          // Fetch fundamentals
          const [quote, quoteSummary] = await Promise.all([
            yahooFinance.quote(symbol),
            yahooFinance.quoteSummary(symbol, {
              modules: ['financialData', 'defaultKeyStatistics', 'incomeStatementHistory']
            })
          ]);

          const financialData = quoteSummary.financialData || {};

          // Calculate year-over-year margin change
          const incomeStatements = quoteSummary.incomeStatementHistory?.incomeStatementHistory || [];
          let marginChange = 0;
          if (incomeStatements.length >= Math.min(years, incomeStatements.length)) {
            const recent = incomeStatements[0];
            const old = incomeStatements[Math.min(years - 1, incomeStatements.length - 1)];

            const recentGrossMargin = recent.grossProfit && recent.totalRevenue
              ? (recent.grossProfit / recent.totalRevenue) * 100
              : 0;
            const oldGrossMargin = old.grossProfit && old.totalRevenue
              ? (old.grossProfit / old.totalRevenue) * 100
              : 0;

            marginChange = recentGrossMargin - oldGrossMargin;
          }

          // Determine trend
          let trend = 'Stable';
          if (marginChange > 2) trend = 'Expanding';
          else if (marginChange < -2) trend = 'Contracting';

          // Calculate vs peers (using industry average estimation)
          const grossMargin = (financialData.grossMargins || 0) * 100;
          const industryAvg = 40; // Rough industry average
          const vsPeers = grossMargin - industryAvg;

          return {
            success: true,
            data: {
              symbol,
              name: quote.shortName || quote.longName || symbol,
              grossMargin: (financialData.grossMargins || 0) * 100,
              operatingMargin: (financialData.operatingMargins || 0) * 100,
              netMargin: (financialData.profitMargins || 0) * 100,
              marginChange: marginChange,
              trend,
              vsPeers,
              price: quote.regularMarketPrice,
              marketCap: quote.marketCap
            }
          };
        } catch (error) {
          logger.error(`Error fetching margin data for ${symbol}:`, error.message);
          return { success: false, symbol, error: error.message };
        }
      }));

      // Process batch results
      for (const result of batchResults) {
        if (result.success) {
          marginData.push(result.data);
        } else {
          errors.push({ symbol: result.symbol, error: result.error });
        }
      }
    }

    // Sort by gross margin descending
    marginData.sort((a, b) => b.grossMargin - a.grossMargin);

    // Calculate portfolio averages
    const avgGrossMargin = marginData.length > 0
      ? marginData.reduce((sum, d) => sum + d.grossMargin, 0) / marginData.length
      : 0;
    const avgOperatingMargin = marginData.length > 0
      ? marginData.reduce((sum, d) => sum + d.operatingMargin, 0) / marginData.length
      : 0;
    const avgNetMargin = marginData.length > 0
      ? marginData.reduce((sum, d) => sum + d.netMargin, 0) / marginData.length
      : 0;

    const expanding = marginData.filter(d => d.trend === 'Expanding').length;
    const contracting = marginData.filter(d => d.trend === 'Contracting').length;

    // Get highest margins
    const highestMargins = marginData.slice(0, 3);

    // Get biggest expansion
    const biggestExpansion = [...marginData]
      .sort((a, b) => b.marginChange - a.marginChange)
      .slice(0, 3);

    // Get watch list (biggest contraction)
    const watchList = [...marginData]
      .sort((a, b) => a.marginChange - b.marginChange)
      .slice(0, 3);

    res.json({
      summary: {
        avgGrossMargin: avgGrossMargin.toFixed(1),
        avgOperatingMargin: avgOperatingMargin.toFixed(1),
        avgNetMargin: avgNetMargin.toFixed(1),
        expanding,
        contracting
      },
      holdings: marginData,
      insights: {
        highestMargins,
        biggestExpansion,
        watchList
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    logger.error('Error fetching portfolio margins:', error);
    res.status(500).json({ error: 'Failed to fetch margin data' });
  }
});

/**
 * GET /api/margins/trend/:symbol
 * Fetch historical margin trend for a symbol
 */
router.get('/trend/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const years = parseInt(req.query.years) || 5;

    const quoteSummary = await yahooFinance.quoteSummary(symbol, {
      modules: ['incomeStatementHistory', 'financialData']
    });

    const incomeStatements = quoteSummary.incomeStatementHistory?.incomeStatementHistory || [];

    // Build trend data from income statements
    const trendData = incomeStatements
      .slice(0, years)
      .reverse()
      .map(statement => {
        const year = new Date(statement.endDate).getFullYear();
        const grossMargin = statement.grossProfit && statement.totalRevenue
          ? ((statement.grossProfit / statement.totalRevenue) * 100).toFixed(1)
          : 0;
        const operatingMargin = statement.operatingIncome && statement.totalRevenue
          ? ((statement.operatingIncome / statement.totalRevenue) * 100).toFixed(1)
          : 0;
        const netMargin = statement.netIncome && statement.totalRevenue
          ? ((statement.netIncome / statement.totalRevenue) * 100).toFixed(1)
          : 0;

        return {
          year,
          grossMargin: parseFloat(grossMargin),
          operatingMargin: parseFloat(operatingMargin),
          netMargin: parseFloat(netMargin)
        };
      });

    res.json({
      symbol,
      trendData
    });

  } catch (error) {
    logger.error('Error fetching margin trend:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

module.exports = router;
