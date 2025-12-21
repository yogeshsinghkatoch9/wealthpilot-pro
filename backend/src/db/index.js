/**
 * Database Module Index
 * Exports the appropriate database adapter based on configuration
 */

const logger = require('../utils/logger');

// Check database type from environment
const dbType = process.env.DATABASE_TYPE || 'sqlite';
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

let Database;

// Select database adapter
if (dbType === 'postgresql' || (postgresUrl && postgresUrl.startsWith('postgres'))) {
  logger.info('📦 Database: Initializing PostgreSQL adapter');
  const PostgresAdapter = require('./postgresAdapter');
  Database = new PostgresAdapter();
} else {
  logger.info('📦 Database: Using SQLite adapter');
  Database = require('./database');
}

module.exports = Database;
