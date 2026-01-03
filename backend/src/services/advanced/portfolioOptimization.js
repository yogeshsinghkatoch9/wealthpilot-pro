/**
 * WealthPilot Pro - Portfolio Optimization Service
 * Rebalancing, optimization, and model portfolio management
 */

const logger = require('../../utils/logger');

// Try to import Prisma client, use mock if not available
let db;
try {
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient();
} catch (err) {
  logger.warn('Prisma client not available for portfolio optimization, using mock data');
  db = {
    portfolios: {
      findFirst: async () => null
    }
  };
}

class PortfolioOptimizationService {
  constructor() {
    this.rebalanceThreshold = 0.05; // 5% drift threshold
    this.minTradeAmount = 100; // Minimum trade size
  }

  /**
   * Calculate rebalancing trades to match target allocation
   */
  async calculateRebalanceTrades(portfolioId, userId, targetAllocation) {
    const portfolio = await db.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const holdings = portfolio.holdings || [];
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0) + (portfolio.cashBalance || 0);

    if (totalValue === 0) {
      throw new Error('Portfolio has no value');
    }

    // Calculate current allocation
    const currentAllocation = {};
    holdings.forEach(h => {
      currentAllocation[h.symbol] = {
        shares: h.shares,
        price: h.price,
        value: h.marketValue || 0,
        weight: ((h.marketValue || 0) / totalValue) * 100
      };
    });

    // Calculate cash weight
    const cashWeight = (portfolio.cashBalance / totalValue) * 100;

    // Calculate required trades
    const trades = [];
    const summary = {
      currentValue: totalValue,
      tradesCount: 0,
      buyTotal: 0,
      sellTotal: 0,
      estimatedCost: 0
    };

    // Process target allocation
    for (const [symbol, targetWeight] of Object.entries(targetAllocation)) {
      if (symbol === 'CASH') continue;

      const current = currentAllocation[symbol] || { shares: 0, price: 0, value: 0, weight: 0 };
      const targetValue = (targetWeight / 100) * totalValue;
      const currentValue = current.value;
      const drift = targetValue - currentValue;
      const driftPercent = Math.abs(drift) / totalValue * 100;

      // Only trade if drift exceeds threshold and trade amount is significant
      if (driftPercent > this.rebalanceThreshold && Math.abs(drift) > this.minTradeAmount) {
        const price = current.price || await this.getPrice(symbol);
        const sharesToTrade = Math.abs(drift) / price;

        trades.push({
          symbol,
          action: drift > 0 ? 'buy' : 'sell',
          currentWeight: current.weight,
          targetWeight,
          drift: driftPercent,
          currentValue,
          targetValue,
          tradeAmount: Math.abs(drift),
          shares: Math.round(sharesToTrade * 1000) / 1000,
          price,
          estimatedCommission: 0
        });

        if (drift > 0) {
          summary.buyTotal += Math.abs(drift);
        } else {
          summary.sellTotal += Math.abs(drift);
        }
        summary.tradesCount++;
      }
    }

    // Check for positions to sell (not in target)
    for (const [symbol, current] of Object.entries(currentAllocation)) {
      if (!targetAllocation[symbol] && current.value > this.minTradeAmount) {
        trades.push({
          symbol,
          action: 'sell',
          currentWeight: current.weight,
          targetWeight: 0,
          drift: current.weight,
          currentValue: current.value,
          targetValue: 0,
          tradeAmount: current.value,
          shares: current.shares,
          price: current.price,
          estimatedCommission: 0,
          reason: 'Not in target allocation'
        });
        summary.sellTotal += current.value;
        summary.tradesCount++;
      }
    }

    // Sort: sells first, then buys
    trades.sort((a, b) => {
      if (a.action === 'sell' && b.action === 'buy') return -1;
      if (a.action === 'buy' && b.action === 'sell') return 1;
      return b.tradeAmount - a.tradeAmount;
    });

