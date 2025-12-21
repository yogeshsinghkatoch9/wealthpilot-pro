const { prisma } = require('@prisma/client');
const logger = require('../utils/logger');

/**
 * Portfolio Rebalancing Service
 * Suggests optimal trades to rebalance portfolio to target allocations
 */
class PortfolioRebalancingService {
  /**
   * Calculate rebalancing recommendations
   * @param {string} portfolioId - Portfolio ID
   * @param {object} targetAllocations - Target weights { symbol: weight% }
   * @param {string} strategy - Rebalancing strategy
   * @returns {object} Rebalancing recommendations
   */
  async calculateRebalancing(portfolioId, targetAllocations = null, strategy = 'target_weights') {
    try {
      const portfolio = await prisma.portfolio.findUnique({
        where: { id: portfolioId },
        include: { holdings: true }
      });

      if (!portfolio) throw new Error('Portfolio not found');

      // Get current prices for all holdings
      const symbols = portfolio.holdings.map(h => h.symbol);
      const quotes = await this.getCurrentPrices(symbols);

      // Calculate current portfolio value and weights
      const currentPositions = this.calculateCurrentPositions(portfolio.holdings, quotes);
      const totalValue = currentPositions.reduce((sum, p) => sum + p.value, 0) + portfolio.cashBalance;

      // Determine target allocations based on strategy
      let targets;
      if (targetAllocations) {
        targets = targetAllocations;
      } else {
        targets = await this.calculateTargetsByStrategy(portfolio, strategy);
      }

      // Calculate required trades
      const trades = this.calculateRequiredTrades(currentPositions, targets, totalValue, quotes);

      // Estimate transaction costs
      const costs = this.estimateTransactionCosts(trades);

      // Calculate metrics
      const metrics = this.calculateRebalancingMetrics(currentPositions, trades, totalValue);

      return {
        currentPositions,
        targetAllocations: targets,
        recommendedTrades: trades,
        transactionCosts: costs,
        metrics,
        totalValue,
        cashAvailable: portfolio.cashBalance,
        strategy
      };
    } catch (error) {
      logger.error('Rebalancing calculation error:', error);
      throw error;
    }
  }

  /**
   * Get multiple rebalancing strategies
   */
  async getRebalancingStrategies(portfolioId) {
    const strategies = ['equal_weight', 'market_cap', 'risk_parity', 'minimum_variance'];
    const results = {};

    for (const strategy of strategies) {
      results[strategy] = await this.calculateRebalancing(portfolioId, null, strategy);
    }

    return results;
  }

