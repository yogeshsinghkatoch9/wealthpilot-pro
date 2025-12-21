const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const logger = require('../../utils/logger');
const prisma = new PrismaClient();

// API Keys
const ALPHA_VANTAGE_KEY = '1S2UQSH44L0953E5';
const FMP_KEY = 'nKxGNnbkLs6VUjVsbeKTlQF4UPKyvPbG';
const POLYGON_KEY = 'fJ_RyjvXyIH6aeVHdqvxbpi0op6fFK9b';

// Standard sector mappings
const SECTORS = {
  'XLK': { name: 'Technology', description: 'Information Technology' },
  'XLV': { name: 'Healthcare', description: 'Healthcare' },
  'XLF': { name: 'Financials', description: 'Financial Services' },
  'XLE': { name: 'Energy', description: 'Energy' },
  'XLY': { name: 'Consumer Discretionary', description: 'Consumer Cyclical' },
  'XLP': { name: 'Consumer Staples', description: 'Consumer Defensive' },
  'XLI': { name: 'Industrials', description: 'Industrials' },
  'XLB': { name: 'Materials', description: 'Basic Materials' },
  'XLRE': { name: 'Real Estate', description: 'Real Estate' },
  'XLU': { name: 'Utilities', description: 'Utilities' },
  'XLC': { name: 'Communication Services', description: 'Communication Services' }
};

/**
 * Fetch sector performance from Alpha Vantage
 */
async function fetchAlphaVantageSectorPerformance() {
  try {
    const url = `https://www.alphavantage.co/query?function=SECTOR&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await axios.get(url);

    if (response.data['Note']) {
      logger.warn('Alpha Vantage API limit reached');
      return null;
    }

    const data = response.data;
    const sectors = [];

    // Parse real-time performance
    if (data['Rank A: Real-Time Performance']) {
      const realtimeData = data['Rank A: Real-Time Performance'];

      for (const [sectorName, changePercent] of Object.entries(realtimeData)) {
        sectors.push({
          sectorName: sectorName.trim(),
          changePercent: parseFloat(changePercent.replace('%', '')),
          source: 'alphavantage',
          timestamp: new Date()
        });
      }
    }

    return sectors;
  } catch (error) {
    logger.error('Error fetching Alpha Vantage sector performance:', error.message);
    return null;
  }
}

/**
 * Fetch sector data from Financial Modeling Prep
 */
async function fetchFMPSectorData(sectorETF) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${sectorETF}?apikey=${FMP_KEY}`;
    const response = await axios.get(url);

    if (response.data && response.data.length > 0) {
      const quote = response.data[0];
      return {
        sectorCode: sectorETF,
        sectorName: SECTORS[sectorETF]?.name || sectorETF,
        currentPrice: quote.price,
        change: quote.change,
        changePercent: quote.changesPercentage,
        volume: quote.volume,
        marketCap: quote.marketCap,
        peRatio: quote.pe,
        dividendYield: quote.yield,
        week52High: quote.yearHigh,
        week52Low: quote.yearLow,
        updatedAt: new Date()
      };
    }

    return null;
  } catch (error) {
    logger.error(`Error fetching FMP data for ${sectorETF}:`, error.message);
    return null;
  }
}

/**
 * Fetch historical sector data from Polygon.io
 */
async function fetchPolygonSectorHistory(sectorETF, from, to) {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${sectorETF}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
    const response = await axios.get(url);

    if (response.data && response.data.results) {
      return response.data.results.map(bar => ({
        sectorCode: sectorETF,
        sectorName: SECTORS[sectorETF]?.name || sectorETF,
        date: new Date(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        returnPct: ((bar.c - bar.o) / bar.o) * 100
      }));
    }

    return [];
  } catch (error) {
    logger.error(`Error fetching Polygon history for ${sectorETF}:`, error.message);
    return [];
  }
}

/**
 * Update all sector data in database
 */
