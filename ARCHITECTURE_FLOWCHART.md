# WealthPilot Pro - Complete Architecture Flowchart

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           WEALTHPILOT PRO ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │   Browser   │────▶│   Frontend  │────▶│   Backend   │────▶│  Database   │  │
│   │   (User)    │◀────│  (Express)  │◀────│   (API)     │◀────│ (PostgreSQL)│  │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘  │
│         │                   │                   │                   │          │
│         │                   │                   │                   │          │
│         ▼                   ▼                   ▼                   ▼          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │  WebSocket  │     │    EJS      │     │  Services   │     │   Redis     │  │
│   │  Real-time  │     │  Templates  │     │  (70+ files)│     │   Cache     │  │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘  │
│                                                 │                              │
│                                                 ▼                              │
│                                    ┌────────────────────────┐                  │
│                                    │   External APIs        │                  │
│                                    │ • Yahoo Finance        │                  │
│                                    │ • Finnhub              │                  │
│                                    │ • Alpha Vantage        │                  │
│                                    │ • OpenAI/Claude        │                  │
│                                    └────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. MARKET SECTION

### Market Dashboard Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           MARKET DASHBOARD                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Request                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │ /dashboard  │───▶│ market.js   │───▶│ unifiedMarketData.js            │  │
│  │ (EJS Page)  │    │ (Routes)    │    │ (Service)                       │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────────────┘  │
│                            │                        │                        │
│                            │                        ▼                        │
│                            │           ┌────────────────────────┐           │
│                            │           │ Data Providers:        │           │
│                            │           │ 1. Yahoo Finance (1st) │           │
│                            │           │ 2. Finnhub (2nd)       │           │
│                            │           │ 3. FMP (3rd)           │           │
│                            │           │ 4. Alpha Vantage (4th) │           │
│                            │           └────────────────────────┘           │
│                            ▼                                                 │
│                 ┌─────────────────────────┐                                 │
│                 │     API Endpoints       │                                 │
│                 │ GET /api/market/indices │                                 │
│                 │ GET /api/market/sectors │                                 │
│                 │ GET /api/market/quote   │                                 │
│                 └─────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Market Breadth Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           MARKET BREADTH                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐         ┌──────────────────┐                          │
│  │ market-breadth   │────────▶│ marketBreadth.js │                          │
│  │ .ejs             │         │ (Routes)         │                          │
│  └──────────────────┘         └────────┬─────────┘                          │
│                                        │                                     │
│                                        ▼                                     │
│                          ┌─────────────────────────┐                        │
│                          │ MarketBreadthService.js │                        │
│                          │ • Advance/Decline Line  │                        │
│                          │ • Up/Down Volume        │                        │
│                          │ • New Highs/Lows        │                        │
│                          │ • Cumulative Breadth    │                        │
│                          └─────────────────────────┘                        │
│                                        │                                     │
│                          ┌─────────────┴─────────────┐                      │
│                          ▼                           ▼                      │
│                 ┌─────────────────┐       ┌─────────────────┐              │
│                 │ LiveDataFetcher │       │ market_advance  │              │
│                 │ (Real-time)     │       │ _decline (Table)│              │
│                 └─────────────────┘       └─────────────────┘              │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/market-breadth/advance-decline/:index                           │
│  • GET /api/market-breadth/up-down-volume/:index                            │
│  • GET /api/market-breadth/cumulative-breadth/:index                        │
│  • GET /api/market-breadth/new-highs-lows/:index                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Top Movers Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TOP MOVERS                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐       ┌─────────────┐       ┌──────────────────────┐    │
│  │ market-movers  │──────▶│ market.js   │──────▶│ marketData.js        │    │
│  │ .ejs           │       │ (Routes)    │       │ (Service)            │    │
│  └────────────────┘       └─────────────┘       └──────────────────────┘    │
│                                                          │                   │
│                                                          ▼                   │
│                                              ┌────────────────────────┐     │
│                                              │ Yahoo Finance API      │     │
│                                              │ • Gainers             │     │
│                                              │ • Losers              │     │
│                                              │ • Most Active         │     │
│                                              └────────────────────────┘     │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/market/movers                                                   │
│  • GET /api/market/gainers                                                  │
│  • GET /api/market/losers                                                   │
│  • GET /api/market/most-active                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Market Sentiment Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           MARKET SENTIMENT                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐       ┌──────────────┐       ┌─────────────────────┐    │
│  │ sentiment.ejs  │──────▶│ sentiment.js │──────▶│ sentimentService.js │    │
│  └────────────────┘       │ (Routes)     │       └─────────────────────┘    │
│                           └──────────────┘                 │                │
│                                                            ▼                │
│                                              ┌─────────────────────────┐    │
│                                              │ Analysis Components:    │    │
│                                              │ • Social Media Sentiment│    │
│                                              │ • News Sentiment        │    │
│                                              │ • Fear & Greed Index    │    │
│                                              │ • Put/Call Ratio        │    │
│                                              └─────────────────────────┘    │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/sentiment/analysis/:symbol                                      │
│  • GET /api/sentiment/social/:symbol                                        │
│  • GET /api/sentiment/news/:symbol                                          │
│  • GET /api/sentiment/fear-greed                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. SECTORS SECTION

