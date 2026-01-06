-- Migration: 016_tax_harvesting_enhancements
-- Tax-Loss Harvesting Feature Enhancement Tables
-- Created: 2024-12-30

-- User Tax Preferences
-- Stores user-specific tax settings for accurate calculations
CREATE TABLE IF NOT EXISTS user_tax_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  federal_tax_bracket REAL DEFAULT 32,
  state TEXT,
  state_tax_rate REAL DEFAULT 0,
  default_lot_method TEXT DEFAULT 'tax_efficient',
  min_harvest_threshold REAL DEFAULT 100,
  auto_harvest_enabled INTEGER DEFAULT 0,
  short_term_rate REAL DEFAULT 37,
  long_term_rate REAL DEFAULT 20,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Wash Sale Tracking
-- Tracks sold securities to prevent wash sale violations (30-day rule)
CREATE TABLE IF NOT EXISTS wash_sale_tracking (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  shares_sold REAL NOT NULL,
  sale_price REAL NOT NULL,
  cost_basis REAL NOT NULL,
  realized_loss REAL NOT NULL,
  wash_sale_window_start TEXT NOT NULL,
  wash_sale_window_end TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  disallowed_loss REAL DEFAULT 0,
  replacement_symbol TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

-- Tax Loss Carryforward
-- Tracks unused losses that can be carried forward to future tax years
CREATE TABLE IF NOT EXISTS tax_loss_carryforward (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tax_year INTEGER NOT NULL,
  short_term_loss REAL DEFAULT 0,
  long_term_loss REAL DEFAULT 0,
  used_against_gains REAL DEFAULT 0,
  used_against_income REAL DEFAULT 0,
  remaining_balance REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, tax_year)
);

-- Tax Harvest History
-- Records all tax-loss harvesting transactions executed
CREATE TABLE IF NOT EXISTS tax_harvest_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  shares_sold REAL NOT NULL,
  sale_price REAL NOT NULL,
  cost_basis REAL NOT NULL,
  realized_loss REAL NOT NULL,
  tax_savings REAL NOT NULL,
  holding_period TEXT NOT NULL,
  lot_method TEXT,
  replacement_symbol TEXT,
  replacement_shares REAL,
  replacement_price REAL,
  wash_sale_safe INTEGER DEFAULT 1,
  executed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

