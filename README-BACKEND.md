# WealthPilot Pro - Full Stack Portfolio Management Dashboard

A complete, production-ready portfolio management system with real backend functionality.

## 🚀 Quick Start

```bash
# 1. Start the application
./start.sh

# 2. Open in browser
http://localhost:3000

# 3. Login with demo credentials
Email: demo@wealthpilot.com
Password: demo123456
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     WealthPilot Pro                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │  Frontend   │───▶│  Backend    │───▶│   Database      │ │
│  │  (Port 3000)│    │  (Port 4000)│    │   (SQLite/JSON) │ │
│  │             │    │             │    │                 │ │
│  │  • EJS      │    │  • Express  │    │  • Users        │ │
│  │  • Tailwind │    │  • JWT Auth │    │  • Portfolios   │ │
│  │  • Chart.js │    │  • REST API │    │  • Holdings     │ │
│  └─────────────┘    └─────────────┘    │  • Transactions │ │
│                                        │  • Watchlists   │ │
│                                        └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
wealthpilot-pro/
├── frontend/                 # EJS + Tailwind CSS frontend
│   ├── views/
│   │   ├── pages/           # 137 dashboard pages
│   │   ├── partials/        # Shared components
│   │   └── layouts/         # Page layouts
│   └── src/
│       ├── server.ts        # Express server
│       └── api/             # API client
│
├── backend/                  # Node.js Express API
│   ├── src/
│   │   ├── routes/          # API routes
│   │   │   ├── auth.js      # Authentication
│   │   │   ├── portfolios.js
│   │   │   ├── holdings.js
│   │   │   ├── transactions.js
│   │   │   ├── watchlists.js
│   │   │   ├── alerts.js
│   │   │   ├── market.js
│   │   │   ├── dividends.js
│   │   │   └── analytics.js
│   │   ├── services/        # Business logic
│   │   │   ├── marketData.js
│   │   │   ├── analytics.js
│   │   │   └── snapshot.js
│   │   ├── middleware/
│   │   └── db/
│   │       └── simpleDb.js  # In-memory database
│   └── data/
│       └── db.json          # Persistent data store
│
├── start.sh                 # Launch script
├── docker-compose.yml       # Docker deployment
└── README.md
```

## 🔌 API Endpoints

### Authentication
```
POST /api/auth/register     - Create new account
POST /api/auth/login        - Login and get JWT token
POST /api/auth/logout       - Invalidate session
POST /api/auth/refresh      - Refresh JWT token
GET  /api/auth/me           - Get current user
PUT  /api/auth/password     - Change password
```

### Portfolios
```
GET    /api/portfolios           - List all portfolios
GET    /api/portfolios/:id       - Get portfolio details
POST   /api/portfolios           - Create portfolio
PUT    /api/portfolios/:id       - Update portfolio
DELETE /api/portfolios/:id       - Delete portfolio
GET    /api/portfolios/:id/performance  - Performance metrics
GET    /api/portfolios/:id/allocation   - Allocation breakdown
GET    /api/portfolios/:id/dividends    - Dividend analysis
GET    /api/portfolios/:id/risk         - Risk metrics
```

### Holdings
```
POST   /api/holdings           - Add holding
GET    /api/holdings/:id       - Get holding details
PUT    /api/holdings/:id       - Update holding
DELETE /api/holdings/:id       - Delete (sell all)
POST   /api/holdings/:id/sell  - Partial sale with tax lot selection
```

### Transactions
```
GET    /api/transactions       - List transactions
POST   /api/transactions       - Create transaction
DELETE /api/transactions/:id   - Delete transaction
POST   /api/transactions/import - Bulk import
```

### Market Data
```
GET /api/market/quote/:symbol   - Get stock quote
GET /api/market/quotes?symbols= - Get multiple quotes
GET /api/market/profile/:symbol - Company profile
GET /api/market/history/:symbol - Historical prices
GET /api/market/search?q=       - Search stocks
GET /api/market/movers          - Market movers
```

### Analytics
```
GET /api/analytics/dashboard     - Dashboard summary
GET /api/analytics/performance   - Overall performance
GET /api/analytics/risk          - Risk metrics
GET /api/analytics/allocation    - Allocation analysis
GET /api/analytics/tax-lots      - Tax lot analysis
GET /api/analytics/correlations  - Holding correlations
```

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:

```bash
curl -X GET http://localhost:4000/api/portfolios \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Get a token by logging in:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@wealthpilot.com","password":"demo123456"}'
```

## 📊 Features

### Portfolio Management
- ✅ Create multiple portfolios
- ✅ Track holdings with cost basis
- ✅ Tax lot tracking (FIFO, LIFO, HIFO)
- ✅ Transaction history
- ✅ Cash balance management

### Analytics
- ✅ Performance tracking
- ✅ Sector allocation
- ✅ Risk metrics (Sharpe, Sortino, Beta)
- ✅ Dividend analysis
- ✅ Tax lot optimization

### Market Data
- ✅ Real-time quotes (Alpha Vantage)
- ✅ Historical prices
- ✅ Company profiles
- ✅ Mock data fallback

### User Features
- ✅ JWT authentication
- ✅ Watchlists
- ✅ Price alerts
- ✅ User preferences

## 🐳 Docker Deployment

```bash
# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Install Dependencies
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### Run Development Servers
```bash
# Both servers
./start.sh

# Or individually:
cd backend && npm run dev   # Port 4000
cd frontend && npm run dev  # Port 3000
```

### Seed Database
```bash
cd backend
node seed-simple.js
```

## 📈 Market Data Integration

The app uses Alpha Vantage API for market data. The free tier allows:
- 5 API calls per minute
- 500 calls per day

To use your own API key, update `backend/.env`:
```
ALPHA_VANTAGE_API_KEY=your_key_here
```

When rate limited or offline, the app falls back to mock data.

## 🔧 Configuration

### Backend Environment Variables
```env
# Database
DATABASE_URL="file:./data/db.json"

# Authentication
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# Server
PORT=4000
NODE_ENV=development

# Market Data
ALPHA_VANTAGE_API_KEY="your-key"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3000"
```

## 📱 Frontend Pages (137 total)

### Core
- Dashboard, Portfolio, Holdings, Transactions
- Watchlist, Alerts, Reports, Settings

### Analytics
- Performance, Allocation, Sectors, Dividends
- Risk Analysis, Tax Lots, Correlations

### Technical
- Bollinger Bands, Volume Profile, RSI, MACD
- Moving Averages, Support/Resistance

### Fundamentals
- Income Statement, Balance Sheet, Cash Flow
- Earnings, Revenue, Margins, Ratios

## 🚢 Production Deployment

1. Set secure environment variables
2. Use PostgreSQL instead of SQLite
3. Enable HTTPS
4. Set up monitoring and logging
5. Configure rate limiting
6. Set up backup strategy

## 📄 License

MIT License - feel free to use for commercial projects.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

Built with ❤️ for wealth advisors and RIAs