### Sector Overview Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SECTOR OVERVIEW                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐       ┌───────────────────┐                             │
│  │ sectors.ejs    │──────▶│ sectorAnalysis.js │                             │
│  │ sector-        │       │ (Routes)          │                             │
│  │ analysis.ejs   │       └─────────┬─────────┘                             │
│  └────────────────┘                 │                                        │
│                                     ▼                                        │
│                    ┌────────────────────────────────┐                       │
│                    │ advanced/sectorAnalysis.js     │                       │
│                    │ (Service)                      │                       │
│                    │ • Calculate sector performance │                       │
│                    │ • Compare vs S&P 500           │                       │
│                    │ • Historical trends            │                       │
│                    └────────────────────────────────┘                       │
│                                     │                                        │
│                    ┌────────────────┴────────────────┐                      │
│                    ▼                                 ▼                      │
│        ┌─────────────────────┐         ┌─────────────────────────┐         │
│        │ Sector ETFs         │         │ CompanyProfile Table    │         │
│        │ XLK, XLV, XLF, etc. │         │ (sector field)          │         │
│        └─────────────────────┘         └─────────────────────────┘         │
│                                                                              │
│  11 Sector ETFs Tracked:                                                    │
│  XLK (Tech), XLV (Health), XLF (Finance), XLY (Consumer Disc.),            │
│  XLC (Communication), XLI (Industrial), XLP (Consumer Staples),            │
│  XLE (Energy), XLU (Utilities), XLRE (Real Estate), XLB (Materials)        │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/sector-analysis/sectors                                         │
│  • GET /api/sector-analysis/performance?period=1M                           │
│  • GET /api/sector-analysis/portfolio/:portfolioId                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Sector Rotation Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SECTOR ROTATION                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐       ┌──────────────────┐                           │
│  │ sector-rotation   │──────▶│ sectorRotation.js│                           │
│  │ .ejs              │       │ (Routes)         │                           │
│  └───────────────────┘       └────────┬─────────┘                           │
│                                       │                                      │
│                                       ▼                                      │
│                        ┌──────────────────────────────┐                     │
│                        │ sectorRotation.js (Service)  │                     │
│                        │ • Momentum calculations      │                     │
│                        │ • Money flow analysis        │                     │
│                        │ • Relative strength          │                     │
│                        │ • Business cycle mapping     │                     │
│                        └──────────────────────────────┘                     │
│                                       │                                      │
│                                       ▼                                      │
│                        ┌──────────────────────────────┐                     │
│                        │ Business Cycle Phases:       │                     │
│                        │ 1. Early Recovery → Tech     │                     │
│                        │ 2. Mid Cycle → Industrials   │                     │
│                        │ 3. Late Cycle → Energy       │                     │
│                        │ 4. Recession → Utilities     │                     │
│                        └──────────────────────────────┘                     │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/sector-rotation/current                                         │
│  • GET /api/sector-rotation/history?days=30                                 │
│  • GET /api/sector-rotation/sector/:sectorName                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Sector Heatmap Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SECTOR HEATMAP                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐       ┌──────────────────┐                           │
│  │ sector-heatmap    │──────▶│ sectorHeatmap.js │                           │
│  │ .ejs              │       │ (Routes)         │                           │
│  └───────────────────┘       └────────┬─────────┘                           │
│                                       │                                      │
│                                       ▼                                      │
│                        ┌──────────────────────────────┐                     │
│                        │ sectorHeatmapFast.js         │                     │
│                        │ (Service - Optimized)        │                     │
│                        │ • Yahoo Finance integration  │                     │
│                        │ • Color-coded performance    │                     │
│                        │ • Real-time updates          │                     │
│                        └──────────────────────────────┘                     │
│                                       │                                      │
│                                       ▼                                      │
│                        ┌──────────────────────────────┐                     │
│                        │ Visualization:               │                     │
│                        │ • Green = Positive %         │                     │
│                        │ • Red = Negative %           │                     │
│                        │ • Size = Market Cap          │                     │
│                        └──────────────────────────────┘                     │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/sector-heatmap/current                                          │
│  • POST /api/sector-heatmap/refresh                                         │
│  • GET /api/sector-heatmap/historical/:symbol                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### ETF Analyzer Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ETF ANALYZER                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐       ┌──────────────────┐                           │
│  │ etf-analyzer.ejs  │──────▶│ etfAnalyzer.js   │                           │
│  └───────────────────┘       │ (Routes)         │                           │
│                              └────────┬─────────┘                           │
│                                       │                                      │
│                                       ▼                                      │
│                        ┌──────────────────────────────┐                     │
│                        │ etfAnalyzer.js (Service)     │                     │
│                        │ • ETF profile data           │                     │
│                        │ • Holdings breakdown         │                     │
│                        │ • Expense ratio comparison   │                     │
│                        │ • Overlap analysis           │                     │
│                        └──────────────────────────────┘                     │
│                                                                              │
│  Features:                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Profile     │  │ Holdings    │  │ Expenses    │  │ Overlap     │        │
│  │ AUM, Yield  │  │ Top 10      │  │ vs Peers    │  │ vs Your     │        │
│  │ Category    │  │ Sectors     │  │ Over Time   │  │ Portfolio   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/etf-analyzer/search?query=SPY                                   │
│  • GET /api/etf-analyzer/profile/:symbol                                    │
│  • GET /api/etf-analyzer/holdings/:symbol                                   │
│  • GET /api/etf-analyzer/overlap/:symbols                                   │
│  • GET /api/etf-analyzer/expenses/:symbol                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. CALENDAR SECTION

### Economic Calendar Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ECONOMIC CALENDAR                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌─────────────────────┐                     │
│  │ economic-calendar    │──────▶│ economicCalendar.js │                     │
│  │ .ejs                 │       │ (Routes)            │                     │
│  └──────────────────────┘       └──────────┬──────────┘                     │
│                                            │                                 │
│                                            ▼                                 │
│                           ┌───────────────────────────────┐                 │
│                           │ economicCalendar.js (Service) │                 │
│                           │ • GDP releases                │                 │
│                           │ • Employment reports          │                 │
│                           │ • Fed meetings                │                 │
│                           │ • CPI/PPI data                │                 │
│                           │ • Consumer confidence         │                 │
│                           └───────────────────────────────┘                 │
│                                            │                                 │
│                                            ▼                                 │
│                           ┌───────────────────────────────┐                 │
│                           │ Event Impact Levels:          │                 │
│                           │ • HIGH (Fed, GDP, Jobs)       │                 │
│                           │ • MEDIUM (CPI, Retail)        │                 │
│                           │ • LOW (Weekly claims)         │                 │
│                           └───────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/economic-calendar                                               │
│  • GET /api/economic-calendar/today                                         │
│  • GET /api/economic-calendar/upcoming                                      │
│  • GET /api/economic-calendar/by-country/:country                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Earnings Calendar Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         EARNINGS CALENDAR                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌─────────────────────┐                     │
│  │ earnings-calendar    │──────▶│ earningsCalendar.js │                     │
│  │ .ejs                 │       │ (Routes)            │                     │
│  └──────────────────────┘       └──────────┬──────────┘                     │
│                                            │                                 │
│                                            ▼                                 │
│                           ┌───────────────────────────────┐                 │
│                           │ earningsCalendar.js (Service) │                 │
│                           │ • Earnings dates              │                 │
│                           │ • EPS estimates               │                 │
│                           │ • Revenue estimates           │                 │
│                           │ • Historical beats/misses     │                 │
│                           └───────────────────────────────┘                 │
│                                            │                                 │
│                                            ▼                                 │
│                           ┌───────────────────────────────┐                 │
│                           │ Database: EarningsCalendar    │                 │
│                           │ • symbol, reportDate          │                 │
│                           │ • epsEstimate, epsActual      │                 │
│                           │ • revEstimate, revActual      │                 │
│                           │ • fiscalQuarter, fiscalYear   │                 │
│                           └───────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/earnings-calendar/upcoming?days=30                              │
│  • GET /api/earnings-calendar/:symbol                                       │
│  • GET /api/earnings-calendar/stats                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dividend Calendar Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DIVIDEND CALENDAR                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ dividend-calendar    │──────▶│ dividends.js      │                       │
│  │ .ejs                 │       │ (Routes)          │                       │
│  └──────────────────────┘       └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ dividendCalendar.js (Service)  │                 │
│                          │ • Ex-dividend dates            │                 │
│                          │ • Record dates                 │                 │
│                          │ • Payment dates                │                 │
│                          │ • Dividend amounts             │                 │
│                          └────────────────────────────────┘                 │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database: DividendHistory      │                 │
│                          │ • symbol, exDate, payDate      │                 │
│                          │ • recordDate, amount           │                 │
│                          │ • frequency (quarterly/annual) │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/dividends/calendar                                              │
│  • GET /api/dividends/income?portfolioId=xxx&year=2024                      │
│  • GET /api/dividends/history/:symbol                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### IPO Tracker Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           IPO TRACKER                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ ipo-tracker.ejs      │──────▶│ ipoCalendar.js    │                       │
│  └──────────────────────┘       │ (Routes)          │                       │
│                                 └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ ipoCalendar.js (Service)       │                 │
│                          │ • Upcoming IPOs                │                 │
│                          │ • IPO pricing range            │                 │
│                          │ • Expected shares              │                 │
│                          │ • Recent IPO performance       │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/ipo-calendar/upcoming                                           │
│  • GET /api/ipo-calendar/recent                                             │
│  • GET /api/ipo-calendar/performance/:symbol                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### SPAC Tracker Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SPAC TRACKER                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ spac-tracker.ejs     │──────▶│ spacTracker.js    │                       │
│  └──────────────────────┘       │ (Routes)          │                       │
│                                 └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ spacTracker.js (Service)       │                 │
│                          │ • Active SPACs                 │                 │
│                          │ • SPAC merger announcements    │                 │
│                          │ • Trust value tracking         │                 │
│                          │ • Redemption deadlines         │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/spac-tracker/active                                             │
│  • GET /api/spac-tracker/deals                                              │
│  • GET /api/spac-tracker/upcoming                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. PORTFOLIO SECTION

