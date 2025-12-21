#!/bin/bash

##############################################
# WealthPilot Pro Deployment Script
# Usage: ./deploy.sh [environment]
# Environments: local, staging, production
##############################################

set -e

ENVIRONMENT=${1:-local}
PROJECT_NAME="wealthpilot"

echo "🚀 Deploying WealthPilot Pro to $ENVIRONMENT..."

case $ENVIRONMENT in
  local)
    echo "📦 Building for local development..."
    docker-compose -f docker-compose.yml up -d --build
    ;;
    
  staging)
    echo "📦 Building for staging environment..."
    docker-compose -f docker-compose.staging.yml pull
    docker-compose -f docker-compose.staging.yml up -d
    ;;
    
  production)
    echo "📦 Building for production environment..."
    
    # Backup database
    echo "💾 Creating database backup..."
    docker-compose -f docker-compose.prod.yml exec -T postgres \
      pg_dump -U wealthpilot wealthpilot > backup_$(date +%Y%m%d_%H%M%S).sql
    
    # Pull latest images
    docker-compose -f docker-compose.prod.yml pull
    
    # Deploy with zero downtime
    docker-compose -f docker-compose.prod.yml up -d --no-deps backend frontend
    
    # Run database migrations
    echo "🔄 Running database migrations..."
    docker-compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
    
    # Cleanup
    docker system prune -f
    ;;
    
  *)
    echo "❌ Invalid environment: $ENVIRONMENT"
    echo "Usage: ./deploy.sh [local|staging|production]"
    exit 1
    ;;
esac

echo "✅ Deployment to $ENVIRONMENT complete!"
echo "🔗 Application URL: http://localhost:3000"
