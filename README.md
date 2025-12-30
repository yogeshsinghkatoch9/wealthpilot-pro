# WealthPilot Pro

A comprehensive wealth management platform with real-time market data, portfolio analytics, and advanced trading tools.

## Features

### Portfolio Management
- Multi-portfolio tracking with real-time valuations
- Holdings breakdown with allocation visualization
- Transaction history and performance metrics
- Benchmark comparison (S&P 500, custom benchmarks)

### Market Data
- Real-time quotes for 100,000+ securities
- Market overview with indices, sectors, breadth
- Top movers, sector rotation, heatmaps
- Economic and earnings calendars

### Technical Analysis
- Interactive charting with 20+ indicators
- RSI, MACD, Bollinger Bands, Stochastic
- Multiple timeframes (1min to Monthly)
- Pattern recognition and backtesting

### Fundamental Analysis
- Company financials (Income, Balance Sheet, Cash Flow)
- Valuation metrics (P/E, P/B, EV/EBITDA, DCF)
- Analyst ratings and price targets
- Insider trading and institutional ownership

### Options Trading
- Full options chain with Greeks
- Options flow and unusual activity
- Strategy builder (spreads, straddles)
- IV surface analysis

### Additional Features
- Tax-loss harvesting tools
- Dividend tracking and income projections
- Risk metrics (Beta, Sharpe, VaR)
- AI-powered insights
- Real-time alerts and notifications
- Multi-brokerage connectivity

## Tech Stack

### Backend
- Node.js + Express.js
- PostgreSQL (production) / SQLite (development)
- Redis for caching
- WebSocket for real-time data
- Prisma ORM

### Frontend
- Node.js + Express.js
- EJS templating
- TailwindCSS
- Lightweight Charts
- Socket.io

### APIs Integrated
- Alpha Vantage
- Polygon.io
- Finnhub
- Twelve Data
- Yahoo Finance

## Project Structure

```
wealthpilot-pro/
├── backend/
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Auth, rate limiting
│   │   └── db/              # Database setup
│   ├── prisma/              # Database schema
│   └── package.json
├── frontend/
│   ├── src/                 # Server & utilities
│   ├── views/
│   │   ├── pages/           # 178 page templates
│   │   └── partials/        # Reusable components
│   ├── public/
│   │   ├── css/             # Stylesheets
│   │   └── js/              # Client-side scripts
│   └── package.json
├── docker-compose.yml
└── .github/workflows/       # CI/CD
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or SQLite for dev)
- Redis 7

### Installation

```bash
# Clone repository
git clone https://github.com/yogeshsinghkatoch9/wealthpilot-pro.git
cd wealthpilot-pro

# Install backend dependencies
cd backend
npm install
cp .env.example .env  # Configure environment variables

# Install frontend dependencies
cd ../frontend
npm install

# Start development
cd ../backend && npm run dev
cd ../frontend && npm run dev
```

### Environment Variables

```env
# Backend (.env)
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost:5432/wealthpilot
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key

# API Keys
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=
FINNHUB_API_KEY=
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### AWS EC2

Push to `main` branch triggers automatic deployment via GitHub Actions.

## API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/login`, `/api/auth/register` |
| Portfolios | `/api/portfolios`, `/api/portfolios/:id` |
| Holdings | `/api/holdings`, `/api/holdings/:id` |
| Market | `/api/market/quote/:symbol`, `/api/market/movers` |
| Watchlist | `/api/watchlists`, `/api/watchlists/:id` |
| Alerts | `/api/alerts`, `/api/alerts/:id` |

See full API documentation at `/api/docs` (Swagger UI).

## Live Demo

- **URL**: http://18.220.78.166:3000
- **Demo Account**: demo@wealthpilot.pro / DemoPass123!

## License

Proprietary - All rights reserved.
