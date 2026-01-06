const { prisma } = require('../db/simpleDb');
const MarketDataService = require('./marketData');
const logger = require('../utils/logger');


/**
 * Snapshot Service
 * Takes daily portfolio snapshots for historical tracking
 */
class SnapshotService {
  
  /**
   * Take snapshots for all portfolios
   */
  static async takeAllSnapshots() {
    logger.info('Starting portfolio snapshots');
    
    const portfolios = await prisma.portfolios.findMany({
      include: { holdings: true }
    });

    let success = 0;
    let failed = 0;

    for (const portfolio of portfolios) {
      try {
        await this.takeSnapshot(portfolio);
        success++;
      } catch (err) {
        logger.error(`Snapshot failed for portfolio ${portfolio.id}:`, err);
        failed++;
      }
    }

    logger.info(`Snapshots complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Take snapshot for single portfolio
   */
  static async takeSnapshot(portfolio) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if snapshot already exists for today
    const existing = await prisma.portfolioSnapshot.findFirst({
      where: {
        portfolio_id: portfolio.id,
        snapshotDate: today
      }
    });

    if (existing) {
      logger.debug(`Snapshot already exists for portfolio ${portfolio.id}`);
      return existing;
    }

    // Calculate current values
    const holdings = portfolio.holdings || [];
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalValue = Number(portfolio.cashBalance);
    let totalCost = 0;
    let dayGain = 0;
    const holdingsSnapshot = [];

    for (const h of holdings) {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const costBasis = Number(h.avgCostBasis);
      const price = Number(quote.price) || costBasis;
      const prevClose = Number(quote.previousClose) || price;

      const marketValue = shares * price;
      const cost = shares * costBasis;

      totalValue += marketValue;
      totalCost += cost;
      dayGain += shares * (price - prevClose);

      holdingsSnapshot.push({
        symbol: h.symbol,
        shares,
        price,
        marketValue,
        costBasis,
        gain: marketValue - cost,
        gainPct: ((price - costBasis) / costBasis) * 100
      });
    }

    const totalGain = totalValue - totalCost - Number(portfolio.cashBalance);
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const dayGainPct = (totalValue - dayGain) > 0 
      ? (dayGain / (totalValue - dayGain)) * 100 
      : 0;

    // Create snapshot
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        portfolio_id: portfolio.id,
        totalValue,
        cashBalance: portfolio.cashBalance,
        dayGain,
        dayGainPct,
        totalGain,
        totalGainPct,
        holdings: holdingsSnapshot,
        snapshotDate: today
      }
    });

    logger.debug(`Snapshot created for portfolio ${portfolio.id}: $${totalValue.toFixed(2)}`);
    return snapshot;
  }

  /**
   * Get historical snapshots for a portfolio
   */
  static async getSnapshots(portfolioId, days = 365) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.portfolioSnapshot.findMany({
      where: {
        portfolioId,
        snapshotDate: { gte: startDate }
      },
      orderBy: { snapshotDate: 'asc' }
    });
  }

  /**
   * Calculate performance between two dates
   */
  static async calculatePeriodPerformance(portfolioId, startDate, endDate) {
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        portfolioId,
        snapshotDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      orderBy: { snapshotDate: 'asc' }
    });

    if (snapshots.length < 2) {
      return null;
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const startValue = Number(first.totalValue);
    const endValue = Number(last.totalValue);

    return {
      startDate: first.snapshotDate,
      endDate: last.snapshotDate,
      startValue,
      endValue,
      absoluteReturn: endValue - startValue,
      percentReturn: startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0,
      dataPoints: snapshots.length
    };
  }

  /**
   * Clean up old snapshots (keep last 5 years)
   */
  static async cleanupOldSnapshots() {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);

    const result = await prisma.portfolioSnapshot.deleteMany({
      where: {
        snapshotDate: { lt: cutoffDate }
      }
    });

    logger.info(`Cleaned up ${result.count} old snapshots`);
    return result.count;
  }
}

module.exports = SnapshotService;
