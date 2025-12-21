# Railway Deployment Guide

## Quick Deploy (Recommended)

### Option 1: Deploy from GitHub (Easiest)

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Select `yogeshsinghkatoch9/wealthpilot-pro`
4. Railway will auto-detect the configuration

### Option 2: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login (opens browser)
railway login

# Initialize project
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete"
railway init

# Deploy
railway up
```

---

## ⚠️ CRITICAL: Connect PostgreSQL to Backend

**This step is required for the app to work!**

### Step 1: Add PostgreSQL Database
1. In Railway Dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Wait for PostgreSQL to start

### Step 2: Link PostgreSQL to Backend Service
1. Click on your **backend service** (wealthpilot-pro)
2. Go to **"Variables"** tab
3. Click **"Add Variable"** → **"Add Reference"**
4. Select **PostgreSQL** → **DATABASE_URL**
5. This creates: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`

### Step 3: Verify the Connection
After adding the variable, your backend should show:
```
📦 Database: Using PostgreSQL adapter
PostgreSQL connected successfully
```

---

## Environment Variables

After deploying, add these in Railway Dashboard → Variables:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ **REQUIRED** |
| `NODE_ENV` | `production` | ✅ |
| `PORT` | `4000` | ✅ |
| `JWT_SECRET` | (generate secure key) | ✅ |
| `ALPHA_VANTAGE_API_KEY` | (your API key) | Optional |
| `FINNHUB_API_KEY` | (your API key) | Optional |
| `POLYGON_API_KEY` | (your API key) | Optional |
| `FMP_API_KEY` | (your API key) | Optional |
| `OPENAI_API_KEY` | (your API key) | Optional |
| `NEWS_API_KEY` | (your API key) | Optional |

---

## Add Redis (Optional)

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Railway auto-generates `REDIS_URL`
3. Add reference: `REDIS_URL = ${{Redis.REDIS_URL}}`
4. Enables distributed caching

---

## Generate Public Domain

1. Click on your backend service
2. Go to **"Settings"** → **"Networking"**
3. Click **"Generate Domain"**
4. You'll get a URL like: `https://wealthpilot-pro-production.up.railway.app`

---

## Verify Deployment

After deployment, test these endpoints:
```bash
# Health check
curl https://your-app.railway.app/health

# API test
curl https://your-app.railway.app/api/portfolios
```

---

## Troubleshooting

### Error: "invalid ELF header" or "better-sqlite3" errors
- **Cause**: SQLite native module incompatibility
- **Fix**: Add `DATABASE_URL` variable to use PostgreSQL instead

### Error: "POSTGRES_URL environment variable is required"
- **Cause**: PostgreSQL not linked to backend
- **Fix**: Go to Variables → Add Reference → PostgreSQL → DATABASE_URL

### App keeps restarting
- **Cause**: Missing required environment variables
- **Fix**: Ensure `DATABASE_URL`, `JWT_SECRET`, and `PORT` are set

---

## Custom Domain

1. Go to Settings → Domains
2. Add your domain
3. Configure DNS (CNAME to railway.app)
