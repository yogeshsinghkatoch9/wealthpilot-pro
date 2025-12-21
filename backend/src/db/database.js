// Check if PostgreSQL is configured - if so, use PostgreSQL adapter
const dbType = process.env.DATABASE_TYPE || 'sqlite';
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Use process.stdout for early initialization (before logger is available)
const logDb = (msg) => process.stdout.write(`[DB] ${msg}\n`);

if (dbType === 'postgresql' || (postgresUrl && postgresUrl.startsWith('postgres'))) {
  logDb('Using PostgreSQL adapter');
  try {
    const PostgresAdapter = require('./postgresAdapter');
    module.exports = new PostgresAdapter();
    return; // Exit early, don't load SQLite
  } catch (error) {
    process.stderr.write(`[DB] Failed to initialize PostgreSQL adapter: ${error.message}\n`);
    process.stderr.write(`[DB] This is a fatal error - PostgreSQL was configured but failed\n`);
    // Don't fall through to SQLite - throw to make it clear what failed
    throw new Error(`PostgreSQL adapter failed to initialize: ${error.message}`);
  }
}

// SQLite Configuration
logDb('Using SQLite adapter');
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const dbPath = path.join(__dirname, '../../data/wealthpilot.db');

class DatabaseAdapter {
  constructor() {
    // Only enable verbose logging in development
    const verboseLog = process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : null;
    this.db = new Database(dbPath, { verbose: verboseLog });
    this.init();
  }

