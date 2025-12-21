# Dashboard Separation Plan

## Problem
Portfolio Dashboard (/) and Market pages are showing overlapping/similar content. Need clear separation.

---

## Solution: Two Distinct Dashboards

### 1. **PORTFOLIO DASHBOARD** (`/` or `/dashboard`)
**Purpose**: Track YOUR personal portfolio performance

**Content (ONLY portfolio-specific data):**

#### Top Section - Portfolio Summary
- Total Portfolio Value
- Today's P&L ($ and %)
- Total P&L ($ and %)
- Cash Balance
- Portfolio Selector (switch between portfolios)

#### Key Metrics Row
- Total Return %
- Sharpe Ratio
- Max Drawdown
- Beta (vs S&P 500)
- Dividend Yield

#### Holdings Table
- Symbol, Shares, Avg Cost, Current Price, Value, P/L, Weight%
- Sortable by any column
- Click symbol to view stock details

#### Charts (4-6 key charts)
1. **Portfolio Value Over Time** - Line chart showing your portfolio growth
2. **Asset Allocation** - Pie/donut chart of your holdings by sector
3. **Top 10 Holdings** - Bar chart of largest positions
4. **Performance vs Benchmark** - Line chart comparing your portfolio to S&P 500
5. **P&L by Holding** - Bar chart showing which stocks are winning/losing
6. **Drawdown Chart** - Your portfolio's drawdown over time

#### Quick Actions
- Upload Portfolio
- Add Manual Holding
- Rebalance Portfolio
- Generate Report
- View Transactions

**What NOT to include:**
- ❌ Market indices (SPY, QQQ, DIA) - that's market data
- ❌ Sector performance of the overall market
- ❌ Top gainers/losers in the market
- ❌ Market breadth indicators
- ❌ Economic indicators

---

### 2. **MARKET DASHBOARD** (`/market`)
**Purpose**: Track overall market conditions and trends

**Content (ONLY market-wide data):**

#### Top Section - Market Indices
- S&P 500 (SPY)
- Nasdaq (QQQ)
- Dow Jones (DIA)
- Russell 2000 (IWM)
- VIX (Volatility Index)
Each showing: Current Price, Change $, Change %, Chart

#### Market Overview
- Market Status (Open/Closed/Pre-market/After-hours)
- Trading Volume vs Average
- Advance/Decline Ratio
- New Highs / New Lows
- Market Breadth Score

#### Sector Performance
- All 11 S&P sectors with heat map
- Technology, Healthcare, Financials, Energy, etc.
- Show % change for day/week/month

#### Market Movers
- **Top Gainers** (5-10 stocks with biggest % gains)
- **Top Losers** (5-10 stocks with biggest % losses)
- **Most Active** (highest volume stocks)

#### Charts (4-6 key charts)
1. **Market Indices** - Multi-line chart of SPY, QQQ, DIA
2. **Sector Heatmap** - Visual heatmap of sector performance
3. **Market Breadth** - Advance/Decline line over time
4. **VIX Chart** - Volatility trend
5. **Volume Analysis** - Market volume vs average
6. **Economic Calendar** - Upcoming events (Fed meetings, earnings, etc.)

#### Market Sentiment Indicators
- Fear & Greed Index
- Put/Call Ratio
- Market Momentum Score
- Bull/Bear Sentiment %

#### Quick Links
- View All Sectors
- Market Movers
- Economic Calendar
- Market News
- Screener

**What NOT to include:**
- ❌ User's portfolio holdings
- ❌ User's P&L
- ❌ User's asset allocation
- ❌ User-specific performance metrics

---

## Implementation Plan

### Step 1: Clean Up Portfolio Dashboard (`/`)
File: `/frontend/views/pages/dashboard.ejs`
- Remove any market-wide data (if present)
- Focus 100% on user's portfolio
- Show portfolio selector at top
- Display holdings table prominently
- Show portfolio-specific charts only

### Step 2: Create Market Dashboard (`/market`)
File: `/frontend/views/pages/market.ejs` (NEW)
- Create new page focused on market data
- Show major indices at top
- Display sector performance
- Include market movers
- Add market breadth indicators
- Show market sentiment

### Step 3: Update Routes
File: `/frontend/src/server.ts`
- Ensure `/` and `/dashboard` route to Portfolio Dashboard
- Create new `/market` route for Market Dashboard
- Fetch appropriate data for each

### Step 4: Update Navigation
File: `/frontend/views/partials/topnav.ejs`
- Under "Markets" menu: Add "Market Dashboard" link
- Under "Portfolio" menu: Keep "Dashboard" link (or rename to "Portfolio Dashboard")
- Ensure clear distinction in menu

---

## Data Sources

### Portfolio Dashboard APIs
```
GET /api/portfolios - Get user's portfolios
GET /api/portfolios/:id/holdings - Get holdings
GET /api/advanced-analytics/performance-attribution
GET /api/advanced-analytics/drawdown-analysis
GET /api/advanced-analytics/concentration-analysis
GET /api/advanced-analytics/risk-decomposition
```

### Market Dashboard APIs
```
GET /api/market/indices - Major market indices
GET /api/market/sectors - Sector performance
GET /api/market/movers - Top gainers/losers
GET /api/market/breadth - Advance/decline data
GET /api/market/sentiment - Market sentiment indicators
```

---

## Visual Distinction

### Portfolio Dashboard Style
- **Color scheme**: Focus on greens (gains) and reds (losses)
- **Header**: "My Portfolio" or "Portfolio Overview"
- **Icon**: Portfolio/briefcase icon
- **Tone**: Personal ("Your holdings", "Your performance")

### Market Dashboard Style
- **Color scheme**: Blues and purples for market data
- **Header**: "Market Overview" or "Market Dashboard"
- **Icon**: Globe/chart icon
- **Tone**: Global ("Market is up", "Sector performance")

---

## Success Criteria

✅ Portfolio Dashboard shows ONLY user's portfolio data
✅ Market Dashboard shows ONLY market-wide data
✅ No overlapping content between the two
✅ Clear navigation between both
✅ Each dashboard serves a distinct purpose
✅ User can quickly access either dashboard from navigation

---

## Key Difference Summary

| Feature | Portfolio Dashboard | Market Dashboard |
|---------|-------------------|------------------|
| **Focus** | MY portfolio | THE market |
| **Data** | My holdings, my P&L | Indices, sectors, movers |
| **Metrics** | My returns, my risk | Market breadth, sentiment |
| **Charts** | My performance | Market trends |
| **Actions** | Add holdings, rebalance | View sectors, screener |
| **Tone** | Personal ("You", "Your") | Global ("Market", "Sector") |

---

This separation creates a clear Bloomberg Terminal-like experience where:
- **Portfolio Dashboard** = Your personal portfolio management center
- **Market Dashboard** = Your market intelligence center
