const { prisma } = require('./src/db/simpleDb');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123456', 12);
  
  const user = await prisma.user.upsert({
    where: { email: 'demo@wealthpilot.com' },
    update: {},
    create: {
      email: 'demo@wealthpilot.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'User',
      plan: 'pro',
      isVerified: true,
      isActive: true
    }
  });

  console.log('✅ Created user:', user.email);

  // Create Growth Portfolio
  const growthPortfolio = await prisma.portfolio.upsert({
    where: { userId_name: { userId: user.id, name: 'Growth Portfolio' } },
    update: {},
    create: {
      userId: user.id,
      name: 'Growth Portfolio',
      description: 'Long-term growth focused portfolio',
      isDefault: true,
      cashBalance: 15420.50,
      benchmark: 'SPY'
    }
  });

  console.log('✅ Created portfolio:', growthPortfolio.name);

  // Create holdings
  const holdings = [
    { symbol: 'AAPL', shares: 100, avgCostBasis: 145.50, sector: 'Technology' },
    { symbol: 'MSFT', shares: 50, avgCostBasis: 320.00, sector: 'Technology' },
    { symbol: 'NVDA', shares: 75, avgCostBasis: 95.00, sector: 'Technology' },
    { symbol: 'GOOGL', shares: 40, avgCostBasis: 138.00, sector: 'Technology' },
    { symbol: 'META', shares: 30, avgCostBasis: 285.00, sector: 'Technology' },
    { symbol: 'AMZN', shares: 45, avgCostBasis: 145.00, sector: 'Consumer Cyclical' },
    { symbol: 'TSLA', shares: 25, avgCostBasis: 195.00, sector: 'Consumer Cyclical' }
  ];

  for (const h of holdings) {
    await prisma.holding.upsert({
      where: { portfolioId_symbol: { portfolioId: growthPortfolio.id, symbol: h.symbol } },
      update: {},
      create: {
        portfolioId: growthPortfolio.id,
        ...h
      }
    });
  }

  console.log('✅ Created', holdings.length, 'holdings');

  // Create watchlist
  const watchlist = await prisma.watchlist.upsert({
    where: { userId_name: { userId: user.id, name: 'Tech Watchlist' } },
    update: {},
    create: {
      userId: user.id,
      name: 'Tech Watchlist',
      description: 'Potential tech investments'
    }
  });

  for (const symbol of ['AMD', 'CRM', 'SNOW', 'PLTR', 'NET']) {
    await prisma.watchlistItem.upsert({
      where: { watchlistId_symbol: { watchlistId: watchlist.id, symbol } },
      update: {},
      create: { watchlistId: watchlist.id, symbol }
    });
  }

  console.log('✅ Created watchlist');

  // Seed stock quotes
  const quotes = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 189.65, previousClose: 188.42, sector: 'Technology', dividendYield: 0.51 },
    { symbol: 'MSFT', name: 'Microsoft Corp', price: 428.42, previousClose: 425.18, sector: 'Technology', dividendYield: 0.70 },
    { symbol: 'NVDA', name: 'NVIDIA Corp', price: 142.84, previousClose: 140.12, sector: 'Technology', dividendYield: 0.02 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.82, previousClose: 173.24, sector: 'Technology', dividendYield: 0.50 },
    { symbol: 'META', name: 'Meta Platforms', price: 584.24, previousClose: 578.42, sector: 'Technology', dividendYield: 0.36 },
    { symbol: 'AMZN', name: 'Amazon.com', price: 218.64, previousClose: 216.42, sector: 'Consumer Cyclical', dividendYield: 0 },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, previousClose: 252.18, sector: 'Consumer Cyclical', dividendYield: 0 },
    { symbol: 'AMD', name: 'AMD', price: 142.50, previousClose: 140.10, sector: 'Technology', dividendYield: 0 },
    { symbol: 'CRM', name: 'Salesforce', price: 284.20, previousClose: 286.00, sector: 'Technology', dividendYield: 0 },
    { symbol: 'SPY', name: 'SPDR S&P 500', price: 584.82, previousClose: 582.24, sector: 'ETF', dividendYield: 1.24 }
  ];

  for (const q of quotes) {
    await prisma.stockQuote.upsert({
      where: { symbol: q.symbol },
      update: { price: q.price, previousClose: q.previousClose },
      create: {
        ...q,
        change: q.price - q.previousClose,
        changePercent: ((q.price - q.previousClose) / q.previousClose) * 100,
        exchange: 'NASDAQ'
      }
    });
  }

  console.log('✅ Seeded stock quotes');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📧 Demo login:');
  console.log('   Email: demo@wealthpilot.com');
  console.log('   Password: demo123456');
}

seed().catch(console.error);
