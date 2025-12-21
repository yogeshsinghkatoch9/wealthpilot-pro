#!/usr/bin/env node

/**
 * Comprehensive Upload Flow Test
 * Tests: Auth → Login → Upload → Verify
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
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

async function test1_BackendRunning() {
  console.log('\n📌 TEST 1: Backend Server Running');
  try {
    const response = await fetch(`${API_URL}/health`, { timeout: 5000 }).catch(() => null);
    if (!response) {
      logTest('Backend Server', false, 'Server not responding. Run: cd backend && npm start');
      return false;
    }
    logTest('Backend Server', true, 'Server is running on port 4000');
    return true;
  } catch (error) {
    logTest('Backend Server', false, error.message);
    return false;
  }
}

async function test2_DatabaseSetup() {
  console.log('\n📌 TEST 2: Database Configuration');
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'data/wealthpilot.db');

    if (!fs.existsSync(dbPath)) {
      logTest('Database File', false, 'wealthpilot.db not found');
      return false;
    }

    const db = new Database(dbPath);

    // Check uploaded_portfolios table
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='uploaded_portfolios'").get();
    if (!table) {
      logTest('uploaded_portfolios table', false, 'Table does not exist');
      db.close();
      return false;
    }
    logTest('uploaded_portfolios table', true, 'Table exists');

    // Check file_format constraint
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='uploaded_portfolios'").get();
    const hasXlsSupport = schema.sql.includes("'xls'");
    logTest('XLS format support', hasXlsSupport, hasXlsSupport ? 'Migration 011 applied' : 'Migration 011 NOT applied');

    // Check demo user
    const demoUser = db.prepare("SELECT id, email FROM users WHERE email = 'demo@wealthpilot.com'").get();
    logTest('Demo user exists', !!demoUser, demoUser ? `User ID: ${demoUser.id}` : 'Run seed script to create demo user');

    db.close();
    return true;
  } catch (error) {
    logTest('Database Setup', false, error.message);
    return false;
  }
}

async function test3_LoginFlow() {
  console.log('\n📌 TEST 3: Login & Authentication');
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

    if (!response.ok) {
      logTest('Login API', false, data.error || 'Login failed');
      return null;
    }

    if (!data.token) {
      logTest('Login API', false, 'No token in response');
      return null;
    }

    logTest('Login API', true, `Token received (${data.token.substring(0, 20)}...)`);
    logTest('Token format', data.token.startsWith('eyJ'), 'Valid JWT format');

    return data.token;
  } catch (error) {
    logTest('Login Flow', false, error.message);
    return null;
  }
}

async function test4_AuthenticatedRequest(token) {
  console.log('\n📌 TEST 4: Authenticated API Request');
  try {
    const response = await fetch(`${API_URL}/api/portfolios`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.error === 'No token provided') {
      logTest('Authentication Middleware', false, 'Token not being validated');
      return false;
    }

    if (data.error === 'Invalid or expired token') {
      logTest('Authentication Middleware', false, 'Token validation failed');
      return false;
    }

    logTest('Authentication Middleware', true, `Fetched ${Array.isArray(data) ? data.length : 0} portfolios`);
    return true;
  } catch (error) {
    logTest('Authenticated Request', false, error.message);
    return false;
  }
}

async function test5_UploadEndpoint(token) {
  console.log('\n📌 TEST 5: Portfolio Upload Endpoint');
  try {
    // Create a test CSV file
    const testCsvContent = `symbol,quantity,costBasis,purchaseDate
AAPL,100,150.00,2023-01-15
MSFT,50,300.00,2023-02-20
GOOGL,25,120.00,2023-03-10`;

    const testFilePath = path.join(__dirname, 'test-portfolio.csv');
    fs.writeFileSync(testFilePath, testCsvContent);

    // Create FormData
    const form = new FormData();
    form.append('portfolio', fs.createReadStream(testFilePath), {
      filename: 'test-portfolio.csv',
      contentType: 'text/csv'
    });
    form.append('portfolioName', `Test Portfolio ${Date.now()}`);

    // Upload
    const response = await fetch(`${API_URL}/api/portfolio-upload/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });

    // Check response type before parsing
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.log('Non-JSON response received:', text.substring(0, 200));
      logTest('Upload Endpoint', false, `Server returned HTML instead of JSON. Status: ${response.status}`);
      fs.unlinkSync(testFilePath);
      return false;
    }

    // Cleanup test file
    fs.unlinkSync(testFilePath);

    if (!response.ok) {
      console.log('Upload failed - Full response:', JSON.stringify(data, null, 2));
      console.log('Response status:', response.status);
      logTest('Upload Endpoint', false, data.error || `HTTP ${response.status}`);
      return false;
    }

    if (data.success && data.uploadId) {
      logTest('Upload Endpoint', true, `Upload ID: ${data.uploadId}`);
      logTest('Upload Status', data.status === 'processing', `Status: ${data.status}`);
      return data.uploadId;
    } else {
      logTest('Upload Endpoint', false, 'No uploadId in response');
      return false;
    }
  } catch (error) {
    logTest('Upload Test', false, error.message);
    return false;
  }
}

async function test6_UploadStatus(token, uploadId) {
  console.log('\n📌 TEST 6: Upload Status Check');
  if (!uploadId) {
    logTest('Upload Status', false, 'No uploadId from previous test');
    return;
  }

  try {
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetch(`${API_URL}/api/portfolio-upload/status/${uploadId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      logTest('Status Check', false, data.error);
      return;
    }

    logTest('Status Check', true, `Status: ${data.upload.status}`);

    if (data.upload.status === 'completed') {
      logTest('Upload Processing', true, `Portfolio: ${data.upload.portfolioName}, Holdings: ${data.upload.totalHoldings}`);
    } else if (data.upload.status === 'failed') {
      logTest('Upload Processing', false, `Error: ${data.upload.errorMessage}`);
    } else {
      logTest('Upload Processing', true, 'Still processing...');
    }
  } catch (error) {
    logTest('Upload Status', false, error.message);
  }
}

async function runAllTests() {
  console.log('🧪 WEALTHPILOT UPLOAD FLOW TESTS');
  console.log('='.repeat(50));

  const backendOk = await test1_BackendRunning();
  if (!backendOk) {
    console.log('\n⚠️  Backend server must be running to continue tests');
    console.log('Run: cd backend && npm start');
    printSummary();
    return;
  }

  await test2_DatabaseSetup();

  const token = await test3_LoginFlow();
  if (!token) {
    console.log('\n⚠️  Cannot continue without valid token');
    printSummary();
    return;
  }

  await test4_AuthenticatedRequest(token);

  const uploadId = await test5_UploadEndpoint(token);

  await test6_UploadStatus(token, uploadId);

  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
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