async function updateAllSectorData() {
  try {
    const updates = [];

    // Fetch data for each sector ETF
    for (const [sectorCode, info] of Object.entries(SECTORS)) {
      const fmpData = await fetchFMPSectorData(sectorCode);

      if (fmpData) {
        // Upsert sector data
        const existing = await prisma.sectorData.findUnique({
          where: { sectorCode }
        });

        if (existing) {
          await prisma.sectorData.update({
            where: { sectorCode },
            data: {
              ...fmpData,
              description: info.description,
              updatedAt: new Date()
            }
          });
        } else {
          await prisma.sectorData.create({
            data: {
              id: uuidv4(),
              ...fmpData,
              description: info.description,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
        }

        updates.push(sectorCode);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    return { success: true, updated: updates };
  } catch (error) {
    logger.error('Error updating sector data:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch and store historical sector performance
 */
async function updateSectorPerformanceHistory(days = 90) {
  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const updates = [];

    for (const sectorCode of Object.keys(SECTORS)) {
      const history = await fetchPolygonSectorHistory(sectorCode, from, to);

      for (const bar of history) {
        const dateKey = bar.date.toISOString().split('T')[0];

        // Upsert performance data
        await prisma.sectorPerformance.upsert({
          where: {
            sectorCode_date: {
              sectorCode: bar.sectorCode,
              date: new Date(dateKey)
            }
          },
          create: {
            id: uuidv4(),
            sectorCode: bar.sectorCode,
            sectorName: bar.sectorName,
            date: new Date(dateKey),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            returnPct: bar.returnPct,
            createdAt: new Date()
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            returnPct: bar.returnPct
          }
        });
      }

      updates.push(sectorCode);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 12000)); // Polygon free tier: 5 req/min
    }

    return { success: true, updated: updates };
  } catch (error) {
    logger.error('Error updating sector performance history:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate portfolio sector allocation
 */
async function calculatePortfolioSectorAllocation(portfolioId) {
  try {
    // Get all holdings with current prices
    const holdings = await prisma.holding.findMany({
      where: { portfolioId },
      include: {
        portfolio: true
      }
    });

    if (holdings.length === 0) {
      return { allocations: [], totalValue: 0 };
    }

    // Fetch current prices for all symbols
    const symbols = holdings.map(h => h.symbol);
    const quotes = await Promise.all(
      symbols.map(async symbol => {
        try {
          const quote = await prisma.stockQuote.findUnique({
            where: { symbol }
          });
          return { symbol, quote };
        } catch {
          return { symbol, quote: null };
        }
      })
    );

    const quoteMap = {};
    quotes.forEach(({ symbol, quote }) => {
      if (quote) quoteMap[symbol] = quote;
    });

    // Group holdings by sector
    const sectorMap = {};
    let totalPortfolioValue = 0;

    for (const holding of holdings) {
      const quote = quoteMap[holding.symbol];
      if (!quote) continue;

      const sector = quote.sector || 'Unknown';
      const currentPrice = quote.price || 0;
      const value = holding.shares * currentPrice;
      const costBasis = holding.shares * holding.avgCostBasis;
      const returnValue = value - costBasis;
      const returnPct = costBasis > 0 ? (returnValue / costBasis) * 100 : 0;

      totalPortfolioValue += value;

      if (!sectorMap[sector]) {
        sectorMap[sector] = {
          sectorName: sector,
          totalValue: 0,
          numHoldings: 0,
          totalCostBasis: 0,
          currentReturn: 0,
          holdings: []
        };
      }

      sectorMap[sector].totalValue += value;
      sectorMap[sector].numHoldings += 1;
      sectorMap[sector].totalCostBasis += costBasis;
      sectorMap[sector].currentReturn += returnValue;
      sectorMap[sector].holdings.push({
        symbol: holding.symbol,
        shares: holding.shares,
        value,
        returnPct
      });
    }

    // Calculate percentages and create allocation records
    const allocations = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [sectorName, data] of Object.entries(sectorMap)) {
      const percentAlloc = totalPortfolioValue > 0
        ? (data.totalValue / totalPortfolioValue) * 100
        : 0;

      const avgCostBasis = data.totalCostBasis / data.numHoldings;
      const returnPct = data.totalCostBasis > 0
        ? (data.currentReturn / data.totalCostBasis) * 100
        : 0;

      const allocation = {
        id: uuidv4(),
        portfolioId,
        sectorName,
        sectorCode: null,
        totalValue: data.totalValue,
        percentAlloc,
        numHoldings: data.numHoldings,
        avgCostBasis,
        currentReturn: data.currentReturn,
        returnPct,
        weight: percentAlloc / 100,
        date: today,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store in database
      await prisma.portfolioSectorAllocation.upsert({
        where: {
          portfolioId_sectorName_date: {
            portfolioId,
            sectorName,
            date: today
          }
        },
        create: allocation,
        update: {
          totalValue: allocation.totalValue,
          percentAlloc: allocation.percentAlloc,
          numHoldings: allocation.numHoldings,
          avgCostBasis: allocation.avgCostBasis,
          currentReturn: allocation.currentReturn,
          returnPct: allocation.returnPct,
          weight: allocation.weight,
          updatedAt: new Date()
        }
      });

      allocations.push({
        ...allocation,
        holdings: data.holdings
      });
    }

    return {
      allocations,
      totalValue: totalPortfolioValue,
      calculated: new Date()
    };
  } catch (error) {
    logger.error('Error calculating portfolio sector allocation:', error.message);
    throw error;
  }
}

/**
 * Get sector performance comparison
 */
async function getSectorPerformanceComparison(period = '1M') {
  try {
    let daysAgo;
    switch (period) {
      case '1D': daysAgo = 1; break;
      case '1W': daysAgo = 7; break;
      case '1M': daysAgo = 30; break;
      case '3M': daysAgo = 90; break;
      case '1Y': daysAgo = 365; break;
      default: daysAgo = 30;
    }

    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const sectors = await prisma.sectorData.findMany({
      orderBy: { changePercent: 'desc' }
    });

    const performance = await Promise.all(
      sectors.map(async sector => {
        const history = await prisma.sectorPerformance.findMany({
          where: {
            sectorCode: sector.sectorCode,
            date: { gte: startDate }
          },
          orderBy: { date: 'asc' }
        });

        let periodReturn = 0;
        if (history.length >= 2) {
          const firstPrice = history[0].close;
          const lastPrice = history[history.length - 1].close;
          periodReturn = ((lastPrice - firstPrice) / firstPrice) * 100;
        }

        return {
          sectorCode: sector.sectorCode,
          sectorName: sector.sectorName,
          currentPrice: sector.currentPrice,
          change: sector.change,
          changePercent: sector.changePercent,
          periodReturn,
          volume: sector.volume,
          marketCap: sector.marketCap
        };
      })
    );

    return performance.sort((a, b) => b.periodReturn - a.periodReturn);
  } catch (error) {
    logger.error('Error getting sector performance comparison:', error.message);
    throw error;
  }
}

/**
 * Get sector rotation analysis
 */
async function getSectorRotation(days = 30) {
  try {
    const rotations = await prisma.sectorRotation.findMany({
      where: {
        date: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { date: 'desc' }
    });

    return rotations;
  } catch (error) {
    logger.error('Error getting sector rotation:', error.message);
    throw error;
  }
}

/**
 * Get all available sectors
 */
async function getAllSectors() {
  try {
    return await prisma.sectorData.findMany({
      orderBy: { sectorName: 'asc' }
    });
  } catch (error) {
    logger.error('Error getting all sectors:', error.message);
    throw error;
  }
}

module.exports = {
  fetchAlphaVantageSectorPerformance,
  fetchFMPSectorData,
  fetchPolygonSectorHistory,
  updateAllSectorData,
  updateSectorPerformanceHistory,
  calculatePortfolioSectorAllocation,
  getSectorPerformanceComparison,
  getSectorRotation,
  getAllSectors,
  SECTORS
};
