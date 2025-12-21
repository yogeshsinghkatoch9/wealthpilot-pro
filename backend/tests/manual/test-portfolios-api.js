/**
 * Test script to verify portfolios API endpoint
 */

async function testPortfoliosAPI() {
  try {
    // Step 1: Login to get a token
    console.log('Step 1: Logging in...');
    const loginResponse = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@wealthpilot.com',
        password: 'demo123456'
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login response status:', loginResponse.status);

    if (!loginResponse.ok) {
      console.error('Login failed:', loginData);
      return;
    }

    const token = loginData.token;
    console.log('✓ Login successful');
    console.log('Token:', token.substring(0, 30) + '...');

    // Decode token to see user info
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.log('User ID from token:', payload.userId);
    console.log('Email from token:', payload.email);

    // Step 2: Fetch portfolios
    console.log('\nStep 2: Fetching portfolios...');
    const portfoliosResponse = await fetch('http://localhost:4000/api/portfolios', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Portfolios response status:', portfoliosResponse.status);

    const portfoliosData = await portfoliosResponse.json();

    if (!portfoliosResponse.ok) {
      console.error('Portfolios fetch failed:', portfoliosData);
      return;
    }

    console.log('\n✓ Portfolios fetched successfully!');
    console.log('Type:', Array.isArray(portfoliosData) ? 'array' : typeof portfoliosData);
    console.log('Count:', Array.isArray(portfoliosData) ? portfoliosData.length : 'N/A');

    if (Array.isArray(portfoliosData) && portfoliosData.length > 0) {
      console.log('\nFirst portfolio:');
      console.log('  ID:', portfoliosData[0].id);
      console.log('  Name:', portfoliosData[0].name);
      console.log('  Holdings:', portfoliosData[0].holdings?.length || 0);
      console.log('  Total Value:', portfoliosData[0].totalValue);
    } else if (Array.isArray(portfoliosData)) {
      console.log('\n⚠️  Empty array returned (no portfolios found)');
    } else {
      console.log('\n⚠️  Unexpected data format:', JSON.stringify(portfoliosData, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

testPortfoliosAPI();
