/**
 * Calendar Service
 * Manages user calendar events, tasks, and meetings
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let db;
let dbAvailable = false;
try {
  db = require('../db/database');
  dbAvailable = true;
} catch (err) {
  logger.warn('SQLite database not available for calendar service, using mock data');
  db = { db: { prepare: () => ({ all: () => [], get: () => null, run: () => ({}) }) } };
}

class CalendarService {
  /**
   * Get all calendar events for a user
   */
  static getUserEvents(userId, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT * FROM calendar_events
        WHERE user_id = ?
      `;
      const params = [userId];

      if (startDate && endDate) {
        query += ' AND start_date >= ? AND start_date <= ?';
        params.push(startDate, endDate);
      }

      query += ' ORDER BY start_date ASC';

      const events = db.db.prepare(query).all(...params);

      logger.info(`Retrieved ${events.length} calendar events for user ${userId}`);
      return events;
    } catch (error) {
      logger.error('Failed to get user calendar events', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get a single calendar event by ID
   */
  static getEventById(eventId, userId) {
    try {
      const event = db.db.prepare(`
        SELECT * FROM calendar_events
        WHERE id = ? AND user_id = ?
      `).get(eventId, userId);

      if (!event) {
        throw new Error('Event not found');
      }

      return event;
    } catch (error) {
      logger.error('Failed to get calendar event', { error: error.message, eventId });
      throw error;
    }
  }

  /**
   * Create a new calendar event
   */
  static createEvent(userId, eventData) {
    try {
      const {
        title,
        description = '',
        event_type = 'event',
        start_date,
        end_date,
        all_day = 0,
        location = '',
        color = '#f59e0b',
        symbol = null,
        reminder_minutes = 15,
        status = 'confirmed',
        is_recurring = 0,
        recurring_pattern = null,
        attendees = null
      } = eventData;

      // Validate required fields
      if (!title || !start_date || !end_date) {
        throw new Error('Title, start_date, and end_date are required');
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      const result = db.db.prepare(`
        INSERT INTO calendar_events (
          id, user_id, title, description, event_type,
          start_date, end_date, all_day, location, color,
          symbol, reminder_minutes, status, is_recurring,
          recurring_pattern, attendees, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, userId, title, description, event_type,
        start_date, end_date, all_day, location, color,
        symbol, reminder_minutes, status, is_recurring,
        recurring_pattern, attendees, now, now
      );

      logger.info(`Created calendar event ${id} for user ${userId}`);

      return this.getEventById(id, userId);
    } catch (error) {
      logger.error('Failed to create calendar event', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Update a calendar event
   */
  static updateEvent(eventId, userId, updates) {
    try {
      // Check if event exists and belongs to user
      const existing = this.getEventById(eventId, userId);

      const allowedFields = [
        'title', 'description', 'event_type', 'start_date', 'end_date',
        'all_day', 'location', 'color', 'symbol', 'reminder_minutes',
        'status', 'is_recurring', 'recurring_pattern', 'attendees'
      ];

      const updateFields = [];
      const updateValues = [];

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(updates[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date().toISOString());
      updateValues.push(eventId);
      updateValues.push(userId);

      const query = `
        UPDATE calendar_events
        SET ${updateFields.join(', ')}
        WHERE id = ? AND user_id = ?
      `;

      db.db.prepare(query).run(...updateValues);

      logger.info(`Updated calendar event ${eventId}`);

      return this.getEventById(eventId, userId);
    } catch (error) {
      logger.error('Failed to update calendar event', { error: error.message, eventId });
      throw error;
    }
  }

  /**
   * Delete a calendar event
   */
  static deleteEvent(eventId, userId) {
    try {
      // Check if event exists and belongs to user
      this.getEventById(eventId, userId);

      db.db.prepare(`
        DELETE FROM calendar_events
        WHERE id = ? AND user_id = ?
      `).run(eventId, userId);

      logger.info(`Deleted calendar event ${eventId}`);

      return { success: true, message: 'Event deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete calendar event', { error: error.message, eventId });
      throw error;
    }
  }

  /**
   * Get events by type
   */
  static getEventsByType(userId, eventType, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT * FROM calendar_events
        WHERE user_id = ? AND event_type = ?
      `;
      const params = [userId, eventType];

      if (startDate && endDate) {
        query += ' AND start_date >= ? AND start_date <= ?';
        params.push(startDate, endDate);
      }

      query += ' ORDER BY start_date ASC';

      const events = db.db.prepare(query).all(...params);

      return events;
    } catch (error) {
      logger.error('Failed to get events by type', { error: error.message, userId, eventType });
      throw error;
    }
  }

  /**
   * Get upcoming events
   */
  static getUpcomingEvents(userId, limit = 10) {
    try {
      const now = new Date().toISOString();

      const events = db.db.prepare(`
        SELECT * FROM calendar_events
        WHERE user_id = ? AND start_date >= ?
        ORDER BY start_date ASC
        LIMIT ?
      `).all(userId, now, limit);

      return events;
    } catch (error) {
      logger.error('Failed to get upcoming events', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get events statistics
   */
  static getEventStats(userId) {
    try {
      const now = new Date().toISOString();

      const stats = {
        total: 0,
        byType: {},
        upcoming: 0,
        today: 0,
        thisWeek: 0,
        thisMonth: 0
      };

      // Total events
      const totalResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM calendar_events WHERE user_id = ?
      `).get(userId);
      stats.total = totalResult.count;

      // By type
      const byType = db.db.prepare(`
        SELECT event_type, COUNT(*) as count
        FROM calendar_events
        WHERE user_id = ?
        GROUP BY event_type
      `).all(userId);

      byType.forEach(row => {
        stats.byType[row.event_type] = row.count;
      });

      // Upcoming (future events)
      const upcomingResult = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM calendar_events
        WHERE user_id = ? AND start_date >= ?
      `).get(userId, now);
      stats.upcoming = upcomingResult.count;

      // Today's events
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const todayResult = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM calendar_events
        WHERE user_id = ? AND start_date >= ? AND start_date < ?
      `).get(userId, todayStart, todayEnd);
      stats.today = todayResult.count;

      // This week's events
      const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekResult = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM calendar_events
        WHERE user_id = ? AND start_date >= ? AND start_date < ?
      `).get(userId, now, weekEnd);
      stats.thisWeek = weekResult.count;

      // This month's events
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString();
      const monthResult = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM calendar_events
        WHERE user_id = ? AND start_date >= ? AND start_date < ?
      `).get(userId, todayStart, monthEnd);
      stats.thisMonth = monthResult.count;

      return stats;
    } catch (error) {
      logger.error('Failed to get event stats', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Search events
   */
  static searchEvents(userId, searchTerm) {
    try {
      const events = db.db.prepare(`
        SELECT * FROM calendar_events
        WHERE user_id = ? AND (
          title LIKE ? OR
          description LIKE ? OR
          location LIKE ?
        )
        ORDER BY start_date DESC
        LIMIT 50
      `).all(userId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);

      return events;
    } catch (error) {
      logger.error('Failed to search events', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = CalendarService;
