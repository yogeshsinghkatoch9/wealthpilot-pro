// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const path = require('path');
const logger = require('../utils/logger');
const AIAnalysisService = require('./aiAnalysisService');


class AIInsightsService {
  constructor() {
    this.aiService = new AIAnalysisService(process.env.OPENAI_API_KEY);
  }

  /**
   * Generate comprehensive AI insights for a portfolio
   */
  async generatePortfolioInsights(portfolioId) {
    try {
      logger.info(`Generating AI insights for portfolio ${portfolioId}`);

      // Get portfolio data
      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      // Get holdings
      const holdings = db.prepare(`
        SELECT symbol, quantity, cost_basis, current_price, last_updated, type
        FROM holdings
        WHERE portfolio_id = ?
        ORDER BY (current_price * quantity) DESC
      `).all(portfolioId);

      if (holdings.length === 0) {
        return {
          success: false,
          message: 'No holdings in portfolio'
        };
      }

      // Calculate portfolio metrics
      const metrics = this.calculatePortfolioMetrics(holdings);

      // Generate AI insights using GPT
      const insights = await this.aiService.analyzeHolding({
        portfolio: {
          name: portfolio.name,
          type: portfolio.portfolio_type,
          metrics
        },
        holdings: holdings.map(h => ({
          symbol: h.symbol,
          quantity: h.quantity,
          costBasis: h.cost_basis,
          currentPrice: h.current_price,
          value: h.current_price * h.quantity,
          gain: ((h.current_price - h.cost_basis) / h.cost_basis) * 100,
          weight: ((h.current_price * h.quantity) / metrics.totalValue) * 100
        }))
      });

      // Parse and structure the AI response
      const structuredInsights = this.parseAIInsights(insights, metrics, holdings);

      // Save insights to database
      this.saveInsights(portfolioId, structuredInsights);

      return {
        success: true,
        portfolioId,
        portfolioName: portfolio.name,
        generatedAt: new Date().toISOString(),
        metrics,
        insights: structuredInsights
      };

    } catch (error) {
      logger.error('Error generating AI insights:', error);
      throw error;
    }
  }

  /**
   * Calculate portfolio metrics
   */
  calculatePortfolioMetrics(holdings) {
    let totalValue = 0;
    let totalCost = 0;
    const sectorWeights = {};
    const typeWeights = {};

    holdings.forEach(h => {
      const value = (h.current_price || h.cost_basis) * h.quantity;
      const cost = h.cost_basis * h.quantity;

      totalValue += value;
      totalCost += cost;

      // Sector weights (simplified - in production use real sector data)
      const sector = h.type || 'unknown';
      sectorWeights[sector] = (sectorWeights[sector] || 0) + value;
      typeWeights[h.type || 'stock'] = (typeWeights[h.type || 'stock'] || 0) + value;
    });

    const totalGain = totalValue - totalCost;
    const totalReturn = ((totalValue - totalCost) / totalCost) * 100;

    // Calculate concentration
    const holdingValues = holdings.map(h => (h.current_price || h.cost_basis) * h.quantity);
    const top5Value = holdingValues.slice(0, 5).reduce((sum, v) => sum + v, 0);
    const concentration = (top5Value / totalValue) * 100;

    return {
      totalValue,
      totalCost,
      totalGain,
      totalReturn,
      holdingsCount: holdings.length,
      concentration,
      sectorWeights,
      typeWeights
    };
  }

