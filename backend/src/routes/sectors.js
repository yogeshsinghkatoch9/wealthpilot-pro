const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Sector performance endpoint
router.get('/performance', async (req, res) => {
  try {
    // Mock sector performance data
    const sectors = [
      { sector: 'Technology', return1M: 5.2, return3M: 12.8, return1Y: 28.5, allocation: 35 },
      { sector: 'Healthcare', return1M: 3.1, return3M: 8.4, return1Y: 18.2, allocation: 20 },
      { sector: 'Financials', return1M: -1.2, return3M: 4.5, return1Y: 12.3, allocation: 15 },
      { sector: 'Consumer Discretionary', return1M: 2.8, return3M: 7.2, return1Y: 15.8, allocation: 12 },
      { sector: 'Industrials', return1M: 1.5, return3M: 5.9, return1Y: 14.2, allocation: 10 },
      { sector: 'Energy', return1M: -3.5, return3M: -2.1, return1Y: 8.5, allocation: 5 },
      { sector: 'Materials', return1M: 0.8, return3M: 3.2, return1Y: 11.5, allocation: 3 }
    ];

    res.json({
      success: true,
      sectors,
      asOf: new Date().toISOString(),
      topPerformers: sectors.sort((a, b) => b.return1Y - a.return1Y).slice(0, 3),
      bottomPerformers: sectors.sort((a, b) => a.return1Y - b.return1Y).slice(0, 3)
    });
  } catch (error) {
    logger.error('Sector performance error:', error);
    res.status(500).json({ error: 'Failed to get sector performance' });
  }
});

module.exports = router;
