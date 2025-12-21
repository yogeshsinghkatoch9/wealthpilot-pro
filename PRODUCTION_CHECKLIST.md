# WealthPilot Pro - Production Deployment Checklist

## Pre-Deployment Security

- [ ] **JWT_SECRET** - Set strong 128+ character secret
  ```bash
  openssl rand -hex 64
  ```
- [ ] **All API keys rotated** - Never use keys that were in git history
- [ ] **Supabase password changed** - If using cloud database
- [ ] **.env file** - Verify not in git, permissions set to 600
- [ ] **HTTPS enabled** - SSL/TLS certificate configured
- [ ] **NODE_ENV=production** - Set in environment

## Environment Variables (Required)

```bash
# CRITICAL - Must be set
NODE_ENV=production
JWT_SECRET=<128-char-secret>
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# API Keys (at least one market data provider)
ALPHA_VANTAGE_API_KEY=<your-key>
FMP_API_KEY=<your-key>

# Optional but recommended
OPENAI_API_KEY=<your-key>  # For AI features
NEWS_API_KEY=<your-key>    # For news features
```

## Infrastructure

- [ ] **Database** - Consider PostgreSQL for production scale
- [ ] **Redis** - Add for session storage and caching (optional)
- [ ] **Load balancer** - If running multiple instances
- [ ] **Reverse proxy** - Nginx or similar for SSL termination
- [ ] **Process manager** - PM2 or similar for auto-restart

## PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Start with ecosystem config
pm2 start ecosystem.config.js --env production

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

## Docker Deployment

```bash
# Build production image
docker build -f Dockerfile.prod -t wealthpilot-pro .

# Run container
docker run -d \
  --name wealthpilot \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=<your-secret> \
  -e ALPHA_VANTAGE_API_KEY=<your-key> \
  wealthpilot-pro
```

## Monitoring

- [ ] **Health checks** - Monitor `/health` endpoint
- [ ] **Error tracking** - Consider Sentry or similar
- [ ] **Log aggregation** - Centralize logs
- [ ] **Uptime monitoring** - External ping service

## Security Headers (Already Configured)

The following are automatically applied:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options (Clickjacking protection)
- X-Content-Type-Options (MIME sniffing protection)
- Referrer-Policy

## Rate Limits (Already Configured)

| Endpoint Type | Limit |
|--------------|-------|
| General API | 1000 req/15min |
| Authentication | 5 req/15min |
| Market Data | 60 req/min |

## Post-Deployment Verification

```bash
# Test health endpoint
curl https://yourdomain.com/health

# Test authentication
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'

# Test market data
curl https://yourdomain.com/api/market/quote/AAPL
```

## Backup Strategy

- [ ] **Database backups** - Daily automated backups
- [ ] **Backup testing** - Regular restore tests
- [ ] **Offsite storage** - Store backups externally

## Emergency Procedures

1. **Rollback**: Keep previous version ready
2. **Kill switch**: Ability to disable features
3. **Contact list**: Team contacts for incidents

---

Generated: 2025-12-18
Version: 27.0
