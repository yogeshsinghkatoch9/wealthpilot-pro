const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const dbPath = path.join(__dirname, '../../data/wealthpilot.db');
const db = new Database(dbPath);

/**
 * Generate Historical Portfolio Snapshots
 * Creates daily snapshots for the past year with realistic market movements
 */

logger.debug('🔄 Generating Historical Portfolio Snapshots...\n');

// Get all portfolios
const portfolios = db.prepare('SELECT * FROM portfolios').all();

if (portfolios.length === 0) {
  logger.debug('❌ No portfolios found. Please create portfolios first.');
  process.exit(1);
}

logger.debug(`Found ${portfolios.length} portfolio(s)`);

// Generate snapshots for each portfolio
portfolios.forEach(portfolio => {
  logger.debug(`\n📊 Processing: ${portfolio.name} (${portfolio.id})`);

  // Get current holdings
  const holdings = db.prepare(`
    SELECT h.*, sq.price as current_price
    FROM holdings h
    LEFT JOIN stock_quotes sq ON h.symbol = sq.symbol
    WHERE h.portfolio_id = ?
  `).all(portfolio.id);

  if (holdings.length === 0) {
    logger.debug('  ⚠️  No holdings found, skipping...');
    return;
  }

  // Calculate starting values
  const currentValue = holdings.reduce((sum, h) => {
    const price = h.current_price || h.avg_cost_basis;
    return sum + (h.shares * price);
  }, 0);

  const costBasis = holdings.reduce((sum, h) => {
    return sum + (h.shares * h.avg_cost_basis);
  }, 0);

  logger.debug(`  Current Value: $${currentValue.toFixed(2)}`);
  logger.debug(`  Cost Basis: $${costBasis.toFixed(2)}`);

  // Delete existing snapshots
  db.prepare('DELETE FROM portfolio_snapshots WHERE portfolio_id = ?').run(portfolio.id);

  // Generate 365 days of historical data
  const daysToGenerate = 365;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysToGenerate);

  // Market volatility parameters
  const annualReturn = 0.10; // 10% expected annual return
  const annualVolatility = 0.15; // 15% annual volatility
  const dailyReturn = annualReturn / 252; // Trading days per year
  const dailyVolatility = annualVolatility / Math.sqrt(252);

  let previousValue = currentValue * 0.9; // Start 10% lower a year ago
  let previousGain = previousValue - costBasis;

  const snapshots = [];

  for (let i = 0; i < daysToGenerate; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue;
    }

    // Generate random daily return (geometric Brownian motion)
    const randomShock = (Math.random() - 0.5) * 2; // Random value between -1 and 1
    const dailyPctChange = dailyReturn + (dailyVolatility * randomShock);

    // Calculate new value
    const newValue = previousValue * (1 + dailyPctChange);
    const dayChange = newValue - previousValue;
    const dayChangePct = (dayChange / previousValue) * 100;

    const totalGain = newValue - costBasis;
    const totalGainPct = (totalGain / costBasis) * 100;

    snapshots.push({
      id: uuidv4(),
      portfolio_id: portfolio.id,
      snapshot_date: date.toISOString().split('T')[0],
      total_value: newValue,
      total_cost: costBasis,
      cash_balance: portfolio.cash_balance || 0,
      total_gain: totalGain,
      total_gain_pct: totalGainPct,
      day_change: dayChange,
      day_change_pct: dayChangePct
    });

    previousValue = newValue;
    previousGain = totalGain;
  }

  logger.debug(`  Generating ${snapshots.length} daily snapshots...`);

  // Insert snapshots in batches
  const insert = db.prepare(`
    INSERT INTO portfolio_snapshots (
      id, portfolio_id, snapshot_date, total_value,
      cash_balance, total_gain, total_gain_pct, day_gain, day_gain_pct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((snapshots) => {
    for (const snap of snapshots) {
      insert.run(
        snap.id,
        snap.portfolio_id,
        snap.snapshot_date,
        snap.total_value,
        snap.cash_balance,
        snap.total_gain,
        snap.total_gain_pct,
        snap.day_change,
        snap.day_change_pct
      );
    }
  });

  insertMany(snapshots);

  // Calculate statistics
  const values = snapshots.map(s => s.total_value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const finalValue = values[values.length - 1];
  const startValue = values[0];
  const totalReturn = ((finalValue - startValue) / startValue) * 100;

  logger.debug(`  ✅ Generated ${snapshots.length} snapshots`);
  logger.debug(`  📈 Start: $${startValue.toFixed(2)} → End: $${finalValue.toFixed(2)}`);
  logger.debug(`  📊 Range: $${minValue.toFixed(2)} - $${maxValue.toFixed(2)}`);
  logger.debug(`  💰 Total Return: ${totalReturn.toFixed(2)}%`);
});

logger.debug('\n✨ Historical snapshot generation complete!');
logger.debug('\n📊 Summary:');
const totalSnapshots = db.prepare('SELECT COUNT(*) as count FROM portfolio_snapshots').get();
logger.debug(`   Total snapshots in database: ${totalSnapshots.count}`);

// Show date range
const dateRange = db.prepare(`
  SELECT MIN(snapshot_date) as min_date, MAX(snapshot_date) as max_date
  FROM portfolio_snapshots
`).get();
logger.debug(`   Date range: ${dateRange.min_date} to ${dateRange.max_date}`);

db.close();
