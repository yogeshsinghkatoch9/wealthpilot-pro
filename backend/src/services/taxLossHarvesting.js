const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const etfAlternatives = require('./etfAlternatives');
const { v4: uuidv4 } = require('uuid');

/**
 * Tax Loss Harvesting Service
 * Identifies opportunities to realize losses for tax benefits
 * Enhanced with ETF alternatives and wash sale tracking
 */
class TaxLossHarvestingService {
  constructor() {
    this.defaultTaxRates = {
      shortTerm: 0.37,   // Ordinary income rate
      longTerm: 0.20,    // Long-term capital gains
      stateRate: 0.05    // Average state rate
    };
    this.tablesInitialized = false;
  }

  /**
   * Initialize tax harvesting tables if they don't exist
   */
  async initializeTables() {
    if (this.tablesInitialized) return;

    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_tax_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID UNIQUE NOT NULL,
          federal_tax_bracket DECIMAL DEFAULT 32,
          state VARCHAR(50),
          state_tax_rate DECIMAL DEFAULT 0,
          default_lot_method VARCHAR(50) DEFAULT 'tax_efficient',
          min_harvest_threshold DECIMAL DEFAULT 100,
          auto_harvest_enabled BOOLEAN DEFAULT FALSE,
          short_term_rate DECIMAL DEFAULT 37,
          long_term_rate DECIMAL DEFAULT 20,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS wash_sale_tracking (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          portfolio_id UUID NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          sale_date TIMESTAMP NOT NULL,
          shares_sold DECIMAL NOT NULL,
          sale_price DECIMAL NOT NULL,
          cost_basis DECIMAL NOT NULL,
          realized_loss DECIMAL NOT NULL,
          wash_sale_window_start TIMESTAMP NOT NULL,
          wash_sale_window_end TIMESTAMP NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          disallowed_loss DECIMAL DEFAULT 0,
          replacement_symbol VARCHAR(20),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tax_loss_carryforward (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          tax_year INTEGER NOT NULL,
          short_term_loss DECIMAL DEFAULT 0,
          long_term_loss DECIMAL DEFAULT 0,
          used_against_gains DECIMAL DEFAULT 0,
          used_against_income DECIMAL DEFAULT 0,
          remaining_balance DECIMAL DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, tax_year)
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tax_harvest_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          portfolio_id UUID NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          shares_sold DECIMAL NOT NULL,
          sale_price DECIMAL NOT NULL,
          cost_basis DECIMAL NOT NULL,
          realized_loss DECIMAL NOT NULL,
          tax_savings DECIMAL NOT NULL,
          holding_period VARCHAR(20) NOT NULL,
          lot_method VARCHAR(50),
          replacement_symbol VARCHAR(20),
          replacement_shares DECIMAL,
          replacement_price DECIMAL,
          wash_sale_safe BOOLEAN DEFAULT TRUE,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tax_lots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id UUID NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          purchase_date TIMESTAMP NOT NULL,
          shares DECIMAL NOT NULL,
          cost_per_share DECIMAL NOT NULL,
          total_cost DECIMAL NOT NULL,
          lot_method VARCHAR(50) DEFAULT 'fifo',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      this.tablesInitialized = true;
      logger.info('Tax harvesting tables initialized');
    } catch (error) {
      logger.warn('Tax tables init (may already exist):', error.message);
      this.tablesInitialized = true; // Continue anyway
    }
  }
  /**
   * Find tax loss harvesting opportunities
   * @param {string} portfolioId - Portfolio ID
   * @param {number} minLossThreshold - Minimum loss % to consider (default 5%)
   * @returns {object} Tax loss harvesting opportunities
   */
  async findOpportunities(portfolioId, minLossThreshold = 5) {
    try {
      const portfolio = await prisma.portfolios.findUnique({
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

      const transactions = await prisma.transactions.findMany({
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
      const holding = await prisma.holdings.findUnique({
        where: { portfolioId_symbol: { portfolioId, symbol } }
      });

      if (!holding) throw new Error('Holding not found');

      const quote = await prisma.stockQuote.findUnique({ where: { symbol } });
      const currentPrice = quote?.price || holding.avgCostBasis;

      // Create sell transaction
      const sellTx = await prisma.transactions.create({
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
      await prisma.holdings.delete({ where: { id: holding.id } });

      // If replacement specified, buy it
      let buyTx = null;
      if (replaceWith) {
        const replaceQuote = await prisma.stockQuote.findUnique({ where: { symbol: replaceWith } });
        const replacePrice = replaceQuote?.price || currentPrice;
        const replaceShares = (holding.shares * currentPrice) / replacePrice;

        buyTx = await prisma.transactions.create({
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
        await prisma.holdings.create({
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

    const recentBuys = await prisma.transactions.findMany({
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

  // ==================== ENHANCED METHODS ====================

  /**
   * Find opportunities with ETF alternatives (enhanced)
   */
  async findOpportunitiesWithETFs(portfolioId, userId, minLossThreshold = 5) {
    try {
      // Get user's tax preferences
      const taxPrefs = await this.getUserTaxPreferences(userId);
      const effectiveThreshold = taxPrefs?.min_harvest_threshold || minLossThreshold;
      const federalRate = (taxPrefs?.federal_tax_bracket || 32) / 100;
      const stateRate = (taxPrefs?.state_tax_rate || 0) / 100;
      const combinedRate = federalRate + stateRate;

      // Get base opportunities
      const baseOpportunities = await this.findOpportunities(portfolioId, effectiveThreshold);

      // Get active wash sale windows
      const washSaleWindows = await this.getWashSaleWindows(userId, portfolioId);
      const washSaleSymbols = new Set(
        (washSaleWindows || []).filter(ws => ws.status === 'active').map(ws => ws.symbol)
      );

      // Enhance each opportunity with ETF alternatives
      const enhancedOpportunities = await Promise.all(
        baseOpportunities.opportunities.map(async (opp) => {
          // Get ETF alternatives
          const etfAlts = await etfAlternatives.getAlternatives(opp.symbol, opp.sector);

          // Check wash sale window status
          const inWashSaleWindow = washSaleSymbols.has(opp.symbol);

          // Calculate tax savings with user's actual rates
          const holdingPeriod = await this.determineHoldingPeriod(opp.symbol, portfolioId);
          const effectiveRate = holdingPeriod === 'long-term'
            ? (taxPrefs?.long_term_rate || 20) / 100
            : (taxPrefs?.short_term_rate || 37) / 100;
          const taxSavings = opp.unrealizedLoss * (effectiveRate + stateRate);

          // Get wash sale safe recommendation
          const recommendation = await etfAlternatives.recommendReplacement(
            opp.symbol,
            opp.sector,
            Array.from(washSaleSymbols)
          );

          return {
            ...opp,
            holdingPeriod,
            taxSavings,
            effectiveTaxRate: effectiveRate + stateRate,
            inWashSaleWindow,
            washSaleWarning: inWashSaleWindow
              ? 'Cannot harvest - wash sale window active'
              : null,
            etfAlternatives: {
              recommended: etfAlts.recommended,
              sectorETF: etfAlts.sectorETF,
              thematicETFs: etfAlts.thematicETFs.slice(0, 3),
              allOptions: etfAlts.allAlternatives.slice(0, 5),
              washSaleSafe: !inWashSaleWindow
            },
            bestReplacement: recommendation
          };
        })
      );

      // Calculate enhanced summary
      const totalTaxSavings = enhancedOpportunities.reduce(
        (sum, o) => sum + o.taxSavings, 0
      );
      const washSafeOpportunities = enhancedOpportunities.filter(
        o => !o.inWashSaleWindow
      );

      // Get carryforward balance
      const carryforward = await this.getCarryforwardBalance(userId);

      return {
        opportunities: enhancedOpportunities.sort((a, b) => b.taxSavings - a.taxSavings),
        summary: {
          ...baseOpportunities.summary,
          totalTaxSavings,
          washSafeCount: washSafeOpportunities.length,
          washSafeValue: washSafeOpportunities.reduce((s, o) => s + o.unrealizedLoss, 0),
          userTaxBracket: taxPrefs?.federal_tax_bracket || 32,
          userState: taxPrefs?.state || null
        },
        userPreferences: taxPrefs,
        carryforward
      };
    } catch (error) {
      logger.error('Enhanced opportunities error:', error);
      throw error;
    }
  }

  /**
   * Determine holding period for a symbol
   */
  async determineHoldingPeriod(symbol, portfolioId) {
    try {
      const lots = await prisma.$queryRaw`
        SELECT purchase_date FROM tax_lots
        WHERE portfolio_id = ${portfolioId} AND symbol = ${symbol}
        ORDER BY purchase_date ASC
        LIMIT 1
      `;

      if (lots && lots.length > 0) {
        const purchaseDate = new Date(lots[0].purchase_date);
        const daysSince = Math.floor((Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysSince > 365 ? 'long-term' : 'short-term';
      }

      return 'short-term'; // Default to short-term if no data
    } catch (error) {
      return 'short-term';
    }
  }

  /**
   * Get user's tax preferences
   */
  async getUserTaxPreferences(userId) {
    try {
      await this.initializeTables();
      const prefs = await prisma.$queryRaw`
        SELECT * FROM user_tax_preferences WHERE user_id = ${userId}
      `;
      return prefs && prefs.length > 0 ? prefs[0] : null;
    } catch (error) {
      logger.warn('Error getting tax preferences:', error.message);
      return null;
    }
  }

  /**
   * Update user's tax preferences
   */
  async updateUserTaxPreferences(userId, preferences) {
    try {
      const existing = await this.getUserTaxPreferences(userId);

      if (existing) {
        // Update existing preferences
        await prisma.$executeRawUnsafe(`
          UPDATE user_tax_preferences SET
            federal_tax_bracket = COALESCE($1, federal_tax_bracket),
            state = COALESCE($2, state),
            state_tax_rate = COALESCE($3, state_tax_rate),
            default_lot_method = COALESCE($4, default_lot_method),
            min_harvest_threshold = COALESCE($5, min_harvest_threshold),
            auto_harvest_enabled = COALESCE($6, auto_harvest_enabled),
            short_term_rate = COALESCE($7, short_term_rate),
            long_term_rate = COALESCE($8, long_term_rate),
            updated_at = NOW()
          WHERE user_id = $9
        `,
          preferences.federal_tax_bracket ?? null,
          preferences.state ?? null,
          preferences.state_tax_rate ?? null,
          preferences.default_lot_method ?? null,
          preferences.min_harvest_threshold ?? null,
          preferences.auto_harvest_enabled ?? null,
          preferences.short_term_rate ?? null,
          preferences.long_term_rate ?? null,
          userId
        );
      } else {
        const id = uuidv4();
        await prisma.$executeRawUnsafe(`
          INSERT INTO user_tax_preferences (
            id, user_id, federal_tax_bracket, state, state_tax_rate,
            default_lot_method, min_harvest_threshold, auto_harvest_enabled,
            short_term_rate, long_term_rate, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `,
          id,
          userId,
          preferences.federal_tax_bracket || 32,
          preferences.state || null,
          preferences.state_tax_rate || 0,
          preferences.default_lot_method || 'tax_efficient',
          preferences.min_harvest_threshold || 100,
          preferences.auto_harvest_enabled ? true : false,
          preferences.short_term_rate || 37,
          preferences.long_term_rate || 20
        );
      }

      return await this.getUserTaxPreferences(userId);
    } catch (error) {
      logger.error('Error updating tax preferences:', error);
      throw error;
    }
  }

  /**
   * Record a wash sale tracking entry
   */
  async recordWashSale(userId, portfolioId, saleData) {
    try {
      const id = uuidv4();
      const saleDate = new Date(saleData.saleDate);
      const windowStart = new Date(saleDate);
      windowStart.setDate(windowStart.getDate() - 30);
      const windowEnd = new Date(saleDate);
      windowEnd.setDate(windowEnd.getDate() + 30);

      await prisma.$executeRawUnsafe(`
        INSERT INTO wash_sale_tracking (
          id, user_id, portfolio_id, symbol, sale_date,
          shares_sold, sale_price, cost_basis, realized_loss,
          wash_sale_window_start, wash_sale_window_end, status,
          replacement_symbol, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      `,
        id,
        userId,
        portfolioId,
        saleData.symbol,
        saleDate.toISOString(),
        saleData.sharesSold,
        saleData.salePrice,
        saleData.costBasis,
        saleData.realizedLoss,
        windowStart.toISOString(),
        windowEnd.toISOString(),
        'active',
        saleData.replacementSymbol || null,
        saleData.notes || null
      );

      return { id, windowEnd: windowEnd.toISOString() };
    } catch (error) {
      logger.error('Error recording wash sale:', error);
      throw error;
    }
  }

  /**
   * Get active wash sale windows
   */
  async getWashSaleWindows(userId, portfolioId = null) {
    try {
      const now = new Date().toISOString();

      let windows;
      if (portfolioId) {
        windows = await prisma.$queryRaw`
          SELECT * FROM wash_sale_tracking
          WHERE user_id = ${userId}
            AND wash_sale_window_end >= ${now}
            AND portfolio_id = ${portfolioId}
          ORDER BY wash_sale_window_end ASC
        `;
      } else {
        windows = await prisma.$queryRaw`
          SELECT * FROM wash_sale_tracking
          WHERE user_id = ${userId}
            AND wash_sale_window_end >= ${now}
          ORDER BY wash_sale_window_end ASC
        `;
      }

      // Update status for expired windows
      await prisma.$executeRaw`
        UPDATE wash_sale_tracking
        SET status = 'expired'
        WHERE user_id = ${userId}
          AND wash_sale_window_end < ${now}
          AND status = 'active'
      `;

      return windows || [];
    } catch (error) {
      logger.warn('Error getting wash sale windows:', error.message);
      return [];
    }
  }

  /**
   * Record harvest in history
   */
  async recordHarvestHistory(userId, portfolioId, harvestData) {
    try {
      const id = uuidv4();

      await prisma.$executeRawUnsafe(`
        INSERT INTO tax_harvest_history (
          id, user_id, portfolio_id, symbol, shares_sold,
          sale_price, cost_basis, realized_loss, tax_savings,
          holding_period, lot_method, replacement_symbol,
          replacement_shares, replacement_price, wash_sale_safe, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      `,
        id,
        userId,
        portfolioId,
        harvestData.symbol,
        harvestData.sharesSold,
        harvestData.salePrice,
        harvestData.costBasis,
        harvestData.realizedLoss,
        harvestData.taxSavings,
        harvestData.holdingPeriod || 'short-term',
        harvestData.lotMethod || 'fifo',
        harvestData.replacementSymbol || null,
        harvestData.replacementShares || null,
        harvestData.replacementPrice || null,
        harvestData.washSaleSafe ? true : false
      );

      // Also record wash sale tracking
      await this.recordWashSale(userId, portfolioId, {
        symbol: harvestData.symbol,
        saleDate: new Date().toISOString(),
        sharesSold: harvestData.sharesSold,
        salePrice: harvestData.salePrice,
        costBasis: harvestData.costBasis,
        realizedLoss: harvestData.realizedLoss,
        replacementSymbol: harvestData.replacementSymbol
      });

      return { id, success: true };
    } catch (error) {
      logger.error('Error recording harvest history:', error);
      throw error;
    }
  }

  /**
   * Get harvest history for a user/portfolio
   */
  async getHarvestHistory(userId, portfolioId = null, limit = 50) {
    try {
      let history;
      if (portfolioId) {
        history = await prisma.$queryRaw`
          SELECT * FROM tax_harvest_history
          WHERE user_id = ${userId} AND portfolio_id = ${portfolioId}
          ORDER BY executed_at DESC
          LIMIT ${limit}
        `;
      } else {
        history = await prisma.$queryRaw`
          SELECT * FROM tax_harvest_history
          WHERE user_id = ${userId}
          ORDER BY executed_at DESC
          LIMIT ${limit}
        `;
      }
      return history || [];
    } catch (error) {
      logger.warn('Error getting harvest history:', error.message);
      return [];
    }
  }

  /**
   * Get carryforward balance for a user
   */
  async getCarryforwardBalance(userId) {
    try {
      const carryforwards = await prisma.$queryRaw`
        SELECT * FROM tax_loss_carryforward
        WHERE user_id = ${userId} AND remaining_balance > 0
        ORDER BY tax_year ASC
      `;

      const totalBalance = (carryforwards || []).reduce(
        (sum, cf) => sum + (parseFloat(cf.remaining_balance) || 0), 0
      );

      return {
        totalBalance,
        byYear: carryforwards || [],
        canDeductThisYear: Math.min(totalBalance, 3000) // $3,000 annual limit
      };
    } catch (error) {
      logger.warn('Error getting carryforward:', error.message);
      return { totalBalance: 0, byYear: [], canDeductThisYear: 0 };
    }
  }

  /**
   * Update or create carryforward entry
   */
  async updateCarryforward(userId, taxYear, lossData) {
    try {
      const existing = await prisma.$queryRaw`
        SELECT * FROM tax_loss_carryforward
        WHERE user_id = ${userId} AND tax_year = ${taxYear}
      `;

      if (existing && existing.length > 0) {
        const addShortTerm = lossData.shortTermLoss || 0;
        const addLongTerm = lossData.longTermLoss || 0;
        const addTotal = addShortTerm + addLongTerm;

        await prisma.$executeRaw`
          UPDATE tax_loss_carryforward SET
            short_term_loss = short_term_loss + ${addShortTerm},
            long_term_loss = long_term_loss + ${addLongTerm},
            remaining_balance = remaining_balance + ${addTotal},
            updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
      } else {
        const id = uuidv4();
        const shortTerm = lossData.shortTermLoss || 0;
        const longTerm = lossData.longTermLoss || 0;
        const totalLoss = shortTerm + longTerm;

        await prisma.$executeRawUnsafe(`
          INSERT INTO tax_loss_carryforward (
            id, user_id, tax_year, short_term_loss, long_term_loss,
            remaining_balance, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `,
          id,
          userId,
          taxYear,
          shortTerm,
          longTerm,
          totalLoss,
          lossData.notes || null
        );
      }

      return await this.getCarryforwardBalance(userId);
    } catch (error) {
      logger.error('Error updating carryforward:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive tax dashboard data
   */
  async getTaxDashboard(userId, portfolioId) {
    try {
      const currentYear = new Date().getFullYear();

      // Get opportunities with ETF alternatives
      const opportunities = await this.findOpportunitiesWithETFs(
        portfolioId, userId, 3 // 3% minimum threshold
      );

      // Get year-to-date realized gains/losses
      const ytdReport = await this.generateYearEndReport(portfolioId, currentYear);

      // Get wash sale windows
      const washSaleWindows = await this.getWashSaleWindows(userId, portfolioId);

      // Get harvest history
      const harvestHistory = await this.getHarvestHistory(userId, portfolioId, 10);

      // Get carryforward
      const carryforward = await this.getCarryforwardBalance(userId);

      // Get user preferences
      const preferences = await this.getUserTaxPreferences(userId);

      // Calculate summary metrics
      const totalAvailableLosses = opportunities.summary.totalPotentialLoss || 0;
      const washSafeOpportunities = (opportunities.opportunities || []).filter(
        o => !o.inWashSaleWindow
      );
      const harvestedThisYear = (harvestHistory || [])
        .filter(h => new Date(h.executed_at).getFullYear() === currentYear)
        .reduce((sum, h) => sum + parseFloat(h.realized_loss || 0), 0);

      return {
        summary: {
          totalAvailableLosses,
          totalTaxSavings: opportunities.summary.totalTaxSavings || 0,
          washSafeOpportunities: washSafeOpportunities.length,
          washSafeValue: washSafeOpportunities.reduce((s, o) => s + o.unrealizedLoss, 0),
          ytdRealizedGains: ytdReport.realizedGains,
          ytdRealizedLosses: ytdReport.realizedLosses,
          harvestedThisYear,
          carryforwardBalance: carryforward.totalBalance,
          netTaxPosition: ytdReport.netGainLoss
        },
        opportunities: (opportunities.opportunities || []).slice(0, 10), // Top 10
        washSaleWindows: (washSaleWindows || []).slice(0, 5),
        recentHarvests: (harvestHistory || []).slice(0, 5),
        carryforward,
        preferences,
        recommendations: this.generateDashboardRecommendations(
          opportunities,
          ytdReport,
          carryforward
        )
      };
    } catch (error) {
      logger.error('Tax dashboard error:', error);
      throw error;
    }
  }

  /**
   * Generate dashboard recommendations
   */
  generateDashboardRecommendations(opportunities, ytdReport, carryforward) {
    const recs = [];
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    const daysToYearEnd = Math.ceil((yearEnd - now) / (1000 * 60 * 60 * 24));

    // Year-end urgency
    if (daysToYearEnd <= 30 && opportunities.summary.totalTaxSavings > 500) {
      recs.push({
        type: 'year_end_urgency',
        priority: 'high',
        message: `${daysToYearEnd} days until year-end. $${opportunities.summary.totalTaxSavings.toFixed(0)} in potential tax savings available.`,
        action: 'Review opportunities now'
      });
    }

    // Offset gains
    if (ytdReport.realizedGains > 0 && opportunities.opportunities.length > 0) {
      recs.push({
        type: 'offset_gains',
        priority: 'high',
        message: `You have $${ytdReport.realizedGains.toFixed(0)} in realized gains. Harvest losses to offset.`,
        action: 'View harvest opportunities'
      });
    }

    // High-value opportunities
    const highValue = opportunities.opportunities.filter(o => o.taxSavings > 1000);
    if (highValue.length > 0) {
      recs.push({
        type: 'high_value',
        priority: 'medium',
        message: `${highValue.length} positions with >$1,000 tax savings potential.`,
        action: 'Review high-value opportunities'
      });
    }

    // Carryforward usage
    if (carryforward.totalBalance > 0) {
      recs.push({
        type: 'carryforward',
        priority: 'medium',
        message: `$${carryforward.totalBalance.toFixed(0)} in loss carryforward available. Can deduct up to $3,000 against income.`,
        action: 'View carryforward details'
      });
    }

    return recs;
  }

  /**
   * Preview harvest execution (dry run)
   */
  async previewHarvest(portfolioId, userId, symbol, replacementSymbol = null) {
    try {
      // Get current holding info
      const holding = await prisma.holdings.findFirst({
        where: { portfolioId, symbol }
      });

      if (!holding) {
        throw new Error('Holding not found');
      }

      // Get current price
      const quote = await prisma.stockQuote.findUnique({ where: { symbol } });
      const currentPrice = quote?.price || holding.avgCostBasis;

      // Get user preferences
      const taxPrefs = await this.getUserTaxPreferences(userId);

      // Calculate values
      const costBasis = holding.shares * holding.avgCostBasis;
      const currentValue = holding.shares * currentPrice;
      const realizedLoss = costBasis - currentValue;

      // Determine holding period
      const holdingPeriod = await this.determineHoldingPeriod(symbol, portfolioId);

      // Calculate tax savings
      const effectiveRate = holdingPeriod === 'long-term'
        ? (taxPrefs?.long_term_rate || 20) / 100
        : (taxPrefs?.short_term_rate || 37) / 100;
      const stateRate = (taxPrefs?.state_tax_rate || 0) / 100;
      const taxSavings = realizedLoss * (effectiveRate + stateRate);

      // Get replacement info if specified
      let replacementInfo = null;
      if (replacementSymbol) {
        const replaceQuote = await prisma.stockQuote.findUnique({
          where: { symbol: replacementSymbol }
        });
        const replacePrice = replaceQuote?.price || currentPrice;
        const replaceShares = currentValue / replacePrice;

        // Check wash sale risk
        const washSaleCheck = await etfAlternatives.checkWashSaleRisk(
          symbol, replacementSymbol
        );

        replacementInfo = {
          symbol: replacementSymbol,
          price: replacePrice,
          shares: replaceShares,
          totalValue: currentValue,
          washSaleRisk: washSaleCheck
        };
      }

      // Check if in wash sale window
      const washSaleWindows = await this.getWashSaleWindows(userId, portfolioId);
      const inWashSaleWindow = (washSaleWindows || []).some(
        ws => ws.symbol === symbol && ws.status === 'active'
      );

      return {
        canExecute: !inWashSaleWindow && realizedLoss > 0,
        holding: {
          symbol,
          shares: holding.shares,
          costBasis: holding.avgCostBasis,
          totalCostBasis: costBasis,
          currentPrice,
          currentValue,
          holdingPeriod
        },
        harvest: {
          realizedLoss,
          taxSavings,
          effectiveTaxRate: (effectiveRate + stateRate) * 100
        },
        replacement: replacementInfo,
        warnings: inWashSaleWindow
          ? ['Position is in wash sale window - harvest not recommended']
          : [],
        recommendations: realizedLoss > 0
          ? await etfAlternatives.recommendReplacement(symbol, holding.sector)
          : null
      };
    } catch (error) {
      logger.error('Preview harvest error:', error);
      throw error;
    }
  }
}

module.exports = new TaxLossHarvestingService();
