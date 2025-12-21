#!/usr/bin/env node

/**
 * Algorithmic Trading API Test
 * Tests: Create Strategy → Generate Signal → Run Backtest
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:4000';

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

async function testCreateStrategy(token) {
  console.log('\n📌 TEST 1: Create Trading Strategy');

  try {
    const strategy = {
      name: 'Test MACD Strategy',
      description: 'Test strategy for automated testing',
      strategy_type: 'macd_crossover',
      parameters: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        minConfidence: 0.6
      },
      symbols: 'AAPL,MSFT,GOOGL',
      timeframe: '1h',
      is_paper_trading: 1
    };

    const response = await fetch(`${API_URL}/api/trading/strategies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(strategy)
    });

    const data = await response.json();

    if (data.success && data.strategy) {
      logTest('Create Strategy', true, `Strategy ID: ${data.strategy.id}`);
      return data.strategy.id;
    } else {
      logTest('Create Strategy', false, data.error || 'Unknown error');
      return null;
    }
  } catch (error) {
    logTest('Create Strategy', false, error.message);
    return null;
  }
}

async function testGetStrategies(token) {
  console.log('\n📌 TEST 2: Get User Strategies');

  try {
    const response = await fetch(`${API_URL}/api/trading/strategies`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.strategies)) {
      logTest('Get Strategies', true, `Found ${data.strategies.length} strategies`);
      return true;
    } else {
      logTest('Get Strategies', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('Get Strategies', false, error.message);
    return false;
  }
}

async function testGenerateSignal(token, strategyId) {
  console.log('\n📌 TEST 3: Generate Trading Signal');

  try {
    const response = await fetch(`${API_URL}/api/trading/signals/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        strategyId,
        symbol: 'AAPL',
        period: '6mo'
      })
    });

    const data = await response.json();

    if (data.success && data.signal) {
      logTest('Generate Signal', true, `Action: ${data.signal.action}, Price: $${data.signal.price?.toFixed(2) || 'N/A'}`);
      return true;
    } else {
      logTest('Generate Signal', false, data.error || 'No signal generated');
      return false;
    }
  } catch (error) {
    logTest('Generate Signal', false, error.message);
    return false;
  }
}

async function testRunBacktest(token, strategyId) {
  console.log('\n📌 TEST 4: Run Backtest');

  try {
    const response = await fetch(`${API_URL}/api/trading/backtest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        strategyId,
        symbol: 'AAPL',
        config: {
          initialCapital: 10000,
          commission: 0.001
        }
      })
    });

    const data = await response.json();

    if (data.success && data.result) {
      const result = data.result;
      logTest('Run Backtest', true,
        `Return: ${result.totalReturn?.toFixed(2)}%, ` +
        `Trades: ${result.totalTrades}, ` +
        `Win Rate: ${result.winRate?.toFixed(2)}%`
      );

      // Additional backtest metrics
      console.log('   📊 Performance Metrics:');
      console.log(`      Total Return: ${result.totalReturn?.toFixed(2)}%`);
      console.log(`      Total Trades: ${result.totalTrades}`);
      console.log(`      Win Rate: ${result.winRate?.toFixed(2)}%`);
      console.log(`      Max Drawdown: ${result.maxDrawdown?.toFixed(2)}%`);
      console.log(`      Sharpe Ratio: ${result.sharpeRatio?.toFixed(2)}`);
      console.log(`      Profit Factor: ${result.profitFactor?.toFixed(2)}`);

      return result;
    } else {
      logTest('Run Backtest', false, data.error || 'Backtest failed');
      return null;
    }
  } catch (error) {
    logTest('Run Backtest', false, error.message);
    return null;
  }
}

async function testGetBacktests(token) {
  console.log('\n📌 TEST 5: Get User Backtests');

  try {
    const response = await fetch(`${API_URL}/api/trading/backtests/user/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.results)) {
      logTest('Get Backtests', true, `Found ${data.results.length} backtest results`);
      return true;
    } else {
      logTest('Get Backtests', false, data.error || 'Invalid response');
      return false;
    }
  } catch (error) {
    logTest('Get Backtests', false, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 ALGORITHMIC TRADING API TESTS');
  console.log('='.repeat(60));

  try {
    // Get auth token
    console.log('\n🔐 Logging in...');
    const token = await getAuthToken();
    console.log('✅ Login successful');

    // Run tests
    const strategyId = await testCreateStrategy(token);
    if (!strategyId) {
      console.log('\n⚠️  Cannot continue without valid strategy ID');
      printSummary();
      return;
    }

    await testGetStrategies(token);
    await testGenerateSignal(token, strategyId);
    const backtestResult = await testRunBacktest(token, strategyId);
    await testGetBacktests(token);

    printSummary();

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
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
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
