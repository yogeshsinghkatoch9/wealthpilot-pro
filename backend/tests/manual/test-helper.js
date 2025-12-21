const PortfolioDataHelper = require('./src/services/portfolioDataHelper');

const userId = 'aee2c3f4-3e5d-4283-8253-1bce12903faf';

console.log('Testing PortfolioDataHelper...\n');

// Test get portfolios
const portfolios = PortfolioDataHelper.getPortfolios(userId, 'all');
console.log(`Found ${portfolios.length} portfolios`);

portfolios.forEach((p, idx) => {
  console.log(`\nPortfolio ${idx + 1}:`);
  console.log(`  ID: ${p.id}`);
  console.log(`  Name: ${p.name}`);
  console.log(`  Holdings: ${p.holdings ? p.holdings.length : 0}`);

  if (p.holdings && p.holdings.length > 0) {
    console.log('  Holdings details:');
    p.holdings.forEach(h => {
      console.log(`    - ${h.symbol}: ${h.shares} shares @ $${h.avgCostBasis}`);
    });
  }
});

// Test get all holdings
const allHoldings = PortfolioDataHelper.getAllHoldings(portfolios);
console.log(`\nTotal holdings across all portfolios: ${allHoldings.length}`);

// Test sector allocation
if (allHoldings.length > 0) {
  const sectorAlloc = PortfolioDataHelper.getSectorAllocation(allHoldings);
  console.log('\nSector Allocation:');
  Object.entries(sectorAlloc).forEach(([sector, data]) => {
    console.log(`  ${sector}: ${(data.weight * 100).toFixed(2)}%, return: ${(data.return * 100).toFixed(2)}%`);
  });
}
