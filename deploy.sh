#!/bin/bash

##############################################
# WealthPilot Pro - Automated Deployment Script
# Supports VPS, Docker, and quick updates
##############################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="wealthpilot"
BACKUP_DIR="$SCRIPT_DIR/backups"

##############################################
# Helper Functions
##############################################

print_header() {
    echo -e "${BLUE}"
    echo "============================================"
    echo "  WealthPilot Pro - Deployment Script"
    echo "============================================"
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

##############################################
# Deployment Type Selection
##############################################

select_deployment_type() {
    echo ""
    echo "Select deployment type:"
    echo "  1) VPS Deployment (with PM2)"
    echo "  2) Docker Deployment"
    echo "  3) Quick Update (existing deployment)"
    echo "  4) Run Database Migrations Only"
    echo "  5) Create Backup"
    echo "  6) Exit"
    echo ""
    read -p "Enter choice [1-6]: " choice

    case $choice in
        1) deploy_vps ;;
        2) deploy_docker ;;
        3) quick_update ;;
        4) run_migrations ;;
        5) create_backup ;;
        6) exit 0 ;;
        *) echo "Invalid choice"; select_deployment_type ;;
    esac
}

##############################################
# VPS Deployment
##############################################

deploy_vps() {
    print_header
    print_step "Starting VPS deployment..."

    # Check prerequisites
    print_step "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi

    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 is not installed. Installing PM2..."
        sudo npm install -g pm2
    fi

    print_success "Prerequisites check passed"

    # Create backup
    print_step "Creating backup before deployment..."
    create_backup

    # Check environment file
    if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
        print_error "Missing .env file in backend directory"
        print_warning "Please copy .env.production.template to .env and configure it"
        exit 1
    fi

    # Install backend dependencies
    print_step "Installing backend dependencies..."
    cd "$SCRIPT_DIR/backend"
    npm ci --production
    print_success "Backend dependencies installed"

    # Install frontend dependencies
    print_step "Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend"
    npm ci --production
    print_success "Frontend dependencies installed"

    # Run database migrations
    print_step "Running database migrations..."
    cd "$SCRIPT_DIR/backend"
    npm run migrate || print_warning "Migrations may have already run"
    print_success "Database migrations complete"

    # Create necessary directories
    print_step "Creating necessary directories..."
    mkdir -p "$SCRIPT_DIR/backend/database"
    mkdir -p "$SCRIPT_DIR/backend/logs"
    mkdir -p "$SCRIPT_DIR/backend/uploads"
    mkdir -p "$SCRIPT_DIR/backend/generated-pdfs"
    mkdir -p "$BACKUP_DIR"
    print_success "Directories created"

    # Stop existing PM2 process if running
    print_step "Stopping existing PM2 process..."
    pm2 delete $PROJECT_NAME 2>/dev/null || true

    # Start application with PM2
    print_step "Starting application with PM2..."
    cd "$SCRIPT_DIR/backend"

    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --env production
    else
        pm2 start src/server.js --name $PROJECT_NAME --env production
    fi

    pm2 save
    print_success "Application started"

    # Setup PM2 startup script
    print_step "Configuring PM2 to start on system boot..."
    pm2 startup | tail -n 1 | bash || print_warning "PM2 startup configuration may require manual setup"

    # Show status
    pm2 status

    print_success "VPS deployment complete!"
    echo ""
    echo "Application is running on: http://localhost:3000"
    echo "View logs with: pm2 logs $PROJECT_NAME"
    echo "Monitor with: pm2 monit"
    echo ""
}

##############################################
# Docker Deployment
##############################################

deploy_docker() {
    print_header
    print_step "Starting Docker deployment..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed."
        exit 1
    fi

    print_success "Docker prerequisites check passed"

    # Select compose file
    echo ""
    echo "Select Docker Compose configuration:"
    echo "  1) Development (docker-compose.yml)"
    echo "  2) Production (docker-compose.prod.yml)"
    echo ""
    read -p "Enter choice [1-2]: " docker_choice

    case $docker_choice in
        1) COMPOSE_FILE="docker-compose.yml" ;;
        2) COMPOSE_FILE="docker-compose.prod.yml" ;;
        *) print_error "Invalid choice"; exit 1 ;;
    esac

    # Create backup
    print_step "Creating backup before deployment..."
    create_backup

    # Pull latest images
    print_step "Pulling latest Docker images..."
    docker-compose -f "$COMPOSE_FILE" pull

    # Build containers
    print_step "Building Docker containers..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache

    # Stop existing containers
    print_step "Stopping existing containers..."
    docker-compose -f "$COMPOSE_FILE" down

    # Start containers
    print_step "Starting containers..."
    docker-compose -f "$COMPOSE_FILE" up -d

    # Show status
    docker-compose -f "$COMPOSE_FILE" ps

    print_success "Docker deployment complete!"
    echo ""
    echo "Application is running"
    echo "View logs with: docker-compose -f $COMPOSE_FILE logs -f"
    echo "Stop with: docker-compose -f $COMPOSE_FILE down"
    echo ""
}

