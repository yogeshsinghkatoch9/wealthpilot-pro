/**
 * Stock Search API Routes
 * Search for stock tickers and get live data
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const liveDataService = require('../services/liveDataService');

/**
 * POST /api/stock-search
 * Search for stock ticker and return live data
 */
router.post('/search', authenticate, async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Stock symbol is required'
      });
    }

    const tickerSymbol = symbol.trim().toUpperCase();

    logger.debug(`[Stock Search] Searching for: ${tickerSymbol}`);

    // Fetch data in parallel from multiple sources
    const [priceData, companyInfo] = await Promise.all([
      liveDataService.getStockPrices([tickerSymbol]),
      liveDataService.getCompanyInfo(tickerSymbol)
    ]);

    const quote = priceData[tickerSymbol];

    if (!quote && !companyInfo.symbol) {
      return res.status(404).json({
        success: false,
        error: `No data found for symbol: ${tickerSymbol}`,
        symbol: tickerSymbol
      });
    }

    // Combine quote and company info
    const result = {
      symbol: tickerSymbol,
      quote: quote || null,
      company: companyInfo || null,
      timestamp: new Date().toISOString()
    };

    logger.debug(`[Stock Search] Found data for ${tickerSymbol}:`, {
      hasQuote: !!quote,
      hasCompanyInfo: !!companyInfo.symbol,
      source: quote?.source || companyInfo?.source
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('[Stock Search] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search for stock',
      message: error.message
    });
  }
});

/**
 * GET /api/stock-search/historical/:symbol
 * Get historical data for charts
 */
router.get('/historical/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1M' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Stock symbol is required'
      });
    }

    logger.debug(`[Stock Search] Fetching historical data for ${symbol}, period: ${period}`);

    const historicalData = await liveDataService.getHistoricalData(symbol.toUpperCase(), period);

    if (!historicalData || historicalData.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No historical data found for symbol: ${symbol}`
      });
    }

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        period,
        dataPoints: historicalData.length,
        history: historicalData
      }
    });

  } catch (error) {
    logger.error('[Stock Search Historical] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
});

/**
 * POST /api/stock-search/batch
 * Search for multiple stock tickers at once
 */
router.post('/batch', authenticate, async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      });
    }

    const tickerSymbols = symbols.map(s => s.trim().toUpperCase());

    logger.debug(`[Stock Search Batch] Searching for: ${tickerSymbols.join(', ')}`);

    // Fetch all prices at once
    const priceData = await liveDataService.getStockPrices(tickerSymbols);

    const results = tickerSymbols.map(symbol => ({
      symbol,
      quote: priceData[symbol] || null,
      timestamp: new Date().toISOString()
    }));

    res.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    logger.error('[Stock Search Batch] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search for stocks',
      message: error.message
    });
  }
});

module.exports = router;
