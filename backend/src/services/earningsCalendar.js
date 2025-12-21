/**
 * Earnings Calendar Service - Manages earnings calendar data
 */

const { v4: uuidv4 } = require('uuid');
const EarningsDataFetcher = require('./earningsDataFetcher');

const logger = require('../utils/logger');
class EarningsCalendarService {
  constructor(db) {
    this.db = db;
    this.dataFetcher = new EarningsDataFetcher();
  }

  /**
   * Get upcoming earnings (next N days)
   */
  getUpcoming(days = 30, limit = 100) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const sql = `
      SELECT * FROM earnings_calendar
      WHERE earnings_date >= datetime('now')
      AND earnings_date <= datetime(?)
      ORDER BY earnings_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(futureDate.toISOString(), limit);
  }

  /**
   * Get earnings for a specific date range
   */
  getByDateRange(startDate, endDate, limit = 100) {
    const sql = `
      SELECT * FROM earnings_calendar
      WHERE earnings_date >= datetime(?)
      AND earnings_date <= datetime(?)
      ORDER BY earnings_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(startDate, endDate, limit);
  }

  /**
   * Get earnings for a specific symbol
   */
  getBySymbol(symbol, limit = 10) {
    const sql = `
      SELECT * FROM earnings_calendar
      WHERE symbol = ?
      ORDER BY earnings_date DESC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(symbol, limit);
  }

  /**
   * Get earnings stats
   */
  getStats() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStr = weekEnd.toISOString().split('T')[0];

    const monthEnd = new Date();
    monthEnd.setDate(monthEnd.getDate() + 30);
    const monthStr = monthEnd.toISOString().split('T')[0];

    const todayCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM earnings_calendar
      WHERE DATE(earnings_date) = ?
    `).get(today);

    const tomorrowCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM earnings_calendar
      WHERE DATE(earnings_date) = ?
    `).get(tomorrowStr);

    const weekCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM earnings_calendar
      WHERE earnings_date >= datetime('now')
      AND earnings_date <= datetime(?)
    `).get(weekStr);

    const monthCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM earnings_calendar
      WHERE earnings_date >= datetime('now')
      AND earnings_date <= datetime(?)
    `).get(monthStr);

    return {
      today: todayCount.count,
      tomorrow: tomorrowCount.count,
      thisWeek: weekCount.count,
      thisMonth: monthCount.count
    };
  }

  /**
   * Insert or update earnings data
   */
  upsertEarnings(earnings) {
    const sql = `
      INSERT INTO earnings_calendar (
        id, symbol, company_name, earnings_date, fiscal_quarter, fiscal_year,
        eps_estimate, eps_actual, revenue_estimate, revenue_actual,
        reported, time_of_day, currency, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        company_name = excluded.company_name,
        earnings_date = excluded.earnings_date,
        fiscal_quarter = excluded.fiscal_quarter,
        fiscal_year = excluded.fiscal_year,
        eps_estimate = excluded.eps_estimate,
        eps_actual = excluded.eps_actual,
        revenue_estimate = excluded.revenue_estimate,
        revenue_actual = excluded.revenue_actual,
        reported = excluded.reported,
        time_of_day = excluded.time_of_day,
        status = excluded.status,
        updated_at = datetime('now')
    `;

    const stmt = this.db.db.prepare(sql);

    let inserted = 0;
    let updated = 0;

    for (const earning of earnings) {
      // Check if exists
      const existing = this.db.db.prepare(
        'SELECT id FROM earnings_calendar WHERE symbol = ? AND DATE(earnings_date) = DATE(?)'
      ).get(earning.symbol, earning.earnings_date);

      const id = existing ? existing.id : uuidv4();

      try {
        stmt.run(
          id,
          earning.symbol,
          earning.company_name,
          earning.earnings_date,
          earning.fiscal_quarter,
          earning.fiscal_year,
          earning.eps_estimate,
          earning.eps_actual,
          earning.revenue_estimate,
          earning.revenue_actual,
          earning.reported ? 1 : 0,
          earning.time_of_day,
          earning.currency,
          earning.status
        );

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error) {
        logger.error(`Error upserting earnings for ${earning.symbol}:`, error.message);
      }
    }

    logger.debug(`Earnings upsert complete: ${inserted} inserted, ${updated} updated`);
    return { inserted, updated };
  }

  /**
   * Refresh earnings data from API
   */
  async refreshEarningsData(days = 30, userSymbols = []) {
    logger.debug(`Refreshing earnings data for next ${days} days...`);

    try {
      // Fetch upcoming earnings from API
      const earnings = await this.dataFetcher.getUpcomingEarnings(days);

      if (earnings.length === 0) {
        logger.debug('No earnings data fetched from API, using mock data');

        // Fallback to mock data if API fails or returns no results
        const mockSymbols = userSymbols.length > 0 ? userSymbols : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'];
        const mockEarnings = this.dataFetcher.generateMockEarnings(mockSymbols, days);

        if (mockEarnings.length > 0) {
          const result = this.upsertEarnings(mockEarnings);
          return {
            success: true,
            ...result,
            total: mockEarnings.length,
            mock: true
          };
        }

        return { success: false, message: 'No data available' };
      }

      // Enrich with company names
      const enrichedEarnings = await this.dataFetcher.enrichWithCompanyData(earnings);

      // Insert into database
      const result = this.upsertEarnings(enrichedEarnings);

      return {
        success: true,
        ...result,
        total: earnings.length,
        mock: false
      };
    } catch (error) {
      logger.error('Error refreshing earnings data:', error);

      // Fallback to mock data on error
      logger.debug('Falling back to mock earnings data');
      const mockSymbols = userSymbols.length > 0 ? userSymbols : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'];
      const mockEarnings = this.dataFetcher.generateMockEarnings(mockSymbols, days);

      if (mockEarnings.length > 0) {
        const result = this.upsertEarnings(mockEarnings);
        return {
          success: true,
          ...result,
          total: mockEarnings.length,
          mock: true,
          error: error.message
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's tracked earnings
   */
  getUserTrackedEarnings(userId) {
    const sql = `
      SELECT
        e.*,
        ut.shares,
        ut.alert_before_days,
        ut.notes
      FROM earnings_calendar e
      INNER JOIN user_earnings_tracking ut ON e.symbol = ut.symbol
      WHERE ut.user_id = ?
      AND ut.is_tracking = 1
      AND e.earnings_date >= datetime('now')
      ORDER BY e.earnings_date ASC
    `;

    return this.db.db.prepare(sql).all(userId);
  }

  /**
   * Track earnings for a symbol
   */
  trackEarnings(userId, symbol, shares = null, alertBeforeDays = 1, notes = null) {
    const id = uuidv4();
    const sql = `
      INSERT INTO user_earnings_tracking (id, user_id, symbol, shares, alert_before_days, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, symbol) DO UPDATE SET
        is_tracking = 1,
        shares = excluded.shares,
        alert_before_days = excluded.alert_before_days,
        notes = excluded.notes
    `;

    this.db.db.prepare(sql).run(id, userId, symbol, shares, alertBeforeDays, notes);
    return { success: true };
  }

  /**
   * Untrack earnings for a symbol
   */
  untrackEarnings(userId, symbol) {
    const sql = `
      UPDATE user_earnings_tracking
      SET is_tracking = 0
      WHERE user_id = ? AND symbol = ?
    `;

    this.db.db.prepare(sql).run(userId, symbol);
    return { success: true };
  }

  /**
   * Search earnings by symbol or company name
   */
  search(query, limit = 50) {
    const sql = `
      SELECT * FROM earnings_calendar
      WHERE (symbol LIKE ? OR company_name LIKE ?)
      AND earnings_date >= datetime('now')
      ORDER BY earnings_date ASC
      LIMIT ?
    `;

    const searchTerm = `%${query}%`;
    return this.db.db.prepare(sql).all(searchTerm, searchTerm, limit);
  }

  /**
   * Get earnings by fiscal quarter
   */
  getByFiscalQuarter(fiscalQuarter, fiscalYear, limit = 100) {
    const sql = `
      SELECT * FROM earnings_calendar
      WHERE fiscal_quarter = ?
      AND fiscal_year = ?
      ORDER BY earnings_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(fiscalQuarter, fiscalYear, limit);
  }

  /**
   * Get reported vs scheduled earnings
   */
  getByStatus(status, limit = 100) {
    const sql = `
      SELECT * FROM earnings_calendar
      WHERE status = ?
      ORDER BY earnings_date DESC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(status, limit);
  }

  /**
   * Delete old earnings data (older than 6 months)
   */
  cleanupOldData() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const sql = `
      DELETE FROM earnings_calendar
      WHERE earnings_date < datetime(?)
    `;

    const result = this.db.db.prepare(sql).run(sixMonthsAgo.toISOString());
    logger.debug(`Deleted ${result.changes} old earnings records`);
    return { deleted: result.changes };
  }
}

module.exports = EarningsCalendarService;
