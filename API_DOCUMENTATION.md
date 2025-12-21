# WealthPilot Pro - REST API Documentation

**Version:** 1.0
**Base URL:** `http://localhost:4000`
**Authentication:** JWT Bearer Token
**Last Updated:** December 14, 2025

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Portfolios](#portfolios)
4. [Holdings](#holdings)
5. [Transactions](#transactions)
6. [Market Data](#market-data)
7. [Advanced Analytics](#advanced-analytics)
8. [Price Alerts](#price-alerts)
9. [Dashboard Customization](#dashboard-customization)
10. [Research Center](#research-center)
11. [Error Handling](#error-handling)
12. [Rate Limiting](#rate-limiting)

---

## Authentication

### Register User

Create a new user account.

**Endpoint:** `POST /api/auth/register`
**Authentication:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "plan": "free"
  },
  "token": "jwt_token_here"
}
```

### Login

Authenticate and receive JWT token.

**Endpoint:** `POST /api/auth/login`
**Authentication:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "plan": "premium"
  }
}
```

### Logout

Invalidate current session.

**Endpoint:** `POST /api/auth/logout`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## User Management

### Get Current User

Get authenticated user's profile.

**Endpoint:** `GET /api/users/me`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "plan": "premium",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Update User Profile

Update user information.

**Endpoint:** `PUT /api/users/me`
**Authentication:** Required

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Profile updated",
  "user": { /* updated user object */ }
}
```

---

## Portfolios

### List Portfolios

Get all portfolios for authenticated user.

**Endpoint:** `GET /api/portfolios`
**Authentication:** Required

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Growth Portfolio",
    "description": "Long-term growth stocks",
    "userId": "uuid",
    "totalValue": 125000.50,
    "totalCost": 100000.00,
    "totalGain": 25000.50,
    "totalGainPct": 25.0,
    "holdings": 15,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### Create Portfolio

Create a new portfolio.

**Endpoint:** `POST /api/portfolios`
**Authentication:** Required

**Request Body:**
```json
{
  "name": "Tech Portfolio",
  "description": "Technology sector focus"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "portfolio": {
    "id": "uuid",
    "name": "Tech Portfolio",
    "description": "Technology sector focus",
    "userId": "uuid",
    "createdAt": "2024-12-14T00:00:00Z"
  }
}
```

### Get Portfolio

Get single portfolio by ID.

**Endpoint:** `GET /api/portfolios/:id`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Growth Portfolio",
  "description": "Long-term growth stocks",
  "totalValue": 125000.50,
  "totalCost": 100000.00,
  "totalGain": 25000.50,
  "totalGainPct": 25.0,
  "holdings": [ /* array of holdings */ ]
}
```

### Update Portfolio

Update portfolio details.

**Endpoint:** `PUT /api/portfolios/:id`
**Authentication:** Required

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "portfolio": { /* updated portfolio */ }
}
```

### Delete Portfolio

Delete a portfolio and all its holdings.

**Endpoint:** `DELETE /api/portfolios/:id`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Portfolio deleted"
}
```

---

## Holdings

### List Holdings

Get all holdings for a portfolio.

**Endpoint:** `GET /api/portfolios/:portfolioId/holdings`
**Authentication:** Required

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "portfolioId": "uuid",
    "symbol": "AAPL",
    "shares": 100,
    "costBasis": 15000.00,
    "currentPrice": 175.50,
    "marketValue": 17550.00,
    "gain": 2550.00,
    "gainPct": 17.0,
    "sector": "Technology",
    "purchaseDate": "2024-01-01"
  }
]
```

### Add Holding

Add a new holding to portfolio.

**Endpoint:** `POST /api/portfolios/:portfolioId/holdings`
**Authentication:** Required

**Request Body:**
```json
{
  "symbol": "MSFT",
  "shares": 50,
  "costBasis": 18000.00,
  "purchaseDate": "2024-12-01"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "holding": {
    "id": "uuid",
    "symbol": "MSFT",
    "shares": 50,
    "costBasis": 18000.00,
    "currentPrice": 375.25,
    "marketValue": 18762.50
  }
}
```

### Update Holding

Update holding details.

**Endpoint:** `PUT /api/holdings/:id`
**Authentication:** Required

**Request Body:**
```json
{
  "shares": 75,
  "costBasis": 27000.00
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "holding": { /* updated holding */ }
}
```

### Delete Holding

Remove a holding from portfolio.

**Endpoint:** `DELETE /api/holdings/:id`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Holding deleted"
}
```

---

## Transactions

### List Transactions

Get transaction history.

**Endpoint:** `GET /api/transactions?portfolioId=uuid&type=buy&limit=50`
**Authentication:** Required

**Query Parameters:**
- `portfolioId` (optional) - Filter by portfolio
- `type` (optional) - Filter by type (buy/sell)
- `symbol` (optional) - Filter by symbol
- `limit` (optional, default: 100) - Number of results

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "portfolioId": "uuid",
    "symbol": "AAPL",
    "type": "buy",
    "shares": 100,
    "price": 150.00,
    "total": 15000.00,
    "date": "2024-01-01",
    "notes": "Initial purchase"
  }
]
```

### Record Transaction

Record a buy or sell transaction.

**Endpoint:** `POST /api/transactions`
**Authentication:** Required

**Request Body:**
```json
{
  "portfolioId": "uuid",
  "symbol": "AAPL",
  "type": "buy",
  "shares": 50,
  "price": 175.00,
  "date": "2024-12-14",
  "notes": "Additional shares"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "symbol": "AAPL",
    "type": "buy",
    "shares": 50,
    "price": 175.00,
    "total": 8750.00,
    "date": "2024-12-14"
  }
}
```

---

## Market Data

### Get Real-Time Quote

Get current stock price and data.

**Endpoint:** `GET /api/market/quote/:symbol`
**Authentication:** Optional

**Response:** `200 OK`
```json
{
  "symbol": "AAPL",
  "price": 175.50,
  "change": 2.50,
  "changePercent": 1.45,
  "volume": 50000000,
  "open": 173.00,
  "high": 176.00,
  "low": 172.50,
  "previousClose": 173.00,
  "timestamp": "2024-12-14T16:00:00Z"
}
```

### Get Multiple Quotes

Get quotes for multiple symbols.

**Endpoint:** `POST /api/market/quotes`
**Authentication:** Optional

**Request Body:**
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

**Response:** `200 OK`
```json
{
  "quotes": [
    { "symbol": "AAPL", "price": 175.50, /* ... */ },
    { "symbol": "MSFT", "price": 375.25, /* ... */ },
    { "symbol": "GOOGL", "price": 140.80, /* ... */ }
  ]
}
```

### Search Symbols

Search for stock symbols and companies.

**Endpoint:** `GET /api/market/search?q=apple`
**Authentication:** Optional

**Query Parameters:**
- `q` (required) - Search query

**Response:** `200 OK`
```json
{
  "results": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "type": "Stock",
      "exchange": "NASDAQ"
    }
  ]
}
```

### Refresh Prices

Manually trigger price update for all holdings.

**Endpoint:** `POST /api/market/refresh`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "updated": 25,
  "message": "Prices updated for 25 symbols"
}
```

