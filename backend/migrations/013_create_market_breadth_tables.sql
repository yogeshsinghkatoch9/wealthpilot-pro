-- Market Breadth & Internals Database Schema
-- Creates tables for storing comprehensive market breadth indicators

-- ==================== BREADTH INDICATORS ====================

-- Advance/Decline Line (cumulative)
CREATE TABLE IF NOT EXISTS market_advance_decline (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL, -- SPY, QQQ, IWM, DIA
  advancing INTEGER NOT NULL,
  declining INTEGER NOT NULL,
  unchanged INTEGER NOT NULL,
  total_issues INTEGER NOT NULL,
  ad_ratio REAL, -- advancing / (advancing + declining)
  ad_line REAL, -- Cumulative (advancing - declining)
  net_advances INTEGER, -- advancing - declining
  data_source TEXT, -- Which API provided this data
  UNIQUE(date, index_symbol)
);

CREATE INDEX idx_ad_date ON market_advance_decline(date DESC);
CREATE INDEX idx_ad_symbol ON market_advance_decline(index_symbol);

-- Percentage above Moving Averages
CREATE TABLE IF NOT EXISTS market_ma_breadth (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  ma_period INTEGER NOT NULL, -- 20, 50, 100, 200
  above_ma INTEGER NOT NULL, -- Number of stocks above MA
  below_ma INTEGER NOT NULL,
  total_stocks INTEGER NOT NULL,
  percent_above REAL NOT NULL, -- Percentage above MA
  data_source TEXT,
  UNIQUE(date, index_symbol, ma_period)
);

CREATE INDEX idx_ma_breadth_date ON market_ma_breadth(date DESC);
CREATE INDEX idx_ma_breadth_symbol ON market_ma_breadth(index_symbol);
CREATE INDEX idx_ma_breadth_period ON market_ma_breadth(ma_period);

-- New Highs - New Lows
CREATE TABLE IF NOT EXISTS market_highs_lows (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  new_highs_52w INTEGER NOT NULL, -- 52-week highs
  new_lows_52w INTEGER NOT NULL, -- 52-week lows
  new_highs_20d INTEGER, -- 20-day highs
  new_lows_20d INTEGER, -- 20-day lows
  hl_index INTEGER, -- new_highs - new_lows
  hl_ratio REAL, -- new_highs / new_lows
  total_issues INTEGER,
  data_source TEXT,
  UNIQUE(date, index_symbol)
);

CREATE INDEX idx_hl_date ON market_highs_lows(date DESC);
CREATE INDEX idx_hl_symbol ON market_highs_lows(index_symbol);

-- Arms Index (TRIN - Short-term Trading Index)
CREATE TABLE IF NOT EXISTS market_trin (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  time TIME,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  trin_value REAL NOT NULL,
  advancing INTEGER,
  declining INTEGER,
  advancing_volume REAL,
  declining_volume REAL,
  data_source TEXT,
  UNIQUE(timestamp, index_symbol)
);

CREATE INDEX idx_trin_date ON market_trin(date DESC, time DESC);
CREATE INDEX idx_trin_symbol ON market_trin(index_symbol);

-- Tick Index ($TICK - Intraday sentiment)
CREATE TABLE IF NOT EXISTS market_tick (
  id TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  tick_value INTEGER NOT NULL, -- Upticks - Downticks
  upticks INTEGER,
  downticks INTEGER,
  data_source TEXT
);

CREATE INDEX idx_tick_timestamp ON market_tick(timestamp DESC);

-- McClellan Oscillator & Summation Index
CREATE TABLE IF NOT EXISTS market_mcclellan (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  oscillator REAL NOT NULL, -- 19-day EMA - 39-day EMA of A/D
  summation_index REAL, -- Cumulative McClellan Oscillator
  ema_19 REAL,
  ema_39 REAL,
  net_advances INTEGER,
  data_source TEXT,
  UNIQUE(date, index_symbol)
);

CREATE INDEX idx_mcclellan_date ON market_mcclellan(date DESC);
CREATE INDEX idx_mcclellan_symbol ON market_mcclellan(index_symbol);

-- Up/Down Volume Ratio
CREATE TABLE IF NOT EXISTS market_volume_ratio (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  time TIME,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  up_volume REAL NOT NULL,
  down_volume REAL NOT NULL,
  volume_ratio REAL, -- up_volume / down_volume
  total_volume REAL,
  data_source TEXT,
  UNIQUE(timestamp, index_symbol)
);

