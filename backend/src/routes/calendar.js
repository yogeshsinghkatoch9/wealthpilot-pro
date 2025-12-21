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
 * Get upcoming dividend events
 */
router.get('/dividend-calendar', async (req, res) => {
  try {
    // Return mock dividend calendar events
    const upcomingDividends = [
      {
        id: '1',
        symbol: 'AAPL',
        exDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        payDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        amount: 0.24,
        shares: 100,
        estimatedPayout: 24.00,
        frequency: 'Quarterly'
      },
      {
        id: '2',
        symbol: 'MSFT',
        exDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        payDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        amount: 0.68,
        shares: 50,
        estimatedPayout: 34.00,
        frequency: 'Quarterly'
      },
      {
        id: '3',
        symbol: 'JNJ',
        exDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        payDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        amount: 1.13,
        shares: 75,
        estimatedPayout: 84.75,
        frequency: 'Quarterly'
      }
    ];

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
