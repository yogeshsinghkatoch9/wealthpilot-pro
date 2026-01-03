const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PeerBenchmarkingService {
  async compareToPeers(portfolioId) {
    const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!portfolio) return { percentileRank: 0, peerComparison: [] };

    const allPortfolios = await prisma.portfolio.findMany({
      where: { userId: portfolio.userId },
      include: { snapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } }
    });

    const returns = allPortfolios.map(p => ({
      name: p.name,
      return: p.snapshots[0]?.totalGainPct || 0
    })).sort((a, b) => b.return - a.return);

    const rank = returns.findIndex(p => p.name === portfolio.name) + 1;
    const percentile = ((returns.length - rank) / returns.length) * 100;

    return {
      percentileRank: percentile,
      peerComparison: returns,
      totalPeers: returns.length,
      ranking: rank
    };
  }

  async calculatePercentileRanks(portfolioId) {
    return this.compareToPeers(portfolioId);
  }
}

module.exports = new PeerBenchmarkingService();
