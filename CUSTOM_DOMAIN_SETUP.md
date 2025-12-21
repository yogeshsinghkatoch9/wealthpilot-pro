# Custom Domain Setup Guide

## Vercel Custom Domain

### Step 1: Add Domain in Vercel

1. Go to https://vercel.com/yogesh-singh-katoch-s-projects/wealthpilot-pro/settings/domains
2. Click **"Add Domain"**
3. Enter your domain (e.g., `api.yourdomain.com` or `wealthpilot.yourdomain.com`)
4. Click **"Add"**

### Step 2: Configure DNS

Vercel will show you DNS records to add. Choose one:

**Option A: CNAME (Recommended for subdomains)**
```
Type: CNAME
Name: api (or www, app, etc.)
Value: cname.vercel-dns.com
```

**Option B: A Record (For apex/root domain)**
```
Type: A
Name: @
Value: 76.76.21.21
```

### Step 3: Verify SSL

- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes for propagation
- Your domain will have HTTPS automatically

---

## Railway Custom Domain

### Step 1: Add Domain in Railway

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Settings** → **Domains**
4. Click **"+ Custom Domain"**
5. Enter your domain

### Step 2: Configure DNS

Add a CNAME record:
```
Type: CNAME
Name: backend (or api)
Value: your-project.up.railway.app
```

### Step 3: SSL

- Railway auto-provisions SSL via Let's Encrypt
- HTTPS is enabled automatically

---

## DNS Provider Instructions

### Cloudflare
1. Go to DNS settings
2. Add record → Select CNAME
3. Name: `api` | Target: `cname.vercel-dns.com`
4. Proxy status: DNS only (gray cloud) initially

### GoDaddy
1. Go to DNS Management
2. Add → CNAME
3. Host: `api` | Points to: `cname.vercel-dns.com`

### Namecheap
1. Advanced DNS
2. Add New Record → CNAME
3. Host: `api` | Value: `cname.vercel-dns.com`

### Google Domains
1. DNS → Custom records
2. Add CNAME: `api` → `cname.vercel-dns.com`

---

## Verify Setup

After DNS propagation (5-30 minutes):

```bash
# Check DNS
dig api.yourdomain.com

# Test HTTPS
curl https://api.yourdomain.com/health

# Check SSL certificate
openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com
```

---

## Current Live URLs

| Platform | URL | SSL |
|----------|-----|-----|
| Vercel | https://wealthpilot-pro.vercel.app | ✅ Auto |
| GitHub | https://github.com/yogeshsinghkatoch9/wealthpilot-pro | N/A |
