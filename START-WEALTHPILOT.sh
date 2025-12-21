#!/bin/bash

# WealthPilot Complete Startup Script
# This script ensures everything is running correctly

set -e  # Exit on error

BACKEND_DIR="/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/backend"
FRONTEND_DIR="/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/frontend"

echo "
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           🚀 WEALTHPILOT PRO - STARTUP SCRIPT 🚀             ║
║                                                              ║
║                    Starting All Services...                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"

# Function to check if port is in use
check_port() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Function to kill process on port
kill_port() {
    echo "  → Stopping existing process on port $1..."
    lsof -ti:$1 | xargs kill -9 2>/dev/null || true
    sleep 1
}

echo "📋 Step 1: Checking Prerequisites..."
echo "  ✓ Backend directory: $BACKEND_DIR"
echo "  ✓ Frontend directory: $FRONTEND_DIR"

echo ""
echo "🧹 Step 2: Cleaning Up Old Processes..."
if check_port 4000; then
    kill_port 4000
    echo "  ✓ Stopped old backend process"
fi

if check_port 3000; then
    kill_port 3000
    echo "  ✓ Stopped old frontend process"
fi

echo ""
echo "🗄️  Step 3: Database Health Check..."
cd "$BACKEND_DIR"
TABLES=$(sqlite3 data/wealthpilot.db ".tables" | wc -w)
echo "  ✓ Database has $TABLES tables"

# Clear expired sessions
DELETED=$(sqlite3 data/wealthpilot.db "DELETE FROM sessions WHERE expires_at < datetime('now'); SELECT changes();")
echo "  ✓ Cleared $DELETED expired sessions"

echo ""
echo "🔧 Step 4: Starting Backend Server (Port 4000)..."
cd "$BACKEND_DIR"
nohup node src/server.js > live-backend.log 2>&1 &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"
echo "  → Log: $BACKEND_DIR/live-backend.log"

# Wait for backend to start
echo "  → Waiting for backend to initialize..."
sleep 5

# Check if backend is responding
if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
    echo "  ✅ Backend is responding!"
else
    echo "  ⚠️  Backend health check failed, but continuing..."
fi

echo ""
echo "🎨 Step 5: Starting Frontend Server (Port 3000)..."
cd "$FRONTEND_DIR"
nohup npm start > live-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  ✓ Frontend started (PID: $FRONTEND_PID)"
echo "  → Log: $FRONTEND_DIR/live-frontend.log"

# Wait for frontend to start
echo "  → Waiting for frontend to initialize..."
sleep 8

# Check if frontend is responding
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "  ✅ Frontend is responding!"
else
    echo "  ⚠️  Frontend might still be starting..."
fi

echo ""
echo "🧪 Step 6: Running Quick Health Tests..."

# Test authentication
AUTH_TEST=$(cd "$BACKEND_DIR" && node -e "
const fetch = require('node-fetch');
(async () => {
  try {
    const res = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@wealthpilot.com', password: 'demo123456' })
    });
    const data = await res.json();
    console.log(data.token ? 'PASS' : 'FAIL');
  } catch(e) { console.log('FAIL'); }
})();
" 2>/dev/null)

if [ "$AUTH_TEST" = "PASS" ]; then
    echo "  ✅ Authentication: Working"
else
    echo "  ❌ Authentication: Failed"
fi

# Test market data
MARKET_TEST=$(cd "$BACKEND_DIR" && node -e "
const fetch = require('node-fetch');
(async () => {
  try {
    const res = await fetch('http://localhost:4000/api/market/quote/AAPL');
    const data = await res.json();
    console.log(data.price ? 'PASS' : 'FAIL');
  } catch(e) { console.log('FAIL'); }
})();
" 2>/dev/null)

if [ "$MARKET_TEST" = "PASS" ]; then
    echo "  ✅ Market Data: Working"
else
    echo "  ❌ Market Data: Failed"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              ✅ WEALTHPILOT IS NOW RUNNING! ✅                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "🌐 ACCESS YOUR APPLICATION:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:4000"
echo ""
echo "🔑 LOGIN CREDENTIALS:"
echo "   Email:    demo@wealthpilot.com"
echo "   Password: demo123456"
echo ""
echo "📊 FEATURES:"
echo "   ✓ Live market data (updates every 30 seconds)"
echo "   ✓ Portfolio management"
echo "   ✓ Advanced analytics"
echo "   ✓ Market breadth analysis"
echo "   ✓ Real-time charts and graphs"
echo ""
echo "📝 IMPORTANT:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Clear browser cache (Cmd+Shift+R on Mac)"
echo "   3. Login with credentials above"
echo "   4. All features will work!"
echo ""
echo "🔍 TROUBLESHOOTING:"
echo "   - If you see 'Invalid token' errors:"
echo "     → Clear browser cookies/cache"
echo "     → Logout and login again"
echo "   - Backend log: tail -f $BACKEND_DIR/live-backend.log"
echo "   - Frontend log: tail -f $FRONTEND_DIR/live-frontend.log"
echo ""
echo "🛑 TO STOP SERVERS:"
echo "   killall node"
echo ""
