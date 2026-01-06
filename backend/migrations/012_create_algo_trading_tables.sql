-- Migration 012: Algorithmic Trading System Tables
-- Creates tables for strategies, backtesting, signals, and paper trading

-- Trading Strategies
CREATE TABLE IF NOT EXISTS trading_strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL, -- 'macd_crossover', 'rsi', 'ma_crossover', 'bollinger', 'mean_reversion', 'custom'
  parameters TEXT NOT NULL, -- JSON string of strategy parameters
  symbols TEXT, -- Comma-separated list of symbols or 'ALL'
  timeframe TEXT DEFAULT '1h', -- '1m', '5m', '15m', '1h', '4h', '1d'
  is_active INTEGER DEFAULT 0, -- 0 = inactive, 1 = active
  is_paper_trading INTEGER DEFAULT 1, -- 0 = live trading, 1 = paper trading
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Backtest Results
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_capital REAL DEFAULT 10000,
  final_capital REAL,
  total_return REAL, -- Percentage
  total_trades INTEGER,
  winning_trades INTEGER,
  losing_trades INTEGER,
  win_rate REAL, -- Percentage
  avg_win REAL,
  avg_loss REAL,
  max_drawdown REAL, -- Percentage
  sharpe_ratio REAL,
  profit_factor REAL,
  expectancy REAL,
  trades_data TEXT, -- JSON array of all trades
  equity_curve TEXT, -- JSON array of equity over time
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Strategy Signals (Real-time and Historical)
CREATE TABLE IF NOT EXISTS strategy_signals (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL, -- 'BUY', 'SELL', 'HOLD'
  price REAL NOT NULL,
  confidence REAL, -- 0-1 confidence score
  indicators TEXT, -- JSON of indicator values at signal time
  reason TEXT, -- Human-readable reason for signal
  executed INTEGER DEFAULT 0, -- 0 = not executed, 1 = executed
  executed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Paper Trading Portfolios
CREATE TABLE IF NOT EXISTS paper_portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  initial_balance REAL DEFAULT 100000,
  current_balance REAL DEFAULT 100000,
  total_value REAL DEFAULT 100000, -- balance + holdings value
  total_return REAL DEFAULT 0, -- Percentage
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Paper Trading Positions
CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  paper_portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  shares REAL NOT NULL,
  avg_entry_price REAL NOT NULL,
  current_price REAL,
  unrealized_pl REAL,
  unrealized_pl_pct REAL,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_portfolio_id) REFERENCES paper_portfolios(id) ON DELETE CASCADE
);

-- Paper Trading Transactions
CREATE TABLE IF NOT EXISTS paper_transactions (
  id TEXT PRIMARY KEY,
  paper_portfolio_id TEXT NOT NULL,
  strategy_id TEXT,
  signal_id TEXT,
  symbol TEXT NOT NULL,
  transaction_type TEXT NOT NULL, -- 'BUY', 'SELL'
  shares REAL NOT NULL,
  price REAL NOT NULL,
  total_amount REAL NOT NULL,
  commission REAL DEFAULT 0,
  realized_pl REAL, -- For SELL transactions
  realized_pl_pct REAL,
  notes TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_portfolio_id) REFERENCES paper_portfolios(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE SET NULL,
  FOREIGN KEY (signal_id) REFERENCES strategy_signals(id) ON DELETE SET NULL
);

-- Strategy Performance Metrics (aggregated)
CREATE TABLE IF NOT EXISTS strategy_performance (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL, -- '1d', '1w', '1m', '3m', '1y', 'all'
  total_return REAL,
  win_rate REAL,
  profit_factor REAL,
  sharpe_ratio REAL,
  max_drawdown REAL,
  total_trades INTEGER,
  avg_trade_duration INTEGER, -- in minutes
  best_trade REAL,
  worst_trade REAL,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategies_user ON trading_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_id);
CREATE INDEX IF NOT EXISTS idx_backtest_user ON backtest_results(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON strategy_signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_user ON strategy_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON strategy_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_paper_portfolios_user ON paper_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_positions_portfolio ON paper_positions(paper_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_portfolio ON paper_transactions(paper_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_strategy ON strategy_performance(strategy_id);
