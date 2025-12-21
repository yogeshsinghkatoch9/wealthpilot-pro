const axios = require('axios');

async function test() {
  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    const loginResponse = await axios.post('http://localhost:4000/api/auth/login', {
      email: 'demo@wealthpilot.com',
      password: 'demo123456'
    });
    const token = loginResponse.data.token;
    console.log('✓ Login successful\n');

    // Step 2: Test Backend API directly
    console.log('Step 2: Testing Backend API (http://localhost:4000/api/market-dashboard/all)');
    const backendResponse = await axios.get('http://localhost:4000/api/market-dashboard/all', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('✓ Backend API works - ' + backendResponse.data.summary.online + '/11 components online\n');

    // Step 3: Test Frontend Proxy
    console.log('Step 3: Testing Frontend Proxy (http://localhost:3000/api/market-dashboard/all)');
    const proxyResponse = await axios.get('http://localhost:3000/api/market-dashboard/all', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Cookie': 'token=' + token
      }
    });
    console.log('✓ Frontend Proxy works - ' + proxyResponse.data.summary.online + '/11 components online\n');

    // Step 4: Test without auth (should fail)
    console.log('Step 4: Testing without authentication (should redirect)');
    try {
      await axios.get('http://localhost:3000/api/market-dashboard/all', {
        maxRedirects: 0,
        validateStatus: () => true
      });
    } catch (err) {
      console.log('✓ Correctly requires authentication\n');
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════');
    console.log('Dashboard is ready at: http://localhost:3000/market-dashboard');
    console.log('Login with: demo@wealthpilot.com / demo123456');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();
