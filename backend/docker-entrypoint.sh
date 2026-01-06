#!/bin/sh
set -e

echo "========================================"
echo "  WealthPilot Pro Backend Starting..."
echo "========================================"

# Database connection settings
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-wealthpilot}"
DB_PASS="${POSTGRES_PASSWORD:-changeme}"
DB_NAME="${POSTGRES_DB:-wealthpilot}"

# Wait for PostgreSQL to be ready
echo "[1/4] Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" 2>/dev/null; then
    echo "      PostgreSQL is ready!"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "      PostgreSQL not ready (attempt $RETRY_COUNT/$MAX_RETRIES)..."
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "      WARNING: PostgreSQL connection timeout, continuing anyway..."
fi

# Apply database schema fixes
echo "[2/4] Applying database schema fixes..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null << 'EOSQL' || echo "      Schema fixes skipped (tables may not exist yet)"
-- Ensure all required columns exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
EOSQL
echo "      Database schema ready!"

# Generate Prisma client if needed
echo "[3/4] Checking Prisma client..."
if [ ! -d "node_modules/.prisma/client" ]; then
  echo "      Generating Prisma client..."
  npx prisma generate 2>/dev/null || echo "      Prisma generate skipped"
else
  echo "      Prisma client exists!"
fi

# Start the application
echo "[4/4] Starting Node.js server..."
echo "========================================"
echo "  Server starting on port ${PORT:-4000}"
echo "========================================"
exec node src/server.js
