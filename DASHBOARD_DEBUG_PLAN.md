# Dashboard Comprehensive Debugging Plan

## Overview
Full system audit of WealthPilot Pro Dashboard from start to end, ensuring all features work with live data.

---

## Phase 1: Route & Data Loading Audit

### 1.1 Dashboard Route Handler
**File:** `/frontend/src/server.ts` (lines 116-220)
- [ ] Verify route handler exists for `/` and `/dashboard`
- [ ] Check authentication middleware (requireAuth)
- [ ] Verify API calls to backend for portfolios, holdings, snapshots
- [ ] Check error handling for failed API calls
- [ ] Verify data passed to EJS template

### 1.2 Backend API Endpoints
**File:** `/backend/src/routes/portfolios.js`
- [ ] `GET /api/portfolios` - Returns user's portfolios
- [ ] `GET /api/portfolios/:id` - Returns single portfolio details
- [ ] `GET /api/portfolios/:id/holdings` - Returns portfolio holdings
- [ ] `GET /api/portfolios/:id/snapshots` - Returns historical snapshots
- [ ] `GET /api/portfolios/:id/analytics` - Returns analytics data

### 1.3 Data Flow Verification
- [ ] Login → JWT token → Cookie storage
- [ ] Dashboard load → Fetch portfolios → Fetch holdings
- [ ] Market data fetch → Alpha Vantage API
- [ ] Real-time prices → WebSocket updates

---

## Phase 2: Portfolio Data Testing

### 2.1 Portfolio Fetching
- [ ] Test with user having 0 portfolios (empty state)
- [ ] Test with user having 1 portfolio
- [ ] Test with user having multiple portfolios
- [ ] Verify default portfolio selection
- [ ] Test portfolio switching

### 2.2 Holdings Data
- [ ] Verify holdings fetch for each portfolio
- [ ] Check stock symbols are valid
- [ ] Verify shares and cost basis display
- [ ] Test holdings with missing market data
- [ ] Verify cash balance display

### 2.3 Position Calculations
- [ ] Current value = shares × current price
- [ ] Cost basis = shares × avg_cost_basis
- [ ] Gain/Loss = current value - cost basis
- [ ] Gain/Loss % = (gain/loss / cost basis) × 100
- [ ] Portfolio total value = sum(holdings) + cash
- [ ] Asset allocation % = (holding value / total value) × 100

---

## Phase 3: Market Data Integration

### 3.1 Alpha Vantage API
**File:** `/backend/src/services/marketData.js`
- [ ] Verify API key is configured (.env)
- [ ] Test quote fetching for valid symbols
- [ ] Test batch quote fetching (multiple symbols)
- [ ] Verify rate limiting (5 calls/min for free tier)
- [ ] Test error handling for invalid symbols
- [ ] Implement caching to reduce API calls

### 3.2 Historical Data
- [ ] Test historical price fetching
- [ ] Verify snapshot creation with historical prices
- [ ] Test time series data for charts
- [ ] Verify data formatting (dates, prices)

### 3.3 Real-time Updates
- [ ] WebSocket connection establishment
- [ ] Price update broadcasts
- [ ] Frontend price update handling
- [ ] Verify update frequency throttling
- [ ] Test reconnection on disconnect

---

## Phase 4: Charts & Visualizations

### 4.1 Performance Chart
**Location:** Dashboard main chart
- [ ] Verify Chart.js is loaded
- [ ] Test data fetching from snapshots
- [ ] Verify date formatting on X-axis
- [ ] Verify value formatting on Y-axis
- [ ] Test with empty data (no snapshots)
- [ ] Test with single data point
- [ ] Test with full year of data
- [ ] Verify colors (Bloomberg theme)

### 4.2 Asset Allocation Chart
**Type:** Pie/Doughnut chart
- [ ] Verify holdings data aggregation
- [ ] Test percentage calculations
- [ ] Verify color assignments
- [ ] Test with 1 holding
- [ ] Test with 10+ holdings
- [ ] Verify legend display

