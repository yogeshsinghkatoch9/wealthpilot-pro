#!/bin/sh
set -e

echo "Starting WealthPilot Pro Backend..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-wealthpilot}"
DB_PASS="${POSTGRES_PASSWORD:-changeme}"
DB_NAME="${POSTGRES_DB:-wealthpilot}"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" 2>/dev/null; then
    echo "PostgreSQL is ready!"
    break
  fi
  echo "PostgreSQL not ready, waiting... (attempt $i/10)"
  sleep 3
done

# Apply database schema fixes (ensures all required columns exist)
echo "Applying database schema fixes..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q << 'EOSQL'
-- Ensure all required columns exist for registration/login to work
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_id ON holdings(portfolio_id);
EOSQL
echo "Database schema is ready!"

# Run database migrations if needed
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy || echo "Migration skipped or failed"
fi

# Generate Prisma client if needed
if [ ! -d "node_modules/.prisma" ]; then
  echo "Generating Prisma client..."
  npx prisma generate
fi

# Start the application
echo "Starting Node.js server on port ${PORT:-4000}..."
exec node src/server.js