---

## Advanced Analytics

All analytics endpoints require authentication and support `portfolioId` query parameter (defaults to "all").

### Performance Tab (4 endpoints)

#### 1. Performance Attribution

**Endpoint:** `GET /api/advanced-analytics/performance-attribution?portfolioId=all&period=1Y`

**Query Parameters:**
- `portfolioId` (default: "all") - Portfolio ID or "all"
- `period` (default: "1Y") - Time period (1M, 3M, 6M, 1Y, 3Y, 5Y, All)

**Response:** `200 OK`
```json
{
  "totalReturn": 12.5,
  "benchmarkReturn": 10.2,
  "excessReturn": 2.3,
  "allocationEffect": 1.5,
  "selectionEffect": 0.8,
  "interactionEffect": 0.0,
  "sectorBreakdown": [
    {
      "sector": "Technology",
      "portfolioWeight": 45.0,
      "benchmarkWeight": 40.0,
      "return": 15.2,
      "contribution": 6.8
    }
  ],
  "chartData": {
    "labels": ["Allocation", "Selection", "Interaction"],
    "values": [1.5, 0.8, 0.0]
  }
}
```

#### 2. Excess Return vs Benchmark

**Endpoint:** `GET /api/advanced-analytics/excess-return?portfolioId=all&benchmark=SPY&period=1Y`