### Portfolio Dashboard Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         PORTFOLIO DASHBOARD                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ dashboard.ejs        │──────▶│ portfolios.js     │                       │
│  │ (Multiple versions)  │       │ (Routes)          │                       │
│  └──────────────────────┘       └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        DATA AGGREGATION                                │ │
│  │                                                                        │ │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌───────────┐  │ │
│  │  │ marketData  │   │ analytics   │   │ dashboard   │   │ portfolio │  │ │
│  │  │ .js         │   │ .js         │   │ Service.js  │   │ DataHelper│  │ │
│  │  │             │   │             │   │             │   │ .js       │  │ │
│  │  │ • Prices    │   │ • Returns   │   │ • Layout    │   │ • Calcs   │  │ │
│  │  │ • Changes   │   │ • Metrics   │   │ • Prefs     │   │ • Totals  │  │ │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └───────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database Models:               │                 │
│                          │ • Portfolio (metadata)         │                 │
│                          │ • Holding (positions)          │                 │
│                          │ • PortfolioSnapshot (history)  │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/portfolios                                                      │
│  • GET /api/portfolios/:id                                                  │
│  • POST /api/portfolios                                                     │
│  • PUT /api/portfolios/:id                                                  │
│  • DELETE /api/portfolios/:id                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Holdings Management Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         HOLDINGS MANAGEMENT                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ holdings.ejs         │──────▶│ holdings.js       │                       │
│  └──────────────────────┘       │ (Routes)          │                       │
│                                 └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        HOLDING OPERATIONS                              │ │
│  │                                                                        │ │
│  │  User Action          API Call                    Service              │ │
│  │  ───────────────────────────────────────────────────────────────────   │ │
│  │  View Holdings   ──▶  GET /api/holdings         ──▶ marketData.js     │ │
│  │  Add Position    ──▶  POST /api/holdings        ──▶ Create in DB      │ │
│  │  Edit Position   ──▶  PUT /api/holdings/:id     ──▶ Update in DB      │ │
│  │  Delete Position ──▶  DELETE /api/holdings/:id  ──▶ Remove from DB    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database: Holding              │                 │
│                          │ • id, portfolioId, symbol      │                 │
│                          │ • shares, avgCost              │                 │
│                          │ • sector, industry             │                 │
│                          │ • createdAt, updatedAt         │                 │
│                          └────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Performance Attribution Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       PERFORMANCE ATTRIBUTION                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────────┐                  │
│  │ attribution.ejs      │──────▶│ advancedAnalytics.js   │                  │
│  └──────────────────────┘       │ (Routes)               │                  │
│                                 └──────────┬─────────────┘                  │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ performanceAttribution.js         │                │
│                        │ (Service)                         │                │
│                        │ • Brinson Attribution Model       │                │
│                        │ • Allocation Effect               │                │
│                        │ • Selection Effect                │                │
│                        │ • Interaction Effect              │                │
│                        └───────────────────────────────────┘                │
│                                            │                                 │
│                        ┌───────────────────┴───────────────────┐            │
│                        ▼                                       ▼            │
│             ┌─────────────────────┐              ┌─────────────────────┐   │
│             │ Your Portfolio      │              │ Benchmark (SPY)     │   │
│             │ • Weight per sector │              │ • Weight per sector │   │
│             │ • Return per sector │              │ • Return per sector │   │
│             └─────────────────────┘              └─────────────────────┘   │
│                                                                              │
│  Attribution Formula:                                                        │
│  Total Active Return = Allocation + Selection + Interaction                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/advanced-analytics/performance-attribution                      │
│  • GET /api/advanced-analytics/excess-return                                │
│  • GET /api/advanced-analytics/drawdown-analysis                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Watchlist Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             WATCHLIST                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ snapshot.ejs         │──────▶│ watchlist.js      │                       │
│  │ (Watchlist view)     │       │ (Routes)          │                       │
│  └──────────────────────┘       └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ marketData.js (Service)        │                 │
│                          │ • Enrich with current prices   │                 │
│                          │ • Calculate day change         │                 │
│                          │ • Add volume data              │                 │
│                          └────────────────────────────────┘                 │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database:                      │                 │
│                          │ • Watchlist (container)        │                 │
│                          │ • WatchlistItem (symbols)      │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/watchlist                                                       │
│  • POST /api/watchlist                                                      │
│  • DELETE /api/watchlist/:id                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tax Lots Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             TAX LOTS                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ tax-lots.ejs         │──────▶│ holdings.js       │                       │
│  └──────────────────────┘       │ portfolioTools.js │                       │
│                                 └─────────┬─────────┘                       │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ taxLossHarvesting.js (Service) │                 │
│                          │ • FIFO/LIFO/SpecificID         │                 │
│                          │ • Cost basis tracking          │                 │
│                          │ • Wash sale detection          │                 │
│                          │ • Tax loss opportunities       │                 │
│                          └────────────────────────────────┘                 │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database: TaxLot               │                 │
│                          │ • holdingId, purchaseDate      │                 │
│                          │ • shares, costBasis            │                 │
│                          │ • adjustedBasis                │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Tax Lot Methods:                                                            │
│  • FIFO (First In, First Out)                                               │
│  • LIFO (Last In, First Out)                                                │
│  • HIFO (Highest In, First Out)                                             │
│  • Specific Identification                                                   │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/tax-lots?portfolioId=xxx                                        │
│  • GET /api/portfolio-tools/tax-loss-harvesting/opportunities               │
│  • POST /api/portfolio-tools/tax-loss-harvesting/execute                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. ACTIVITY SECTION

