/**
 * Database Factory
 * Automatically selects SQLite or PostgreSQL based on configuration
 */

const logger = require('../utils/logger');

function createDatabase() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  // Check if PostgreSQL is configured
  if (dbType === 'postgresql' || (postgresUrl && postgresUrl.startsWith('postgres'))) {
    logger.info('Database: Using PostgreSQL adapter');
    const PostgresAdapter = require('./postgresAdapter');
    return new PostgresAdapter();
  }

  // Default to SQLite
  logger.info('Database: Using SQLite adapter');
  const SqliteAdapter = require('./database');
  return SqliteAdapter;
}

module.exports = createDatabase;
