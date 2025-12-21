# WealthPilot Pro - System Architecture Overview

## Complete System Architecture

```mermaid
C4Context
    title WealthPilot Pro - System Context Diagram
    
    Person(user, "Portfolio Manager", "RIA or individual investor managing client portfolios")
    
    System(wealthpilot, "WealthPilot Pro", "Portfolio management and analytics platform")
    
    System_Ext(market, "Market Data Provider", "Real-time and historical market data (Alpha Vantage)")
    System_Ext(email, "Email Service", "Notification delivery (SMTP/SendGrid)")
    System_Ext(bank, "Banking APIs", "Optional: Direct account integration")
    
    Rel(user, wealthpilot, "Manages portfolios, views analytics", "HTTPS/WSS")
    Rel(wealthpilot, market, "Fetches prices, historical data", "REST API")
    Rel(wealthpilot, email, "Sends notifications", "SMTP")
    Rel(wealthpilot, bank, "Imports transactions", "REST API")
```

## Component Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Web[Web Browser<br/>React SPA]
        Mobile[Mobile App<br/>React Native]
    end
    
    subgraph "Presentation Layer"
        Dashboard[Dashboard Components]
        Holdings[Holdings Management]
        Analytics[Analytics Views]
        Reports[Report Generation]
    end
    
    subgraph "State Management"
        Store[Zustand Store<br/>Portfolio State]
        WS[WebSocket Client<br/>Real-time Updates]
        Query[React Query<br/>Server State]
    end
    
    subgraph "API Gateway"
        LB[Load Balancer<br/>Nginx]
        Auth[JWT Auth<br/>Middleware]
        RateLimit[Rate Limiter<br/>Redis-based]
    end
    
    subgraph "Application Services"
        API[REST API<br/>Express.js]
        WSServer[WebSocket Server<br/>ws library]
        Worker[Background Worker<br/>BullMQ]
    end
    
    subgraph "Business Logic"
        Portfolio[Portfolio Service<br/>CRUD Operations]
        Holdings[Holdings Service<br/>Position Management]
        Transactions[Transaction Service<br/>Buy/Sell/Transfer]
        Analytics[Analytics Service<br/>Basic Calculations]
        Advanced[Advanced Analytics<br/>Risk/Performance]
        Tax[Tax Optimization<br/>Loss Harvesting]
        Optimize[Portfolio Optimization<br/>Rebalancing]
        Market[Market Data Service<br/>Price Updates]
    end
    
    subgraph "Data Layer"
        Postgres[(PostgreSQL<br/>Primary Database)]
        Redis[(Redis<br/>Cache + Queue)]
        S3[S3 / Object Storage<br/>Reports + Docs]
    end
    
    subgraph "External Services"
        AlphaVantage[Alpha Vantage<br/>Market Data]
        SMTP[Email Provider<br/>Notifications]
        Monitoring[Prometheus/Grafana<br/>Observability]
    end
    
    Web --> Dashboard
    Mobile --> Dashboard
    Dashboard --> Store
    Holdings --> Store
    Analytics --> Store
    Reports --> Store
    
    Store --> Query
    Query --> LB
    WS --> WSServer
    
    LB --> Auth
    Auth --> RateLimit
    RateLimit --> API
    RateLimit --> WSServer
    
    API --> Portfolio
    API --> Holdings
    API --> Transactions
    API --> Analytics
    
    Portfolio --> Advanced
    Portfolio --> Tax
    Portfolio --> Optimize
    
    Advanced --> Postgres
    Tax --> Postgres
    Optimize --> Postgres
    Market --> Redis
    Market --> AlphaVantage
    
    Worker --> Market
    Worker --> SMTP
    Worker --> Redis
    
    Portfolio --> Postgres
    Holdings --> Postgres
    Transactions --> Postgres
    Analytics --> Redis
    
    Reports --> S3
    
    API --> Monitoring
    Worker --> Monitoring
    
    style Advanced fill:#ff9999
    style Tax fill:#99ccff
    style Optimize fill:#99ff99
