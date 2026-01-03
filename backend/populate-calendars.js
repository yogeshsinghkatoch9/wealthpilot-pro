/**
 * Populate Calendar Data
 * Fetches and populates earnings and IPO calendars with live data
 */

const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'data/wealthpilot.db');
const db = new Database(dbPath);

// Import services
const EarningsCalendarService = require('./src/services/earningsCalendar.js');
const IPOCalendarService = require('./src/services/ipoCalendar.js');

const dbAdapter = { db };
const earningsService = new EarningsCalendarService(dbAdapter);
const ipoService = new IPOCalendarService(dbAdapter);

async function populateCalendars() {
  console.log('\n🔄 Populating Calendar Data...\n');

  // 1. Populate Earnings Calendar
  console.log('📊 Populating Earnings Calendar...');
  try {
    // Get user's portfolio symbols
    const userSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX',
      'V', 'JNJ', 'PG', 'KO', 'PEP', 'T', 'VZ', 'XOM', 'MMM'
    ];

    const result = await earningsService.refreshEarningsData(90, userSymbols);

    if (result.success) {
      console.log(`✅ Earnings: ${result.total} records (${result.inserted} inserted, ${result.updated} updated)`);
      console.log(`   Source: ${result.mock ? 'Mock Data (API restricted)' : 'Live API'}`);
    } else {
      console.log(`❌ Earnings: Failed - ${result.error || result.message}`);
    }
  } catch (error) {
    console.error(`❌ Earnings Error: ${error.message}`);
  }

  // 2. Populate IPO Calendar
  console.log('\n💰 Populating IPO Calendar...');
  try {
    const result = await ipoService.refreshIPOData(90);

    if (result.success) {
      console.log(`✅ IPOs: ${result.total} records (${result.inserted} inserted, ${result.updated} updated)`);
      console.log(`   Source: ${result.mock ? 'Mock Data (API restricted)' : 'Live API (Finnhub)'}`);
    } else {
      console.log(`❌ IPOs: Failed - ${result.error || result.message}`);
    }
  } catch (error) {
    console.error(`❌ IPO Error: ${error.message}`);
  }

  // 3. Verify Data
  console.log('\n📋 Verifying Data...');

  const earningsCount = db.prepare('SELECT COUNT(*) as count FROM earnings_calendar').get();
  const ipoCount = db.prepare('SELECT COUNT(*) as count FROM ipo_calendar').get();
  const dividendCount = db.prepare('SELECT COUNT(*) as count FROM dividend_calendar').get();

  console.log(`   Earnings: ${earningsCount.count} records`);
  console.log(`   IPOs: ${ipoCount.count} records`);
  console.log(`   Dividends: ${dividendCount.count} records`);

  console.log('\n✅ Calendar population complete!\n');

  db.close();
  process.exit(0);
}

populateCalendars().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
