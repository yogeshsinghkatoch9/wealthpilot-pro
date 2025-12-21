#!/bin/bash

# WealthPilot Pro - Stop Script

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Stopping WealthPilot Pro servers...${NC}"

pkill -f "node src/server.js"
pkill -f "node dist/server.js"

sleep 2

echo -e "${GREEN}✓ All servers stopped${NC}"