-- ETF Sector Mappings
-- Maps sectors to their corresponding ETF alternatives
CREATE TABLE IF NOT EXISTS etf_sector_mappings (
  id TEXT PRIMARY KEY,
  sector TEXT UNIQUE NOT NULL,
  primary_etf TEXT NOT NULL,
  alternative_etfs TEXT NOT NULL,
  correlation_score REAL DEFAULT 0.85,
  expense_ratio REAL,
  avg_volume INTEGER,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Stock ETF Alternatives
-- Maps individual stocks to wash-sale-safe ETF alternatives
CREATE TABLE IF NOT EXISTS stock_etf_alternatives (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  sector TEXT,
  primary_etf TEXT NOT NULL,
  sector_etf TEXT,
  thematic_etfs TEXT,
  correlation_score REAL DEFAULT 0.75,
  notes TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_tax_preferences_user ON user_tax_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_wash_sale_tracking_user ON wash_sale_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_wash_sale_tracking_symbol ON wash_sale_tracking(symbol);
CREATE INDEX IF NOT EXISTS idx_wash_sale_tracking_window ON wash_sale_tracking(wash_sale_window_end);
CREATE INDEX IF NOT EXISTS idx_wash_sale_tracking_status ON wash_sale_tracking(status);
CREATE INDEX IF NOT EXISTS idx_tax_loss_carryforward_user ON tax_loss_carryforward(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_loss_carryforward_year ON tax_loss_carryforward(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_harvest_history_user ON tax_harvest_history(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_harvest_history_portfolio ON tax_harvest_history(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_tax_harvest_history_symbol ON tax_harvest_history(symbol);
CREATE INDEX IF NOT EXISTS idx_tax_harvest_history_date ON tax_harvest_history(executed_at);
CREATE INDEX IF NOT EXISTS idx_etf_sector_mappings_sector ON etf_sector_mappings(sector);
CREATE INDEX IF NOT EXISTS idx_stock_etf_alternatives_symbol ON stock_etf_alternatives(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_etf_alternatives_sector ON stock_etf_alternatives(sector);

-- Seed initial ETF sector mappings
INSERT OR IGNORE INTO etf_sector_mappings (id, sector, primary_etf, alternative_etfs, correlation_score, expense_ratio) VALUES
('etf-tech', 'Technology', 'XLK', '["QQQ","VGT","SOXX","SMH","IGV"]', 0.92, 0.10),
('etf-health', 'Health Care', 'XLV', '["VHT","IBB","XBI","IHI","ARKG"]', 0.88, 0.10),
('etf-financials', 'Financials', 'XLF', '["VFH","KRE","KBE","IAI","IYF"]', 0.90, 0.10),
('etf-consumer-disc', 'Consumer Discretionary', 'XLY', '["VCR","FXD","RTH","FDIS","IBUY"]', 0.87, 0.10),
('etf-communication', 'Communication Services', 'XLC', '["VOX","FCOM","IYZ","NXTG"]', 0.85, 0.10),
('etf-industrials', 'Industrials', 'XLI', '["VIS","IYJ","FIDU","ITA","XAR"]', 0.89, 0.10),
('etf-consumer-staples', 'Consumer Staples', 'XLP', '["VDC","FSTA","IYK","PBJ"]', 0.91, 0.10),
('etf-energy', 'Energy', 'XLE', '["VDE","OIH","XOP","IEO","FCG"]', 0.93, 0.10),
('etf-utilities', 'Utilities', 'XLU', '["VPU","IDU","FUTY","JXI"]', 0.90, 0.10),
('etf-real-estate', 'Real Estate', 'XLRE', '["VNQ","IYR","RWR","SCHH","USRT"]', 0.88, 0.10),
('etf-materials', 'Materials', 'XLB', '["VAW","IYM","FMAT","MXI","GNR"]', 0.87, 0.10);

-- Seed common stock to ETF mappings (top holdings)
INSERT OR IGNORE INTO stock_etf_alternatives (id, symbol, sector, primary_etf, sector_etf, thematic_etfs) VALUES
('alt-aapl', 'AAPL', 'Technology', 'XLK', 'QQQ', '["VGT","FTEC","IYW"]'),
('alt-msft', 'MSFT', 'Technology', 'XLK', 'QQQ', '["VGT","FTEC","IYW","IGV"]'),
('alt-googl', 'GOOGL', 'Communication Services', 'XLC', 'VOX', '["FCOM","QQQ","VGT"]'),
('alt-amzn', 'AMZN', 'Consumer Discretionary', 'XLY', 'VCR', '["QQQ","IBUY","FDN"]'),
('alt-nvda', 'NVDA', 'Technology', 'XLK', 'SMH', '["SOXX","QQQ","VGT","AIQ"]'),
('alt-meta', 'META', 'Communication Services', 'XLC', 'VOX', '["SOCL","FCOM","QQQ"]'),
('alt-tsla', 'TSLA', 'Consumer Discretionary', 'XLY', 'VCR', '["DRIV","KARS","IDRV","QQQ"]'),
('alt-brk', 'BRK.B', 'Financials', 'XLF', 'VFH', '["IYF","FNCL"]'),
('alt-unh', 'UNH', 'Health Care', 'XLV', 'VHT', '["IHI","FHLC"]'),
('alt-jpm', 'JPM', 'Financials', 'XLF', 'VFH', '["KBE","KRE","IYF"]'),
('alt-v', 'V', 'Financials', 'XLF', 'VFH', '["IPAY","FINX","IYF"]'),
('alt-ma', 'MA', 'Financials', 'XLF', 'VFH', '["IPAY","FINX","IYF"]'),
('alt-pg', 'PG', 'Consumer Staples', 'XLP', 'VDC', '["FSTA","IYK"]'),
('alt-jnj', 'JNJ', 'Health Care', 'XLV', 'VHT', '["FHLC","IHI"]'),
('alt-hd', 'HD', 'Consumer Discretionary', 'XLY', 'VCR', '["ITB","XHB","FREL"]'),
('alt-ko', 'KO', 'Consumer Staples', 'XLP', 'VDC', '["PBJ","FSTA"]'),
('alt-pep', 'PEP', 'Consumer Staples', 'XLP', 'VDC', '["PBJ","FSTA"]'),
('alt-abbv', 'ABBV', 'Health Care', 'XLV', 'VHT', '["IBB","XBI","FHLC"]'),
('alt-cvx', 'CVX', 'Energy', 'XLE', 'VDE', '["OIH","XOP","IEO"]'),
('alt-xom', 'XOM', 'Energy', 'XLE', 'VDE', '["OIH","XOP","IEO"]'),
('alt-dis', 'DIS', 'Communication Services', 'XLC', 'VOX', '["FCOM","PEJ"]'),
('alt-nflx', 'NFLX', 'Communication Services', 'XLC', 'VOX', '["FCOM","FDN","SOCL"]'),
('alt-crm', 'CRM', 'Technology', 'XLK', 'IGV', '["WCLD","CLOU","SKYY"]'),
('alt-adbe', 'ADBE', 'Technology', 'XLK', 'IGV', '["WCLD","FDN","VGT"]'),
('alt-intc', 'INTC', 'Technology', 'XLK', 'SMH', '["SOXX","PSI","VGT"]'),
('alt-amd', 'AMD', 'Technology', 'XLK', 'SMH', '["SOXX","PSI","AIQ"]');
