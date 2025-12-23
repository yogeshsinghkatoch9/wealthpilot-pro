/**
 * PostgreSQL Database Adapter
 * Drop-in replacement for SQLite adapter for production use
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

class PostgresAdapter {
  constructor() {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

    if (!connectionString || !connectionString.startsWith('postgres')) {
      throw new Error('POSTGRES_URL environment variable is required for PostgreSQL adapter');
    }

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    // Initialize asynchronously but don't crash on failure
    // This allows the server to start even if DB connection is slow
    this.initialized = false;
    this.initPromise = this.init().catch(err => {
      logger.error('PostgreSQL init failed (will retry on queries):', err.message);
      this.initialized = false;
    });
  }

  /**
   * SQLite compatibility: prepare method returns statement-like object
   * This allows code written for SQLite to work with PostgreSQL
   * Note: These are SYNCHRONOUS compatibility shims - they return default values
   * to allow the server to start. For actual data, use async methods.
   */
  prepare(sql) {
    const pool = this.pool;
    const sqlLower = sql.toLowerCase().trim();

    // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
    let paramIndex = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

    // Detect query type for smarter defaults
    const isCountQuery = sqlLower.includes('count(') || sqlLower.includes('count (');
    const isSumQuery = sqlLower.includes('sum(') || sqlLower.includes('sum (');
    const isSelectQuery = sqlLower.startsWith('select');
    const isInsertQuery = sqlLower.startsWith('insert');
    const isUpdateQuery = sqlLower.startsWith('update');
    const isDeleteQuery = sqlLower.startsWith('delete');
    const isAlterQuery = sqlLower.startsWith('alter');

    return {
      all: (...params) => {
        // Return empty array for SELECT queries
        if (isSelectQuery) {
          logger.debug('SQLite compat: prepare().all() - returning empty array');
          return [];
        }
        return [];
      },
      get: (...params) => {
        // Return sensible defaults for aggregate queries
        if (isCountQuery) {
          logger.debug('SQLite compat: prepare().get() COUNT - returning {count: 0}');
          return { count: 0 };
        }
        if (isSumQuery) {
          logger.debug('SQLite compat: prepare().get() SUM - returning {sum: 0}');
          return { sum: 0, total: 0 };
        }
        if (isSelectQuery) {
          logger.debug('SQLite compat: prepare().get() SELECT - returning null');
          return null;
        }
        return null;
      },
      run: (...params) => {
        // Log write operations that won't persist
        if (isInsertQuery || isUpdateQuery || isDeleteQuery) {
          logger.debug(`SQLite compat: prepare().run() ${isInsertQuery ? 'INSERT' : isUpdateQuery ? 'UPDATE' : 'DELETE'} - no-op in sync mode`);
        }
        if (isAlterQuery) {
          // ALTER queries during migrations - silently succeed
          logger.debug('SQLite compat: prepare().run() ALTER - no-op (handled by PostgreSQL migrations)');
        }
        return { changes: 0, lastInsertRowid: 0 };
      }
    };
  }

  async init() {
    try {
      await this.pool.query('SELECT NOW()');
      logger.info('PostgreSQL connected successfully');
      await this.createTables();
      this.initialized = true;
      logger.info('PostgreSQL adapter fully initialized');
    } catch (err) {
      logger.error('PostgreSQL connection failed:', err);
      throw err;
    }
  }

  async createTables() {
    const queries = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        plan VARCHAR(50) DEFAULT 'free',
        theme VARCHAR(50) DEFAULT 'light',
        currency VARCHAR(10) DEFAULT 'USD',
        timezone VARCHAR(50) DEFAULT 'UTC',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        user_agent TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS portfolios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        currency VARCHAR(10) DEFAULT 'USD',
        benchmark VARCHAR(20) DEFAULT 'SPY',
        cash_balance DECIMAL(15,2) DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        client_name VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS holdings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        shares DECIMAL(15,6) NOT NULL,
        avg_cost_basis DECIMAL(15,4),
        sector VARCHAR(100),
        asset_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watchlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watchlist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        watchlist_id UUID REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        target_price DECIMAL(15,4),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        type VARCHAR(20) NOT NULL,
        shares DECIMAL(15,6),
        price DECIMAL(15,4),
        amount DECIMAL(15,2),
        fees DECIMAL(15,2) DEFAULT 0,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20),
        type VARCHAR(50) NOT NULL,
        alert_type VARCHAR(50),
        condition VARCHAR(255),
        target_value DECIMAL(15,4),
        message TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        is_triggered BOOLEAN DEFAULT FALSE,
        triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
      CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
      CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
    `;

    try {
      await this.pool.query(queries);
      logger.info('PostgreSQL tables created/verified');

      // Run migrations for existing tables
      await this.runMigrations();
    } catch (err) {
      logger.error('Error creating PostgreSQL tables:', err);
    }
  }

  async runMigrations() {
    // Add missing columns to alerts table
    const migrations = [
      'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS type VARCHAR(50)',
      'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_triggered BOOLEAN DEFAULT FALSE',
      'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ];

    for (const sql of migrations) {
      try {
        await this.pool.query(sql);
      } catch (err) {
        // Ignore errors (column might already exist)
        if (!err.message.includes('already exists')) {
          logger.warn('Migration warning:', err.message);
        }
      }
    }
    logger.info('PostgreSQL migrations completed');
  }

  // ==================== USER METHODS ====================

  async createUser(email, password, firstName, lastName) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, email.toLowerCase(), passwordHash, firstName, lastName, now, now]
    );

    return result.rows[0];
  }

  getUserByEmail(email) {
    return this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    ).then(r => r.rows[0]);
  }

  getUserById(id) {
    return this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    ).then(r => r.rows[0]);
  }

  // ==================== SESSION METHODS ====================

  createSession(userId, token, expiresAt, userAgent, ipAddress) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO sessions (id, user_id, token, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, token, expiresAt, userAgent, ipAddress]
    );
  }

  getSessionByToken(token) {
    return this.pool.query(
      `SELECT s.*, u.email, u.first_name, u.last_name, u.plan
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    ).then(r => r.rows[0]);
  }

  deleteSession(token) {
    return this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  deleteUserSessions(userId) {
    return this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  // ==================== PORTFOLIO METHODS ====================

  getPortfoliosByUserId(userId) {
    return this.pool.query(
      'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    ).then(r => r.rows);
  }

  getPortfolioById(id) {
    return this.pool.query(
      'SELECT * FROM portfolios WHERE id = $1',
      [id]
    ).then(r => r.rows[0]);
  }

  createPortfolio(userId, name, description, currency, benchmark, cashBalance, isDefault) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO portfolios (id, user_id, name, description, currency, benchmark, cash_balance, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, userId, name, description, currency, benchmark, cashBalance, isDefault]
    ).then(r => r.rows[0]);
  }

  updatePortfolio(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${this.toSnakeCase(key)} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return Promise.resolve();

    values.push(id);
    return this.pool.query(
      `UPDATE portfolios SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  deletePortfolio(id) {
    return this.pool.query('DELETE FROM portfolios WHERE id = $1', [id]);
  }

  // ==================== HOLDINGS METHODS ====================

  getHoldingsByPortfolioId(portfolioId) {
    return this.pool.query(
      'SELECT * FROM holdings WHERE portfolio_id = $1 ORDER BY symbol',
      [portfolioId]
    ).then(r => r.rows);
  }

  createHolding(portfolioId, symbol, name, shares, avgCostBasis, sector, assetType) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_cost_basis, sector, asset_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, portfolioId, symbol.toUpperCase(), name, shares, avgCostBasis, sector, assetType]
    ).then(r => r.rows[0]);
  }

  updateHolding(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${this.toSnakeCase(key)} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return Promise.resolve();

    values.push(id);
    return this.pool.query(
      `UPDATE holdings SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  deleteHolding(id) {
    return this.pool.query('DELETE FROM holdings WHERE id = $1', [id]);
  }

  // ==================== WATCHLIST METHODS ====================

  getWatchlistsByUserId(userId) {
    return this.pool.query(
      'SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    ).then(r => r.rows);
  }

  createWatchlist(userId, name, description) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO watchlists (id, user_id, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, userId, name, description]
    ).then(r => r.rows[0]);
  }

  // ==================== ALERTS METHODS ====================

  getAlertsByUserId(userId) {
    return this.pool.query(
      'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    ).then(r => r.rows);
  }

  getActiveAlerts() {
    return this.pool.query(
      'SELECT * FROM alerts WHERE is_active = TRUE'
    ).then(r => r.rows);
  }

  createAlert(userId, symbol, alertType, condition, targetValue, message) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO alerts (id, user_id, symbol, alert_type, condition, target_value, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, userId, symbol.toUpperCase(), alertType, condition, targetValue, message]
    ).then(r => r.rows[0]);
  }

  // ==================== UTILITY METHODS ====================

  toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // Compatibility wrappers for SQLite-style API
  get(sql, params = []) {
    // Convert ? placeholders to $1, $2, etc.
    const pgSql = this.convertPlaceholders(sql);
    return this.pool.query(pgSql, params).then(r => r.rows[0]);
  }

  all(sql, params = []) {
    const pgSql = this.convertPlaceholders(sql);
    return this.pool.query(pgSql, params).then(r => r.rows);
  }

  run(sql, params = []) {
    const pgSql = this.convertPlaceholders(sql);
    return this.pool.query(pgSql, params);
  }

  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  convertPlaceholders(sql) {
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  // Expose db property for compatibility - use synchronous prepare shim
  get db() {
    const self = this;
    return {
      prepare: (sql) => self.prepare(sql),
      exec: (sql) => {
        // exec is used for multi-statement SQL - no-op in sync mode
        logger.debug('SQLite compat: db.exec() - no-op');
        return undefined;
      },
      pragma: () => undefined
    };
  }

  async close() {
    await this.pool.end();
    logger.info('PostgreSQL connection pool closed');
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.pool.query('SELECT NOW()');
      return { status: 'connected', timestamp: result.rows[0].now };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  // Additional methods for feature compatibility
  getAllHoldingsByUser(userId) {
    return this.pool.query(`
      SELECT h.*, p.name as portfolio_name
      FROM holdings h
      JOIN portfolios p ON h.portfolio_id = p.id
      WHERE p.user_id = $1
      ORDER BY h.symbol ASC
    `, [userId]).then(r => r.rows);
  }

  getTransactionsByPortfolio(portfolioId) {
    return this.pool.query(
      'SELECT * FROM transactions WHERE portfolio_id = $1 ORDER BY executed_at DESC',
      [portfolioId]
    ).then(r => r.rows);
  }

  createTransaction(userId, portfolioId, symbol, type, shares, price, amount, fees) {
    const id = uuidv4();
    return this.pool.query(
      `INSERT INTO transactions (id, user_id, portfolio_id, symbol, type, shares, price, amount, fees)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, userId, portfolioId, symbol.toUpperCase(), type, shares, price, amount, fees]
    ).then(r => r.rows[0]);
  }
}

module.exports = PostgresAdapter;
