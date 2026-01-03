/**
 * Economic Calendar API Routes
 * Endpoints for fetching and managing economic calendar events
 */

const express = require('express');
const router = express.Router();
const EconomicCalendarService = require('../services/economicCalendar');
const logger = require('../utils/logger');

/**
 * GET /api/economic-calendar
 * Get economic calendar events with optional filters
 * Query params: from, to, country, impact, source
 */
router.get('/', async (req, res) => {
  try {
    const { from, to, country, impact, source } = req.query;

    const events = await EconomicCalendarService.getEconomicCalendar({
      from,
      to,
      country,
      impact,
      source
    });

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    logger.error('Error fetching economic calendar', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch economic calendar'
    });
  }
});

/**
 * GET /api/economic-calendar/today
 * Get today's economic events
 */
router.get('/today', async (req, res) => {
  try {
    const events = await EconomicCalendarService.getTodayEvents();

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    logger.error('Error fetching today events', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch today events'
    });
  }
});

/**
 * GET /api/economic-calendar/upcoming
 * Get upcoming events (next 7 days)
 */
router.get('/upcoming', async (req, res) => {
  try {
    const events = await EconomicCalendarService.getUpcomingEvents();

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    logger.error('Error fetching upcoming events', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming events'
    });
  }
});

/**
 * GET /api/economic-calendar/high-impact
 * Get high impact events
 * Query params: from, to
 */
router.get('/high-impact', async (req, res) => {
  try {
    const { from, to } = req.query;

    const events = await EconomicCalendarService.getHighImpactEvents(from, to);

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    logger.error('Error fetching high impact events', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch high impact events'
    });
  }
});

/**
 * GET /api/economic-calendar/country/:country
 * Get events by country
 * Params: country (country name or code)
 * Query params: from, to
 */
router.get('/country/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const { from, to } = req.query;

    const events = await EconomicCalendarService.getEventsByCountry(country, from, to);

    res.json({
      success: true,
      data: events,
      count: events.length,
      country
    });
  } catch (error) {
    logger.error('Error fetching country events', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch country events'
    });
  }
});

/**
 * GET /api/economic-calendar/statistics
 * Get event statistics
 * Query params: from, to
 */
router.get('/statistics', async (req, res) => {
  try {
    const {
      from = new Date().toISOString().split('T')[0],
      to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    } = req.query;

    const stats = await EconomicCalendarService.getEventStatistics(from, to);

    res.json({
      success: true,
      data: stats,
      period: { from, to }
    });
  } catch (error) {
    logger.error('Error fetching statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

/**
 * POST /api/economic-calendar/clear-cache
 * Clear the economic calendar cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    EconomicCalendarService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('Error clearing cache', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;
