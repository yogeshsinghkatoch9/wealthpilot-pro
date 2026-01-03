/**
 * Master Report Prompt Template
 * A comprehensive prompt that generates structured financial reports
 * with all data placeholders filled dynamically
 */

const masterReportPrompt = {
  /**
   * System prompt for report generation - establishes AI expertise
   */
  systemPrompt: `You are a CFA-certified Senior Portfolio Analyst at a top-tier wealth management firm.
You create institutional-quality investment reports that are:
- Data-driven with specific metrics and calculations
- Professional and suitable for high-net-worth clients
- Actionable with clear recommendations
- Risk-aware with appropriate disclaimers

IMPORTANT FORMATTING RULES:
1. Use clear section headers with ## markdown
2. Include specific numbers, percentages, and dollar amounts
3. Create bullet points for key insights
4. Use tables for comparative data (markdown format)
5. Provide specific stock symbols and price targets
6. Calculate and show financial formulas with results

FINANCIAL FORMULAS TO USE:
- Total Return = (Current Value - Cost Basis) / Cost Basis × 100
- Portfolio Weight = Position Value / Total Portfolio Value × 100
- Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Standard Deviation
- Value at Risk (95%) = Portfolio Value × 1.645 × Daily Volatility × √(Time Horizon)
- Dividend Yield = Annual Dividend / Current Price × 100
- Beta interpretation: >1 = More volatile than market, <1 = Less volatile

Always show your work when calculating metrics.`,

  /**
   * Master prompt template - fills in portfolio data and generates complete report
   */
  generateMasterPrompt: (portfolioData, reportType = 'comprehensive') => {
    // Extract and format portfolio data
    const {
      name = 'Investment Portfolio',
      holdings = [],
      totalValue = 0,
      totalCostBasis = 0,
      totalGain = 0,
      totalGainPercent = 0,
      sectorAllocation = {},
      dividends = {},
      riskMetrics = {},
      currency = 'USD'
    } = portfolioData;

    // Format holdings data
    const holdingsData = holdings.map((h, i) => ({
      rank: i + 1,
      symbol: h.symbol || 'N/A',
      name: h.name || h.symbol || 'Unknown',
      shares: parseFloat(h.shares) || 0,
      avgCost: parseFloat(h.avgCostBasis) || 0,
      currentPrice: parseFloat(h.currentPrice) || parseFloat(h.avgCostBasis) || 0,
      marketValue: h.marketValue || 0,
      costBasis: h.costBasis || 0,
      gain: h.gain || 0,
      gainPercent: h.gainPercent || 0,
      weight: totalValue > 0 ? ((h.marketValue || 0) / totalValue * 100) : 0,
      sector: h.sector || 'Unknown',
      dividendYield: parseFloat(h.dividendYield) || 0
    }));

    // Create holdings table string
    const holdingsTable = holdingsData.slice(0, 15).map(h =>
      `| ${h.symbol} | ${h.shares.toFixed(2)} | $${h.avgCost.toFixed(2)} | $${h.currentPrice.toFixed(2)} | $${h.marketValue.toLocaleString()} | ${h.gainPercent >= 0 ? '+' : ''}${h.gainPercent.toFixed(2)}% | ${h.weight.toFixed(1)}% | ${h.sector} |`
    ).join('\n');

    // Top gainers and losers
    const sortedByGain = [...holdingsData].sort((a, b) => b.gainPercent - a.gainPercent);
    const topGainers = sortedByGain.slice(0, 5);
    const topLosers = sortedByGain.slice(-5).reverse();

    // Sector breakdown
    const sectorData = Object.entries(sectorAllocation).map(([sector, data]) => ({
      sector,
      value: data.value || 0,
      percentage: data.percentage || 0
    })).sort((a, b) => b.percentage - a.percentage);

    const sectorTable = sectorData.map(s =>
      `| ${s.sector} | $${s.value.toLocaleString()} | ${s.percentage.toFixed(1)}% |`
    ).join('\n');

    // Concentration analysis
    const topPosition = holdingsData[0];
    const topPositionWeight = topPosition?.weight || 0;
    const top5Weight = holdingsData.slice(0, 5).reduce((sum, h) => sum + h.weight, 0);
    const largestSector = sectorData[0];

    // Dividend analysis
    const dividendPayers = holdingsData.filter(h => h.dividendYield > 0);
    const totalAnnualDividends = dividends.annualIncome || 0;
    const portfolioYield = dividends.yield || 0;

    // Risk metrics summary
    const riskSummary = {
      concentrationRisk: topPositionWeight > 20 ? 'HIGH' : topPositionWeight > 10 ? 'MEDIUM' : 'LOW',
      sectorRisk: (largestSector?.percentage || 0) > 40 ? 'HIGH' : (largestSector?.percentage || 0) > 25 ? 'MEDIUM' : 'LOW',
      diversificationScore: riskMetrics.diversificationScore || (100 - topPositionWeight),
      holdingsCount: holdings.length
    };

    // Build the master prompt
    return `Generate a comprehensive ${reportType.toUpperCase()} portfolio analysis report.

═══════════════════════════════════════════════════════════════════════════════
                        PORTFOLIO DATA SNAPSHOT
═══════════════════════════════════════════════════════════════════════════════

PORTFOLIO: ${name}
REPORT DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
CURRENCY: ${currency}

┌─────────────────────────────────────────────────────────────────────────────┐
│ PORTFOLIO SUMMARY                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Total Market Value:     $${totalValue.toLocaleString()}                      │
│ Total Cost Basis:       $${totalCostBasis.toLocaleString()}                  │
│ Total Gain/Loss:        ${totalGain >= 0 ? '+' : ''}$${totalGain.toLocaleString()} (${totalGainPercent >= 0 ? '+' : ''}${totalGainPercent.toFixed(2)}%)│
│ Number of Holdings:     ${holdings.length} positions                         │
│ Portfolio Dividend Yield: ${portfolioYield.toFixed(2)}%                      │
│ Annual Dividend Income: $${totalAnnualDividends.toLocaleString()}            │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
                           HOLDINGS DETAIL
═══════════════════════════════════════════════════════════════════════════════

| Symbol | Shares | Avg Cost | Current | Market Value | Gain/Loss | Weight | Sector |
|--------|--------|----------|---------|--------------|-----------|--------|--------|
${holdingsTable}
${holdings.length > 15 ? `\n(+ ${holdings.length - 15} additional holdings not shown)` : ''}

═══════════════════════════════════════════════════════════════════════════════
                         TOP PERFORMERS
═══════════════════════════════════════════════════════════════════════════════

TOP 5 GAINERS:
${topGainers.map((h, i) => `${i + 1}. ${h.symbol}: +${h.gainPercent.toFixed(2)}% (+$${h.gain.toLocaleString()})`).join('\n')}

BOTTOM 5 PERFORMERS:
${topLosers.map((h, i) => `${i + 1}. ${h.symbol}: ${h.gainPercent.toFixed(2)}% ($${h.gain.toLocaleString()})`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
                         SECTOR ALLOCATION
═══════════════════════════════════════════════════════════════════════════════

| Sector | Value | Weight |
|--------|-------|--------|
${sectorTable}

═══════════════════════════════════════════════════════════════════════════════
                         CONCENTRATION ANALYSIS
═══════════════════════════════════════════════════════════════════════════════

- Largest Position: ${topPosition?.symbol || 'N/A'} at ${topPositionWeight.toFixed(1)}% of portfolio
- Top 5 Holdings: ${top5Weight.toFixed(1)}% of portfolio
- Largest Sector: ${largestSector?.sector || 'N/A'} at ${largestSector?.percentage?.toFixed(1) || 0}%
- Concentration Risk Level: ${riskSummary.concentrationRisk}
- Sector Concentration Risk: ${riskSummary.sectorRisk}
- Diversification Score: ${riskSummary.diversificationScore.toFixed(0)}/100

═══════════════════════════════════════════════════════════════════════════════
                         DIVIDEND PROFILE
═══════════════════════════════════════════════════════════════════════════════

- Dividend-Paying Holdings: ${dividendPayers.length} of ${holdings.length} positions
- Total Annual Dividend Income: $${totalAnnualDividends.toLocaleString()}
- Portfolio Yield: ${portfolioYield.toFixed(2)}% (vs S&P 500 ~1.5%)
- Monthly Income Estimate: $${(totalAnnualDividends / 12).toLocaleString()}
- Quarterly Income Estimate: $${(totalAnnualDividends / 4).toLocaleString()}

Top Dividend Payers:
${dividendPayers.slice(0, 5).map(h => `- ${h.symbol}: ${h.dividendYield.toFixed(2)}% yield`).join('\n') || 'No dividend-paying holdings'}

═══════════════════════════════════════════════════════════════════════════════
                    REPORT GENERATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

Based on the portfolio data above, generate a professional investment report with these sections:

## 1. EXECUTIVE SUMMARY (2-3 paragraphs)
- Overall portfolio health assessment
- Key performance highlights
- Main risks and opportunities
- One-sentence outlook

## 2. PORTFOLIO OVERVIEW
- Asset allocation analysis
- Investment style characterization (Growth/Value/Blend)
- Comparison to relevant benchmarks
- Liquidity assessment

## 3. PERFORMANCE ANALYSIS
- Total return analysis with context
- Attribution analysis (what drove returns)
- Benchmark comparison (S&P 500, appropriate sector indices)
- Risk-adjusted performance metrics

## 4. RISK ASSESSMENT
Calculate and explain:
- Concentration Risk: Analyze position and sector concentration
- Market Risk: Beta estimation based on holdings
- Volatility Risk: Based on holding characteristics
- Downside Protection: Defensive vs cyclical mix
- Provide a Risk Score (1-10) with justification

## 5. SECTOR ANALYSIS
- Overweight/underweight vs S&P 500
- Sector outlook for each major allocation
- Rotation recommendations if any

## 6. INDIVIDUAL HOLDINGS ANALYSIS
For the top 10 holdings, provide:
- Investment thesis
- Current valuation assessment
- Recommendation (Strong Buy / Buy / Hold / Sell / Strong Sell)
- Target price if applicable

## 7. DIVIDEND ANALYSIS
- Income sustainability assessment
- Dividend growth potential
- Tax efficiency considerations
- Income optimization suggestions

## 8. RECOMMENDATIONS
Provide specific, actionable recommendations:
- IMMEDIATE ACTIONS (next 30 days)
- POSITIONS TO ADD (with target allocation)
- POSITIONS TO REDUCE/SELL (with reasoning)
- REBALANCING ACTIONS

## 9. MARKET OUTLOOK
- Macro environment assessment
- Sector-specific outlooks
- Risk scenarios (bull/base/bear cases)
- Portfolio positioning recommendations

## 10. CONCLUSION
- Summary of key findings
- Priority action items
- Next review date recommendation

FORMAT REQUIREMENTS:
- Use markdown formatting
- Include specific numbers and percentages
- Create tables where appropriate
- Be specific with stock symbols and recommendations
- Show calculations for key metrics
- Keep each section focused and actionable`;
  },

  /**
   * Generate section-specific prompts for targeted analysis
   */
  sectionPrompt: (section, portfolioData) => {
    const prompts = {
      executiveSummary: () => `Generate a 3-paragraph executive summary for this portfolio:
Portfolio Value: $${portfolioData.totalValue?.toLocaleString()}
Total Return: ${portfolioData.totalGainPercent?.toFixed(2)}%
Holdings: ${portfolioData.holdings?.length} positions
Top Sector: ${Object.keys(portfolioData.sectorAllocation || {})[0] || 'Diversified'}

Focus on: overall health, key achievements, main concerns, and outlook.`,

      quickAnalysis: () => `In 4-5 bullet points, summarize the key insights for this portfolio:
- Value: $${portfolioData.totalValue?.toLocaleString()}
- Return: ${portfolioData.totalGainPercent?.toFixed(2)}%
- Top holding: ${portfolioData.holdings?.[0]?.symbol} (${((portfolioData.holdings?.[0]?.marketValue || 0) / (portfolioData.totalValue || 1) * 100).toFixed(1)}%)
- Dividend yield: ${portfolioData.dividends?.yield?.toFixed(2)}%

Be concise and actionable.`,

      riskOnly: () => `Analyze only the RISK profile of this portfolio:
${JSON.stringify({
  holdings: portfolioData.holdings?.length,
  topPosition: portfolioData.holdings?.[0],
  sectorAllocation: portfolioData.sectorAllocation,
  riskMetrics: portfolioData.riskMetrics
}, null, 2)}

Provide:
1. Risk Score (1-10)
2. Top 3 risk factors
3. Mitigation recommendations`,

      recommendationsOnly: () => `Based on this portfolio, provide 5 specific recommendations:
${JSON.stringify({
  holdings: portfolioData.holdings?.slice(0, 10).map(h => ({
    symbol: h.symbol,
    weight: ((h.marketValue || 0) / (portfolioData.totalValue || 1) * 100).toFixed(1) + '%',
    gain: h.gainPercent?.toFixed(2) + '%',
    sector: h.sector
  })),
  sectorAllocation: portfolioData.sectorAllocation
}, null, 2)}

Format: Symbol | Action | Rationale | Target Allocation`
    };

    return prompts[section] ? prompts[section]() : masterReportPrompt.generateMasterPrompt(portfolioData, 'comprehensive');
  },

  /**
   * Parse AI response into structured sections
   */
  parseReportResponse: (aiResponse) => {
    const sections = {};
    const sectionHeaders = [
      'EXECUTIVE SUMMARY',
      'PORTFOLIO OVERVIEW',
      'PERFORMANCE ANALYSIS',
      'RISK ASSESSMENT',
      'SECTOR ANALYSIS',
      'INDIVIDUAL HOLDINGS ANALYSIS',
      'DIVIDEND ANALYSIS',
      'RECOMMENDATIONS',
      'MARKET OUTLOOK',
      'CONCLUSION'
    ];

    let currentSection = 'intro';
    let currentContent = [];

    const lines = aiResponse.split('\n');

    for (const line of lines) {
      // Check if this line is a section header
      let foundSection = false;
      for (const header of sectionHeaders) {
        if (line.toUpperCase().includes(header)) {
          // Save previous section
          if (currentContent.length > 0) {
            sections[currentSection] = currentContent.join('\n').trim();
          }
          currentSection = header.toLowerCase().replace(/\s+/g, '_');
          currentContent = [];
          foundSection = true;
          break;
        }
      }

      if (!foundSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }
};

module.exports = { masterReportPrompt };
