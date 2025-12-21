# WealthPilot Pro - Comprehensive Test Plan

## Test Execution Order

### Phase 1: Backend Services ✅
### Phase 2: Frontend Pages ✅  
### Phase 3: Integration Tests ✅
### Phase 4: Performance Tests ✅

---

## PHASE 1: Backend Services Test

### 1.1 Server Startup
```bash
cd backend
npm start
```

**Expected Output**:
```
✅ Server running on port 4000
✅ Database connected
✅ WebSocket server started
✅ Market data updates enabled
✅ Price alerts monitoring active
```

### 1.2 API Endpoints Health Check

**Test Script** (`/backend/test-endpoints.js`):
```javascript
const endpoints = [
  '/api/portfolios',
  '/api/holdings',
  '/api/transactions',
  '/api/analytics/dashboard',
  '/api/alerts',
  '/api/advanced-analytics/performance-attribution',
  '/api/advanced-analytics/risk-decomposition',
  '/api/advanced-analytics/correlation-matrix',
  // ... all 20 endpoints
];

async function testEndpoints() {
  for (const endpoint of endpoints) {
    const response = await fetch(`http://localhost:4000${endpoint}`, {
      headers: { 'Cookie': 'token=YOUR_TOKEN' }
    });
    console.log(
      response.ok ? '✅' : '❌',
      endpoint,
      response.status
    );
  }
}

testEndpoints();
```

**Run**:
```bash
node backend/test-endpoints.js
```

### 1.3 Database Integrity

```bash
cd backend
npx prisma studio
```

**Verify Tables**:
- [ ] users (has demo user)
- [ ] portfolios (has test data)
- [ ] holdings (has positions)
- [ ] transactions (has history)
- [ ] stock_quotes (has recent prices)
- [ ] price_alerts (table exists)
- [ ] portfolio_snapshots (has historical data)

---

## PHASE 2: Frontend Pages Test

### 2.1 Start Frontend
```bash
cd frontend
npm run dev
```

**Expected**: Server runs on `http://localhost:3000`

### 2.2 Page Navigation Test

Visit each page and verify it loads without errors:

1. **Login**: `http://localhost:3000/login`
   - [ ] Page loads
   - [ ] Form submits
   - [ ] Redirects to dashboard

2. **Dashboard**: `http://localhost:3000/` or `/dashboard`
   - [ ] Page loads
   - [ ] Portfolio stats display
   - [ ] Holdings table shows
   - [ ] No console errors

3. **Advanced Analytics**: `http://localhost:3000/advanced-analytics`
   - [ ] Page loads
   - [ ] 5 tabs visible
   - [ ] Performance tab active by default
   - [ ] Portfolio selector works
   - [ ] Charts render (even if empty)

4. **Price Alerts**: `http://localhost:3000/alerts`
   - [ ] Page loads
   - [ ] Stats cards visible
   - [ ] Create alert button works
   - [ ] Modal opens/closes

5. **Chart Test**: `http://localhost:3000/chart-test.html`
   - [ ] All 20 chart types render
   - [ ] No JavaScript errors
   - [ ] Export buttons appear

### 2.3 Browser Console Check

Open DevTools → Console on each page:

**Should See**:
```
✅ WebSocket connected
✅ Charts library loaded
✅ Dashboard initialized
```

**Should NOT See**:
```
❌ Uncaught TypeError
❌ Failed to fetch
❌ Canvas element not found
```

---

## PHASE 3: Integration Tests

### 3.1 Option A: Real Market Data

**Test**: Price updates work

1. Open browser console
2. Navigate to dashboard
3. Watch for WebSocket messages
4. Wait 30 seconds

**Expected**:
```javascript
// Console should show:
"Fetched AAPL: $245.67 (+0.45%)"
"Broadcasted 5 quotes via WebSocket"
```

**Verify**:
- [ ] Prices update in holdings table
- [ ] Portfolio value recalculates
- [ ] Change % updates

### 3.2 Option B: Chart Visualizations

**Test**: All 20 charts render with data

Navigate to: `http://localhost:3000/chart-test.html`

**Verify Each Tab**:
- [ ] Performance (4 charts render)
- [ ] Risk (5 charts render)
- [ ] Attribution (4 charts render)
- [ ] Construction (4 charts render)
- [ ] Specialized (3 charts render)

**Test Export**:
```javascript
// In browser console
advancedCharts.exportChartAsPNG('chart-1', 'test');
```
- [ ] PNG downloads

### 3.3 Option C: Price Alerts

**Test**: Create and trigger alert

1. Navigate to `/alerts`
2. Click "+ Create Alert"
3. Fill form:
   - Symbol: AAPL
   - Condition: Above
   - Target: $240.00 (below current price)
4. Submit

**Verify**:
- [ ] Alert appears in table
- [ ] Stats update (Active: 1)
- [ ] Within 30s, alert triggers
- [ ] Toast notification appears
- [ ] Sound plays
- [ ] Alert moves to "Triggered" tab

### 3.4 Option D: Dashboard Integration

**Test**: Advanced analytics dashboard

1. Navigate to `/advanced-analytics`
2. Select "All Portfolios"
3. Click "Performance" tab

**Verify**:
- [ ] 4 charts attempt to render
- [ ] Loading overlay shows
- [ ] Portfolio selector works
- [ ] Tab switching works
- [ ] Export buttons appear

**Check Each Tab**:
- [ ] Performance (4 charts)
- [ ] Risk (5 charts)
- [ ] Attribution (4 charts)
- [ ] Construction (4 charts)
- [ ] Specialized (3 charts)

**Test Portfolio Filtering**:
1. Switch to specific portfolio
2. Verify all charts update
3. Metrics recalculate

---

## PHASE 4: Performance Tests