**Query Parameters:**
- `portfolioId` (default: "all")
- `benchmark` (default: "SPY") - Benchmark symbol
- `period` (default: "1Y")

**Response:** `200 OK`
```json
{
  "totalReturn": 12.5,
  "benchmarkReturn": 10.2,
  "excessReturn": 2.3,
  "trackingError": 2.30,
  "informationRatio": 1.00,
  "period": "1Y",
  "benchmark": "SPY",
  "chartData": {
    "labels": ["Total Return", "Benchmark Return"],
    "values": [12.5, 10.2],
    "colors": ["#10B981", "#6B7280"]
  }
}
```

#### 3. Drawdown Analysis

**Endpoint:** `GET /api/advanced-analytics/drawdown-analysis?portfolioId=all&period=1Y`

**Response:** `200 OK`
```json
{
  "maxDrawdown": 15.50,
  "currentDrawdown": 2.30,
  "peakValue": 150000.00,
  "troughValue": 126750.00,
  "peakDate": "2024-11-01",
  "snapshotCount": 365,
  "chartData": {
    "labels": ["2024-01-01", "2024-01-02", /* ... */],
    "values": [0, -1.2, -2.5, /* ... */],
    "peaks": [
      { "x": "2024-01-01", "y": 145000 },
      { "x": "2024-11-01", "y": 150000 }
    ],
    "troughs": [
      { "x": "2024-03-15", "y": -15.5 }
    ]
  },
  "period": "1Y"
}
```

#### 4. Rolling Statistics

**Endpoint:** `GET /api/advanced-analytics/rolling-statistics?portfolioId=all&window=90&period=1Y`

**Query Parameters:**
- `window` (default: 90) - Rolling window in days

**Response:** `200 OK`
```json
{
  "window": 90,
  "period": "1Y",
  "dataPoints": 275,
  "overall": {
    "avgReturn": 1.05,
    "volatility": 12.50,
    "sharpeRatio": 0.84,
    "maxDrawdown": 15.50
  },
  "chartData": {
    "dates": ["2024-04-01", "2024-04-02", /* ... */],
    "rollingReturns": [1.2, 1.1, /* ... */],
    "rollingVolatility": [12.0, 12.5, /* ... */],
    "rollingSharpe": [0.85, 0.83, /* ... */]
  }
}
```

### Risk Tab (5 endpoints)

#### 5. Risk Decomposition

**Endpoint:** `GET /api/advanced-analytics/risk-decomposition?portfolioId=all`

**Response:** `200 OK`
```json
{
  "factorExposures": {
    "market": 1.00,
    "size": 0.20,
    "value": -0.10,
    "momentum": 0.15,
    "quality": 0.25
  },
  "riskContribution": [
    {
      "sector": "Technology",
      "weight": 45.00,
      "volatility": 18.50,
      "contribution": 8.32
    }
  ],
  "totalRisk": 12.50,
  "diversificationRatio": 1.20,
  "chartData": {
    "labels": ["market", "size", "value", "momentum", "quality"],
    "values": [1.00, 0.20, -0.10, 0.15, 0.25]
  }
}
```

#### 6. VaR & Stress Scenarios

**Endpoint:** `GET /api/advanced-analytics/var-scenarios?portfolioId=all&confidence=95&period=1Y`

**Query Parameters:**
- `confidence` (default: 95) - Confidence level (90, 95, 99)

**Response:** `200 OK`
```json
{
  "var": -2.50,
  "cvar": -3.80,
  "confidence": 95,
  "currentValue": 150000.00,
  "scenarios": [
    {
      "name": "Market Crash (-20%)",
      "impact": -30000.00,
      "probability": "5%"
    },
    {
      "name": "Recession (-10%)",
      "impact": -15000.00,
      "probability": "15%"
    }
  ],
  "chartData": {
    "histogram": [-5.2, -3.8, -2.5, /* ... */],
    "varLine": -2.50
  }
}
```

#### 7. Correlation Matrix

**Endpoint:** `GET /api/advanced-analytics/correlation-matrix?portfolioId=all`

