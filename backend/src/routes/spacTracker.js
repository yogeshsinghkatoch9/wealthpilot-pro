/**
 * SPAC Tracker Routes
 * Track SPAC IPOs, mergers, and deadlines
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available, using mock database for SPAC tracker routes');
  Database = {
    all: () => [],
    get: () => ({ count: 0, total: 0 })
  };
}

router.use(authenticate);

/**
 * GET /api/spac-tracker/upcoming
 * Get upcoming SPAC mergers and IPOs
 */
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    // Get SPAC data from IPO calendar where they're marked as SPAC
    const spacs = Database.all(`
      SELECT * FROM ipo_calendar
      WHERE (company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%' OR description LIKE '%SPAC%')
        AND ipo_date >= date('now')
      ORDER BY ipo_date ASC
      LIMIT ?
    `, [parseInt(limit)]);

    // Transform to SPAC format
    const spacData = spacs.map(spac => ({
      id: spac.id,
      symbol: spac.symbol,
      name: spac.company_name,
      status: spac.status,
      ipoDate: spac.ipo_date,
      priceRange: spac.price_range_low && spac.price_range_high
        ? `$${spac.price_range_low} - $${spac.price_range_high}`
        : 'TBD',
      trustSize: spac.market_cap || 0,
      sector: spac.sector || 'General Purpose',
      sponsor: spac.lead_managers || 'TBD',
      deadline: calculateDeadline(spac.ipo_date),
      daysRemaining: calculateDaysRemaining(spac.ipo_date)
    }));

    res.json(spacData);
  } catch (error) {
    logger.error('SPAC Tracker error:', error);
    res.status(500).json({ error: 'Failed to fetch SPAC data' });
  }
});

/**
 * GET /api/spac-tracker/stats
 * Get SPAC market statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const total = Database.get(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%'
    `).count;

    const upcoming = Database.get(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE (company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%')
        AND ipo_date >= date('now')
    `).count;

    const thisMonth = Database.get(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE (company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%')
        AND ipo_date >= date('now')
        AND ipo_date < date('now', '+1 month')
    `).count;

    const totalTrustValue = Database.get(`
      SELECT SUM(market_cap) as total FROM ipo_calendar
      WHERE (company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%')
        AND ipo_date >= date('now')
    `).total || 0;

    res.json({
      total,
      upcoming,
      thisMonth,
      totalTrustValue,
      avgTrustSize: upcoming > 0 ? totalTrustValue / upcoming : 0
    });
  } catch (error) {
    logger.error('SPAC stats error:', error);
    res.status(500).json({ error: 'Failed to fetch SPAC stats' });
  }
});

/**
 * GET /api/spac-tracker/sector/:sector
 * Get SPACs by target sector
 */
router.get('/sector/:sector', async (req, res) => {
  try {
    const { sector } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const spacs = Database.all(`
      SELECT * FROM ipo_calendar
      WHERE (company_name LIKE '%acquisition%' OR company_name LIKE '%SPAC%')
        AND sector = ?
        AND ipo_date >= date('now')
      ORDER BY ipo_date ASC
      LIMIT ? OFFSET ?
    `, [sector, parseInt(limit), parseInt(offset)]);

    res.json(spacs);
  } catch (error) {
    logger.error('SPAC sector error:', error);
    res.status(500).json({ error: 'Failed to fetch SPAC sector data' });
  }
});

// Helper functions
function calculateDeadline(ipoDate) {
  if (!ipoDate) return null;
  // SPACs typically have 24-month deadline from IPO
  const deadline = new Date(ipoDate);
  deadline.setMonth(deadline.getMonth() + 24);
  return deadline.toISOString().split('T')[0];
}

function calculateDaysRemaining(ipoDate) {
  if (!ipoDate) return null;
  const deadline = new Date(ipoDate);
  deadline.setMonth(deadline.getMonth() + 24);
  const today = new Date();
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

module.exports = router;