CREATE INDEX idx_volume_ratio_date ON market_volume_ratio(date DESC, time DESC);
CREATE INDEX idx_volume_ratio_symbol ON market_volume_ratio(index_symbol);

-- Breadth Thrust Indicator
CREATE TABLE IF NOT EXISTS market_breadth_thrust (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  thrust_value REAL NOT NULL, -- 10-day EMA of (advancing / (advancing + declining))
  ema_10 REAL,
  is_thrust_signal BOOLEAN DEFAULT 0, -- 1 if crossed threshold (0.4 to 0.615 in 10 days)
  signal_strength TEXT, -- weak, moderate, strong
  data_source TEXT,
  UNIQUE(date, index_symbol)
);

CREATE INDEX idx_thrust_date ON market_breadth_thrust(date DESC);
CREATE INDEX idx_thrust_symbol ON market_breadth_thrust(index_symbol);

-- ==================== INDEX CONSTITUENTS ====================

-- Store constituent lists for each index
CREATE TABLE IF NOT EXISTS index_constituents (
  id TEXT PRIMARY KEY,
  index_symbol TEXT NOT NULL,
  stock_symbol TEXT NOT NULL,
  stock_name TEXT,
  sector TEXT,
  industry TEXT,
  market_cap REAL,
  weight REAL, -- Weight in index
  added_date DATE,
  removed_date DATE,
  is_active BOOLEAN DEFAULT 1,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(index_symbol, stock_symbol)
);

CREATE INDEX idx_constituents_index ON index_constituents(index_symbol);
CREATE INDEX idx_constituents_active ON index_constituents(is_active);

-- ==================== REAL-TIME MARKET DATA ====================

-- Cache real-time market quotes
CREATE TABLE IF NOT EXISTS market_realtime_quotes (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  price REAL,
  open REAL,
  high REAL,
  low REAL,
  volume REAL,
  change REAL,
  change_percent REAL,
  bid REAL,
  ask REAL,
  bid_size INTEGER,
  ask_size INTEGER,
  data_source TEXT,
  UNIQUE(symbol, timestamp)
);

CREATE INDEX idx_realtime_symbol ON market_realtime_quotes(symbol);
CREATE INDEX idx_realtime_timestamp ON market_realtime_quotes(timestamp DESC);

-- ==================== MARKET HEALTH SUMMARY ====================

-- Aggregated market health score
CREATE TABLE IF NOT EXISTS market_health_summary (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  index_symbol TEXT NOT NULL,
  health_score INTEGER, -- 0-100 composite score
  breadth_score INTEGER, -- A/D contribution
  momentum_score INTEGER, -- MA breadth contribution
  sentiment_score INTEGER, -- TRIN, TICK contribution
  trend_score INTEGER, -- McClellan contribution
  signal TEXT, -- BULLISH, BEARISH, NEUTRAL
  confidence REAL, -- 0-1 confidence level
  notes TEXT,
  UNIQUE(date, index_symbol)
);

CREATE INDEX idx_health_date ON market_health_summary(date DESC);
CREATE INDEX idx_health_symbol ON market_health_summary(index_symbol);

-- ==================== API USAGE TRACKING ====================

-- Track API calls for rate limiting and monitoring
CREATE TABLE IF NOT EXISTS api_usage_log (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL, -- alphaVantage, fmp, polygon, nasdaq, intrinio
  endpoint TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN,
  response_time_ms INTEGER,
  error_message TEXT,
  cache_hit BOOLEAN DEFAULT 0
);

CREATE INDEX idx_api_provider ON api_usage_log(provider);
CREATE INDEX idx_api_timestamp ON api_usage_log(timestamp DESC);

-- ==================== DATA QUALITY TRACKING ====================

-- Track data quality and completeness
CREATE TABLE IF NOT EXISTS data_quality_log (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  date DATE NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  record_count INTEGER,
  missing_fields INTEGER,
  outliers_detected INTEGER,
  data_sources TEXT, -- JSON array of sources used
  quality_score INTEGER, -- 0-100
  issues TEXT -- JSON array of issues found
);

CREATE INDEX idx_quality_table ON data_quality_log(table_name);
CREATE INDEX idx_quality_date ON data_quality_log(date DESC);