**Response:** `200 OK`
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN"],
  "matrix": [
    [1.0, 0.7, 0.7, 0.6],
    [0.7, 1.0, 0.7, 0.6],
    [0.7, 0.7, 1.0, 0.6],
    [0.6, 0.6, 0.6, 1.0]
  ],
  "avgCorrelation": 0.45,
  "chartData": {
    "labels": ["AAPL", "MSFT", "GOOGL", "AMZN"],
    "values": [/* same as matrix */]
  }
}
```

#### 8. Stress Test Scenarios

**Endpoint:** `GET /api/advanced-analytics/stress-scenarios?portfolioId=all`

**Response:** `200 OK`
```json
{
  "scenarios": [
    {
      "name": "2008 Financial Crisis",
      "impact": -55500.00,
      "duration": "18 months"
    },
    {
      "name": "2020 COVID Crash",
      "impact": -51000.00,
      "duration": "2 months"
    },
    {
      "name": "Tech Bubble 2000",
      "impact": -67500.00,
      "duration": "30 months"
    }
  ],
  "portfolioValue": 150000.00,
  "mostSevere": "Tech Bubble 2000",
  "chartData": {
    "labels": ["2008 Financial Crisis", "2020 COVID Crash", /* ... */],
    "values": [-55500, -51000, /* ... */]
  }
}
```

#### 9. Concentration Analysis

**Endpoint:** `GET /api/advanced-analytics/concentration-analysis?portfolioId=all`

**Response:** `200 OK`
```json
{
  "hhi": 1250.50,
  "gini": 0.425,
  "top5Concentration": 65.50,
  "top10Concentration": 85.20,
  "effectiveHoldings": 8.50,
  "totalHoldings": 25,
  "sectorConcentration": [
    {
      "sector": "Technology",
      "weight": 45.00,
      "value": 67500.00
    }
  ],
  "topHoldings": [
    {
      "symbol": "AAPL",
      "weight": 25.00,
      "value": 37500.00
    }
  ],
  "chartData": {
    "labels": ["AAPL", "MSFT", "GOOGL", /* ... */],
    "values": [25.0, 15.0, 10.0, /* ... */]
  }
}
```

### Attribution Tab (4 endpoints)

#### 10. Regional Attribution

**Endpoint:** `GET /api/advanced-analytics/regional-attribution?portfolioId=all`

**Response:** `200 OK`
```json
{
  "regions": [
    {
      "name": "North America",
      "allocation": 65,
      "return": 12.5,
      "contribution": 8.1
    }
  ],
  "currencyEffects": {
    "USD": 0,
    "EUR": -0.5,
    "JPY": 0.2,
    "GBP": -0.3,
    "CNY": 0.1
  },
  "totalAttributionEffect": 11.5
}
```

#### 11. Sector Rotation

**Endpoint:** `GET /api/advanced-analytics/sector-rotation?portfolioId=all&period=1Y`

**Response:** `200 OK`
```json
{
  "sectorBreakdown": [
    {
      "sector": "Technology",
      "portfolioWeight": 45.0,
      "benchmarkWeight": 40.0,
      "return": 15.2,
      "contribution": 6.8
    }
  ],
  "period": "1Y",
  "rotationSignals": [
    {
      "sector": "Technology",
      "signal": "Hold",
      "strength": 0.6,
      "recommendation": "Maintain current allocation"
    }
  ],
  "chartData": {
    "sectorWeights": [
      {
        "sector": "Technology",
        "portfolioWeight": 45.0,
        "benchmarkWeight": 40.0
      }
    ]
  }
}
```

#### 12. Peer Benchmarking

**Endpoint:** `GET /api/advanced-analytics/peer-benchmarking?portfolioId=all&peerUniverse=balanced&period=1Y`

**Query Parameters:**
- `peerUniverse` (default: "balanced") - Peer universe (balanced, growth, value, aggressive)

**Response:** `200 OK`
```json
{
  "portfolioReturn": 12.50,
  "portfolioVolatility": 12.50,
  "portfolioSharpe": 0.84,
  "percentileRank": 75,
  "peerUniverse": "balanced",
  "peerCount": 8,
  "peerStats": {
    "avgReturn": 10.50,
    "avgVolatility": 13.20,
    "bestReturn": 15.00,
    "worstReturn": 7.00
  },
  "chartData": {
    "scatter": [
      {
        "x": 12.5,
        "y": 12.5,
        "label": "Your Portfolio",
        "highlight": true
      },
      {
        "x": 13.0,
        "y": 10.0,
        "label": "Peer 1"
      }
    ]
  }
}
```

#### 13. Alpha Decay

**Endpoint:** `GET /api/advanced-analytics/alpha-decay?portfolioId=all`

**Response:** `200 OK`
```json
{
  "currentAlpha": 2.5,
  "alphaDecayRate": -0.15,
  "factorCrowding": {
    "market": 0.45,
    "size": 0.32,
    "value": 0.58,
    "momentum": 0.71,
    "quality": 0.38
  },
  "crowdingWarnings": [
    {
      "factor": "Momentum",
      "level": "High",
      "message": "Momentum factor showing high crowding"
    }
  ],
  "historicalAlpha": [
    { "date": "2024-01", "alpha": 3.2 },
    { "date": "2024-04", "alpha": 2.9 }
  ]
}
```

### Construction Tab (4 endpoints)

#### 14. Efficient Frontier

**Endpoint:** `GET /api/advanced-analytics/efficient-frontier?portfolioId=all&period=1Y`

**Response:** `200 OK`
```json
{
  "currentPortfolio": {
    "expectedReturn": 12.50,
    "volatility": 12.50,
    "sharpeRatio": 0.84
  },
  "optimalPortfolio": {
    "expectedReturn": 13.20,
    "volatility": 11.80,
    "sharpeRatio": 0.95
  },
  "frontierPoints": [
    {
      "expectedReturn": 2.00,
      "volatility": 5.50,
      "sharpeRatio": 0.00
    }
  ],
  "recommendations": [
    {
      "type": "rebalance",
      "description": "Consider rebalancing to move closer to efficient frontier",
      "impact": "Potential Sharpe ratio improvement of 0.11"
    }
  ],
  "chartData": {
    "frontier": [
      { "x": 5.5, "y": 2.0 },
      { "x": 6.0, "y": 3.5 }
    ],
    "current": { "x": 12.5, "y": 12.5 },
    "optimal": { "x": 11.8, "y": 13.2 }
  }
}
```

#### 15. Turnover Analysis

**Endpoint:** `GET /api/advanced-analytics/turnover-analysis?portfolioId=all&period=1Y`

**Response:** `200 OK`
```json
{
  "annualTurnover": 45.2,
  "avgHoldingPeriod": 285,
  "tradeFrequency": {
    "monthly": 8.5,
    "quarterly": 25.5,
    "annual": 102
  },
  "turnoverByMonth": [
    { "month": "2024-01", "turnover": 38 },
    { "month": "2024-02", "turnover": 42 }
  ],
  "topTradedSymbols": [
    {
      "symbol": "AAPL",
      "trades": 12,
      "volume": 25000
    }
  ]
}
```

#### 16. Liquidity Analysis

**Endpoint:** `GET /api/advanced-analytics/liquidity-analysis?portfolioId=all`

**Response:** `200 OK`
```json
{
  "liquidityScore": 85,
  "daysToLiquidate": 2.5,
  "avgBidAskSpread": 0.25,
  "totalValue": 150000.00,
  "holdingsAnalysis": [
    {
      "symbol": "AAPL",
      "weight": 25.00,
      "marketValue": 37500.00,
      "estimatedADV": 1875000.00,
      "daysToLiquidate": 0.2,
      "bidAskSpread": 0.15,
      "liquidityScore": "High"
    }
  ],
  "marketImpact": {
    "low": 20,
    "medium": 4,
    "high": 1
  },
  "chartData": {
    "scatter": [
      {
        "x": 25.0,
        "y": 0.2,
        "label": "AAPL",
        "size": 37.5
      }
    ]
  },
  "recommendations": [
    "Liquidity profile is healthy",
    "Trading costs are reasonable"
  ]
}
```

#### 17. Transaction Cost Analysis

**Endpoint:** `GET /api/advanced-analytics/transaction-cost-analysis?portfolioId=all&period=1Y`

**Response:** `200 OK`
```json
{
  "totalCosts": 750.00,
  "costAsPercentage": 0.500,
  "portfolioValue": 150000.00,
  "explicitCosts": {
    "commissions": 150.00,
    "fees": 75.00,
    "taxes": 45.00,
    "total": 270.00
  },
  "implicitCosts": {
    "bidAskSpread": 300.00,
    "marketImpact": 225.00,
    "timing": 150.00,
    "total": 675.00
  },
  "monthlyCosts": [
    { "month": "2024-01", "costs": 450, "trades": 12 }
  ],
  "brokerComparison": [
    { "broker": "Current Broker", "avgCost": 35, "rating": "Good" }
  ],
  "executionQuality": {
    "fillRate": 98.5,
    "avgSlippage": 0.08,
    "priceImprovement": 12.3
  },
  "recommendations": [
    "Consider using limit orders to reduce market impact costs"
  ]
}
```

### Specialized Tab (3 endpoints)

#### 18. Alternatives Attribution

**Endpoint:** `GET /api/advanced-analytics/alternatives-attribution?portfolioId=all`

**Response:** `200 OK`
```json
{
  "alternatives": [],
  "totalIRR": 0,
  "publicMarketEquivalent": 0,
  "message": "No alternative investments found in portfolio"
}
```

#### 19. ESG Analysis

**Endpoint:** `GET /api/advanced-analytics/esg-analysis?portfolioId=all`

**Response:** `200 OK`
```json
{
  "portfolioESGScore": 75.5,
  "grade": "B",
  "componentScores": {
    "environmental": 74.2,
    "social": 76.8,
    "governance": 75.5
  },
  "carbonFootprint": 125.50,
  "carbonIntensity": 0.84,
  "holdingsESG": [
    {
      "symbol": "AAPL",
      "weight": 25.00,
      "environmentScore": 85,
      "socialScore": 78,
      "governanceScore": 82,
      "esgScore": 81.7,
      "carbonFootprint": 25.50
    }
  ],
  "sectorESG": [
    {
      "sector": "Technology",
      "esgScore": 78.5,
      "weight": 45.00
    }
  ],
  "benchmarkComparison": {
    "portfolio": 75.5,
    "benchmark": 72.5,
    "difference": 3.0
  },
  "chartData": {
    "radar": [
      { "axis": "Environmental", "value": 74.2 },
      { "axis": "Social", "value": 76.8 },
      { "axis": "Governance", "value": 75.5 }
    ],
    "carbonByHolding": [
      { "symbol": "AAPL", "carbon": 25.5 }
    ]
  },
  "recommendations": [
    "ESG profile is strong",
    "Carbon footprint is reasonable"
  ]
}
```

#### 20. Client Reporting

**Endpoint:** `GET /api/advanced-analytics/client-reporting?portfolioId=all&reportType=summary&period=1Y`

**Query Parameters:**
- `reportType` (default: "summary") - Report type
- `period` (default: "1Y")

**Response:** `200 OK`
```json
{
  "reportType": "summary",
  "generatedAt": "2024-12-14T00:00:00Z",
  "period": "1Y",
  "portfolioSummary": {
    "name": "Growth Portfolio",
    "currentValue": 150000.00,
    "totalCost": 125000.00,
    "totalGain": 25000.00,
    "totalGainPct": 20.00,
    "holdingsCount": 25
  },
  "performance": {
    "totalReturn": 12.50,
    "benchmarkReturn": 10.20,
    "excessReturn": 2.30,
    "sharpeRatio": 0.84,
    "sortinoRatio": 1.09,
    "informationRatio": 0.85,
    "bestMonth": 8.5,
    "worstMonth": -5.2
  },
  "risk": {
    "volatility": 12.50,
    "var95": -2.50,
    "cvar95": -3.80,
    "maxDrawdown": 15.50,
    "beta": 1.05,
    "trackingError": 3.20,
    "downsideDeviation": 8.75
  },
  "allocation": {
    "sectors": [
      {
        "name": "Technology",
        "weight": 45.00,
        "return": 15.20
      }
    ]
  },
  "esg": {
    "portfolioScore": 75.5,
    "grade": "B",
    "environmental": 74.2,
    "social": 76.8,
    "governance": 75.5,
    "carbonFootprint": 125.50
  },
  "goals": [
    {
      "name": "Retirement Fund",
      "target": 1000000,
      "current": 750000,
      "progress": 75,
      "onTrack": true
    }
  ],
  "topHoldings": [
    {
      "symbol": "AAPL",
      "shares": 100,
      "marketValue": 37500.00,
      "gain": 7500.00,
      "gainPct": 25.00,
      "weight": 25.00
    }
  ]
}
```

---

## Price Alerts

### List Alerts

Get all price alerts for user.

**Endpoint:** `GET /api/alerts`
**Authentication:** Required

**Query Parameters:**
- `status` (optional) - Filter by status (active/triggered)
- `symbol` (optional) - Filter by symbol

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "symbol": "AAPL",
    "condition": "above",
    "targetPrice": 180.00,
    "currentPrice": 175.50,
    "status": "active",
    "triggered": false,
    "createdAt": "2024-12-01T00:00:00Z"
  }
]
```