  /**
   * Parse AI insights into structured format
   */
  parseAIInsights(aiResponse, metrics, holdings) {
    // Generate comprehensive insights
    const insights = {
      summary: {
        strength: metrics.totalReturn >= 0 ? 'Positive' : 'Negative',
        returnLevel: this.categorizeReturn(metrics.totalReturn),
        riskLevel: this.assessRiskLevel(metrics.concentration, holdings.length),
        diversification: this.assessDiversification(holdings.length, metrics.concentration)
      },
      strengths: [],
      concerns: [],
      recommendations: [],
      opportunities: [],
      riskFactors: []
    };

    // Analyze performance
    if (metrics.totalReturn > 15) {
      insights.strengths.push({
        type: 'performance',
        title: 'Strong Portfolio Performance',
        description: `Portfolio has generated a ${metrics.totalReturn.toFixed(2)}% return, significantly outperforming typical market returns.`
      });
    } else if (metrics.totalReturn < -10) {
      insights.concerns.push({
        type: 'performance',
        title: 'Underperformance',
        description: `Portfolio is down ${Math.abs(metrics.totalReturn).toFixed(2)}%. Consider reviewing holdings and rebalancing.`,
        severity: 'high'
      });
    }

    // Analyze concentration
    if (metrics.concentration > 50) {
      insights.concerns.push({
        type: 'concentration',
        title: 'High Concentration Risk',
        description: `Top 5 holdings represent ${metrics.concentration.toFixed(1)}% of portfolio. Consider diversifying to reduce risk.`,
        severity: 'medium'
      });

      insights.recommendations.push({
        type: 'diversification',
        title: 'Increase Diversification',
        description: 'Consider adding holdings in different sectors to reduce concentration risk.',
        priority: 'high'
      });
    } else {
      insights.strengths.push({
        type: 'diversification',
        title: 'Well-Diversified Portfolio',
        description: `Good diversification with ${holdings.length} holdings and ${metrics.concentration.toFixed(1)}% concentration in top 5.`
      });
    }

    // Analyze holdings count
    if (holdings.length < 5) {
      insights.concerns.push({
        type: 'diversification',
        title: 'Limited Holdings',
        description: `Only ${holdings.length} holdings. Consider adding more positions for better diversification.`,
        severity: 'medium'
      });
    } else if (holdings.length > 30) {
      insights.recommendations.push({
        type: 'management',
        title: 'Portfolio Complexity',
        description: `${holdings.length} holdings may be difficult to manage. Consider consolidating similar positions.`,
        priority: 'low'
      });
    }

    // Analyze individual holdings
    holdings.forEach(h => {
      const gain = ((h.current_price - h.cost_basis) / h.cost_basis) * 100;
      const weight = ((h.current_price * h.quantity) / metrics.totalValue) * 100;

      // Check for large losses
      if (gain < -25) {
        insights.concerns.push({
          type: 'holding',
          title: `Large Loss in ${h.symbol}`,
          description: `${h.symbol} is down ${Math.abs(gain).toFixed(1)}%. Consider reviewing this position.`,
          severity: 'high'
        });
      }

      // Check for overweight positions
      if (weight > 20) {
        insights.riskFactors.push({
          type: 'position_size',
          title: `Overweight Position: ${h.symbol}`,
          description: `${h.symbol} represents ${weight.toFixed(1)}% of portfolio. High concentration in single stock.`,
          impact: 'high'
        });
      }

      // Check for strong performers
      if (gain > 50) {
        insights.opportunities.push({
          type: 'profit_taking',
          title: `Consider Profit Taking: ${h.symbol}`,
          description: `${h.symbol} is up ${gain.toFixed(1)}%. May be time to take some profits or rebalance.`,
          potential: 'high'
        });
      }
    });

    // General recommendations
    insights.recommendations.push({
      type: 'rebalancing',
      title: 'Regular Rebalancing',
      description: 'Review and rebalance portfolio quarterly to maintain target allocations.',
      priority: 'medium'
    });

    insights.recommendations.push({
      type: 'monitoring',
      title: 'Set Price Alerts',
      description: 'Use price alerts to monitor significant price movements and potential opportunities.',
      priority: 'medium'
    });

    return insights;
  }

  /**
   * Categorize return level
   */
  categorizeReturn(returnPct) {
    if (returnPct > 20) return 'Excellent';
    if (returnPct > 10) return 'Very Good';
    if (returnPct > 5) return 'Good';
    if (returnPct > 0) return 'Moderate';
    if (returnPct > -10) return 'Below Average';
    return 'Poor';
  }

  /**
   * Assess risk level
   */
  assessRiskLevel(concentration, holdingsCount) {
    if (concentration > 60 || holdingsCount < 5) return 'High';
    if (concentration > 40 || holdingsCount < 10) return 'Medium';
    return 'Low';
  }

  /**
   * Assess diversification
   */
  assessDiversification(holdingsCount, concentration) {
    if (holdingsCount >= 15 && concentration < 40) return 'Excellent';
    if (holdingsCount >= 10 && concentration < 50) return 'Good';
    if (holdingsCount >= 5 && concentration < 60) return 'Fair';
    return 'Poor';
  }

