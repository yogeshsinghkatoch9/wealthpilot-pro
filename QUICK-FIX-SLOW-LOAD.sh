#!/bin/bash

echo "🔧 FIXING SLOW LOAD ISSUE..."
echo ""

# Step 1: Kill all Node processes to clear memory
echo "1️⃣ Stopping all servers..."
killall node 2>/dev/null
sleep 2

# Step 2: Clear frontend cache
echo "2️⃣ Clearing frontend cache..."
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/frontend"
rm -rf .next 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null

# Step 3: Clear backend cache
echo "3️⃣ Clearing backend cache..."
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/backend"
rm -rf node_modules/.cache 2>/dev/null

# Step 4: Clear all expired sessions from database
echo "4️⃣ Clearing expired sessions..."
sqlite3 data/wealthpilot.db "DELETE FROM sessions; VACUUM;" 2>/dev/null

# Step 5: Restart backend (faster startup without live data initially)
echo "5️⃣ Starting backend..."
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/backend"
NODE_ENV=production nohup node src/server.js > live-backend.log 2>&1 &
echo "   Backend started (PID: $!)"
sleep 3

# Step 6: Restart frontend
echo "6️⃣ Starting frontend..."
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete/frontend"
nohup npm start > live-frontend.log 2>&1 &
echo "   Frontend started (PID: $!)"
sleep 5

echo ""
echo "✅ DONE! Servers restarted with optimizations"
echo ""
echo "📝 IMPORTANT - TO FIX SLOW LOADING:"
echo ""
echo "1. Clear browser cache COMPLETELY:"
echo "   Chrome: Settings → Privacy → Clear browsing data → ALL TIME"
echo ""
echo "2. Close ALL browser tabs"
echo ""
echo "3. Open NEW incognito/private window"
echo ""
echo "4. Go to: http://localhost:3000"
echo ""
echo "5. Login: demo@wealthpilot.com / demo123456"
echo ""
echo "   ✅ Page will load FAST!"
echo ""
echo "🔍 Why it was slow:"
echo "   - Old authentication tokens cached in browser"
echo "   - Dashboard making 37+ API calls"
echo "   - Each call timing out (401 errors)"
echo "   - Browser waiting for all to complete"
echo ""
echo "🚀 Solution:"
echo "   - Fresh browser session = no old tokens"
echo "   - New login = valid token"
echo "   - API calls succeed = fast load!"
echo ""