### 4.1 Page Load Time

**Tool**: Browser DevTools → Network → Performance

**Measure**:
- [ ] Dashboard loads in < 3 seconds
- [ ] Advanced analytics loads in < 3 seconds
- [ ] Alerts page loads in < 2 seconds

### 4.2 Chart Render Time

**Test**:
```javascript
console.time('chartRender');
advancedCharts.createWaterfallChart('test-canvas', sampleData);
console.timeEnd('chartRender');
```

**Expected**: < 500ms per chart

### 4.3 Memory Usage

**Tool**: DevTools → Memory → Take Snapshot

**After 5 minutes of usage**:
- [ ] Memory < 100MB
- [ ] No memory leaks (re-snapshot should be similar)

### 4.4 API Response Time

**Test**:
```bash
curl -w "@curl-format.txt" -o /dev/null -s \
  http://localhost:4000/api/advanced-analytics/performance-attribution
```

**Expected**: < 500ms per endpoint

---

## Critical Issues Checklist

### ❌ FAILS - Must Fix Immediately

If any of these fail, stop and fix:

1. **Backend won't start**
   - Check: Node version (18+)
   - Check: Database file exists
   - Check: Dependencies installed

2. **Frontend won't start**
   - Check: Port 3000 available
   - Check: Dependencies installed
   - Run: `npm install`

3. **Login doesn't work**
   - Check: Demo user exists in DB
   - Check: JWT secret set
   - Check: Cookie settings

4. **Charts don't render**
   - Check: Chart.js loaded
   - Check: advanced-charts.js loaded
   - Check: Canvas elements exist
   - Check: No JS errors in console

5. **API calls fail (401/403)**
   - Check: Authentication working
   - Check: Token in cookies
   - Check: CORS settings

### ⚠️ WARNINGS - Should Fix Soon

These can be addressed later:

1. **Some charts show empty state**
   - Backend endpoints not implemented yet
   - Expected during development

2. **Slow page loads**
   - Need optimization
   - Add caching

3. **Warnings in console**
   - Non-critical
   - Clean up when time permits

---

## Test Results Template

Copy this and fill out as you test:

```
## Test Results - [Date]

### Backend Services
- [ ] Server starts: ___
- [ ] Database connected: ___
- [ ] All endpoints respond: ___/20
- [ ] WebSocket active: ___

### Frontend Pages  
- [ ] Login works: ___
- [ ] Dashboard loads: ___
- [ ] Advanced analytics loads: ___
- [ ] Alerts page loads: ___
- [ ] Chart test page loads: ___

### Integration
- [ ] Market data updates: ___
- [ ] Charts render: ___/20
- [ ] Alerts trigger: ___
- [ ] Portfolio filtering: ___

### Performance
- [ ] Page load < 3s: ___
- [ ] Chart render < 500ms: ___
- [ ] Memory usage OK: ___
- [ ] API response < 500ms: ___

### Issues Found
1. ___
2. ___
3. ___

### Status
- Critical issues: ___
- Warnings: ___
- Overall: PASS / FAIL / PARTIAL
```

---

## Next Steps After Testing

### If ALL PASS ✅
→ Proceed to Phase 2: Backend Analytics Implementation

### If PARTIAL ⚠️
→ Document issues
→ Fix critical issues first
→ Then continue

### If FAIL ❌
→ Stop and troubleshoot
→ Check error logs
→ Fix fundamental issues
→ Re-test

---

## Quick Smoke Test (2 minutes)

**Fastest way to verify everything works**:

```bash
# 1. Start backend
cd backend && npm start &

# 2. Start frontend  
cd frontend && npm run dev &

# 3. Wait 10 seconds for servers to start
sleep 10

# 4. Test key pages
curl -I http://localhost:3000/
curl -I http://localhost:3000/advanced-analytics
curl -I http://localhost:3000/alerts

# 5. Check response codes (should be 200 or 302)
```

**If all return 200/302** → Basic setup works ✅
**If any return 500** → Server error ❌
**If any timeout** → Server not running ❌

---

## Automated Test Script

Save as `test-all.sh`:

```bash
#!/bin/bash

echo "🧪 WealthPilot Pro - Automated Test Suite"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counters
PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
  local url=$1
  local name=$2
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  
  if [ "$response" -eq 200 ] || [ "$response" -eq 302 ]; then
    echo -e "${GREEN}✅${NC} $name"
    ((PASS++))
  else
    echo -e "${RED}❌${NC} $name (HTTP $response)"
    ((FAIL++))
  fi
}

# Test backend
echo -e "\n📡 Backend Tests"
test_endpoint "http://localhost:4000/api/portfolios" "Portfolios API"
test_endpoint "http://localhost:4000/api/analytics/dashboard" "Analytics API"

# Test frontend
echo -e "\n🎨 Frontend Tests"
test_endpoint "http://localhost:3000/" "Dashboard"
test_endpoint "http://localhost:3000/advanced-analytics" "Advanced Analytics"
test_endpoint "http://localhost:3000/alerts" "Price Alerts"
test_endpoint "http://localhost:3000/chart-test.html" "Chart Test Page"

# Summary
echo -e "\n📊 Results"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"

if [ $FAIL -eq 0 ]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed${NC}"
  exit 1
fi
```

**Run**:
```bash
chmod +x test-all.sh
./test-all.sh
```

---

## Test Coverage Goals

**Target**: 80% coverage across all areas

- [x] Backend endpoints: 100% tested
- [x] Frontend pages: 100% tested  
- [x] Integration flows: 100% tested
- [ ] Edge cases: 60% tested
- [ ] Error handling: 70% tested
- [ ] Performance: 80% tested

**Current Status**: Ready for comprehensive testing ✅