```

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as API
    participant S as Service Layer
    participant C as Calculation Engine
    participant D as Database
    participant R as Redis Cache
    participant M as Market Data
    
    Note over U,M: Portfolio Analytics Request
    
    U->>F: Click "View Analytics"
    F->>A: GET /api/portfolios/{id}/analytics
    A->>A: Validate JWT
    A->>S: AnalyticsService.getMetrics()
    
    S->>R: Check cache for recent data
    alt Cache Hit
        R-->>S: Return cached metrics
        S-->>A: Return data
    else Cache Miss
        S->>D: Fetch portfolio + holdings
        D-->>S: Portfolio data
        S->>M: Get current prices
        M-->>S: Latest prices
        
        S->>C: Calculate basic metrics
        Note over C: Total Value = Σ(shares × price)
        Note over C: Cost Basis = Σ(shares × avg_cost)
        Note over C: Unrealized G/L = value - cost
        C-->>S: Basic metrics
        
        S->>D: Fetch historical snapshots
        D-->>S: Snapshot data
        
        S->>C: Calculate performance
        Note over C: TWR = Π(1 + Ri) - 1
        Note over C: CAGR, Volatility, etc.
        C-->>S: Performance metrics
        
        S->>C: Calculate risk metrics
        Note over C: Sharpe = (Rp - Rf) / σ
        Note over C: VaR = value × z × σ × √t
        C-->>S: Risk metrics
        
        S->>C: Calculate allocation
        Note over C: By sector, asset type, etc.
        Note over C: HHI, Gini coefficient
        C-->>S: Allocation data
        
        S->>R: Cache results (5 min TTL)
        S-->>A: Complete analytics
    end
    
    A-->>F: JSON response
    F->>F: Update Zustand store
    F->>F: Re-render components
    F-->>U: Display analytics dashboard
    
    Note over U,M: Real-time Price Update
    
    M->>A: WebSocket: Price update
    A->>S: Process price update
    S->>C: Recalculate impacted holdings
    C-->>S: Updated values
    S->>F: WebSocket: Push update
    F->>F: Update store
    F-->>U: UI updates in real-time
```

## Calculation Engine Architecture

```mermaid
graph TB
    subgraph "Input Data"
        Holdings[Holdings Data<br/>Symbol, Shares, Cost]
        Prices[Current Prices<br/>Real-time Market Data]
        History[Historical Data<br/>Snapshots, Transactions]
        Benchmark[Benchmark Data<br/>S&P 500, etc.]
    end
    
    subgraph "Calculation Layers"
        L1[Layer 1: Basic Calculations<br/>Value, Cost, G/L, Day Change]
        L2[Layer 2: Time-Series Analysis<br/>Returns, TWR, CAGR]
        L3[Layer 3: Statistical Metrics<br/>Volatility, Correlation, Beta]
        L4[Layer 4: Risk-Adjusted Metrics<br/>Sharpe, Sortino, VaR]
        L5[Layer 5: Advanced Analytics<br/>Alpha, Optimization, Tax]
    end
    
    subgraph "Output Results"
        Summary[Portfolio Summary<br/>Total value, G/L, counts]
        Performance[Performance Metrics<br/>Returns, CAGR, benchmarks]
        Risk[Risk Analysis<br/>Volatility, VaR, drawdown]
        Allocation[Allocation Breakdown<br/>By sector, asset, geography]
        Quality[Quality Score<br/>Diversification, win rate]
        Recommendations[Actionable Recommendations<br/>Rebalance, harvest, etc.]
    end
    
    Holdings --> L1
    Prices --> L1
    L1 --> L2
    History --> L2
    L2 --> L3
    Benchmark --> L3
    L3 --> L4
    L4 --> L5
    
    L1 --> Summary
    L2 --> Performance
    L3 --> Risk
    L4 --> Risk
    L1 --> Allocation
    L3 --> Allocation
    L5 --> Quality
    L5 --> Recommendations
    
    Summary --> Cache[Redis Cache<br/>5 min TTL]
    Performance --> Cache
    Risk --> Cache
    Allocation --> Cache
    Quality --> Cache
    Recommendations --> Cache
    
    Cache --> API[REST API Response]
    
    style L1 fill:#e1f5ff
    style L2 fill:#fff4e1
    style L3 fill:#ffe1e1
    style L4 fill:#e1ffe1
    style L5 fill:#f5e1ff
```

## Calculation Dependency Graph

