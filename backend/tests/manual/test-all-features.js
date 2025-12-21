/**
 * Test All 13 Live Features
 * Verifies each endpoint returns live data
 */

const BASE_URL = 'http://localhost:4000/api';

const features = [
  // OVERVIEW
  { name: 'Market Dashboard', endpoint: '/market/movers', category: 'OVERVIEW' },
  { name: 'Market Breadth', endpoint: '/market-breadth/all/SPY', category: 'OVERVIEW', requiresAuth: true },
  { name: 'Top Movers', endpoint: '/market/movers', category: 'OVERVIEW' },
  { name: 'Market Sentiment', endpoint: '/sentiment/analysis/SPY', category: 'OVERVIEW' },

  // SECTORS
  { name: 'Sector Overview', endpoint: '/sector-analysis/overview', category: 'SECTORS' },
  { name: 'Sector Rotation', endpoint: '/sector-rotation/analysis', category: 'SECTORS' },
  { name: 'Sector Heatmap', endpoint: '/sector-heatmap/data', category: 'SECTORS' },
  { name: 'ETF Analyzer', endpoint: '/etf-analyzer/analyze/SPY', category: 'SECTORS' },

  // CALENDAR
  { name: 'Economic Calendar', endpoint: '/economic-calendar/events', category: 'CALENDAR' },
  { name: 'Earnings Calendar', endpoint: '/earnings-calendar/upcoming', category: 'CALENDAR', requiresAuth: true },
  { name: 'Dividend Calendar', endpoint: '/dividend-calendar/upcoming', category: 'CALENDAR', requiresAuth: true },
  { name: 'IPO Tracker', endpoint: '/ipo-calendar/upcoming', category: 'CALENDAR', requiresAuth: true },
  { name: 'SPAC Tracker', endpoint: '/spac-tracker/upcoming', category: 'CALENDAR', requiresAuth: true }
];

async function testFeature(feature) {
  try {
    const headers = {};
    if (feature.requiresAuth) {
      // Skip auth-required endpoints for now - they need valid token
      return { name: feature.name, status: 'SKIPPED (Auth Required)', category: feature.category };
    }

    const response = await fetch(BASE_URL + feature.endpoint, { headers });
    const data = await response.json();

    if (response.ok && data) {
      return {
        name: feature.name,
        status: '✅ LIVE',
        category: feature.category,
        hasData: Array.isArray(data) ? data.length > 0 : !!data
      };
    } else {
      return {
        name: feature.name,
        status: `❌ ERROR: ${data.error || data.message || 'Unknown'}`,
        category: feature.category
      };
    }
  } catch (error) {
    return {
      name: feature.name,
      status: `❌ FAILED: ${error.message}`,
      category: feature.category
    };
  }
}

async function testAll() {
  console.log('\n🔍 TESTING ALL 13 LIVE FEATURES\n');
  console.log('='.repeat(60));

  const results = await Promise.all(features.map(testFeature));

  // Group by category
  const categories = ['OVERVIEW', 'SECTORS', 'CALENDAR'];

  for (const category of categories) {
    console.log(`\n📊 ${category}`);
    console.log('-'.repeat(60));

    const categoryResults = results.filter(r => r.category === category);
    for (const result of categoryResults) {
      console.log(`${result.status.padEnd(30)} ${result.name}`);
      if (result.hasData !== undefined) {
        console.log(`   ${result.hasData ? '✓ Has Data' : '⚠ Empty Response'}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  const liveCount = results.filter(r => r.status.includes('LIVE')).length;
  const errorCount = results.filter(r => r.status.includes('ERROR') || r.status.includes('FAILED')).length;
  const skippedCount = results.filter(r => r.status.includes('SKIPPED')).length;

  console.log('\n📈 SUMMARY:');
  console.log(`   ✅ Live: ${liveCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   ⏭️  Skipped (Auth): ${skippedCount}`);
  console.log(`   📊 Total: ${features.length}`);
  console.log('');
}

testAll();
