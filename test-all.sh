#!/bin/bash

echo "🧪 WealthPilot Pro - Automated Test Suite"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

test_endpoint() {
  local url=$1
  local name=$2
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  
  if [ "$response" -eq 200 ] || [ "$response" -eq 302 ]; then
    echo -e "${GREEN}✅${NC} $name"
    ((PASS++))
  else
    echo -e "${RED}❌${NC} $name (HTTP $response)"
    ((FAIL++))
  fi
}

echo -e "\n${YELLOW}📡 Backend Tests${NC}"
test_endpoint "http://localhost:4000/api/portfolios" "Portfolios API"
test_endpoint "http://localhost:4000/api/holdings" "Holdings API"
test_endpoint "http://localhost:4000/api/analytics/dashboard" "Analytics API"
test_endpoint "http://localhost:4000/api/alerts" "Alerts API"

echo -e "\n${YELLOW}🎨 Frontend Pages${NC}"
test_endpoint "http://localhost:3000/" "Dashboard"
test_endpoint "http://localhost:3000/advanced-analytics" "Advanced Analytics"
test_endpoint "http://localhost:3000/alerts" "Price Alerts"
test_endpoint "http://localhost:3000/chart-test.html" "Chart Test"

echo -e "\n📊 Results"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"

if [ $FAIL -eq 0 ]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed. Check if servers are running.${NC}"
  exit 1
fi
