const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ESGAnalysisService {
  async calculatePortfolioESG(portfolioId) {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: { holdings: true }
    });

    if (!portfolio || portfolio.holdings.length === 0) {
      return { esgScore: 0, componentScores: {}, carbonFootprint: 0, radarData: [] };
    }

    const totalValue = portfolio.holdings.reduce((sum, h) => sum + (h.shares * h.avgCostBasis), 0);
    
    let weightedE = 0, weightedS = 0, weightedG = 0, carbonFootprint = 0;

    portfolio.holdings.forEach(h => {
      const weight = (h.shares * h.avgCostBasis) / totalValue;
      const eScore = 50 + Math.random() * 40;
      const sScore = 50 + Math.random() * 40;
      const gScore = 50 + Math.random() * 40;
      
      weightedE += eScore * weight;
      weightedS += sScore * weight;
      weightedG += gScore * weight;
      carbonFootprint += weight * (10 + Math.random() * 90);
    });

    const overallScore = (weightedE + weightedS + weightedG) / 3;

    return {
      esgScore: overallScore,
      componentScores: {
        environmental: weightedE,
        social: weightedS,
        governance: weightedG
      },
      carbonFootprint,
      radarData: [
        { axis: 'Environmental', value: weightedE },
        { axis: 'Social', value: weightedS },
        { axis: 'Governance', value: weightedG },
        { axis: 'Diversity', value: 50 + Math.random() * 40 },
        { axis: 'Human Rights', value: 50 + Math.random() * 40 },
        { axis: 'Ethics', value: 50 + Math.random() * 40 }
      ]
    };
  }
}

module.exports = new ESGAnalysisService();
