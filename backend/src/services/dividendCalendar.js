/**
 * Dividend Calendar Service
 * Handles fetching and managing dividend data
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const DividendDataFetcher = require('./dividendDataFetcher');

class DividendCalendarService {
  constructor(db) {
    this.db = db;
    this.dataFetcher = new DividendDataFetcher();
    this.initializeDividendData();
  }

  /**
   * Initialize dividend data with realistic schedules for popular dividend stocks
   */
  initializeDividendData() {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM dividend_calendar').get();

    if (count.count === 0) {
      logger.info('Initializing dividend calendar with realistic data');
      this.generateDividendData();
    }
  }

  /**
   * Generate realistic dividend data for major dividend-paying stocks
   * Uses deterministic dates based on typical quarterly schedules
   */
  generateDividendData() {
    const today = new Date();
    const dividendStocks = [
      // High-yield dividend aristocrats with typical ex-div month offsets
      { symbol: 'JNJ', name: 'Johnson & Johnson', amount: 1.24, yield: 2.9, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'PG', name: 'Procter & Gamble', amount: 1.01, yield: 2.5, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'KO', name: 'Coca-Cola', amount: 0.49, yield: 3.0, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'PEP', name: 'PepsiCo', amount: 1.35, yield: 2.8, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'XOM', name: 'Exxon Mobil', amount: 0.99, yield: 3.3, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'CVX', name: 'Chevron', amount: 1.63, yield: 4.1, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'T', name: 'AT&T', amount: 0.28, yield: 5.2, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'VZ', name: 'Verizon', amount: 0.67, yield: 6.5, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'MCD', name: "McDonald's", amount: 1.77, yield: 2.2, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'IBM', name: 'IBM', amount: 1.67, yield: 3.0, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'MMM', name: '3M Company', amount: 1.51, yield: 5.8, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'CAT', name: 'Caterpillar', amount: 1.41, yield: 1.5, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'ABBV', name: 'AbbVie', amount: 1.64, yield: 3.6, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'MO', name: 'Altria Group', amount: 1.02, yield: 8.2, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'O', name: 'Realty Income Corp', amount: 0.264, yield: 5.5, freq: 'monthly', monthOffset: 0 },
      { symbol: 'MAIN', name: 'Main Street Capital', amount: 0.245, yield: 6.2, freq: 'monthly', monthOffset: 0 },
      { symbol: 'STAG', name: 'STAG Industrial', amount: 0.124, yield: 4.3, freq: 'monthly', monthOffset: 0 },
      { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', amount: 0.98, yield: 2.9, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', amount: 0.78, yield: 3.5, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'MSFT', name: 'Microsoft', amount: 0.83, yield: 0.7, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'AAPL', name: 'Apple', amount: 0.26, yield: 0.4, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'JPM', name: 'JPMorgan Chase', amount: 1.25, yield: 2.2, freq: 'quarterly', monthOffset: 0 },
      { symbol: 'BAC', name: 'Bank of America', amount: 0.26, yield: 2.5, freq: 'quarterly', monthOffset: 2 },
      { symbol: 'WFC', name: 'Wells Fargo', amount: 0.40, yield: 2.3, freq: 'quarterly', monthOffset: 1 },
      { symbol: 'GS', name: 'Goldman Sachs', amount: 3.00, yield: 2.0, freq: 'quarterly', monthOffset: 1 }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO dividend_calendar (
        id, symbol, company_name, ex_dividend_date, payment_date, record_date,
        declaration_date, dividend_amount, dividend_yield, frequency, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    dividendStocks.forEach((stock, stockIndex) => {
      // Generate dividend dates for next 12 months using deterministic schedule
      const dividendsPerYear = stock.freq === 'monthly' ? 12 : 4;
      const monthsBetween = stock.freq === 'monthly' ? 1 : 3;

      for (let i = 0; i < dividendsPerYear; i++) {
        // Calculate ex-dividend date: deterministic based on stock's typical schedule
        const exDate = new Date(today.getFullYear(), today.getMonth() + (i * monthsBetween) + stock.monthOffset, 15);

        // Skip if date is in the past
        if (exDate < today) {
          exDate.setFullYear(exDate.getFullYear() + 1);
        }

        // Adjust to a weekday (Mon-Fri) - consistent offset based on stock symbol
        const dayAdjust = (stockIndex % 5) - 2; // -2 to +2 days
        exDate.setDate(exDate.getDate() + dayAdjust);

        // Record date is 1 business day after ex-date
        const recordDate = new Date(exDate);
        recordDate.setDate(recordDate.getDate() + 1);

        // Payment date is typically 2-3 weeks after ex-date
        const paymentDate = new Date(exDate);
        paymentDate.setDate(paymentDate.getDate() + 21 + (stockIndex % 7)); // 21-28 days

        // Declaration date is typically 1-2 weeks before ex-date
        const declarationDate = new Date(exDate);
        declarationDate.setDate(declarationDate.getDate() - 14 - (stockIndex % 7));

        stmt.run(
          uuidv4(),
          stock.symbol,
          stock.name,
          exDate.toISOString().split('T')[0],
          paymentDate.toISOString().split('T')[0],
          recordDate.toISOString().split('T')[0],
          declarationDate.toISOString().split('T')[0],
          stock.amount,
          stock.yield,
          stock.freq,
          'fallback' // Mark as fallback data, will be replaced by API data
        );
      }
    });

    logger.info('Dividend calendar fallback data initialized (will be replaced by live API data)');
  }

  /**
   * Get upcoming dividends
   */
  getUpcomingDividends(limit = 50) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const dividends = this.db.prepare(`
        SELECT * FROM dividend_calendar
        WHERE ex_dividend_date >= ?
        ORDER BY ex_dividend_date ASC
        LIMIT ?
      `).all(today, limit);

      return dividends;
    } catch (error) {
      logger.error('Error fetching upcoming dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dividends by date range
   */
  getDividendsByDateRange(startDate, endDate) {
    try {
      const dividends = this.db.prepare(`
        SELECT * FROM dividend_calendar
        WHERE ex_dividend_date BETWEEN ? AND ?
        ORDER BY ex_dividend_date ASC
      `).all(startDate, endDate);

      return dividends;
    } catch (error) {
      logger.error('Error fetching dividends by date range', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dividends for specific symbol
   */
  getDividendsBySymbol(symbol) {
    try {
      const dividends = this.db.prepare(`
        SELECT * FROM dividend_calendar
        WHERE symbol = ?
        ORDER BY ex_dividend_date DESC
        LIMIT 12
      `).all(symbol);

      return dividends;
    } catch (error) {
      logger.error('Error fetching dividends by symbol', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dividends for current month
   */
  getCurrentMonthDividends() {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      return this.getDividendsByDateRange(
        startOfMonth.toISOString().split('T')[0],
        endOfMonth.toISOString().split('T')[0]
      );
    } catch (error) {
      logger.error('Error fetching current month dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dividends for current week
   */
  getCurrentWeekDividends() {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return this.getDividendsByDateRange(
        startOfWeek.toISOString().split('T')[0],
        endOfWeek.toISOString().split('T')[0]
      );
    } catch (error) {
      logger.error('Error fetching current week dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Get today's dividends (ex-dividend or payment)
   */
  getTodaysDividends() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const dividends = this.db.prepare(`
        SELECT * FROM dividend_calendar
        WHERE ex_dividend_date = ? OR payment_date = ?
        ORDER BY ex_dividend_date ASC
      `).all(today, today);

      return dividends;
    } catch (error) {
      logger.error('Error fetching today\'s dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dividend statistics
   */
  getDividendStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const todayCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM dividend_calendar
        WHERE ex_dividend_date = ? OR payment_date = ?
      `).get(today, today);

      const thisWeekCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM dividend_calendar
        WHERE ex_dividend_date BETWEEN date('now') AND date('now', '+7 days')
      `).get();

      const thisMonthCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM dividend_calendar
        WHERE strftime('%Y-%m', ex_dividend_date) = strftime('%Y-%m', 'now')
      `).get();

      const totalUpcoming = this.db.prepare(`
        SELECT COUNT(*) as count FROM dividend_calendar
        WHERE ex_dividend_date >= ?
      `).get(today);

      return {
        today: todayCount.count,
        thisWeek: thisWeekCount.count,
        thisMonth: thisMonthCount.count,
        upcoming: totalUpcoming.count
      };
    } catch (error) {
      logger.error('Error fetching dividend stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Search dividends by company name or symbol
   */
  searchDividends(query) {
    try {
      const searchPattern = `%${query}%`;

      const dividends = this.db.prepare(`
        SELECT * FROM dividend_calendar
        WHERE symbol LIKE ? OR company_name LIKE ?
        ORDER BY ex_dividend_date DESC
        LIMIT 50
      `).all(searchPattern, searchPattern);

      return dividends;
    } catch (error) {
      logger.error('Error searching dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user's tracked dividends (based on portfolio holdings)
   */
  getUserTrackedDividends(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const dividends = this.db.prepare(`
        SELECT dc.*, h.shares, h.avg_cost_basis, p.name as portfolio_name
        FROM dividend_calendar dc
        INNER JOIN holdings h ON dc.symbol = h.symbol
        INNER JOIN portfolios p ON h.portfolio_id = p.id
        WHERE p.user_id = ? AND dc.ex_dividend_date >= ?
        ORDER BY dc.ex_dividend_date ASC
        LIMIT 100
      `).all(userId, today);

      // Calculate estimated dividend income
      const enrichedDividends = dividends.map(div => ({
        ...div,
        estimated_income: (div.shares * div.dividend_amount).toFixed(2)
      }));

      return enrichedDividends;
    } catch (error) {
      logger.error('Error fetching user tracked dividends', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate projected dividend income for user
   */
  getProjectedDividendIncome(userId, months = 12) {
    try {
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);
      const endDateStr = endDate.toISOString().split('T')[0];

      const dividends = this.db.prepare(`
        SELECT dc.symbol, dc.dividend_amount, dc.ex_dividend_date, h.shares
        FROM dividend_calendar dc
        INNER JOIN holdings h ON dc.symbol = h.symbol
        INNER JOIN portfolios p ON h.portfolio_id = p.id
        WHERE p.user_id = ? AND dc.ex_dividend_date BETWEEN ? AND ?
        ORDER BY dc.ex_dividend_date ASC
      `).all(userId, startDate, endDateStr);

      const totalIncome = dividends.reduce((sum, div) => {
        return sum + (div.dividend_amount * div.shares);
      }, 0);

      // Group by month
      const monthlyIncome = {};
      dividends.forEach(div => {
        const month = div.ex_dividend_date.substring(0, 7); // YYYY-MM
        if (!monthlyIncome[month]) {
          monthlyIncome[month] = 0;
        }
        monthlyIncome[month] += (div.dividend_amount * div.shares);
      });

      return {
        totalProjected: totalIncome.toFixed(2),
        monthlyBreakdown: monthlyIncome,
        dividendCount: dividends.length
      };
    } catch (error) {
      logger.error('Error calculating projected dividend income', { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh dividend data from live API
   */
  async refreshDividendData() {
    try {
      logger.info('Refreshing dividend data from FMP API...');

      // Delete old future dividends to avoid duplicates
      const today = new Date().toISOString().split('T')[0];
      this.db.prepare('DELETE FROM dividend_calendar WHERE ex_dividend_date >= ?').run(today);

      // Fetch upcoming dividends for next 90 days
      const dividends = await this.dataFetcher.getUpcomingDividends(90);

      if (dividends.length === 0) {
        logger.warn('No dividends fetched from API, using fallback data');
        this.generateDividendData(); // Fallback to generated data
        return {
          success: true,
          message: 'Using fallback dividend data',
          count: 0
        };
      }

      // Enrich with company names
      const enrichedDividends = await this.dataFetcher.enrichWithCompanyNames(dividends);

      // Insert new dividends
      const stmt = this.db.prepare(`
        INSERT INTO dividend_calendar (
          id, symbol, company_name, ex_dividend_date, payment_date, record_date,
          declaration_date, dividend_amount, dividend_yield, frequency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let insertCount = 0;
      for (const div of enrichedDividends) {
        try {
          stmt.run(
            uuidv4(),
            div.symbol,
            div.company_name,
            div.ex_dividend_date,
            div.payment_date,
            div.record_date,
            div.declaration_date,
            div.dividend_amount,
            div.dividend_yield,
            div.frequency,
            div.status || 'confirmed'
          );
          insertCount++;
        } catch (err) {
          logger.error(`Error inserting dividend for ${div.symbol}:`, err.message);
        }
      }

      logger.info(`Successfully refreshed ${insertCount} dividends from live API`);

      return {
        success: true,
        message: 'Dividend data refreshed from live API',
        count: insertCount
      };
    } catch (error) {
      logger.error('Error refreshing dividend data', { error: error.message });
      // Fallback to generated data
      this.generateDividendData();
      return {
        success: false,
        message: 'API refresh failed, using fallback data',
        error: error.message
      };
    }
  }

  /**
   * Fetch and update dividend data for specific symbols
   */
  async updateSymbolDividends(symbols) {
    try {
      logger.info(`Updating dividend data for ${symbols.length} symbols`);

      const dividends = await this.dataFetcher.fetchMultipleSymbols(symbols);

      if (dividends.length === 0) {
        return { success: false, message: 'No dividends fetched', count: 0 };
      }

      // Delete existing future dividends for these symbols
      const today = new Date().toISOString().split('T')[0];
      const placeholders = symbols.map(() => '?').join(',');
      this.db.prepare(
        `DELETE FROM dividend_calendar WHERE symbol IN (${placeholders}) AND ex_dividend_date >= ?`
      ).run(...symbols, today);

      // Insert new dividends
      const stmt = this.db.prepare(`
        INSERT INTO dividend_calendar (
          id, symbol, company_name, ex_dividend_date, payment_date, record_date,
          declaration_date, dividend_amount, dividend_yield, frequency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let insertCount = 0;
      for (const div of dividends) {
        try {
          stmt.run(
            uuidv4(),
            div.symbol,
            div.company_name,
            div.ex_dividend_date,
            div.payment_date,
            div.record_date,
            div.declaration_date,
            div.dividend_amount,
            div.dividend_yield,
            div.frequency,
            'confirmed'
          );
          insertCount++;
        } catch (err) {
          logger.error(`Error inserting dividend for ${div.symbol}:`, err.message);
        }
      }

      logger.info(`Updated ${insertCount} dividends for specified symbols`);

      return {
        success: true,
        message: `Updated dividends for ${symbols.length} symbols`,
        count: insertCount
      };
    } catch (error) {
      logger.error('Error updating symbol dividends', { error: error.message });
      throw error;
    }
  }
}

module.exports = DividendCalendarService;