```mermaid
graph LR
    subgraph "Raw Data"
        A[Holdings:<br/>shares, cost_basis]
        B[Prices:<br/>current_price]
        C[History:<br/>snapshots]
    end
    
    subgraph "Level 1: Direct Calculations"
        D[Market Value<br/>= shares × price]
        E[Unrealized G/L<br/>= value - cost]
        F[Day Change<br/>= shares × Δprice]
    end
    
    subgraph "Level 2: Aggregations"
        G[Total Value<br/>= Σ(market_values)]
        H[Total G/L<br/>= Σ(unrealized_gl)]
        I[Portfolio Weight<br/>= value / total × 100]
    end
    
    subgraph "Level 3: Time Series"
        J[Daily Returns<br/>= Δvalue / value]
        K[Cumulative Return<br/>= Π(1 + Ri) - 1]
        L[Period Returns<br/>1M, 3M, YTD, etc.]
    end
    
    subgraph "Level 4: Statistical"
        M[Mean Return<br/>= Σ(Ri) / n]
        N[Volatility<br/>= StdDev × √252]
        O[Correlation<br/>with Benchmark]
    end
    
    subgraph "Level 5: Risk-Adjusted"
        P[Sharpe Ratio<br/>= excess / vol]
        Q[Sortino Ratio<br/>= excess / downside]
        R[Beta<br/>= Cov / Var]
    end
    
    subgraph "Level 6: Advanced"
        S[Alpha<br/>= Rp - CAPM]
        T[VaR<br/>= value × z × σ]
        U[HHI<br/>= Σ(wi²)]
    end
    
    A --> D
    B --> D
    D --> E
    A --> E
    D --> F
    B --> F
    
    D --> G
    E --> H
    G --> I
    D --> I
    
    G --> J
    C --> J
    J --> K
    J --> L
    
    J --> M
    J --> N
    J --> O
    
    M --> P
    N --> P
    M --> Q
    N --> Q
    O --> R
    
    P --> S
    R --> S
    N --> T
    G --> T
    I --> U
    
    style D fill:#e1f5ff
    style G fill:#fff4e1
    style J fill:#ffe1e1
    style M fill:#e1ffe1
    style P fill:#f5e1ff
    style S fill:#ffe1f5
```

## Tax Calculation Pipeline

```mermaid
graph TB
    Start[Tax Analysis Request] --> GetData[Fetch Portfolio Data]
    
    GetData --> ClassifyHoldings[Classify Holdings]
    
    ClassifyHoldings --> STCheck{Holding Period<br/>< 365 days?}
    STCheck -->|Yes| ShortTerm[Short-Term<br/>37% rate]
    STCheck -->|No| LongTerm[Long-Term<br/>20% rate]
    
    ShortTerm --> CalcUnrealized[Calculate<br/>Unrealized G/L]
    LongTerm --> CalcUnrealized
    
    CalcUnrealized --> STGains[ST Gains]
    CalcUnrealized --> STLosses[ST Losses]
    CalcUnrealized --> LTGains[LT Gains]
    CalcUnrealized --> LTLosses[LT Losses]
    
    STGains --> EstimateTax[Estimate Tax]
    STLosses --> EstimateTax
    LTGains --> EstimateTax
    LTLosses --> EstimateTax
    
    EstimateTax --> TaxCalc["Tax = (ST_net × 0.37) + (LT_net × 0.20)"]
    
    TaxCalc --> FindHarvest[Find Tax-Loss<br/>Harvesting Opportunities]
    
    FindHarvest --> FilterLosses[Filter Holdings<br/>with Loss > $100]
    FilterLosses --> CalcSavings["Savings = loss × rate"]
    CalcSavings --> Opportunities[Top 5<br/>Opportunities]
    
    Opportunities --> CheckWash[Check Wash<br/>Sale Risks]
    CheckWash --> WashCheck{"Recent buy<br/>within 30 days?"}
    WashCheck -->|Yes| WashRisk[Flag Risk]
    WashCheck -->|No| Safe[Safe]
    
    WashRisk --> Recommend[Generate<br/>Recommendations]
    Safe --> Recommend
    
    Recommend --> Return[Return Tax Analysis]
    
    style ClassifyHoldings fill:#e1f5ff
    style CalcUnrealized fill:#fff4e1
    style EstimateTax fill:#ffe1e1
    style FindHarvest fill:#e1ffe1
    style CheckWash fill:#f5e1ff
```

## Optimization Calculation Flow

