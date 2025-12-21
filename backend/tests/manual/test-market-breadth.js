#!/usr/bin/env node

/**
 * Market Breadth System Test Suite
 * Tests all priority indicators and API endpoints
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:4000';
const TEST_INDEX = 'SPY';

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${name}`);
  if (message) console.log(`   ${message}`);

  testResults.tests.push({ name, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function getAuthToken() {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@wealthpilot.com',
        password: 'demo123456'
      })
    });

    const data = await response.json();
    return data.token;
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

async function testAdvanceDeclineLine(token) {
  console.log('\n📌 TEST 1: Advance/Decline Line');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/advance-decline/${TEST_INDEX}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.data) {
      const adData = data.data;
      logTest(
        'A/D Line Calculation',
        true,
        `Current A/D Line: ${adData.currentADLine}, Signal: ${adData.signal}, Advancing: ${adData.advancing}, Declining: ${adData.declining}`
      );

      // Verify data structure
      const hasRequiredFields =
        typeof adData.currentADLine === 'number' &&
        typeof adData.advancing === 'number' &&
        typeof adData.declining === 'number' &&
        typeof adData.signal === 'string' &&
        Array.isArray(adData.adData);

      logTest('A/D Line Data Structure', hasRequiredFields, 'All required fields present');

      return true;
    } else {
      logTest('A/D Line Calculation', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('A/D Line Calculation', false, error.message);
    return false;
  }
}

async function testPercentAboveMA(token) {
  console.log('\n📌 TEST 2: Percentage Above Moving Averages');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/percent-above-ma/${TEST_INDEX}?periods=50,100,200`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.data) {
      const maData = data.data;
      logTest(
        'MA Breadth Calculation',
        true,
        `Overall Signal: ${maData.overallSignal}`
      );

      // Check each MA period
      ['ma50', 'ma100', 'ma200'].forEach(period => {
        if (maData.maPeriods[period]) {
          const periodData = maData.maPeriods[period];
          logTest(
            `${period.toUpperCase()} Breadth`,
            true,
            `${periodData.percentage.toFixed(2)}% above, Signal: ${periodData.signal}`
          );
        }
      });

      return true;
    } else {
      logTest('MA Breadth Calculation', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('MA Breadth Calculation', false, error.message);
    return false;
  }
}

async function testNewHighsLows(token) {
  console.log('\n📌 TEST 3: New Highs - New Lows');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/highs-lows/${TEST_INDEX}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.data) {
      const hlData = data.data;
      logTest(
        'Highs-Lows Calculation',
        true,
        `52w Highs: ${hlData.newHighs52w}, 52w Lows: ${hlData.newLows52w}, HL Index: ${hlData.hlIndex}, Signal: ${hlData.signal}`
      );

      // Verify data structure
      const hasRequiredFields =
        typeof hlData.newHighs52w === 'number' &&
        typeof hlData.newLows52w === 'number' &&
        typeof hlData.hlIndex === 'number' &&
        typeof hlData.signal === 'string';

      logTest('Highs-Lows Data Structure', hasRequiredFields, 'All required fields present');

      return true;
    } else {
      logTest('Highs-Lows Calculation', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('Highs-Lows Calculation', false, error.message);
    return false;
  }
}

async function testMarketHealth(token) {
  console.log('\n📌 TEST 4: Market Health Summary');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/health/${TEST_INDEX}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.data) {
      const healthData = data.data;
      logTest(
        'Market Health Calculation',
        true,
        `Health Score: ${healthData.healthScore}/100, Overall Signal: ${healthData.overallSignal}`
      );

      console.log('\n   📊 Detailed Health Breakdown:');
      console.log(`      A/D Line Signal: ${healthData.indicators.advanceDecline.signal}`);
      console.log(`      MA Breadth Signal: ${healthData.indicators.maBreath.signal}`);
      console.log(`      Highs-Lows Signal: ${healthData.indicators.highsLows.signal}`);

      return true;
    } else {
      logTest('Market Health Calculation', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('Market Health Calculation', false, error.message);
    return false;
  }
}

async function testAllBreadthIndicators(token) {
  console.log('\n📌 TEST 5: All Breadth Indicators (Single Request)');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/all/${TEST_INDEX}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.data) {
      const breadthData = data.data;
      logTest(
        'All Indicators Request',
        true,
        'Retrieved: A/D Line, MA Breadth (4 periods), Highs-Lows'
      );

      const hasAllIndicators =
        breadthData.advanceDecline &&
        breadthData.maBreath &&
        breadthData.highsLows;

      logTest('All Indicators Present', hasAllIndicators, 'All three indicators returned');

      return true;
    } else {
      logTest('All Indicators Request', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('All Indicators Request', false, error.message);
    return false;
  }
}

async function testProviderHealth(token) {
  console.log('\n📌 TEST 6: Provider Health Monitoring');

  try {
    const response = await fetch(`${API_URL}/api/market-breadth/provider-health`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success && data.providers) {
      const providers = data.providers;
      logTest('Provider Health Check', true, `Checked ${Object.keys(providers).length} providers`);

      Object.entries(providers).forEach(([provider, health]) => {
        const status = health.available ? '✅ Available' : '❌ Unavailable';
        console.log(`      ${provider}: ${status} (Errors: ${health.errorCount})`);
      });

      return true;
    } else {
      logTest('Provider Health Check', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('Provider Health Check', false, error.message);
    return false;
  }
}

async function testHistoricalData(token) {
  console.log('\n📌 TEST 7: Historical Data Retrieval');

  try {
    // Test historical A/D data
    const adResponse = await fetch(`${API_URL}/api/market-breadth/advance-decline/historical/${TEST_INDEX}?days=30`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const adData = await adResponse.json();

    if (adData.success && Array.isArray(adData.data)) {
      logTest('Historical A/D Data', true, `Retrieved ${adData.data.length} historical records`);
    } else {
      logTest('Historical A/D Data', false, 'No historical data returned');
    }

    // Test historical MA breadth
    const maResponse = await fetch(`${API_URL}/api/market-breadth/percent-above-ma/historical/${TEST_INDEX}/200?days=30`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const maData = await maResponse.json();

    if (maData.success && Array.isArray(maData.data)) {
      logTest('Historical MA Breadth', true, `Retrieved ${maData.data.length} historical records`);
    } else {
      logTest('Historical MA Breadth', false, 'No historical data returned');
    }

    return true;
  } catch (error) {
    logTest('Historical Data Retrieval', false, error.message);
    return false;
  }
}

async function testUtilityEndpoints(token) {
  console.log('\n📌 TEST 8: Utility Endpoints');

  try {
    // Test indices list
    const indicesResponse = await fetch(`${API_URL}/api/market-breadth/indices`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const indicesData = await indicesResponse.json();

    if (indicesData.success && Array.isArray(indicesData.indices)) {
      logTest('Supported Indices', true, `Found ${indicesData.indices.length} indices`);
    } else {
      logTest('Supported Indices', false, 'Invalid response');
    }

    // Test thresholds
    const thresholdsResponse = await fetch(`${API_URL}/api/market-breadth/thresholds`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const thresholdsData = await thresholdsResponse.json();

    if (thresholdsData.success && thresholdsData.thresholds) {
      logTest('Threshold Configuration', true, 'Retrieved all thresholds');
    } else {
      logTest('Threshold Configuration', false, 'Invalid response');
    }

    return true;
  } catch (error) {
    logTest('Utility Endpoints', false, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 MARKET BREADTH SYSTEM TESTS');
  console.log('='.repeat(60));
  console.log(`Testing Index: ${TEST_INDEX}`);
  console.log('='.repeat(60));

  try {
    // Get auth token
    console.log('\n🔐 Logging in...');
    const token = await getAuthToken();
    console.log('✅ Login successful');

    // Run all tests
    await testAdvanceDeclineLine(token);
    await testPercentAboveMA(token);
    await testNewHighsLows(token);
    await testMarketHealth(token);
    await testAllBreadthIndicators(token);
    await testProviderHealth(token);
    await testHistoricalData(token);
    await testUtilityEndpoints(token);

    printSummary();

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('\nMake sure:');
    console.error('1. Backend server is running on port 4000');
    console.error('2. Database migration has been run');
    console.error('3. API keys are configured in .env.market-breadth');
    process.exit(1);
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📝 Total:  ${testResults.tests.length}`);

  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  • ${t.name}: ${t.message}`);
    });
  }

  console.log('\n' + (testResults.failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed'));

  if (testResults.failed === 0) {
    console.log('\n✨ Market Breadth System is fully operational!');
    console.log('\nNext steps:');
    console.log('1. Build frontend dashboard components');
    console.log('2. Implement remaining indicators (TRIN, McClellan, etc.)');
    console.log('3. Add WebSocket real-time updates');
    console.log('4. Implement Redis caching layer');
  }

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