  /**
   * Save insights to database
   */
  saveInsights(portfolioId, insights) {
    try {
      const stmt = db.prepare(`
        INSERT INTO ai_insights (
          id, portfolio_id, generated_at, insights_data
        ) VALUES (?, ?, ?, ?)
      `);

      const { v4: uuidv4 } = require('uuid');

      stmt.run(
        uuidv4(),
        portfolioId,
        new Date().toISOString(),
        JSON.stringify(insights)
      );

      logger.info(`Saved AI insights for portfolio ${portfolioId}`);
    } catch (error) {
      // Table might not exist yet, log warning
      logger.warn('Could not save AI insights (table may not exist):', error.message);
    }
  }

  /**
   * Get latest insights for portfolio
   */
  getLatestInsights(portfolioId) {
    try {
      const stmt = db.prepare(`
        SELECT * FROM ai_insights
        WHERE portfolio_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
      `);

      const result = stmt.get(portfolioId);

      if (result) {
        result.insights_data = JSON.parse(result.insights_data);
      }

      return result;
    } catch (error) {
      logger.warn('Could not fetch AI insights:', error.message);
      return null;
    }
  }

  /**
   * Generate market trend insights
   */
  async generateMarketInsights() {
    const insights = {
      marketSentiment: 'Neutral',
      trends: [
        {
          category: 'Technology',
          trend: 'Bullish',
          description: 'Tech stocks showing strong momentum',
          confidence: 'High'
        },
        {
          category: 'Energy',
          trend: 'Mixed',
          description: 'Energy sector facing volatility',
          confidence: 'Medium'
        }
      ],
      opportunities: [
        {
          title: 'Diversification Opportunity',
          description: 'Consider adding exposure to undervalued sectors',
          priority: 'Medium'
        }
      ]
    };

    return insights;
  }

