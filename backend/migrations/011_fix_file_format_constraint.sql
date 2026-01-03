-- Migration 011: Fix file format constraint to allow 'xls' files
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints directly
-- So we need to recreate the table

-- Step 1: Create new table with corrected constraint
CREATE TABLE IF NOT EXISTS uploaded_portfolios_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT,
  original_filename TEXT NOT NULL,
  file_format TEXT NOT NULL CHECK(file_format IN ('csv', 'xlsx', 'xls', 'json')),
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed')),
  total_holdings INTEGER DEFAULT 0,
  total_value REAL DEFAULT 0,
  error_message TEXT,
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL
);

-- Step 2: Copy existing data
INSERT INTO uploaded_portfolios_new
SELECT * FROM uploaded_portfolios;

-- Step 3: Drop old table
DROP TABLE uploaded_portfolios;

-- Step 4: Rename new table
ALTER TABLE uploaded_portfolios_new RENAME TO uploaded_portfolios;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_user
  ON uploaded_portfolios(user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_status
  ON uploaded_portfolios(status);

CREATE INDEX IF NOT EXISTS idx_uploaded_portfolios_date
  ON uploaded_portfolios(upload_date DESC);
