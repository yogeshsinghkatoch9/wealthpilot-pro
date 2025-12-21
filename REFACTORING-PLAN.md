# 🔧 WealthPilot Pro - Complete Refactoring Plan

## Current Issues Found:
1. ❌ Multiple test files in root directories
2. ❌ .bak files (outdated backups)
3. ❌ Demo/sample data in services
4. ❌ Unorganized folder structure
5. ❌ No Excel export functionality
6. ❌ Mixed use of live/mock data

---

## Target Architecture:

```
wealthpilot-pro-v27-complete/
├── backend/
│   ├── src/
│   │   ├── core/              # Core business logic (NEW)
│   │   │   ├── portfolio/
│   │   │   ├── analytics/
│   │   │   ├── market-data/
│   │   │   └── trading/
│   │   ├── services/          # External API integrations
│   │   ├── routes/            # API endpoints
│   │   ├── middleware/        # Auth, validation, etc.
│   │   ├── models/            # Database models
│   │   ├── utils/             # Helpers, formatters
│   │   └── exports/           # Excel export functionality (NEW)
│   ├── database/              # Local SQLite database (NEW)
│   ├── tests/                 # Organized test suite
│   └── scripts/               # Utility scripts
├── frontend/
│   ├── src/
│   │   ├── components/        # React/UI components
│   │   ├── pages/             # Page logic
│   │   └── utils/
│   ├── views/
│   │   ├── pages/
│   │   └── partials/
│   └── public/
└── docs/                      # Documentation (NEW)
```

---

## Phase 1: Cleanup (30 min)

### Files to DELETE:
```bash
# Test files in root (move to tests/)
./test-api.js
./backend/test-*.js (all test files)
./test-all-features.js

# Backup files
./frontend/public/js/dashboard-customization.js.bak
./frontend/views/pages/portfolios.ejs.bak
./backend/src/routes/portfolioUpload.js.bak
./backend/src/routes/research.js.bak

# Old/deprecated files
./frontend/views/pages/etf-analyzer-old.ejs

# Demo data generators
./backend/scripts/create-demo-data.js
./backend/seed-demo-breadth-data.js
```

### Files to MOVE:
```bash
# Move all test-*.js to backend/tests/manual/
backend/test-*.js → backend/tests/manual/

# Move sample data
backend/test-data/* → backend/tests/fixtures/
```

---

## Phase 2: Live Data Migration (1 hour)

### Services to Update:
1. **earnings Calendar** (`src/services/earningsCalendar.js`)
   - Remove: Mock data generation
   - Add: Live Finnhub/FMP API integration
   - Add: Excel export

2. **IPO Calendar** (`src/services/ipoCalendar.js`)
   - Remove: Mock data
   - Add: Live API calls
   - Add: Excel export

3. **Market Features** (`src/routes/features.js`)
   - Remove: Mock price variations (line 445)
   - Add: Live price from Yahoo Finance
   - Remove: Mock dividend data (line 1337)
   - Add: Live dividend API
   - Remove: Mock currency rates (line 1471)
   - Add: Live forex API

4. **Research** (`src/routes/research.js`)
   - Update: News API integration (line 644)
   - Add: Real news from Alpha Vantage/NewsAPI

5. **Trading** (`src/routes/trading.js`)
   - Remove: Mock data fetcher (line 165)
   - Add: Live market data integration

---

## Phase 3: Database Setup (45 min)

### Local SQLite Database:
```sql
-- Create tables for all market data
CREATE TABLE live_prices (
  id INTEGER PRIMARY KEY,
  symbol TEXT,
  price REAL,
  change REAL,
  change_percent REAL,
  volume INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_breadth (
  id INTEGER PRIMARY KEY,
  index_symbol TEXT,
  health_score INTEGER,
  signal TEXT,
  advancing INTEGER,
  declining INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tables for all 11 dashboard components
CREATE TABLE earnings_calendar (...);
CREATE TABLE dividend_calendar (...);
CREATE TABLE ipo_calendar (...);
CREATE TABLE sector_rotation (...);
-- etc.
```

### Export Scripts:
- `src/exports/excelExporter.js` - Main export class
- `src/exports/templates/` - Excel templates
- API endpoint: `GET /api/exports/:type` - Download Excel

---

## Phase 4: Modular Architecture (1 hour)

### Core Modules:

**1. Portfolio Module** (`src/core/portfolio/`)
```
portfolio/
├── index.js
├── portfolioManager.js
├── holdingsCalculator.js
├── performanceTracker.js
└── rebalancer.js
```

**2. Analytics Module** (`src/core/analytics/`)
```
analytics/
├── index.js
├── riskCalculator.js
├── returnCalculator.js
├── attributionAnalyzer.js
└── metricsAggregator.js
```

**3. Market Data Module** (`src/core/market-data/`)
```
market-data/
├── index.js
├── priceService.js
├── breadthAnalyzer.js
├── sentimentAnalyzer.js
└── sectorAnalyzer.js
```

**4. Trading Module** (`src/core/trading/`)
```
trading/
├── index.js
├── orderExecutor.js
├── strategyEngine.js
├── backtester.js
└── riskManager.js
```

---

## Phase 5: Excel Export Implementation

### Export Features:
1. **Real-time Data Exports**
   - Market Dashboard → `market_dashboard_[timestamp].xlsx`
   - All 11 components in separate sheets
   - Auto-refresh every N minutes

2. **Portfolio Exports**
   - Holdings with live prices
   - Performance metrics
   - Transaction history
   - Risk analysis

3. **Market Analysis Exports**
   - Sector analysis
   - Breadth indicators
   - Sentiment scores
   - Rotation patterns

### Excel Format:
```
Sheet 1: Summary
Sheet 2: Market Breadth (live data)
Sheet 3: Sentiment (live data)
Sheet 4: Sectors (live data)
...
Sheet 12: Formulas & Calculations
```

---

## Phase 6: Testing Strategy

### Test Each Module Independently:
```bash
# Test portfolio module
npm test -- core/portfolio

# Test analytics module
npm test -- core/analytics

# Test market data module
npm test -- core/market-data

# Test integration
npm test -- integration

# Test full system
npm test
```

---

## Execution Order:

### Step 1: Backup Everything
```bash
cp -r wealthpilot-pro-v27-complete wealthpilot-pro-v27-BACKUP-$(date +%Y%m%d)
```

### Step 2: Clean Up Files
```bash
# Run cleanup script
node scripts/cleanup.js
```

### Step 3: Migrate to Live Data
```bash
# Update each service one by one
# Test after each update
```

### Step 4: Set Up Local Database
```bash
node scripts/setup-local-db.js
```

### Step 5: Create Excel Exports
```bash
node scripts/create-exports.js
```

### Step 6: Reorganize Code
```bash
node scripts/reorganize.js
```

### Step 7: Test Everything
```bash
npm run test:all
```

### Step 8: Run Production
```bash
npm start
```

---

## Timeline:
- Phase 1 (Cleanup): 30 minutes
- Phase 2 (Live Data): 1 hour
- Phase 3 (Database): 45 minutes
- Phase 4 (Modular): 1 hour
- Phase 5 (Excel): 45 minutes
- Phase 6 (Testing): 30 minutes

**Total: ~4.5 hours**

---

## Success Criteria:
✅ No demo/mock data anywhere
✅ All 11 components use live APIs
✅ Local database operational
✅ Excel exports working
✅ Clean, organized code structure
✅ All tests passing
✅ System running smoothly

Ready to execute? (Y/N)
