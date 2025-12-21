# Live Sector Rotation Implementation - Complete ✅

## Overview
Implemented a comprehensive **live sector rotation tracking system** that uses real data from Alpha Vantage, Financial Modeling Prep (FMP), and Polygon.io APIs to track money flow between market sectors.

## What Is Sector Rotation?
Sector rotation is an investment strategy that tracks money flow by observing which sectors receive increased investor interest (inflows) and which experience decreased interest (outflows). It helps identify:
- Which sectors are "hot" (receiving capital)
- Which sectors are "cold" (losing capital)
- Current economic cycle stage
- Optimal sector allocation strategies

## APIs Integrated

### 1. **Alpha Vantage**
- **Endpoint**: `SECTOR` function
- **Usage**: Real-time sector performance rankings
- **Limit**: 25 requests/day
- **API Key**: `1S2UQSH44L0953E5`

### 2. **Financial Modeling Prep (FMP)**
- **Endpoints**:
  - `/api/v3/quote/{symbol}` - Real-time quotes
  - `/api/v3/historical-price-full/{symbol}` - Historical data
- **Usage**: Detailed sector ETF data (price, volume, market cap)
- **Limit**: 250 requests/day
- **API Key**: `nKxGNnbkLs6VUjVsbeKTlQF4UPKyvPbG`

### 3. **Polygon.io**
- **Endpoint**: `/v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}`
- **Usage**: High-quality OHLCV data with VWAP
- **Limit**: Free tier rate limits
- **API Key**: `fJ_RyjvXyIH6aeVHdqvxbpi0op6fFK9b`

## Sector ETFs Tracked

The system tracks 11 major sector ETFs:

| Sector | ETF Symbol | Description |
|--------|-----------|-------------|
| Technology | XLK | Technology Select Sector SPDR Fund |
| Financials | XLF | Financial Select Sector SPDR Fund |
| Healthcare | XLV | Health Care Select Sector SPDR Fund |
| Energy | XLE | Energy Select Sector SPDR Fund |
| Industrials | XLI | Industrial Select Sector SPDR Fund |
| Consumer Staples | XLP | Consumer Staples Select Sector SPDR Fund |
| Consumer Discretionary | XLY | Consumer Discretionary Select Sector SPDR Fund |
| Communication Services | XLC | Communication Services Select Sector SPDR Fund |
| Real Estate | XLRE | Real Estate Select Sector SPDR Fund |
| Materials | XLB | Materials Select Sector SPDR Fund |
| Utilities | XLU | Utilities Select Sector SPDR Fund |

## Backend Implementation

### 1. **Service Layer** (`/backend/src/services/sectorRotation.js`)

#### Key Functions:

**`fetchSectorPerformanceFromAlphaVantage()`**
- Fetches real-time sector performance rankings
- Returns normalized sector performance data

**`fetchSectorETFDataFromFMP(symbol)`**
- Gets quote and historical data for each sector ETF
- Calculates momentum and money flow indicators

**`fetchSectorDataFromPolygon(symbol)`**
- Fetches OHLCV data with VWAP
- Provides additional validation data

**`calculateMomentum(historicalData)`**
```javascript
// Weighted momentum: 70% short-term (5d), 30% medium-term (20d)
const momentum5d = ((current - day5) / day5) * 100;
const momentum20d = ((current - day20) / day20) * 100;
return (momentum5d * 0.7) + (momentum20d * 0.3);
```

**`calculateMoneyFlow(historicalData, currentVolume)`**
```javascript
// Money flow = volume ratio * price change
const volumeRatio = currentVolume / avgVolume;
const priceChange = ((current - day5) / day5) * 100;
return volumeRatio * priceChange;
```

**`getSectorRotationData()`**
- **Main orchestration function**
- Fetches data from all 3 APIs in parallel
- Calculates:
  - Momentum scores
  - Money flow indicators
  - Flow direction (Strong Inflow, Inflow, Neutral, Outflow, Strong Outflow)
  - Rotation signals (Strong Buy, Buy, Hold, Sell, Strong Sell)
  - Economic cycle stage
  - Rotation pairs (from sector → to sector)