### Transactions Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           TRANSACTIONS                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ portfolio-history    │──────▶│ transactions.js   │                       │
│  │ .ejs                 │       │ (Routes)          │                       │
│  └──────────────────────┘       └─────────┬─────────┘                       │
│                                           │                                  │
│  Transaction Types:                       │                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐   │                                  │
│  │  BUY    │  │  SELL   │  │DIVIDEND │   │                                  │
│  └─────────┘  └─────────┘  └─────────┘   │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database: Transaction          │                 │
│                          │ • id, portfolioId, holdingId   │                 │
│                          │ • type (BUY/SELL/DIVIDEND)     │                 │
│                          │ • symbol, shares, price        │                 │
│                          │ • commission, executedAt       │                 │
│                          │ • notes                        │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/transactions?page=1&limit=50                                    │
│  • POST /api/transactions                                                   │
│  • PUT /api/transactions/:id                                                │
│  • DELETE /api/transactions/:id                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Import Wizard Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           IMPORT WIZARD                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────────┐                  │
│  │ import.ejs           │──────▶│ portfolioUpload.js     │                  │
│  └──────────────────────┘       │ (Routes)               │                  │
│                                 └──────────┬─────────────┘                  │
│                                            │                                 │
│  Supported Formats:                        │                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │                                 │
│  │  CSV    │  │  XLSX   │  │  QIF    │    │                                 │
│  └─────────┘  └─────────┘  └─────────┘    │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ portfolioUploadService.js         │                │
│                        │ (Service)                         │                │
│                        │                                   │                │
│                        │ Step 1: Upload File               │                │
│                        │         ↓                         │                │
│                        │ Step 2: Parse & Validate          │                │
│                        │         ↓                         │                │
│                        │ Step 3: Map Columns               │                │
│                        │         ↓                         │                │
│                        │ Step 4: Preview Data              │                │
│                        │         ↓                         │                │
│                        │ Step 5: Import to Portfolio       │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/portfolio-upload/validate                                      │
│  • POST /api/portfolio-upload/process                                       │
│  • GET /api/portfolio-upload/templates                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. FUNDAMENTALS SECTION

### Research & Fundamentals Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      RESEARCH & FUNDAMENTALS                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ research.ejs         │──────▶│ fundamentals.js   │                       │
│  │ financials.ejs       │       │ research.js       │                       │
│  │ gross-margin.ejs     │       │ (Routes)          │                       │
│  │ margin-expansion.ejs │       └─────────┬─────────┘                       │
│  │ valuation.ejs        │                 │                                  │
│  │ + 20 more pages      │                 │                                  │
│  └──────────────────────┘                 │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ fundamentalAnalysis.js         │                 │
│                          │ (Service)                      │                 │
│                          │                                │                 │
│                          │ Metrics Calculated:            │                 │
│                          │ • Gross Margin                 │                 │
│                          │ • Operating Margin             │                 │
│                          │ • Net Margin                   │                 │
│                          │ • ROE, ROA, ROIC               │                 │
│                          │ • Debt/Equity                  │                 │
│                          │ • Current Ratio                │                 │
│                          │ • Interest Coverage            │                 │
│                          │ • P/E, P/B, P/S                │                 │
│                          │ • EV/EBITDA                    │                 │
│                          └────────────────────────────────┘                 │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database:                      │                 │
│                          │ • CompanyProfile               │                 │
│                          │ • FinancialStatement           │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Fundamental Pages (24 total):                                              │
│  ┌────────────────┬────────────────┬────────────────┬────────────────┐      │
│  │ Gross Margin   │ Price to Sales │ Working Capital│ Peer Compare   │      │
│  │ Margin Expand  │ Debt Maturity  │ Revenue Break  │ Analyst Rating │      │
│  │ Rev/Employee   │ Interest Cover │ Capital Return │ Insider Trade  │      │
│  │ Cash Flow      │ Debt Analysis  │ Governance     │ Buybacks       │      │
│  │ Valuation      │ Liquidity      │ Corp Actions   │ Inst. Flow     │      │
│  └────────────────┴────────────────┴────────────────┴────────────────┘      │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/fundamentals/:symbol                                            │
│  • GET /api/fundamentals/:symbol/ratios                                     │
│  • GET /api/fundamentals/:symbol/margins                                    │
│  • GET /api/research/search/:symbol                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. TECHNICAL SECTION

### Technical Analysis Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       TECHNICAL ANALYSIS                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ technicals.ejs       │──────▶│ technicals.js     │                       │
│  │ moving-averages.ejs  │       │ (Routes)          │                       │
│  │ macd.ejs             │       └─────────┬─────────┘                       │
│  │ bollinger-bands.ejs  │                 │                                  │
│  │ fibonacci.ejs        │                 │                                  │
│  │ volume-profile.ejs   │                 │                                  │
│  │ momentum.ejs         │                 │                                  │
│  └──────────────────────┘                 │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ technicalAnalysis.js (Service) │                 │
│                          │                                │                 │
│                          │ Indicators:                    │                 │
│                          │ ┌─────────────────────────────┐│                 │
│                          │ │ Trend:                      ││                 │
│                          │ │ • SMA (5, 10, 20, 50, 200)  ││                 │
│                          │ │ • EMA (12, 26)              ││                 │
│                          │ │ • MACD (12, 26, 9)          ││                 │
│                          │ │ • ADX (14)                  ││                 │
│                          │ └─────────────────────────────┘│                 │
│                          │ ┌─────────────────────────────┐│                 │
│                          │ │ Momentum:                   ││                 │
│                          │ │ • RSI (14)                  ││                 │
│                          │ │ • Stochastic (14, 3, 3)     ││                 │
│                          │ │ • Williams %R               ││                 │
│                          │ │ • CCI (20)                  ││                 │
│                          │ └─────────────────────────────┘│                 │
│                          │ ┌─────────────────────────────┐│                 │
│                          │ │ Volatility:                 ││                 │
│                          │ │ • Bollinger Bands (20, 2)   ││                 │
│                          │ │ • ATR (14)                  ││                 │
│                          │ │ • Keltner Channel           ││                 │
│                          │ └─────────────────────────────┘│                 │
│                          │ ┌─────────────────────────────┐│                 │
│                          │ │ Volume:                     ││                 │
│                          │ │ • OBV                       ││                 │
│                          │ │ • Volume SMA                ││                 │
│                          │ │ • VWAP                      ││                 │
│                          │ └─────────────────────────────┘│                 │
│                          │ ┌─────────────────────────────┐│                 │
│                          │ │ Support/Resistance:         ││                 │
│                          │ │ • Fibonacci (23.6%-78.6%)   ││                 │
│                          │ │ • Pivot Points              ││                 │
│                          │ │ • Volume Profile            ││                 │
│                          │ └─────────────────────────────┘│                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/technicals/:symbol                                              │
│  • GET /api/technicals/:symbol/rsi                                          │
│  • GET /api/technicals/:symbol/macd                                         │
│  • GET /api/technicals/:symbol/bollinger-bands                              │
│  • GET /api/technicals/:symbol/fibonacci                                    │
│  • GET /api/technicals/:symbol/volume-profile                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. OPTIONS SECTION

