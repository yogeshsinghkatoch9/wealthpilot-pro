const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Seed script for advanced analytics tables
 * Populates: BenchmarkHistory, FactorReturns, ESGScores, LiquidityMetrics
 */

async function seedBenchmarkHistory() {
  console.log('Seeding Benchmark History...');

  const benchmarks = ['SPY', 'QQQ', 'DIA', 'IWM'];
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago

  const data = [];

  for (const symbol of benchmarks) {
    let basePrice = symbol === 'SPY' ? 450 : symbol === 'QQQ' ? 380 : symbol === 'DIA' ? 350 : 200;
    let currentDate = new Date(startDate);
    const today = new Date();

    while (currentDate <= today) {
      // Skip weekends
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        // Random walk with slight upward drift
        const drift = 0.0003; // 0.03% per day average
        const volatility = 0.01; // 1% daily vol
        const return_pct = drift + volatility * (Math.random() - 0.5) * 2;
        basePrice = basePrice * (1 + return_pct);

        data.push({
          symbol,
          date: new Date(currentDate),
          close: parseFloat(basePrice.toFixed(2)),
          adjustedClose: parseFloat(basePrice.toFixed(2))
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Batch insert
  const result = await prisma.benchmarkHistory.createMany({
    data,
    skipDuplicates: true
  });

  console.log(`  ✓ Created ${result.count} benchmark history records`);
}

async function seedFactorReturns() {
  console.log('Seeding Factor Returns (Fama-French)...');

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const data = [];
  let currentDate = new Date(startDate);
  const today = new Date();

  while (currentDate <= today) {
    // Skip weekends
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      // Simulated factor returns (daily)
      // Based on typical Fama-French factor statistics
      data.push({
        date: new Date(currentDate),
        mktRf: (Math.random() - 0.45) * 0.02,    // Market - RF: mean ~0.05% daily
        smb: (Math.random() - 0.5) * 0.015,      // Small - Big: mean ~0%
        hml: (Math.random() - 0.5) * 0.012,      // High - Low: mean ~0%
        rmw: (Math.random() - 0.5) * 0.01,       // Robust - Weak: mean ~0%
        cma: (Math.random() - 0.5) * 0.01,       // Conservative - Aggressive: mean ~0%
        mom: (Math.random() - 0.48) * 0.018,     // Momentum: slight positive bias
        rf: 0.00015                               // Risk-free rate: ~4% annual = 0.015% daily
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  const result = await prisma.factorReturns.createMany({
    data,
    skipDuplicates: true
  });

  console.log(`  ✓ Created ${result.count} factor return records`);
}

async function seedESGScores() {
  console.log('Seeding ESG Scores...');

  // Common stocks with realistic ESG profiles
  const stocks = [
    { symbol: 'AAPL', esg: 75, env: 80, soc: 75, gov: 70, carbon: 5.2 },
    { symbol: 'MSFT', esg: 82, env: 85, soc: 80, gov: 80, carbon: 4.8 },
    { symbol: 'GOOGL', esg: 70, env: 75, soc: 65, gov: 70, carbon: 6.1 },
    { symbol: 'AMZN', esg: 55, env: 50, soc: 55, gov: 60, carbon: 15.3 },
    { symbol: 'TSLA', esg: 65, env: 90, soc: 50, gov: 45, carbon: 3.5 },
    { symbol: 'META', esg: 58, env: 60, soc: 50, gov: 65, carbon: 7.2 },
    { symbol: 'NVDA', esg: 72, env: 70, soc: 75, gov: 70, carbon: 6.8 },
    { symbol: 'JPM', esg: 68, env: 60, soc: 70, gov: 75, carbon: 8.5 },
    { symbol: 'V', esg: 74, env: 70, soc: 75, gov: 77, carbon: 4.2 },
    { symbol: 'JNJ', esg: 78, env: 75, soc: 82, gov: 77, carbon: 9.1 },
    { symbol: 'WMT', esg: 62, env: 58, soc: 65, gov: 63, carbon: 12.7 },
    { symbol: 'PG', esg: 76, env: 78, soc: 75, gov: 75, carbon: 7.8 },
    { symbol: 'XOM', esg: 42, env: 25, soc: 50, gov: 52, carbon: 45.2 },
    { symbol: 'CVX', esg: 44, env: 28, soc: 52, gov: 52, carbon: 42.1 },
    { symbol: 'DIS', esg: 66, env: 62, soc: 68, gov: 68, carbon: 8.9 },
    { symbol: 'NFLX', esg: 64, env: 65, soc: 60, gov: 67, carbon: 5.5 },
    { symbol: 'BA', esg: 54, env: 48, soc: 55, gov: 60, carbon: 18.3 },
    { symbol: 'GE', esg: 60, env: 55, soc: 62, gov: 63, carbon: 14.5 },
    { symbol: 'KO', esg: 68, env: 65, soc: 70, gov: 70, carbon: 11.2 },
    { symbol: 'PEP', esg: 71, env: 68, soc: 72, gov: 73, carbon: 10.8 }
  ];

  const today = new Date();
  const data = stocks.map(stock => ({
    symbol: stock.symbol,
    date: today,
    esgScore: stock.esg,
    environmentScore: stock.env,
    socialScore: stock.soc,
    governanceScore: stock.gov,
    carbonFootprint: stock.carbon
  }));

  const result = await prisma.eSGScores.createMany({
    data,
    skipDuplicates: true
  });

  console.log(`  ✓ Created ${result.count} ESG score records`);
}

async function seedLiquidityMetrics() {
  console.log('Seeding Liquidity Metrics...');

  // Stocks with realistic liquidity profiles
  const stocks = [
    { symbol: 'AAPL', spread: 0.01, spreadPct: 0.006, adv: 55000000, dollarVol: 9500000000 },
    { symbol: 'MSFT', spread: 0.02, spreadPct: 0.005, adv: 24000000, dollarVol: 8000000000 },
    { symbol: 'GOOGL', spread: 0.05, spreadPct: 0.035, adv: 20000000, dollarVol: 2800000000 },
    { symbol: 'AMZN', spread: 0.03, spreadPct: 0.018, adv: 48000000, dollarVol: 8000000000 },
    { symbol: 'TSLA', spread: 0.02, spreadPct: 0.009, adv: 95000000, dollarVol: 23000000000 },
    { symbol: 'META', spread: 0.02, spreadPct: 0.004, adv: 15000000, dollarVol: 7500000000 },
    { symbol: 'NVDA', spread: 0.03, spreadPct: 0.003, adv: 42000000, dollarVol: 42000000000 },
    { symbol: 'JPM', spread: 0.01, spreadPct: 0.007, adv: 10000000, dollarVol: 1700000000 },
    { symbol: 'V', spread: 0.02, spreadPct: 0.007, adv: 6500000, dollarVol: 1700000000 },
    { symbol: 'JNJ', spread: 0.01, spreadPct: 0.006, adv: 7000000, dollarVol: 1050000000 },
    { symbol: 'WMT', spread: 0.01, spreadPct: 0.016, adv: 8000000, dollarVol: 520000000 },
    { symbol: 'PG', spread: 0.01, spreadPct: 0.006, adv: 6500000, dollarVol: 1050000000 },
    { symbol: 'XOM', spread: 0.01, spreadPct: 0.009, adv: 18000000, dollarVol: 2000000000 },
    { symbol: 'CVX', spread: 0.01, spreadPct: 0.007, adv: 7000000, dollarVol: 1050000000 },
    { symbol: 'DIS', spread: 0.01, spreadPct: 0.010, adv: 8500000, dollarVol: 770000000 },
    { symbol: 'NFLX', spread: 0.03, spreadPct: 0.004, adv: 3500000, dollarVol: 2100000000 },
    { symbol: 'BA', spread: 0.02, spreadPct: 0.012, adv: 4200000, dollarVol: 660000000 },
    { symbol: 'GE', spread: 0.01, spreadPct: 0.006, adv: 42000000, dollarVol: 6300000000 },
    { symbol: 'KO', spread: 0.01, spreadPct: 0.015, adv: 13000000, dollarVol: 800000000 },
    { symbol: 'PEP', spread: 0.01, spreadPct: 0.006, adv: 4200000, dollarVol: 700000000 }
  ];

  const today = new Date();
  const data = stocks.map(stock => ({
    symbol: stock.symbol,
    date: today,
    bidAskSpread: stock.spread,
    bidAskSpreadPct: stock.spreadPct,
    avgDailyVolume: stock.adv,
    avgDollarVolume: stock.dollarVol
  }));

  const result = await prisma.liquidityMetrics.createMany({
    data,
    skipDuplicates: true
  });

  console.log(`  ✓ Created ${result.count} liquidity metric records`);
}

async function main() {
  console.log('🌱 Starting analytics data seeding...\n');

  try {
    await seedBenchmarkHistory();
    await seedFactorReturns();
    await seedESGScores();
    await seedLiquidityMetrics();

    console.log('\n✅ Analytics data seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding analytics data:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

module.exports = { seedBenchmarkHistory, seedFactorReturns, seedESGScores, seedLiquidityMetrics };
