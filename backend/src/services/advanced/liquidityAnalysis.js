const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class LiquidityAnalysisService {
  async analyzePortfolioLiquidity(portfolioId) {
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: portfolioId },
      include: { holdings: true }
    });

    if (!portfolio) return { liquidityScores: [], marketImpact: 0, daysToLiquidate: 0 };

    const scores = portfolio.holdings.map(h => {
      const value = h.shares * h.avgCostBasis;
      const avgDailyVolume = 1000000 + Math.random() * 5000000;
      const daysToLiquidate = value / (avgDailyVolume * 0.1);
      
      return {
        symbol: h.symbol,
        value,
        avgDailyVolume,
        bidAskSpread: 0.01 + Math.random() * 0.05,
        daysToLiquidate,
        liquidityScore: Math.max(0, 100 - daysToLiquidate * 10)
      };
    });

    const totalValue = scores.reduce((sum, s) => sum + s.value, 0);
    const avgDays = scores.reduce((sum, s) => sum + s.daysToLiquidate, 0) / scores.length;

    return {
      liquidityScores: scores,
      marketImpact: avgDays * 0.1,
      daysToLiquidate: avgDays,
      portfolioLiquidityScore: scores.reduce((sum, s) => sum + s.liquidityScore * s.value, 0) / totalValue
    };
  }
}

module.exports = new LiquidityAnalysisService();
