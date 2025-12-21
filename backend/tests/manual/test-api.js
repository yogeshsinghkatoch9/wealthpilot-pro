#!/usr/bin/env node
/**
 * WealthPilot Pro - API Test Script
 * Tests all major API endpoints
 */

const API_URL = 'http://localhost:4000/api';

async function test() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           WealthPilot Pro - API Test Suite                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  let token = null;
  let passed = 0;
  let failed = 0;

  async function testEndpoint(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  async function fetchAPI(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  // Test health
  await testEndpoint('Health Check', async () => {
    const res = await fetch('http://localhost:4000/health');
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Health check failed');
  });

  // Test login
  await testEndpoint('Login', async () => {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@wealthpilot.com', password: 'demo123456' })
    });
    if (!data.token) throw new Error('No token received');
    token = data.token;
    console.log(`   Token: ${token.slice(0, 30)}...`);
  });

  // Test user info
  await testEndpoint('Get Current User', async () => {
    const data = await fetchAPI('/auth/me');
    if (!data.user) throw new Error('No user data');
    console.log(`   User: ${data.user.email}`);
  });

  // Test portfolios
  await testEndpoint('Get Portfolios', async () => {
    const data = await fetchAPI('/portfolios');
    if (!Array.isArray(data)) throw new Error('Invalid portfolios response');
    console.log(`   Found ${data.length} portfolios`);
  });

  // Test market data
  await testEndpoint('Get Stock Quote (AAPL)', async () => {
    const data = await fetchAPI('/market/quote/AAPL');
    if (!data.symbol) throw new Error('No quote data');
    console.log(`   AAPL: $${data.price}`);
  });

  // Test dashboard
  await testEndpoint('Get Dashboard', async () => {
    const data = await fetchAPI('/analytics/dashboard');
    if (data.error) throw new Error(data.error);
    console.log(`   Total Value: $${(data.totalValue || 0).toLocaleString()}`);
  });

  // Test watchlists
  await testEndpoint('Get Watchlists', async () => {
    const data = await fetchAPI('/watchlists');
    if (!Array.isArray(data)) throw new Error('Invalid watchlists response');
    console.log(`   Found ${data.length} watchlists`);
  });

  // Test transactions
  await testEndpoint('Get Transactions', async () => {
    const data = await fetchAPI('/transactions');
    if (!data.transactions) throw new Error('Invalid transactions response');
    console.log(`   Found ${data.transactions.length} transactions`);
  });

  // Test alerts
  await testEndpoint('Get Alerts', async () => {
    const data = await fetchAPI('/alerts');
    if (!Array.isArray(data)) throw new Error('Invalid alerts response');
    console.log(`   Found ${data.length} alerts`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