### Options Analysis Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        OPTIONS ANALYSIS                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ options-chain.ejs    │──────▶│ options.js        │                       │
│  │ options-greeks.ejs   │       │ (Routes)          │                       │
│  │ options-straddle.ejs │       └─────────┬─────────┘                       │
│  │ iv-surface.ejs       │                 │                                  │
│  └──────────────────────┘                 │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ optionsAnalysis.js (Service)   │                 │
│                          │                                │                 │
│                          │ Black-Scholes Model:           │                 │
│                          │ C = S*N(d1) - K*e^(-rT)*N(d2)  │                 │
│                          │                                │                 │
│                          │ Where:                         │                 │
│                          │ d1 = [ln(S/K)+(r+σ²/2)T]/σ√T   │                 │
│                          │ d2 = d1 - σ√T                  │                 │
│                          └────────────────────────────────┘                 │
│                                           │                                  │
│                          ┌────────────────┴────────────────┐                │
│                          ▼                                 ▼                │
│             ┌─────────────────────┐         ┌─────────────────────┐        │
│             │ Greeks Calculated   │         │ Strategies          │        │
│             │ • Delta (Δ)         │         │ • Straddle          │        │
│             │ • Gamma (Γ)         │         │ • Strangle          │        │
│             │ • Theta (Θ)         │         │ • Iron Condor       │        │
│             │ • Vega (ν)          │         │ • Butterfly         │        │
│             │ • Rho (ρ)           │         │ • Calendar Spread   │        │
│             └─────────────────────┘         └─────────────────────┘        │
│                                                                              │
│  IV Surface:                                                                 │
│  ┌────────────────────────────────────────────────────┐                     │
│  │     Strike    │  30 DTE  │  60 DTE  │  90 DTE     │                     │
│  │    ──────────────────────────────────────         │                     │
│  │     90%       │   28%    │   26%    │   25%       │                     │
│  │    100% (ATM) │   22%    │   23%    │   24%       │                     │
│  │    110%       │   25%    │   24%    │   24%       │                     │
│  │    (Volatility Smile)                             │                     │
│  └────────────────────────────────────────────────────┘                     │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/options/:symbol/chain                                           │
│  • GET /api/options/:symbol/greeks                                          │
│  • GET /api/options/:symbol/straddle                                        │
│  • GET /api/options/:symbol/iv-surface                                      │
│  • GET /api/options/:symbol/strategies                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. INCOME SECTION

### Dividend Analysis Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        DIVIDEND ANALYSIS                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌───────────────────┐                       │
│  │ dividends.ejs        │──────▶│ dividends.js      │                       │
│  │ dividend-screener    │       │ dividendAnalysis  │                       │
│  │ dividend-growth.ejs  │       │ (Routes)          │                       │
│  │ dividend-yield       │       └─────────┬─────────┘                       │
│  │ -curve.ejs           │                 │                                  │
│  │ drip-calculator      │                 │                                  │
│  └──────────────────────┘                 │                                  │
│                                           ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        DIVIDEND SERVICES                               │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐  │ │
│  │  │ dividendAnalysis│   │ dividendCalendar│   │ dividendForecasting │  │ │
│  │  │ .js             │   │ .js             │   │ .js                 │  │ │
│  │  │                 │   │                 │   │                     │  │ │
│  │  │ • Yield calc    │   │ • Ex-dates      │   │ • Future projections│  │ │
│  │  │ • Growth rate   │   │ • Pay dates     │   │ • DRIP calculations │  │ │
│  │  │ • Payout ratio  │   │ • Record dates  │   │ • Reinvestment      │  │ │
│  │  │ • Safety score  │   │ • Amount        │   │ • Compound growth   │  │ │
│  │  │ • CAGR          │   │ • Frequency     │   │                     │  │ │
│  │  └─────────────────┘   └─────────────────┘   └─────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  DRIP Calculator Formula:                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ FV = P × [(1 + r)^n - 1] / r × (1 + r)                                 │ │
│  │                                                                        │ │
│  │ Where:                                                                 │ │
│  │ FV = Future Value                                                      │ │
│  │ P  = Annual dividend payment                                           │ │
│  │ r  = Dividend growth rate                                              │ │
│  │ n  = Number of years                                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/dividends/calendar                                              │
│  • GET /api/dividends/income?year=2024                                      │
│  • GET /api/dividends/analysis/:symbol                                      │
│  • GET /api/dividends/screener?minYield=3                                   │
│  • POST /api/portfolio-tools/dividend-calculator/simulate                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. RISK SECTION

