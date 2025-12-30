# WealthPilot Pro

```
██╗    ██╗███████╗ █████╗ ██╗  ████████╗██╗  ██╗██████╗ ██╗██╗      ██████╗ ████████╗
██║    ██║██╔════╝██╔══██╗██║  ╚══██╔══╝██║  ██║██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝
██║ █╗ ██║█████╗  ███████║██║     ██║   ███████║██████╔╝██║██║     ██║   ██║   ██║
██║███╗██║██╔══╝  ██╔══██║██║     ██║   ██╔══██║██╔═══╝ ██║██║     ██║   ██║   ██║
╚███╔███╔╝███████╗██║  ██║███████╗██║   ██║  ██║██║     ██║███████╗╚██████╔╝   ██║
 ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝ ╚═════╝    ╚═╝
```

**Professional Portfolio Management Platform**

A comprehensive, full-stack portfolio management application with real-time market data, advanced analytics, and AI-powered insights.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)

---

## Features

- **Portfolio Management** - Create, track, and manage multiple investment portfolios
- **Real-Time Market Data** - Live stock quotes, indices, and market movers
- **Portfolio Upload** - Import portfolios from CSV, Excel, or JSON files
- **Advanced Analytics** - Performance metrics, sector allocation, risk analysis
- **Technical Indicators** - Moving averages, RSI, MACD, Bollinger Bands
- **Tax-Loss Harvesting** - Identify tax optimization opportunities
- **Watchlists** - Track stocks you're interested in
- **Alerts** - Price alerts and portfolio notifications
- **AI Insights** - AI-powered market analysis and recommendations
- **Dark/Light Theme** - Modern, responsive UI

---

## Tech Stack

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Database:** PostgreSQL (production) / SQLite (development)
- **ORM:** Prisma
- **Authentication:** JWT with HTTP-only cookies
- **Cache:** Redis

### Frontend
- **Runtime:** Node.js 18+
- **Template Engine:** EJS
- **Styling:** Tailwind CSS
- **Charts:** Chart.js, Lightweight Charts

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Reverse Proxy:** Nginx (optional)
- **Cloud:** AWS EC2 (or any cloud provider)

---

## Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **npm** 9+
- **Docker** & **Docker Compose** (for containerized deployment)
- **PostgreSQL** 14+ (or use Docker)
- **Redis** (optional, for caching)

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yogeshsinghkatoch9/wealthpilot-pro.git
cd wealthpilot-pro

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Access the app
# Frontend: http://localhost:3000
# API: http://localhost:4000
```

### Option 2: Manual Setup

#### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/yogeshsinghkatoch9/wealthpilot-pro.git
cd wealthpilot-pro

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

#### 2. Configure Environment

```bash
# Backend environment
cp backend/.env.example backend/.env

# Edit with your settings
nano backend/.env
```

#### 3. Setup Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed demo data
npx prisma db seed
```

#### 4. Start the Application

```bash
# Terminal 1: Start backend
cd backend
npm start

# Terminal 2: Start frontend
cd frontend
npm run build
npm start
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wealthpilot

# Authentication
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Server
PORT=4000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# Market Data APIs (get free keys)
ALPHA_VANTAGE_API_KEY=your-key
FINNHUB_API_KEY=your-key
POLYGON_API_KEY=your-key
FMP_API_KEY=your-key

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-app-password
```

### Root (`.env` for Docker)

```env
# PostgreSQL
POSTGRES_USER=wealthpilot
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=wealthpilot

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

---

## API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/logout` | POST | Logout user |
| `/api/auth/me` | GET | Get current user |

### Portfolios

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolios` | GET | List all portfolios |
| `/api/portfolios` | POST | Create portfolio |
| `/api/portfolios/:id` | GET | Get portfolio details |
| `/api/portfolios/:id` | PUT | Update portfolio |
| `/api/portfolios/:id` | DELETE | Delete portfolio |
| `/api/portfolios/:id/holdings` | POST | Add holding |

### Market Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market/quote/:symbol` | GET | Get stock quote |
| `/api/market/indices` | GET | Get market indices |
| `/api/market/movers` | GET | Get market movers |
| `/api/market/search` | GET | Search stocks |

### Portfolio Upload

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolio-upload/upload` | POST | Upload portfolio file |

---

## Project Structure

```
wealthpilot-pro/
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, validation
│   │   ├── db/             # Database utilities
│   │   └── utils/          # Helpers
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── package.json
├── frontend/
│   ├── src/
│   │   └── server.ts       # Express server
│   ├── views/
│   │   ├── pages/          # EJS templates
│   │   └── partials/       # Reusable components
│   ├── public/
│   │   ├── js/             # Client-side JS
│   │   └── css/            # Stylesheets
│   └── package.json
├── docker-compose.prod.yml
├── docker-compose.yml
└── README.md
```

---

## Deployment

### AWS EC2

```bash
# SSH into your instance
ssh ec2-user@your-instance-ip

# Clone repo
git clone https://github.com/yogeshsinghkatoch9/wealthpilot-pro.git
cd wealthpilot-pro

# Setup environment
cp .env.example .env
nano .env  # Add your configuration

# Deploy with Docker
docker compose -f docker-compose.prod.yml up -d

# Open ports in security group:
# - 3000 (Frontend)
# - 4000 (API)
# - 5432 (PostgreSQL - optional)
```

### Health Checks

```bash
# Backend health
curl http://localhost:4000/health

# Frontend health
curl http://localhost:3000/health
```

---

## Development

```bash
# Start backend in development mode
cd backend
npm run dev

# Start frontend in development mode
cd frontend
npm run dev
```

---

## Testing

```bash
# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/yogeshsinghkatoch9/wealthpilot-pro/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yogeshsinghkatoch9/wealthpilot-pro/discussions)

---

## Acknowledgments

- [Alpha Vantage](https://www.alphavantage.co/) - Market data API
- [Finnhub](https://finnhub.io/) - Real-time stock data
- [TradingView](https://www.tradingview.com/) - Lightweight Charts library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework

---

Made with dedication by [Yogesh Singh Katoch](https://github.com/yogeshsinghkatoch9)
