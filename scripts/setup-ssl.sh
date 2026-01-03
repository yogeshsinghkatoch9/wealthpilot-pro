#!/bin/bash
#
# WealthPilot Pro - SSL Certificate Setup Script
# This script sets up SSL certificates using Let's Encrypt
#
# Usage:
#   ./scripts/setup-ssl.sh yourdomain.com your@email.com
#
# Prerequisites:
# - Domain name pointed to your server's IP
# - Docker and Docker Compose installed
# - Ports 80 and 443 open

set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 wealthpilot.com admin@wealthpilot.com"
    exit 1
fi

echo "========================================"
echo "WealthPilot Pro - SSL Setup"
echo "========================================"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Create directories
echo "Creating directories..."
mkdir -p nginx/ssl
mkdir -p certbot/www

# Create temporary self-signed certificate for initial nginx start
echo "Creating temporary self-signed certificate..."
openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout nginx/ssl/privkey.pem \
    -out nginx/ssl/fullchain.pem \
    -subj "/CN=$DOMAIN" 2>/dev/null

# Update nginx config with domain
echo "Updating nginx configuration..."
sed -i.bak "s/server_name _;/server_name $DOMAIN;/g" nginx/nginx.conf

# Start nginx with temporary certificate
echo "Starting nginx..."
docker-compose -f docker-compose.ssl.yml up -d nginx

# Wait for nginx to start
sleep 5

# Get Let's Encrypt certificate
echo "Requesting Let's Encrypt certificate..."
docker run --rm \
    -v "$(pwd)/nginx/ssl:/etc/letsencrypt" \
    -v "$(pwd)/certbot/www:/var/www/certbot" \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# Copy certificates to nginx location
echo "Installing certificates..."
cp nginx/ssl/live/$DOMAIN/fullchain.pem nginx/ssl/fullchain.pem
cp nginx/ssl/live/$DOMAIN/privkey.pem nginx/ssl/privkey.pem

# Reload nginx with new certificates
echo "Reloading nginx..."
docker exec wealthpilot-nginx nginx -s reload

# Create renewal cron job
echo "Setting up auto-renewal..."
(crontab -l 2>/dev/null; echo "0 0 * * * docker run --rm -v $(pwd)/nginx/ssl:/etc/letsencrypt -v $(pwd)/certbot/www:/var/www/certbot certbot/certbot renew --quiet && docker exec wealthpilot-nginx nginx -s reload") | crontab -

echo ""
echo "========================================"
echo "SSL Setup Complete!"
echo "========================================"
echo ""
echo "Your site is now available at:"
echo "  https://$DOMAIN"
echo ""
echo "Certificate auto-renewal is configured."
echo ""
echo "To start all services:"
echo "  docker-compose -f docker-compose.ssl.yml up -d"
echo ""
