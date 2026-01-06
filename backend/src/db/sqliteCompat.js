/**
 * SQLite Compatibility Layer
 * Provides a SQLite-compatible interface that works on both local (SQLite) and Railway (PostgreSQL)
 *
 * On Railway: Returns a mock object that gracefully handles SQLite calls
 * On Local: Returns actual better-sqlite3 connection
 */

const path = require('path');
const logger = require('../utils/logger');

let db = null;
let isPostgres = false;

// Check if we're using PostgreSQL (Railway)
const dbType = process.env.DATABASE_TYPE || 'sqlite';
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (dbType === 'postgresql' || (postgresUrl && postgresUrl.startsWith('postgres'))) {
  isPostgres = true;
  logger.info('SQLite compat: Running in PostgreSQL mode - SQLite features disabled');

  // Create a mock SQLite interface for PostgreSQL environments
  db = {
    prepare: (sql) => ({
      run: (...args) => ({ changes: 0 }),
      get: (...args) => null,
      all: (...args) => [],
      pluck: () => ({ get: () => null, all: () => [] }),
      bind: (...args) => ({ run: () => ({ changes: 0 }), get: () => null, all: () => [] })
    }),
    exec: (sql) => {},
    pragma: (cmd) => {},
    transaction: (fn) => fn,
    close: () => {}
  };
} else {
  // Local development - use actual SQLite
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    logger.info('SQLite compat: Using better-sqlite3');
  } catch (error) {
    logger.warn('SQLite compat: better-sqlite3 not available, using mock');
    db = {
      prepare: (sql) => ({
        run: (...args) => ({ changes: 0 }),
        get: (...args) => null,
        all: (...args) => [],
        pluck: () => ({ get: () => null, all: () => [] }),
        bind: (...args) => ({ run: () => ({ changes: 0 }), get: () => null, all: () => [] })
      }),
      exec: (sql) => {},
      pragma: (cmd) => {},
      transaction: (fn) => fn,
      close: () => {}
    };
  }
}

module.exports = db;
module.exports.isPostgres = isPostgres;
