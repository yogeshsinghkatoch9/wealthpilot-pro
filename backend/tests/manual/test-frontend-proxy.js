const axios = require('axios');

async function test() {
  try {
    console.log('🔐 Logging in...');
    const login = await axios.post('http://localhost:4000/api/auth/login', {
      email: 'demo@wealthpilot.com',
      password: 'demo123456'
    });

    const token = login.data.token;
    console.log('✓ Login successful\n');

    console.log('📊 Testing Frontend Proxy at http://localhost:3000/api/market-dashboard/all');
    const response = await axios.get('http://localhost:3000/api/market-dashboard/all', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Cookie': 'token=' + token
      }
    });

    console.log('✓ Frontend proxy works!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

test();
