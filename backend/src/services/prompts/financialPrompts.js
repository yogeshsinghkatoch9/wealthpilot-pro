/**
 * Financial Prompts Library
 * Comprehensive prompts for AI-powered portfolio analysis and reporting
 */

const financialPrompts = {
  /**
   * System prompt for report generation
   */
  reportSystemPrompt: () => `You are an expert portfolio analyst and financial advisor with CFA certification.
Your role is to provide professional-grade investment analysis and recommendations.

Key principles:
1. Always use proper financial metrics and formulas
2. Provide data-driven insights with specific numbers
3. Include risk considerations with all recommendations
4. Use clear, professional language suitable for client reports
5. Be balanced and objective in your analysis

Financial Formulas Reference:
- Sharpe Ratio = (Rp - Rf) / σp where Rp is portfolio return, Rf is risk-free rate, σp is standard deviation
- Beta = Cov(Ri, Rm) / Var(Rm) where Ri is asset return, Rm is market return
- Alpha = Rp - [Rf + β(Rm - Rf)] (Jensen's Alpha)
- Value at Risk (95%) = μ - 1.645σ
- Maximum Drawdown = (Trough - Peak) / Peak
- Sortino Ratio = (Rp - Rf) / σd where σd is downside deviation
- Information Ratio = (Rp - Rb) / Tracking Error where Rb is benchmark return
- Treynor Ratio = (Rp - Rf) / β

Always show your calculations when using these formulas.`,

  /**
   * Portfolio analysis prompt
   */
  portfolioAnalysis: (portfolioData, analysisType) => {
    const holdingsTable = portfolioData.holdings?.map(h =>
      `${h.symbol}: ${h.shares} shares @ $${h.currentPrice?.toFixed(2) || h.avgCostBasis?.toFixed(2)} (${h.sector || 'Unknown'})`
    ).join('\n') || 'No holdings data';

    const metrics = portfolioData.metrics || {};

    return `Analyze this investment portfolio:

PORTFOLIO OVERVIEW:
- Total Value: $${portfolioData.totalValue?.toLocaleString() || 'N/A'}
- Total Cost Basis: $${portfolioData.totalCostBasis?.toLocaleString() || 'N/A'}
- Total Gain/Loss: $${portfolioData.totalGain?.toLocaleString() || 'N/A'} (${portfolioData.totalGainPercent?.toFixed(2) || 0}%)
- Number of Holdings: ${portfolioData.holdings?.length || 0}

HOLDINGS:
${holdingsTable}

PERFORMANCE METRICS:
- YTD Return: ${metrics.ytdReturn?.toFixed(2) || 'N/A'}%
- 1-Year Return: ${metrics.oneYearReturn?.toFixed(2) || 'N/A'}%
- Sharpe Ratio: ${metrics.sharpeRatio?.toFixed(2) || 'N/A'}
- Beta: ${metrics.beta?.toFixed(2) || 'N/A'}
- Volatility: ${metrics.volatility?.toFixed(2) || 'N/A'}%

ANALYSIS TYPE: ${analysisType}

Please provide:
1. Overall portfolio assessment
2. Risk analysis with specific metrics
3. Diversification evaluation
4. Key strengths and weaknesses
5. Specific recommendations for improvement`;
  },

  /**
   * Risk assessment prompt
   */
  riskAssessment: (data) => `Perform a comprehensive risk assessment for this portfolio:

PORTFOLIO DATA:
${JSON.stringify(data, null, 2)}

Analyze and calculate:
1. CONCENTRATION RISK
   - Single position concentration (warn if any position >15% of portfolio)
   - Sector concentration (warn if any sector >30%)
   - Herfindahl-Hirschman Index (HHI) for portfolio concentration

2. MARKET RISK
   - Portfolio Beta relative to S&P 500
   - Value at Risk (VaR) at 95% confidence
   - Expected Maximum Drawdown

3. VOLATILITY ANALYSIS
   - Portfolio standard deviation
   - Downside deviation (for Sortino Ratio)
   - Beta-adjusted risk

4. CORRELATION RISK
   - High correlation holdings (potential for amplified losses)
   - Lack of diversification indicators

5. LIQUIDITY RISK
   - Small-cap exposure
   - Low-volume holdings

For each risk category:
- Quantify the risk level (Low/Medium/High)
- Provide specific numbers and calculations
- Suggest mitigation strategies`,

  /**
   * Dividend analysis prompt
   */
  dividendAnalysis: (data) => `Analyze the dividend profile of this portfolio:

HOLDINGS WITH DIVIDENDS:
${data.holdings?.filter(h => h.dividendYield > 0).map(h =>
  `${h.symbol}: Yield ${h.dividendYield?.toFixed(2)}%, Annual Dividend $${h.annualDividend?.toFixed(2)}`
).join('\n') || 'No dividend data'}

PORTFOLIO TOTALS:
- Total Annual Dividend Income: $${data.totalAnnualDividends?.toLocaleString() || 'N/A'}
- Portfolio Dividend Yield: ${data.portfolioYield?.toFixed(2) || 'N/A'}%
- Dividend Coverage: ${data.dividendCoverage || 'N/A'}

Please analyze:
1. INCOME SUMMARY
   - Monthly/quarterly/annual projected income
   - Yield comparison to benchmark (S&P 500 ~1.5%)

2. DIVIDEND SAFETY
   - Payout ratio assessment for each holding
   - Dividend growth history
   - Free cash flow coverage

3. SECTOR DISTRIBUTION
   - Dividend income by sector
   - Over-reliance on any sector

4. GROWTH VS INCOME
   - Balance between dividend stocks and growth stocks
   - Recommendations for income optimization

5. TAX EFFICIENCY
   - Qualified vs non-qualified dividends
   - Tax-advantaged placement suggestions`,

  /**
   * Sector analysis prompt
   */
  sectorAnalysis: (data) => `Analyze the sector allocation of this portfolio:

SECTOR BREAKDOWN:
${Object.entries(data.sectorAllocation || {}).map(([sector, value]) =>
  `${sector}: ${value.percentage?.toFixed(1)}% ($${value.amount?.toLocaleString() || 0})`
).join('\n') || 'No sector data'}

BENCHMARK COMPARISON (S&P 500):
- Technology: 28%
- Healthcare: 13%
- Financials: 12%
- Consumer Discretionary: 11%
- Communication Services: 9%
- Industrials: 8%
- Consumer Staples: 6%
- Energy: 4%
- Utilities: 3%
- Real Estate: 3%
- Materials: 3%

Please analyze:
1. ALLOCATION ASSESSMENT
   - Over/underweight sectors vs benchmark
   - Concentration risks

2. SECTOR CORRELATION
   - Cyclical vs defensive mix
   - Interest rate sensitivity

3. ECONOMIC CYCLE POSITIONING
   - Current economic cycle phase assessment
   - Sector rotation recommendations

4. RISK FACTORS
   - Regulatory risks by sector
   - Competitive landscape

5. RECOMMENDATIONS
   - Rebalancing suggestions
   - Specific sector adjustments`,

  /**
   * Recommendations prompt
   */
  recommendations: (data) => `Generate investment recommendations for this portfolio:

CURRENT PORTFOLIO:
${JSON.stringify(data, null, 2)}

Provide specific, actionable recommendations:

1. BUY RECOMMENDATIONS (3-5 stocks)
   For each recommendation provide:
   - Stock symbol and company name
   - Rationale (why this fits the portfolio)
   - Target allocation percentage
   - Risk level (Conservative/Moderate/Aggressive)
   - Expected catalyst or timeframe

2. SELL/REDUCE RECOMMENDATIONS
   Identify positions to:
   - Sell completely (with reason)
   - Reduce position size (with target %)
   - Tax-loss harvesting candidates

3. REBALANCING ACTIONS
   - Specific trades to reach target allocation
   - Priority order of actions

4. WATCHLIST ADDITIONS
   - Stocks to monitor for future entry
   - Price targets or conditions for entry

5. RISK MANAGEMENT
   - Stop-loss levels for volatile positions
   - Hedging strategies if appropriate

Format each recommendation clearly with specific numbers and percentages.`,

  /**
   * Market outlook prompt
   */
  marketOutlook: (data) => `Provide a market outlook relevant to this portfolio:

PORTFOLIO SECTORS:
${data.sectors?.join(', ') || 'Diversified'}

CURRENT MARKET CONDITIONS:
${data.marketData ? JSON.stringify(data.marketData, null, 2) : 'Use general market knowledge'}

Provide analysis on:

1. MACRO ENVIRONMENT
   - Interest rate outlook
   - Inflation trends
   - Economic growth expectations
   - Fed policy implications

2. SECTOR OUTLOOK (for portfolio sectors)
   - Near-term catalysts
   - Risks to monitor
   - Relative attractiveness

3. MARKET TECHNICALS
   - Key support/resistance levels
   - Market breadth indicators
   - Sentiment indicators

4. RISK SCENARIOS
   - Bull case scenario and probability
   - Base case scenario and probability
   - Bear case scenario and probability

5. PORTFOLIO IMPLICATIONS
   - How current conditions affect the portfolio
   - Suggested adjustments based on outlook
   - Timeframe for reassessment`,

  /**
   * General analysis prompt
   */
  generalAnalysis: (data) => `Analyze the following financial data:

${JSON.stringify(data, null, 2)}

Provide:
1. Key observations
2. Important metrics and their implications
3. Potential risks
4. Actionable recommendations`,

  /**
   * Report section prompts
   */
  reportSection: (section, portfolioData) => {
    const sectionPrompts = {
      executiveSummary: `Generate an executive summary for this portfolio report:

PORTFOLIO VALUE: $${portfolioData.totalValue?.toLocaleString() || 'N/A'}
TOTAL RETURN: ${portfolioData.totalGainPercent?.toFixed(2) || 0}%
HOLDINGS: ${portfolioData.holdings?.length || 0} positions
TOP HOLDINGS: ${portfolioData.holdings?.slice(0, 5).map(h => h.symbol).join(', ') || 'N/A'}

Write a 2-3 paragraph executive summary covering:
1. Portfolio performance highlights
2. Key changes and events
3. Overall assessment and outlook

Keep it concise and professional, suitable for the first page of a client report.`,

      portfolioOverview: `Generate a portfolio overview section:

HOLDINGS:
${portfolioData.holdings?.map(h =>
  `${h.symbol} (${h.name || 'N/A'}): ${h.shares} shares, $${(h.shares * (h.currentPrice || h.avgCostBasis || 0)).toFixed(2)} value`
).join('\n') || 'No holdings'}

ALLOCATION BY SECTOR:
${Object.entries(portfolioData.sectorAllocation || {}).map(([k, v]) => `${k}: ${v.percentage?.toFixed(1) || 0}%`).join('\n') || 'N/A'}

Provide:
1. Overview of portfolio composition
2. Asset allocation summary
3. Diversification assessment
4. Key position highlights`,

      performanceAnalysis: `Generate a performance analysis section:

RETURNS:
- Total Return: ${portfolioData.totalGainPercent?.toFixed(2) || 0}%
- YTD Return: ${portfolioData.metrics?.ytdReturn?.toFixed(2) || 'N/A'}%
- 1-Year Return: ${portfolioData.metrics?.oneYearReturn?.toFixed(2) || 'N/A'}%

TOP PERFORMERS:
${portfolioData.holdings?.sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0)).slice(0, 3).map(h =>
  `${h.symbol}: +${h.gainPercent?.toFixed(2) || 0}%`
).join('\n') || 'N/A'}

BOTTOM PERFORMERS:
${portfolioData.holdings?.sort((a, b) => (a.gainPercent || 0) - (b.gainPercent || 0)).slice(0, 3).map(h =>
  `${h.symbol}: ${h.gainPercent?.toFixed(2) || 0}%`
).join('\n') || 'N/A'}

Analyze:
1. Overall performance vs benchmarks
2. Attribution analysis (what drove returns)
3. Individual position performance
4. Period-over-period comparison`,

      riskAssessment: `Generate a risk assessment section:

RISK METRICS:
- Beta: ${portfolioData.metrics?.beta?.toFixed(2) || 'N/A'}
- Volatility: ${portfolioData.metrics?.volatility?.toFixed(2) || 'N/A'}%
- Sharpe Ratio: ${portfolioData.metrics?.sharpeRatio?.toFixed(2) || 'N/A'}
- Max Drawdown: ${portfolioData.metrics?.maxDrawdown?.toFixed(2) || 'N/A'}%

CONCENTRATION:
- Largest Position: ${portfolioData.holdings?.[0]?.symbol || 'N/A'} (${((portfolioData.holdings?.[0]?.marketValue || 0) / (portfolioData.totalValue || 1) * 100).toFixed(1)}%)

Analyze:
1. Overall risk profile
2. Key risk metrics explanation
3. Stress test scenarios
4. Risk mitigation recommendations`,

      sectorAnalysis: `Generate a sector analysis section:

SECTOR ALLOCATION:
${Object.entries(portfolioData.sectorAllocation || {}).map(([k, v]) => `${k}: ${v.percentage?.toFixed(1) || 0}%`).join('\n') || 'N/A'}

Analyze:
1. Sector weights vs benchmark
2. Sector performance contribution
3. Economic sensitivity
4. Sector outlook and recommendations`,

      holdingsAnalysis: `Generate individual holdings analysis:

TOP 10 HOLDINGS:
${portfolioData.holdings?.slice(0, 10).map(h =>
  `${h.symbol} (${h.name || 'N/A'}):
   - Shares: ${h.shares}
   - Cost Basis: $${h.avgCostBasis?.toFixed(2) || 'N/A'}
   - Current Price: $${h.currentPrice?.toFixed(2) || 'N/A'}
   - Gain/Loss: ${h.gainPercent?.toFixed(2) || 0}%
   - Sector: ${h.sector || 'Unknown'}`
).join('\n\n') || 'No holdings'}

For each major holding, provide:
1. Investment thesis
2. Recent developments
3. Valuation assessment
4. Outlook (Buy/Hold/Sell)`,

      dividendAnalysis: `Generate a dividend analysis section:

DIVIDEND SUMMARY:
- Annual Dividend Income: $${portfolioData.dividends?.annualIncome?.toLocaleString() || 'N/A'}
- Portfolio Yield: ${portfolioData.dividends?.yield?.toFixed(2) || 'N/A'}%

DIVIDEND PAYERS:
${portfolioData.holdings?.filter(h => h.dividendYield > 0).map(h =>
  `${h.symbol}: ${h.dividendYield?.toFixed(2)}% yield`
).join('\n') || 'No dividend data'}

Analyze:
1. Income generation assessment
2. Dividend safety analysis
3. Growth vs income balance
4. Dividend growth outlook`,

      recommendations: `Generate specific recommendations:

Based on the portfolio analysis, provide:

1. IMMEDIATE ACTIONS (Next 30 days)
   - Specific trades to execute
   - Rebalancing needs

2. NEAR-TERM OPPORTUNITIES (1-3 months)
   - Positions to build
   - Watchlist additions

3. RISK MANAGEMENT
   - Positions to monitor
   - Stop-loss levels

4. LONG-TERM STRATEGY
   - Portfolio evolution
   - Target allocation changes

Make all recommendations specific with symbols, price targets, and allocation percentages.`,

      marketOutlook: `Generate a market outlook section relevant to this portfolio:

PORTFOLIO SECTORS: ${Object.keys(portfolioData.sectorAllocation || {}).join(', ') || 'Diversified'}

Provide:
1. Macro economic outlook (2-3 paragraphs)
2. Sector-specific outlooks for portfolio sectors
3. Key risks to monitor
4. Investment implications for this portfolio
5. Recommended positioning adjustments`
    };

    return sectionPrompts[section] || sectionPrompts.executiveSummary;
  },

  /**
   * Chat context prompt
   */
  chatSystemPrompt: (portfolioContext) => `You are WealthPilot AI, an advanced financial assistant.

${portfolioContext ? `USER'S PORTFOLIO CONTEXT:
- Total Value: $${portfolioContext.totalValue?.toLocaleString() || 'N/A'}
- Number of Holdings: ${portfolioContext.holdings?.length || 0}
- Top Holdings: ${portfolioContext.holdings?.slice(0, 5).map(h => h.symbol).join(', ') || 'N/A'}
- YTD Performance: ${portfolioContext.performance?.ytd?.toFixed(2) || 'N/A'}%
` : ''}

Your capabilities:
1. Answer questions about investments and portfolio management
2. Provide market analysis and insights
3. Explain financial concepts and metrics
4. Offer general investment guidance (with appropriate disclaimers)
5. Help users understand their portfolio performance

Guidelines:
- Be conversational but professional
- Use data and metrics when available
- Provide balanced perspectives
- Include appropriate disclaimers for financial advice
- Keep responses focused and actionable

Always remind users that you provide educational information, not personalized financial advice, and they should consult with a licensed financial advisor for specific decisions.`,

  /**
   * Quick insight prompts for dashboard widgets
   */
  quickInsight: {
    portfolioHealth: (data) => `In 2-3 sentences, assess the health of this portfolio:
Value: $${data.totalValue?.toLocaleString()}
Holdings: ${data.holdings?.length}
Diversification: ${data.sectorCount} sectors
Return: ${data.totalGainPercent?.toFixed(2)}%
Give a health score (Good/Fair/Needs Attention) and one key insight.`,

    dailySummary: (data) => `In 2-3 sentences, summarize today's portfolio performance:
Day Change: ${data.dayChange?.toFixed(2)}%
Best Performer: ${data.topGainer}
Worst Performer: ${data.topLoser}
Market Context: ${data.marketChange}%
Be concise and highlight what matters most.`,

    riskAlert: (data) => `Identify any immediate risk concerns:
Top Position: ${data.topPosition}% of portfolio
Sector Concentration: ${data.maxSectorWeight}% in ${data.largestSector}
Recent Volatility: ${data.volatility}%
Reply with either "No immediate concerns" or a brief risk warning.`,

    tradeIdea: (data) => `Suggest one potential trade opportunity:
Cash Available: $${data.cashAvailable}
Underweight Sectors: ${data.underweightSectors?.join(', ')}
Market Conditions: ${data.marketSentiment}
Provide symbol, brief rationale, and position size suggestion.`
  }
};

module.exports = { financialPrompts };
