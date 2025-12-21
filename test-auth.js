const fetch = require('node-fetch');

async function testAuth() {
  console.log('Testing authentication...\n');

  // Test login
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@wealthpilot.com',
      password: 'demo123456'
    })
  });

  const loginData = await loginRes.json();
  console.log('Login Response:', JSON.stringify(loginData, null, 2));

  if (loginData.token) {
    console.log('\n✅ Authentication working!');
    console.log('Token:', loginData.token.substring(0, 50) + '...');

    // Test authenticated request
    const portfolioRes = await fetch('http://localhost:4000/api/portfolios', {
      headers: { 'Authorization': `Bearer ${loginData.token}` }
    });

    const portfolios = await portfolioRes.json();
    console.log('\n✅ Authenticated API call working!');
    console.log('Portfolios found:', Array.isArray(portfolios) ? portfolios.length : 0);
  } else {
    console.log('\n❌ Authentication failed!');
    console.log('Error:', loginData.error || 'Unknown error');
  }
}

testAuth().catch(console.error);
