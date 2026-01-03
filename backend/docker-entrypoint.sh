#!/bin/sh
set -e

echo "Starting WealthPilot Pro Backend..."

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
