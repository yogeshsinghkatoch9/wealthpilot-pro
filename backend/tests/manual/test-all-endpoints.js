/**
 * Comprehensive Endpoint Testing
 * Tests all market analysis endpoints to verify live data fetching
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'http://localhost:4000';

// Get demo user token (hardcoded for testing)
const TEST_TOKEN = 'test'; // We'll get this from login

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'demo@wealthpilot.com',
      password: 'demo123456'
    });
    return response.data.token;
  } catch (error) {
    console.error(`${colors.red}✗ Login failed${colors.reset}`);
    return null;
  }
}

async function testEndpoint(name, url, token) {
  try {
    const response = await axios.get(`${BASE_URL}${url}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      timeout: 10000
    });

    const dataSize = JSON.stringify(response.data).length;
    const hasData = response.data.success !== false &&
                    (response.data.data || response.data.length > 0 || Object.keys(response.data).length > 0);

    console.log(`  ${hasData ? colors.green + '✓' : colors.yellow + '⚠'} ${name}${colors.reset}`);
    console.log(`    ${colors.gray}Status: ${response.status}, Size: ${dataSize} bytes${colors.reset}`);

    if (response.data.source) {
      console.log(`    ${colors.cyan}Source: ${response.data.source}${colors.reset}`);
    }

    return { success: true, hasData, response: response.data };
  } catch (error) {
    console.log(`  ${colors.red}✗ ${name}${colors.reset}`);
    console.log(`    ${colors.red}Error: ${error.response ? error.response.status + ' - ' + error.response.statusText : error.message}${colors.reset}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  WealthPilot Pro - Endpoint Diagnostics${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // Login
  console.log(`${colors.yellow}[1] Authenticating...${colors.reset}`);
  const token = await login();
  if (!token) {
    console.log(`${colors.red}Failed to get auth token. Exiting.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}✓ Authenticated${colors.reset}\n`);

  const results = {
    working: [],
    failing: [],
    noData: []
  };

  // Test Market Breadth
  console.log(`${colors.yellow}[2] Market Breadth & Internals${colors.reset}`);
  let test = await testEndpoint('Health (SPY)', '/api/market-breadth/health/SPY', token);
  test.success && test.hasData ? results.working.push('Market Breadth') : test.success ? results.noData.push('Market Breadth') : results.failing.push('Market Breadth');

  test = await testEndpoint('Advance/Decline', '/api/market-breadth/advance-decline/SPY', token);
  test = await testEndpoint('MA Breadth', '/api/market-breadth/percent-above-ma/SPY', token);
  test = await testEndpoint('Highs/Lows', '/api/market-breadth/highs-lows/SPY', token);
  console.log('');

  // Test Market Sentiment
  console.log(`${colors.yellow}[3] Market Sentiment${colors.reset}`);
  test = await testEndpoint('Sentiment (AAPL)', '/api/sentiment/analysis/AAPL', token);
  test.success && test.hasData ? results.working.push('Market Sentiment') : test.success ? results.noData.push('Market Sentiment') : results.failing.push('Market Sentiment');
  console.log('');

  // Test Sector Analysis
  console.log(`${colors.yellow}[4] Sector Analysis${colors.reset}`);
  test = await testEndpoint('All Sectors', '/api/sector-analysis/sectors', token);
  test.success && test.hasData ? results.working.push('Sector Analysis') : test.success ? results.noData.push('Sector Analysis') : results.failing.push('Sector Analysis');

  test = await testEndpoint('Performance', '/api/sector-analysis/performance?period=1M', token);
  test = await testEndpoint('Alpha Vantage', '/api/sector-analysis/alpha-vantage', token);
  console.log('');

  // Test Sector Rotation
  console.log(`${colors.yellow}[5] Sector Rotation${colors.reset}`);
  test = await testEndpoint('Current Rotation', '/api/sector-rotation/current', token);
  test.success && test.hasData ? results.working.push('Sector Rotation') : test.success ? results.noData.push('Sector Rotation') : results.failing.push('Sector Rotation');
  console.log('');

  // Test Sector Heatmap
  console.log(`${colors.yellow}[6] Sector Heatmap${colors.reset}`);
  test = await testEndpoint('Current Heatmap', '/api/sector-heatmap/current', token);
  test.success && test.hasData ? results.working.push('Sector Heatmap') : test.success ? results.noData.push('Sector Heatmap') : results.failing.push('Sector Heatmap');
  console.log('');

  // Test ETF Analyzer
  console.log(`${colors.yellow}[7] ETF Analyzer${colors.reset}`);
  test = await testEndpoint('ETF Profile (SPY)', '/api/etf-analyzer/profile/SPY', token);
  test.success && test.hasData ? results.working.push('ETF Analyzer') : test.success ? results.noData.push('ETF Analyzer') : results.failing.push('ETF Analyzer');

  test = await testEndpoint('ETF Holdings', '/api/etf-analyzer/holdings/SPY', token);
  console.log('');

  // Test Economic Calendar
  console.log(`${colors.yellow}[8] Economic Calendar${colors.reset}`);
  test = await testEndpoint('Upcoming Events', '/api/economic-calendar/upcoming', token);
  test.success && test.hasData ? results.working.push('Economic Calendar') : test.success ? results.noData.push('Economic Calendar') : results.failing.push('Economic Calendar');
  console.log('');

  // Test Earnings Calendar
  console.log(`${colors.yellow}[9] Earnings Calendar${colors.reset}`);
  test = await testEndpoint('Upcoming Earnings', '/api/earnings-calendar/upcoming', token);
  test.success && test.hasData ? results.working.push('Earnings Calendar') : test.success ? results.noData.push('Earnings Calendar') : results.failing.push('Earnings Calendar');

  test = await testEndpoint('Stats', '/api/earnings-calendar/stats', token);
  console.log('');

  // Test Dividend Calendar
  console.log(`${colors.yellow}[10] Dividend Calendar${colors.reset}`);
  test = await testEndpoint('Upcoming Dividends', '/api/dividend-calendar/upcoming', token);
  test.success && test.hasData ? results.working.push('Dividend Calendar') : test.success ? results.noData.push('Dividend Calendar') : results.failing.push('Dividend Calendar');

  test = await testEndpoint('Stats', '/api/dividend-calendar/stats', token);
  console.log('');

  // Test IPO Tracker
  console.log(`${colors.yellow}[11] IPO Tracker${colors.reset}`);
  test = await testEndpoint('Upcoming IPOs', '/api/ipo-calendar/upcoming', token);
  test.success && test.hasData ? results.working.push('IPO Tracker') : test.success ? results.noData.push('IPO Tracker') : results.failing.push('IPO Tracker');

  test = await testEndpoint('Stats', '/api/ipo-calendar/stats', token);
  console.log('');

  // Test SPAC Tracker
  console.log(`${colors.yellow}[12] SPAC Tracker${colors.reset}`);
  test = await testEndpoint('Upcoming SPACs', '/api/spac-tracker/upcoming', token);
  test.success && test.hasData ? results.working.push('SPAC Tracker') : test.success ? results.noData.push('SPAC Tracker') : results.failing.push('SPAC Tracker');
  console.log('');

  // Summary
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  Test Summary${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.green}✓ Working with Data (${results.working.length}):${colors.reset}`);
  results.working.forEach(r => console.log(`  - ${r}`));

  console.log(`\n${colors.yellow}⚠ Working but No Data (${results.noData.length}):${colors.reset}`);
  results.noData.forEach(r => console.log(`  - ${r}`));

  console.log(`\n${colors.red}✗ Failing (${results.failing.length}):${colors.reset}`);
  results.failing.forEach(r => console.log(`  - ${r}`));

  console.log('');
  process.exit(0);
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