  init() {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Ensure tables exist (basic schema based on usage)
    // In a real app, use migrations. This is a fallback to ensure startup.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        first_name TEXT,
        last_name TEXT,
        plan TEXT DEFAULT 'free',
        theme TEXT DEFAULT 'light',
        currency TEXT DEFAULT 'USD',
        timezone TEXT DEFAULT 'UTC',
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token TEXT UNIQUE,
        expires_at TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        description TEXT,
        currency TEXT DEFAULT 'USD',
        benchmark TEXT DEFAULT 'SPY',
        cash_balance REAL DEFAULT 0,
        is_default BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
    `);

    // Migration: Add columns to portfolios if they don't exist
    try {
      this.db.prepare('ALTER TABLE portfolios ADD COLUMN client_name TEXT').run();
    } catch (err) { /* ignore if exists */ }

    try {
      this.db.prepare('ALTER TABLE portfolios ADD COLUMN notes TEXT').run();
    } catch (err) { /* ignore if exists */ }

    // Migration: Add 2FA columns to users table
    try {
      this.db.prepare('ALTER TABLE users ADD COLUMN two_factor_secret TEXT').run();
    } catch (err) { /* ignore if exists */ }
    try {
      this.db.prepare('ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0').run();
    } catch (err) { /* ignore if exists */ }
    try {
      this.db.prepare('ALTER TABLE users ADD COLUMN two_factor_pending INTEGER DEFAULT 0').run();
    } catch (err) { /* ignore if exists */ }
    try {
      this.db.prepare('ALTER TABLE users ADD COLUMN backup_codes TEXT').run();
    } catch (err) { /* ignore if exists */ }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holdings(
      id TEXT PRIMARY KEY,
      portfolio_id TEXT,
      symbol TEXT,
      name TEXT,
      shares REAL,
      avg_cost_basis REAL,
      sector TEXT,
      asset_type TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    );
    `);
    // ... existing migrations for holdings ...
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        description TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS watchlist_items (
        id TEXT PRIMARY KEY,
        watchlist_id TEXT,
        symbol TEXT,
        target_price REAL,
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS transactions (
         id TEXT PRIMARY KEY,
         user_id TEXT,
         portfolio_id TEXT,
         symbol TEXT,
         type TEXT,
         shares REAL,
         price REAL,
         amount REAL,
         fees REAL DEFAULT 0,
         executed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
         FOREIGN KEY(user_id) REFERENCES users(id),
         FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
      );

      -- Alerts System
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        symbol TEXT,
        alert_type TEXT,
        condition TEXT,
        target_value REAL,
        message TEXT,
        is_active INTEGER DEFAULT 1,
        triggered_at DATETIME,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS alert_history (
        id TEXT PRIMARY KEY,
        alert_id TEXT,
        user_id TEXT,
        symbol TEXT,
        message TEXT,
        trigger_price REAL,
        triggered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(alert_id) REFERENCES alerts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Goals & Planning
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        target_amount REAL,
        current_amount REAL DEFAULT 0,
        target_date DATE,
        category TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'in_progress',
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Trading Journal
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        symbol TEXT,
        entry_type TEXT,
        entry_price REAL,
        exit_price REAL,
        shares REAL,
        profit_loss REAL,
        strategy TEXT,
        setup TEXT,
        emotions TEXT,
        lessons TEXT,
        rating INTEGER,
        entry_date DATETIME,
        exit_date DATETIME,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Tax Documents & Reports
      CREATE TABLE IF NOT EXISTS tax_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        year INTEGER,
        document_type TEXT,
        file_name TEXT,
        file_path TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS tax_lots (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        portfolio_id TEXT,
        symbol TEXT,
        shares REAL,
        cost_basis REAL,
        purchase_date DATE,
        holding_period TEXT,
        unrealized_gain REAL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
      );

      -- Real Estate Holdings
      CREATE TABLE IF NOT EXISTS real_estate (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        property_name TEXT,
        address TEXT,
        property_type TEXT,
        purchase_price REAL,
        current_value REAL,
        purchase_date DATE,
        mortgage_balance REAL DEFAULT 0,
        monthly_rent REAL DEFAULT 0,
        expenses REAL DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Bonds Portfolio
      CREATE TABLE IF NOT EXISTS bonds (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        portfolio_id TEXT,
        name TEXT,
        cusip TEXT,
        face_value REAL,
        purchase_price REAL,
        coupon_rate REAL,
        maturity_date DATE,
        payment_frequency TEXT,
        bond_type TEXT,
        rating TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
      );

      -- DRIP Settings
      CREATE TABLE IF NOT EXISTS drip_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        portfolio_id TEXT,
        symbol TEXT,
        is_enabled INTEGER DEFAULT 1,
        reinvest_percent REAL DEFAULT 100,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
      );

      -- Paper Trading
      CREATE TABLE IF NOT EXISTS paper_trades (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        symbol TEXT,
        trade_type TEXT,
        quantity REAL,
        entry_price REAL,
        exit_price REAL,
        status TEXT DEFAULT 'open',
        profit_loss REAL,
        entry_date TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        exit_date DATETIME,
        notes TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS paper_portfolio (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        cash_balance REAL DEFAULT 100000,
        total_value REAL DEFAULT 100000,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Crypto Portfolio
      CREATE TABLE IF NOT EXISTS crypto_holdings (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        symbol TEXT,
        name TEXT,
        quantity REAL,
        avg_cost REAL,
        wallet_address TEXT,
        exchange TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Broker Connections
      CREATE TABLE IF NOT EXISTS broker_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        broker_name TEXT,
        account_id TEXT,
        access_token TEXT,
        refresh_token TEXT,
        is_active INTEGER DEFAULT 1,
        last_sync DATETIME,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- API Keys
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        api_key TEXT UNIQUE,
        api_secret TEXT,
        name TEXT,
        permissions TEXT,
        is_active INTEGER DEFAULT 1,
        last_used DATETIME,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- AI Chat History
      CREATE TABLE IF NOT EXISTS ai_chat_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Copy Trading
      CREATE TABLE IF NOT EXISTS copy_traders (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        trader_id TEXT,
        trader_name TEXT,
        allocation_percent REAL,
        is_active INTEGER DEFAULT 1,
        total_copied_trades INTEGER DEFAULT 0,
        profit_loss REAL DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Social & Community
      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        content TEXT,
        trade_symbol TEXT,
        trade_type TEXT,
        likes INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS social_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT,
        user_id TEXT,
        content TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(post_id) REFERENCES social_posts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS social_follows (
        id TEXT PRIMARY KEY,
        follower_id TEXT,
        following_id TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(follower_id) REFERENCES users(id),
        FOREIGN KEY(following_id) REFERENCES users(id)
      );

      -- Leaderboard
      CREATE TABLE IF NOT EXISTS leaderboard (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        display_name TEXT,
        total_return REAL DEFAULT 0,
        monthly_return REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        rank INTEGER,
        badge TEXT,
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Forum
      CREATE TABLE IF NOT EXISTS forum_categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        post_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id TEXT PRIMARY KEY,
        category_id TEXT,
        user_id TEXT,
        title TEXT,
        content TEXT,
        views INTEGER DEFAULT 0,
        replies INTEGER DEFAULT 0,
        is_pinned INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(category_id) REFERENCES forum_categories(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS forum_replies (
        id TEXT PRIMARY KEY,
        post_id TEXT,
        user_id TEXT,
        content TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(post_id) REFERENCES forum_posts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Calendar Events
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT DEFAULT 'event',
        start_date DATETIME NOT NULL,
        end_date DATETIME NOT NULL,
        all_day INTEGER DEFAULT 0,
        location TEXT,
        color TEXT DEFAULT '#f59e0b',
        symbol TEXT,
        reminder_minutes INTEGER DEFAULT 15,
        status TEXT DEFAULT 'confirmed',
        is_recurring INTEGER DEFAULT 0,
        recurring_pattern TEXT,
        attendees TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(start_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);

      -- Shared Portfolios
      CREATE TABLE IF NOT EXISTS shared_portfolios (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT,
        user_id TEXT,
        share_code TEXT UNIQUE,
        is_public INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- User Settings Extended
      CREATE TABLE IF NOT EXISTS user_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE,
        notification_email INTEGER DEFAULT 1,
        notification_push INTEGER DEFAULT 1,
        notification_sms INTEGER DEFAULT 0,
        two_factor_enabled INTEGER DEFAULT 0,
        default_portfolio_id TEXT,
        date_format TEXT DEFAULT 'MM/DD/YYYY',
        number_format TEXT DEFAULT 'en-US',
        risk_tolerance TEXT DEFAULT 'moderate',
        investment_horizon INTEGER DEFAULT 10,
        tax_bracket REAL DEFAULT 0.25,
        state TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Reports Generated
      CREATE TABLE IF NOT EXISTS generated_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        report_type TEXT,
        report_name TEXT,
        parameters TEXT,
        file_path TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Templates
      CREATE TABLE IF NOT EXISTS portfolio_templates (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        category TEXT,
        risk_level TEXT,
        allocations TEXT,
        is_public INTEGER DEFAULT 1,
        created_by TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      -- Education Progress
      CREATE TABLE IF NOT EXISTS education_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        course_id TEXT,
        lesson_id TEXT,
        completed INTEGER DEFAULT 0,
        score INTEGER,
        completed_at DATETIME,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Sector Rotation Tables
      CREATE TABLE IF NOT EXISTS SectorData (
        id TEXT PRIMARY KEY,
        sectorName TEXT NOT NULL,
        sectorCode TEXT NOT NULL,
        currentPrice REAL,
        change REAL,
        changePercent REAL,
        volume INTEGER,
        marketCap REAL,
        ytdReturn REAL,
        updatedAt DATETIME,
        createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS SectorPerformance (
        id TEXT PRIMARY KEY,
        sectorName TEXT NOT NULL,
        sectorCode TEXT NOT NULL,
        date TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        returnPct REAL,
        relativeStrength REAL,
        momentumScore REAL,
        createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS SectorRotation (
        id TEXT PRIMARY KEY,
        fromSector TEXT NOT NULL,
        toSector TEXT NOT NULL,
        date TEXT NOT NULL,
        flowAmount REAL,
        flowPercent REAL,
        reason TEXT,
        createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      -- Economic Calendar
      CREATE TABLE IF NOT EXISTS economic_events (
        id TEXT PRIMARY KEY,
        event_id TEXT UNIQUE,
        event_name TEXT NOT NULL,
        country TEXT NOT NULL,
        country_code TEXT,
        date DATETIME NOT NULL,
        impact TEXT,
        actual TEXT,
        estimate TEXT,
        previous TEXT,
        currency TEXT,
        unit TEXT,
        change_percent REAL,
        source TEXT,
        category TEXT,
        is_all_day INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS user_calendar_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        selected_countries TEXT,
        impact_filter TEXT,
        categories TEXT,
        email_notifications INTEGER DEFAULT 0,
        push_notifications INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_economic_events_date ON economic_events(date);
      CREATE INDEX IF NOT EXISTS idx_economic_events_country ON economic_events(country);
      CREATE INDEX IF NOT EXISTS idx_economic_events_impact ON economic_events(impact);
      CREATE INDEX IF NOT EXISTS idx_economic_events_source ON economic_events(source);

      -- Dividend Calendar
      CREATE TABLE IF NOT EXISTS dividend_calendar (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        ex_dividend_date DATE NOT NULL,
        payment_date DATE,
        record_date DATE,
        declaration_date DATE,
        dividend_amount REAL NOT NULL,
        dividend_yield REAL,
        frequency TEXT,
        currency TEXT DEFAULT 'USD',
        dividend_type TEXT DEFAULT 'regular',
        status TEXT DEFAULT 'confirmed',
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS user_dividend_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        shares REAL,
        is_tracking INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_dividend_calendar_symbol ON dividend_calendar(symbol);
      CREATE INDEX IF NOT EXISTS idx_dividend_calendar_ex_date ON dividend_calendar(ex_dividend_date);
      CREATE INDEX IF NOT EXISTS idx_dividend_calendar_payment_date ON dividend_calendar(payment_date);
      CREATE INDEX IF NOT EXISTS idx_user_dividend_tracking_user ON user_dividend_tracking(user_id);

      -- Earnings Calendar
      CREATE TABLE IF NOT EXISTS earnings_calendar (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        earnings_date DATETIME NOT NULL,
        fiscal_quarter TEXT,
        fiscal_year INTEGER,
        eps_estimate REAL,
        eps_actual REAL,
        revenue_estimate REAL,
        revenue_actual REAL,
        reported BOOLEAN DEFAULT 0,
        time_of_day TEXT,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'scheduled',
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS user_earnings_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        shares REAL,
        is_tracking INTEGER DEFAULT 1,
        alert_before_days INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_earnings_calendar_symbol ON earnings_calendar(symbol);
      CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date ON earnings_calendar(earnings_date);
      CREATE INDEX IF NOT EXISTS idx_earnings_calendar_status ON earnings_calendar(status);
      CREATE INDEX IF NOT EXISTS idx_user_earnings_tracking_user ON user_earnings_tracking(user_id);

      -- IPO Tracker
      CREATE TABLE IF NOT EXISTS ipo_calendar (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        exchange TEXT,
        ipo_date DATE,
        filing_date DATE,
        price_range_low REAL,
        price_range_high REAL,
        ipo_price REAL,
        shares_offered INTEGER,
        market_cap REAL,
        industry TEXT,
        sector TEXT,
        description TEXT,
        status TEXT DEFAULT 'filed',
        underwriters TEXT,
        lead_managers TEXT,
        country TEXT DEFAULT 'USA',
        currency TEXT DEFAULT 'USD',
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS user_ipo_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ipo_id TEXT NOT NULL,
        interest_level INTEGER DEFAULT 1,
        alert_enabled INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(ipo_id) REFERENCES ipo_calendar(id)
      );

      CREATE INDEX IF NOT EXISTS idx_ipo_calendar_symbol ON ipo_calendar(symbol);
      CREATE INDEX IF NOT EXISTS idx_ipo_calendar_ipo_date ON ipo_calendar(ipo_date);
      CREATE INDEX IF NOT EXISTS idx_ipo_calendar_status ON ipo_calendar(status);
      CREATE INDEX IF NOT EXISTS idx_ipo_calendar_sector ON ipo_calendar(sector);
      CREATE INDEX IF NOT EXISTS idx_user_ipo_tracking_user ON user_ipo_tracking(user_id);
    `);

    // Seed forum categories if empty
    const forumCount = this.db.prepare('SELECT COUNT(*) as count FROM forum_categories').get();
    if (forumCount.count === 0) {
      this.db.exec(`
        INSERT INTO forum_categories (id, name, description) VALUES
        ('cat-general', 'General Discussion', 'Discuss anything related to investing'),
        ('cat-stocks', 'Stock Analysis', 'Share your stock picks and analysis'),
        ('cat-options', 'Options Trading', 'Options strategies and discussions'),
        ('cat-crypto', 'Cryptocurrency', 'Crypto trading and news'),
        ('cat-dividends', 'Dividend Investing', 'Income investing discussions'),
        ('cat-beginners', 'Beginner Questions', 'Ask questions and learn');
      `);
    }

    // Seed portfolio templates if empty
    const templateCount = this.db.prepare('SELECT COUNT(*) as count FROM portfolio_templates').get();
    if (templateCount.count === 0) {
      this.db.exec(`
        INSERT INTO portfolio_templates (id, name, description, category, risk_level, allocations, is_public) VALUES
        ('tpl-1', 'Conservative Income', 'Focus on dividend stocks and bonds for steady income', 'Income', 'Low', '{"bonds":40,"dividend_stocks":40,"reits":10,"cash":10}', 1),
        ('tpl-2', 'Balanced Growth', 'Mix of growth and value stocks with some bonds', 'Balanced', 'Medium', '{"growth_stocks":35,"value_stocks":30,"bonds":25,"cash":10}', 1),
        ('tpl-3', 'Aggressive Growth', 'High growth tech stocks with small cap exposure', 'Growth', 'High', '{"tech_stocks":50,"small_cap":30,"emerging_markets":15,"cash":5}', 1),
        ('tpl-4', 'Dividend Aristocrats', 'Focus on companies with 25+ years of dividend growth', 'Income', 'Low', '{"dividend_aristocrats":70,"dividend_kings":20,"cash":10}', 1),
        ('tpl-5', 'Index Fund Portfolio', 'Simple 3-fund portfolio approach', 'Passive', 'Medium', '{"total_market":60,"international":30,"bonds":10}', 1),
        ('tpl-6', 'FAANG Heavy', 'Tech giants dominated portfolio', 'Growth', 'High', '{"faang":60,"tech_etf":25,"cash":15}', 1);
      `);
    }
  }

  // ... (existing methods) ...

  updatePortfolio(id, updates) {
    const allowedFields = ['name', 'description', 'client_name', 'notes', 'portfolio_type'];
    const fields = [];
    const params = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    if (fields.length === 0) return this.getPortfolioById(id);

    const sql = `UPDATE portfolios SET ${fields.join(', ')} WHERE id = ? `;
    params.push(id);

    this.run(sql, params);
    return this.getPortfolioById(id);
  }

  deletePortfolio(id) {
    this.run('DELETE FROM portfolios WHERE id = ?', [id]);
  }



  // Generic methods
  run(sql, params = []) {
    return this.db.prepare(sql).run(params);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(params);
  }

  all(sql, params = []) {
    return this.db.prepare(sql).all(params);
  }

  // User methods
  getUserByEmail(email) {
    return this.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  getUserById(id) {
    return this.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  createUser(email, password, firstName, lastName) {
    const id = uuidv4();
    // Assuming password is already hashed if strictly following server.js 
    // BUT server.js passes 'password' to createUser (line 96).
    // server.js calls: const user = await Database.createUser(email, password, firstName, lastName);
    // THEN line 135: bcrypt.compare(password, user.password_hash)
    // So this function MUST hash the password.

    const bcrypt = require('bcryptjs');
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const stmt = this.db.prepare(`
      INSERT INTO users(id, email, password_hash, first_name, last_name)
VALUES(?, ?, ?, ?, ?)
  `);

    stmt.run(id, email, hash, firstName, lastName);
    return this.getUserById(id);
  }

  // Session methods
  createSession(userId, token, expiresAt, userAgent, ipAddress) {
    const id = uuidv4();
    this.run(`
      INSERT INTO sessions(id, user_id, token, expires_at, user_agent, ip_address)
VALUES(?, ?, ?, ?, ?, ?)
  `, [id, userId, token, expiresAt, userAgent, ipAddress]);

    return { id, user_id: userId, token, expires_at: expiresAt };
  }

  getSessionByToken(token) {
    // Join with users to get user details as required by server.js
    return this.get(`
      SELECT s.*, u.email, u.first_name, u.last_name, u.plan 
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
  `, [token]);
  }

  deleteSession(sessionIdOrToken) {
    // server.js passes session.id (line 166)
    // But implementation might be flexible
    this.run('DELETE FROM sessions WHERE id = ? OR token = ?', [sessionIdOrToken, sessionIdOrToken]);
  }

  // Portfolio methods
  createPortfolio(userId, name, description, currency = 'USD', benchmark = 'SPY', cashBalance = 0, isDefault = false) {
    const id = uuidv4();
    this.run(`
      INSERT INTO portfolios(id, user_id, name, description, currency, benchmark, cash_balance, is_default)
VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, userId, name, description, currency, benchmark, cashBalance, isDefault ? 1 : 0]);

    return this.getPortfolioById(id);
  }

  getPortfolioById(id) {
    return this.get('SELECT * FROM portfolios WHERE id = ?', [id]);
  }

  getPortfoliosByUser(userId) {
    return this.all('SELECT * FROM portfolios WHERE user_id = ?', [userId]);
  }

  getPortfoliosByUserId(userId) {
    return this.getPortfoliosByUser(userId);
  }

  deletePortfolio(id) {
    this.run('DELETE FROM portfolios WHERE id = ?', [id]);
  }

  // Holding methods
  getHoldingsByPortfolio(portfolioId) {
    return this.all('SELECT * FROM holdings WHERE portfolio_id = ?', [portfolioId]);
  }

  getHoldingBySymbol(portfolioId, symbol) {
    return this.get('SELECT * FROM holdings WHERE portfolio_id = ? AND symbol = ?', [portfolioId, symbol]);
  }

  createHolding(portfolioId, symbol, name, shares, avgCostBasis, sector, assetType) {
    const id = uuidv4();
    this.run(`
      INSERT INTO holdings(id, portfolio_id, symbol, name, shares, avg_cost_basis, sector, asset_type)
VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, portfolioId, symbol, name, shares, avgCostBasis, sector, assetType]);

    return this.get('SELECT * FROM holdings WHERE id = ?', [id]);
  }

  updateHolding(id, shares, avgCostBasis, name = null, sector = null, assetType = null) {
    let sql = 'UPDATE holdings SET shares = ?, avg_cost_basis = ?';
    const params = [shares, avgCostBasis];

    if (name) {
      sql += ', name = ?';
      params.push(name);
    }
    if (sector) {
      sql += ', sector = ?';
      params.push(sector);
    }
    if (assetType) {
      sql += ', asset_type = ?';
      params.push(assetType);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    this.run(sql, params);
    return this.get('SELECT * FROM holdings WHERE id = ?', [id]);
  }



  // Watchlist methods
  getWatchlistsByUserId(userId) {
    const watchlists = this.all('SELECT * FROM watchlists WHERE user_id = ? ORDER BY name ASC', [userId]);

    for (const list of watchlists) {
      list.items = this.all('SELECT * FROM watchlist_items WHERE watchlist_id = ?', [list.id]);
    }

    return watchlists;
  }

  getWatchlistByUser(userId) {
    // Get all watchlist items for a user (flat list)
    const watchlists = this.all('SELECT * FROM watchlists WHERE user_id = ?', [userId]);
    if (watchlists.length === 0) return [];

    const watchlistIds = watchlists.map(wl => wl.id);
    const placeholders = watchlistIds.map(() => '?').join(',');
    return this.all(`SELECT * FROM watchlist_items WHERE watchlist_id IN (${placeholders})`, watchlistIds);
  }

  createWatchlist(userId, name, description) {
    const id = uuidv4();
    this.run(`
      INSERT INTO watchlists(id, user_id, name, description)
VALUES(?, ?, ?, ?)
  `, [id, userId, name, description]);
    return { id, user_id: userId, name, description, items: [] };
  }

  deleteWatchlist(id) {
    this.run('DELETE FROM watchlists WHERE id = ?', [id]);
  }

  createWatchlistItem(watchlistId, symbol, targetPrice = null, notes = null) {
    const id = uuidv4();
    this.run(`
            INSERT INTO watchlist_items(id, watchlist_id, symbol, target_price, notes)
VALUES(?, ?, ?, ?, ?)
  `, [id, watchlistId, symbol, targetPrice, notes]);
    return { id, watchlist_id: watchlistId, symbol, target_price: targetPrice, notes };
  }

  deleteWatchlistItem(watchlistId, symbol) {
    this.run('DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [watchlistId, symbol]);
  }

  deleteWatchlistItemById(id) {
    this.run('DELETE FROM watchlist_items WHERE id = ?', [id]);
  }

  // Transaction methods
  getTransactionsByUser(userId, limit = 50) {
    return this.all(`
            SELECT t.*
  FROM transactions t
            WHERE t.user_id = ?
  ORDER BY t.executed_at DESC
LIMIT ?
  `, [userId, limit]);
  }

  getTransactionsByPortfolio(portfolioId) {
    return this.all(`
      SELECT t.*, t.executed_at as date
      FROM transactions t
      WHERE t.portfolio_id = ?
      ORDER BY t.executed_at DESC
    `, [portfolioId]);
  }

  createTransaction(userId, portfolioId, symbol, type, shares, price, amount, fees = 0) {
    const id = uuidv4();
    this.run(`
      INSERT INTO transactions (id, user_id, portfolio_id, symbol, type, shares, price, amount, fees)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, portfolioId, symbol, type, shares, price, amount, fees]);
    return this.get('SELECT * FROM transactions WHERE id = ?', [id]);
  }

  // ==================== ALERTS ====================
  getAlertsByUser(userId) {
    return this.all('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  getActiveAlerts(userId) {
    return this.all('SELECT * FROM alerts WHERE user_id = ? AND is_active = 1', [userId]);
  }

  createAlert(userId, symbol, alertType, condition, targetValue, message) {
    const id = uuidv4();
    this.run(`
      INSERT INTO alerts (id, user_id, symbol, alert_type, condition, target_value, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, symbol, alertType, condition, targetValue, message]);
    return this.get('SELECT * FROM alerts WHERE id = ?', [id]);
  }

  updateAlert(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE alerts SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM alerts WHERE id = ?', [id]);
  }

  deleteAlert(id) {
    this.run('DELETE FROM alerts WHERE id = ?', [id]);
  }

  triggerAlert(alertId, triggerPrice) {
    const alert = this.get('SELECT * FROM alerts WHERE id = ?', [alertId]);
    if (alert) {
      const historyId = uuidv4();
      this.run(`
        INSERT INTO alert_history (id, alert_id, user_id, symbol, message, trigger_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [historyId, alertId, alert.user_id, alert.symbol, alert.message, triggerPrice]);
      this.run('UPDATE alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?', [alertId]);
    }
    return alert;
  }

  getAlertHistory(userId, limit = 50) {
    return this.all('SELECT * FROM alert_history WHERE user_id = ? ORDER BY triggered_at DESC LIMIT ?', [userId, limit]);
  }

  // ==================== GOALS ====================
  getGoalsByUser(userId) {
    return this.all('SELECT * FROM goals WHERE user_id = ? ORDER BY target_date ASC', [userId]);
  }

  createGoal(userId, name, targetAmount, targetDate, category, priority = 'medium', notes = null) {
    const id = uuidv4();
    this.run(`
      INSERT INTO goals (id, user_id, name, target_amount, target_date, category, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, name, targetAmount, targetDate, category, priority, notes]);
    return this.get('SELECT * FROM goals WHERE id = ?', [id]);
  }

  updateGoal(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM goals WHERE id = ?', [id]);
  }

  deleteGoal(id) {
    this.run('DELETE FROM goals WHERE id = ?', [id]);
  }

  // ==================== JOURNAL ====================
  getJournalEntries(userId, limit = 50) {
    return this.all('SELECT * FROM journal_entries WHERE user_id = ? ORDER BY entry_date DESC LIMIT ?', [userId, limit]);
  }

  createJournalEntry(userId, data) {
    const id = uuidv4();
    this.run(`
      INSERT INTO journal_entries (id, user_id, symbol, entry_type, entry_price, exit_price, shares, profit_loss, strategy, setup, emotions, lessons, rating, entry_date, exit_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, data.symbol, data.entry_type, data.entry_price, data.exit_price, data.shares, data.profit_loss, data.strategy, data.setup, data.emotions, data.lessons, data.rating, data.entry_date, data.exit_date]);
    return this.get('SELECT * FROM journal_entries WHERE id = ?', [id]);
  }

  updateJournalEntry(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE journal_entries SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM journal_entries WHERE id = ?', [id]);
  }

  deleteJournalEntry(id) {
    this.run('DELETE FROM journal_entries WHERE id = ?', [id]);
  }

  getJournalStats(userId) {
    const entries = this.all('SELECT * FROM journal_entries WHERE user_id = ?', [userId]);
    const wins = entries.filter(e => e.profit_loss > 0).length;
    const losses = entries.filter(e => e.profit_loss < 0).length;
    const totalPL = entries.reduce((sum, e) => sum + (e.profit_loss || 0), 0);
    return {
      totalTrades: entries.length,
      wins,
      losses,
      winRate: entries.length > 0 ? (wins / entries.length * 100).toFixed(1) : 0,
      totalProfitLoss: totalPL,
      avgProfitLoss: entries.length > 0 ? totalPL / entries.length : 0
    };
  }

  // ==================== TAX ====================
  getTaxDocuments(userId, year = null) {
    if (year) {
      return this.all('SELECT * FROM tax_documents WHERE user_id = ? AND year = ? ORDER BY created_at DESC', [userId, year]);
    }
    return this.all('SELECT * FROM tax_documents WHERE user_id = ? ORDER BY year DESC, created_at DESC', [userId]);
  }

  createTaxDocument(userId, year, documentType, fileName, filePath) {
    const id = uuidv4();
    this.run(`
      INSERT INTO tax_documents (id, user_id, year, document_type, file_name, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, year, documentType, fileName, filePath]);
    return this.get('SELECT * FROM tax_documents WHERE id = ?', [id]);
  }

  getTaxLots(userId, portfolioId = null) {
    if (portfolioId) {
      return this.all('SELECT * FROM tax_lots WHERE user_id = ? AND portfolio_id = ? ORDER BY purchase_date ASC', [userId, portfolioId]);
    }
    return this.all('SELECT * FROM tax_lots WHERE user_id = ? ORDER BY purchase_date ASC', [userId]);
  }

  // ==================== REAL ESTATE ====================
  getRealEstateByUser(userId) {
    return this.all('SELECT * FROM real_estate WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  createRealEstate(userId, data) {
    const id = uuidv4();
    this.run(`
      INSERT INTO real_estate (id, user_id, property_name, address, property_type, purchase_price, current_value, purchase_date, mortgage_balance, monthly_rent, expenses, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, data.property_name, data.address, data.property_type, data.purchase_price, data.current_value, data.purchase_date, data.mortgage_balance, data.monthly_rent, data.expenses, data.notes]);
    return this.get('SELECT * FROM real_estate WHERE id = ?', [id]);
  }

  updateRealEstate(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE real_estate SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM real_estate WHERE id = ?', [id]);
  }

  deleteRealEstate(id) {
    this.run('DELETE FROM real_estate WHERE id = ?', [id]);
  }

  // ==================== BONDS ====================
  getBondsByUser(userId) {
    return this.all('SELECT * FROM bonds WHERE user_id = ? ORDER BY maturity_date ASC', [userId]);
  }

  createBond(userId, portfolioId, data) {
    const id = uuidv4();
    this.run(`
      INSERT INTO bonds (id, user_id, portfolio_id, name, cusip, face_value, purchase_price, coupon_rate, maturity_date, payment_frequency, bond_type, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, portfolioId, data.name, data.cusip, data.face_value, data.purchase_price, data.coupon_rate, data.maturity_date, data.payment_frequency, data.bond_type, data.rating]);
    return this.get('SELECT * FROM bonds WHERE id = ?', [id]);
  }

  updateBond(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE bonds SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM bonds WHERE id = ?', [id]);
  }

  deleteBond(id) {
    this.run('DELETE FROM bonds WHERE id = ?', [id]);
  }

  // ==================== DRIP ====================
  getDripSettings(userId, portfolioId = null) {
    if (portfolioId) {
      return this.all('SELECT * FROM drip_settings WHERE user_id = ? AND portfolio_id = ?', [userId, portfolioId]);
    }
    return this.all('SELECT * FROM drip_settings WHERE user_id = ?', [userId]);
  }

  setDripSetting(userId, portfolioId, symbol, isEnabled, reinvestPercent = 100) {
    const existing = this.get('SELECT * FROM drip_settings WHERE user_id = ? AND portfolio_id = ? AND symbol = ?', [userId, portfolioId, symbol]);
    if (existing) {
      this.run('UPDATE drip_settings SET is_enabled = ?, reinvest_percent = ? WHERE id = ?', [isEnabled ? 1 : 0, reinvestPercent, existing.id]);
      return this.get('SELECT * FROM drip_settings WHERE id = ?', [existing.id]);
    }
    const id = uuidv4();
    this.run(`
      INSERT INTO drip_settings (id, user_id, portfolio_id, symbol, is_enabled, reinvest_percent)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, portfolioId, symbol, isEnabled ? 1 : 0, reinvestPercent]);
    return this.get('SELECT * FROM drip_settings WHERE id = ?', [id]);
  }

  // ==================== PAPER TRADING ====================
  getPaperPortfolio(userId) {
    let portfolio = this.get('SELECT * FROM paper_portfolio WHERE user_id = ?', [userId]);
    if (!portfolio) {
      const id = uuidv4();
      this.run('INSERT INTO paper_portfolio (id, user_id) VALUES (?, ?)', [id, userId]);
      portfolio = this.get('SELECT * FROM paper_portfolio WHERE id = ?', [id]);
    }
    return portfolio;
  }

  getPaperTrades(userId, status = null) {
    if (status) {
      return this.all('SELECT * FROM paper_trades WHERE user_id = ? AND status = ? ORDER BY entry_date DESC', [userId, status]);
    }
    return this.all('SELECT * FROM paper_trades WHERE user_id = ? ORDER BY entry_date DESC', [userId]);
  }

  createPaperTrade(userId, symbol, tradeType, quantity, entryPrice, notes = null) {
    const id = uuidv4();
    this.run(`
      INSERT INTO paper_trades (id, user_id, symbol, trade_type, quantity, entry_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, symbol, tradeType, quantity, entryPrice, notes]);
    return this.get('SELECT * FROM paper_trades WHERE id = ?', [id]);
  }

  closePaperTrade(id, exitPrice) {
    const trade = this.get('SELECT * FROM paper_trades WHERE id = ?', [id]);
    if (trade) {
      const profitLoss = trade.trade_type === 'buy'
        ? (exitPrice - trade.entry_price) * trade.quantity
        : (trade.entry_price - exitPrice) * trade.quantity;
      this.run(`
        UPDATE paper_trades SET exit_price = ?, profit_loss = ?, status = 'closed', exit_date = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [exitPrice, profitLoss, id]);
    }
    return this.get('SELECT * FROM paper_trades WHERE id = ?', [id]);
  }

  updatePaperPortfolioBalance(userId, amount) {
    this.run('UPDATE paper_portfolio SET cash_balance = cash_balance + ? WHERE user_id = ?', [amount, userId]);
    return this.getPaperPortfolio(userId);
  }

  // ==================== CRYPTO ====================
  getCryptoHoldings(userId) {
    return this.all('SELECT * FROM crypto_holdings WHERE user_id = ? ORDER BY symbol ASC', [userId]);
  }

  createCryptoHolding(userId, symbol, name, quantity, avgCost, exchange = null, walletAddress = null) {
    const id = uuidv4();
    this.run(`
      INSERT INTO crypto_holdings (id, user_id, symbol, name, quantity, avg_cost, exchange, wallet_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, symbol, name, quantity, avgCost, exchange, walletAddress]);
    return this.get('SELECT * FROM crypto_holdings WHERE id = ?', [id]);
  }

  updateCryptoHolding(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE crypto_holdings SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM crypto_holdings WHERE id = ?', [id]);
  }

  deleteCryptoHolding(id) {
    this.run('DELETE FROM crypto_holdings WHERE id = ?', [id]);
  }

  // ==================== BROKER ====================
  getBrokerConnections(userId) {
    return this.all('SELECT id, user_id, broker_name, account_id, is_active, last_sync, created_at FROM broker_connections WHERE user_id = ?', [userId]);
  }

  createBrokerConnection(userId, brokerName, accountId, accessToken, refreshToken) {
    const id = uuidv4();
    this.run(`
      INSERT INTO broker_connections (id, user_id, broker_name, account_id, access_token, refresh_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, brokerName, accountId, accessToken, refreshToken]);
    return this.get('SELECT id, user_id, broker_name, account_id, is_active, last_sync, created_at FROM broker_connections WHERE id = ?', [id]);
  }

  deleteBrokerConnection(id) {
    this.run('DELETE FROM broker_connections WHERE id = ?', [id]);
  }

  // ==================== API KEYS ====================
  getUserApiKeys(userId) {
    return this.all('SELECT id, user_id, api_key, name, permissions, is_active, last_used, created_at FROM user_api_keys WHERE user_id = ?', [userId]);
  }

  createUserApiKey(userId, name, permissions) {
    const id = uuidv4();
    const apiKey = 'wp_' + uuidv4().replace(/-/g, '');
    const apiSecret = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    this.run(`
      INSERT INTO user_api_keys (id, user_id, api_key, api_secret, name, permissions)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, apiKey, apiSecret, name, JSON.stringify(permissions)]);
    return { id, api_key: apiKey, api_secret: apiSecret, name, permissions };
  }

  deleteUserApiKey(id) {
    this.run('DELETE FROM user_api_keys WHERE id = ?', [id]);
  }

  // ==================== AI CHAT ====================
  getAiChatHistory(userId, sessionId = null, limit = 50) {
    if (sessionId) {
      return this.all('SELECT * FROM ai_chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT ?', [userId, sessionId, limit]);
    }
    return this.all('SELECT * FROM ai_chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  addAiChatMessage(userId, sessionId, role, content) {
    const id = uuidv4();
    this.run(`
      INSERT INTO ai_chat_history (id, user_id, session_id, role, content)
      VALUES (?, ?, ?, ?, ?)
    `, [id, userId, sessionId, role, content]);
    return this.get('SELECT * FROM ai_chat_history WHERE id = ?', [id]);
  }

  // ==================== COPY TRADING ====================
  getCopyTraders(userId) {
    return this.all('SELECT * FROM copy_traders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  addCopyTrader(userId, traderId, traderName, allocationPercent) {
    const id = uuidv4();
    this.run(`
      INSERT INTO copy_traders (id, user_id, trader_id, trader_name, allocation_percent)
      VALUES (?, ?, ?, ?, ?)
    `, [id, userId, traderId, traderName, allocationPercent]);
    return this.get('SELECT * FROM copy_traders WHERE id = ?', [id]);
  }

  updateCopyTrader(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE copy_traders SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM copy_traders WHERE id = ?', [id]);
  }

  deleteCopyTrader(id) {
    this.run('DELETE FROM copy_traders WHERE id = ?', [id]);
  }

  // ==================== SOCIAL ====================
  getSocialFeed(limit = 50, offset = 0) {
    return this.all(`
      SELECT sp.*, u.first_name, u.last_name, u.email
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      ORDER BY sp.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  getUserPosts(userId, limit = 20) {
    return this.all('SELECT * FROM social_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  createSocialPost(userId, content, tradeSymbol = null, tradeType = null) {
    const id = uuidv4();
    this.run(`
      INSERT INTO social_posts (id, user_id, content, trade_symbol, trade_type)
      VALUES (?, ?, ?, ?, ?)
    `, [id, userId, content, tradeSymbol, tradeType]);
    return this.get('SELECT * FROM social_posts WHERE id = ?', [id]);
  }

  deleteSocialPost(id) {
    this.run('DELETE FROM social_comments WHERE post_id = ?', [id]);
    this.run('DELETE FROM social_posts WHERE id = ?', [id]);
  }

  getPostComments(postId) {
    return this.all(`
      SELECT sc.*, u.first_name, u.last_name
      FROM social_comments sc
      JOIN users u ON sc.user_id = u.id
      WHERE sc.post_id = ?
      ORDER BY sc.created_at ASC
    `, [postId]);
  }

  addComment(postId, userId, content) {
    const id = uuidv4();
    this.run('INSERT INTO social_comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)', [id, postId, userId, content]);
    this.run('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);
    return this.get('SELECT * FROM social_comments WHERE id = ?', [id]);
  }

  likePost(postId) {
    this.run('UPDATE social_posts SET likes = likes + 1 WHERE id = ?', [postId]);
    return this.get('SELECT * FROM social_posts WHERE id = ?', [postId]);
  }

  followUser(followerId, followingId) {
    const existing = this.get('SELECT * FROM social_follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
    if (!existing) {
      const id = uuidv4();
      this.run('INSERT INTO social_follows (id, follower_id, following_id) VALUES (?, ?, ?)', [id, followerId, followingId]);
    }
  }

  unfollowUser(followerId, followingId) {
    this.run('DELETE FROM social_follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
  }

  getFollowers(userId) {
    return this.all(`
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM social_follows sf
      JOIN users u ON sf.follower_id = u.id
      WHERE sf.following_id = ?
    `, [userId]);
  }

  getFollowing(userId) {
    return this.all(`
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM social_follows sf
      JOIN users u ON sf.following_id = u.id
      WHERE sf.follower_id = ?
    `, [userId]);
  }

  // ==================== LEADERBOARD ====================
  getLeaderboard(limit = 100) {
    return this.all('SELECT * FROM leaderboard ORDER BY total_return DESC LIMIT ?', [limit]);
  }

  updateLeaderboardEntry(userId, displayName, stats) {
    const existing = this.get('SELECT * FROM leaderboard WHERE user_id = ?', [userId]);
    if (existing) {
      this.run(`
        UPDATE leaderboard SET display_name = ?, total_return = ?, monthly_return = ?, win_rate = ?, total_trades = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [displayName, stats.totalReturn, stats.monthlyReturn, stats.winRate, stats.totalTrades, userId]);
    } else {
      const id = uuidv4();
      this.run(`
        INSERT INTO leaderboard (id, user_id, display_name, total_return, monthly_return, win_rate, total_trades)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, userId, displayName, stats.totalReturn, stats.monthlyReturn, stats.winRate, stats.totalTrades]);
    }
    // Update ranks
    const all = this.all('SELECT id FROM leaderboard ORDER BY total_return DESC');
    all.forEach((entry, index) => {
      this.run('UPDATE leaderboard SET rank = ? WHERE id = ?', [index + 1, entry.id]);
    });
    return this.get('SELECT * FROM leaderboard WHERE user_id = ?', [userId]);
  }

  // ==================== FORUM ====================
  getForumCategories() {
    return this.all('SELECT * FROM forum_categories ORDER BY name ASC');
  }

  getForumPosts(categoryId = null, limit = 50) {
    if (categoryId) {
      return this.all(`
        SELECT fp.*, u.first_name, u.last_name, fc.name as category_name
        FROM forum_posts fp
        JOIN users u ON fp.user_id = u.id
        JOIN forum_categories fc ON fp.category_id = fc.id
        WHERE fp.category_id = ?
        ORDER BY fp.is_pinned DESC, fp.created_at DESC
        LIMIT ?
      `, [categoryId, limit]);
    }
    return this.all(`
      SELECT fp.*, u.first_name, u.last_name, fc.name as category_name
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      JOIN forum_categories fc ON fp.category_id = fc.id
      ORDER BY fp.is_pinned DESC, fp.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  getForumPost(postId) {
    this.run('UPDATE forum_posts SET views = views + 1 WHERE id = ?', [postId]);
    return this.get(`
      SELECT fp.*, u.first_name, u.last_name, fc.name as category_name
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      JOIN forum_categories fc ON fp.category_id = fc.id
      WHERE fp.id = ?
    `, [postId]);
  }

  createForumPost(categoryId, userId, title, content) {
    const id = uuidv4();
    this.run(`
      INSERT INTO forum_posts (id, category_id, user_id, title, content)
      VALUES (?, ?, ?, ?, ?)
    `, [id, categoryId, userId, title, content]);
    this.run('UPDATE forum_categories SET post_count = post_count + 1 WHERE id = ?', [categoryId]);
    return this.get('SELECT * FROM forum_posts WHERE id = ?', [id]);
  }

  getForumReplies(postId) {
    return this.all(`
      SELECT fr.*, u.first_name, u.last_name
      FROM forum_replies fr
      JOIN users u ON fr.user_id = u.id
      WHERE fr.post_id = ?
      ORDER BY fr.created_at ASC
    `, [postId]);
  }

  addForumReply(postId, userId, content) {
    const id = uuidv4();
    this.run('INSERT INTO forum_replies (id, post_id, user_id, content) VALUES (?, ?, ?, ?)', [id, postId, userId, content]);
    this.run('UPDATE forum_posts SET replies = replies + 1 WHERE id = ?', [postId]);
    return this.get('SELECT * FROM forum_replies WHERE id = ?', [id]);
  }

  // ==================== CALENDAR ====================
  getCalendarEvents(userId, startDate = null, endDate = null) {
    if (startDate && endDate) {
      return this.all('SELECT * FROM calendar_events WHERE user_id = ? AND event_date BETWEEN ? AND ? ORDER BY event_date ASC', [userId, startDate, endDate]);
    }
    return this.all('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY event_date ASC', [userId]);
  }

  createCalendarEvent(userId, title, description, eventType, eventDate, symbol = null, reminder = 0) {
    const id = uuidv4();
    this.run(`
      INSERT INTO calendar_events (id, user_id, title, description, event_type, event_date, symbol, reminder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, title, description, eventType, eventDate, symbol, reminder]);
    return this.get('SELECT * FROM calendar_events WHERE id = ?', [id]);
  }

  updateCalendarEvent(id, updates) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(id);
    this.run(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.get('SELECT * FROM calendar_events WHERE id = ?', [id]);
  }

  deleteCalendarEvent(id) {
    this.run('DELETE FROM calendar_events WHERE id = ?', [id]);
  }

  // ==================== SHARED PORTFOLIOS ====================
  sharePortfolio(portfolioId, userId, isPublic = false) {
    const existing = this.get('SELECT * FROM shared_portfolios WHERE portfolio_id = ?', [portfolioId]);
    if (existing) return existing;

    const id = uuidv4();
    const shareCode = uuidv4().substring(0, 8);
    this.run(`
      INSERT INTO shared_portfolios (id, portfolio_id, user_id, share_code, is_public)
      VALUES (?, ?, ?, ?, ?)
    `, [id, portfolioId, userId, shareCode, isPublic ? 1 : 0]);
    return this.get('SELECT * FROM shared_portfolios WHERE id = ?', [id]);
  }

  getSharedPortfolio(shareCode) {
    const shared = this.get('SELECT * FROM shared_portfolios WHERE share_code = ?', [shareCode]);
    if (shared) {
      this.run('UPDATE shared_portfolios SET views = views + 1 WHERE id = ?', [shared.id]);
      return this.getPortfolioById(shared.portfolio_id);
    }
    return null;
  }

  unsharePortfolio(portfolioId) {
    this.run('DELETE FROM shared_portfolios WHERE portfolio_id = ?', [portfolioId]);
  }

  // ==================== USER SETTINGS ====================
  getUserSettings(userId) {
    let settings = this.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    if (!settings) {
      const id = uuidv4();
      this.run('INSERT INTO user_settings (id, user_id) VALUES (?, ?)', [id, userId]);
      settings = this.get('SELECT * FROM user_settings WHERE id = ?', [id]);
    }
    return settings;
  }

  updateUserSettings(userId, updates) {
    this.getUserSettings(userId); // Ensure exists
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    params.push(userId);
    this.run(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`, params);
    return this.getUserSettings(userId);
  }

  updateUser(userId, updates) {
    const allowedFields = ['first_name', 'last_name', 'theme', 'currency', 'timezone', 'plan'];
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    if (fields.length === 0) return this.getUserById(userId);
    params.push(userId);
    this.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getUserById(userId);
  }

  // ==================== REPORTS ====================
  getGeneratedReports(userId, limit = 20) {
    return this.all('SELECT * FROM generated_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  createGeneratedReport(userId, reportType, reportName, parameters, filePath) {
    const id = uuidv4();
    this.run(`
      INSERT INTO generated_reports (id, user_id, report_type, report_name, parameters, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, userId, reportType, reportName, JSON.stringify(parameters), filePath]);
    return this.get('SELECT * FROM generated_reports WHERE id = ?', [id]);
  }

  // ==================== TEMPLATES ====================
  getPortfolioTemplates() {
    return this.all('SELECT * FROM portfolio_templates WHERE is_public = 1 ORDER BY usage_count DESC');
  }

  getTemplateById(id) {
    return this.get('SELECT * FROM portfolio_templates WHERE id = ?', [id]);
  }

  useTemplate(templateId) {
    this.run('UPDATE portfolio_templates SET usage_count = usage_count + 1 WHERE id = ?', [templateId]);
    return this.getTemplateById(templateId);
  }

  // ==================== EDUCATION ====================
  getEducationProgress(userId) {
    return this.all('SELECT * FROM education_progress WHERE user_id = ?', [userId]);
  }

  updateEducationProgress(userId, courseId, lessonId, completed, score = null) {
    const existing = this.get('SELECT * FROM education_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ?', [userId, courseId, lessonId]);
    if (existing) {
      this.run(`
        UPDATE education_progress SET completed = ?, score = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `, [completed, score, completed, existing.id]);
      return this.get('SELECT * FROM education_progress WHERE id = ?', [existing.id]);
    }
    const id = uuidv4();
    this.run(`
      INSERT INTO education_progress (id, user_id, course_id, lesson_id, completed, score, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
    `, [id, userId, courseId, lessonId, completed, score, completed]);
    return this.get('SELECT * FROM education_progress WHERE id = ?', [id]);
  }

  deleteHolding(id) {
    this.run('DELETE FROM holdings WHERE id = ?', [id]);
  }

  getAllHoldingsByUser(userId) {
    return this.all(`
      SELECT h.*, p.name as portfolio_name
      FROM holdings h
      JOIN portfolios p ON h.portfolio_id = p.id
      WHERE p.user_id = ?
      ORDER BY h.symbol ASC
    `, [userId]);
  }
}

module.exports = new DatabaseAdapter();