  /**
   * Execute rebalancing (create transaction records)
   */
  async executeRebalancing(portfolioId, trades, userId) {
    try {
      const transactions = [];

      for (const trade of trades) {
        if (trade.action === 'none') continue;

        const transaction = await prisma.transaction.create({
          data: {
            userId,
            portfolioId,
            symbol: trade.symbol,
            type: trade.action,
            shares: Math.abs(trade.shares),
            price: trade.price,
            amount: Math.abs(trade.value),
            fees: trade.estimatedFees || 0,
            notes: `Rebalancing trade: ${trade.action} ${Math.abs(trade.shares).toFixed(2)} shares`,
            executedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          }
        });

        transactions.push(transaction);

        // Update holdings
        if (trade.action === 'buy') {
          await this.updateOrCreateHolding(portfolioId, trade.symbol, trade.shares, trade.price);
        } else if (trade.action === 'sell') {
          await this.updateOrCreateHolding(portfolioId, trade.symbol, -trade.shares, trade.price);
        }
      }

      return {
        success: true,
        transactions,
        message: `Executed ${transactions.length} rebalancing trades`
      };
    } catch (error) {
      logger.error('Execute rebalancing error:', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  async getCurrentPrices(symbols) {
    const quotes = {};
    
    for (const symbol of symbols) {
      const quote = await prisma.stockQuote.findUnique({ where: { symbol } });
      quotes[symbol] = quote ? quote.price : 100; // Default if not found
    }

    return quotes;
  }

  calculateCurrentPositions(holdings, quotes) {
    return holdings.map(h => {
      const price = quotes[h.symbol] || h.avgCostBasis;
      const value = h.shares * price;
      
      return {
        symbol: h.symbol,
        shares: h.shares,
        price,
        value,
        costBasis: h.avgCostBasis,
        sector: h.sector
      };
    });
  }

  async calculateTargetsByStrategy(portfolio, strategy) {
    const holdings = portfolio.holdings;
    const targets = {};

    switch (strategy) {
      case 'equal_weight':
        // Equal weight across all holdings
        const equalWeight = 100 / holdings.length;
        holdings.forEach(h => targets[h.symbol] = equalWeight);
        break;

      case 'market_cap':
        // Weight by market cap
        const quotes = await this.getCurrentPrices(holdings.map(h => h.symbol));
        let totalMktCap = 0;
        const mktCaps = {};

        for (const h of holdings) {
          const quote = await prisma.stockQuote.findUnique({ where: { symbol: h.symbol } });
          const mktCap = quote?.marketCap || 1000000000;
          mktCaps[h.symbol] = mktCap;
          totalMktCap += mktCap;
        }

        holdings.forEach(h => {
          targets[h.symbol] = (mktCaps[h.symbol] / totalMktCap) * 100;
        });
        break;

      case 'risk_parity':
        // Inverse volatility weighting (lower vol = higher weight)
        const vols = {};
        let totalInverseVol = 0;

        for (const h of holdings) {
          const quote = await prisma.stockQuote.findUnique({ where: { symbol: h.symbol } });
          const vol = quote?.beta ? Math.abs(quote.beta) * 15 : 15; // Estimate vol
          const inverseVol = 1 / vol;
          vols[h.symbol] = inverseVol;
          totalInverseVol += inverseVol;
        }

        holdings.forEach(h => {
          targets[h.symbol] = (vols[h.symbol] / totalInverseVol) * 100;
        });
        break;

      case 'minimum_variance':
        // Simplified minimum variance (equal weight with sector constraints)
        const sectors = {};
        holdings.forEach(h => {
          const sector = h.sector || 'Other';
          if (!sectors[sector]) sectors[sector] = [];
          sectors[sector].push(h.symbol);
        });

        // Max 30% per sector
        Object.keys(sectors).forEach(sector => {
          const sectorWeight = Math.min(30, 100 / Object.keys(sectors).length);
          const perStock = sectorWeight / sectors[sector].length;
          sectors[sector].forEach(symbol => targets[symbol] = perStock);
        });
        break;

      default:
        // Equal weight fallback
        const weight = 100 / holdings.length;
        holdings.forEach(h => targets[h.symbol] = weight);
    }

    return targets;
  }

  calculateRequiredTrades(currentPositions, targets, totalValue, quotes) {
    const trades = [];
    const threshold = 0.01; // 1% rebalancing threshold

    currentPositions.forEach(position => {
      const currentWeight = (position.value / totalValue) * 100;
      const targetWeight = targets[position.symbol] || 0;
      const diff = targetWeight - currentWeight;

      // Only trade if difference exceeds threshold
      if (Math.abs(diff) < threshold) {
        trades.push({
          symbol: position.symbol,
          action: 'none',
          currentShares: position.shares,
          currentWeight: currentWeight.toFixed(2),
          targetWeight: targetWeight.toFixed(2),
          diff: diff.toFixed(2)
        });
        return;
      }

      const targetValue = (targetWeight / 100) * totalValue;
      const valueDiff = targetValue - position.value;
      const sharesDiff = valueDiff / position.price;

      trades.push({
        symbol: position.symbol,
        action: sharesDiff > 0 ? 'buy' : 'sell',
        currentShares: position.shares,
        shares: Math.abs(sharesDiff),
        price: position.price,
        value: Math.abs(valueDiff),
        currentWeight: currentWeight.toFixed(2),
        targetWeight: targetWeight.toFixed(2),
        diff: diff.toFixed(2),
        estimatedFees: Math.abs(valueDiff) * 0.001 // 0.1% fee estimate
      });
    });

    return trades.sort((a, b) => Math.abs(parseFloat(b.diff)) - Math.abs(parseFloat(a.diff)));
  }

  estimateTransactionCosts(trades) {
    const totalValue = trades.reduce((sum, t) => sum + (t.value || 0), 0);
    const totalFees = trades.reduce((sum, t) => sum + (t.estimatedFees || 0), 0);
    const slippage = totalValue * 0.0005; // 0.05% slippage estimate

    return {
      totalValue,
      estimatedFees: totalFees,
      estimatedSlippage: slippage,
      totalCost: totalFees + slippage,
      costPercent: ((totalFees + slippage) / totalValue) * 100
    };
  }

  calculateRebalancingMetrics(currentPositions, trades, totalValue) {
    const buys = trades.filter(t => t.action === 'buy');
    const sells = trades.filter(t => t.action === 'sell');
    const turnover = (trades.reduce((sum, t) => sum + (t.value || 0), 0) / totalValue) * 100;

    return {
      totalTrades: trades.filter(t => t.action !== 'none').length,
      buyOrders: buys.length,
      sellOrders: sells.length,
      totalBuyValue: buys.reduce((sum, t) => sum + (t.value || 0), 0),
      totalSellValue: sells.reduce((sum, t) => sum + (t.value || 0), 0),
      turnoverPercent: turnover.toFixed(2),
      estimatedTime: trades.length * 2 // minutes
    };
  }

  async updateOrCreateHolding(portfolioId, symbol, sharesDelta, price) {
    const existing = await prisma.holding.findUnique({
      where: { portfolioId_symbol: { portfolioId, symbol } }
    });

    if (existing) {
      const newShares = existing.shares + sharesDelta;
      
      if (newShares <= 0) {
        // Sell all - delete holding
        await prisma.holding.delete({
          where: { id: existing.id }
        });
      } else {
        // Update shares and average cost
        const totalCost = (existing.shares * existing.avgCostBasis) + (sharesDelta * price);
        const newAvgCost = totalCost / newShares;
        
        await prisma.holding.update({
          where: { id: existing.id },
          data: {
            shares: newShares,
            avgCostBasis: newAvgCost,
            updatedAt: new Date().toISOString()
          }
        });
      }
    } else if (sharesDelta > 0) {
      // Create new holding
      await prisma.holding.create({
        data: {
          portfolioId,
          symbol,
          shares: sharesDelta,
          avgCostBasis: price,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }
  }
}

module.exports = new PortfolioRebalancingService();