### 4.3 Sector Allocation Chart
**Type:** Bar chart
- [ ] Verify sector data from holdings
- [ ] Test sector aggregation logic
- [ ] Verify missing sector handling
- [ ] Test color coding by sector
- [ ] Verify percentage labels

---

## Phase 5: Analytics Calculations

### 5.1 Performance Metrics
**File:** `/backend/src/services/analytics.js`

#### Total Return
```
Total Return = (Current Value - Initial Value) / Initial Value × 100
```
- [ ] Test with positive returns
- [ ] Test with negative returns
- [ ] Test with zero returns
- [ ] Verify time period calculations

#### Sharpe Ratio
```
Sharpe = (Portfolio Return - Risk-Free Rate) / Portfolio Std Dev
```
- [ ] Verify return calculation
- [ ] Verify standard deviation calculation
- [ ] Test with risk-free rate = 0.02
- [ ] Handle edge case: std dev = 0

#### Max Drawdown
```
Max Drawdown = (Trough Value - Peak Value) / Peak Value × 100
```
- [ ] Identify peak value
- [ ] Identify trough value after peak
- [ ] Verify calculation
- [ ] Test with no drawdowns

#### Beta
```
Beta = Covariance(Portfolio, Benchmark) / Variance(Benchmark)
```
- [ ] Fetch benchmark data (SPY)
- [ ] Calculate returns alignment
- [ ] Verify covariance calculation
- [ ] Verify variance calculation
- [ ] Test with benchmark = SPY, QQQ

#### Volatility (Standard Deviation)
```
Volatility = Std Dev of Returns × sqrt(252) (annualized)
```
- [ ] Calculate daily returns
- [ ] Calculate standard deviation
- [ ] Annualize (×sqrt(252))
- [ ] Verify edge cases

### 5.2 Attribution Analysis
- [ ] Sector contribution to return
- [ ] Stock contribution to return
- [ ] Top gainers identification
- [ ] Top losers identification

---

## Phase 6: WebSocket & Real-time Updates

### 6.1 WebSocket Server
**File:** `/backend/src/services/websocket.js`
- [ ] Verify server initialization
- [ ] Test client connection
- [ ] Test authentication via query token
- [ ] Verify message broadcasting
- [ ] Test client disconnection handling
- [ ] Verify memory cleanup

### 6.2 WebSocket Client
**File:** `/frontend/public/js/dashboard-realtime.js`
- [ ] Verify connection on page load
- [ ] Test reconnection logic
- [ ] Verify token passing
- [ ] Test message reception
- [ ] Test DOM updates on price change
- [ ] Verify throttling (max 1 update/sec)

### 6.3 Update Events
- [ ] `price_update` - Individual stock price
- [ ] `portfolio_update` - Full portfolio refresh
- [ ] `holdings_update` - Holdings changed
- [ ] Test event handlers for each type

---

## Phase 7: Error Handling & Edge Cases

### 7.1 API Errors
- [ ] Backend unavailable (500 error)
- [ ] Authentication failed (401 error)
- [ ] Rate limit exceeded (429 error)
- [ ] Invalid portfolio ID (404 error)
- [ ] Network timeout
- [ ] Display user-friendly error messages

### 7.2 Data Edge Cases
- [ ] Empty portfolio (no holdings)
- [ ] Portfolio with only cash
- [ ] Holdings with $0 cost basis
- [ ] Holdings with 0 shares
- [ ] Invalid stock symbols
- [ ] Missing market data
- [ ] Stale data (market closed)

### 7.3 UI Edge Cases
- [ ] Very long portfolio names
- [ ] 100+ holdings (performance)
- [ ] Extremely large values ($1B+)
- [ ] Extremely small values ($0.01)
- [ ] Negative cash balance
- [ ] Mobile responsive layout
- [ ] Dark theme compatibility

---

## Phase 8: Database Integrity

### 8.1 Schema Verification
**File:** `/backend/src/config/database.js`
- [ ] Verify all tables exist
- [ ] Check foreign key constraints
- [ ] Verify indexes for performance
- [ ] Test cascade deletes

