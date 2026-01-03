/**
 * WealthPilot Pro - Tax Optimization Service
 * Tax-loss harvesting, lot selection, and gain/loss management
 */

const logger = require('../../utils/logger');

// Try to import Prisma client, use mock if not available
let db;
try {
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient();
} catch (err) {
  logger.warn('Prisma client not available for tax optimization, using mock data');
  db = {
    portfolios: {
      findFirst: async () => null
    },
    transactions: {
      findMany: async () => []
    },
    taxLots: {
      findMany: async () => []
    }
  };
}

class TaxOptimizationService {
  constructor() {
    this.shortTermRate = 0.37; // Short-term capital gains rate (ordinary income)
    this.longTermRate = 0.20; // Long-term capital gains rate
    this.washSaleWindow = 30; // Days before/after for wash sale rule
  }

  /**
   * Get comprehensive tax analysis for a portfolio
   */
  async getTaxAnalysis(portfolioId, userId, taxYear = new Date().getFullYear()) {
    const portfolio = await db.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: { 
        holdings: true,
        transactions: {
          where: {
            date: {
              gte: new Date(`${taxYear}-01-01`),
              lte: new Date(`${taxYear}-12-31`)
            }
          }
        }
      }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const holdings = portfolio.holdings || [];
    const transactions = portfolio.transactions || [];

    return {
      summary: this.calculateTaxSummary(holdings, transactions),
      unrealizedGains: this.categorizeUnrealizedGains(holdings),
      realizedGains: this.categorizeRealizedGains(transactions),
      harvestingOpportunities: this.findHarvestingOpportunities(holdings),
      washSaleRisks: await this.checkWashSaleRisks(portfolioId, holdings),
      estimatedTax: this.estimateTaxLiability(holdings, transactions),
      recommendations: this.generateTaxRecommendations(holdings, transactions)
    };
  }

  /**
   * Calculate tax summary
   */
  calculateTaxSummary(holdings, transactions) {
    // Unrealized
    const unrealizedGains = holdings.reduce((sum, h) => {
      const gain = h.unrealizedGainLoss || 0;
      return sum + (gain > 0 ? gain : 0);
    }, 0);
    
    const unrealizedLosses = holdings.reduce((sum, h) => {
      const gain = h.unrealizedGainLoss || 0;
      return sum + (gain < 0 ? Math.abs(gain) : 0);
    }, 0);

    // Realized (from transactions)
    const sellTransactions = transactions.filter(t => t.type === 'sell');
    const realizedGains = sellTransactions.reduce((sum, t) => {
      const gain = t.realizedGainLoss || 0;
      return sum + (gain > 0 ? gain : 0);
    }, 0);
    
    const realizedLosses = sellTransactions.reduce((sum, t) => {
      const gain = t.realizedGainLoss || 0;
      return sum + (gain < 0 ? Math.abs(gain) : 0);
    }, 0);

    const netRealizedGainLoss = realizedGains - realizedLosses;
    const netUnrealizedGainLoss = unrealizedGains - unrealizedLosses;

    return {
      unrealized: {
        gains: unrealizedGains,
        losses: unrealizedLosses,
        net: netUnrealizedGainLoss
      },
      realized: {
        gains: realizedGains,
        losses: realizedLosses,
        net: netRealizedGainLoss
      },
      totalGainLoss: netRealizedGainLoss + netUnrealizedGainLoss,
      positionsWithGains: holdings.filter(h => (h.unrealizedGainLoss || 0) > 0).length,
      positionsWithLosses: holdings.filter(h => (h.unrealizedGainLoss || 0) < 0).length
    };
  }

