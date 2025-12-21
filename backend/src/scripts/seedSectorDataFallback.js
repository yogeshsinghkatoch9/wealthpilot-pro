/**
 * Fallback seed script with sample sector data
 * Run with: node src/scripts/seedSectorDataFallback.js
 */

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const prisma = new PrismaClient();

const sectorData = [
  {
    sectorName: 'Technology',
    sectorCode: 'XLK',
    description: 'Information Technology',
    currentPrice: 180.25,
    change: 2.35,
    changePercent: 1.32,
    volume: 12500000,
    marketCap: 45000000000,
    peRatio: 28.5,
    dividendYield: 1.2,
    week52High: 195.50,
    week52Low: 145.20,
    ytdReturn: 18.5,
    oneMonthReturn: 3.2,
    threeMonthReturn: 8.7,
    oneYearReturn: 22.4,
    volatility: 18.2,
    beta: 1.15,
    sharpeRatio: 1.42
  },
  {
    sectorName: 'Healthcare',
    sectorCode: 'XLV',
    description: 'Healthcare',
    currentPrice: 142.80,
    change: -0.85,
    changePercent: -0.59,
    volume: 8900000,
    marketCap: 38000000000,
    peRatio: 21.3,
    dividendYield: 1.8,
    week52High: 155.30,
    week52Low: 135.10,
    ytdReturn: 5.2,
    oneMonthReturn: -1.5,
    threeMonthReturn: 2.1,
    oneYearReturn: 8.9,
    volatility: 12.5,
    beta: 0.85,
    sharpeRatio: 0.98
  },
  {
    sectorName: 'Financials',
    sectorCode: 'XLF',
    description: 'Financial Services',
    currentPrice: 38.95,
    change: 0.45,
    changePercent: 1.17,
    volume: 15600000,
    marketCap: 42000000000,
    peRatio: 14.8,
    dividendYield: 2.3,
    week52High: 42.10,
    week52Low: 32.50,
    ytdReturn: 12.3,
    oneMonthReturn: 2.8,
    threeMonthReturn: 5.4,
    oneYearReturn: 15.7,
    volatility: 16.8,
    beta: 1.08,
    sharpeRatio: 1.15
  },
  {
    sectorName: 'Energy',
    sectorCode: 'XLE',
    description: 'Energy',
    currentPrice: 85.60,
    change: 1.82,
    changePercent: 2.17,
    volume: 11200000,
    marketCap: 28000000000,
    peRatio: 12.5,
    dividendYield: 3.2,
    week52High: 95.20,
    week52Low: 68.40,
    ytdReturn: 8.9,
    oneMonthReturn: 4.5,
    threeMonthReturn: 6.8,
    oneYearReturn: 12.3,
    volatility: 24.5,
    beta: 1.35,
    sharpeRatio: 0.82
  },
  {
    sectorName: 'Consumer Discretionary',
    sectorCode: 'XLY',
    description: 'Consumer Cyclical',
    currentPrice: 165.40,
    change: -1.25,
    changePercent: -0.75,
    volume: 9800000,
    marketCap: 35000000000,
    peRatio: 24.7,
    dividendYield: 0.9,
    week52High: 178.90,
    week52Low: 145.20,
    ytdReturn: 14.2,
    oneMonthReturn: 1.8,
    threeMonthReturn: 4.5,
    oneYearReturn: 18.6,
    volatility: 19.3,
    beta: 1.12,
    sharpeRatio: 1.28
  },
  {
    sectorName: 'Consumer Staples',
    sectorCode: 'XLP',
    description: 'Consumer Defensive',
    currentPrice: 75.30,
    change: 0.15,
    changePercent: 0.20,
    volume: 7400000,
    marketCap: 32000000000,
    peRatio: 19.2,
    dividendYield: 2.5,
    week52High: 78.50,
    week52Low: 70.10,
    ytdReturn: 3.8,
    oneMonthReturn: 0.5,
    threeMonthReturn: 1.2,
    oneYearReturn: 5.4,
    volatility: 10.8,
    beta: 0.65,
    sharpeRatio: 0.75
  },
  {
    sectorName: 'Industrials',
    sectorCode: 'XLI',
    description: 'Industrials',
    currentPrice: 112.85,
    change: 0.95,
    changePercent: 0.85,
    volume: 10500000,
    marketCap: 36000000000,
    peRatio: 18.5,
    dividendYield: 1.7,
    week52High: 120.40,
    week52Low: 98.30,
    ytdReturn: 10.5,
    oneMonthReturn: 2.3,
    threeMonthReturn: 4.8,
    oneYearReturn: 13.2,
    volatility: 15.2,
    beta: 1.02,
    sharpeRatio: 1.05
  },
  {
    sectorName: 'Materials',
    sectorCode: 'XLB',
    description: 'Basic Materials',
    currentPrice: 82.70,
    change: -0.40,
    changePercent: -0.48,
    volume: 6800000,
    marketCap: 24000000000,
    peRatio: 16.3,
    dividendYield: 2.1,
    week52High: 89.50,
    week52Low: 74.20,
    ytdReturn: 6.4,
    oneMonthReturn: 1.2,
    threeMonthReturn: 2.8,
    oneYearReturn: 9.1,
    volatility: 17.5,
    beta: 1.18,
    sharpeRatio: 0.88
  },
  {
    sectorName: 'Real Estate',
    sectorCode: 'XLRE',
    description: 'Real Estate',
    currentPrice: 41.25,
    change: 0.30,
    changePercent: 0.73,
    volume: 5200000,
    marketCap: 18000000000,
    peRatio: 22.8,
    dividendYield: 3.8,
    week52High: 45.60,
    week52Low: 37.90,
    ytdReturn: 2.5,
    oneMonthReturn: 0.8,
    threeMonthReturn: 1.5,
    oneYearReturn: 4.2,
    volatility: 14.3,
    beta: 0.92,
    sharpeRatio: 0.65
  },
  {
    sectorName: 'Utilities',
    sectorCode: 'XLU',
    description: 'Utilities',
    currentPrice: 68.50,
    change: -0.25,
    changePercent: -0.36,
    volume: 8100000,
    marketCap: 30000000000,
    peRatio: 17.5,
    dividendYield: 3.1,
    week52High: 72.30,
    week52Low: 64.80,
    ytdReturn: 4.1,
    oneMonthReturn: 0.3,
    threeMonthReturn: 1.8,
    oneYearReturn: 6.5,
    volatility: 11.2,
    beta: 0.58,
    sharpeRatio: 0.82
  },
  {
    sectorName: 'Communication Services',
    sectorCode: 'XLC',
    description: 'Communication Services',
    currentPrice: 73.40,
    change: 1.15,
    changePercent: 1.59,
    volume: 9400000,
    marketCap: 26000000000,
    peRatio: 20.1,
    dividendYield: 1.5,
    week52High: 78.90,
    week52Low: 65.20,
    ytdReturn: 11.8,
    oneMonthReturn: 3.5,
    threeMonthReturn: 6.2,
    oneYearReturn: 14.7,
    volatility: 16.5,
    beta: 1.05,
    sharpeRatio: 1.18
  }
];

async function seedFallbackData() {
  logger.debug('🌱 Seeding fallback sector data...\n');

  try {
    // Clear existing data
    await prisma.sectorData.deleteMany({});
    logger.debug('🗑️  Cleared existing sector data');

    // Insert new data
    for (const sector of sectorData) {
      await prisma.sectorData.create({
        data: {
          id: uuidv4(),
          ...sector,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      logger.debug(`✅ Created: ${sector.sectorName} (${sector.sectorCode})`);
    }

    logger.debug(`\n🎉 Successfully seeded ${sectorData.length} sectors!`);
    logger.debug('📍 Visit http://localhost:3000/sector-analysis to view the data\n');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedFallbackData();
