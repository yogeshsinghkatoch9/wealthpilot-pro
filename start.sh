#!/bin/bash

# WealthPilot Pro - Master Startup Script with Error Monitoring
# This script starts both backend and frontend with detailed error logging

clear
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   🚀 WealthPilot Pro - Master Startup                        ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log directory
LOG_DIR="/tmp/wealthpilot-logs"
mkdir -p "$LOG_DIR"

# Function to print colored messages
print_status() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $1"
}

# Function to kill existing processes
cleanup() {
    print_status "Cleaning up existing processes..."
    pkill -f "node src/server.js" 2>/dev/null
    pkill -f "node dist/server.js" 2>/dev/null
    sleep 2
    print_success "Cleanup complete"
}

# Function to check if port is in use
check_port() {
    lsof -i :$1 >/dev/null 2>&1
    return $?
}

# Function to start backend
start_backend() {
    print_status "Starting Backend Server..."
    
    cd backend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "Installing backend dependencies..."
        npm install > "$LOG_DIR/backend-install.log" 2>&1
        if [ $? -ne 0 ]; then
            print_error "Backend dependency installation failed!"
            echo "Check log: $LOG_DIR/backend-install.log"
            return 1
        fi
    fi
    
    # Start backend
    npm start > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    
    # Wait for backend to start
    echo -n "Waiting for backend to start"
    for i in {1..30}; do
        if check_port 4000; then
            echo ""
            print_success "Backend server started on http://localhost:4000"
            print_success "PID: $BACKEND_PID | Logs: $LOG_DIR/backend.log"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo ""
    print_error "Backend failed to start!"
    print_error "Check error log: $LOG_DIR/backend.log"
    tail -20 "$LOG_DIR/backend.log"
    return 1
}

# Function to start frontend
start_frontend() {
    print_status "Starting Frontend Server..."
    
    cd ../frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "Installing frontend dependencies..."
        npm install > "$LOG_DIR/frontend-install.log" 2>&1
        if [ $? -ne 0 ]; then
            print_error "Frontend dependency installation failed!"
            echo "Check log: $LOG_DIR/frontend-install.log"
            return 1
        fi
    fi
    
    # Check if dist folder exists
    if [ ! -d "dist" ]; then
        print_warning "Building frontend..."
        npm run build > "$LOG_DIR/frontend-build.log" 2>&1
        if [ $? -ne 0 ]; then
            print_error "Frontend build failed!"
            echo "Check log: $LOG_DIR/frontend-build.log"
            return 1
        fi
    fi
    
    # Start frontend
    npm start > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    
    # Wait for frontend to start
    echo -n "Waiting for frontend to start"
    for i in {1..30}; do
        if check_port 3000; then
            echo ""
            print_success "Frontend server started on http://localhost:3000"
            print_success "PID: $FRONTEND_PID | Logs: $LOG_DIR/frontend.log"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo ""
    print_error "Frontend failed to start!"
    print_error "Check error log: $LOG_DIR/frontend.log"
    tail -20 "$LOG_DIR/frontend.log"
    return 1
}

# Function to monitor logs
monitor_logs() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    MONITORING LOGS                           ║"
    echo "║  Press Ctrl+C to stop monitoring (servers keep running)     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    print_status "Showing last 10 lines of each log, then live updates..."
    echo ""
    
    # Show initial logs
    echo -e "${BLUE}=== BACKEND LOG ===${NC}"
    tail -10 "$LOG_DIR/backend.log"
    echo ""
    echo -e "${BLUE}=== FRONTEND LOG ===${NC}"
    tail -10 "$LOG_DIR/frontend.log"
    echo ""
    echo -e "${YELLOW}=== LIVE UPDATES (Ctrl+C to stop) ===${NC}"
    
    # Monitor both logs
    tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" 2>/dev/null
}

# Main execution
main() {
    # Navigate to project root
    cd "$(dirname "$0")"
    
    # Cleanup existing processes
    cleanup
    
    # Start backend
    if ! start_backend; then
        print_error "Failed to start backend. Aborting."
        exit 1
    fi
    
    # Start frontend
    if ! start_frontend; then
        print_error "Failed to start frontend. Aborting."
        exit 1
    fi
    
    # Success summary
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    ✓ ALL SYSTEMS ONLINE                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    print_success "Frontend: http://localhost:3000"
    print_success "Backend:  http://localhost:4000/api"
    echo ""
    print_status "Login: demo@wealthpilot.com / demo123456"
    echo ""
    print_status "Log files:"
    echo "  - Backend:  $LOG_DIR/backend.log"
    echo "  - Frontend: $LOG_DIR/frontend.log"
    echo ""
    
    # Ask if user wants to monitor logs
    read -p "Monitor live logs? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        monitor_logs
    else
        print_success "Servers are running in background"
        print_status "To view logs: tail -f $LOG_DIR/backend.log"
        print_status "To stop servers: pkill -f 'node.*server.js'"
    fi
}

# Run main function
main