### Risk Analysis Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          RISK ANALYSIS                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ stress-test.ejs      │──────▶│ riskAnalysis.js    │                      │
│  │ concentration-risk   │       │ advancedAnalytics  │                      │
│  │ .ejs                 │       │ (Routes)           │                      │
│  └──────────────────────┘       └──────────┬─────────┘                      │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ riskAnalysis.js (Service)         │                │
│                        │                                   │                │
│                        │ Risk Metrics:                     │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ VaR (Value at Risk)           │ │                │
│                        │ │ • 95% confidence level        │ │                │
│                        │ │ • 1-day, 10-day horizons      │ │                │
│                        │ │ • Historical simulation       │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ CVaR (Conditional VaR)        │ │                │
│                        │ │ • Expected loss beyond VaR    │ │                │
│                        │ │ • Tail risk measurement       │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ Stress Testing                │ │                │
│                        │ │ • 2008 Financial Crisis       │ │                │
│                        │ │ • COVID Crash (Mar 2020)      │ │                │
│                        │ │ • Tech Bubble (2000)          │ │                │
│                        │ │ • Custom scenarios            │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ Correlation Matrix            │ │                │
│                        │ │ • Pairwise correlations       │ │                │
│                        │ │ • Diversification benefit     │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Factor Analysis:                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Fama-French Factors:                                                   │ │
│  │ • Market (Beta)          - Exposure to overall market                  │ │
│  │ • Size (SMB)             - Small vs Large cap exposure                 │ │
│  │ • Value (HML)            - Value vs Growth exposure                    │ │
│  │ • Momentum (WML)         - Winners vs Losers exposure                  │ │
│  │ • Quality (RMW)          - Robust vs Weak profitability                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/risk-analysis/portfolio-risk                                    │
│  • GET /api/risk-analysis/var                                               │
│  • GET /api/risk-analysis/cvar                                              │
│  • GET /api/risk-analysis/stress-test                                       │
│  • GET /api/risk-analysis/correlation                                       │
│  • GET /api/risk-analysis/factor-exposure                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### ESG Analysis Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ESG ANALYSIS                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ esg-ratings.ejs      │──────▶│ advancedAnalytics  │                      │
│  │ esg-breakdown.ejs    │       │ (Routes)           │                      │
│  └──────────────────────┘       └──────────┬─────────┘                      │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ esgAnalysis.js (Service)          │                │
│                        │                                   │                │
│                        │ ESG Components:                   │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ E - Environmental             │ │                │
│                        │ │ • Carbon emissions            │ │                │
│                        │ │ • Energy efficiency           │ │                │
│                        │ │ • Waste management            │ │                │
│                        │ │ • Water usage                 │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ S - Social                    │ │                │
│                        │ │ • Employee relations          │ │                │
│                        │ │ • Diversity & inclusion       │ │                │
│                        │ │ • Community impact            │ │                │
│                        │ │ • Customer satisfaction       │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        │ ┌───────────────────────────────┐ │                │
│                        │ │ G - Governance                │ │                │
│                        │ │ • Board composition           │ │                │
│                        │ │ • Executive compensation      │ │                │
│                        │ │ • Shareholder rights          │ │                │
│                        │ │ • Business ethics             │ │                │
│                        │ └───────────────────────────────┘ │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/advanced-analytics/esg-analysis                                 │
│  • GET /api/advanced-analytics/esg-score/:symbol                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. TRADING SECTION

### Stock Scanner Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          STOCK SCANNER                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ scanner.ejs          │──────▶│ stockSearch.js     │                      │
│  └──────────────────────┘       │ (Routes)           │                      │
│                                 └──────────┬─────────┘                      │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ Screening Criteria:               │                │
│                        │                                   │                │
│                        │ Fundamental:                      │                │
│                        │ • P/E ratio range                 │                │
│                        │ • Market cap range                │                │
│                        │ • Dividend yield minimum          │                │
│                        │ • Revenue growth %                │                │
│                        │ • Profit margin %                 │                │
│                        │                                   │                │
│                        │ Technical:                        │                │
│                        │ • Price above/below MA            │                │
│                        │ • RSI range                       │                │
│                        │ • Volume vs average               │                │
│                        │ • 52-week high/low distance       │                │
│                        │                                   │                │
│                        │ Sectors:                          │                │
│                        │ • Filter by sector/industry       │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/scanner/search                                                  │
│  • POST /api/scanner/custom-screen                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Backtest & Paper Trading Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BACKTEST & PAPER TRADING                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ backtest.ejs         │──────▶│ trading.js         │                      │
│  │ paper-trading.ejs    │       │ (Routes)           │                      │
│  └──────────────────────┘       └──────────┬─────────┘                      │
│                                            │                                 │
│                        ┌───────────────────┴───────────────────┐            │
│                        ▼                                       ▼            │
│             ┌─────────────────────┐              ┌─────────────────────┐   │
│             │ strategyEngine.js   │              │ backtestingService  │   │
│             │ (Service)           │              │ .js (Service)       │   │
│             │                     │              │                     │   │
│             │ • Create strategy   │              │ • Historical data   │   │
│             │ • Define rules      │              │ • Simulate trades   │   │
│             │ • Entry/Exit logic  │              │ • Calculate returns │   │
│             │ • Position sizing   │              │ • Risk metrics      │   │
│             └─────────────────────┘              └─────────────────────┘   │
│                                                                              │
│  Backtest Results:                                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Total Return                  • Sharpe Ratio                         │ │
│  │ • Annualized Return             • Sortino Ratio                        │ │
│  │ • Max Drawdown                  • Win Rate                             │ │
│  │ • Volatility                    • Profit Factor                        │ │
│  │ • Alpha vs Benchmark            • Average Trade Duration               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/trading/strategies                                             │
│  • POST /api/trading/backtest                                               │
│  • GET /api/trading/backtest/:id                                            │
│  • GET /api/trading/paper-portfolio                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. PLANNING SECTION

### Goals & Rebalancing Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      GOALS & REBALANCING                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ goals.ejs            │──────▶│ portfolioTools.js  │                      │
│  │ retirement.ejs       │       │ (Routes)           │                      │
│  │ position-sizing.ejs  │       └──────────┬─────────┘                      │
│  │ calculators.ejs      │                  │                                 │
│  └──────────────────────┘                  │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ portfolioRebalancing.js (Service) │                │
│                        │                                   │                │
│                        │ Rebalancing Strategies:           │                │
│                        │ • Calendar (Monthly/Quarterly)    │                │
│                        │ • Threshold (5% drift trigger)    │                │
│                        │ • Tactical (based on signals)     │                │
│                        │                                   │                │
│                        │ Optimization Methods:             │                │
│                        │ • Mean-Variance (Markowitz)       │                │
│                        │ • Risk Parity                     │                │
│                        │ • Maximum Sharpe Ratio            │                │
│                        │ • Minimum Volatility              │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Position Sizing Methods:                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Fixed Dollar Amount                                                  │ │
│  │ • Fixed Percentage of Portfolio                                        │ │
│  │ • Kelly Criterion: f* = (p*b - q) / b                                  │ │
│  │ • Volatility-Based (ATR method)                                        │ │
│  │ • Risk-Per-Trade (% of portfolio at risk)                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/portfolio-tools/goals/create                                   │
│  • GET /api/portfolio-tools/rebalancing/analyze                             │
│  • POST /api/portfolio-tools/rebalancing/execute                            │
│  • POST /api/portfolio-tools/position-sizing                                │
│  • POST /api/portfolio-tools/optimize                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. ALERTS SECTION