**`determineEconomicCycle(sectors)`**
- Analyzes sector performance to identify current economic stage
- Stages: Early Cycle, Mid Cycle, Late Cycle, Recession
- Each stage has favored sectors:
  - **Early Cycle**: Financials, Consumer Discretionary, Industrials, Technology
  - **Mid Cycle**: Technology, Real Estate, Industrials, Materials
  - **Late Cycle**: Energy, Materials, Industrials
  - **Recession**: Consumer Staples, Utilities, Healthcare, Communication Services

### 2. **API Routes** (`/backend/src/routes/sectorRotation.js`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sector-rotation/current` | GET | Get live sector rotation data with money flow analysis |
| `/api/sector-rotation/history` | GET | Get historical rotation patterns (last N days) |
| `/api/sector-rotation/sector/:sectorName` | GET | Get detailed data for a specific sector |
| `/api/sector-rotation/refresh` | POST | Force refresh sector rotation data |

### 3. **Database Schema**

Three tables store rotation data:

**SectorData** - Current sector snapshot
```sql
- sectorName TEXT
- sectorCode TEXT (ETF symbol)
- currentPrice REAL
- change REAL
- changePercent REAL
- volume INTEGER
- marketCap REAL
- ytdReturn REAL
- updatedAt DATETIME
```

**SectorPerformance** - Historical daily performance
```sql
- sectorName TEXT
- sectorCode TEXT
- date DATETIME
- open, high, low, close REAL
- volume INTEGER
- returnPct REAL
- momentumScore REAL
```

**SectorRotation** - Rotation events
```sql
- fromSector TEXT
- toSector TEXT
- date DATETIME
- flowAmount REAL
- flowPercent REAL
- reason TEXT (strength: Very Strong, Strong, Moderate, Weak)
```

## Frontend Implementation

### 1. **Route Handler** (`/frontend/src/server.ts`)

```typescript
app.get('/sector-rotation', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const rotationData = await apiFetch('/sector-rotation/current', token);

  res.render('pages/sector-rotation', {
    pageTitle: 'Sector Rotation',
    data: rotationData.error ? null : rotationData.data,
    fmt: { /* formatting helpers */ }
  });
});
```

### 2. **Visualization Page** (`/frontend/views/pages/sector-rotation.ejs`)

#### Components:

**1. Economic Cycle Indicator**
- Visual indicator showing current cycle stage
- Ring highlight on active stage
- Displays favored sectors for current stage

**2. Top Inflows Card**
- Top 3 sectors receiving capital
- Money flow value
- Flow direction indicator

**3. Top Outflows Card**
- Top 3 sectors losing capital
- Money flow value (negative)
- Flow direction indicator

**4. Active Rotation Pairs**
- Grid of rotation pairs (from sector → to sector)
- Rotation strength (Very Strong, Strong, Moderate, Weak)
- Color-coded by strength

**5. All Sectors Table**
- Complete sector list with:
  - Current price
  - Daily change %
  - Momentum score
  - Money flow value
  - Flow direction badge
  - Rotation signal badge (Strong Buy, Buy, Hold, Sell, Strong Sell)

## How It Works

### Data Flow:

```
1. Frontend Request
   ↓
2. Frontend Server (/sector-rotation route)
   ↓
3. Backend API (/api/sector-rotation/current)
   ↓
4. Sector Rotation Service
   ├─→ Alpha Vantage (sector performance)
   ├─→ FMP (ETF quotes + historical)
   └─→ Polygon.io (OHLCV data)
   ↓
5. Calculate:
   - Momentum (5d + 20d weighted)
   - Money Flow (volume ratio × price change)
   - Flow Direction
   - Rotation Signals
   - Economic Cycle Stage
   ↓
6. Save to Database
   ↓
7. Return Data to Frontend
   ↓
8. Render Visualization
```

### Money Flow Calculation Logic:

**Positive Money Flow (Inflow)**:
- Price is increasing AND volume is above average
- Indicates buying pressure

**Negative Money Flow (Outflow)**:
- Price is decreasing OR volume is below average
- Indicates selling pressure

**Flow Direction Thresholds**:
```javascript
if (moneyFlow > 5)  → "Strong Inflow"
if (moneyFlow > 1)  → "Inflow"
if (moneyFlow > -1) → "Neutral"
if (moneyFlow > -5) → "Outflow"
else                → "Strong Outflow"
```