### Create Alert

Create a new price alert.

**Endpoint:** `POST /api/alerts`
**Authentication:** Required

**Request Body:**
```json
{
  "symbol": "AAPL",
  "condition": "above",
  "targetPrice": 180.00
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "alert": {
    "id": "uuid",
    "symbol": "AAPL",
    "condition": "above",
    "targetPrice": 180.00,
    "status": "active",
    "createdAt": "2024-12-14T00:00:00Z"
  }
}
```

### Delete Alert

Delete a price alert.

**Endpoint:** `DELETE /api/alerts/:id`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Alert deleted"
}
```

### Get Triggered Alerts

Get recently triggered alerts.

**Endpoint:** `GET /api/alerts/triggered`
**Authentication:** Required

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "symbol": "AAPL",
    "condition": "above",
    "targetPrice": 180.00,
    "triggeredPrice": 180.50,
    "triggeredAt": "2024-12-14T15:30:00Z"
  }
]
```

---

## Dashboard Customization

### Get Active Preferences

Get user's active dashboard view preferences.

**Endpoint:** `GET /api/dashboard/preferences`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "viewName": "default",
    "isActive": true,
    "preferences": {
      "viewName": "default",
      "tabs": {
        "performance": {
          "charts": [
            {
              "id": "chart-attribution",
              "visible": true,
              "order": 0,
              "size": "normal",
              "favorited": false
            }
          ]
        }
      },
      "colorScheme": "bloomberg-default",
      "compactMode": false,
      "showExportButtons": true
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-12-14T00:00:00Z"
  }
}
```

### Get All Views

Get all saved dashboard views for user.

**Endpoint:** `GET /api/dashboard/views`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "viewName": "default",
      "isActive": true,
      "preferences": { /* ... */ }
    },
    {
      "id": 2,
      "viewName": "client-meeting",
      "isActive": false,
      "preferences": { /* ... */ }
    }
  ]
}
```