  /**
   * Categorize unrealized gains by holding period
   */
  categorizeUnrealizedGains(holdings) {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const shortTerm = { gains: 0, losses: 0, holdings: [] };
    const longTerm = { gains: 0, losses: 0, holdings: [] };

    holdings.forEach(holding => {
      const purchaseDate = new Date(holding.purchaseDate || holding.createdAt);
      const isLongTerm = purchaseDate < oneYearAgo;
      const gain = holding.unrealizedGainLoss || 0;
      const category = isLongTerm ? longTerm : shortTerm;

      if (gain > 0) {
        category.gains += gain;
      } else {
        category.losses += Math.abs(gain);
      }

      category.holdings.push({
        symbol: holding.symbol,
        shares: holding.shares,
        costBasis: holding.costBasis,
        marketValue: holding.marketValue,
        gainLoss: gain,
        gainLossPercent: holding.costBasis > 0 ? (gain / holding.costBasis) * 100 : 0,
        purchaseDate: purchaseDate.toISOString().split('T')[0],
        holdingPeriod: Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24)),
        isLongTerm
      });
    });

    return {
      shortTerm: {
        ...shortTerm,
        net: shortTerm.gains - shortTerm.losses,
        taxRate: this.shortTermRate,
        estimatedTax: (shortTerm.gains - shortTerm.losses) * this.shortTermRate
      },
      longTerm: {
        ...longTerm,
        net: longTerm.gains - longTerm.losses,
        taxRate: this.longTermRate,
        estimatedTax: (longTerm.gains - longTerm.losses) * this.longTermRate
      }
    };
  }

  /**
   * Categorize realized gains from transactions
   */
  categorizeRealizedGains(transactions) {
    const shortTerm = { gains: 0, losses: 0, transactions: [] };
    const longTerm = { gains: 0, losses: 0, transactions: [] };

    transactions
      .filter(t => t.type === 'sell')
      .forEach(tx => {
        const isLongTerm = tx.holdingPeriod && tx.holdingPeriod >= 365;
        const gain = tx.realizedGainLoss || 0;
        const category = isLongTerm ? longTerm : shortTerm;

        if (gain > 0) {
          category.gains += gain;
        } else {
          category.losses += Math.abs(gain);
        }

        category.transactions.push({
          date: tx.date,
          symbol: tx.symbol,
          shares: tx.shares,
          proceeds: tx.amount,
          costBasis: tx.costBasis || 0,
          gainLoss: gain,
          isLongTerm
        });
      });

    return {
      shortTerm: {
        ...shortTerm,
        net: shortTerm.gains - shortTerm.losses,
        taxRate: this.shortTermRate
      },
      longTerm: {
        ...longTerm,
        net: longTerm.gains - longTerm.losses,
        taxRate: this.longTermRate
      }
    };
  }

  /**
   * Find tax-loss harvesting opportunities
   */
  findHarvestingOpportunities(holdings) {
    const opportunities = holdings
      .filter(h => (h.unrealizedGainLoss || 0) < 0)
      .map(h => {
        const loss = Math.abs(h.unrealizedGainLoss || 0);
        const now = new Date();
        const purchaseDate = new Date(h.purchaseDate || h.createdAt);
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const isLongTerm = purchaseDate < oneYearAgo;
        
        const taxSavings = loss * (isLongTerm ? this.longTermRate : this.shortTermRate);

        return {
          symbol: h.symbol,
          shares: h.shares,
          currentValue: h.marketValue,
          costBasis: h.costBasis,
          unrealizedLoss: loss,
          lossPercent: h.costBasis > 0 ? (h.unrealizedGainLoss / h.costBasis) * 100 : 0,
          isLongTerm,
          taxSavings,
          holdingPeriod: Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24)),
          daysToLongTerm: isLongTerm ? 0 : Math.max(0, 365 - Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24)))
        };
      })
      .filter(o => o.unrealizedLoss > 100) // Min $100 loss
      .sort((a, b) => b.taxSavings - a.taxSavings);

    const totalPotentialSavings = opportunities.reduce((sum, o) => sum + o.taxSavings, 0);

    return {
      opportunities,
      count: opportunities.length,
      totalPotentialLoss: opportunities.reduce((sum, o) => sum + o.unrealizedLoss, 0),
      totalPotentialSavings,
      topOpportunities: opportunities.slice(0, 5)
    };
  }

  /**
   * Check for wash sale risks
   */
  async checkWashSaleRisks(portfolioId, holdings) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.washSaleWindow);
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + this.washSaleWindow);

    // Get recent transactions
    const recentTransactions = await db.transactions?.findMany?.({
      where: {
        portfolioId,
        date: { gte: thirtyDaysAgo }
      }
    }) || [];

    const risks = [];
    const soldSymbols = new Set(
      recentTransactions
        .filter(t => t.type === 'sell')
        .map(t => t.symbol)
    );

    // Check current holdings against recent sells
    holdings.forEach(h => {
      if (soldSymbols.has(h.symbol)) {
        const relatedSell = recentTransactions.find(
          t => t.type === 'sell' && t.symbol === h.symbol
        );
        
        if (relatedSell && (relatedSell.realizedGainLoss || 0) < 0) {
          risks.push({
            symbol: h.symbol,
            type: 'potential_wash_sale',
            sellDate: relatedSell.date,
            sellLoss: Math.abs(relatedSell.realizedGainLoss),
            currentShares: h.shares,
            message: `Recently sold ${h.symbol} at a loss. Buying back within 30 days triggers wash sale.`
          });
        }
      }
    });

    // Check for holdings that would trigger wash sale if sold
    const potentialWashSales = holdings
      .filter(h => (h.unrealizedGainLoss || 0) < 0)
      .map(h => {
        const recentBuy = recentTransactions.find(
          t => t.type === 'buy' && t.symbol === h.symbol
        );
        
        if (recentBuy) {
          return {
            symbol: h.symbol,
            type: 'wash_sale_warning',
            buyDate: recentBuy.date,
            potentialLoss: Math.abs(h.unrealizedGainLoss),
            message: `Selling ${h.symbol} now would trigger wash sale due to recent purchase.`
          };
        }
        return null;
      })
      .filter(Boolean);

    return {
      activeRisks: risks,
      potentialRisks: potentialWashSales,
      totalAtRisk: risks.reduce((sum, r) => sum + r.sellLoss, 0),
      washSaleWindow: this.washSaleWindow
    };
  }

  /**
   * Estimate tax liability
   */
  estimateTaxLiability(holdings, transactions) {
    const unrealized = this.categorizeUnrealizedGains(holdings);
    const realized = this.categorizeRealizedGains(transactions);

    // Realized tax (already triggered)
    const realizedShortTermTax = Math.max(0, realized.shortTerm.net) * this.shortTermRate;
    const realizedLongTermTax = Math.max(0, realized.longTerm.net) * this.longTermRate;
    const totalRealizedTax = realizedShortTermTax + realizedLongTermTax;

    // Potential tax if all gains realized
    const potentialShortTermTax = Math.max(0, unrealized.shortTerm.net) * this.shortTermRate;
    const potentialLongTermTax = Math.max(0, unrealized.longTerm.net) * this.longTermRate;
    const totalPotentialTax = potentialShortTermTax + potentialLongTermTax;

    // Tax loss carryover (if losses exceed gains)
    const netLoss = Math.min(0, realized.shortTerm.net + realized.longTerm.net);
    const carryoverLimit = 3000; // Annual limit for deducting losses against ordinary income
    const carryoverUsed = Math.min(carryoverLimit, Math.abs(netLoss));
    const remainingCarryover = Math.abs(netLoss) - carryoverUsed;

    return {
      realized: {
        shortTerm: {
          net: realized.shortTerm.net,
          tax: realizedShortTermTax,
          rate: this.shortTermRate
        },
        longTerm: {
          net: realized.longTerm.net,
          tax: realizedLongTermTax,
          rate: this.longTermRate
        },
        total: totalRealizedTax
      },
      potential: {
        shortTerm: {
          net: unrealized.shortTerm.net,
          tax: potentialShortTermTax,
          rate: this.shortTermRate
        },
        longTerm: {
          net: unrealized.longTerm.net,
          tax: potentialLongTermTax,
          rate: this.longTermRate
        },
        total: totalPotentialTax
      },
      carryover: {
        available: Math.abs(netLoss),
        usedThisYear: carryoverUsed,
        remaining: remainingCarryover
      },
      combinedEstimate: totalRealizedTax + totalPotentialTax
    };
  }

  /**
   * Generate tax recommendations
   */
  generateTaxRecommendations(holdings, transactions) {
    const recommendations = [];
    const harvestingOpps = this.findHarvestingOpportunities(holdings);
    const unrealized = this.categorizeUnrealizedGains(holdings);

    // Tax-loss harvesting recommendation
    if (harvestingOpps.totalPotentialSavings > 500) {
      recommendations.push({
        type: 'harvest',
        priority: 'high',
        title: 'Tax-Loss Harvesting Opportunity',
        description: `You could save approximately $${harvestingOpps.totalPotentialSavings.toFixed(0)} in taxes by harvesting losses.`,
        action: `Consider selling ${harvestingOpps.count} positions with unrealized losses.`,
        savings: harvestingOpps.totalPotentialSavings
      });
    }

    // Hold for long-term gains
    const nearLongTerm = unrealized.shortTerm.holdings.filter(
      h => h.gainLossPercent > 0 && h.daysToLongTerm && h.daysToLongTerm < 60
    );
    if (nearLongTerm.length > 0) {
      const totalGains = nearLongTerm.reduce((sum, h) => sum + h.gainLoss, 0);
      const taxSavings = totalGains * (this.shortTermRate - this.longTermRate);
      recommendations.push({
        type: 'hold',
        priority: 'medium',
        title: 'Wait for Long-Term Gains',
        description: `${nearLongTerm.length} position(s) will qualify for long-term rates soon.`,
        action: `Hold these positions for ${Math.max(...nearLongTerm.map(h => h.daysToLongTerm))} more days to save ~$${taxSavings.toFixed(0)} in taxes.`,
        savings: taxSavings
      });
    }

    // Offset gains with losses
    if (unrealized.shortTerm.gains > 0 && unrealized.shortTerm.losses > 0) {
      recommendations.push({
        type: 'offset',
        priority: 'medium',
        title: 'Offset Short-Term Gains',
        description: `You have $${unrealized.shortTerm.gains.toFixed(0)} in short-term gains and $${unrealized.shortTerm.losses.toFixed(0)} in losses.`,
        action: 'Consider selling losing positions to offset gains before year end.',
        savings: Math.min(unrealized.shortTerm.gains, unrealized.shortTerm.losses) * this.shortTermRate
      });
    }

    // Charitable giving
    const largeGains = unrealized.longTerm.holdings.filter(h => h.gainLoss > 10000);
    if (largeGains.length > 0) {
      recommendations.push({
        type: 'charitable',
        priority: 'low',
        title: 'Consider Charitable Giving',
        description: 'Donating appreciated securities can provide tax benefits.',
        action: `You have ${largeGains.length} position(s) with significant long-term gains ideal for charitable donation.`
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get optimal lot selection for selling
   */
  async getOptimalLotSelection(portfolioId, symbol, sharesToSell, strategy = 'tax_efficient') {
    const lots = await db.taxLots?.findMany?.({
      where: { portfolioId, symbol, remainingShares: { gt: 0 } },
      orderBy: { purchaseDate: 'asc' }
    }) || [];

    if (lots.length === 0) {
      throw new Error('No tax lots found for this symbol');
    }

    let sortedLots;
    
    switch (strategy) {
      case 'fifo': // First In First Out
        sortedLots = [...lots].sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
        break;
        
      case 'lifo': // Last In First Out
        sortedLots = [...lots].sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        break;
        
      case 'hifo': // Highest In First Out (minimize gains)
        sortedLots = [...lots].sort((a, b) => b.costPerShare - a.costPerShare);
        break;
        
      case 'lofo': // Lowest In First Out (maximize gains for specific situations)
        sortedLots = [...lots].sort((a, b) => a.costPerShare - b.costPerShare);
        break;
        
      case 'tax_efficient': // Prioritize long-term losses, then short-term losses, then long-term gains
      default:
        sortedLots = this.sortLotsForTaxEfficiency(lots);
        break;
    }

    // Select lots
    let remainingToSell = sharesToSell;
    const selectedLots = [];
    let totalProceeds = 0;
    let totalCostBasis = 0;

    // Get current price (would come from market data in production)
    const currentPrice = lots[0]?.currentPrice || 100;

    for (const lot of sortedLots) {
      if (remainingToSell <= 0) break;

      const sharesToTake = Math.min(remainingToSell, lot.remainingShares);
      const proceeds = sharesToTake * currentPrice;
      const costBasis = sharesToTake * lot.costPerShare;
      const gainLoss = proceeds - costBasis;

      selectedLots.push({
        lotId: lot.id,
        purchaseDate: lot.purchaseDate,
        shares: sharesToTake,
        costPerShare: lot.costPerShare,
        costBasis,
        proceeds,
        gainLoss,
        isLongTerm: this.isLongTerm(lot.purchaseDate),
        taxImpact: gainLoss * (this.isLongTerm(lot.purchaseDate) ? this.longTermRate : this.shortTermRate)
      });

      totalProceeds += proceeds;
      totalCostBasis += costBasis;
      remainingToSell -= sharesToTake;
    }

    return {
      strategy,
      sharesToSell,
      currentPrice,
      selectedLots,
      summary: {
        totalShares: sharesToSell - remainingToSell,
        totalProceeds,
        totalCostBasis,
        totalGainLoss: totalProceeds - totalCostBasis,
        estimatedTax: selectedLots.reduce((sum, l) => sum + l.taxImpact, 0),
        unfilledShares: remainingToSell
      },
      comparison: await this.compareStrategies(lots, sharesToSell, currentPrice)
    };
  }

  /**
   * Sort lots for tax efficiency
   */
  sortLotsForTaxEfficiency(lots) {
    return [...lots].sort((a, b) => {
      const aIsLongTerm = this.isLongTerm(a.purchaseDate);
      const bIsLongTerm = this.isLongTerm(b.purchaseDate);
      const aGain = (a.currentPrice || 100) - a.costPerShare;
      const bGain = (b.currentPrice || 100) - b.costPerShare;
      
      // Priority: Long-term losses > Short-term losses > Long-term gains > Short-term gains
      if (aGain < 0 && bGain >= 0) return -1;
      if (aGain >= 0 && bGain < 0) return 1;
      
      if (aGain < 0 && bGain < 0) {
        // Both losses: prefer long-term (lower tax benefit, so harvest short-term first actually)
        if (!aIsLongTerm && bIsLongTerm) return -1;
        if (aIsLongTerm && !bIsLongTerm) return 1;
        return aGain - bGain; // Bigger loss first
      }
      
      if (aGain >= 0 && bGain >= 0) {
        // Both gains: prefer long-term (lower tax rate)
        if (aIsLongTerm && !bIsLongTerm) return -1;
        if (!aIsLongTerm && bIsLongTerm) return 1;
        return bGain - aGain; // Smaller gain first
      }
      
      return 0;
    });
  }

  /**
   * Compare different lot selection strategies
   */
  async compareStrategies(lots, sharesToSell, currentPrice) {
    const strategies = ['fifo', 'lifo', 'hifo', 'tax_efficient'];
    const results = {};

    for (const strategy of strategies) {
      let sortedLots;
      switch (strategy) {
        case 'fifo':
          sortedLots = [...lots].sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
          break;
        case 'lifo':
          sortedLots = [...lots].sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
          break;
        case 'hifo':
          sortedLots = [...lots].sort((a, b) => b.costPerShare - a.costPerShare);
          break;
        case 'tax_efficient':
          sortedLots = this.sortLotsForTaxEfficiency(lots);
          break;
      }

      let remaining = sharesToSell;
      let totalGainLoss = 0;
      let totalTax = 0;

      for (const lot of sortedLots) {
        if (remaining <= 0) break;
        const shares = Math.min(remaining, lot.remainingShares);
        const gainLoss = shares * (currentPrice - lot.costPerShare);
        const tax = gainLoss * (this.isLongTerm(lot.purchaseDate) ? this.longTermRate : this.shortTermRate);
        totalGainLoss += gainLoss;
        totalTax += tax;
        remaining -= shares;
      }

      results[strategy] = {
        totalGainLoss,
        estimatedTax: Math.max(0, totalTax)
      };
    }

    return results;
  }

  /**
   * Check if holding period is long-term (> 1 year)
   */
  isLongTerm(purchaseDate) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return new Date(purchaseDate) < oneYearAgo;
  }
}

module.exports = new TaxOptimizationService();