### Alerts & Notifications Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ALERTS & NOTIFICATIONS                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ alerts.ejs           │──────▶│ alerts.js          │                      │
│  │ alerts-history.ejs   │       │ (Routes)           │                      │
│  └──────────────────────┘       └──────────┬─────────┘                      │
│                                            │                                 │
│                        ┌───────────────────┴───────────────────┐            │
│                        ▼                                       ▼            │
│             ┌─────────────────────┐              ┌─────────────────────┐   │
│             │ alertService.js     │              │ priceAlertsService  │   │
│             │ (Service)           │              │ .js (Service)       │   │
│             │                     │              │                     │   │
│             │ • Create alert      │              │ • Monitor prices    │   │
│             │ • Alert types       │              │ • Check conditions  │   │
│             │ • Notification      │              │ • Trigger alerts    │   │
│             │ • Email/Push        │              │ • Cron job: */5 *   │   │
│             └─────────────────────┘              └─────────────────────┘   │
│                                                                              │
│  Alert Types:                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Price Above/Below                                                    │ │
│  │ • Percent Change (daily/weekly)                                        │ │
│  │ • Volume Spike                                                         │ │
│  │ • RSI Overbought/Oversold                                              │ │
│  │ • Moving Average Cross                                                 │ │
│  │ • Earnings Date                                                        │ │
│  │ • Dividend Ex-Date                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                           │                                  │
│                                           ▼                                  │
│                          ┌────────────────────────────────┐                 │
│                          │ Database: Alert                │                 │
│                          │ • userId, symbol, type         │                 │
│                          │ • condition, value             │                 │
│                          │ • isActive, isTriggered        │                 │
│                          │ • lastTriggeredAt              │                 │
│                          └────────────────────────────────┘                 │
│                                                                              │
│  Endpoints:                                                                  │
│  • GET /api/alerts?page=1                                                   │
│  • POST /api/alerts                                                         │
│  • PUT /api/alerts/:id                                                      │
│  • DELETE /api/alerts/:id                                                   │
│  • GET /api/alerts/history                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. AI & COMMUNITY SECTION