### Save Preferences

Save or update dashboard preferences.

**Endpoint:** `POST /api/dashboard/preferences`
**Authentication:** Required

**Request Body:**
```json
{
  "viewName": "default",
  "preferences": {
    "viewName": "default",
    "tabs": { /* ... */ }
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Preferences saved successfully",
  "data": { /* saved preferences */ }
}
```

### Create View

Create a new dashboard view.

**Endpoint:** `POST /api/dashboard/views`
**Authentication:** Required

**Request Body:**
```json
{
  "viewName": "client-meeting",
  "preferences": { /* ... */ }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "View created successfully",
  "data": { /* created view */ }
}
```

### Activate View

Activate a specific dashboard view.

**Endpoint:** `POST /api/dashboard/views/:viewName/activate`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "View 'client-meeting' activated",
  "data": { /* activated view */ }
}
```

### Delete View

Delete a dashboard view.

**Endpoint:** `DELETE /api/dashboard/views/:viewName`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "View 'client-meeting' deleted successfully"
}
```

### Export Views

Export all dashboard views as JSON.

**Endpoint:** `GET /api/dashboard/export`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "exportedAt": "2024-12-14T00:00:00Z",
    "userId": "uuid",
    "views": [
      {
        "viewName": "default",
        "preferences": { /* ... */ }
      }
    ]
  }
}
```

### Import Views

Import dashboard views from JSON.

**Endpoint:** `POST /api/dashboard/import`
**Authentication:** Required

**Request Body:**
```json
{
  "exportedAt": "2024-12-14T00:00:00Z",
  "userId": "uuid",
  "views": [
    {
      "viewName": "imported-view",
      "preferences": { /* ... */ }
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Imported 1 views",
  "data": [ /* imported views */ ]
}
```

---

## Research Center

### Get Stock Overview

Get detailed stock information.

**Endpoint:** `GET /api/research/stock/:symbol`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 175.50,
  "change": 2.50,
  "changePercent": 1.45,
  "marketCap": 2800000000000,
  "peRatio": 28.5,
  "dividend": 0.24,
  "dividendYield": 0.55,
  "52WeekHigh": 199.62,
  "52WeekLow": 164.08,
  "avgVolume": 50000000,
  "description": "Apple Inc. designs, manufactures, and markets smartphones..."
}
```

### Get AI Summary

Get AI-powered analysis of a stock.

**Endpoint:** `GET /api/research/ai-summary/:symbol`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "symbol": "AAPL",
  "summary": "Apple Inc. shows strong fundamentals with...",
  "keyPoints": [
    "Strong revenue growth",
    "Diversified product portfolio",
    "Concerns about China market"
  ],
  "sentiment": "bullish",
  "confidenceScore": 0.85,
  "generatedAt": "2024-12-14T00:00:00Z"
}
```

### Get News

Get latest news for a symbol.

**Endpoint:** `GET /api/research/news/:symbol?limit=10`
**Authentication:** Required

**Query Parameters:**
- `limit` (default: 10) - Number of articles

**Response:** `200 OK`
```json
{
  "articles": [
    {
      "title": "Apple Announces New Product Line",
      "source": "Bloomberg",
      "url": "https://...",
      "publishedAt": "2024-12-14T10:00:00Z",
      "sentiment": "positive"
    }
  ]
}
```

---

## Error Handling

All API errors follow a consistent format:

**Error Response:**
```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": { /* optional additional info */ }
}
```

### Common HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required or invalid token
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `422 Unprocessable Entity` - Validation failed
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

### Common Error Codes

- `INVALID_CREDENTIALS` - Login failed
- `TOKEN_EXPIRED` - JWT token expired
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `VALIDATION_ERROR` - Input validation failed
- `DUPLICATE_RESOURCE` - Resource already exists
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions

---

## Rate Limiting

**Current Limits:**
- Anonymous: 100 requests/hour
- Authenticated: 1000 requests/hour
- Premium users: 5000 requests/hour

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1702512000
```