    return {
      portfolioId,
      portfolioName: portfolio.name,
      currentValue: totalValue,
      cashBalance: portfolio.cashBalance,
      trades,
      summary: {
        ...summary,
        netCashFlow: summary.sellTotal - summary.buyTotal,
        cashAfterRebalance: portfolio.cashBalance + summary.sellTotal - summary.buyTotal
      },
      allocationBefore: this.formatAllocation(currentAllocation, cashWeight),
      allocationAfter: this.calculatePostRebalanceAllocation(trades, currentAllocation, totalValue, portfolio.cashBalance)
    };
  }

  /**
   * Calculate optimal portfolio using mean-variance optimization
   */
  async optimizePortfolio(symbols, constraints = {}) {
    const {
      targetReturn = null,
      maxVolatility = null,
      maxWeight = 0.3,
      minWeight = 0.02,
      riskFreeRate = 0.05
    } = constraints;

    // Get historical returns for each symbol (simplified - would use real data)
    const assetData = await Promise.all(
      symbols.map(async symbol => {
        const data = await this.getAssetMetrics(symbol);
        return { symbol, ...data };
      })
    );

    // Simple equal-risk contribution approach
    const totalInverseVol = assetData.reduce((sum, a) => sum + (1 / a.volatility), 0);
    const weights = {};
    
    assetData.forEach(asset => {
      let weight = (1 / asset.volatility) / totalInverseVol;
      weight = Math.max(minWeight, Math.min(maxWeight, weight));
      weights[asset.symbol] = weight;
    });

    // Normalize weights to sum to 1
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    Object.keys(weights).forEach(symbol => {
      weights[symbol] = (weights[symbol] / totalWeight) * 100;
    });

    // Calculate portfolio metrics
    const portfolioReturn = assetData.reduce((sum, a) => sum + (weights[a.symbol] / 100) * a.expectedReturn, 0);
    const portfolioVolatility = this.calculatePortfolioVolatility(assetData, weights);
    const sharpeRatio = (portfolioReturn - riskFreeRate) / portfolioVolatility;

    return {
      optimizedWeights: weights,
      metrics: {
        expectedReturn: portfolioReturn * 100,
        volatility: portfolioVolatility * 100,
        sharpeRatio,
        diversificationRatio: this.calculateDiversificationRatio(assetData, weights)
      },
      assets: assetData.map(a => ({
        symbol: a.symbol,
        weight: weights[a.symbol],
        expectedReturn: a.expectedReturn * 100,
        volatility: a.volatility * 100
      })),
      constraints: {
        maxWeight: maxWeight * 100,
        minWeight: minWeight * 100,
        targetReturn,
        maxVolatility
      }
    };
  }

  /**
   * Get model portfolios
   */
  getModelPortfolios() {
    return [
      {
        id: 'conservative',
        name: 'Conservative',
        description: 'Lower risk, stable returns focused on income',
        targetReturn: 5,
        targetVolatility: 8,
        allocation: {
          'BND': 40,
          'VTI': 25,
          'VXUS': 10,
          'VNQ': 5,
          'CASH': 20
        },
        riskLevel: 'low'
      },
      {
        id: 'moderate',
        name: 'Moderate',
        description: 'Balanced growth and income',
        targetReturn: 7,
        targetVolatility: 12,
        allocation: {
          'VTI': 40,
          'VXUS': 20,
          'BND': 25,
          'VNQ': 10,
          'CASH': 5
        },
        riskLevel: 'medium'
      },
      {
        id: 'growth',
        name: 'Growth',
        description: 'Higher returns with more volatility',
        targetReturn: 9,
        targetVolatility: 16,
        allocation: {
          'VTI': 50,
          'VXUS': 25,
          'VGT': 10,
          'BND': 10,
          'CASH': 5
        },
        riskLevel: 'medium-high'
      },
      {
        id: 'aggressive',
        name: 'Aggressive Growth',
        description: 'Maximum growth potential',
        targetReturn: 11,
        targetVolatility: 22,
        allocation: {
          'VTI': 45,
          'VXUS': 25,
          'VGT': 15,
          'ARKK': 10,
          'CASH': 5
        },
        riskLevel: 'high'
      },
      {
        id: 'dividend',
        name: 'Dividend Focus',
        description: 'Income-generating dividend stocks',
        targetReturn: 6,
        targetVolatility: 12,
        allocation: {
          'VYM': 30,
          'SCHD': 25,
          'VIG': 20,
          'BND': 15,
          'CASH': 10
        },
        riskLevel: 'medium'
      },
      {
        id: 'allweather',
        name: 'All Weather',
        description: 'Ray Dalio inspired all-weather strategy',
        targetReturn: 6,
        targetVolatility: 8,
        allocation: {
          'VTI': 30,
          'TLT': 40,
          'GLD': 7.5,
          'DBC': 7.5,
          'BND': 15
        },
        riskLevel: 'low'
      }
    ];
  }

  /**
   * Apply model portfolio to existing portfolio
   */
  async applyModelPortfolio(portfolioId, userId, modelId) {
    const models = this.getModelPortfolios();
    const model = models.find(m => m.id === modelId);

    if (!model) {
      throw new Error('Model portfolio not found');
    }

    return this.calculateRebalanceTrades(portfolioId, userId, model.allocation);
  }

  /**
   * Calculate drift from target allocation
   */
  async calculateDrift(portfolioId, userId, targetAllocation) {
    const portfolio = await db.portfolios.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const holdings = portfolio.holdings || [];
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0) + (portfolio.cashBalance || 0);

    const drifts = [];
    let maxDrift = 0;
    let totalDrift = 0;

    // Calculate drift for each target position
    for (const [symbol, targetWeight] of Object.entries(targetAllocation)) {
      const holding = holdings.find(h => h.symbol === symbol);
      const currentWeight = holding 
        ? ((holding.marketValue || 0) / totalValue) * 100 
        : 0;
      const drift = Math.abs(currentWeight - targetWeight);

      drifts.push({
        symbol,
        currentWeight,
        targetWeight,
        drift,
        action: currentWeight > targetWeight ? 'overweight' : currentWeight < targetWeight ? 'underweight' : 'on-target'
      });

      maxDrift = Math.max(maxDrift, drift);
      totalDrift += drift;
    }

    // Check for positions not in target
    holdings.forEach(h => {
      if (!targetAllocation[h.symbol]) {
        const currentWeight = ((h.marketValue || 0) / totalValue) * 100;
        drifts.push({
          symbol: h.symbol,
          currentWeight,
          targetWeight: 0,
          drift: currentWeight,
          action: 'not-in-target'
        });
        maxDrift = Math.max(maxDrift, currentWeight);
        totalDrift += currentWeight;
      }
    });

    const needsRebalance = maxDrift > this.rebalanceThreshold * 100;

    return {
      portfolioId,
      totalValue,
      drifts: drifts.sort((a, b) => b.drift - a.drift),
      summary: {
        maxDrift,
        averageDrift: totalDrift / drifts.length,
        needsRebalance,
        rebalanceThreshold: this.rebalanceThreshold * 100,
        positionsOverweight: drifts.filter(d => d.action === 'overweight').length,
        positionsUnderweight: drifts.filter(d => d.action === 'underweight').length,
        positionsOnTarget: drifts.filter(d => d.action === 'on-target').length,
        positionsNotInTarget: drifts.filter(d => d.action === 'not-in-target').length
      }
    };
  }

  /**
   * Generate rebalancing schedule
   */
  generateRebalanceSchedule(strategy = 'threshold') {
    const schedules = {
      calendar: {
        name: 'Calendar Rebalancing',
        description: 'Rebalance on a fixed schedule',
        options: [
          { interval: 'monthly', description: 'Every month' },
          { interval: 'quarterly', description: 'Every 3 months' },
          { interval: 'semi-annually', description: 'Every 6 months' },
          { interval: 'annually', description: 'Once per year' }
        ]
      },
      threshold: {
        name: 'Threshold Rebalancing',
        description: 'Rebalance when drift exceeds threshold',
        options: [
          { threshold: 3, description: '3% drift trigger' },
          { threshold: 5, description: '5% drift trigger (recommended)' },
          { threshold: 10, description: '10% drift trigger' }
        ]
      },
      hybrid: {
        name: 'Hybrid Rebalancing',
        description: 'Combine calendar and threshold approaches',
        options: [
          { interval: 'quarterly', threshold: 10, description: 'Quarterly with 10% threshold check' },
          { interval: 'monthly', threshold: 5, description: 'Monthly with 5% threshold check' }
        ]
      },
      tactical: {
        name: 'Tactical Rebalancing',
        description: 'Rebalance based on market conditions',
        options: [
          { trigger: 'volatility', description: 'Rebalance when VIX spikes' },
          { trigger: 'momentum', description: 'Rebalance based on momentum signals' }
        ]
      }
    };

    return schedules[strategy] || schedules.threshold;
  }

  // Helper methods

  async getPrice(symbol) {
    // Would fetch from market data service
    return 100; // Placeholder
  }

  async getAssetMetrics(symbol) {
    // Simplified - would use real historical data
    const metrics = {
      'VTI': { expectedReturn: 0.10, volatility: 0.15 },
      'VXUS': { expectedReturn: 0.08, volatility: 0.17 },
      'BND': { expectedReturn: 0.04, volatility: 0.05 },
      'VNQ': { expectedReturn: 0.09, volatility: 0.18 },
      'VGT': { expectedReturn: 0.12, volatility: 0.20 },
      'VYM': { expectedReturn: 0.08, volatility: 0.13 },
      'SCHD': { expectedReturn: 0.09, volatility: 0.14 },
      'TLT': { expectedReturn: 0.05, volatility: 0.12 },
      'GLD': { expectedReturn: 0.06, volatility: 0.15 },
      'DBC': { expectedReturn: 0.05, volatility: 0.18 }
    };
    return metrics[symbol] || { expectedReturn: 0.08, volatility: 0.15 };
  }

  calculatePortfolioVolatility(assets, weights) {
    // Simplified - assumes 0.5 correlation between all assets
    const correlation = 0.5;
    let variance = 0;

    assets.forEach((a, i) => {
      const wi = weights[a.symbol] / 100;
      variance += wi * wi * a.volatility * a.volatility;
      
      assets.forEach((b, j) => {
        if (i !== j) {
          const wj = weights[b.symbol] / 100;
          variance += wi * wj * a.volatility * b.volatility * correlation;
        }
      });
    });

    return Math.sqrt(variance);
  }

  calculateDiversificationRatio(assets, weights) {
    const weightedAvgVol = assets.reduce((sum, a) => 
      sum + (weights[a.symbol] / 100) * a.volatility, 0
    );
    const portfolioVol = this.calculatePortfolioVolatility(assets, weights);
    return weightedAvgVol / portfolioVol;
  }

  formatAllocation(allocation, cashWeight) {
    const formatted = Object.entries(allocation).map(([symbol, data]) => ({
      symbol,
      weight: data.weight,
      value: data.value
    }));
    
    formatted.push({ symbol: 'CASH', weight: cashWeight, value: 0 });
    return formatted.sort((a, b) => b.weight - a.weight);
  }

  calculatePostRebalanceAllocation(trades, currentAllocation, totalValue, cashBalance) {
    const newAllocation = { ...currentAllocation };
    let newCash = cashBalance;

    trades.forEach(trade => {
      if (trade.action === 'buy') {
        if (!newAllocation[trade.symbol]) {
          newAllocation[trade.symbol] = { shares: 0, price: trade.price, value: 0, weight: 0 };
        }
        newAllocation[trade.symbol].shares += trade.shares;
        newAllocation[trade.symbol].value += trade.tradeAmount;
        newCash -= trade.tradeAmount;
      } else {
        if (newAllocation[trade.symbol]) {
          newAllocation[trade.symbol].shares -= trade.shares;
          newAllocation[trade.symbol].value -= trade.tradeAmount;
          newCash += trade.tradeAmount;
        }
      }
    });

    // Recalculate weights
    Object.keys(newAllocation).forEach(symbol => {
      newAllocation[symbol].weight = (newAllocation[symbol].value / totalValue) * 100;
    });

    const cashWeight = (newCash / totalValue) * 100;
    return this.formatAllocation(newAllocation, cashWeight);
  }
}

module.exports = new PortfolioOptimizationService();
