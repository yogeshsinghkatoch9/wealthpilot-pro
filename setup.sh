#!/bin/bash

# WealthPilot Pro - Setup Script
# This script sets up the complete development environment

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   🚀 WealthPilot Pro - Setup Script                          ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "$(dirname "$0")"

# ==================== BACKEND SETUP ====================
echo "📦 Setting up Backend with SQLite..."
echo ""

cd backend

# Create .env for SQLite
cat > .env << EOF
# Database - SQLite for local development
DATABASE_URL="file:./dev.db"

# JWT
JWT_SECRET="wealthpilot-dev-secret-$(date +%s)"
JWT_EXPIRES_IN="7d"

# Server
PORT=4000
NODE_ENV="development"

# Market Data APIs
ALPHA_VANTAGE_API_KEY="1S2UQSH44L0953E5"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3000"
EOF
echo -e "${GREEN}✓${NC} Created .env with SQLite configuration"

# Use SQLite schema
cp prisma/schema.sqlite.prisma prisma/schema.prisma
echo -e "${GREEN}✓${NC} Using SQLite schema"

# Install dependencies
echo "Installing dependencies..."
npm install 2>/dev/null

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Create database
echo "Creating SQLite database..."
npx prisma db push --accept-data-loss

# Seed database
echo "Seeding database with demo data..."
node prisma/seed.js

echo ""
echo -e "${GREEN}✓${NC} Backend setup complete!"

cd ..

# ==================== FRONTEND SETUP ====================
echo ""
echo "📦 Setting up Frontend..."

cd frontend
npm install 2>/dev/null
echo -e "${GREEN}✓${NC} Frontend setup complete!"

cd ..

# ==================== DONE ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅ Setup Complete!"
echo ""
echo "  To start the application:"
echo ""
echo "    Terminal 1: cd backend && npm run dev"
echo "    Terminal 2: cd frontend && npm run dev"
echo ""
echo "  Or run both: ./start.sh"
echo ""
echo "  API:      http://localhost:4000"
echo "  Frontend: http://localhost:3000"
echo ""
echo "  Demo Login:"
echo "    Email: demo@wealthpilot.com"
echo "    Password: demo123456"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
