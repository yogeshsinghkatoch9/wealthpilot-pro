# Live Dashboard Testing Guide

## 🎯 What You're Testing

Your dashboard now has **real-time market data** updating every 30 seconds. Here's how to verify everything works.

---

## ✅ Pre-Test Checklist

### 1. Backend Server Status
```bash
# Check if backend is running
lsof -ti:4000
```
**Expected**: Should return a process ID

### 2. Frontend Server Status
```bash
# Check if frontend is running
lsof -ti:3000
```
**Expected**: Should return a process ID

### 3. WebSocket Status
```bash
# Test WebSocket connection
curl http://localhost:4000/health
```
**Expected**: `{"status":"ok"}`

---

## 📊 Dashboard Testing Steps

### Step 1: Open Dashboard
1. Open browser: http://localhost:3000
2. Login credentials:
   - Email: `demo@wealthpilot.com`
   - Password: `demo123456`

### Step 2: Verify Initial Load
**Check these elements on page load:**

- [ ] Portfolio total value shows (not $0.00)
- [ ] Holdings table populated with stocks
- [ ] Charts rendered (3 charts visible)
- [ ] "LIVE" indicator in top-right corner

### Step 3: Open Browser Console (Press F12)
**You should see these messages:**

```javascript
✓ WebSocket connected
✓ Authenticated as user: aee2c3f4-...
✓ Auto-subscribed to: [AAPL, MSFT]
```

### Step 4: Wait for Live Update (30 seconds)
**After 30 seconds, you should see:**

```javascript
📊 Quote update: AAPL $XXX.XX
📊 Quote update: MSFT $XXX.XX
```

**Visual changes:**
- [ ] Stock prices flash briefly (animation)
- [ ] Portfolio value updates
- [ ] Change percentages update
- [ ] Timestamp updates

### Step 5: Verify Real Prices
**Compare with actual market:**
1. Open Yahoo Finance: https://finance.yahoo.com/quote/AAPL
2. Compare AAPL price with your dashboard
3. Should match within $0.50

### Step 6: Test WebSocket Persistence
**Refresh the page (F5):**
- [ ] WebSocket reconnects automatically
- [ ] Live data continues updating
- [ ] "LIVE" indicator stays green

### Step 7: Test Multiple Tabs
**Open dashboard in 2 browser tabs:**
- [ ] Both tabs receive updates
- [ ] Both show "LIVE" status
- [ ] Prices sync across tabs

---

## 🔍 Backend Monitoring

### Watch Live Updates in Real-Time

```bash
# Terminal 1: Watch backend logs
tail -f /tmp/backend.log | grep -E "(Fetched|Updated|Broadcasted)"
```

**You should see every 30 seconds:**
```
Fetched AAPL: $278.28 (+0.09%)
Fetched MSFT: $478.53 (-1.02%)
Updated 2 stock quotes
Broadcasted 2 quotes via WebSocket
```

### Check Database Updates

```bash
# Terminal 2: Query database
cd backend && node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/wealthpilot.db');
setInterval(() => {
  const quotes = db.prepare('SELECT symbol, price, change_percent, updated_at FROM stock_quotes ORDER BY updated_at DESC LIMIT 2').all();
  console.clear();
  console.log('📊 Latest Stock Quotes:\\n');
  quotes.forEach(q => {
    const time = new Date(q.updated_at).toLocaleTimeString();
    console.log(\`  \${q.symbol}: $\${q.price.toFixed(2)} (\${q.change_percent >= 0 ? '+' : ''}\${q.change_percent.toFixed(2)}%) - Updated: \${time}\`);
  });
}, 5000);
"
```

---

## 🎨 Visual Indicators to Check

### 1. Portfolio Overview Card
```
┌─────────────────────────────┐
│ Total Value: $536,764.70    │ ← Should update every 30s
│ Day P&L: +$X,XXX.XX         │ ← Changes color (green/red)
│ Total P&L: -27.66%          │ ← Recalculates on price change
└─────────────────────────────┘
```

### 2. Holdings Table
```
┌────────┬────────┬──────────────┬─────────┐
│ Symbol │ Weight │ Value        │ P&L %   │
├────────┼────────┼──────────────┼─────────┤
│ AAPL   │ 70.66% │ $379,300.00  │ +0.09%  │ ← Price flashes on update
│ MSFT   │ 23.15% │ $124,241.80  │ -1.02%  │ ← Color changes
└────────┴────────┴──────────────┴─────────┘
```

### 3. Status Indicator
```
[🟢 LIVE]  ← Green when connected
[🔴 OFFLINE] ← Red when disconnected
```

---

## 🐛 Troubleshooting

### Problem: "OFFLINE" Status
**Solution:**
```bash
# Check WebSocket server
lsof -ti:4000 | xargs kill -9
cd backend && npm run dev > /tmp/backend.log 2>&1 &
```

### Problem: No Price Updates
**Check:**
1. Backend logs show "Fetched" messages
2. Internet connection active
3. Yahoo Finance API responding

**Test manually:**
```bash
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/AAPL" | head -50
```

### Problem: Prices Don't Match Market
**This is normal:**
- Dashboard updates every 30 seconds
- Yahoo Finance has ~15 minute delay
- Real-time quotes require paid API

### Problem: WebSocket Won't Connect
**Check CORS:**
```bash
# Backend should allow frontend origin
grep -n "cors" backend/src/server.js
```

---

## ✅ Success Criteria

Your live dashboard is working correctly if:

- [x] Prices update automatically every 30 seconds
- [x] WebSocket shows "LIVE" status
- [x] Portfolio value recalculates on price changes
- [x] Browser console shows quote updates
- [x] Backend logs show "Broadcasted" messages
- [x] Prices match Yahoo Finance (within reason)
- [x] Price flash animation works
- [x] Multiple tabs receive updates
- [x] Auto-reconnects on disconnect

---

## 📸 Expected Screenshots

### 1. Dashboard with Live Data
![Portfolio showing real values, green/red colors, charts rendered]

### 2. Browser Console
```
WebSocket connected
Authenticated as user: aee2c3f4...
Auto-subscribed to: [AAPL, MSFT]
Quote update: AAPL $278.28
Quote update: MSFT $478.53
```

### 3. Backend Logs
```
Starting price updates every 30s
Fetched AAPL: $278.28 (+0.09%)
Fetched MSFT: $478.53 (-1.02%)
Updated 2 stock quotes
Broadcasted 2 quotes via WebSocket
```

---

## 🎯 Next: After Testing

Once you've verified everything works:
1. ✅ Live market data confirmed
2. 🚀 Ready for chart visualizations
3. 🔔 Ready for price alerts
4. ⚡ Ready for advanced features

**Testing Time: 5 minutes**
**Result: Real-time portfolio dashboard like Bloomberg Terminal!**