```mermaid
graph TB
    Start[Optimization Request] --> GetSymbols[Get Asset Universe]
    
    GetSymbols --> FetchData[Fetch Historical<br/>Price Data]
    
    FetchData --> CalcReturns[Calculate<br/>Daily Returns]
    CalcReturns --> CalcStats[Calculate Statistics]
    
    CalcStats --> ExpReturn["Expected Return<br/>= mean(R) × 252"]
    CalcStats --> Volatility["Volatility<br/>= std(R) × √252"]
    CalcStats --> Covariance["Covariance Matrix<br/>Σ = Cov(Ri, Rj)"]
    
    ExpReturn --> ChooseMethod{Optimization<br/>Method?}
    Volatility --> ChooseMethod
    Covariance --> ChooseMethod
    
    ChooseMethod -->|ERC| EqualRisk["wi = (1/σi) / Σ(1/σj)"]
    ChooseMethod -->|Max Sharpe| MaxSharpe["Maximize<br/>(Rp - Rf) / σp"]
    ChooseMethod -->|Min Var| MinVar["Minimize<br/>wᵀΣw"]
    
    EqualRisk --> Weights[Optimal Weights]
    MaxSharpe --> Weights
    MinVar --> Weights
    
    Weights --> ApplyConstraints[Apply Constraints]
    ApplyConstraints --> MaxWeightCheck["wi ≤ max_weight"]
    ApplyConstraints --> MinWeightCheck["wi ≥ min_weight"]
    ApplyConstraints --> SumCheck["Σwi = 1"]
    
    MaxWeightCheck --> Normalize[Renormalize]
    MinWeightCheck --> Normalize
    SumCheck --> Normalize
    
    Normalize --> CalcMetrics[Calculate Portfolio<br/>Metrics]
    
    CalcMetrics --> PortReturn["Rp = Σ(wi × Ri)"]
    CalcMetrics --> PortVol["σp = √(wᵀΣw)"]
    CalcMetrics --> PortSharpe["Sharpe = (Rp - Rf) / σp"]
    
    PortReturn --> Frontier[Generate<br/>Efficient Frontier]
    PortVol --> Frontier
    PortSharpe --> Frontier
    
    Frontier --> Return[Return Optimized<br/>Portfolio]
    
    style CalcStats fill:#e1f5ff
    style ChooseMethod fill:#fff4e1
    style ApplyConstraints fill:#ffe1e1
    style CalcMetrics fill:#e1ffe1
    style Frontier fill:#f5e1ff
```

---

## Key Calculation Formulas Reference

### Basic Metrics
| Metric | Formula | Purpose |
|--------|---------|---------|
| Market Value | `shares × current_price` | Current position value |
| Cost Basis | `shares × average_cost` | Total amount invested |
| Unrealized G/L | `market_value - cost_basis` | Paper profit/loss |
| Day Change | `shares × (price_today - price_yesterday)` | Daily P&L |

### Performance Metrics
| Metric | Formula | Purpose |
|--------|---------|---------|
| Simple Return | `(end_value - start_value) / start_value` | Total return % |
| TWR | `Π(1 + Ri) - 1` | Time-weighted return |
| CAGR | `(end/start)^(1/years) - 1` | Annualized return |
| Volatility | `StdDev(returns) × √252` | Annual risk measure |

### Risk Metrics
| Metric | Formula | Purpose |
|--------|---------|---------|
| Sharpe Ratio | `(Rp - Rf) / σp` | Risk-adjusted return |
| Sortino Ratio | `(Rp - Rf) / σd` | Downside risk-adjusted |
| Beta | `Cov(Rp, Rm) / Var(Rm)` | Market sensitivity |
| Alpha | `Rp - [Rf + β(Rm - Rf)]` | Excess return |
| VaR (95%) | `value × 1.645 × σ × √days` | Maximum likely loss |

### Concentration Metrics
| Metric | Formula | Purpose |
|--------|---------|---------|
| HHI | `Σ(wi²)` | Concentration index |
| Gini Coefficient | Complex formula | Equality measure |
| Effective Holdings | `1 / HHI` | "True" diversification |

### Tax Metrics
| Metric | Formula | Purpose |
|--------|---------|---------|
| ST Tax | `gains × 0.37` | Short-term tax |
| LT Tax | `gains × 0.20` | Long-term tax |
| Tax Savings | `loss × tax_rate` | Harvesting benefit |

---

## Performance Benchmarks

### Calculation Speed
- Basic metrics: < 50ms
- Performance history: < 200ms
- Full analytics: < 500ms
- Tax analysis: < 300ms
- Optimization: < 2s

### Cache Strategy
- Price data: 1 min TTL
- Basic metrics: 5 min TTL
- Analytics: 5 min TTL
- Historical data: 1 hour TTL
- Reference data: 24 hour TTL

### Scalability
- Holdings per portfolio: Up to 1,000
- Portfolios per user: Up to 100
- Concurrent users: 1,000+
- API requests: 10,000/min
- WebSocket connections: 5,000 concurrent

