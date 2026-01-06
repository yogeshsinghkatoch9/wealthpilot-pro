# WealthPilot Pro

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

A comprehensive, open-source wealth management platform with real-time market data, portfolio analytics, and advanced trading tools.

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

| Layer | Technologies |
|-------|--------------|
| Backend | Node.js, Express.js, Prisma ORM |
| Database | PostgreSQL (prod), SQLite (dev) |
| Cache | Redis |
| Frontend | EJS, TailwindCSS, Lightweight Charts |
| Real-time | WebSocket, Socket.io |
| APIs | Alpha Vantage, Polygon, Finnhub, Twelve Data |

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

# API Keys (get free keys from these providers)
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=
FINNHUB_API_KEY=
```

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

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a PR.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

Please read our [Security Policy](SECURITY.md) for reporting vulnerabilities.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Yogesh Singh Katoch**

## Acknowledgments

- [Alpha Vantage](https://www.alphavantage.co/) for market data
- [TradingView](https://www.tradingview.com/) for Lightweight Charts
- [Tailwind CSS](https://tailwindcss.com/) for styling
- All open source contributors