**When Rate Limited:**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}
```

---

## Pagination

For endpoints that support pagination:

**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 50, max: 100) - Results per page

**Pagination Response:**
```json
{
  "data": [ /* results */ ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 250,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## WebSocket API

**Connection:** `ws://localhost:4000/ws`

### Subscribe to Price Updates

```javascript
const ws = new WebSocket('ws://localhost:4000/ws');

ws.send(JSON.stringify({
  action: 'subscribe',
  symbols: ['AAPL', 'MSFT', 'GOOGL']
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Price update:', data);
};
```

### Price Update Event

```json
{
  "type": "quote_update",
  "symbol": "AAPL",
  "price": 175.50,
  "change": 2.50,
  "changePercent": 1.45,
  "timestamp": "2024-12-14T16:00:00Z"
}
```

### Alert Triggered Event

```json
{
  "type": "alert_triggered",
  "alert": {
    "id": "uuid",
    "symbol": "AAPL",
    "condition": "above",
    "targetPrice": 180.00,
    "currentPrice": 180.50
  },
  "timestamp": "2024-12-14T16:00:00Z"
}
```

---

## Authentication Flow

1. **Register or Login** → Receive JWT token
2. **Store Token** → Save in localStorage/cookie
3. **Include in Requests** → Add `Authorization: Bearer {token}` header
4. **Token Expires** → Refresh or re-login (token valid for 7 days)

**Example:**
```javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { token } = await response.json();

// Use token in subsequent requests
const portfolios = await fetch('/api/portfolios', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Best Practices

1. **Always use HTTPS in production**
2. **Store JWT tokens securely** (httpOnly cookies preferred)
3. **Handle errors gracefully** with try-catch
4. **Implement retry logic** for failed requests
5. **Respect rate limits** with exponential backoff
6. **Validate input** on client side before sending
7. **Use pagination** for large result sets
8. **Cache responses** where appropriate
9. **Monitor API usage** to stay within limits
10. **Keep tokens refreshed** before expiration

---

## Support & Contact

**Documentation:** https://docs.wealthpilot.com
**GitHub:** https://github.com/wealthpilot/api
**Email:** api-support@wealthpilot.com
**Status Page:** https://status.wealthpilot.com

---

**Last Updated:** December 14, 2025
**API Version:** 1.0
**Documentation Version:** 1.0
