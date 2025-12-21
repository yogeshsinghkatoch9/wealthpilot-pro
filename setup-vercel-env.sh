#!/bin/bash

# WealthPilot Pro - Vercel Environment Setup Script
# Run this after logging in to Vercel: npx vercel login

echo "================================================"
echo "  WealthPilot Pro - Vercel Environment Setup"
echo "================================================"
echo ""

cd "$(dirname "$0")"

# Check if logged in
npx vercel whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to Vercel. Running login..."
    npx vercel login
fi

echo "Adding environment variables to Vercel..."
echo ""

# Production Environment Variables
echo "Adding ALPHA_VANTAGE_API_KEY..."
echo "1S2UQSH44L0953E5" | npx vercel env add ALPHA_VANTAGE_API_KEY production --force

echo "Adding FMP_API_KEY..."
echo "nKxGNnbkLs6VUjVsbeKTlQF4UPKyvPbG" | npx vercel env add FMP_API_KEY production --force

echo "Adding POLYGON_API_KEY..."
echo "fJ_RyjvXyIH6aeVHdqvxbpi0op6fFK9b" | npx vercel env add POLYGON_API_KEY production --force

echo "Adding NASDAQ_API_KEY..."
echo "RMZSDyJm9t7dqhMdysGB" | npx vercel env add NASDAQ_API_KEY production --force

echo "Adding FINNHUB_API_KEY..."
echo "d4tm751r01qnn6llpesgd4tm751r01qnn6llpet0" | npx vercel env add FINNHUB_API_KEY production --force

echo "Adding OPENAI_API_KEY..."
echo "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" | npx vercel env add OPENAI_API_KEY production --force

echo "Adding NEWS_API_KEY..."
echo "gt30z3tlxjMvXTDL3s5CE8EdH2FTSKxQk88PhzNz" | npx vercel env add NEWS_API_KEY production --force

echo "Adding JWT_SECRET..."
echo "2b53762aa6b7ac3e7d6c756f04659eec680965db1662f4df25ead4f1185f5fde08d69ea7d1d5c80cfb3fa0366aa58e91c10840857479b624ef56a2284d9cdeb5" | npx vercel env add JWT_SECRET production --force

echo "Adding NODE_ENV..."
echo "production" | npx vercel env add NODE_ENV production --force

echo "Adding PORT..."
echo "4000" | npx vercel env add PORT production --force

echo ""
echo "================================================"
echo "  ✅ All environment variables added!"
echo "================================================"
echo ""
echo "Now redeploy to apply changes:"
echo "  npx vercel --prod"
echo ""
