#!/usr/bin/env node

/**
 * Market Breadth Data Seeder
 * Populates initial market breadth data for testing
 */

const Database = require('better-sqlite3');
const MarketBreadthService = require('./src/services/marketBreadth/MarketBreadthService');
const { v4: uuidv4 } = require('uuid');

const db = new Database('./database.db');
const breadthService = new MarketBreadthService(db);

console.log('🌱 Market Breadth Data Seeder');
console.log('='.repeat(60));

async function seedIndexConstituents() {
  console.log('\n📊 Seeding index constituents...');

  const indices = [
    {
      index: 'SPY',
      constituents: [
        { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', weight: 7.5 },
        { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', weight: 7.0 },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', weight: 4.5 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', weight: 3.8 },
        { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', weight: 3.5 },
        { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary', weight: 2.8 },
        { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', weight: 2.5 },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financials', weight: 2.2 },
        { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', weight: 1.8 },
        { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', weight: 1.7 }
      ]
    },
    {
      index: 'QQQ',
      constituents: [
        { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', weight: 9.5 },
        { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', weight: 8.5 },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', weight: 5.5 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', weight: 5.0 },
        { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', weight: 4.8 }
      ]
    }
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO index_constituents (
      id, index_symbol, stock_symbol, stock_name, sector, weight, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  let count = 0;
  for (const index of indices) {
    for (const stock of index.constituents) {
      stmt.run(uuidv4(), index.index, stock.symbol, stock.name, stock.sector, stock.weight);
      count++;
    }
  }

  console.log(`   ✅ Seeded ${count} index constituents`);
}

async function seedBreadthData() {
  console.log('\n📈 Calculating and seeding breadth indicators...');

  const indices = ['SPY', 'QQQ'];

  for (const index of indices) {
    console.log(`\n   Processing ${index}...`);

    try {
      // Calculate A/D Line
      console.log(`   📊 Calculating A/D Line for ${index}...`);
      const adLine = await breadthService.calculateAdvanceDeclineLine(index, '3M');
      console.log(`      ✅ A/D Line: ${adLine.currentADLine}, Signal: ${adLine.signal}`);

      // Calculate % Above MAs
      console.log(`   📊 Calculating MA Breadth for ${index}...`);
      const maBreath = await breadthService.calculatePercentAboveMA(index, [20, 50, 100, 200]);
      console.log(`      ✅ MA Breadth: ${maBreath.overallSignal}`);
      console.log(`         200MA: ${maBreath.maPeriods.ma200?.percentage.toFixed(1)}%`);

      // Calculate Highs-Lows
      console.log(`   📊 Calculating Highs-Lows for ${index}...`);
      const highsLows = await breadthService.calculateNewHighsLows(index);
      console.log(`      ✅ 52w Highs: ${highsLows.newHighs52w}, Lows: ${highsLows.newLows52w}, Signal: ${highsLows.signal}`);

    } catch (error) {
      console.error(`   ❌ Error processing ${index}:`, error.message);
    }
  }
}

async function main() {
  try {
    await seedIndexConstituents();
    await seedBreadthData();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Market Breadth Seeding Complete!');
    console.log('\nNext steps:');
    console.log('1. Start the backend server: npm start');
    console.log('2. Visit: http://localhost:3000/market');
    console.log('3. Market Breadth Dashboard should load with live data');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
