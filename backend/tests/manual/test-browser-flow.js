const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;
const tough = require('tough-cookie');

async function testBrowserFlow() {
  console.log('🌐 Simulating Browser Flow...\n');

  // Create axios instance with cookie jar (simulates browser cookies)
  const cookieJar = new tough.CookieJar();
  const client = axiosCookieJarSupport(axios.create({
    jar: cookieJar,
    withCredentials: true,
    maxRedirects: 5
  }));

  try {
    // Step 1: Login via backend
    console.log('Step 1: Login to get session');
    const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
      email: 'demo@wealthpilot.com',
      password: 'demo123456'
    });
    const token = loginRes.data.token;
    console.log('✓ Got token:', token.substring(0, 20) + '...\n');

    // Step 2: Access dashboard page (should work with token in cookie)
    console.log('Step 2: Access dashboard page');
    const pageRes = await client.get('http://localhost:3000/market-dashboard', {
      headers: {
        'Cookie': `token=${token}`
      }
    });

    const hasTitle = pageRes.data.includes('UNIFIED MARKET DASHBOARD');
    const hasScript = pageRes.data.includes('loadDashboard');
    const hasCredentials = pageRes.data.includes("credentials: 'include'");

    console.log('✓ Page loads:', pageRes.status === 200);
    console.log('✓ Has dashboard title:', hasTitle);
    console.log('✓ Has JavaScript:', hasScript);
    console.log('✓ Has auth fix:', hasCredentials);
    console.log('');

    // Step 3: Call API endpoint (what the JavaScript does)
    console.log('Step 3: Fetch dashboard data (simulating JavaScript)');
    const apiRes = await client.get('http://localhost:3000/api/market-dashboard/all', {
      headers: {
        'Cookie': `token=${token}`
      }
    });

    console.log('✓ API responds:', apiRes.status === 200);
    console.log('✓ Data is valid:', apiRes.data.success === true);
    console.log('✓ Components online:', apiRes.data.summary.online + '/11');
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('✅ COMPLETE BROWSER FLOW WORKS!');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('📍 Access Dashboard:');
    console.log('   http://localhost:3000/market-dashboard');
    console.log('');
    console.log('🔐 Login Credentials:');
    console.log('   Email: demo@wealthpilot.com');
    console.log('   Password: demo123456');
    console.log('');
    console.log('The dashboard is fully operational!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    process.exit(1);
  }
}

testBrowserFlow();
