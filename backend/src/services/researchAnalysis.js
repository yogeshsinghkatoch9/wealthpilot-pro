/**
 * Research Analysis Service
 * Provides stock comparison, peer rankings, insider trading analysis, and earnings estimates
 */

const logger = require('../utils/logger');

class ResearchAnalysisService {
  /**
   * Compare multiple stocks across various metrics
   * @param {Object[]} stocks - Array of stock data
   * @returns {Object} Comparison results
   */
  compareStocks(stocks) {
    if (!stocks || stocks.length < 2) {
      return { error: 'Need at least 2 stocks to compare' };
    }

    const metrics = [
      { key: 'price', label: 'Price', format: 'currency', higher: 'neutral' },
      { key: 'marketCap', label: 'Market Cap', format: 'compact', higher: 'better' },
      { key: 'peRatio', label: 'P/E Ratio', format: 'number', higher: 'worse' },
      { key: 'psRatio', label: 'P/S Ratio', format: 'number', higher: 'worse' },
      { key: 'dividendYield', label: 'Dividend Yield', format: 'percent', higher: 'better' },
      { key: 'beta', label: 'Beta', format: 'number', higher: 'neutral' },
      { key: 'eps', label: 'EPS', format: 'currency', higher: 'better' },
      { key: 'revenue', label: 'Revenue', format: 'compact', higher: 'better' },
      { key: 'grossMargin', label: 'Gross Margin', format: 'percent', higher: 'better' },
      { key: 'operatingMargin', label: 'Operating Margin', format: 'percent', higher: 'better' },
      { key: 'netMargin', label: 'Net Margin', format: 'percent', higher: 'better' },
      { key: 'roe', label: 'ROE', format: 'percent', higher: 'better' },
      { key: 'roa', label: 'ROA', format: 'percent', higher: 'better' },
      { key: 'debtToEquity', label: 'Debt/Equity', format: 'number', higher: 'worse' },
      { key: 'currentRatio', label: 'Current Ratio', format: 'number', higher: 'better' },
      { key: 'quickRatio', label: 'Quick Ratio', format: 'number', higher: 'better' },
      { key: 'revenueGrowth', label: 'Revenue Growth', format: 'percent', higher: 'better' },
      { key: 'earningsGrowth', label: 'Earnings Growth', format: 'percent', higher: 'better' },
      { key: 'volatility', label: '52W Volatility', format: 'percent', higher: 'worse' },
      { key: 'ytdReturn', label: 'YTD Return', format: 'percent', higher: 'better' }
    ];

    const comparison = {
      symbols: stocks.map(s => s.symbol),
      companies: stocks.map(s => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        industry: s.industry
      })),
      metrics: {},
      rankings: {},
      winner: null
    };

    // Compare each metric
    metrics.forEach(metric => {
      const values = stocks.map(s => ({
        symbol: s.symbol,
        value: s[metric.key],
        formatted: this.formatValue(s[metric.key], metric.format)
      }));

      // Determine leader for this metric
      const validValues = values.filter(v => v.value !== null && v.value !== undefined && !isNaN(v.value));

      let leader = null;
      if (validValues.length > 0) {
        if (metric.higher === 'better') {
          leader = validValues.reduce((a, b) => a.value > b.value ? a : b).symbol;
        } else if (metric.higher === 'worse') {
          leader = validValues.reduce((a, b) => a.value < b.value ? a : b).symbol;
        }
      }

      comparison.metrics[metric.key] = {
        label: metric.label,
        values,
        leader,
        higherIsBetter: metric.higher === 'better'
      };
    });

    // Calculate overall rankings
    const scores = {};
    stocks.forEach(s => {
      scores[s.symbol] = 0;
    });

    Object.values(comparison.metrics).forEach(metric => {
      if (metric.leader) {
        scores[metric.leader] += 1;
      }
    });

    comparison.rankings = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, score], index) => ({
        rank: index + 1,
        symbol,
        name: stocks.find(s => s.symbol === symbol)?.name || symbol,
        metricsWon: score,
        percentage: Math.round((score / metrics.length) * 100)
      }));

    comparison.winner = comparison.rankings[0];

    return comparison;
  }

  /**
   * Format value based on type
   */
  formatValue(value, format) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';

    switch (format) {
      case 'currency':
        return `$${value.toFixed(2)}`;
      case 'percent':
        return `${(value * 100).toFixed(2)}%`;
      case 'compact':
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toFixed(2)}`;
      case 'number':
      default:
        return value.toFixed(2);
    }
  }

  /**
   * Calculate peer rankings
   * @param {Object[]} peers - Array of peer stocks with metrics
   * @param {string} sortBy - Metric to sort by
   * @returns {Object} Peer rankings
   */
  calculatePeerRankings(peers, sortBy = 'marketCap') {
    if (!peers || peers.length === 0) {
      return { error: 'No peers provided' };
    }

    // Sort by specified metric
    const sorted = [...peers].sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });

    // Calculate relative position
    const rankings = sorted.map((peer, index) => {
      // Calculate percentile rankings for key metrics
      const metrics = {};

      ['marketCap', 'peRatio', 'grossMargin', 'roe', 'dividendYield', 'revenueGrowth'].forEach(key => {
        if (peer[key] !== undefined) {
          const allValues = peers.map(p => p[key]).filter(v => v !== undefined && !isNaN(v)).sort((a, b) => b - a);
          const position = allValues.indexOf(peer[key]);
          metrics[key] = {
            value: peer[key],
            rank: position + 1,
            percentile: Math.round(((allValues.length - position) / allValues.length) * 100)
          };
        }
      });

      return {
        rank: index + 1,
        symbol: peer.symbol,
        name: peer.name,
        sector: peer.sector,
        industry: peer.industry,
        price: peer.price,
        marketCap: peer.marketCap,
        metrics,
        overallScore: this.calculatePeerScore(metrics)
      };
    });

    // Calculate sector averages
    const sectorAvg = {};
    ['marketCap', 'peRatio', 'grossMargin', 'roe', 'dividendYield'].forEach(key => {
      const values = peers.map(p => p[key]).filter(v => v !== undefined && !isNaN(v));
      sectorAvg[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });

    return {
      sector: peers[0]?.sector || 'Unknown',
      industry: peers[0]?.industry || 'Unknown',
      peerCount: peers.length,
      sortedBy: sortBy,
      rankings,
      sectorAverages: sectorAvg,
      topPerformer: rankings[0],
      bottomPerformer: rankings[rankings.length - 1]
    };
  }

  /**
   * Calculate peer score based on percentile rankings
   */
  calculatePeerScore(metrics) {
    const weights = {
      marketCap: 0.1,
      peRatio: 0.15,
      grossMargin: 0.2,
      roe: 0.25,
      dividendYield: 0.1,
      revenueGrowth: 0.2
    };

    let score = 0;
    let totalWeight = 0;

    Object.entries(weights).forEach(([key, weight]) => {
      if (metrics[key]?.percentile !== undefined) {
        // For P/E ratio, lower is better so invert percentile
        const percentile = key === 'peRatio' ? (100 - metrics[key].percentile) : metrics[key].percentile;
        score += percentile * weight;
        totalWeight += weight;
      }
    });

    return totalWeight > 0 ? Math.round(score / totalWeight) : 0;
  }

  /**
   * Analyze insider trading activity
   * @param {Object[]} trades - Array of insider trades
   * @returns {Object} Insider trading analysis
   */
  analyzeInsiderTrading(trades) {
    if (!trades || trades.length === 0) {
      return { error: 'No insider trades provided' };
    }

    // Separate buys and sells
    const buys = trades.filter(t => t.type === 'buy' || t.type === 'P-Purchase');
    const sells = trades.filter(t => t.type === 'sell' || t.type === 'S-Sale');

    // Calculate totals
    const totalBuyValue = buys.reduce((sum, t) => sum + (t.shares * t.price), 0);
    const totalSellValue = sells.reduce((sum, t) => sum + (t.shares * t.price), 0);
    const totalBuyShares = buys.reduce((sum, t) => sum + t.shares, 0);
    const totalSellShares = sells.reduce((sum, t) => sum + t.shares, 0);

    // Calculate buy/sell ratio
    const buySellRatio = totalSellValue > 0 ? totalBuyValue / totalSellValue : totalBuyValue > 0 ? Infinity : 0;

    // Analyze by insider type
    const byInsiderType = {};
    trades.forEach(t => {
      const type = t.insiderTitle || t.relationship || 'Unknown';
      if (!byInsiderType[type]) {
        byInsiderType[type] = { buys: 0, sells: 0, buyValue: 0, sellValue: 0 };
      }
      if (t.type === 'buy' || t.type === 'P-Purchase') {
        byInsiderType[type].buys++;
        byInsiderType[type].buyValue += t.shares * t.price;
      } else {
        byInsiderType[type].sells++;
        byInsiderType[type].sellValue += t.shares * t.price;
      }
    });

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTrades = trades.filter(t => new Date(t.date) >= thirtyDaysAgo);
    const recentBuys = recentTrades.filter(t => t.type === 'buy' || t.type === 'P-Purchase');
    const recentSells = recentTrades.filter(t => t.type === 'sell' || t.type === 'S-Sale');

    // Calculate sentiment
    let sentiment;
    if (buySellRatio > 2) {
      sentiment = { label: 'Very Bullish', score: 90 };
    } else if (buySellRatio > 1) {
      sentiment = { label: 'Bullish', score: 70 };
    } else if (buySellRatio > 0.5) {
      sentiment = { label: 'Neutral', score: 50 };
    } else if (buySellRatio > 0.2) {
      sentiment = { label: 'Bearish', score: 30 };
    } else {
      sentiment = { label: 'Very Bearish', score: 10 };
    }

    // Notable trades (largest)
    const sortedTrades = [...trades].sort((a, b) => (b.shares * b.price) - (a.shares * a.price));
    const notableTrades = sortedTrades.slice(0, 5);

    return {
      summary: {
        totalTrades: trades.length,
        buyCount: buys.length,
        sellCount: sells.length,
        totalBuyValue: Math.round(totalBuyValue * 100) / 100,
        totalSellValue: Math.round(totalSellValue * 100) / 100,
        netValue: Math.round((totalBuyValue - totalSellValue) * 100) / 100,
        buySellRatio: buySellRatio === Infinity ? 'All Buys' : Math.round(buySellRatio * 100) / 100
      },
      sentiment,
      recentActivity: {
        last30Days: recentTrades.length,
        recentBuys: recentBuys.length,
        recentSells: recentSells.length,
        trend: recentBuys.length > recentSells.length ? 'Increasing Buying' :
          recentBuys.length < recentSells.length ? 'Increasing Selling' : 'Mixed'
      },
      byInsiderType,
      notableTrades: notableTrades.map(t => ({
        date: t.date,
        insider: t.insiderName || t.insider,
        title: t.insiderTitle || t.relationship,
        type: t.type === 'buy' || t.type === 'P-Purchase' ? 'Buy' : 'Sell',
        shares: t.shares,
        price: t.price,
        value: Math.round(t.shares * t.price * 100) / 100
      })),
      interpretation: this.getInsiderInterpretation(sentiment, recentTrades.length, buySellRatio)
    };
  }

  /**
   * Get interpretation of insider activity
   */
  getInsiderInterpretation(sentiment, recentActivity, buySellRatio) {
    const points = [];

    if (sentiment.score >= 70) {
      points.push('Insiders are buying significantly more than selling, suggesting confidence in the stock');
    } else if (sentiment.score <= 30) {
      points.push('Insiders are selling significantly more than buying, which may indicate concerns');
    }

    if (recentActivity > 10) {
      points.push('High insider activity in recent days suggests something may be happening');
    } else if (recentActivity === 0) {
      points.push('No recent insider activity');
    }

    if (buySellRatio === Infinity) {
      points.push('Only buy transactions recorded - strong bullish signal');
    } else if (buySellRatio === 0) {
      points.push('Only sell transactions recorded - may indicate insider concerns');
    }

    return points.length > 0 ? points : ['Normal insider trading patterns'];
  }

  /**
   * Analyze earnings estimates and whispers
   * @param {Object} earningsData - Earnings data with estimates
   * @returns {Object} Earnings analysis
   */
  analyzeEarnings(earningsData) {
    const {
      symbol,
      reportDate,
      fiscalQuarter,
      fiscalYear,
      estimates = [],
      actualEps = null,
      consensusEps = null,
      revenueEstimates = [],
      actualRevenue = null,
      consensusRevenue = null,
      whisperNumber = null,
      priorQuarters = []
    } = earningsData;

    // Calculate estimate statistics
    const epsEstimates = estimates.filter(e => e.eps !== undefined).map(e => e.eps);
    const avgEps = epsEstimates.length > 0
      ? epsEstimates.reduce((a, b) => a + b, 0) / epsEstimates.length
      : consensusEps || 0;

    const highEps = epsEstimates.length > 0 ? Math.max(...epsEstimates) : avgEps;
    const lowEps = epsEstimates.length > 0 ? Math.min(...epsEstimates) : avgEps;

    // Revenue estimates
    const revEstimates = revenueEstimates.filter(e => e.revenue !== undefined).map(e => e.revenue);
    const avgRevenue = revEstimates.length > 0
      ? revEstimates.reduce((a, b) => a + b, 0) / revEstimates.length
      : consensusRevenue || 0;

    // Calculate surprise if actual is available
    let epsSurprise = null;
    let revenueSurprise = null;
    let surprisePercent = null;

    if (actualEps !== null && consensusEps !== null && consensusEps !== 0) {
      epsSurprise = actualEps - consensusEps;
      surprisePercent = ((actualEps - consensusEps) / Math.abs(consensusEps)) * 100;
    }

    if (actualRevenue !== null && consensusRevenue !== null && consensusRevenue !== 0) {
      revenueSurprise = ((actualRevenue - consensusRevenue) / consensusRevenue) * 100;
    }

    // Analyze prior quarter performance
    const beatRate = priorQuarters.length > 0
      ? priorQuarters.filter(q => q.actualEps > q.estimatedEps).length / priorQuarters.length
      : null;

    const avgSurprise = priorQuarters.length > 0
      ? priorQuarters.reduce((sum, q) => sum + (q.actualEps - q.estimatedEps), 0) / priorQuarters.length
      : 0;

    // Whisper analysis
    let whisperAnalysis = null;
    if (whisperNumber !== null) {
      const whisperVsConsensus = ((whisperNumber - consensusEps) / Math.abs(consensusEps || 1)) * 100;
      whisperAnalysis = {
        whisperNumber,
        consensusEps,
        difference: Math.round(whisperVsConsensus * 100) / 100,
        interpretation: whisperVsConsensus > 5 ? 'Street expects beat' :
          whisperVsConsensus < -5 ? 'Street expects miss' : 'In line with consensus'
      };
    }

    return {
      symbol,
      reportDate,
      quarter: `Q${fiscalQuarter} ${fiscalYear}`,
      estimates: {
        eps: {
          consensus: Math.round((consensusEps || avgEps) * 100) / 100,
          high: Math.round(highEps * 100) / 100,
          low: Math.round(lowEps * 100) / 100,
          numberOfEstimates: epsEstimates.length || estimates.length
        },
        revenue: {
          consensus: Math.round((consensusRevenue || avgRevenue) / 1e6) * 1e6,
          formatted: this.formatValue((consensusRevenue || avgRevenue), 'compact'),
          numberOfEstimates: revEstimates.length || revenueEstimates.length
        }
      },
      actual: actualEps !== null ? {
        eps: Math.round(actualEps * 100) / 100,
        revenue: actualRevenue,
        epsSurprise: epsSurprise !== null ? Math.round(epsSurprise * 100) / 100 : null,
        surprisePercent: surprisePercent !== null ? Math.round(surprisePercent * 100) / 100 : null,
        beat: epsSurprise !== null ? epsSurprise > 0 : null
      } : null,
      whisper: whisperAnalysis,
      history: {
        priorQuarters: priorQuarters.map(q => ({
          quarter: q.quarter,
          estimated: Math.round(q.estimatedEps * 100) / 100,
          actual: Math.round(q.actualEps * 100) / 100,
          surprise: Math.round((q.actualEps - q.estimatedEps) * 100) / 100,
          beat: q.actualEps > q.estimatedEps
        })),
        beatRate: beatRate !== null ? Math.round(beatRate * 100) : null,
        avgSurprise: Math.round(avgSurprise * 100) / 100,
        trend: this.getEarningsTrend(priorQuarters)
      },
      guidance: earningsData.guidance || null,
      analystActions: this.summarizeAnalystActions(estimates)
    };
  }

  /**
   * Get earnings trend from prior quarters
   */
  getEarningsTrend(priorQuarters) {
    if (priorQuarters.length < 2) return 'Insufficient Data';

    const recentSurprises = priorQuarters.slice(-4).map(q => q.actualEps - q.estimatedEps);
    const avgRecent = recentSurprises.reduce((a, b) => a + b, 0) / recentSurprises.length;
    const allPositive = recentSurprises.every(s => s > 0);
    const allNegative = recentSurprises.every(s => s < 0);

    if (allPositive) return 'Consistent Beats';
    if (allNegative) return 'Consistent Misses';
    if (avgRecent > 0) return 'Generally Beats';
    if (avgRecent < 0) return 'Generally Misses';
    return 'Mixed';
  }

  /**
   * Summarize analyst actions
   */
  summarizeAnalystActions(estimates) {
    const upgrades = estimates.filter(e => e.action === 'upgrade').length;
    const downgrades = estimates.filter(e => e.action === 'downgrade').length;
    const initiations = estimates.filter(e => e.action === 'initiate').length;

    return {
      upgrades,
      downgrades,
      initiations,
      netChange: upgrades - downgrades,
      sentiment: upgrades > downgrades ? 'Positive' : upgrades < downgrades ? 'Negative' : 'Neutral'
    };
  }

  /**
   * Get mutual fund holdings
   * @param {string} symbol - Stock symbol
   * @param {Object[]} fundHoldings - Array of fund holdings
   * @returns {Object} Mutual fund analysis
   */
  analyzeMutualFundHoldings(symbol, fundHoldings) {
    if (!fundHoldings || fundHoldings.length === 0) {
      return { error: 'No fund holdings data' };
    }

    // Sort by shares held
    const sorted = [...fundHoldings].sort((a, b) => b.shares - a.shares);

    // Calculate totals
    const totalShares = fundHoldings.reduce((sum, f) => sum + f.shares, 0);
    const totalValue = fundHoldings.reduce((sum, f) => sum + f.value, 0);

    // Analyze changes
    const increasing = fundHoldings.filter(f => f.change > 0);
    const decreasing = fundHoldings.filter(f => f.change < 0);
    const unchanged = fundHoldings.filter(f => f.change === 0);

    const netChange = fundHoldings.reduce((sum, f) => sum + f.change, 0);

    return {
      symbol,
      summary: {
        totalFunds: fundHoldings.length,
        totalShares,
        totalValue: Math.round(totalValue * 100) / 100,
        avgSharesPerFund: Math.round(totalShares / fundHoldings.length)
      },
      changes: {
        increasing: increasing.length,
        decreasing: decreasing.length,
        unchanged: unchanged.length,
        netShareChange: netChange,
        sentiment: netChange > 0 ? 'Accumulating' : netChange < 0 ? 'Distributing' : 'Stable'
      },
      topHolders: sorted.slice(0, 10).map(f => ({
        fund: f.fundName,
        shares: f.shares,
        value: f.value,
        percentOfFund: f.percentOfFund,
        change: f.change,
        changePercent: f.changePercent
      })),
      recentChanges: fundHoldings
        .filter(f => Math.abs(f.change) > 0)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 5)
        .map(f => ({
          fund: f.fundName,
          action: f.change > 0 ? 'Added' : 'Reduced',
          shares: Math.abs(f.change),
          percentChange: f.changePercent
        }))
    };
  }
}

module.exports = new ResearchAnalysisService();
