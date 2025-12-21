/**
 * Test sector analysis with actual portfolio holdings
 */

async function testSectorAnalysis() {
  try {
    // Step 1: Login
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
    if (!loginResponse.ok) {
      console.error('Login failed:', loginData);
      return;
    }

    const token = loginData.token;
    console.log('✓ Login successful\n');

    // Step 2: Get portfolios
    console.log('Step 2: Fetching portfolios...');
    const portfoliosResponse = await fetch('http://localhost:4000/api/portfolios', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const portfolios = await portfoliosResponse.json();
    console.log(`✓ Found ${portfolios.length} portfolios\n`);

    // Step 3: Test sector allocation for first portfolio
    const firstPortfolio = portfolios[0];
    console.log(`Step 3: Testing sector allocation for: ${firstPortfolio.name}`);
    console.log(`Portfolio ID: ${firstPortfolio.id}\n`);

    const sectorResponse = await fetch(
      `http://localhost:4000/api/sector-analysis-fixed/portfolio/${firstPortfolio.id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const sectorData = await sectorResponse.json();

    if (sectorData.success) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('SECTOR ALLOCATION');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`Portfolio: ${sectorData.data.portfolioName}`);
      console.log(`Total Value: $${sectorData.data.totalValue.toFixed(2)}`);
      console.log(`Holdings Count: ${sectorData.data.holdingsCount}`);
      console.log('');

      sectorData.data.allocations.forEach((sector, idx) => {
        console.log(`${idx + 1}. ${sector.sector}`);
        console.log(`   Value: $${sector.value.toFixed(2)}`);
        console.log(`   Percentage: ${sector.percentage.toFixed(2)}%`);
        console.log(`   Holdings: ${sector.holdingsCount}`);
        console.log(`   Symbols: ${sector.holdings.map(h => h.symbol).join(', ')}`);
        console.log('');
      });
    } else {
      console.error('Failed to get sector data:', sectorData);
    }

    // Step 4: Test combined allocation for ALL portfolios
    console.log('\nStep 4: Testing combined sector allocation for ALL portfolios...\n');

    const allSectorResponse = await fetch(
      'http://localhost:4000/api/sector-analysis-fixed/all-portfolios',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const allSectorData = await allSectorResponse.json();

    if (allSectorData.success) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('COMBINED SECTOR ALLOCATION (ALL PORTFOLIOS)');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`Total Portfolios: ${allSectorData.data.portfoliosCount}`);
      console.log(`Total Holdings: ${allSectorData.data.totalHoldings}`);
      console.log(`Total Value: $${allSectorData.data.totalValue.toFixed(2)}`);
      console.log('');

      allSectorData.data.allocations.forEach((sector, idx) => {
        console.log(`${idx + 1}. ${sector.sector}`);
        console.log(`   Value: $${sector.value.toFixed(2)}`);
        console.log(`   Percentage: ${sector.percentage.toFixed(2)}%`);
        console.log(`   Holdings: ${sector.holdingsCount} across ${sector.portfoliosCount} portfolios`);
        console.log('');
      });

      console.log('✅ Sector analysis is working with your real portfolio holdings!');
    } else {
      console.error('Failed to get all portfolios sector data:', allSectorData);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

// Wait for servers to start
setTimeout(testSectorAnalysis, 8000);