### AI Assistant Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          AI ASSISTANT                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ Chat Widget          │──────▶│ aiChat.js          │                      │
│  │ (All pages)          │       │ (Routes)           │                      │
│  └──────────────────────┘       └──────────┬─────────┘                      │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ unifiedAIService.js (Service)     │                │
│                        │                                   │                │
│                        │ Providers:                        │                │
│                        │ • Claude (Anthropic) - Primary    │                │
│                        │ • OpenAI GPT-4 - Fallback         │                │
│                        │                                   │                │
│                        │ Features:                         │                │
│                        │ • Streaming responses (SSE)       │                │
│                        │ • Context-aware (portfolio)       │                │
│                        │ • Financial domain prompts        │                │
│                        │ • Multi-turn conversations        │                │
│                        └───────────────────────────────────┘                │
│                                            │                                 │
│                                            ▼                                 │
│                        ┌───────────────────────────────────┐                │
│                        │ financialPrompts.js               │                │
│                        │                                   │                │
│                        │ Specialized prompts for:          │                │
│                        │ • Portfolio analysis              │                │
│                        │ • Stock research                  │                │
│                        │ • Technical analysis              │                │
│                        │ • Risk assessment                 │                │
│                        │ • Market commentary               │                │
│                        └───────────────────────────────────┘                │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/ai/chat/stream (SSE streaming)                                 │
│  • GET /api/ai/chat/history/:sessionId                                      │
│  • POST /api/ai/chat/context                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### AI Reports Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           AI REPORTS                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐       ┌────────────────────┐                      │
│  │ Report Generator     │──────▶│ aiReports.js       │                      │
│  └──────────────────────┘       │ (Routes)           │                      │
│                                 └──────────┬─────────┘                      │
│                                            │                                 │
│                        ┌───────────────────┴───────────────────┐            │
│                        ▼                                       ▼            │
│             ┌─────────────────────┐              ┌─────────────────────┐   │
│             │ aiReportService.js  │              │ professionalReport  │   │
│             │ (Service)           │              │ Generator.js        │   │
│             │                     │              │                     │   │
│             │ • Generate analysis │              │ • PDF generation    │   │
│             │ • Structure report  │              │ • Chart embedding   │   │
│             │ • AI insights       │              │ • Formatting        │   │
│             └─────────────────────┘              └─────────────────────┘   │
│                                                                              │
│  Report Types:                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Portfolio Analysis Report                                            │ │
│  │ • Stock Research Report                                                │ │
│  │ • Market Outlook Report                                                │ │
│  │ • Risk Assessment Report                                               │ │
│  │ • Dividend Income Report                                               │ │
│  │ • Tax Planning Report                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/ai-reports/generate                                            │
│  • GET /api/ai-reports/:id/download                                         │
│  • GET /api/ai-reports/list                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. DATABASE SCHEMA

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          CORE MODELS                                    ││
│  │                                                                         ││
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   ││
│  │  │    User     │────▶│  Portfolio  │────▶│       Holding           │   ││
│  │  │             │     │             │     │                         │   ││
│  │  │ • id        │     │ • id        │     │ • id                    │   ││
│  │  │ • email     │     │ • userId    │     │ • portfolioId           │   ││
│  │  │ • password  │     │ • name      │     │ • symbol                │   ││
│  │  │ • plan      │     │ • currency  │     │ • shares                │   ││
│  │  └─────────────┘     │ • benchmark │     │ • avgCost               │   ││
│  │        │             └─────────────┘     └─────────────────────────┘   ││
│  │        │                   │                        │                  ││
│  │        ▼                   ▼                        ▼                  ││
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   ││
│  │  │  Session    │     │ Transaction │     │       TaxLot            │   ││
│  │  │             │     │             │     │                         │   ││
│  │  │ • token     │     │ • type      │     │ • purchaseDate          │   ││
│  │  │ • expiresAt │     │ • shares    │     │ • costBasis             │   ││
│  │  └─────────────┘     │ • price     │     │ • adjustedBasis         │   ││
│  │                      └─────────────┘     └─────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        MARKET DATA MODELS                               ││
│  │                                                                         ││
│  │  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   ││
│  │  │   StockQuote    │     │  StockHistory   │     │ CompanyProfile  │   ││
│  │  │                 │     │                 │     │                 │   ││
│  │  │ • symbol        │     │ • symbol        │     │ • symbol        │   ││
│  │  │ • price         │     │ • date          │     │ • name          │   ││
│  │  │ • change        │     │ • open, high    │     │ • sector        │   ││
│  │  │ • volume        │     │ • low, close    │     │ • industry      │   ││
│  │  │ • marketCap     │     │ • volume        │     │ • marketCap     │   ││
│  │  └─────────────────┘     └─────────────────┘     └─────────────────┘   ││
│  │                                                                         ││
│  │  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   ││
│  │  │ DividendHistory │     │EarningsCalendar │     │  Financials     │   ││
│  │  │                 │     │                 │     │                 │   ││
│  │  │ • symbol        │     │ • symbol        │     │ • symbol        │   ││
│  │  │ • exDate        │     │ • reportDate    │     │ • period        │   ││
│  │  │ • payDate       │     │ • epsEstimate   │     │ • revenue       │   ││
│  │  │ • amount        │     │ • epsActual     │     │ • netIncome     │   ││
│  │  └─────────────────┘     └─────────────────┘     └─────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      USER PREFERENCES MODELS                            ││
│  │                                                                         ││
│  │  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   ││
│  │  │   Watchlist     │     │     Alert       │     │  UserSettings   │   ││
│  │  │                 │     │                 │     │                 │   ││
│  │  │ • userId        │     │ • userId        │     │ • userId        │   ││
│  │  │ • name          │     │ • symbol        │     │ • theme         │   ││
│  │  │ • items[]       │     │ • type          │     │ • currency      │   ││
│  │  └─────────────────┘     │ • condition     │     │ • timezone      │   ││
│  │                          └─────────────────┘     └─────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 16. AUTHENTICATION FLOW

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       AUTHENTICATION FLOW                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REGISTRATION:                                                               │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐    │
│  │   User     │────▶│  Frontend  │────▶│  Backend   │────▶│  Database  │    │
│  │ (Browser)  │     │ /register  │     │ /api/auth/ │     │   User     │    │
│  │            │     │            │     │ register   │     │   Table    │    │
│  └────────────┘     └────────────┘     └────────────┘     └────────────┘    │
│                                               │                              │
│                                               ▼                              │
│                                  ┌────────────────────────┐                 │
│                                  │ Creates:               │                 │
│                                  │ • User record          │                 │
│                                  │ • UserSettings         │                 │
│                                  │ • Default Portfolio    │                 │
│                                  │ • Default Watchlist    │                 │
│                                  └────────────────────────┘                 │
│                                                                              │
│  LOGIN:                                                                      │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐    │
│  │   User     │────▶│  Frontend  │────▶│  Backend   │────▶│   Verify   │    │
│  │            │     │  /login    │     │ /api/auth/ │     │  Password  │    │
│  │            │     │            │     │   login    │     │  (bcrypt)  │    │
│  └────────────┘     └────────────┘     └────────────┘     └────────────┘    │
│                                               │                              │
│                                               ▼                              │
│                                  ┌────────────────────────┐                 │
│                                  │ Returns:               │                 │
│                                  │ • JWT Token            │                 │
│                                  │ • User data            │                 │
│                                  │ • HttpOnly Cookie      │◀── SECURED!    │
│                                  │   (httpOnly: true)     │                 │
│                                  └────────────────────────┘                 │
│                                                                              │
│  AUTHENTICATED REQUEST:                                                      │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐    │
│  │   User     │────▶│  Frontend  │────▶│ Middleware │────▶│  API       │    │
│  │ (Cookie)   │     │ /api/*     │     │ auth.js    │     │  Handler   │    │
│  │            │     │            │     │            │     │            │    │
│  └────────────┘     └────────────┘     └────────────┘     └────────────┘    │
│                                               │                              │
│                                  ┌────────────┴────────────┐                │
│                                  ▼                         ▼                │
│                          ┌─────────────┐          ┌─────────────┐           │
│                          │ Valid Token │          │Invalid Token│           │
│                          │ → Continue  │          │ → 401 Error │           │
│                          └─────────────┘          └─────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. REAL-TIME DATA FLOW

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       REAL-TIME DATA FLOW                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        WEBSOCKET CONNECTION                             ││
│  │                                                                         ││
│  │  ┌────────────┐     ┌────────────────┐     ┌────────────────────┐      ││
│  │  │  Browser   │◀───▶│  WebSocket     │◀───▶│  Market Data       │      ││
│  │  │            │     │  Service       │     │  Service           │      ││
│  │  │            │     │  (ws://       │     │                    │      ││
│  │  │            │     │   :4000/ws)    │     │                    │      ││
│  │  └────────────┘     └────────────────┘     └────────────────────┘      ││
│  │                                                     │                   ││
│  │                                                     ▼                   ││
│  │                                        ┌────────────────────────┐       ││
│  │                                        │ External Data Sources  │       ││
│  │                                        │ • Yahoo Finance        │       ││
│  │                                        │ • Finnhub              │       ││
│  │                                        │ • Alpha Vantage        │       ││
│  │                                        └────────────────────────┘       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        CRON JOBS (Scheduled)                            ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────────┐  ││
│  │  │ */5 9-16 * * 1-5  │ Update stock quotes (market hours)          │  ││
│  │  │ 30 16 * * 1-5     │ Daily portfolio snapshots (4:30 PM ET)      │  ││
│  │  │ */5 * * * *       │ Check price alerts                          │  ││
│  │  │ 0 0 * * *         │ Daily cleanup and maintenance               │  ││
│  │  └──────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        CACHING LAYER                                    ││
│  │                                                                         ││
│  │  ┌────────────┐     ┌────────────┐     ┌────────────────────────┐      ││
│  │  │  Request   │────▶│   Redis    │────▶│  If Cache Miss:        │      ││
│  │  │            │     │   Cache    │     │  → Fetch from API      │      ││
│  │  │            │◀────│   (TTL:    │◀────│  → Store in Cache      │      ││
│  │  │            │     │   5 min)   │     │  → Return to Client    │      ││
│  │  └────────────┘     └────────────┘     └────────────────────────┘      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## SUMMARY STATISTICS

| Category | Count |
|----------|-------|
| **Frontend Pages** | 176 EJS templates |
| **Backend Routes** | 54 route files |
| **Services** | 70+ service files |
| **Database Models** | 20+ models |
| **API Endpoints** | 200+ endpoints |
| **External APIs** | 5 (Yahoo, Finnhub, Alpha Vantage, FMP, OpenAI/Claude) |

---

## FILE LOCATIONS

| Component | Location |
|-----------|----------|
| Frontend Pages | `/frontend/views/pages/*.ejs` |
| Frontend Routes | `/frontend/src/server.ts` |
| Backend Routes | `/backend/src/routes/*.js` |
| Services | `/backend/src/services/*.js` |
| Advanced Services | `/backend/src/services/advanced/*.js` |
| Database | `/backend/prisma/schema.prisma` |
| Middleware | `/backend/src/middleware/*.js` |
| Config | `/backend/src/config/*.js` |

---

*Document generated: December 29, 2025*
*Version: v31.0.0-live-market-data*
