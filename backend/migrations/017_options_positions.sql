-- Options Positions Table
-- Tracks user options positions for portfolio management

CREATE TABLE IF NOT EXISTS options_positions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
    strike REAL NOT NULL,
    expiration_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    avg_cost REAL NOT NULL,
    entry_price REAL,
    implied_volatility REAL DEFAULT 30,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'expired', 'exercised', 'assigned')),
    close_price REAL,
    closed_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_options_positions_user ON options_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_options_positions_symbol ON options_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_options_positions_status ON options_positions(status);
CREATE INDEX IF NOT EXISTS idx_options_positions_expiration ON options_positions(expiration_date);

-- Options Trades History Table
-- Records all options trades for reporting and analysis
CREATE TABLE IF NOT EXISTS options_trades (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    position_id TEXT,
    symbol TEXT NOT NULL,
    option_type TEXT NOT NULL,
    strike REAL NOT NULL,
    expiration_date DATE NOT NULL,
    trade_type TEXT NOT NULL CHECK (trade_type IN ('buy_to_open', 'sell_to_open', 'buy_to_close', 'sell_to_close', 'exercise', 'assignment', 'expiration')),
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    commission REAL DEFAULT 0,
    total_amount REAL,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (position_id) REFERENCES options_positions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_options_trades_user ON options_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_options_trades_symbol ON options_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_options_trades_position ON options_trades(position_id);
