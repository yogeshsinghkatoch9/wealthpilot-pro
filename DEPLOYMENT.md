# WealthPilot Pro - Production Deployment Guide

Complete guide for deploying WealthPilot Pro to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Deployment](#docker-deployment)
4. [Database Setup](#database-setup)
5. [SSL/HTTPS Configuration](#ssl-https-configuration)
6. [Monitoring & Logging](#monitoring--logging)
7. [Backup & Recovery](#backup--recovery)
8. [Scaling](#scaling)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Server**: Ubuntu 20.04 LTS or newer
- **RAM**: Minimum 4GB, Recommended 8GB+
- **CPU**: Minimum 2 cores, Recommended 4+ cores
- **Storage**: Minimum 50GB SSD
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

### Required Software

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/wealthpilot-pro.git
cd wealthpilot-pro
```

### 2. Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

**Required Variables:**

```env
# CRITICAL - Change these!
JWT_SECRET=your-production-secret-here
FMP_API_KEY=your-financial-modeling-prep-api-key

# Database
DATABASE_URL=file:./data/wealthpilot.db

# Frontend
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# Email (if using notifications)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Generate Secure JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Docker Deployment

### Quick Start (Development)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access application
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
```

### Production Deployment

```bash
# Use deployment script
./scripts/deploy.sh production

# Or manually:
docker-compose -f docker-compose.prod.yml up -d
```

### Service Management

```bash
# Stop services
docker-compose down

# Restart services
docker-compose restart

# View running containers
docker ps

# View resource usage
docker stats
```

---

## Database Setup

### Initial Setup

```bash
# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Seed initial data (optional)
docker-compose exec backend npm run seed
```

### Database Backup

```bash
# Create backup
docker-compose exec backend sqlite3 data/wealthpilot.db .dump > backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T backend sqlite3 data/wealthpilot.db < backup_20241217.sql
```

### Automated Backups

Create a cron job:
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /opt/wealthpilot && docker-compose exec -T backend sqlite3 data/wealthpilot.db .dump > backups/backup_$(date +\%Y\%m\%d).sql
```

---

## SSL/HTTPS Configuration

### Using Nginx (Recommended)

1. **Install Certbot:**
```bash
sudo apt install certbot python3-certbot-nginx
```

2. **Generate SSL Certificate:**
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

3. **Configure Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

4. **Auto-Renewal:**
```bash
sudo certbot renew --dry-run
```

---

## Monitoring & Logging

### Application Logs

```bash
# View all logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# View frontend logs only
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Health Checks

```bash
# Backend health
curl http://localhost:4000/health

# Frontend health
curl http://localhost:3000/health
```

### Monitoring Tools

**Recommended:**
- **Prometheus + Grafana**: Metrics and dashboards
- **Sentry**: Error tracking
- **Datadog**: APM and logs
- **New Relic**: Performance monitoring

---

## Backup & Recovery

### Full Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/opt/wealthpilot/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T backend sqlite3 data/wealthpilot.db .dump > $BACKUP_DIR/db_$DATE.sql

# Backup uploads (if any)
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /opt/wealthpilot/backend uploads/

# Remove backups older than 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

### Disaster Recovery

1. **Restore Database:**
```bash
docker-compose exec -T backend sqlite3 data/wealthpilot.db < backups/db_20241217_020000.sql
```

2. **Restore Uploads:**
```bash
tar -xzf backups/uploads_20241217_020000.tar.gz -C /opt/wealthpilot/backend
```

3. **Restart Services:**
```bash
docker-compose restart
```

---

## Scaling

### Horizontal Scaling

Use Docker Swarm or Kubernetes for multiple instances:

```bash
# Initialize Docker Swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml wealthpilot

# Scale services
docker service scale wealthpilot_backend=3
docker service scale wealthpilot_frontend=2
```

### Load Balancing

Use Nginx or HAProxy:

```nginx
upstream backend {
    server backend1:4000;
    server backend2:4000;
    server backend3:4000;
}

upstream frontend {
    server frontend1:3000;
    server frontend2:3000;
}
```

---

## Troubleshooting

### Common Issues

**1. Port Already in Use**
```bash
# Find process using port
sudo lsof -i :3000
sudo lsof -i :4000

# Kill process
sudo kill -9 <PID>
```

**2. Database Connection Errors**
```bash
# Check database file permissions
ls -la backend/data/wealthpilot.db

# Recreate database
rm backend/data/wealthpilot.db
docker-compose exec backend npx prisma migrate deploy
```

**3. Memory Issues**
```bash
# Check memory usage
free -h

# Increase Docker memory limit
# Edit /etc/docker/daemon.json
{
  "default-ulimits": {
    "memlock": {
      "Hard": -1,
      "Name": "memlock",
      "Soft": -1
    }
  }
}
```

**4. Container Won't Start**
```bash
# View detailed logs
docker-compose logs backend

# Check container status
docker inspect wealthpilot-backend

# Rebuild container
docker-compose up -d --build backend
```

---

## Security Checklist

- [ ] Changed default JWT_SECRET
- [ ] Configured HTTPS/SSL
- [ ] Set up firewall (UFW)
- [ ] Enabled fail2ban
- [ ] Regular security updates
- [ ] Database backups automated
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Strong passwords for all services
- [ ] Disabled unnecessary services
- [ ] Monitoring and alerting setup
- [ ] Log rotation configured

---

## Performance Optimization

### Database

```bash
# Optimize database
docker-compose exec backend sqlite3 data/wealthpilot.db "VACUUM;"
docker-compose exec backend sqlite3 data/wealthpilot.db "ANALYZE;"
```

### Nginx Caching

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

location /api {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$request_uri";
}
```

---

## Support

For issues and questions:
- **Documentation**: https://docs.wealthpilot.com
- **Issues**: https://github.com/yourusername/wealthpilot-pro/issues
- **Email**: support@wealthpilot.com

---

**Last Updated**: December 17, 2025