### 8.2 Data Consistency
- [ ] Orphaned holdings (portfolio deleted)
- [ ] Duplicate holdings (same symbol)
- [ ] Invalid user_id references
- [ ] Expired sessions cleanup
- [ ] Snapshot data integrity

---

## Phase 9: Performance Optimization

### 9.1 Backend Performance
- [ ] Implement Redis caching for market data
- [ ] Database query optimization
- [ ] Batch API requests
- [ ] Reduce N+1 queries
- [ ] Add database indexes

### 9.2 Frontend Performance
- [ ] Lazy load charts
- [ ] Debounce real-time updates
- [ ] Minimize DOM manipulations
- [ ] Optimize chart re-renders
- [ ] Code splitting

### 9.3 API Rate Limiting
- [ ] Implement in-memory cache
- [ ] Cache market data (5 min TTL)
- [ ] Cache analytics (1 min TTL)
- [ ] Batch symbol lookups
- [ ] Queue requests during rate limit

---

## Phase 10: Advanced Analytics Implementation

Once debugging is complete, implement the 20 Advanced Portfolio Analytics:

### Tab 1: PERFORMANCE (4 analyses)
1. Performance attribution waterfall
2. Excess return vs benchmark
3. Drawdown analysis
4. Rolling statistics

### Tab 2: RISK (5 analyses)
5. Risk decomposition (factor exposures)
6. VaR & stress scenarios
7. Correlation & covariance heatmap
8. Scenario & stress testing
9. Holdings concentration

### Tab 3: ATTRIBUTION (4 analyses)
10. Attribution by region/currency
11. Sector rotation & exposure
12. Attribution vs peers
13. Alpha decay / factor crowding

### Tab 4: PORTFOLIO CONSTRUCTION (4 analyses)
14. Optimization / efficient frontier
15. Holdings turnover & trade cadence
16. Liquidity and market impact
17. Transaction cost analysis

### Tab 5: SPECIALIZED (3 analyses)
18. Performance attribution for alternatives
19. ESG / sustainability exposure
20. Client/product performance reporting

---

## Debugging Tools & Commands

### Backend Logs
```bash
tail -f /tmp/backend-server.log
```

### Test Specific Endpoint
```bash
# Get portfolios
curl -H "Authorization: Bearer TOKEN" http://localhost:4000/api/portfolios

# Get holdings
curl -H "Authorization: Bearer TOKEN" http://localhost:4000/api/portfolios/PORTFOLIO_ID/holdings

# Get analytics
curl -H "Authorization: Bearer TOKEN" http://localhost:4000/api/portfolios/PORTFOLIO_ID/analytics
```

### Database Queries
```bash
cd backend
sqlite3 wealthpilot.db
sqlite> SELECT * FROM portfolios;
sqlite> SELECT * FROM holdings;
sqlite> SELECT * FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 10;
```

### WebSocket Testing
```javascript
// Browser console
const ws = new WebSocket('ws://localhost:4000/ws?token=YOUR_TOKEN');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
```

---

## Success Criteria

- [ ] Dashboard loads without errors
- [ ] All portfolios display correctly
- [ ] Holdings show live prices
- [ ] Charts render with real data
- [ ] Analytics calculations are accurate
- [ ] WebSocket updates work
- [ ] Error messages are user-friendly
- [ ] Mobile responsive
- [ ] Page loads in < 3 seconds
- [ ] No console errors

---

## Execution Order

1. **Phase 1-2**: Verify data flow (routes → API → database)
2. **Phase 3**: Fix market data integration
3. **Phase 4**: Fix charts rendering
4. **Phase 5**: Verify analytics accuracy
5. **Phase 6**: Fix real-time updates
6. **Phase 7**: Handle errors gracefully
7. **Phase 8**: Database cleanup
8. **Phase 9**: Performance optimization
9. **Phase 10**: Advanced analytics implementation

---

## Timeline

- **Debugging (Phases 1-9)**: Systematic testing and fixes
- **Advanced Analytics (Phase 10)**: Feature implementation per existing plan
