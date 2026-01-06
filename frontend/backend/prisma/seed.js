const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

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
      settings: {
        create: {
          emailNotifications: true,
          dividendAlerts: true,
          earningsAlerts: true,
          priceAlerts: true,
          weeklyReport: true
        }
      }
    }
  });

  console.log(`✅ Created user: ${user.email}`);

  // Create main portfolio with holdings
  const portfolio = await prisma.portfolio.upsert({
    where: {
      userId_name: { userId: user.id, name: 'Growth Portfolio' }
    },
    update: {},
    create: {
      userId: user.id,
      name: 'Growth Portfolio',
      description: 'Long-term growth focused investments',
      isDefault: true,
      cashBalance: 15420.50,
      benchmark: 'SPY'
    }
  });

  console.log(`✅ Created portfolio: ${portfolio.name}`);

  // Sample holdings with tax lots
  const holdings = [
    { symbol: 'AAPL', shares: 150, avgCost: 142.50, sector: 'Technology', lots: [
      { shares: 100, cost: 135.00, date: '2022-03-15' },
      { shares: 50, cost: 157.50, date: '2023-09-22' }
    ]},
    { symbol: 'MSFT', shares: 75, avgCost: 285.40, sector: 'Technology', lots: [
      { shares: 50, cost: 265.00, date: '2021-11-10' },
      { shares: 25, cost: 326.20, date: '2024-02-14' }
    ]},
    { symbol: 'GOOGL', shares: 80, avgCost: 125.80, sector: 'Technology', lots: [
      { shares: 80, cost: 125.80, date: '2023-06-05' }
    ]},
    { symbol: 'NVDA', shares: 40, avgCost: 45.20, sector: 'Technology', lots: [
      { shares: 20, cost: 28.50, date: '2022-01-20' },
      { shares: 20, cost: 61.90, date: '2023-04-18' }
    ]},
    { symbol: 'META', shares: 35, avgCost: 185.60, sector: 'Technology', lots: [
      { shares: 35, cost: 185.60, date: '2023-01-30' }
    ]},
    { symbol: 'AMZN', shares: 60, avgCost: 128.40, sector: 'Consumer Cyclical', lots: [
      { shares: 40, cost: 115.20, date: '2022-08-12' },
      { shares: 20, cost: 154.80, date: '2024-01-08' }
    ]},
    { symbol: 'TSLA', shares: 25, avgCost: 218.50, sector: 'Consumer Cyclical', lots: [
      { shares: 25, cost: 218.50, date: '2023-11-15' }
    ]},
    { symbol: 'JPM', shares: 45, avgCost: 142.80, sector: 'Financial Services', lots: [
      { shares: 45, cost: 142.80, date: '2022-05-20' }
    ]},
    { symbol: 'V', shares: 30, avgCost: 215.40, sector: 'Financial Services', lots: [
      { shares: 30, cost: 215.40, date: '2023-03-10' }
    ]},
    { symbol: 'JNJ', shares: 40, avgCost: 162.30, sector: 'Healthcare', lots: [
      { shares: 40, cost: 162.30, date: '2021-09-08' }
    ]},
    { symbol: 'UNH', shares: 15, avgCost: 485.20, sector: 'Healthcare', lots: [
      { shares: 15, cost: 485.20, date: '2023-07-22' }
    ]},
    { symbol: 'VZ', shares: 100, avgCost: 38.40, sector: 'Communication Services', lots: [
      { shares: 100, cost: 38.40, date: '2022-10-05' }
    ]}
  ];

  for (const h of holdings) {
    const holding = await prisma.holding.upsert({
      where: {
        portfolioId_symbol: { portfolioId: portfolio.id, symbol: h.symbol }
      },
      update: {},
      create: {
        portfolioId: portfolio.id,
        symbol: h.symbol,
        shares: h.shares,
        avgCostBasis: h.avgCost,
        sector: h.sector
      }
    });

    // Create tax lots
    for (const lot of h.lots) {
      await prisma.taxLot.create({
        data: {
          holdingId: holding.id,
          shares: lot.shares,
          costBasis: lot.cost,
          purchaseDate: new Date(lot.date)
        }
      });
    }

    console.log(`  📈 Added ${h.symbol}: ${h.shares} shares @ $${h.avgCost}`);
  }

  // Create dividend portfolio
  const divPortfolio = await prisma.portfolio.upsert({
    where: {
      userId_name: { userId: user.id, name: 'Dividend Income' }
    },
    update: {},
    create: {
      userId: user.id,
      name: 'Dividend Income',
      description: 'High-yield dividend stocks',
      cashBalance: 5280.25,
      benchmark: 'VYM'
    }
  });

  const divHoldings = [
    { symbol: 'VZ', shares: 200, avgCost: 42.50, sector: 'Communication Services' },
    { symbol: 'T', shares: 300, avgCost: 18.20, sector: 'Communication Services' },
    { symbol: 'KO', shares: 100, avgCost: 58.40, sector: 'Consumer Defensive' },
    { symbol: 'PEP', shares: 50, avgCost: 172.30, sector: 'Consumer Defensive' },
    { symbol: 'O', shares: 75, avgCost: 62.80, sector: 'Real Estate' }
  ];

  for (const h of divHoldings) {
    const holding = await prisma.holding.upsert({
      where: {
        portfolioId_symbol: { portfolioId: divPortfolio.id, symbol: h.symbol }
      },
      update: {},
      create: {
        portfolioId: divPortfolio.id,
        symbol: h.symbol,
        shares: h.shares,
        avgCostBasis: h.avgCost,
        sector: h.sector
      }
    });

    await prisma.taxLot.create({
      data: {
        holdingId: holding.id,
        shares: h.shares,
        costBasis: h.avgCost,
        purchaseDate: new Date('2022-06-15')
      }
    });
  }

  console.log(`✅ Created dividend portfolio with ${divHoldings.length} holdings`);

  // Create sample transactions
  const transactions = [
    { symbol: 'AAPL', type: 'buy', shares: 100, price: 135.00, date: '2022-03-15' },
    { symbol: 'AAPL', type: 'buy', shares: 50, price: 157.50, date: '2023-09-22' },
    { symbol: 'AAPL', type: 'dividend', amount: 96.00, date: '2024-02-15' },
    { symbol: 'AAPL', type: 'dividend', amount: 96.00, date: '2024-05-16' },
    { symbol: 'AAPL', type: 'dividend', amount: 100.00, date: '2024-08-15' },
    { symbol: 'MSFT', type: 'buy', shares: 50, price: 265.00, date: '2021-11-10' },
    { symbol: 'MSFT', type: 'buy', shares: 25, price: 326.20, date: '2024-02-14' },
    { symbol: 'MSFT', type: 'dividend', amount: 56.25, date: '2024-03-14' },
    { symbol: 'MSFT', type: 'dividend', amount: 56.25, date: '2024-06-13' },
    { symbol: 'NVDA', type: 'buy', shares: 20, price: 28.50, date: '2022-01-20' },
    { symbol: 'NVDA', type: 'buy', shares: 20, price: 61.90, date: '2023-04-18' },
    { symbol: 'VZ', type: 'dividend', amount: 132.50, date: '2024-02-01' },
    { symbol: 'VZ', type: 'dividend', amount: 132.50, date: '2024-05-01' },
    { symbol: 'VZ', type: 'dividend', amount: 132.50, date: '2024-08-01' },
    { symbol: 'JNJ', type: 'dividend', amount: 48.00, date: '2024-03-05' },
    { symbol: 'JNJ', type: 'dividend', amount: 49.60, date: '2024-06-04' }
  ];

  for (const t of transactions) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        portfolioId: portfolio.id,
        symbol: t.symbol,
        type: t.type,
        shares: t.shares || null,
        price: t.price || null,
        amount: t.amount || (t.shares * t.price),
        executedAt: new Date(t.date)
      }
    });
  }

  console.log(`✅ Created ${transactions.length} transactions`);

  // Create watchlist
  const watchlist = await prisma.watchlist.upsert({
    where: {
      userId_name: { userId: user.id, name: 'Tech Watchlist' }
    },
    update: {},
    create: {
      userId: user.id,
      name: 'Tech Watchlist',
      description: 'Potential tech investments'
    }
  });

  const watchlistSymbols = ['AMD', 'CRM', 'ADBE', 'NFLX', 'PYPL', 'SQ', 'SHOP'];
  for (const symbol of watchlistSymbols) {
    await prisma.watchlistItem.upsert({
      where: {
        watchlistId_symbol: { watchlistId: watchlist.id, symbol }
      },
      update: {},
      create: {
        watchlistId: watchlist.id,
        symbol,
        notes: `Watching ${symbol} for entry point`
      }
    });
  }

  console.log(`✅ Created watchlist with ${watchlistSymbols.length} items`);

  // Create alerts
  const alerts = [
    { symbol: 'AAPL', type: 'price_below', condition: { price: 180 }, message: 'AAPL below $180' },
    { symbol: 'NVDA', type: 'price_above', condition: { price: 150 }, message: 'NVDA above $150' },
    { symbol: 'TSLA', type: 'pct_change', condition: { percent: -5 }, message: 'TSLA down 5%+' }
  ];

  for (const a of alerts) {
    await prisma.alert.create({
      data: {
        userId: user.id,
        symbol: a.symbol,
        type: a.type,
        condition: a.condition,
        message: a.message
      }
    });
  }

  console.log(`✅ Created ${alerts.length} alerts`);

  // Seed stock quotes cache
  const stockQuotes = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 189.65, previousClose: 188.42, sector: 'Technology', peRatio: 31.2, dividendYield: 0.51, marketCap: 2940000000000 },
    { symbol: 'MSFT', name: 'Microsoft Corp', price: 428.42, previousClose: 425.18, sector: 'Technology', peRatio: 36.8, dividendYield: 0.70, marketCap: 3180000000000 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.82, previousClose: 173.24, sector: 'Technology', peRatio: 25.4, dividendYield: 0, marketCap: 2120000000000 },
    { symbol: 'NVDA', name: 'NVIDIA Corp', price: 142.84, previousClose: 140.12, sector: 'Technology', peRatio: 65.2, dividendYield: 0.02, marketCap: 3520000000000 },
    { symbol: 'META', name: 'Meta Platforms', price: 584.24, previousClose: 578.42, sector: 'Technology', peRatio: 28.6, dividendYield: 0.34, marketCap: 1480000000000 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 218.64, previousClose: 216.42, sector: 'Consumer Cyclical', peRatio: 62.4, dividendYield: 0, marketCap: 2280000000000 },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, previousClose: 252.18, sector: 'Consumer Cyclical', peRatio: 72.8, dividendYield: 0, marketCap: 792000000000 },
    { symbol: 'JPM', name: 'JPMorgan Chase', price: 198.24, previousClose: 196.84, sector: 'Financial Services', peRatio: 11.8, dividendYield: 2.12, marketCap: 574000000000 },
    { symbol: 'V', name: 'Visa Inc.', price: 284.62, previousClose: 282.48, sector: 'Financial Services', peRatio: 29.4, dividendYield: 0.74, marketCap: 582000000000 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', price: 156.42, previousClose: 155.84, sector: 'Healthcare', peRatio: 15.2, dividendYield: 2.94, marketCap: 376000000000 },
    { symbol: 'UNH', name: 'UnitedHealth Group', price: 584.24, previousClose: 582.18, sector: 'Healthcare', peRatio: 21.6, dividendYield: 1.32, marketCap: 538000000000 },
    { symbol: 'VZ', name: 'Verizon', price: 42.84, previousClose: 42.62, sector: 'Communication Services', peRatio: 9.8, dividendYield: 6.82, marketCap: 180000000000 },
    { symbol: 'T', name: 'AT&T Inc.', price: 22.48, previousClose: 22.36, sector: 'Communication Services', peRatio: 11.2, dividendYield: 5.48, marketCap: 161000000000 },
    { symbol: 'KO', name: 'Coca-Cola Co', price: 62.84, previousClose: 62.48, sector: 'Consumer Defensive', peRatio: 24.2, dividendYield: 2.92, marketCap: 271000000000 },
    { symbol: 'PEP', name: 'PepsiCo Inc', price: 168.42, previousClose: 167.84, sector: 'Consumer Defensive', peRatio: 22.8, dividendYield: 2.84, marketCap: 231000000000 },
    { symbol: 'O', name: 'Realty Income Corp', price: 58.24, previousClose: 57.92, sector: 'Real Estate', peRatio: 42.6, dividendYield: 5.24, marketCap: 50400000000 },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', price: 584.82, previousClose: 582.24, sector: 'ETF', peRatio: 0, dividendYield: 1.24, marketCap: 0 },
    { symbol: 'INTC', name: 'Intel Corp', price: 24.18, previousClose: 24.86, sector: 'Technology', peRatio: 0, dividendYield: 2.08, marketCap: 102000000000 }
  ];

  for (const q of stockQuotes) {
    await prisma.stockQuote.upsert({
      where: { symbol: q.symbol },
      update: { price: q.price, previousClose: q.previousClose },
      create: {
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        previousClose: q.previousClose,
        open: q.price * 0.998,
        high: q.price * 1.012,
        low: q.price * 0.988,
        volume: Math.floor(Math.random() * 50000000),
        sector: q.sector,
        peRatio: q.peRatio,
        dividendYield: q.dividendYield,
        marketCap: q.marketCap,
        change: q.price - q.previousClose,
        changePercent: ((q.price - q.previousClose) / q.previousClose) * 100
      }
    });
  }

  console.log(`✅ Seeded ${stockQuotes.length} stock quotes`);

  // Create portfolio snapshots (last 30 days)
  let baseValue = 180000;
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dailyChange = (Math.random() - 0.48) * 3000;
    baseValue += dailyChange;
    const dayGain = (Math.random() - 0.45) * 2000;

    await prisma.portfolioSnapshot.upsert({
      where: {
        portfolioId_snapshotDate: { portfolioId: portfolio.id, snapshotDate: date }
      },
      update: {},
      create: {
        portfolioId: portfolio.id,
        totalValue: baseValue,
        cashBalance: 15420.50,
        dayGain: dayGain,
        dayGainPct: (dayGain / baseValue) * 100,
        totalGain: baseValue - 150000,
        totalGainPct: ((baseValue - 150000) / 150000) * 100,
        holdings: [],
        snapshotDate: date
      }
    });
  }

  console.log(`✅ Created portfolio snapshots`);

  console.log('\n🎉 Database seeding complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Demo Login Credentials:');
  console.log('  Email: demo@wealthpilot.com');
  console.log('  Password: demo123456');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
