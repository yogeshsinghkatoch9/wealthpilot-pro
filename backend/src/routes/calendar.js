/**
 * Calendar API Routes
 * Handles all calendar event CRUD operations
 */

const express = require('express');
const router = express.Router();
const CalendarService = require('../services/calendar');
const DividendDataFetcher = require('../services/dividendDataFetcher');
const EarningsDataFetcher = require('../services/earningsDataFetcher');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Initialize data fetchers for real API data
const dividendFetcher = new DividendDataFetcher();
const earningsFetcher = new EarningsDataFetcher();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * GET /api/calendar
 * Get all calendar events for the authenticated user
 * Query params: start_date, end_date
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { start_date, end_date } = req.query;

    const events = await CalendarService.getUserEvents(userId, start_date, end_date);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    logger.error('Error fetching calendar events', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/dividend-calendar
 * Get upcoming dividend events based on user's holdings
 */
router.get('/dividend-calendar', async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');
    const userId = req.user.id;

    // Get user's holdings
    const holdings = await prisma.holdings.findMany({
      where: {
        portfolio: { userId }
      },
      select: {
        symbol: true,
        shares: true
      }
    });

    if (holdings.length === 0) {
      return res.json([]);
    }

    // Fetch real dividend data from API for each holding
    const upcomingDividends = [];
    const symbols = holdings.map(h => h.symbol);

    // Fetch dividends for all symbols (with rate limiting handled by the fetcher)
    for (const holding of holdings) {
      try {
        const dividends = await dividendFetcher.fetchSymbolDividends(holding.symbol);

        // Filter for upcoming dividends only
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        dividends
          .filter(div => new Date(div.ex_dividend_date) >= today)
          .slice(0, 2) // Next 2 upcoming dividends
          .forEach((div, idx) => {
            upcomingDividends.push({
              id: `${holding.symbol}-${idx}`,
              symbol: holding.symbol,
              exDate: div.ex_dividend_date,
              payDate: div.payment_date || null,
              amount: div.dividend_amount,
              shares: holding.shares,
              estimatedPayout: parseFloat((div.dividend_amount * holding.shares).toFixed(2)),
              frequency: div.frequency || 'quarterly',
              yield: div.dividend_yield || null
            });
          });
      } catch (err) {
        logger.warn(`Failed to fetch dividends for ${holding.symbol}: ${err.message}`);
        // Continue with other holdings even if one fails
      }
    }

    // Sort by ex-date
    upcomingDividends.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    res.json(upcomingDividends);
  } catch (error) {
    logger.error('Error fetching dividend calendar', { error: error.message });
    res.status(500).json([]);
  }
});

/**
 * GET /api/calendar/earnings-calendar
 * Get upcoming earnings events based on user's holdings
 */
router.get('/earnings-calendar', async (req, res) => {
  try {
    const { prisma } = require('../db/simpleDb');
    const userId = req.user.id;

    // Get user's holdings
    const holdings = await prisma.holdings.findMany({
      where: {
        portfolio: { userId }
      },
      select: {
        symbol: true,
        shares: true
      }
    });

    if (holdings.length === 0) {
      return res.json([]);
    }

    // Fetch real earnings data from API
    const upcomingEarnings = [];
    const symbols = holdings.map(h => h.symbol);

    // Fetch earnings for all user's symbols
    try {
      const allEarnings = await earningsFetcher.fetchMultipleSymbols(symbols);

      // Filter for upcoming earnings only
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Map holdings by symbol for easy lookup
      const holdingsMap = {};
      holdings.forEach(h => {
        holdingsMap[h.symbol] = h.shares;
      });

      allEarnings
        .filter(earning => new Date(earning.earnings_date) >= today)
        .forEach(earning => {
          const shares = holdingsMap[earning.symbol];
          if (shares !== undefined) {
            upcomingEarnings.push({
              id: `${earning.symbol}-earnings`,
              symbol: earning.symbol,
              companyName: earning.company_name || earning.symbol,
              reportDate: earning.earnings_date,
              timeOfDay: earning.time_of_day || null,
              fiscalQuarter: earning.fiscal_quarter || null,
              epsEstimate: earning.eps_estimate || null,
              revenueEstimate: earning.revenue_estimate || null,
              shares: shares,
              status: earning.status || 'scheduled'
            });
          }
        });
    } catch (err) {
      logger.warn(`Failed to fetch earnings data: ${err.message}`);
      // Return empty array if API fails - no mock fallback
    }

    // Sort by report date
    upcomingEarnings.sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));

    res.json(upcomingEarnings);
  } catch (error) {
    logger.error('Error fetching earnings calendar', { error: error.message });
    res.status(500).json([]);
  }
});

/**
 * GET /api/calendar/:id
 * Get a specific calendar event by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const event = await CalendarService.getEventById(id, userId);

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    logger.error('Error fetching calendar event', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/calendar
 * Create a new calendar event
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventData = req.body;

    const event = await CalendarService.createEvent(userId, eventData);

    res.status(201).json({
      success: true,
      data: event,
      message: 'Event created successfully'
    });
  } catch (error) {
    logger.error('Error creating calendar event', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/calendar/:id
 * Update a calendar event
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const updates = req.body;

    const event = await CalendarService.updateEvent(id, userId, updates);

    res.json({
      success: true,
      data: event,
      message: 'Event updated successfully'
    });
  } catch (error) {
    logger.error('Error updating calendar event', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/calendar/:id
 * Delete a calendar event
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await CalendarService.deleteEvent(id, userId);

    res.json(result);
  } catch (error) {
    logger.error('Error deleting calendar event', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/type/:type
 * Get events by type (task, meeting, event)
 */
router.get('/type/:type', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type } = req.params;
    const { start_date, end_date } = req.query;

    const events = await CalendarService.getEventsByType(userId, type, start_date, end_date);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    logger.error('Error fetching events by type', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/upcoming
 * Get upcoming events
 */
router.get('/upcoming/list', async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 10;

    const events = await CalendarService.getUpcomingEvents(userId, limit);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    logger.error('Error fetching upcoming events', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/stats
 * Get calendar statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await CalendarService.getEventStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching calendar stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/search
 * Search calendar events
 */
router.get('/search/query', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const events = await CalendarService.searchEvents(userId, q);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    logger.error('Error searching events', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
