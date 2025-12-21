const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

/**
 * Tax Loss Harvesting Service
 * Identifies opportunities to realize losses for tax benefits
 */
class TaxLossHarvestingService {
  /**
   * Find tax loss harvesting opportunities
   * @param {string} portfolioId - Portfolio ID
   * @param {number} minLossThreshold - Minimum loss % to consider (default 5%)
   * @returns {object} Tax loss harvesting opportunities
   */
  async findOpportunities(portfolioId, minLossThreshold = 5) {
    try {
      const portfolio = await prisma.portfolio.findUnique({
        where: { id: portfolioId },
        include: { holdings: true, transactions: true }
      });

      if (!portfolio) throw new Error('Portfolio not found');

      // Get current prices
      const symbols = portfolio.holdings.map(h => h.symbol);
      const quotes = await this.getCurrentPrices(symbols);

      // Analyze each holding for tax loss potential
      const opportunities = [];
      let totalPotentialLoss = 0;

      for (const holding of portfolio.holdings) {
        const currentPrice = quotes[holding.symbol] || holding.avgCostBasis;
        const currentValue = holding.shares * currentPrice;
        const costBasis = holding.shares * holding.avgCostBasis;
        const unrealizedLoss = costBasis - currentValue;
        const lossPercent = ((currentPrice - holding.avgCostBasis) / holding.avgCostBasis) * 100;

        if (lossPercent < -minLossThreshold) {
          // Check wash sale rule (30 days)
          const recentBuys = await this.checkWashSaleRisk(portfolioId, holding.symbol);
          
          // Find alternative investments
          const alternatives = await this.findAlternatives(holding.symbol, holding.sector);

          opportunities.push({
            symbol: holding.symbol,
            sector: holding.sector,
            shares: holding.shares,
            costBasis: holding.avgCostBasis,
            currentPrice,
            currentValue,
            unrealizedLoss: Math.abs(unrealizedLoss),
            lossPercent: Math.abs(lossPercent).toFixed(2),
            washSaleRisk: recentBuys.length > 0,
            recentBuys,
            alternatives,
            taxBenefit: Math.abs(unrealizedLoss) * 0.30, // Assume 30% tax rate
            recommendation: this.generateRecommendation(unrealizedLoss, recentBuys, lossPercent)
          });

          totalPotentialLoss += Math.abs(unrealizedLoss);
        }
      }

      // Calculate portfolio-level metrics
      const metrics = this.calculateTaxMetrics(opportunities, totalPotentialLoss);

      return {
        opportunities: opportunities.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss),
        metrics,
        summary: {
          totalOpportunities: opportunities.length,
          totalPotentialLoss,
          estimatedTaxBenefit: totalPotentialLoss * 0.30,
          washSaleRisks: opportunities.filter(o => o.washSaleRisk).length
        }
      };
    } catch (error) {
      logger.error('Tax loss harvesting error:', error);
      throw error;
    }
  }

  /**
   * Generate year-end tax loss harvesting report
   */
  async generateYearEndReport(portfolioId, taxYear = new Date().getFullYear()) {
    try {
      const opportunities = await this.findOpportunities(portfolioId, 3); // 3% threshold

      // Get realized gains/losses for the year
      const yearStart = new Date(taxYear, 0, 1).toISOString();
      const yearEnd = new Date(taxYear, 11, 31).toISOString();

      const transactions = await prisma.transaction.findMany({
        where: {
          portfolioId,
          type: 'sell',
          executedAt: { gte: yearStart, lte: yearEnd }
        },
        orderBy: { executedAt: 'desc' }
      });

      // Calculate realized gains/losses
      let realizedGains = 0;
      let realizedLosses = 0;

      transactions.forEach(tx => {
        const gainLoss = tx.amount - (tx.shares * (tx.price || 0));
        if (gainLoss > 0) realizedGains += gainLoss;
        else realizedLosses += Math.abs(gainLoss);
      });

      const netGainLoss = realizedGains - realizedLosses;

      return {
        taxYear,
        realizedGains,
        realizedLosses,
        netGainLoss,
        unrealizedOpportunities: opportunities.opportunities,
        recommendations: this.generateYearEndRecommendations(netGainLoss, opportunities),
        estimatedTaxImpact: this.calculateTaxImpact(realizedGains, realizedLosses, opportunities)
      };
    } catch (error) {
      logger.error('Year-end report error:', error);
      throw error;
    }
  }

  /**
   * Execute tax loss harvesting trade
   */
  async executeTaxLossHarvest(portfolioId, userId, symbol, replaceWith = null) {
    try {
      const holding = await prisma.holding.findUnique({
        where: { portfolioId_symbol: { portfolioId, symbol } }
      });

      if (!holding) throw new Error('Holding not found');

      const quote = await prisma.stockQuote.findUnique({ where: { symbol } });
      const currentPrice = quote?.price || holding.avgCostBasis;

      // Create sell transaction
      const sellTx = await prisma.transaction.create({
        data: {
          userId,
          portfolioId,
          symbol,
          type: 'sell',
          shares: holding.shares,
          price: currentPrice,
          amount: holding.shares * currentPrice,
          fees: 0,
          notes: 'Tax loss harvesting sale',
          executedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
      });

      // Delete the holding
      await prisma.holding.delete({ where: { id: holding.id } });

      // If replacement specified, buy it
      let buyTx = null;
      if (replaceWith) {
        const replaceQuote = await prisma.stockQuote.findUnique({ where: { symbol: replaceWith } });
        const replacePrice = replaceQuote?.price || currentPrice;
        const replaceShares = (holding.shares * currentPrice) / replacePrice;

        buyTx = await prisma.transaction.create({
          data: {
            userId,
            portfolioId,
            symbol: replaceWith,
            type: 'buy',
            shares: replaceShares,
            price: replacePrice,
            amount: replaceShares * replacePrice,
            fees: 0,
            notes: `Tax loss harvesting replacement for ${symbol}`,
            executedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          }
        });

        // Create new holding
        await prisma.holding.create({
          data: {
            portfolioId,
            symbol: replaceWith,
            shares: replaceShares,
            avgCostBasis: replacePrice,
            sector: holding.sector,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });
      }

      return {
        success: true,
        sellTransaction: sellTx,
        buyTransaction: buyTx,
        realizedLoss: (holding.shares * holding.avgCostBasis) - (holding.shares * currentPrice),
        message: replaceWith 
          ? `Sold ${symbol} and bought ${replaceWith} for tax loss harvesting`
          : `Sold ${symbol} for tax loss harvesting`
      };
    } catch (error) {
      logger.error('Execute tax loss harvest error:', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  async getCurrentPrices(symbols) {
    const quotes = {};
    for (const symbol of symbols) {
      const quote = await prisma.stockQuote.findUnique({ where: { symbol } });
      quotes[symbol] = quote ? quote.price : 100;
    }
    return quotes;
  }

  async checkWashSaleRisk(portfolioId, symbol) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentBuys = await prisma.transaction.findMany({
      where: {
        portfolioId,
        symbol,
        type: 'buy',
        executedAt: { gte: thirtyDaysAgo.toISOString() }
      },
      orderBy: { executedAt: 'desc' }
    });

    return recentBuys;
  }

  async findAlternatives(symbol, sector) {
    // Find similar stocks in same sector
    const alternatives = await prisma.stockQuote.findMany({
      where: {
        sector,
        symbol: { not: symbol }
      },
      take: 5,
      orderBy: { marketCap: 'desc' }
    });

    return alternatives.map(alt => ({
      symbol: alt.symbol,
      name: alt.name,
      price: alt.price,
      sector: alt.sector,
      similarity: 'Same sector'
    }));
  }

  generateRecommendation(unrealizedLoss, recentBuys, lossPercent) {
    if (recentBuys.length > 0) {
      return {
        action: 'wait',
        reason: 'Wash sale risk - wait 30 days after last purchase',
        priority: 'low'
      };
    }

    if (Math.abs(lossPercent) > 20) {
      return {
        action: 'harvest',
        reason: 'Significant loss - strong tax benefit opportunity',
        priority: 'high'
      };
    }

    if (Math.abs(lossPercent) > 10) {
      return {
        action: 'harvest',
        reason: 'Moderate loss - good tax benefit potential',
        priority: 'medium'
      };
    }

    return {
      action: 'consider',
      reason: 'Minor loss - evaluate against other opportunities',
      priority: 'low'
    };
  }

  calculateTaxMetrics(opportunities, totalPotentialLoss) {
    const highPriority = opportunities.filter(o => o.recommendation.priority === 'high');
    const mediumPriority = opportunities.filter(o => o.recommendation.priority === 'medium');

    return {
      highPriorityCount: highPriority.length,
      mediumPriorityCount: mediumPriority.length,
      highPriorityValue: highPriority.reduce((sum, o) => sum + o.unrealizedLoss, 0),
      avgLossPercent: opportunities.length > 0 
        ? (opportunities.reduce((sum, o) => sum + parseFloat(o.lossPercent), 0) / opportunities.length).toFixed(2)
        : 0
    };
  }

  generateYearEndRecommendations(netGainLoss, opportunities) {
    const recs = [];

    if (netGainLoss > 0) {
      recs.push({
        type: 'offset_gains',
        message: `You have $${netGainLoss.toFixed(2)} in realized gains. Harvest losses to offset.`,
        priority: 'high'
      });
    }

    if (opportunities.summary.totalPotentialLoss > 3000) {
      recs.push({
        type: 'maximize_deduction',
        message: 'Losses exceed ,000 annual deduction limit. Consider multi-year strategy.',
        priority: 'medium'
      });
    }

    return recs;
  }

  calculateTaxImpact(realizedGains, realizedLosses, opportunities) {
    const currentTax = Math.max(0, (realizedGains - realizedLosses)) * 0.20; // 20% cap gains
    const potentialSavings = opportunities.summary.estimatedTaxBenefit || 0;

    return {
      currentYearTax: currentTax,
      potentialSavings,
      netTax: Math.max(0, currentTax - potentialSavings)
    };
  }
}

module.exports = new TaxLossHarvestingService();
