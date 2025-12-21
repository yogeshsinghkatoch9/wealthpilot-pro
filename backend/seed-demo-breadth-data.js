#!/usr/bin/env node

/**
 * Demo Market Breadth Data Seeder
 * Populates demo market breadth data for immediate dashboard functionality
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const db = new Database('./database.db');

console.log('🌱 Seeding Demo Market Breadth Data');
console.log('='.repeat(60));

function seedIndexConstituents() {
  console.log('\n📊 Seeding index constituents...');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO index_constituents (
      id, index_symbol, stock_symbol, stock_name, sector, weight, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const sp500Stocks = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'JNJ',
    'V', 'PG', 'UNH', 'MA', 'HD', 'CVX', 'LLY', 'MRK', 'PEP', 'ABBV',
    'KO', 'COST', 'AVGO', 'TMO', 'WMT', 'MCD', 'CSCO', 'ACN', 'DIS', 'ABT'
  ];

  sp500Stocks.forEach((symbol, idx) => {
    stmt.run(
      uuidv4(),
      'SPY',
      symbol,
      `${symbol} Inc.`,
      'Technology',
      (100 - idx) / 100
    );
  });

  console.log(`   ✅ Seeded ${sp500Stocks.length} constituents for SPY`);
}

function seedAdvanceDeclineData() {
  console.log('\n📈 Seeding Advance/Decline data...');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO market_advance_decline (
      id, date, index_symbol, advancing, declining, unchanged,
      total_issues, ad_ratio, ad_line, net_advances, data_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
  `);

  const today = new Date();
  let adLine = 0;

  // Generate 90 days of historical data
  for (let i = 90; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Generate realistic A/D data with trend
    const advancing = Math.floor(300 + Math.random() * 150 + (90 - i) * 0.5);
    const declining = Math.floor(150 + Math.random() * 150 - (90 - i) * 0.3);
    const unchanged = 50;
    const netAdvances = advancing - declining;
    adLine += netAdvances;

    stmt.run(
      uuidv4(),
      dateStr,
      'SPY',
      advancing,
      declining,
      unchanged,
      500,
      advancing / declining,
      adLine,
      netAdvances
    );
  }

  console.log(`   ✅ Seeded 91 days of A/D data`);
}

function seedMABreadthData() {
  console.log('\n📊 Seeding MA Breadth data...');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO market_ma_breadth (
      id, date, index_symbol, ma_period, above_ma, below_ma,
      total_stocks, percent_above, data_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo')
  `);

  const today = new Date();
  const periods = [20, 50, 100, 200];

  // Generate 30 days of data
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    periods.forEach(period => {
      // Generate realistic percentages (higher for shorter MAs)
      const basePercent = period === 20 ? 75 :
                         period === 50 ? 65 :
                         period === 100 ? 60 : 55;

      const aboveMA = Math.floor(500 * (basePercent + Math.random() * 10 - 5) / 100);
      const belowMA = 500 - aboveMA;
      const percentAbove = (aboveMA / 500) * 100;

      stmt.run(
        uuidv4(),
        dateStr,
        'SPY',
        period,
        aboveMA,
        belowMA,
        500,
        percentAbove
      );
    });
  }

  console.log(`   ✅ Seeded 31 days of MA Breadth data for 4 periods`);
}

function seedHighsLowsData() {
  console.log('\n📈 Seeding Highs-Lows data...');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO market_highs_lows (
      id, date, index_symbol, new_highs_52w, new_lows_52w,
      new_highs_20d, new_lows_20d, hl_index, hl_ratio,
      total_issues, data_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
  `);

  const today = new Date();

  // Generate 30 days of data
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const newHighs52w = Math.floor(80 + Math.random() * 40);
    const newLows52w = Math.floor(20 + Math.random() * 20);
    const newHighs20d = Math.floor(120 + Math.random() * 60);
    const newLows20d = Math.floor(30 + Math.random() * 30);

    const hlIndex = newHighs52w - newLows52w;
    const hlRatio = newLows52w > 0 ? newHighs52w / newLows52w : newHighs52w;

    stmt.run(
      uuidv4(),
      dateStr,
      'SPY',
      newHighs52w,
      newLows52w,
      newHighs20d,
      newLows20d,
      hlIndex,
      hlRatio,
      500
    );
  }

  console.log(`   ✅ Seeded 31 days of Highs-Lows data`);
}

function main() {
  try {
    seedIndexConstituents();
    seedAdvanceDeclineData();
    seedMABreadthData();
    seedHighsLowsData();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Demo Market Breadth Data Seeded Successfully!');
    console.log('\nThe dashboard is now ready with demo data.');
    console.log('\nNext steps:');
    console.log('1. Restart your backend server if running');
    console.log('2. Visit: http://localhost:3000/market');
    console.log('3. You should see a fully functional Market Breadth dashboard!');
    console.log('\nNote: This is demo data. Configure real API keys');
    console.log('in .env.market-breadth for live market data.');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
