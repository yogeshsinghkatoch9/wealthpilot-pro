#!/bin/bash
set -e

echo "Starting WealthPilot Pro Backend..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h ${DB_HOST:-postgres} -p ${DB_PORT:-5432} -U ${DB_USER:-wealthpilot} 2>/dev/null; do
  echo "PostgreSQL not ready, waiting..."
  sleep 2
done
echo "PostgreSQL is ready!"

# Run database schema fixes
echo "Applying database schema fixes..."
PGPASSWORD=${DB_PASSWORD:-changeme} psql -h ${DB_HOST:-postgres} -p ${DB_PORT:-5432} -U ${DB_USER:-wealthpilot} -d ${DB_NAME:-wealthpilot} << 'EOSQL'
-- Ensure all required columns exist
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_id ON holdings(portfolio_id);

SELECT 'Schema fixes applied successfully' as status;
EOSQL

echo "Database schema is ready!"

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Start the Node.js server
echo "Starting Node.js server on port ${PORT:-4000}..."
exec node src/server.js
