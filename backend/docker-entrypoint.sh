#!/bin/sh
set -e

echo "🚀 Starting WealthPilot Backend..."
echo "📊 Environment: $NODE_ENV"
echo "🔗 Database URL exists: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'no')"

# Wait for database to be ready (with timeout)
echo "⏳ Waiting for database connection..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # Use prisma validate to check connection without modifying schema
  if npx prisma db pull --print > /dev/null 2>&1; then
    echo "✅ Database connection verified!"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "⏳ Database not ready, attempt $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️ Could not connect to database after $MAX_RETRIES attempts"
  echo "⚠️ Starting server anyway - will retry on first request"
fi

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Start the application
echo "🎯 Starting Node.js server on port ${PORT:-4000}..."
exec node src/server.js
