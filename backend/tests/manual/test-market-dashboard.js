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

    console.log('📊 Fetching Unified Market Dashboard...');
    const response = await axios.get('http://localhost:4000/api/market-dashboard/all', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = response.data;
    console.log('✓ Dashboard loaded successfully\n');
    console.log('📈 SUMMARY: ' + data.summary.online + '/' + data.summary.total + ' components online\n');

    console.log('🔥 Component Status:');
    Object.entries(data.components).forEach(([key, component]) => {
      const status = component.status === 'online' ? '✓' : '✗';
      const color = component.status === 'online' ? '\x1b[32m' : '\x1b[31m';
      console.log(color + status + '\x1b[0m ' + key.padEnd(20) + ' - ' + component.status.toUpperCase());
      if (component.error) {
        console.log('   Error: ' + component.error);
      }
    });

    console.log('\n✅ Unified Market Dashboard is LIVE!');
    console.log('🌐 Access at: http://localhost:3000/market-dashboard');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

test();
