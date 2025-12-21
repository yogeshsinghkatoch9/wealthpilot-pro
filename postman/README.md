# WealthPilot Pro - Postman Collection

Complete API collection for testing and documenting the WealthPilot Pro API.

## Files

| File | Description |
|------|-------------|
| `WealthPilot-Pro-API.postman_collection.json` | Complete API collection with all endpoints |
| `WealthPilot-Pro.postman_environment.json` | Development environment variables |
| `WealthPilot-Pro-Production.postman_environment.json` | Production environment variables |

## Quick Start

### Option 1: Import via Postman UI

1. Open Postman
2. Click **Import** (top-left)
3. Drag and drop the collection file (`WealthPilot-Pro-API.postman_collection.json`)
4. Import the environment file (`WealthPilot-Pro.postman_environment.json`)
5. Select the environment from the dropdown (top-right)

### Option 2: Import via Postman CLI

```bash
# Install Postman CLI
npm install -g postman-cli

# Import collection
postman collection import WealthPilot-Pro-API.postman_collection.json

# Import environment
postman environment import WealthPilot-Pro.postman_environment.json
```

## API Endpoints Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### Two-Factor Authentication (2FA)
- `POST /api/2fa/setup` - Initialize 2FA setup
- `POST /api/2fa/verify` - Verify 2FA token
- `GET /api/2fa/status` - Check 2FA status
- `POST /api/2fa/disable` - Disable 2FA
- `POST /api/2fa/backup-codes` - Regenerate backup codes

### Portfolios
- `GET /api/portfolios` - List all portfolios
- `POST /api/portfolios` - Create portfolio
- `GET /api/portfolios/:id` - Get portfolio details
- `PUT /api/portfolios/:id` - Update portfolio
- `DELETE /api/portfolios/:id` - Delete portfolio

### Holdings
- `GET /api/portfolios/:id/holdings` - List holdings
- `POST /api/portfolios/:id/holdings` - Add holding
- `PUT /api/holdings/:id` - Update holding
- `DELETE /api/holdings/:id` - Delete holding

### Market Data
- `GET /api/market/quote/:symbol` - Get stock quote
- `GET /api/market/historical/:symbol` - Get historical data
- `GET /api/market/search` - Search symbols
- `GET /api/market/movers` - Get top movers

### Analytics
- `GET /api/analytics/risk/:portfolioId` - Portfolio risk metrics
- `GET /api/analytics/correlation/:portfolioId` - Correlation matrix
- `GET /api/analytics/attribution/:portfolioId` - Performance attribution

### Watchlists
- `GET /api/watchlists` - List watchlists
- `POST /api/watchlists` - Create watchlist
- `PUT /api/watchlists/:id` - Update watchlist
- `DELETE /api/watchlists/:id` - Delete watchlist

### Alerts
- `GET /api/alerts` - List alerts
- `POST /api/alerts` - Create alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert

### Transactions
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Record transaction
- `DELETE /api/transactions/:id` - Delete transaction

### News & Research
- `GET /api/news` - Get market news
- `GET /api/news/:symbol` - Get symbol-specific news
- `GET /api/research/:symbol` - Get research data
- `GET /api/sentiment/:symbol` - Get sentiment analysis

### Technical Analysis
- `GET /api/technical/indicators/:symbol` - Technical indicators
- `GET /api/technical/signals/:symbol` - Trading signals

### Calendars
- `GET /api/calendar/economic` - Economic calendar
- `GET /api/calendar/earnings` - Earnings calendar
- `GET /api/calendar/ipo` - IPO calendar
- `GET /api/calendar/dividends` - Dividend calendar

## Auto-Authentication

The collection includes automatic token management:

1. **Login Request** - Automatically saves the JWT token to `{{auth_token}}`
2. **All Protected Routes** - Automatically use `{{auth_token}}` in the Authorization header

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `base_url` | API base URL | `http://localhost:4000` |
| `auth_token` | JWT token (auto-filled on login) | `eyJhbG...` |
| `portfolio_id` | Current portfolio ID | `1` |
| `test_symbol` | Default stock symbol for testing | `AAPL` |
| `test_email` | Test user email | `test@example.com` |
| `test_password` | Test user password | `TestPassword123!` |

## Running Collection Tests

```bash
# Run all tests
newman run WealthPilot-Pro-API.postman_collection.json \
  -e WealthPilot-Pro.postman_environment.json

# Run with HTML report
newman run WealthPilot-Pro-API.postman_collection.json \
  -e WealthPilot-Pro.postman_environment.json \
  -r htmlextra

# Run specific folder
newman run WealthPilot-Pro-API.postman_collection.json \
  -e WealthPilot-Pro.postman_environment.json \
  --folder "Authentication"
```

## Sync with Postman API

To sync collections with your Postman workspace:

```bash
# Set your API key
export POSTMAN_API_KEY="your-api-key"

# Upload collection
curl -X POST "https://api.getpostman.com/collections" \
  -H "X-Api-Key: $POSTMAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d @WealthPilot-Pro-API.postman_collection.json
```

## Tips

1. **Start with Authentication** - Always run the Login request first to get a token
2. **Use Variables** - Update `portfolio_id` after creating a portfolio
3. **Check Response Tests** - Many requests include test scripts that validate responses
4. **Environment Switching** - Use Development for local testing, Production for live API
