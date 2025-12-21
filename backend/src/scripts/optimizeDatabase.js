/**
 * Database Optimization Script
 * Adds missing indexes and optimizes SQLite database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, '../../data/wealthpilot.db');

const optimizations = [
  // Stock Quotes - High frequency reads
  {
    name: 'idx_stock_quotes_updated_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_stock_quotes_updated_at ON stock_quotes(updated_at DESC);',
    description: 'Index on stock_quotes.updated_at for recent quotes'
  },
  {
    name: 'idx_stock_quotes_sector',
    sql: 'CREATE INDEX IF NOT EXISTS idx_stock_quotes_sector ON stock_quotes(sector);',
    description: 'Index on stock_quotes.sector for sector analysis'
  },

  // Stock History - Time series queries
  {
    name: 'idx_stock_history_symbol_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_stock_history_symbol_date ON StockHistory(symbol, date DESC);',
    description: 'Composite index for historical data queries'
  },

  // Portfolio Snapshots - Performance tracking
  {
    name: 'idx_portfolio_snapshots_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON PortfolioSnapshot(portfolioId, snapshotDate DESC);',
    description: 'Composite index for portfolio performance queries'
  },

  // Transactions - Common query patterns
  {
    name: 'idx_transactions_portfolio_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_date ON transactions(portfolio_id, executed_at DESC);',
    description: 'Composite index for transaction history'
  },
  {
    name: 'idx_transactions_user_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, executed_at DESC);',
    description: 'Index for user transaction queries'
  },

  // Holdings - Portfolio queries
  {
    name: 'idx_holdings_portfolio_symbol',
    sql: 'CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_symbol ON holdings(portfolio_id, symbol);',
    description: 'Composite index for holdings lookups'
  },

  // Tax Lots - Tax optimization queries
  {
    name: 'idx_tax_lots_holding_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_tax_lots_holding_date ON tax_lots(holding_id, purchase_date);',
    description: 'Index for tax lot queries'
  },

  // Dividend History - Dividend tracking
  {
    name: 'idx_dividend_history_symbol_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_dividend_history_symbol_date ON DividendHistory(symbol, exDate DESC);',
    description: 'Index for dividend lookups'
  },

  // Earnings Calendar - Upcoming earnings
  {
    name: 'idx_earnings_calendar_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date ON EarningsCalendar(reportDate);',
    description: 'Index for earnings calendar queries'
  },

  // News Articles - Recent news
  {
    name: 'idx_news_articles_published',
    sql: 'CREATE INDEX IF NOT EXISTS idx_news_articles_published ON NewsArticle(publishedAt DESC);',
    description: 'Index for recent news queries'
  },
  {
    name: 'idx_news_articles_symbol_published',
    sql: 'CREATE INDEX IF NOT EXISTS idx_news_articles_symbol_published ON NewsArticle(symbol, publishedAt DESC);',
    description: 'Index for symbol-specific news'
  },

  // Sector Performance - Sector analysis
  {
    name: 'idx_sector_performance_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sector_performance_date ON SectorPerformance(sectorCode, date DESC);',
    description: 'Index for sector performance queries'
  },

  // Watchlist Items - Quick lookups
  {
    name: 'idx_watchlist_items_symbol',
    sql: 'CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON WatchlistItem(symbol);',
    description: 'Index for watchlist symbol lookups'
  },

  // Alerts - Active alerts monitoring
  {
    name: 'idx_alerts_active_symbol',
    sql: 'CREATE INDEX IF NOT EXISTS idx_alerts_active_symbol ON Alert(is_active, symbol);',
    description: 'Index for active alerts by symbol'
  },
  {
    name: 'idx_alerts_user_active',
    sql: 'CREATE INDEX IF NOT EXISTS idx_alerts_user_active ON Alert(user_id, is_active, is_triggered);',
    description: 'Index for user alerts queries'
  },

  // Sessions - Auth queries
  {
    name: 'idx_sessions_expires',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);',
    description: 'Index for session cleanup'
  },

  // Sentiment Data - Recent sentiment
  {
    name: 'idx_sentiment_data_symbol_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sentiment_data_symbol_date ON SentimentData(symbol, date DESC);',
    description: 'Index for sentiment queries'
  },

  // Social Media Mentions - Recent mentions
  {
    name: 'idx_social_mentions_published',
    sql: 'CREATE INDEX IF NOT EXISTS idx_social_mentions_published ON SocialMediaMention(symbol, publishedAt DESC);',
    description: 'Index for recent mentions'
  }
];

async function optimizeDatabase() {
  logger.debug('🔧 Starting database optimization...\n');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }

      logger.debug('✓ Connected to database\n');

      let completed = 0;
      let failed = 0;

      // Run all optimizations
      optimizations.forEach((opt, index) => {
        db.run(opt.sql, (err) => {
          if (err) {
            logger.error(`❌ Failed: ${opt.name}`);
            logger.error(`   ${err.message}`);
            failed++;
          } else {
            logger.debug(`✓ ${opt.name}`);
            logger.debug(`  ${opt.description}`);
          }

          completed++;

          // If all optimizations are done
          if (completed === optimizations.length) {
            logger.debug('\n📊 Optimization complete:');
            logger.debug(`   ✓ ${completed - failed} indexes created`);
            logger.debug(`   ❌ ${failed} failed`);

            // Run ANALYZE to update query planner statistics
            db.run('ANALYZE;', (err) => {
              if (err) {
                logger.error('❌ Failed to run ANALYZE:', err.message);
              } else {
                logger.debug('✓ Database statistics updated (ANALYZE)');
              }

              // Run VACUUM to defragment
              db.run('VACUUM;', (err) => {
                if (err) {
                  logger.error('❌ Failed to run VACUUM:', err.message);
                } else {
                  logger.debug('✓ Database defragmented (VACUUM)');
                }

                db.close((err) => {
                  if (err) {
                    logger.error('❌ Error closing database:', err.message);
                    reject(err);
                  } else {
                    logger.debug('\n✅ Database optimization complete!');
                    resolve();
                  }
                });
              });
            });
          }
        });
      });
    });
  });
}

// Run if executed directly
if (require.main === module) {
  optimizeDatabase()
    .then(() => {
      logger.debug('\n🎉 All done!');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('\n💥 Optimization failed:', err);
      process.exit(1);
    });
}

module.exports = optimizeDatabase;
