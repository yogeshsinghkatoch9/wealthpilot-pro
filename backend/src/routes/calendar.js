/**
 * Calendar API Routes
 * Handles all calendar event CRUD operations
 */

const express = require('express');
const router = express.Router();
const CalendarService = require('../services/calendar');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

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
    const holdings = await prisma.holding.findMany({
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

    // Dividend data for common stocks
    const dividendData = {
      'AAPL': { amount: 0.25, yield: 0.5, freq: 'Quarterly' },
      'MSFT': { amount: 0.75, yield: 0.8, freq: 'Quarterly' },
      'GOOGL': { amount: 0, yield: 0, freq: 'None' },
      'NVDA': { amount: 0.04, yield: 0.03, freq: 'Quarterly' },
      'JPM': { amount: 1.15, yield: 2.1, freq: 'Quarterly' },
      'JNJ': { amount: 1.24, yield: 2.9, freq: 'Quarterly' },
      'PG': { amount: 1.01, yield: 2.4, freq: 'Quarterly' },
      'KO': { amount: 0.485, yield: 2.8, freq: 'Quarterly' },
      'XOM': { amount: 0.95, yield: 3.4, freq: 'Quarterly' },
      'VZ': { amount: 0.665, yield: 6.3, freq: 'Quarterly' },
      'T': { amount: 0.2775, yield: 4.8, freq: 'Quarterly' },
      'PFE': { amount: 0.42, yield: 5.8, freq: 'Quarterly' },
      'CVX': { amount: 1.63, yield: 4.0, freq: 'Quarterly' },
      'MRK': { amount: 0.77, yield: 2.8, freq: 'Quarterly' },
      'BAC': { amount: 0.26, yield: 2.4, freq: 'Quarterly' },
      'WFC': { amount: 0.40, yield: 2.5, freq: 'Quarterly' },
      'HD': { amount: 2.25, yield: 2.3, freq: 'Quarterly' },
      'MCD': { amount: 1.67, yield: 2.2, freq: 'Quarterly' }
    };

    // Generate upcoming dividend events for user's holdings
    const upcomingDividends = [];
    const today = new Date();

    holdings.forEach((holding, idx) => {
      const divInfo = dividendData[holding.symbol];
      if (divInfo && divInfo.amount > 0) {
        // Generate next 2 dividend dates for each holding
        for (let i = 0; i < 2; i++) {
          const exDate = new Date(today);
          exDate.setDate(exDate.getDate() + (idx * 7) + (i * 90) + 5);

          const payDate = new Date(exDate);
          payDate.setDate(payDate.getDate() + 14);

          upcomingDividends.push({
            id: `${holding.symbol}-${i}`,
            symbol: holding.symbol,
            exDate: exDate.toISOString().split('T')[0],
            payDate: payDate.toISOString().split('T')[0],
            amount: divInfo.amount,
            shares: holding.shares,
            estimatedPayout: parseFloat((divInfo.amount * holding.shares).toFixed(2)),
            frequency: divInfo.freq,
            yield: divInfo.yield
          });
        }
      }
    });

    // Sort by ex-date
    upcomingDividends.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    res.json(upcomingDividends);
  } catch (error) {
    logger.error('Error fetching dividend calendar', { error: error.message });
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
