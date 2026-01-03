/**
 * IPO Calendar Service - Manages IPO calendar data
 */

const { v4: uuidv4 } = require('uuid');
const IPODataFetcher = require('./ipoDataFetcher');

const logger = require('../utils/logger');
class IPOCalendarService {
  constructor(db) {
    this.db = db;
    this.dataFetcher = new IPODataFetcher();
  }

  /**
   * Get upcoming IPOs (next N days)
   */
  getUpcoming(days = 90, limit = 100) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const sql = `
      SELECT * FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND ipo_date <= date(?)
      ORDER BY ipo_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(futureDate.toISOString().split('T')[0], limit);
  }

  /**
   * Get IPOs by status
   */
  getByStatus(status, limit = 50) {
    const sql = `
      SELECT * FROM ipo_calendar
      WHERE status = ?
      ORDER BY ipo_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(status, limit);
  }

  /**
   * Get IPOs by sector
   */
  getBySector(sector, limit = 50) {
    const sql = `
      SELECT * FROM ipo_calendar
      WHERE sector = ?
      ORDER BY ipo_date ASC
      LIMIT ?
    `;

    return this.db.db.prepare(sql).all(sector, limit);
  }

  /**
   * Get IPO by symbol
   */
  getBySymbol(symbol) {
    const sql = `
      SELECT * FROM ipo_calendar
      WHERE symbol = ?
      LIMIT 1
    `;

    return this.db.db.prepare(sql).get(symbol);
  }

  /**
   * Get IPO statistics
   */
  getStats() {
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() + 7);

    const thisMonth = new Date();
    thisMonth.setDate(thisMonth.getDate() + 30);

    const thisQuarter = new Date();
    thisQuarter.setDate(thisQuarter.getDate() + 90);

    const weekCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND ipo_date <= date(?)
      AND status IN ('filed', 'priced', 'upcoming')
    `).get(thisWeek.toISOString().split('T')[0]);

    const monthCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND ipo_date <= date(?)
      AND status IN ('filed', 'priced', 'upcoming')
    `).get(thisMonth.toISOString().split('T')[0]);

    const quarterCount = this.db.db.prepare(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND ipo_date <= date(?)
      AND status IN ('filed', 'priced', 'upcoming')
    `).get(thisQuarter.toISOString().split('T')[0]);

    const totalMarketCap = this.db.db.prepare(`
      SELECT SUM(market_cap) as total FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND status IN ('filed', 'priced', 'upcoming')
    `).get();

    const sectorDistribution = this.db.db.prepare(`
      SELECT sector, COUNT(*) as count
      FROM ipo_calendar
      WHERE ipo_date >= date('now')
      AND status IN ('filed', 'priced', 'upcoming')
      GROUP BY sector
      ORDER BY count DESC
    `).all();

    return {
      thisWeek: weekCount.count,
      thisMonth: monthCount.count,
      thisQuarter: quarterCount.count,
      totalMarketCap: totalMarketCap.total || 0,
      sectorDistribution
    };
  }

  /**
   * Insert or update IPO data
   */
  upsertIPO(ipo) {
    const sql = `
      INSERT INTO ipo_calendar (
        id, symbol, company_name, exchange, ipo_date, filing_date,
        price_range_low, price_range_high, ipo_price, shares_offered,
        market_cap, industry, sector, description, status,
        underwriters, lead_managers, country, currency, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        company_name = excluded.company_name,
        exchange = excluded.exchange,
        ipo_date = excluded.ipo_date,
        filing_date = excluded.filing_date,
        price_range_low = excluded.price_range_low,
        price_range_high = excluded.price_range_high,
        ipo_price = excluded.ipo_price,
        shares_offered = excluded.shares_offered,
        market_cap = excluded.market_cap,
        industry = excluded.industry,
        sector = excluded.sector,
        description = excluded.description,
        status = excluded.status,
        underwriters = excluded.underwriters,
        lead_managers = excluded.lead_managers,
        updated_at = datetime('now')
    `;

    const stmt = this.db.db.prepare(sql);

    let inserted = 0;
    let updated = 0;

    // Check if exists
    const existing = this.db.db.prepare(
      'SELECT id FROM ipo_calendar WHERE symbol = ? AND ipo_date = ?'
    ).get(ipo.symbol, ipo.ipo_date);

    const id = existing ? existing.id : (ipo.id || uuidv4());

    try {
      stmt.run(
        id,
        ipo.symbol,
        ipo.company_name,
        ipo.exchange,
        ipo.ipo_date,
        ipo.filing_date,
        ipo.price_range_low,
        ipo.price_range_high,
        ipo.ipo_price,
        ipo.shares_offered,
        ipo.market_cap,
        ipo.industry,
        ipo.sector,
        ipo.description,
        ipo.status,
        ipo.underwriters,
        ipo.lead_managers,
        ipo.country,
        ipo.currency
      );

      if (existing) {
        updated++;
      } else {
        inserted++;
      }
    } catch (error) {
      logger.error(`Error upserting IPO for ${ipo.symbol}:`, error.message);
    }

    return { inserted, updated };
  }

  /**
   * Refresh IPO data from API
   */
  async refreshIPOData(days = 90) {
    logger.debug(`Refreshing IPO data for next ${days} days...`);

    try {
      // Fetch upcoming IPOs
      const ipos = await this.dataFetcher.getUpcomingIPOs(days);

      if (ipos.length === 0) {
        logger.debug('No IPO data available');
        return { success: false, message: 'No data available' };
      }

      // Insert into database
      let inserted = 0;
      let updated = 0;

      for (const ipo of ipos) {
        const result = this.upsertIPO(ipo);
        inserted += result.inserted;
        updated += result.updated;
      }

      logger.debug(`IPO refresh complete: ${inserted} inserted, ${updated} updated`);

      return {
        success: true,
        inserted,
        updated,
        total: ipos.length
      };
    } catch (error) {
      logger.error('Error refreshing IPO data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Track IPO for user
   */
  trackIPO(userId, ipoId, interestLevel = 1, notes = '') {
    const id = uuidv4();
    const sql = `
      INSERT INTO user_ipo_tracking (id, user_id, ipo_id, interest_level, notes)
      VALUES (?, ?, ?, ?, ?)
    `;

    try {
      this.db.db.prepare(sql).run(id, userId, ipoId, interestLevel, notes);
      return { success: true, id };
    } catch (error) {
      logger.error('Error tracking IPO:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's tracked IPOs
   */
  getUserTrackedIPOs(userId) {
    const sql = `
      SELECT i.*, ut.interest_level, ut.notes, ut.created_at as tracked_date
      FROM ipo_calendar i
      JOIN user_ipo_tracking ut ON i.id = ut.ipo_id
      WHERE ut.user_id = ? AND ut.alert_enabled = 1
      ORDER BY i.ipo_date ASC
    `;

    return this.db.db.prepare(sql).all(userId);
  }

  /**
   * Search IPOs
   */
  searchIPOs(query, limit = 20) {
    const sql = `
      SELECT * FROM ipo_calendar
      WHERE company_name LIKE ? OR symbol LIKE ? OR description LIKE ?
      ORDER BY ipo_date ASC
      LIMIT ?
    `;

    const searchTerm = `%${query}%`;
    return this.db.db.prepare(sql).all(searchTerm, searchTerm, searchTerm, limit);
  }
}

module.exports = IPOCalendarService;
