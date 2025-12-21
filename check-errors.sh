#!/bin/bash

# WealthPilot Pro - Error Checker

RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_DIR="/tmp/wealthpilot-logs"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            WealthPilot Pro - Error Checker                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if servers are running
echo -e "${BLUE}[1] Server Status:${NC}"
BACKEND_PID=$(pgrep -f "node src/server.js")
FRONTEND_PID=$(pgrep -f "node dist/server.js")

if [ -n "$BACKEND_PID" ]; then
    echo -e "  ✓ Backend running (PID: $BACKEND_PID)"
else
    echo -e "  ${RED}✗ Backend NOT running${NC}"
fi

if [ -n "$FRONTEND_PID" ]; then
    echo -e "  ✓ Frontend running (PID: $FRONTEND_PID)"
else
    echo -e "  ${RED}✗ Frontend NOT running${NC}"
fi

echo ""
echo -e "${BLUE}[2] Port Status:${NC}"
if lsof -i :4000 >/dev/null 2>&1; then
    echo -e "  ✓ Port 4000 (Backend) in use"
else
    echo -e "  ${RED}✗ Port 4000 (Backend) NOT in use${NC}"
fi

if lsof -i :3000 >/dev/null 2>&1; then
    echo -e "  ✓ Port 3000 (Frontend) in use"
else
    echo -e "  ${RED}✗ Port 3000 (Frontend) NOT in use${NC}"
fi

echo ""
echo -e "${BLUE}[3] Recent Backend Errors:${NC}"
if [ -f "$LOG_DIR/backend.log" ]; then
    grep -i "error\|exception\|failed" "$LOG_DIR/backend.log" | tail -5
    if [ $? -ne 0 ]; then
        echo "  No recent errors found"
    fi
else
    echo "  Log file not found: $LOG_DIR/backend.log"
fi

echo ""
echo -e "${BLUE}[4] Recent Frontend Errors:${NC}"
if [ -f "$LOG_DIR/frontend.log" ]; then
    grep -i "error\|exception\|failed" "$LOG_DIR/frontend.log" | tail -5
    if [ $? -ne 0 ]; then
        echo "  No recent errors found"
    fi
else
    echo "  Log file not found: $LOG_DIR/frontend.log"
fi

echo ""
echo -e "${BLUE}[5] Last 10 Backend Log Lines:${NC}"
if [ -f "$LOG_DIR/backend.log" ]; then
    tail -10 "$LOG_DIR/backend.log"
else
    echo "  Log file not found"
fi

echo ""
echo -e "${BLUE}[6] Last 10 Frontend Log Lines:${NC}"
if [ -f "$LOG_DIR/frontend.log" ]; then
    tail -10 "$LOG_DIR/frontend.log"
else
    echo "  Log file not found"
fi

echo ""
echo -e "${YELLOW}To view live logs: tail -f $LOG_DIR/backend.log${NC}"
echo -e "${YELLOW}To restart: ./start.sh${NC}"
