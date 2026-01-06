-- Crypto Holdings Table
-- Tracks user's cryptocurrency holdings

CREATE TABLE IF NOT EXISTS crypto_holdings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    cost_basis REAL NOT NULL DEFAULT 0,
    current_price REAL DEFAULT 0,
    market_value REAL DEFAULT 0,
    purchase_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_crypto_holdings_user ON crypto_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_holdings_symbol ON crypto_holdings(symbol);

-- Unique constraint per user per symbol
CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_holdings_user_symbol ON crypto_holdings(user_id, symbol);

-- Crypto Transactions Table
-- Records all buy/sell transactions for crypto

CREATE TABLE IF NOT EXISTS crypto_transactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    holding_id TEXT,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'transfer_in', 'transfer_out', 'stake', 'unstake', 'reward', 'airdrop')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total_value REAL NOT NULL,
    fee REAL DEFAULT 0,
    fee_currency TEXT DEFAULT 'USD',
    exchange TEXT,
    tx_hash TEXT,
    date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (holding_id) REFERENCES crypto_holdings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crypto_transactions_user ON crypto_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_symbol ON crypto_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_holding ON crypto_transactions(holding_id);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_date ON crypto_transactions(date);

-- Crypto Alerts Table
-- Price alerts for cryptocurrencies

CREATE TABLE IF NOT EXISTS crypto_alerts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('above', 'below', 'change_up', 'change_down')),
    target_price REAL,
    target_percent REAL,
    current_price REAL,
    triggered BOOLEAN DEFAULT FALSE,
    triggered_at DATETIME,
    notification_sent BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crypto_alerts_user ON crypto_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_alerts_active ON crypto_alerts(active);

-- DeFi Positions Table
-- Track staking, liquidity pools, and yield farming

CREATE TABLE IF NOT EXISTS defi_positions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    protocol TEXT NOT NULL,
    chain TEXT DEFAULT 'ethereum',
    position_type TEXT NOT NULL CHECK (position_type IN ('stake', 'liquidity', 'lending', 'borrowing', 'yield_farm', 'vault')),
    token_a TEXT NOT NULL,
    token_b TEXT,
    amount_a REAL NOT NULL,
    amount_b REAL,
    value_usd REAL DEFAULT 0,
    apy REAL DEFAULT 0,
    rewards_earned REAL DEFAULT 0,
    rewards_token TEXT,
    entry_date DATE,
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_defi_positions_user ON defi_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_defi_positions_protocol ON defi_positions(protocol);
CREATE INDEX IF NOT EXISTS idx_defi_positions_active ON defi_positions(active);

-- Crypto Price History Cache
-- Cache historical prices for performance

CREATE TABLE IF NOT EXISTS crypto_price_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    volume_24h REAL,
    market_cap REAL,
    change_24h REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crypto_price_cache_symbol ON crypto_price_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_price_cache_timestamp ON crypto_price_cache(timestamp);

-- Clean up old cache entries (keep 7 days)
-- This would be run by a scheduled job
-- DELETE FROM crypto_price_cache WHERE timestamp < datetime('now', '-7 days');