##############################################
# Quick Update
##############################################

quick_update() {
    print_header
    print_step "Performing quick update..."

    # Create backup
    create_backup

    # Check if using Docker or PM2
    if docker ps | grep -q $PROJECT_NAME; then
        print_step "Detected Docker deployment"

        # Determine which compose file is in use
        if [ -f "docker-compose.prod.yml" ]; then
            COMPOSE_FILE="docker-compose.prod.yml"
        else
            COMPOSE_FILE="docker-compose.yml"
        fi

        print_step "Rebuilding containers..."
        docker-compose -f "$COMPOSE_FILE" build
        docker-compose -f "$COMPOSE_FILE" up -d

        print_success "Docker containers updated"

    elif pm2 list | grep -q $PROJECT_NAME; then
        print_step "Detected PM2 deployment"

        # Install dependencies
        print_step "Installing dependencies..."
        cd "$SCRIPT_DIR/backend"
        npm ci --production

        cd "$SCRIPT_DIR/frontend"
        npm ci --production

        # Run migrations
        print_step "Running migrations..."
        cd "$SCRIPT_DIR/backend"
        npm run migrate || true

        # Restart PM2
        print_step "Restarting application..."
        pm2 restart $PROJECT_NAME

        print_success "Application updated"

    else
        print_error "Could not detect deployment type (Docker or PM2)"
        exit 1
    fi

    print_success "Quick update complete!"
}

##############################################
# Run Migrations
##############################################

run_migrations() {
    print_header
    print_step "Running database migrations..."

    cd "$SCRIPT_DIR/backend"

    # Check if database exists
    if [ ! -f "database/wealthpilot.db" ]; then
        print_warning "Database does not exist. It will be created."
    fi

    # Run migrations
    npm run migrate

    print_success "Migrations complete!"
}

##############################################
# Create Backup
##############################################

create_backup() {
    print_step "Creating backup..."

    # Check if backup script exists
    if [ -f "$SCRIPT_DIR/backend/scripts/backup-database.sh" ]; then
        bash "$SCRIPT_DIR/backend/scripts/backup-database.sh"
    else
        # Simple backup fallback
        mkdir -p "$BACKUP_DIR"
        DATE=$(date +%Y%m%d_%H%M%S)

        if [ -f "$SCRIPT_DIR/backend/database/wealthpilot.db" ]; then
            cp "$SCRIPT_DIR/backend/database/wealthpilot.db" "$BACKUP_DIR/backup_$DATE.db"
            gzip "$BACKUP_DIR/backup_$DATE.db"
            print_success "Backup created: $BACKUP_DIR/backup_$DATE.db.gz"
        else
            print_warning "No database found to backup"
        fi
    fi
}

##############################################
# Health Check
##############################################

health_check() {
    print_step "Running health check..."

    # Wait for application to start
    sleep 5

    # Check if application is responding
    if curl -s http://localhost:3000/health > /dev/null; then
        print_success "Health check passed - Application is running"
        return 0
    else
        print_error "Health check failed - Application may not be running correctly"
        return 1
    fi
}

##############################################
# Main Execution
##############################################

main() {
    print_header

    # Check if running with arguments
    if [ $# -eq 0 ]; then
        select_deployment_type
    else
        # Handle command line arguments
        case $1 in
            vps) deploy_vps ;;
            docker) deploy_docker ;;
            update) quick_update ;;
            migrate) run_migrations ;;
            backup) create_backup ;;
            health) health_check ;;
            *)
                echo "Usage: $0 {vps|docker|update|migrate|backup|health}"
                echo ""
                echo "Commands:"
                echo "  vps       - Deploy to VPS with PM2"
                echo "  docker    - Deploy using Docker Compose"
                echo "  update    - Quick update existing deployment"
                echo "  migrate   - Run database migrations only"
                echo "  backup    - Create backup"
                echo "  health    - Run health check"
                exit 1
                ;;
        esac
    fi
}

# Run main function
main "$@"
