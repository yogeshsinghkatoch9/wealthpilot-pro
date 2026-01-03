-- Migration 008: Portfolio Upload System
-- Adds tables for portfolio uploads and historical snapshots

-- Create uploaded_portfolios table
CREATE TABLE IF NOT EXISTS uploaded_portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT,
  original_filename TEXT NOT NULL,
  file_format TEXT NOT NULL CHECK(file_format IN ('csv', 'xlsx', 'json')),
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed')),
  total_holdings INTEGER DEFAULT 0,
  total_value REAL DEFAULT 0,
  error_message TEXT,
  metadata TEXT, -- JSON blob with extra info
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL
);

-- Create portfolio_snapshots_history table for time-series analysis
CREATE TABLE IF NOT EXISTS portfolio_snapshots_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  total_value REAL NOT NULL,
  total_cost REAL NOT NULL,
  total_gain REAL,
  total_gain_pct REAL,
  holdings_count INTEGER DEFAULT 0,
  holdings_snapshot TEXT, -- JSON blob of all holdings at this point in time
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
  UNIQUE(portfolio_id, snapshot_date)
);

-- Create generated_reports table for PDF reports
CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  report_type TEXT DEFAULT 'comprehensive',
  file_path TEXT,
  file_size INTEGER,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  download_count INTEGER DEFAULT 0,
  last_downloaded_at DATETIME,
  analytics_snapshot TEXT,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_user
  ON uploaded_portfolios(user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_status
  ON uploaded_portfolios(status);

CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_date
  ON uploaded_portfolios(upload_date DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio
  ON portfolio_snapshots_history(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_snapshots_date
  ON portfolio_snapshots_history(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_generated_reports_portfolio
  ON generated_reports(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_generated_reports_user
  ON generated_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_generated_reports_date
  ON generated_reports(generated_at DESC);
