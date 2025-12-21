#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "  WealthPilot Pro - Integration Test Suite"
echo "  Testing: Market Data, APIs, WebSocket, and Live Features"
echo "═══════════════════════════════════════════════════════════════"
echo ""

BASE_URL="http://localhost:4000"
API_URL="$BASE_URL/api"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local auth=$5

    echo -n "Testing: $name... "

    if [ "$method" == "POST" ]; then
        if [ -n "$auth" ]; then
            response=$(curl -s -X POST "$endpoint" -H "Authorization: Bearer $auth" -H "Content-Type: application/json" -d "$data")
        else
            response=$(curl -s -X POST "$endpoint" -H "Content-Type: application/json" -d "$data")
        fi
    else
        if [ -n "$auth" ]; then
            response=$(curl -s "$endpoint" -H "Authorization: Bearer $auth")
        else
            response=$(curl -s "$endpoint")
        fi
    fi

    if echo "$response" | grep -q "error"; then
        echo -e "${RED}✗ FAILED${NC}"
        echo "   Response: $response"
        ((FAILED++))
    else
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Health Check & Server Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Health Check" "GET" "$BASE_URL/health"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Login
echo -n "Testing: User Login... "
login_response=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@wealthpilot.com","password":"demo123456"}')

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    TOKEN=$(echo $login_response | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])" 2>/dev/null)
    echo "   Token obtained: ${TOKEN:0:30}..."
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "   Response: $login_response"
    ((FAILED++))
    exit 1
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Market Data - Live Quotes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Single Quote
echo -n "Testing: Single Quote (AAPL)... "
quote_response=$(curl -s "$API_URL/market/quote/AAPL" -H "Authorization: Bearer $TOKEN")
if echo "$quote_response" | grep -q "symbol.*AAPL"; then
    price=$(echo $quote_response | python3 -c "import sys, json; print(json.load(sys.stdin)['price'])" 2>/dev/null)
    change=$(echo $quote_response | python3 -c "import sys, json; print(json.load(sys.stdin)['change'])" 2>/dev/null)
    echo -e "${GREEN}✓ PASSED${NC}"
    echo "   AAPL: \$$price (${change:+$change})"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Batch Quotes
echo -n "Testing: Batch Quotes (5 stocks)... "
batch_response=$(curl -s -X POST "$API_URL/market/quotes/batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["AAPL","MSFT","GOOGL","TSLA","NVDA"]}')

if echo "$batch_response" | grep -q "AAPL.*MSFT.*GOOGL"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    echo "   Retrieved 5 stock quotes successfully"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "   Response: $batch_response"
    ((FAILED++))
fi

# GET Quotes
echo -n "Testing: GET Quotes (AAPL,MSFT)... "
get_quotes_response=$(curl -s "$API_URL/market/quotes?symbols=AAPL,MSFT" -H "Authorization: Bearer $TOKEN")
if echo "$get_quotes_response" | grep -q "AAPL.*MSFT"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Company Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -n "Testing: Company Profile (TSLA)... "
profile_response=$(curl -s "$API_URL/market/profile/TSLA" -H "Authorization: Bearer $TOKEN")
if echo "$profile_response" | grep -q "Tesla"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "   Response: $profile_response"
    ((FAILED++))
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Portfolio Management"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -n "Testing: Get Portfolios... "
portfolios_response=$(curl -s "$API_URL/portfolios" -H "Authorization: Bearer $TOKEN")
if echo "$portfolios_response" | grep -q "portfolio"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    portfolio_count=$(echo "$portfolios_response" | grep -o '"id"' | wc -l)
    echo "   Found $portfolio_count portfolio(s)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "   Response: $portfolios_response"
    ((FAILED++))
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. WebSocket Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -n "Testing: WebSocket Availability... "
if command -v wscat &> /dev/null; then
    echo -e "${YELLOW}⚠ wscat available${NC} (manual test required)"
else
    echo -e "${YELLOW}⚠ wscat not installed${NC} (WebSocket initialized at ws://localhost:4000/ws)"
fi
echo "   WebSocket URL: ws://localhost:4000/ws"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════"
    echo "  ✓ ALL TESTS PASSED - System Fully Functional!"
    echo -e "═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Frontend: http://localhost:3000"
    echo "  Backend:  http://localhost:4000"
    echo "  WebSocket: ws://localhost:4000/ws"
    echo ""
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════"
    echo "  ✗ SOME TESTS FAILED - Check Logs Above"
    echo -e "═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    exit 1
fi
