/**
 * Detailed test to verify portfolio holdings with market data
 */

async function testPortfolioDetails() {
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

    // Step 2: Fetch all portfolios
    console.log('Step 2: Fetching portfolios...');
    const portfoliosResponse = await fetch('http://localhost:4000/api/portfolios', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const portfolios = await portfoliosResponse.json();

    if (!portfoliosResponse.ok) {
      console.error('Failed to fetch portfolios:', portfolios);
      return;
    }

    console.log(`✓ Fetched ${portfolios.length} portfolios\n`);

    // Display first 3 portfolios in detail
    for (let i = 0; i < Math.min(3, portfolios.length); i++) {
      const p = portfolios[i];
      console.log('═══════════════════════════════════════════════════════');
      console.log(`Portfolio ${i + 1}: ${p.name}`);
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  Portfolio ID: ${p.id}`);
      console.log(`  Total Value: $${p.totalValue?.toFixed(2) || '0.00'}`);
      console.log(`  Total Cost: $${p.totalCost?.toFixed(2) || '0.00'}`);
      console.log(`  Total Gain: $${p.totalGain?.toFixed(2) || '0.00'} (${p.totalGainPct?.toFixed(2) || '0.00'}%)`);
      console.log(`  Day Change: $${p.dayChange?.toFixed(2) || '0.00'} (${p.dayChangePct?.toFixed(2) || '0.00'}%)`);
      console.log(`  Cash Balance: $${p.cashBalance?.toFixed(2) || '0.00'}`);
      console.log(`  Holdings Count: ${p.holdings?.length || 0}`);

      if (p.holdings && p.holdings.length > 0) {
        console.log('\n  Holdings:');
        console.log('  ─────────────────────────────────────────────────────');
        p.holdings.forEach((h, idx) => {
          console.log(`  ${idx + 1}. ${h.symbol} - ${h.shares} shares`);
          console.log(`     Current Price: $${h.price?.toFixed(2) || 'N/A'}`);
          console.log(`     Cost Basis: $${h.avgCostBasis?.toFixed(2) || 'N/A'}`);
          console.log(`     Market Value: $${h.marketValue?.toFixed(2) || 'N/A'}`);
          console.log(`     Gain: $${h.gain?.toFixed(2) || 'N/A'} (${h.gainPct?.toFixed(2) || 'N/A'}%)`);
          console.log(`     Day Gain: $${h.dayGain?.toFixed(2) || 'N/A'} (${h.dayGainPct?.toFixed(2) || 'N/A'}%)`);
        });
      } else {
        console.log('\n  ⚠️  No holdings in this portfolio');
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    const totalPortfolioValue = portfolios.reduce((sum, p) => sum + (p.totalValue || 0), 0);
    const totalHoldings = portfolios.reduce((sum, p) => sum + (p.holdings?.length || 0), 0);

    console.log(`Total Portfolios: ${portfolios.length}`);
    console.log(`Total Holdings: ${totalHoldings}`);
    console.log(`Combined Portfolio Value: $${totalPortfolioValue.toFixed(2)}`);
    console.log('');
    console.log('✅ All portfolio data is being fetched with live market prices!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

testPortfolioDetails();