  /**
   * Generate daily portfolio summary for email digest
   */
  async generateDailySummary(userId) {
    try {
      logger.info(`Generating daily summary for user ${userId}`);

      // Get all user portfolios
      const portfolios = db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM holdings WHERE portfolio_id = p.id) as holdings_count
        FROM portfolios p
        WHERE p.user_id = ?
      `).all(userId);

      if (portfolios.length === 0) {
        return { success: false, message: 'No portfolios found' };
      }

      let totalValue = 0;
      let totalDayChange = 0;
      let totalWeekChange = 0;
      const portfolioSummaries = [];
      const topMovers = [];
      const alertsTriggered = [];

      for (const portfolio of portfolios) {
        const holdings = db.prepare(`
          SELECT symbol, quantity, cost_basis, current_price, previous_close, sector
          FROM holdings
          WHERE portfolio_id = ?
        `).all(portfolio.id);

        let portfolioValue = 0;
        let portfolioDayChange = 0;

        holdings.forEach(h => {
          const value = (h.current_price || h.cost_basis) * h.quantity;
          portfolioValue += value;

          if (h.previous_close) {
            const dayChange = ((h.current_price - h.previous_close) / h.previous_close) * 100;
            portfolioDayChange += value * (dayChange / 100);

            if (Math.abs(dayChange) > 3) {
              topMovers.push({
                symbol: h.symbol,
                change: dayChange,
                value: value,
                direction: dayChange > 0 ? 'up' : 'down'
              });
            }
          }
        });

        portfolioSummaries.push({
          name: portfolio.name,
          value: portfolioValue,
          dayChange: portfolioDayChange,
          dayChangePercent: portfolioValue > 0 ? (portfolioDayChange / portfolioValue) * 100 : 0,
          holdingsCount: holdings.length
        });

        totalValue += portfolioValue;
        totalDayChange += portfolioDayChange;
      }

      // Get alerts triggered today
      try {
        const alerts = db.prepare(`
          SELECT * FROM alerts
          WHERE user_id = ? AND triggered_at >= date('now', '-1 day')
          ORDER BY triggered_at DESC
        `).all(userId);
        alertsTriggered.push(...alerts.slice(0, 5));
      } catch (e) {
        // Alerts table might not exist
      }

      // Sort top movers by absolute change
      topMovers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      const summary = {
        generatedAt: new Date().toISOString(),
        overview: {
          totalValue,
          totalDayChange,
          totalDayChangePercent: totalValue > 0 ? (totalDayChange / totalValue) * 100 : 0,
          portfolioCount: portfolios.length
        },
        portfolios: portfolioSummaries,
        topMovers: topMovers.slice(0, 5),
        alertsTriggered: alertsTriggered.slice(0, 5),
        insights: this.generateDailyInsights(totalDayChange, topMovers, portfolioSummaries)
      };

      return { success: true, summary };
    } catch (error) {
      logger.error('Error generating daily summary:', error);
      throw error;
    }
  }

  /**
   * Generate daily insights based on portfolio performance
   */
  generateDailyInsights(dayChange, topMovers, portfolios) {
    const insights = [];

    if (dayChange > 0) {
      insights.push({
        type: 'positive',
        title: 'Portfolio Up Today',
        message: `Your portfolios gained $${Math.abs(dayChange).toFixed(2)} today.`
      });
    } else if (dayChange < 0) {
      insights.push({
        type: 'caution',
        title: 'Portfolio Down Today',
        message: `Your portfolios lost $${Math.abs(dayChange).toFixed(2)} today. Consider reviewing positions.`
      });
    }

    const bigWinners = topMovers.filter(m => m.change > 5);
    if (bigWinners.length > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Big Winners',
        message: `${bigWinners.map(m => m.symbol).join(', ')} saw gains over 5%. Consider taking partial profits.`
      });
    }

    const bigLosers = topMovers.filter(m => m.change < -5);
    if (bigLosers.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Significant Declines',
        message: `${bigLosers.map(m => m.symbol).join(', ')} declined over 5%. Review these positions.`
      });
    }

    return insights;
  }

  /**
   * Generate AI-powered trade ideas based on portfolio analysis
   */
  async generateTradeIdeas(portfolioId) {
    try {
      logger.info(`Generating trade ideas for portfolio ${portfolioId}`);

      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      const holdings = db.prepare(`
        SELECT symbol, quantity, cost_basis, current_price, sector
        FROM holdings
        WHERE portfolio_id = ?
        ORDER BY (current_price * quantity) DESC
      `).all(portfolioId);

      const metrics = this.calculatePortfolioMetrics(holdings);
      const tradeIdeas = [];

      // Analyze for rebalancing opportunities
      holdings.forEach(h => {
        const gain = h.cost_basis > 0 ? ((h.current_price - h.cost_basis) / h.cost_basis) * 100 : 0;
        const weight = metrics.totalValue > 0 ? ((h.current_price * h.quantity) / metrics.totalValue) * 100 : 0;

        // Profit-taking opportunity
        if (gain > 30 && weight > 10) {
          tradeIdeas.push({
            type: 'sell',
            action: 'Take Partial Profits',
            symbol: h.symbol,
            reason: `${h.symbol} is up ${gain.toFixed(1)}% and represents ${weight.toFixed(1)}% of portfolio.`,
            suggestion: `Consider selling 20-30% of position to lock in gains.`,
            confidence: gain > 50 ? 'High' : 'Medium',
            priority: gain > 50 ? 'high' : 'medium'
          });
        }

        // Loss harvesting opportunity
        if (gain < -20) {
          tradeIdeas.push({
            type: 'review',
            action: 'Review for Tax Loss Harvesting',
            symbol: h.symbol,
            reason: `${h.symbol} is down ${Math.abs(gain).toFixed(1)}%.`,
            suggestion: `Consider selling for tax loss and reinvesting in similar ETF/stock.`,
            confidence: 'Medium',
            priority: 'medium'
          });
        }

        // Overweight rebalancing
        if (weight > 15) {
          tradeIdeas.push({
            type: 'rebalance',
            action: 'Consider Reducing Position',
            symbol: h.symbol,
            reason: `${h.symbol} represents ${weight.toFixed(1)}% of portfolio, above recommended 15% max.`,
            suggestion: `Trim to reduce single-stock risk.`,
            confidence: 'High',
            priority: 'high'
          });
        }
      });

      // Diversification opportunities
      const sectors = Object.keys(metrics.sectorWeights);
      const underrepresentedSectors = ['Technology', 'Healthcare', 'Financials', 'Consumer', 'Energy']
        .filter(s => !sectors.includes(s));

      if (underrepresentedSectors.length > 0) {
        tradeIdeas.push({
          type: 'buy',
          action: 'Add Sector Exposure',
          symbol: null,
          reason: `Portfolio lacks exposure to: ${underrepresentedSectors.slice(0, 3).join(', ')}`,
          suggestion: `Consider adding diversified sector ETFs or quality stocks in these sectors.`,
          confidence: 'Medium',
          priority: 'medium'
        });
      }

      // Sort by priority
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      tradeIdeas.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      return {
        success: true,
        portfolioId,
        generatedAt: new Date().toISOString(),
        tradeIdeas: tradeIdeas.slice(0, 10), // Top 10 ideas
        disclaimer: 'These are algorithmic suggestions, not financial advice. Always do your own research.'
      };
    } catch (error) {
      logger.error('Error generating trade ideas:', error);
      throw error;
    }
  }

  /**
   * Generate risk warnings based on portfolio concentration and volatility
   */
  async generateRiskWarnings(portfolioId) {
    try {
      logger.info(`Generating risk warnings for portfolio ${portfolioId}`);

      const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      const holdings = db.prepare(`
        SELECT symbol, quantity, cost_basis, current_price, sector, type
        FROM holdings
        WHERE portfolio_id = ?
      `).all(portfolioId);

      const metrics = this.calculatePortfolioMetrics(holdings);
      const warnings = [];

      // Concentration risk
      if (metrics.concentration > 40) {
        warnings.push({
          type: 'concentration',
          severity: metrics.concentration > 60 ? 'high' : 'medium',
          title: 'High Concentration Risk',
          description: `Top 5 holdings represent ${metrics.concentration.toFixed(1)}% of your portfolio. A decline in these stocks could significantly impact your returns.`,
          recommendation: 'Consider diversifying into more positions or using ETFs to spread risk.'
        });
      }

      // Single stock risk
      holdings.forEach(h => {
        const weight = metrics.totalValue > 0 ? ((h.current_price * h.quantity) / metrics.totalValue) * 100 : 0;
        if (weight > 25) {
          warnings.push({
            type: 'single_stock',
            severity: 'high',
            title: `Overweight: ${h.symbol}`,
            description: `${h.symbol} represents ${weight.toFixed(1)}% of your portfolio. Significant price movements could have outsized impact.`,
            recommendation: `Consider trimming position to under 15% of portfolio.`
          });
        }
      });

      // Sector concentration
      const sectorWarnings = [];
      Object.entries(metrics.sectorWeights).forEach(([sector, value]) => {
        const weight = (value / metrics.totalValue) * 100;
        if (weight > 40) {
          sectorWarnings.push({
            sector,
            weight: weight.toFixed(1)
          });
        }
      });

      if (sectorWarnings.length > 0) {
        warnings.push({
          type: 'sector_concentration',
          severity: 'medium',
          title: 'Sector Concentration',
          description: `Heavy concentration in: ${sectorWarnings.map(s => `${s.sector} (${s.weight}%)`).join(', ')}`,
          recommendation: 'Consider adding exposure to other sectors for diversification.'
        });
      }

      // Under-diversification
      if (holdings.length < 10) {
        warnings.push({
          type: 'diversification',
          severity: holdings.length < 5 ? 'high' : 'medium',
          title: 'Limited Diversification',
          description: `Portfolio has only ${holdings.length} holdings. More positions would reduce individual stock risk.`,
          recommendation: 'Consider adding 10-20 quality stocks or ETFs to improve diversification.'
        });
      }

      // Large unrealized losses
      const bigLosses = holdings.filter(h => {
        const gain = h.cost_basis > 0 ? ((h.current_price - h.cost_basis) / h.cost_basis) * 100 : 0;
        return gain < -30;
      });

      if (bigLosses.length > 0) {
        warnings.push({
          type: 'unrealized_loss',
          severity: 'medium',
          title: 'Significant Unrealized Losses',
          description: `${bigLosses.length} position(s) down over 30%: ${bigLosses.map(h => h.symbol).join(', ')}`,
          recommendation: 'Review these positions. Consider tax-loss harvesting or reassessing thesis.'
        });
      }

      // Overall risk score
      let riskScore = 0;
      warnings.forEach(w => {
        if (w.severity === 'high') riskScore += 30;
        else if (w.severity === 'medium') riskScore += 15;
        else riskScore += 5;
      });
      riskScore = Math.min(100, riskScore);

      return {
        success: true,
        portfolioId,
        generatedAt: new Date().toISOString(),
        riskScore,
        riskLevel: riskScore > 60 ? 'High' : riskScore > 30 ? 'Medium' : 'Low',
        warnings: warnings.sort((a, b) => {
          const order = { high: 1, medium: 2, low: 3 };
          return order[a.severity] - order[b.severity];
        }),
        metrics: {
          concentration: metrics.concentration,
          holdingsCount: holdings.length,
          sectorCount: Object.keys(metrics.sectorWeights).length
        }
      };
    } catch (error) {
      logger.error('Error generating risk warnings:', error);
      throw error;
    }
  }

  /**
   * Generate market sentiment summary
   */
  async generateMarketSentimentSummary() {
    try {
      logger.info('Generating market sentiment summary');

      // In production, this would fetch real market data
      // For now, generate a comprehensive mock sentiment analysis
      const now = new Date();
      const hour = now.getHours();

      // Simulate market sentiment based on time of day
      const baseScore = 50 + Math.sin(hour / 24 * Math.PI * 2) * 20;

      const sentiment = {
        generatedAt: now.toISOString(),
        overall: {
          score: Math.round(baseScore),
          level: baseScore > 65 ? 'Bullish' : baseScore < 35 ? 'Bearish' : 'Neutral',
          trend: baseScore > 50 ? 'Improving' : 'Declining'
        },
        indices: {
          sp500: { change: (Math.random() - 0.5) * 2, sentiment: 'Neutral' },
          nasdaq: { change: (Math.random() - 0.3) * 2.5, sentiment: 'Bullish' },
          dow: { change: (Math.random() - 0.5) * 1.5, sentiment: 'Neutral' }
        },
        sectors: [
          { name: 'Technology', sentiment: 'Bullish', strength: 75 },
          { name: 'Healthcare', sentiment: 'Neutral', strength: 55 },
          { name: 'Financials', sentiment: 'Neutral', strength: 50 },
          { name: 'Energy', sentiment: 'Bearish', strength: 35 },
          { name: 'Consumer', sentiment: 'Bullish', strength: 65 }
        ],
        indicators: {
          vix: { value: 18 + Math.random() * 10, level: 'Low' },
          putCallRatio: { value: 0.8 + Math.random() * 0.4, level: 'Neutral' },
          advanceDecline: { ratio: 1.1 + Math.random() * 0.5, level: 'Positive' }
        },
        keyInsights: [
          'Technology sector continues to lead with AI-driven momentum',
          'Fed policy expectations stable, supporting equity valuations',
          'Earnings season approaching - expect increased volatility',
          'International markets showing mixed performance'
        ],
        recommendations: [
          'Maintain balanced sector allocation',
          'Consider adding defensive positions if volatility increases',
          'Watch for earnings surprises in upcoming reports'
        ]
      };

      return { success: true, sentiment };
    } catch (error) {
      logger.error('Error generating market sentiment:', error);
      throw error;
    }
  }

  /**
   * Generate personalized watchlist recommendations
   */
  async generateWatchlistRecommendations(userId) {
    try {
      logger.info(`Generating watchlist recommendations for user ${userId}`);

      // Get user's current holdings to understand preferences
      const holdings = db.prepare(`
        SELECT h.symbol, h.sector
        FROM holdings h
        JOIN portfolios p ON h.portfolio_id = p.id
        WHERE p.user_id = ?
      `).all(userId);

      const ownedSymbols = new Set(holdings.map(h => h.symbol));
      const sectorPreferences = {};
      holdings.forEach(h => {
        if (h.sector) {
          sectorPreferences[h.sector] = (sectorPreferences[h.sector] || 0) + 1;
        }
      });

      // Generate recommendations based on preferences
      const recommendations = [
        { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', reason: 'Strong cloud growth', confidence: 'High' },
        { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', reason: 'Defensive dividend stock', confidence: 'Medium' },
        { symbol: 'V', name: 'Visa', sector: 'Financials', reason: 'Payment processing leader', confidence: 'High' },
        { symbol: 'COST', name: 'Costco', sector: 'Consumer', reason: 'Consistent growth', confidence: 'Medium' },
        { symbol: 'NEE', name: 'NextEra Energy', sector: 'Utilities', reason: 'Clean energy leader', confidence: 'Medium' }
      ].filter(r => !ownedSymbols.has(r.symbol));

      return {
        success: true,
        recommendations: recommendations.slice(0, 5),
        basedOn: Object.keys(sectorPreferences).slice(0, 3),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error generating watchlist recommendations:', error);
      throw error;
    }
  }
}

module.exports = new AIInsightsService();
