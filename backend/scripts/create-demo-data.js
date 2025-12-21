#!/usr/bin/env node

/**
 * WealthPilot Pro - Demo Data Generator
 * Creates sample portfolios with realistic data for testing and demonstrations
 */

const dbAdapter = require('../src/db/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Get the actual database instance
const db = dbAdapter.db;

// Demo portfolios configuration
const DEMO_PORTFOLIOS = [
  {
    name: 'Growth Portfolio',
    description: 'Aggressive growth strategy focused on tech and innovation',
    type: 'Growth',
    holdings: [
      { symbol: 'AAPL', quantity: 150, cost_basis: 145.50 },
      { symbol: 'MSFT', quantity: 100, cost_basis: 310.25 },
      { symbol: 'GOOGL', quantity: 75, cost_basis: 125.80 },
      { symbol: 'AMZN', quantity: 50, cost_basis: 145.60 },
      { symbol: 'NVDA', quantity: 200, cost_basis: 420.30 },
      { symbol: 'TSLA', quantity: 80, cost_basis: 245.90 },
      { symbol: 'META', quantity: 120, cost_basis: 285.40 },
      { symbol: 'NFLX', quantity: 60, cost_basis: 445.70 }
    ]
  },
  {
    name: 'Dividend Income Portfolio',
    description: 'Conservative strategy focused on dividend-paying blue chips',
    type: 'Income',
    holdings: [
      { symbol: 'JNJ', quantity: 200, cost_basis: 152.30 },
      { symbol: 'PG', quantity: 180, cost_basis: 138.50 },
      { symbol: 'KO', quantity: 300, cost_basis: 58.75 },
      { symbol: 'PEP', quantity: 150, cost_basis: 165.90 },
      { symbol: 'VZ', quantity: 250, cost_basis: 42.80 },
      { symbol: 'T', quantity: 400, cost_basis: 19.45 },
      { symbol: 'MMM', quantity: 100, cost_basis: 125.60 },
      { symbol: 'XOM', quantity: 220, cost_basis: 98.30 }
    ]
  },
  {
    name: 'Balanced 60/40 Portfolio',
    description: 'Classic balanced allocation with stocks and bonds',
    type: 'Balanced',
    holdings: [
      { symbol: 'SPY', quantity: 150, cost_basis: 415.50 },
      { symbol: 'QQQ', quantity: 100, cost_basis: 365.75 },
      { symbol: 'VTI', quantity: 120, cost_basis: 210.30 },
      { symbol: 'IWM', quantity: 80, cost_basis: 190.45 },
      { symbol: 'AGG', quantity: 200, cost_basis: 102.80 },
      { symbol: 'BND', quantity: 180, cost_basis: 75.60 },
      { symbol: 'TLT', quantity: 100, cost_basis: 98.90 },
      { symbol: 'GLD', quantity: 50, cost_basis: 185.40 }
    ]
  },
  {
    name: 'Sector Rotation Strategy',
    description: 'Tactical allocation across market sectors',
    type: 'Tactical',
    holdings: [
      { symbol: 'XLK', quantity: 100, cost_basis: 165.30 },
      { symbol: 'XLF', quantity: 150, cost_basis: 38.50 },
      { symbol: 'XLV', quantity: 120, cost_basis: 128.75 },
      { symbol: 'XLE', quantity: 90, cost_basis: 82.40 },
      { symbol: 'XLI', quantity: 110, cost_basis: 105.60 },
      { symbol: 'XLP', quantity: 80, cost_basis: 72.90 },
      { symbol: 'XLY', quantity: 95, cost_basis: 158.20 },
      { symbol: 'XLRE', quantity: 130, cost_basis: 42.30 }
    ]
  },
  {
    name: 'International Diversification',
    description: 'Global exposure with emerging markets',
    type: 'International',
    holdings: [
      { symbol: 'VEU', quantity: 200, cost_basis: 52.30 },
      { symbol: 'EFA', quantity: 180, cost_basis: 68.50 },
      { symbol: 'VWO', quantity: 250, cost_basis: 41.75 },
      { symbol: 'EEM', quantity: 150, cost_basis: 39.90 },
      { symbol: 'IEMG', quantity: 220, cost_basis: 50.60 },
      { symbol: 'FXI', quantity: 100, cost_basis: 28.30 },
      { symbol: 'EWJ', quantity: 130, cost_basis: 54.80 },
      { symbol: 'EWG', quantity: 110, cost_basis: 29.45 }
    ]
  }
];

// Demo transactions for variety
const DEMO_TRANSACTIONS = [
  { days_ago: 30, type: 'buy' },
  { days_ago: 60, type: 'buy' },
  { days_ago: 90, type: 'buy' },
  { days_ago: 15, type: 'sell' },
  { days_ago: 45, type: 'dividend' }
];

/**
 * Create demo user
 */
async function createDemoUser() {
  console.log('Creating demo user...');

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash('demo123', 10);

  try {
    const stmt = db.prepare(`
      INSERT INTO users (id, email, first_name, last_name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      userId,
      'demo@wealthpilot.com',
      'Demo',
      'User',
      hashedPassword
    );

    console.log('✓ Demo user created: demo@wealthpilot.com / demo123');
    return userId;
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      // User already exists, get their ID
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@wealthpilot.com');
      console.log('✓ Demo user already exists');
      return existing.id;
    }
    throw error;
  }
}

/**
 * Create sample portfolio
 */
function createPortfolio(userId, portfolioConfig) {
  console.log(`Creating portfolio: ${portfolioConfig.name}...`);

  const portfolioId = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO portfolios (id, user_id, name, description, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    portfolioId,
    userId,
    portfolioConfig.name,
    portfolioConfig.description
  );

  console.log(`✓ Portfolio created: ${portfolioConfig.name}`);
  return portfolioId;
}

/**
 * Add holdings to portfolio
 */
function addHoldings(portfolioId, holdings) {
  console.log(`Adding ${holdings.length} holdings...`);

  const stmt = db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, shares, avg_cost_basis, asset_type, created_at)
    VALUES (?, ?, ?, ?, ?, 'stock', datetime('now', ?))
  `);

  for (const holding of holdings) {
    const holdingId = uuidv4();
    const daysAgo = -Math.floor(Math.random() * 365); // Random date in past year

    stmt.run(
      holdingId,
      portfolioId,
      holding.symbol,
      holding.quantity,
      holding.cost_basis,
      `${daysAgo} days`
    );
  }

  console.log(`✓ Added ${holdings.length} holdings`);
}

/**
 * Create sample transactions
 */
function createTransactions(portfolioId, userId) {
  console.log('Creating sample transactions...');

  const holdings = db.prepare(`
    SELECT id, symbol, shares, avg_cost_basis
    FROM holdings
    WHERE portfolio_id = ?
    LIMIT 5
  `).all(portfolioId);

  if (holdings.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO transactions (id, portfolio_id, user_id, type, symbol, shares, price, amount, fees, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  for (let i = 0; i < Math.min(5, holdings.length); i++) {
    const holding = holdings[i];
    const daysAgo = -Math.floor(Math.random() * 180);

    const transactionTypes = ['buy', 'sell'];
    const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];

    let shares, price, amount, fees;

    switch (type) {
      case 'buy':
        shares = Math.floor(holding.shares * (0.3 + Math.random() * 0.4));
        price = holding.avg_cost_basis * (0.9 + Math.random() * 0.2);
        amount = shares * price;
        fees = amount * 0.001; // 0.1% fee
        break;
      case 'sell':
        shares = -Math.floor(holding.shares * (0.1 + Math.random() * 0.2));
        price = holding.avg_cost_basis * (1.0 + Math.random() * 0.3);
        amount = Math.abs(shares) * price;
        fees = amount * 0.001;
        break;
    }

    stmt.run(
      uuidv4(),
      portfolioId,
      userId,
      type,
      holding.symbol,
      shares,
      price,
      amount,
      fees,
      `${daysAgo} days`
    );
  }

  console.log('✓ Sample transactions created');
}

/**
 * Create portfolio snapshot
 */
function createSnapshot(portfolioId) {
  console.log('Creating portfolio snapshot...');

  const holdings = db.prepare(`
    SELECT symbol, shares, avg_cost_basis
    FROM holdings
    WHERE portfolio_id = ?
  `).all(portfolioId);

  if (holdings.length === 0) {
    console.log('⚠ No holdings to snapshot');
    return;
  }

  const totalCost = holdings.reduce((sum, h) => sum + (h.shares * h.avg_cost_basis), 0);
  const totalValue = holdings.reduce((sum, h) => sum + (h.shares * h.avg_cost_basis * (1.0 + (Math.random() * 0.4 - 0.1))), 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const holdingsSnapshot = holdings.map(h => ({
    symbol: h.symbol,
    shares: h.shares,
    cost: h.avg_cost_basis,
    value: h.shares * h.avg_cost_basis * (1.0 + (Math.random() * 0.4 - 0.1))
  }));

  const stmt = db.prepare(`
    INSERT INTO portfolio_snapshots_history
    (portfolio_id, snapshot_date, total_value, total_cost, total_gain, total_gain_pct, holdings_count, holdings_snapshot)
    VALUES (?, date('now'), ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      portfolioId,
      totalValue,
      totalCost,
      totalGain,
      totalGainPct,
      holdings.length,
      JSON.stringify(holdingsSnapshot)
    );
    console.log('✓ Snapshot created');
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      console.log('⚠ Snapshot for today already exists');
    } else {
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n========================================');
  console.log('  WealthPilot Pro - Demo Data Generator');
  console.log('========================================\n');

  try {
    // Create demo user
    const userId = await createDemoUser();

    console.log('\nCreating demo portfolios...\n');

    // Create each demo portfolio
    for (const portfolioConfig of DEMO_PORTFOLIOS) {
      const portfolioId = createPortfolio(userId, portfolioConfig);
      addHoldings(portfolioId, portfolioConfig.holdings);
      createTransactions(portfolioId, userId);
      createSnapshot(portfolioId);
      console.log('');
    }

    console.log('========================================');
    console.log('✅ Demo data created successfully!');
    console.log('========================================\n');
    console.log('Login credentials:');
    console.log('  Email: demo@wealthpilot.com');
    console.log('  Password: demo123\n');
    console.log(`Portfolios created: ${DEMO_PORTFOLIOS.length}`);
    console.log('');
    console.log('You can now:');
    console.log('  1. Login with the demo credentials');
    console.log('  2. View the sample portfolios');
    console.log('  3. Generate reports');
    console.log('  4. Test all analytics');
    console.log('  5. Create PDF exports');
    console.log('  6. Send email reports');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating demo data:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { createDemoUser, createPortfolio, addHoldings };
