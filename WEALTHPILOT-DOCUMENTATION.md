# WealthPilot Pro - Complete Technical Documentation

## Version 27 | Last Updated: December 2024

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Application Flow](#4-application-flow)
5. [Data Sources & APIs](#5-data-sources--apis)
6. [Database Schema](#6-database-schema)
7. [Feature Modules](#7-feature-modules)
8. [Financial Formulas](#8-financial-formulas)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Frontend Pages](#10-frontend-pages)
11. [Security Implementation](#11-security-implementation)
12. [Deployment Guide](#12-deployment-guide)

---

## 1. System Overview

### What is WealthPilot?

WealthPilot Pro is a comprehensive financial portfolio management and analysis platform that provides:

- **Portfolio Management**: Track multiple investment portfolios with real-time pricing
- **Technical Analysis**: 50+ technical indicators and chart patterns
- **Fundamental Analysis**: Valuation metrics, earnings analysis, peer comparison
- **Options Analysis**: Greeks, IV surface, straddles, options chain
- **Risk Assessment**: VaR, stress testing, correlation analysis, factor exposure
- **Research Tools**: Insider trading, institutional flow, analyst ratings
- **Dividend Analysis**: Yield tracking, DRIP calculator, dividend screener

### Key Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                      WEALTHPILOT PRO                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PORTFOLIO   │  │  ANALYTICS   │  │   RESEARCH   │          │
│  │  Management  │  │   Engine     │  │    Center    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────────┼─────────────────┘                   │
│                          │                                      │
│                   ┌──────▼───────┐                             │
│                   │   Real-Time  │                             │
│                   │  Market Data │                             │
│                   └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Web Browser (Chrome/Safari/Firefox)           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   Charts    │  │   Tables    │  │   Interactive Forms     │  │   │
│  │  │  (Chart.js) │  │  (Dynamic)  │  │   (Symbol Input, etc.)  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTP/HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND SERVER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Express.js + EJS Templates                    │   │
│  │                         (Port 3000)                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   Routes    │  │  Middleware │  │   Template Rendering    │  │   │
│  │  │  (server.ts)│  │  (Auth,CORS)│  │   (90+ EJS pages)       │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Internal API Calls
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BACKEND API                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Express.js REST API                           │   │
│  │                         (Port 5000)                              │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   Routes    │  │  Services   │  │      Middleware         │  │   │
│  │  │             │  │             │  │                         │  │   │
│  │  │ /api/auth   │  │ MarketData  │  │  - Authentication       │  │   │
│  │  │ /api/research│ │ Analytics   │  │  - Rate Limiting        │  │   │
│  │  │ /api/analytics│ │ Portfolio   │  │  - Error Handling       │  │   │
│  │  │ /api/portfolios│ │ Research    │  │  - Logging              │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────────────────┐
│   SQLite    │ │   Cache     │ │          EXTERNAL APIs                  │
│  Database   │ │  (Memory)   │ │  ┌───────────┐  ┌───────────────────┐  │
│             │ │             │ │  │Yahoo      │  │  Alpha Vantage    │  │
│ - Users     │ │ - Quotes    │ │  │Finance    │  │  (Fundamentals)   │  │
│ - Portfolios│ │ - Profiles  │ │  │(Primary)  │  │                   │  │
│ - Holdings  │ │ - Analytics │ │  └───────────┘  └───────────────────┘  │
│ - Alerts    │ │             │ │  ┌───────────┐  ┌───────────────────┐  │
└─────────────┘ └─────────────┘ │  │ Finnhub   │  │     OpenAI        │  │
                                │  │ (News)    │  │  (AI Insights)    │  │
                                │  └───────────┘  └───────────────────┘  │
                                └─────────────────────────────────────────┘
```

### Directory Structure

```
wealthpilot-pro-v27-complete/
├── backend/                      # Backend API Server
│   ├── src/
│   │   ├── routes/              # API Route Handlers
│   │   │   ├── auth.js          # Authentication routes
│   │   │   ├── portfolios.js    # Portfolio CRUD operations
│   │   │   ├── analytics.js     # Analytics & calculations
│   │   │   ├── research.js      # Stock research endpoints
│   │   │   ├── advancedAnalytics.js  # Advanced features
│   │   │   └── ...
│   │   ├── services/            # Business Logic Services
│   │   │   ├── marketData.js    # Market data fetching
│   │   │   ├── technicalAnalysis.js  # Technical indicators
│   │   │   ├── optionsAnalysis.js    # Options calculations
│   │   │   └── ...
│   │   ├── middleware/          # Express Middleware
│   │   └── index.js             # Server entry point
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   └── data/
│       └── wealthpilot.db       # SQLite database
│
├── frontend/                     # Frontend Server
│   ├── src/
│   │   └── server.ts            # Frontend Express server
│   ├── views/
│   │   ├── pages/               # 90+ EJS page templates
│   │   │   ├── dashboard.ejs
│   │   │   ├── technicals.ejs
│   │   │   ├── options-chain.ejs
│   │   │   └── ...
│   │   └── partials/            # Reusable components
│   │       ├── header.ejs
│   │       ├── footer.ejs
│   │       └── navigation.ejs
│   └── public/
│       ├── css/                 # Stylesheets
│       └── js/                  # Client-side JavaScript
│
└── docs/                        # Documentation
```

---

## 3. Technology Stack

### Backend
| Technology | Purpose | Version |
|------------|---------|---------|
| Node.js | Runtime Environment | 18+ |
| Express.js | Web Framework | 4.x |
| Prisma | ORM / Database | 5.x |
| SQLite | Database | 3.x |
| JWT | Authentication | - |
| bcrypt | Password Hashing | - |

### Frontend
| Technology | Purpose | Version |
|------------|---------|---------|
| Express.js | Server | 4.x |
| EJS | Templating | 3.x |
| Tailwind CSS | Styling | 3.x |
| Chart.js | Charts | 4.x |

### External APIs
| API | Purpose | Rate Limit |
|-----|---------|------------|
| Yahoo Finance | Primary market data | Unlimited |
| Alpha Vantage | Fundamentals, earnings | 5/min (free) |
| Finnhub | News, insider trading | 60/min |
| OpenAI | AI-powered insights | Pay per use |

---

## 4. Application Flow

### User Authentication Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  User   │     │  Frontend   │     │   Backend   │     │ Database │
│ Browser │     │   Server    │     │     API     │     │  SQLite  │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                  │
     │  GET /login     │                   │                  │
     │────────────────>│                   │                  │
     │                 │                   │                  │
     │   Login Page    │                   │                  │
     │<────────────────│                   │                  │
     │                 │                   │                  │
     │ POST /login     │                   │                  │
     │ (email,password)│                   │                  │
     │────────────────>│                   │                  │
     │                 │  POST /api/auth/login               │
     │                 │──────────────────>│                  │
     │                 │                   │  Query User      │
     │                 │                   │─────────────────>│
     │                 │                   │                  │
     │                 │                   │   User Record    │
     │                 │                   │<─────────────────│
     │                 │                   │                  │
     │                 │                   │ Verify Password  │
     │                 │                   │ (bcrypt.compare) │
     │                 │                   │                  │
     │                 │    JWT Token      │                  │
     │                 │<──────────────────│                  │
     │                 │                   │                  │
     │  Set Cookie     │                   │                  │
     │  Redirect /dashboard               │                  │
     │<────────────────│                   │                  │
     │                 │                   │                  │
```

### Data Request Flow (Example: Technical Analysis)

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │     │  Frontend   │     │   Backend   │     │Yahoo Finance│
│ Browser │     │   Server    │     │     API     │     │     API     │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                 │                   │                   │
     │ GET /technicals?symbol=AAPL        │                   │
     │────────────────>│                   │                   │
     │                 │                   │                   │
     │                 │ GET /api/research/technicals/AAPL    │
     │                 │──────────────────>│                   │
     │                 │                   │                   │
     │                 │                   │ Check Cache       │
     │                 │                   │ (if cached, skip) │
     │                 │                   │                   │
     │                 │                   │  Fetch Quote      │
     │                 │                   │──────────────────>│
     │                 │                   │                   │
     │                 │                   │   Quote Data      │
     │                 │                   │<──────────────────│
     │                 │                   │                   │
     │                 │                   │ Calculate:        │
     │                 │                   │ - RSI (14)        │
     │                 │                   │ - MACD            │
     │                 │                   │ - Bollinger       │
     │                 │                   │ - SMAs            │
     │                 │                   │                   │
     │                 │   Technical Data  │                   │
     │                 │<──────────────────│                   │
     │                 │                   │                   │
     │                 │ Render EJS Template                   │
     │                 │ (technicals.ejs)  │                   │
     │                 │                   │                   │
     │   HTML + Charts │                   │                   │
     │<────────────────│                   │                   │
```

### Portfolio Update Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  User   │     │  Frontend   │     │   Backend   │     │ Database │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                  │
     │ Add Stock to Portfolio             │                  │
     │ POST /holdings  │                   │                  │
     │────────────────>│                   │                  │
     │                 │                   │                  │
     │                 │ POST /api/portfolios/:id/holdings   │
     │                 │ { symbol, shares, cost }            │
     │                 │──────────────────>│                  │
     │                 │                   │                  │
     │                 │                   │ Validate Symbol  │
     │                 │                   │ (Check Yahoo)    │
     │                 │                   │                  │
     │                 │                   │ INSERT Holding   │
     │                 │                   │─────────────────>│
     │                 │                   │                  │
     │                 │                   │    Success       │
     │                 │                   │<─────────────────│
     │                 │                   │                  │
     │                 │   Holding Created │                  │
     │                 │<──────────────────│                  │
     │                 │                   │                  │
     │  Redirect to Portfolio             │                  │
     │<────────────────│                   │                  │
```

---

## 5. Data Sources & APIs

### Yahoo Finance (Primary)

**Purpose**: Real-time quotes, historical prices, options data

**Integration**:
```javascript
// backend/src/services/marketData.js
const yahooFinance = require('yahoo-finance2').default;

// Get stock quote
const quote = await yahooFinance.quote(symbol);

// Get historical data
const history = await yahooFinance.chart(symbol, {
  period1: startDate,
  period2: endDate,
  interval: '1d'
});

// Get options chain
const options = await yahooFinance.options(symbol);
```

**Data Retrieved**:
- Current price, change, volume
- 52-week high/low
- Market cap, P/E, EPS
- Options chain with Greeks
- Historical OHLCV data

### Alpha Vantage

**Purpose**: Fundamentals, earnings, company overview

**Endpoints Used**:
```
GET https://www.alphavantage.co/query
  ?function=OVERVIEW&symbol={symbol}&apikey={key}

GET https://www.alphavantage.co/query
  ?function=EARNINGS&symbol={symbol}&apikey={key}

GET https://www.alphavantage.co/query
  ?function=INCOME_STATEMENT&symbol={symbol}&apikey={key}
```

### Finnhub

**Purpose**: News, insider trading, analyst recommendations

**Endpoints Used**:
```
GET https://finnhub.io/api/v1/company-news
  ?symbol={symbol}&from={date}&to={date}&token={key}

GET https://finnhub.io/api/v1/stock/insider-transactions
  ?symbol={symbol}&token={key}
```

---

## 6. Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│      User       │       │    Portfolio    │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │───┐   │ id (PK)         │
│ email           │   │   │ userId (FK)     │◄──┐
│ password (hash) │   └──►│ name            │   │
│ name            │       │ description     │   │
│ createdAt       │       │ createdAt       │   │
└─────────────────┘       └────────┬────────┘   │
                                   │            │
                                   │            │
                          ┌────────▼────────┐   │
                          │    Holding      │   │
                          ├─────────────────┤   │
                          │ id (PK)         │   │
                          │ portfolioId(FK) │───┘
                          │ symbol          │
                          │ shares          │
                          │ costBasis       │
                          │ purchaseDate    │
                          │ sector          │
                          │ createdAt       │
                          └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│     Alert       │       │   Transaction   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ userId (FK)     │       │ holdingId (FK)  │
│ symbol          │       │ type (BUY/SELL) │
│ type            │       │ shares          │
│ targetPrice     │       │ price           │
│ isActive        │       │ date            │
│ createdAt       │       │ fees            │
└─────────────────┘       └─────────────────┘
```

### Prisma Schema

```prisma
// backend/prisma/schema.prisma

model User {
  id        Int         @id @default(autoincrement())
  email     String      @unique
  password  String
  name      String?
  createdAt DateTime    @default(now())
  portfolios Portfolio[]
  alerts    Alert[]
}

model Portfolio {
  id          Int       @id @default(autoincrement())
  name        String
  description String?
  userId      Int
  user        User      @relation(fields: [userId], references: [id])
  holdings    Holding[]
  createdAt   DateTime  @default(now())
}

model Holding {
  id           Int       @id @default(autoincrement())
  symbol       String
  shares       Float
  costBasis    Float
  purchaseDate DateTime?
  sector       String?
  portfolioId  Int
  portfolio    Portfolio @relation(fields: [portfolioId], references: [id])
  transactions Transaction[]
  createdAt    DateTime  @default(now())
}

model Transaction {
  id        Int      @id @default(autoincrement())
  holdingId Int
  holding   Holding  @relation(fields: [holdingId], references: [id])
  type      String   // BUY, SELL, DIVIDEND
  shares    Float
  price     Float
  fees      Float?
  date      DateTime
  createdAt DateTime @default(now())
}

model Alert {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  symbol      String
  type        String   // PRICE_ABOVE, PRICE_BELOW, PCT_CHANGE
  targetPrice Float?
  pctChange   Float?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```

---

## 7. Feature Modules

### 7.1 FUNDAMENTALS Section

| Feature | Description | Data Source |
|---------|-------------|-------------|
| Analytics Dashboard | Portfolio overview, allocation | Internal + Yahoo |
| Gross Margin | Revenue vs COGS analysis | Alpha Vantage |
| Margin Expansion | Historical margin trends | Alpha Vantage |
| Revenue/Employee | Efficiency metrics | Alpha Vantage |
| Price to Sales | P/S ratio analysis | Yahoo Finance |
| Debt Maturity | Debt structure analysis | Alpha Vantage |
| Interest Coverage | EBIT/Interest expense | Alpha Vantage |
| Working Capital | Current assets - liabilities | Alpha Vantage |

### 7.2 TECHNICAL Section

| Feature | Description | Indicators |
|---------|-------------|------------|
| Technical Analysis | Comprehensive TA dashboard | RSI, MACD, BB, SMA |
| Fibonacci Levels | Retracement levels | 23.6%, 38.2%, 50%, 61.8% |
| Bollinger Bands | Volatility bands | 20-period SMA ± 2σ |
| Volume Profile | Volume by price | POC, VAH, VAL |
| Moving Averages | Multiple MA types | SMA, EMA, WMA |
| Stochastic | Momentum oscillator | %K, %D |
| ADX Indicator | Trend strength | ADX, +DI, -DI |
| RSI | Relative Strength Index | 14-period RSI |
| Float Analysis | Share structure | Float, outstanding |
| Short Interest | Short selling data | Short %, days to cover |

### 7.3 OPTIONS Section

| Feature | Description | Calculations |
|---------|-------------|--------------|
| Options Chain | Full options chain | Bid/Ask, Volume, OI |
| Options Greeks | Delta, Gamma, Theta, Vega | Black-Scholes |
| Straddles | ATM straddle analysis | Call + Put premium |
| IV Surface | 3D IV visualization | Strike × Expiration |

### 7.4 INCOME Section

| Feature | Description | Metrics |
|---------|-------------|---------|
| Dividends | Dividend analysis | Yield, payout ratio |
| Dividend Screener | Filter by yield, growth | Multi-factor |
| Yield Curve | Historical yield trend | 1Y, 3Y, 5Y |
| Payout Ratio | Earnings vs dividends | DPS/EPS |
| DRIP Calculator | Dividend reinvestment | Compound growth |
| Projections | Income forecasting | 5-year projection |

### 7.5 RISK Section

| Feature | Description | Metrics |
|---------|-------------|---------|
| Risk Analysis | Portfolio risk dashboard | Beta, Sharpe, Vol |
| Stress Test | Historical scenario analysis | 2008, COVID, etc. |
| Correlation | Asset correlation matrix | Pearson correlation |
| Factor Analysis | Factor exposure | Fama-French factors |
| ESG Ratings | Environmental/Social/Gov | E, S, G scores |

### 7.6 RESEARCH Section

| Feature | Description | Data Source |
|---------|-------------|-------------|
| Stock Compare | Side-by-side comparison | Yahoo Finance |
| Peer Rankings | Sector peer analysis | Yahoo Finance |
| Insider Trading | Insider transactions | Finnhub |
| Earnings Analysis | EPS, estimates, surprises | Alpha Vantage |
| Seasonality | Monthly/quarterly patterns | Historical |
| Valuation | P/E, P/B, P/S, EV/EBITDA | Yahoo Finance |

---

## 8. Financial Formulas

### Technical Indicators

#### RSI (Relative Strength Index)
```
RSI = 100 - (100 / (1 + RS))

Where:
RS = Average Gain / Average Loss (over 14 periods)

Average Gain = Sum of gains over 14 periods / 14
Average Loss = Sum of losses over 14 periods / 14
```

**Implementation**:
```javascript
function calculateRSI(prices, period = 14) {
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
```

#### MACD (Moving Average Convergence Divergence)
```
MACD Line = EMA(12) - EMA(26)
Signal Line = EMA(9) of MACD Line
Histogram = MACD Line - Signal Line

EMA = Price(t) × k + EMA(y) × (1 − k)
Where: k = 2 / (N + 1), N = number of periods
```

**Implementation**:
```javascript
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD)
  const macdHistory = []; // Array of MACD values
  const signalLine = calculateEMA(macdHistory, 9);

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
}
```

#### Bollinger Bands
```
Middle Band = SMA(20)
Upper Band = SMA(20) + (2 × σ)
Lower Band = SMA(20) - (2 × σ)

Where: σ = Standard Deviation of prices over 20 periods
```

**Implementation**:
```javascript
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const sma = prices.slice(-period).reduce((a, b) => a + b) / period;

  const squaredDiffs = prices.slice(-period).map(p => Math.pow(p - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b) / period;
  const std = Math.sqrt(variance);

  return {
    middle: sma,
    upper: sma + (stdDev * std),
    lower: sma - (stdDev * std),
    bandwidth: ((sma + stdDev * std) - (sma - stdDev * std)) / sma * 100
  };
}
```

#### Stochastic Oscillator
```
%K = ((Close - Lowest Low) / (Highest High - Lowest Low)) × 100
%D = SMA(3) of %K

Where:
- Lowest Low = Lowest low over 14 periods
- Highest High = Highest high over 14 periods
```

#### ADX (Average Directional Index)
```
+DM = Current High - Previous High (if positive and > -DM)
-DM = Previous Low - Current Low (if positive and > +DM)

TR = Max(High - Low, |High - PrevClose|, |Low - PrevClose|)

+DI = 100 × Smoothed(+DM) / Smoothed(TR)
-DI = 100 × Smoothed(-DM) / Smoothed(TR)

DX = 100 × |+DI - -DI| / (+DI + -DI)
ADX = Smoothed average of DX over 14 periods
```

#### Fibonacci Retracement Levels
```
Level = High - (High - Low) × Ratio

Common Ratios:
- 0% (High)
- 23.6%
- 38.2%
- 50%
- 61.8%
- 78.6%
- 100% (Low)
```

### Portfolio Metrics

#### Portfolio Return
```
Total Return = (Current Value - Total Cost) / Total Cost × 100

Weighted Return = Σ (Weight_i × Return_i)
Where: Weight_i = Value_i / Total Portfolio Value
```

#### Beta
```
β = Covariance(Stock Returns, Market Returns) / Variance(Market Returns)

β = Σ((R_i - R̄)(M_i - M̄)) / Σ(M_i - M̄)²
```

**Implementation**:
```javascript
function calculateBeta(stockReturns, marketReturns) {
  const n = stockReturns.length;
  const stockMean = stockReturns.reduce((a, b) => a + b) / n;
  const marketMean = marketReturns.reduce((a, b) => a + b) / n;

  let covariance = 0, marketVariance = 0;

  for (let i = 0; i < n; i++) {
    covariance += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
    marketVariance += Math.pow(marketReturns[i] - marketMean, 2);
  }

  return covariance / marketVariance;
}
```

#### Sharpe Ratio
```
Sharpe Ratio = (R_p - R_f) / σ_p

Where:
- R_p = Portfolio Return
- R_f = Risk-Free Rate (typically 10Y Treasury)
- σ_p = Standard Deviation of Portfolio Returns
```

**Implementation**:
```javascript
function calculateSharpeRatio(returns, riskFreeRate = 0.05) {
  const avgReturn = returns.reduce((a, b) => a + b) / returns.length;
  const mean = avgReturn;
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
  const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / returns.length);

  return (avgReturn - riskFreeRate) / stdDev;
}
```

#### Value at Risk (VaR)
```
VaR (Historical) = Portfolio Value × Percentile(Returns, 1 - Confidence)

VaR (Parametric) = Portfolio Value × Z_score × σ × √(Time Horizon)

Where:
- Z_score = 1.65 for 95% confidence, 2.33 for 99%
- σ = Standard deviation of returns
```

**Implementation**:
```javascript
function calculateVaR(portfolioValue, returns, confidence = 0.95) {
  // Historical VaR
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sortedReturns.length);
  const historicalVaR = portfolioValue * Math.abs(sortedReturns[index]);

  // Parametric VaR
  const mean = returns.reduce((a, b) => a + b) / returns.length;
  const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const zScore = confidence === 0.99 ? 2.33 : 1.65;
  const parametricVaR = portfolioValue * zScore * stdDev;

  return { historicalVaR, parametricVaR };
}
```

#### Maximum Drawdown
```
Max Drawdown = (Peak Value - Trough Value) / Peak Value × 100

For each point:
Drawdown = (Peak to Date - Current Value) / Peak to Date
```

### Options Formulas

#### Black-Scholes Model
```
Call Price = S × N(d1) - K × e^(-rT) × N(d2)
Put Price = K × e^(-rT) × N(-d2) - S × N(-d1)

Where:
d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
d2 = d1 - σ√T

S = Current stock price
K = Strike price
r = Risk-free rate
T = Time to expiration (years)
σ = Implied volatility
N() = Cumulative normal distribution
```

#### Options Greeks

**Delta (Δ)**:
```
Call Delta = N(d1)
Put Delta = N(d1) - 1

Interpretation: Change in option price for $1 change in stock
```

**Gamma (Γ)**:
```
Gamma = N'(d1) / (S × σ × √T)

Where N'(d1) = e^(-d1²/2) / √(2π)

Interpretation: Rate of change of Delta
```

**Theta (Θ)**:
```
Call Theta = -[S × N'(d1) × σ / (2√T)] - r × K × e^(-rT) × N(d2)
Put Theta = -[S × N'(d1) × σ / (2√T)] + r × K × e^(-rT) × N(-d2)

Interpretation: Time decay ($ per day)
```

**Vega (ν)**:
```
Vega = S × √T × N'(d1)

Interpretation: Change in option price for 1% change in IV
```

**Implementation**:
```javascript
function blackScholes(S, K, T, r, sigma, type = 'call') {
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const NNd1 = normalCDF(-d1);
  const NNd2 = normalCDF(-d2);

  let price, delta, gamma, theta, vega;

  if (type === 'call') {
    price = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Nd1;
  } else {
    price = K * Math.exp(-r * T) * NNd2 - S * NNd1;
    delta = Nd1 - 1;
  }

  const Npd1 = normalPDF(d1);
  gamma = Npd1 / (S * sigma * Math.sqrt(T));
  vega = S * Math.sqrt(T) * Npd1 / 100;
  theta = (-S * Npd1 * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2) / 365;

  return { price, delta, gamma, theta, vega };
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

function normalPDF(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}
```

### Valuation Metrics

#### P/E Ratio
```
P/E = Stock Price / Earnings Per Share

Trailing P/E = Current Price / EPS (last 12 months)
Forward P/E = Current Price / Estimated EPS (next 12 months)
```

#### PEG Ratio
```
PEG = P/E Ratio / Annual EPS Growth Rate

PEG < 1: Potentially undervalued
PEG = 1: Fairly valued
PEG > 1: Potentially overvalued
```

#### EV/EBITDA
```
EV = Market Cap + Total Debt - Cash

EV/EBITDA = Enterprise Value / EBITDA

Where EBITDA = Earnings Before Interest, Taxes, Depreciation, Amortization
```

#### Dividend Discount Model (DDM)
```
Stock Value = D1 / (r - g)

Where:
D1 = Expected dividend next year = D0 × (1 + g)
r = Required rate of return
g = Dividend growth rate
```

### Factor Analysis (Fama-French)

#### Three-Factor Model
```
R_i - R_f = α + β_m(R_m - R_f) + β_s(SMB) + β_v(HML) + ε

Where:
R_i = Portfolio return
R_f = Risk-free rate
R_m = Market return
SMB = Small Minus Big (size factor)
HML = High Minus Low (value factor)
```

#### Factor Exposures
```
Market Beta: Sensitivity to market movements
Size (SMB): Small cap vs large cap exposure
Value (HML): Value vs growth exposure
Momentum (MOM): Winner vs loser stocks
Quality (QMJ): Profitable vs unprofitable
```

---

## 9. API Endpoints Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout user |

### Portfolios

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolios` | Get all portfolios |
| POST | `/api/portfolios` | Create portfolio |
| GET | `/api/portfolios/:id` | Get portfolio details |
| PUT | `/api/portfolios/:id` | Update portfolio |
| DELETE | `/api/portfolios/:id` | Delete portfolio |
| GET | `/api/portfolios/:id/performance` | Get performance metrics |

### Holdings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolios/:id/holdings` | Get holdings |
| POST | `/api/portfolios/:id/holdings` | Add holding |
| PUT | `/api/holdings/:id` | Update holding |
| DELETE | `/api/holdings/:id` | Delete holding |

### Research

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/research/stock/:symbol` | Get stock overview |
| GET | `/api/research/technicals/:symbol` | Get technical analysis |
| GET | `/api/research/options/:symbol` | Get options chain |
| GET | `/api/research/peers/:symbol` | Get peer comparison |
| GET | `/api/research/insider-trading/:symbol` | Get insider trades |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Get dashboard data |
| GET | `/api/analytics/attribution` | Get factor attribution |
| GET | `/api/analytics/risk-metrics` | Get risk metrics |
| GET | `/api/analytics/correlation` | Get correlation matrix |
| POST | `/api/analytics/stress-test` | Run stress test |

---

## 10. Frontend Pages

### Page Structure

All pages follow a consistent structure:

```ejs
<%- include('../partials/header', { pageTitle: 'Page Title' }) %>

<!-- Bloomberg Header Bar -->
<div class="bloomberg-header mb-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-amber-400">PAGE TITLE</h1>
      <p class="text-slate-400">Page description</p>
    </div>
    <form method="GET" action="/page-url" class="flex gap-2">
      <input type="text" name="symbol" value="<%= symbol %>" class="form-input">
      <button type="submit" class="bloomberg-btn bloomberg-btn-primary">ANALYZE</button>
    </form>
  </div>
</div>

<!-- Page Content -->
<div class="bloomberg-card p-5">
  <!-- Dynamic content -->
</div>

<!-- Charts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  // Chart initialization
</script>

<%- include('../partials/footer') %>
```

### Key Pages

| Page | Route | Template | Purpose |
|------|-------|----------|---------|
| Dashboard | `/dashboard` | dashboard.ejs | Portfolio overview |
| Technicals | `/technicals` | technicals.ejs | Technical analysis |
| Options Chain | `/options-chain` | options-chain.ejs | Options data |
| Factors | `/factors` | factors.ejs | Factor exposure |
| Valuation | `/valuation` | valuation.ejs | Valuation metrics |
| Seasonality | `/seasonality` | seasonality.ejs | Seasonal patterns |

---

## 11. Security Implementation

### Authentication

```javascript
// JWT Token Generation
const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Token Verification Middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Password Hashing

```javascript
const bcrypt = require('bcrypt');

// Hash password before storing
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests' }
});

app.use('/api/', apiLimiter);
```

---

## 12. Deployment Guide

### Environment Variables

```env
# Backend (.env)
PORT=5000
DATABASE_URL="file:./data/wealthpilot.db"
JWT_SECRET=your-secret-key-here
ALPHA_VANTAGE_API_KEY=your-key
FINNHUB_API_KEY=your-key
OPENAI_API_KEY=your-key

# Frontend (.env)
PORT=3000
API_URL=http://localhost:5000
```

### Starting the Application

```bash
# Start Backend
cd backend
npm install
npx prisma migrate deploy
npm start

# Start Frontend (new terminal)
cd frontend
npm install
npm start
```

### Production Deployment

```bash
# Using PM2
pm2 start backend/src/index.js --name "wealthpilot-api"
pm2 start frontend/dist/server.js --name "wealthpilot-web"

# Using Docker
docker-compose up -d
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Alpha | Excess return above benchmark |
| Beta | Measure of systematic risk |
| Delta | Option sensitivity to price change |
| EPS | Earnings Per Share |
| IV | Implied Volatility |
| MACD | Moving Average Convergence Divergence |
| OTM | Out of The Money |
| P/E | Price to Earnings ratio |
| RSI | Relative Strength Index |
| SMA | Simple Moving Average |
| VaR | Value at Risk |
| Vol | Volatility |

---

## Appendix B: Troubleshooting

### Common Issues

**Issue**: API rate limit errors
**Solution**: Check Alpha Vantage free tier limit (5 calls/minute). Use caching.

**Issue**: Options data not loading
**Solution**: Verify Yahoo Finance is accessible. Some symbols don't have options.

**Issue**: Charts not rendering
**Solution**: Check browser console for Chart.js errors. Ensure data is valid JSON.

**Issue**: Login fails
**Solution**: Check JWT_SECRET is set. Verify database connection.

---

## Appendix C: Support

For issues and feature requests:
- GitHub: https://github.com/yourrepo/wealthpilot
- Email: support@wealthpilot.com

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Generated for WealthPilot Pro v27*