**Rotation Signal Logic**:
```javascript
// Strong Buy: Positive momentum + strong inflow
if (momentum > 2 && moneyFlow > 5) → "Strong Buy"

// Buy: Positive momentum + inflow
if (momentum > 0 && moneyFlow > 1) → "Buy"

// Hold: Mixed or neutral signals
if (abs(momentum) < 2 && abs(moneyFlow) < 2) → "Hold"

// Sell: Negative momentum + outflow
if (momentum < 0 && moneyFlow < -1) → "Sell"

// Strong Sell: Strong negative momentum + strong outflow
if (momentum < -2 && moneyFlow < -5) → "Strong Sell"
```

## Usage

### 1. Access the Page
```
URL: http://localhost:3000/sector-rotation
```

### 2. View Live Data
- Economic cycle stage with confidence level
- Top 3 sectors receiving inflows
- Top 3 sectors experiencing outflows
- Active rotation pairs
- Complete sector breakdown table

### 3. Refresh Data
Click the "REFRESH" button to fetch latest data from all APIs

### 4. Interpret Signals

**Strong Inflow + Strong Buy**:
- Sector is receiving significant capital
- Consider increasing allocation

**Strong Outflow + Strong Sell**:
- Sector is losing capital
- Consider reducing allocation

**Rotation Pairs**:
- Shows where money is moving
- Example: "Energy → Technology" means capital is rotating from Energy into Technology

## Files Created/Modified

### Backend:
1. ✅ `/backend/.env` - Added API keys
2. ✅ `/backend/src/services/sectorRotation.js` - NEW (main service)
3. ✅ `/backend/src/routes/sectorRotation.js` - NEW (API routes)
4. ✅ `/backend/src/server.js` - Registered routes

### Frontend:
1. ✅ `/frontend/src/server.ts` - Added route handler
2. ✅ `/frontend/views/pages/sector-rotation.ejs` - Replaced with live version

### Database:
- ✅ Schema already exists (SectorData, SectorPerformance, SectorRotation)

## API Rate Limits & Best Practices

### Alpha Vantage
- **Limit**: 25 requests/day
- **Strategy**: Cache results, refresh once per hour max
- **Fallback**: Use FMP data if quota exceeded

### FMP
- **Limit**: 250 requests/day
- **Strategy**: Batch ETF requests, 11 symbols × 2 endpoints = 22 calls per refresh
- **Frequency**: Can refresh every ~30 minutes safely

### Polygon.io
- **Limit**: Free tier rate limits
- **Strategy**: Use for validation/supplemental data only
- **Frequency**: Same as FMP

### Recommended Refresh Schedule:
- **Manual refresh**: User-triggered (anytime)
- **Auto refresh**: Every 30-60 minutes during market hours
- **Historical data**: Fetch once daily after market close

## Features Working

- ✅ Live data from 3 APIs (Alpha Vantage, FMP, Polygon.io)
- ✅ Real-time money flow calculations
- ✅ Momentum score tracking (5d + 20d weighted)
- ✅ Economic cycle detection
- ✅ Rotation pair identification
- ✅ Flow direction indicators
- ✅ Rotation signals (Buy/Sell recommendations)
- ✅ Database persistence for historical tracking
- ✅ Professional Bloomberg Terminal UI
- ✅ Mobile responsive design

## Testing

### Test the API Directly:
```bash
# 1. Login to get token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@wealthpilot.com","password":"demo123456"}'

# 2. Get sector rotation data (use token from step 1)
curl http://localhost:4000/api/sector-rotation/current \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test the Frontend:
1. Navigate to: `http://localhost:3000/sector-rotation`
2. Click "REFRESH" to fetch live data
3. Verify all sections populate with real data

## Next Steps (Optional Enhancements)

1. **Automated Refresh**: Add cron job to refresh data every 30min during market hours
2. **Alerts**: Send notifications when strong rotation signals detected
3. **Historical Charts**: Add Chart.js visualizations of money flow trends
4. **Portfolio Alignment**: Show how user's portfolio aligns with rotation signals
5. **Backtesting**: Test historical rotation strategies
6. **AI Analysis**: Use OpenAI to generate rotation commentary

---

**Status**: ✅ **FULLY IMPLEMENTED**
**Integration**: ✅ **Live data from APIs**
**Data Source**: ✅ **Alpha Vantage + FMP + Polygon.io**
**No Hardcoded Values**: ✅ **All calculations use real-time data**

Open `http://localhost:3000/sector-rotation` and enjoy live sector rotation tracking! 🚀
