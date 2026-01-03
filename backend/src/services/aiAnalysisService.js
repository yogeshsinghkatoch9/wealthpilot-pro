/**
 * AI Analysis Service - OpenAI Integration
 * Provides AI-powered portfolio analysis, recommendations, and report generation
 */

const axios = require('axios');

const logger = require('../utils/logger');
class AIAnalysisService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.model = 'gpt-4o-mini'; // Cost-effective model, can upgrade to gpt-4 for better quality
  }

  /**
   * Generate portfolio analysis
   */
  async analyzePortfolio(portfolioData) {
    try {
      const { holdings, totalValue, totalGain, totalGainPct, diversification } = portfolioData;

      const prompt = `You are a professional financial advisor. Analyze this investment portfolio and provide insights:

Portfolio Summary:
- Total Value: $${totalValue.toLocaleString()}
- Total Gain/Loss: $${totalGain.toLocaleString()} (${totalGainPct.toFixed(2)}%)
- Number of Holdings: ${holdings.length}

Holdings:
${holdings.map(h => `- ${h.symbol}: ${h.shares} shares @ $${h.price} = $${h.marketValue.toLocaleString()} (${h.weight.toFixed(2)}% of portfolio, ${h.gainPct >= 0 ? '+' : ''}${h.gainPct.toFixed(2)}% gain)`).join('\n')}

Please provide:
1. Overall portfolio health assessment (1-2 sentences)
2. Diversification analysis
3. Top 3 strengths
4. Top 3 areas for improvement
5. Specific actionable recommendations

Keep the analysis concise, professional, and actionable.`;

      const response = await this.callGPT(prompt);
      
      return {
        analysis: response,
        generated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error analyzing portfolio:', error.message);
      return {
        error: 'Failed to generate analysis',
        message: error.message
      };
    }
  }

  /**
   * Generate investment recommendations
   */
  async generateRecommendations(holdings, marketData, userProfile) {
    try {
      const prompt = `As a financial advisor, provide investment recommendations for this portfolio:

Current Holdings:
${holdings.map(h => `- ${h.symbol} (${h.sector}): $${h.marketValue.toLocaleString()}, ${h.weight.toFixed(1)}% of portfolio`).join('\n')}

User Profile:
- Risk Tolerance: ${userProfile.riskTolerance || 'Moderate'}
- Investment Horizon: ${userProfile.horizon || 'Long-term'}
- Goals: ${userProfile.goals || 'Growth'}

Recent Market Context:
${marketData ? `- S&P 500 trend: ${marketData.sp500Trend || 'N/A'}` : ''}

Provide:
1. 3 specific stock recommendations (with ticker symbols) to add
2. 2 stocks to consider reducing or selling (if any)
3. Ideal sector allocation adjustments
4. Risk mitigation strategies

Format as clear, actionable bullet points.`;

      const response = await this.callGPT(prompt);
      
      return {
        recommendations: response,
        generated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error generating recommendations:', error.message);
      return {
        error: 'Failed to generate recommendations',
        message: error.message
      };
    }
  }

  /**
   * Generate comprehensive PDF report content
   */
  async generateReport(portfolioData, timeframe = '1 year') {
    try {
      const { 
        portfolio, 
        holdings, 
        performance, 
        allocation, 
        transactions 
      } = portfolioData;

      const prompt = `Create a professional investment portfolio report:

Portfolio: ${portfolio.name}
Period: ${timeframe}
Total Value: $${portfolio.totalValue.toLocaleString()}
Total Return: ${portfolio.totalGainPct >= 0 ? '+' : ''}${portfolio.totalGainPct.toFixed(2)}%

Performance:
- Best Performer: ${performance.best?.symbol || 'N/A'} (${performance.best?.return || 'N/A'}%)
- Worst Performer: ${performance.worst?.symbol || 'N/A'} (${performance.worst?.return || 'N/A'}%)
- Volatility: ${performance.volatility || 'N/A'}%

Allocation:
${allocation.map(a => `- ${a.sector}: ${a.percentage.toFixed(1)}%`).join('\n')}

Generate a professional report with:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Overall performance assessment
   - Key achievements
   - Major concerns

2. PORTFOLIO PERFORMANCE ANALYSIS
   - Risk-adjusted returns commentary
   - Benchmark comparison insights
   - Attribution analysis

3. HOLDINGS REVIEW
   - Top contributors analysis
   - Underperformers and recommendations
   - Sector concentration assessment

4. RISK ASSESSMENT
   - Diversification evaluation
   - Volatility analysis
   - Downside protection

5. FORWARD-LOOKING RECOMMENDATIONS
   - Strategic adjustments
   - Rebalancing suggestions
   - Risk mitigation strategies

6. MARKET OUTLOOK (brief, 1 paragraph)

Keep professional tone, use data-driven insights, and provide actionable recommendations.`;

      const response = await this.callGPT(prompt, 2000); // Allow longer response
      
      return {
        reportContent: response,
        generated: new Date().toISOString(),
        timeframe
      };
    } catch (error) {
      logger.error('Error generating report:', error.message);
      return {
        error: 'Failed to generate report',
        message: error.message
      };
    }
  }

  /**
   * Analyze individual stock
   */
  async analyzeStock(symbol, companyData, historicalData) {
    try {
      const prompt = `Analyze this stock as an investment opportunity:

Symbol: ${symbol}
Company: ${companyData.name || symbol}
Sector: ${companyData.sector || 'N/A'}
Current Price: $${companyData.price || 'N/A'}

Fundamentals:
- Market Cap: $${companyData.marketCap ? (companyData.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}
- P/E Ratio: ${companyData.peRatio || 'N/A'}
- Dividend Yield: ${companyData.dividendYield || 'N/A'}%
- Beta: ${companyData.beta || 'N/A'}

Recent Performance:
- 52-Week High: $${companyData.week52High || 'N/A'}
- 52-Week Low: $${companyData.week52Low || 'N/A'}
- YTD Return: ${historicalData?.ytdReturn || 'N/A'}%

Provide:
1. Investment thesis (2-3 sentences)
2. Key strengths (3 bullet points)
3. Key risks (3 bullet points)
4. Price target range
5. Recommendation: BUY / HOLD / SELL with rationale

Be concise and actionable.`;

      const response = await this.callGPT(prompt);
      
      return {
        analysis: response,
        symbol,
        generated: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error analyzing stock ${symbol}:`, error.message);
      return {
        error: 'Failed to analyze stock',
        message: error.message
      };
    }
  }

  /**
   * Generate market insights
   */
  async generateMarketInsights(sectorPerformance, economicIndicators) {
    try {
      const prompt = `Provide current market insights based on this data:

Sector Performance (YTD):
${Object.entries(sectorPerformance).map(([sector, perf]) => 
    `- ${sector}: ${perf}%`
  ).join('\n')}

Economic Context:
${economicIndicators || 'General market conditions'}

Provide:
1. Market sentiment summary (2-3 sentences)
2. Top performing sectors analysis
3. Sectors to watch
4. Key market drivers
5. Outlook for next quarter

Keep concise and investment-focused.`;

      const response = await this.callGPT(prompt);
      
      return {
        insights: response,
        generated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error generating market insights:', error.message);
      return {
        error: 'Failed to generate insights',
        message: error.message
      };
    }
  }

  /**
   * Answer investment questions
   */
  async answerQuestion(question, context = '') {
    try {
      const prompt = `You are a knowledgeable financial advisor. Answer this investment question:

Question: ${question}

${context ? `Context: ${context}` : ''}

Provide a clear, accurate, and helpful answer. Include relevant examples or data points if applicable. Keep the response concise (3-5 paragraphs maximum).`;

      const response = await this.callGPT(prompt);
      
      return {
        answer: response,
        generated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error answering question:', error.message);
      return {
        error: 'Failed to answer question',
        message: error.message
      };
    }
  }

  /**
   * Core GPT API call
   */
  async callGPT(prompt, maxTokens = 1000) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert financial advisor and portfolio manager with deep knowledge of investment strategies, market analysis, and wealth management. Provide professional, data-driven insights that are clear, actionable, and tailored to individual investors.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.error('GPT API Error:', error.response?.data || error.message);
      throw new Error(`GPT API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Batch analysis for multiple holdings
   */
  async batchAnalyze(holdings, limit = 5) {
    // Limit to avoid rate limits and costs
    const topHoldings = holdings
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, limit);

    const analyses = await Promise.allSettled(
      topHoldings.map(holding =>
        this.analyzeStock(holding.symbol, holding, holding.historical)
      )
    );

    return analyses.map((result, index) => ({
      symbol: topHoldings[index].symbol,
      analysis: result.status === 'fulfilled' ? result.value : { error: result.reason }
    }));
  }
}

module.exports = AIAnalysisService;
