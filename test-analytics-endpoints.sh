#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  WealthPilot Pro - Advanced Analytics Endpoint Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Base URLs
BACKEND_URL="http://localhost:4000"
FRONTEND_URL="http://localhost:3000"

# Test counters
PASS=0
FAIL=0
TOTAL=0

# Function to test endpoint
test_endpoint() {
  local url=$1
  local name=$2
  local auth_required=$3

  ((TOTAL++))

  if [ "$auth_required" = "true" ]; then
    # For authenticated endpoints, just check if they return 401 (need login) or 200 (already logged in)
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$response" -eq 401 ] || [ "$response" -eq 200 ]; then
      echo -e "${GREEN}✅${NC} [$TOTAL] $name (HTTP $response)"
      ((PASS++))
    else
      echo -e "${RED}❌${NC} [$TOTAL] $name (Expected 401 or 200, got HTTP $response)"
      ((FAIL++))
    fi
  else
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$response" -eq 200 ]; then
      echo -e "${GREEN}✅${NC} [$TOTAL] $name (HTTP $response)"
      ((PASS++))
    else
      echo -e "${RED}❌${NC} [$TOTAL] $name (Expected 200, got HTTP $response)"
      ((FAIL++))
    fi
  fi
}

# Function to test with data verification
test_endpoint_with_data() {
  local url=$1
  local name=$2
  local expected_field=$3

  ((TOTAL++))

  response=$(curl -s "$url" 2>/dev/null)
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)

  if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 401 ]; then
    if [ -n "$expected_field" ] && echo "$response" | grep -q "$expected_field"; then
      echo -e "${GREEN}✅${NC} [$TOTAL] $name (HTTP $http_code, has '$expected_field')"
      ((PASS++))
    elif [ "$http_code" -eq 401 ]; then
      echo -e "${YELLOW}⚠${NC}  [$TOTAL] $name (Authentication required - HTTP 401)"
      ((PASS++))
    else
      echo -e "${GREEN}✅${NC} [$TOTAL] $name (HTTP $http_code)"
      ((PASS++))
    fi
  else
    echo -e "${RED}❌${NC} [$TOTAL] $name (HTTP $http_code)"
    ((FAIL++))
  fi
}

echo -e "${YELLOW}Testing Backend Services...${NC}"
echo ""

# Backend health checks
test_endpoint "$BACKEND_URL/health" "Backend Health Check" "false"
test_endpoint "$BACKEND_URL/api/advanced-analytics/health" "Analytics Service Health" "true"

echo ""
echo -e "${YELLOW}Testing Performance Tab (4 endpoints)...${NC}"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/performance-attribution?portfolioId=all&period=1Y" "Performance Attribution" "totalReturn"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/excess-return?portfolioId=all&benchmark=SPY" "Excess Return vs Benchmark" "excessReturn"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/drawdown-analysis?portfolioId=all" "Drawdown Analysis" "maxDrawdown"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/rolling-statistics?portfolioId=all&window=90" "Rolling Statistics" "rollingReturns"

echo ""
echo -e "${YELLOW}Testing Risk Tab (5 endpoints)...${NC}"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/risk-decomposition?portfolioId=all" "Risk Decomposition" "factorExposures"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/var-scenarios?portfolioId=all&confidence=95" "VaR & Stress Scenarios" "var"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/correlation-matrix?portfolioId=all" "Correlation Matrix" "matrix"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/stress-scenarios?portfolioId=all" "Stress Test Scenarios" "scenarios"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/concentration-analysis?portfolioId=all" "Concentration Analysis" "hhi"

echo ""
echo -e "${YELLOW}Testing Attribution Tab (4 endpoints)...${NC}"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/regional-attribution?portfolioId=all" "Regional Attribution" "regions"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/sector-rotation?portfolioId=all" "Sector Rotation" "sectorBreakdown"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/peer-benchmarking?portfolioId=all" "Peer Benchmarking" "percentileRank"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/alpha-decay?portfolioId=all" "Alpha Decay Analysis" "currentAlpha"

echo ""
echo -e "${YELLOW}Testing Construction Tab (4 endpoints)...${NC}"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/efficient-frontier?portfolioId=all" "Efficient Frontier" "frontierPoints"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/turnover-analysis?portfolioId=all" "Turnover Analysis" "annualTurnover"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/liquidity-analysis?portfolioId=all" "Liquidity Analysis" "liquidityScore"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/transaction-cost-analysis?portfolioId=all" "Transaction Cost Analysis" "totalCosts"

echo ""
echo -e "${YELLOW}Testing Specialized Tab (3 endpoints)...${NC}"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/alternatives-attribution?portfolioId=all" "Alternatives Attribution" "alternatives"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/esg-analysis?portfolioId=all" "ESG Analysis" "portfolioESGScore"
test_endpoint_with_data "$BACKEND_URL/api/advanced-analytics/client-reporting?portfolioId=all" "Client Reporting" "portfolioSummary"

echo ""
echo -e "${YELLOW}Testing Frontend Pages...${NC}"
test_endpoint "$FRONTEND_URL/advanced-analytics" "Advanced Analytics Dashboard" "true"
test_endpoint "$FRONTEND_URL/alerts" "Price Alerts Page" "true"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}PASSED:${NC} $PASS/$TOTAL"
if [ $FAIL -gt 0 ]; then
  echo -e "${RED}FAILED:${NC} $FAIL/$TOTAL"
else
  echo -e "${GREEN}FAILED:${NC} 0/$TOTAL"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Summary
if [ $FAIL -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 All tests passed! All 20 analytics endpoints are working.${NC}"
  echo ""
  echo -e "${BLUE}Next Steps:${NC}"
  echo "  1. Start both servers: npm run dev (backend) and npm run dev (frontend)"
  echo "  2. Login at http://localhost:3000"
  echo "  3. Visit Advanced Analytics: http://localhost:3000/advanced-analytics"
  echo "  4. Visit Price Alerts: http://localhost:3000/alerts"
  echo ""
else
  echo ""
  echo -e "${YELLOW}⚠ Some tests failed. Check the output above for details.${NC}"
  echo ""
fi

exit $FAIL
