/**
 * Finance Assistant Service
 * Core service for the ChatGPT-like financial assistant
 * Handles context building, tool execution, and streaming responses
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const unifiedAI = require('./unifiedAIService');
const MarketDataService = require('./marketDataService');
const { assistantSystemPrompt, quickInsightPrompts, toolResponseFormat } = require('./prompts/assistantPrompts');

class FinanceAssistantService {
  constructor() {
    this.tools = this.defineTools();
  }

  /**
   * Define available tools for the assistant
   */
  defineTools() {
    return {
      get_stock_quote: {
        description: 'Get current stock price and key metrics for a symbol',
        params: { symbol: 'string (required)' },
        execute: async (params) => {
          const quote = await MarketDataService.getQuote(params.symbol);
          return quote;
        }
      },
      get_portfolio_holdings: {
        description: 'Get detailed holdings from user portfolio',
        params: { portfolio_id: 'string (optional)' },
        execute: async (params, userId) => {
          const portfolio = await this.getPortfolioWithHoldings(userId, params.portfolioId);
          return portfolio?.holdings || [];
        }
      },
      get_portfolio_performance: {
        description: 'Get portfolio performance metrics',
        params: { portfolio_id: 'string (optional)', period: 'string (1d, 1w, 1m, 3m, 6m, 1y, ytd)' },
        execute: async (params, userId) => {
          const portfolio = await this.getPortfolioWithHoldings(userId, params.portfolioId);
          return this.calculatePerformance(portfolio, params.period || '1m');
        }
      },
      analyze_stock: {
        description: 'Get comprehensive analysis for a stock',
        params: { symbol: 'string (required)' },
        execute: async (params) => {
          const [quote, profile] = await Promise.all([
            MarketDataService.getQuote(params.symbol),
            MarketDataService.getProfile(params.symbol)
          ]);
          return { quote, profile };
        }
      },
      compare_stocks: {
        description: 'Compare multiple stocks side by side',
        params: { symbols: 'array of strings (required)' },
        execute: async (params) => {
          const symbols = Array.isArray(params.symbols) ? params.symbols : [params.symbols];
          const quotes = await Promise.all(
            symbols.slice(0, 5).map(s => MarketDataService.getQuote(s))
          );
          return quotes;
        }
      },
      get_market_overview: {
        description: 'Get market indices and sector performance',
        params: {},
        execute: async () => {
          const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX'];
          const quotes = await Promise.all(
            indices.map(s => MarketDataService.getQuote(s))
          );
          return {
            indices: quotes,
            timestamp: new Date().toISOString()
          };
        }
      },
      calculate_risk: {
        description: 'Calculate portfolio risk metrics',
        params: { portfolio_id: 'string (optional)' },
        execute: async (params, userId) => {
          const portfolio = await this.getPortfolioWithHoldings(userId, params.portfolioId);
          return this.calculateRiskMetrics(portfolio);
        }
      },
      search_stocks: {
        description: 'Search for stocks by name or symbol',
        params: { query: 'string (required)' },
        execute: async (params) => {
          // Use existing search functionality
          const results = await MarketDataService.search(params.query);
          return results?.slice(0, 10) || [];
        }
      },
      get_dividend_info: {
        description: 'Get dividend information for a stock',
        params: { symbol: 'string (required)' },
        execute: async (params) => {
          const quote = await MarketDataService.getQuote(params.symbol);
          return {
            symbol: params.symbol,
            dividend: quote?.dividend,
            dividendYield: quote?.dividendYield,
            exDividendDate: quote?.exDividendDate
          };
        }
      },
      get_earnings_calendar: {
        description: 'Get upcoming earnings dates',
        params: { symbols: 'array of strings (optional)' },
        execute: async (params) => {
          const earnings = await prisma.earningsCalendar.findMany({
            where: {
              reportDate: { gte: new Date() },
              ...(params.symbols?.length ? { symbol: { in: params.symbols } } : {})
            },
            orderBy: { reportDate: 'asc' },
            take: 20
          });
          return earnings;
        }
      }
    };
  }

  /**
   * Build context for the assistant
   */
  async buildContext(userId, portfolioId, attachments = []) {
    const context = {
      portfolio: null,
      attachments: []
    };

    // Get portfolio context
    if (portfolioId) {
      context.portfolio = await this.getPortfolioContext(userId, portfolioId);
    } else {
      // Get default or first portfolio
      const defaultPortfolio = await prisma.portfolios.findFirst({
        where: { userId },
        orderBy: { isDefault: 'desc' }
      });
      if (defaultPortfolio) {
        context.portfolio = await this.getPortfolioContext(userId, defaultPortfolio.id);
      }
    }

    // Add attachment context
    if (attachments?.length) {
      context.attachments = attachments.map(a => ({
        filename: a.filename,
        mimeType: a.mimeType,
        analysis: a.analysis
      }));
    }

    return context;
  }

  /**
   * Get detailed portfolio context
   */
  async getPortfolioContext(userId, portfolioId) {
    try {
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId },
        include: {
          holdings: true,
          sectorAllocations: {
            orderBy: { percentAlloc: 'desc' },
            take: 10
          }
        }
      });

      if (!portfolio) return null;

      // Enrich holdings with current prices
      const symbols = portfolio.holdings.map(h => h.symbol);
      const quotes = {};

      if (symbols.length > 0) {
        const quoteResults = await Promise.all(
          symbols.slice(0, 20).map(async s => {
            try {
              const q = await MarketDataService.getQuote(s);
              return { symbol: s, quote: q };
            } catch (e) {
              return { symbol: s, quote: null };
            }
          })
        );
        quoteResults.forEach(r => {
          if (r.quote) quotes[r.symbol] = r.quote;
        });
      }

      // Calculate totals
      let totalValue = portfolio.cashBalance || 0;
      let totalCost = 0;
      const enrichedHoldings = portfolio.holdings.map(h => {
        const quote = quotes[h.symbol];
        const currentPrice = quote?.price || h.avgCostBasis;
        const marketValue = h.shares * currentPrice;
        const costBasis = h.shares * h.avgCostBasis;
        const gain = marketValue - costBasis;
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        totalValue += marketValue;
        totalCost += costBasis;

        return {
          symbol: h.symbol,
          shares: h.shares,
          avgCost: h.avgCostBasis,
          currentPrice,
          marketValue,
          gain,
          gainPct,
          sector: h.sector
        };
      });

      // Sort by market value
      enrichedHoldings.sort((a, b) => b.marketValue - a.marketValue);

      return {
        id: portfolio.id,
        name: portfolio.name,
        totalValue,
        cashBalance: portfolio.cashBalance || 0,
        totalCost,
        totalGain: totalValue - totalCost,
        totalGainPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        holdings: enrichedHoldings,
        topHoldings: enrichedHoldings.slice(0, 5).map(h => h.symbol),
        sectors: portfolio.sectorAllocations?.map(s => ({
          name: s.sectorName,
          percent: s.percentAlloc
        })) || [],
        ytdReturn: null // Would need historical data to calculate
      };
    } catch (error) {
      console.error('[FinanceAssistant] Error getting portfolio context:', error);
      return null;
    }
  }

  /**
   * Get portfolio with holdings
   */
  async getPortfolioWithHoldings(userId, portfolioId) {
    const where = portfolioId
      ? { id: portfolioId, userId }
      : { userId, isDefault: true };

    return prisma.portfolios.findFirst({
      where,
      include: { holdings: true }
    });
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformance(portfolio, period) {
    if (!portfolio) return null;

    // Simplified performance - would need historical snapshots for real calculation
    let totalValue = portfolio.cashBalance || 0;
    let totalCost = 0;

    portfolio.holdings?.forEach(h => {
      totalValue += h.shares * (h.avgCostBasis || 0);
      totalCost += h.shares * h.avgCostBasis;
    });

    return {
      totalValue,
      totalCost,
      totalReturn: totalValue - totalCost,
      totalReturnPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      period,
      holdingsCount: portfolio.holdings?.length || 0
    };
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(portfolio) {
    if (!portfolio || !portfolio.holdings?.length) {
      return { error: 'No holdings to analyze' };
    }

    const holdings = portfolio.holdings;
    const totalValue = holdings.reduce((sum, h) => sum + h.shares * h.avgCostBasis, 0);

    // Calculate concentration
    const positions = holdings.map(h => ({
      symbol: h.symbol,
      value: h.shares * h.avgCostBasis,
      weight: totalValue > 0 ? (h.shares * h.avgCostBasis / totalValue) * 100 : 0
    })).sort((a, b) => b.weight - a.weight);

    const top5Weight = positions.slice(0, 5).reduce((sum, p) => sum + p.weight, 0);
    const concentrationRisk = positions[0]?.weight > 20 ? 'HIGH' : positions[0]?.weight > 10 ? 'MEDIUM' : 'LOW';

    return {
      totalValue,
      positionCount: holdings.length,
      topPosition: positions[0],
      top5Weight,
      concentrationRisk,
      diversificationScore: Math.min(100, holdings.length * 10),
      recommendations: this.getRiskRecommendations(positions, concentrationRisk)
    };
  }

  /**
   * Get risk recommendations
   */
  getRiskRecommendations(positions, concentrationRisk) {
    const recommendations = [];

    if (concentrationRisk === 'HIGH') {
      recommendations.push(`Consider reducing ${positions[0].symbol} position (${positions[0].weight.toFixed(1)}% of portfolio)`);
    }

    if (positions.length < 10) {
      recommendations.push('Consider adding more positions for diversification');
    }

    return recommendations;
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName, params, userId) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      const result = await tool.execute(params, userId);
      return result;
    } catch (error) {
      console.error(`[FinanceAssistant] Tool execution error (${toolName}):`, error);
      return { error: error.message };
    }
  }

  /**
   * Get list of available tools
   */
  getToolsList() {
    return Object.entries(this.tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      params: tool.params
    }));
  }

  /**
   * Stream chat response with tool support
   */
  async *streamChat(message, options = {}) {
    const { userId, portfolioId, sessionId, attachments = [] } = options;

    // Build context
    const context = await this.buildContext(userId, portfolioId, attachments);

    // Build system prompt
    const systemPrompt = assistantSystemPrompt(context);

    // Get conversation history if session exists
    let conversationHistory = [];
    if (sessionId) {
      const session = await prisma.assistantSession.findFirst({
        where: { id: sessionId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20
          }
        }
      });

      if (session) {
        conversationHistory = session.messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }));
      }
    }

    // Stream the response
    let fullResponse = '';
    let provider = 'claude';
    let usage = null;

    try {
      for await (const chunk of unifiedAI.streamCompletion(message, {
        systemPrompt,
        conversationHistory,
        temperature: 0.7,
        maxTokens: 2048
      })) {
        if (chunk.type === 'text') {
          fullResponse += chunk.content;
          yield {
            type: 'text',
            content: chunk.content
          };
        } else if (chunk.type === 'done') {
          provider = chunk.provider || 'claude';
          usage = chunk.usage;
        }
      }

      yield {
        type: 'done',
        provider,
        usage,
        fullResponse
      };
    } catch (error) {
      console.error('[FinanceAssistant] Stream error:', error);
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  /**
   * Generate quick insight
   */
  async generateQuickInsight(type, userId, portfolioId) {
    const context = await this.buildContext(userId, portfolioId);

    const promptFn = quickInsightPrompts[type];
    if (!promptFn) {
      throw new Error(`Unknown insight type: ${type}`);
    }

    const prompt = promptFn(context);

    const response = await unifiedAI.generateCompletion(prompt, {
      systemPrompt: 'You are a financial advisor providing quick, actionable insights. Be concise.',
      maxTokens: 300,
      temperature: 0.5
    });

    return {
      type,
      insight: response,
      context: {
        portfolioName: context.portfolio?.name,
        portfolioValue: context.portfolio?.totalValue
      }
    };
  }

  /**
   * Get context-aware suggestions
   */
  async getSuggestions(userId, portfolioId) {
    const context = await this.buildContext(userId, portfolioId);

    const suggestions = [
      {
        text: 'Analyze my portfolio performance',
        category: 'portfolio'
      },
      {
        text: 'What are the top market movers today?',
        category: 'market'
      },
      {
        text: 'Review my sector allocation',
        category: 'portfolio'
      },
      {
        text: 'Find tax-loss harvesting opportunities',
        category: 'tax'
      }
    ];

    // Add context-specific suggestions
    if (context.portfolio?.holdings?.length > 0) {
      const topHolding = context.portfolio.topHoldings[0];
      suggestions.push({
        text: `Analyze ${topHolding} stock`,
        category: 'analysis'
      });

      if (context.portfolio.holdings.length > 10) {
        suggestions.push({
          text: 'Identify my most concentrated positions',
          category: 'risk'
        });
      }
    }

    return suggestions;
  }
}

module.exports = new FinanceAssistantService();
