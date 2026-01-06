const { prisma } = require('../db/simpleDb');
const MarketDataService = require('./marketData');
const logger = require('../utils/logger');


/**
 * Analytics Service
 * Calculates portfolio performance, risk metrics, and allocation
 */
class AnalyticsService {

  /**
   * Calculate portfolio performance for given period
   */
  static async calculatePerformance(portfolio, period = '1M') {
    const holdings = portfolio.holdings || [];
    const snapshots = portfolio.snapshots || [];
    
    // Get current values
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);
    
    let currentValue = Number(portfolio.cashBalance);
    let totalCost = 0;
    let dayChange = 0;
    
    const holdingPerformance = holdings.map(h => {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const costBasis = Number(h.avgCostBasis);
      const price = Number(quote.price) || costBasis;
      const prevClose = Number(quote.previousClose) || price;
      
      const marketValue = shares * price;
      const cost = shares * costBasis;
      
      currentValue += marketValue;
      totalCost += cost;
      dayChange += shares * (price - prevClose);
      
      return {
        symbol: h.symbol,
        shares,
        costBasis,
        price,
        marketValue,
        gain: marketValue - cost,
        gainPct: ((price - costBasis) / costBasis) * 100,
        dayChange: shares * (price - prevClose),
        dayChangePct: ((price - prevClose) / prevClose) * 100,
        weight: 0 // Will calculate after total
      };
    });

    // Calculate weights
    holdingPerformance.forEach(h => {
      h.weight = currentValue > 0 ? (h.marketValue / currentValue) * 100 : 0;
    });

    // Get period start value from snapshots
    const periodDays = this.getPeriodDays(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    
    const startSnapshot = snapshots.find(s => 
      new Date(s.snapshotDate) <= startDate
    );
    
    const startValue = startSnapshot 
      ? Number(startSnapshot.totalValue) 
      : totalCost + Number(portfolio.cashBalance);

    // Calculate period returns
    const periodReturn = currentValue - startValue;
    const periodReturnPct = startValue > 0 
      ? (periodReturn / startValue) * 100 
      : 0;

    // Calculate time-weighted return from snapshots
    const periodSnapshots = snapshots.filter(s => 
      new Date(s.snapshotDate) >= startDate
    ).reverse();

    let twrReturn = 0;
    if (periodSnapshots.length > 1) {
      for (let i = 1; i < periodSnapshots.length; i++) {
        const prev = Number(periodSnapshots[i - 1].totalValue);
        const curr = Number(periodSnapshots[i].totalValue);
        if (prev > 0) {
          twrReturn = (1 + twrReturn) * (curr / prev) - 1;
        }
      }
      twrReturn *= 100;
    }

    // Build chart data from snapshots
    const chartData = periodSnapshots.map(s => ({
      date: s.snapshotDate,
      value: Number(s.totalValue),
      dayGain: Number(s.dayGain),
      dayGainPct: Number(s.dayGainPct)
    }));

    // Add current day
    chartData.push({
      date: new Date(),
      value: currentValue,
      dayGain: dayChange,
      dayGainPct: (currentValue - dayChange) > 0 
        ? (dayChange / (currentValue - dayChange)) * 100 
        : 0
    });

    // Calculate benchmark comparison
    const benchmarkSymbol = portfolio.benchmark || 'SPY';
    const benchmarkHistory = await MarketDataService.getHistoricalPrices(benchmarkSymbol, periodDays);
    
    let benchmarkReturn = 0;
    if (benchmarkHistory.length > 1) {
      const startPrice = Number(benchmarkHistory[0].close);
      const endPrice = Number(benchmarkHistory[benchmarkHistory.length - 1].close);
      benchmarkReturn = ((endPrice - startPrice) / startPrice) * 100;
    }

    const alpha = periodReturnPct - benchmarkReturn;

    return {
      currentValue,
      totalCost,
      cashBalance: Number(portfolio.cashBalance),
      totalGain: currentValue - totalCost - Number(portfolio.cashBalance),
      totalGainPct: totalCost > 0 
        ? ((currentValue - totalCost - Number(portfolio.cashBalance)) / totalCost) * 100 
        : 0,
      dayChange,
      dayChangePct: (currentValue - dayChange) > 0 
        ? (dayChange / (currentValue - dayChange)) * 100 
        : 0,
      periodReturn,
      periodReturnPct,
      twrReturn,
      benchmark: {
        symbol: benchmarkSymbol,
        return: benchmarkReturn
      },
      alpha,
      holdings: holdingPerformance,
      chartData,
      period,
      startDate,
      endDate: new Date()
    };
  }

  /**
   * Calculate portfolio allocation breakdown
   */
  static async calculateAllocation(portfolio) {
    const holdings = portfolio.holdings || [];
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalValue = Number(portfolio.cashBalance);
    const holdingData = [];

    // Calculate values
    for (const h of holdings) {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const price = Number(quote.price) || Number(h.avgCostBasis);
      const marketValue = shares * price;
      totalValue += marketValue;
      
      holdingData.push({
        symbol: h.symbol,
        name: quote.name || h.symbol,
        sector: quote.sector || h.sector || 'Unknown',
        shares,
        price,
        marketValue
      });
    }

    // Calculate weights
    const byHolding = holdingData.map(h => ({
      ...h,
      weight: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0
    })).sort((a, b) => b.weight - a.weight);

    // Group by sector
    const sectorMap = {};
    for (const h of holdingData) {
      if (!sectorMap[h.sector]) {
        sectorMap[h.sector] = { value: 0, holdings: [] };
      }
      sectorMap[h.sector].value += h.marketValue;
      sectorMap[h.sector].holdings.push(h.symbol);
    }

    const bySector = Object.entries(sectorMap)
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        weight: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        holdingsCount: data.holdings.length,
        holdings: data.holdings
      }))
      .sort((a, b) => b.weight - a.weight);

    // Add cash
    const cashWeight = totalValue > 0 
      ? (Number(portfolio.cashBalance) / totalValue) * 100 
      : 0;

    // Calculate concentration metrics
    const top5Weight = byHolding.slice(0, 5).reduce((sum, h) => sum + h.weight, 0);
    const top10Weight = byHolding.slice(0, 10).reduce((sum, h) => sum + h.weight, 0);

    // Herfindahl Index (concentration)
    const hhi = byHolding.reduce((sum, h) => sum + Math.pow(h.weight / 100, 2), 0);

    return {
      totalValue,
      holdingsCount: holdings.length,
      byHolding,
      bySector,
      cash: {
        value: Number(portfolio.cashBalance),
        weight: cashWeight
      },
      concentration: {
        top5Weight,
        top10Weight,
        herfindahlIndex: hhi,
        effectivePositions: hhi > 0 ? 1 / hhi : 0
      }
    };
  }

  /**
   * Calculate dividend analytics
   */
  static async calculateDividends(portfolio) {
    const holdings = portfolio.holdings || [];
    const transactions = portfolio.transactions || [];
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalValue = 0;
    let annualDividends = 0;
    const holdingDividends = [];

    for (const h of holdings) {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const price = Number(quote.price) || Number(h.avgCostBasis);
      const marketValue = shares * price;
      const divYield = Number(quote.dividendYield) || 0;
      const annualDiv = Number(quote.dividend) || 0;
      const holdingAnnualDiv = shares * annualDiv;

      totalValue += marketValue;
      annualDividends += holdingAnnualDiv;

      // Get dividend history for this symbol
      const divHistory = await MarketDataService.getDividendHistory(h.symbol);

      holdingDividends.push({
        symbol: h.symbol,
        shares,
        price,
        marketValue,
        dividendYield: divYield,
        annualDividend: annualDiv,
        annualIncome: holdingAnnualDiv,
        quarterlyIncome: holdingAnnualDiv / 4,
        monthlyIncome: holdingAnnualDiv / 12,
        history: divHistory.slice(0, 8)
      });
    }

    // Calculate received dividends from transactions
    const dividendTransactions = transactions.filter(t => t.type === 'dividend');
    const receivedByYear = {};
    const receivedByMonth = {};
    let totalReceived = 0;

    for (const t of dividendTransactions) {
      const amount = Number(t.amount);
      const year = new Date(t.executedAt).getFullYear();
      const month = `${year}-${String(new Date(t.executedAt).getMonth() + 1).padStart(2, '0')}`;

      totalReceived += amount;
      receivedByYear[year] = (receivedByYear[year] || 0) + amount;
      receivedByMonth[month] = (receivedByMonth[month] || 0) + amount;
    }

    // Portfolio yield
    const portfolioYield = totalValue > 0 ? (annualDividends / totalValue) * 100 : 0;

    // Yield on cost
    let totalCost = 0;
    for (const h of holdings) {
      totalCost += Number(h.shares) * Number(h.avgCostBasis);
    }
    const yieldOnCost = totalCost > 0 ? (annualDividends / totalCost) * 100 : 0;

    // Monthly projection
    const monthlyProjection = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 0; i < 12; i++) {
      monthlyProjection.push({
        month: months[i],
        projected: annualDividends / 12
        // In real implementation, would calculate based on actual ex-dates
      });
    }

    return {
      portfolioYield,
      yieldOnCost,
      annualDividends,
      monthlyDividends: annualDividends / 12,
      quarterlyDividends: annualDividends / 4,
      totalReceived,
      receivedByYear: Object.entries(receivedByYear)
        .map(([year, amount]) => ({ year: parseInt(year), amount }))
        .sort((a, b) => b.year - a.year),
      receivedByMonth: Object.entries(receivedByMonth)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      holdings: holdingDividends.sort((a, b) => b.annualIncome - a.annualIncome),
      monthlyProjection
    };
  }

  /**
   * Calculate risk metrics
   */
  static async calculateRisk(portfolio) {
    const holdings = portfolio.holdings || [];
    const symbols = holdings.map(h => h.symbol);
    const quotes = await MarketDataService.getQuotes(symbols);

    // Get historical data for calculations
    const historicalData = {};
    for (const symbol of symbols) {
      historicalData[symbol] = await MarketDataService.getHistoricalPrices(symbol, 365);
    }

    // Calculate daily returns for each holding
    const holdingReturns = {};
    for (const [symbol, history] of Object.entries(historicalData)) {
      const returns = [];
      for (let i = 1; i < history.length; i++) {
        const prev = Number(history[i - 1].close);
        const curr = Number(history[i].close);
        if (prev > 0) {
          returns.push((curr - prev) / prev);
        }
      }
      holdingReturns[symbol] = returns;
    }

    // Calculate portfolio weights
    let totalValue = 0;
    const weights = {};
    for (const h of holdings) {
      const quote = quotes[h.symbol] || {};
      const shares = Number(h.shares);
      const price = Number(quote.price) || Number(h.avgCostBasis);
      const value = shares * price;
      totalValue += value;
      weights[h.symbol] = value;
    }
    for (const symbol of symbols) {
      weights[symbol] = totalValue > 0 ? weights[symbol] / totalValue : 0;
    }

    // Calculate portfolio returns
    const minLength = Math.min(...Object.values(holdingReturns).map(r => r.length));
    const portfolioReturns = [];
    for (let i = 0; i < minLength; i++) {
      let dayReturn = 0;
      for (const symbol of symbols) {
        dayReturn += (holdingReturns[symbol]?.[i] || 0) * weights[symbol];
      }
      portfolioReturns.push(dayReturn);
    }

    // Calculate statistics
    const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / portfolioReturns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedVolatility = stdDev * Math.sqrt(252) * 100;

    // Sharpe Ratio (assuming risk-free rate of 4%)
    const riskFreeRate = 0.04 / 252;
    const excessReturn = avgReturn - riskFreeRate;
    const sharpeRatio = stdDev > 0 ? (excessReturn / stdDev) * Math.sqrt(252) : 0;

    // Sortino Ratio (downside deviation)
    const downsideReturns = portfolioReturns.filter(r => r < 0);
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideDeviation > 0 
      ? (excessReturn / downsideDeviation) * Math.sqrt(252) 
      : 0;

    // Max Drawdown
    let peak = 1;
    let maxDrawdown = 0;
    let cumulativeReturn = 1;
    for (const r of portfolioReturns) {
      cumulativeReturn *= (1 + r);
      if (cumulativeReturn > peak) {
        peak = cumulativeReturn;
      }
      const drawdown = (peak - cumulativeReturn) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Value at Risk (95% confidence)
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
    const varIndex = Math.floor(portfolioReturns.length * 0.05);
    const var95 = sortedReturns[varIndex] * totalValue;

    // Beta (vs SPY)
    const benchmarkHistory = await MarketDataService.getHistoricalPrices('SPY', 365);
    const benchmarkReturns = [];
    for (let i = 1; i < benchmarkHistory.length; i++) {
      const prev = Number(benchmarkHistory[i - 1].close);
      const curr = Number(benchmarkHistory[i].close);
      if (prev > 0) {
        benchmarkReturns.push((curr - prev) / prev);
      }
    }

    const minBenchmarkLength = Math.min(portfolioReturns.length, benchmarkReturns.length);
    let covariance = 0;
    let benchmarkVariance = 0;
    const benchmarkAvg = benchmarkReturns.slice(0, minBenchmarkLength).reduce((a, b) => a + b, 0) / minBenchmarkLength;
    
    for (let i = 0; i < minBenchmarkLength; i++) {
      covariance += (portfolioReturns[i] - avgReturn) * (benchmarkReturns[i] - benchmarkAvg);
      benchmarkVariance += Math.pow(benchmarkReturns[i] - benchmarkAvg, 2);
    }
    covariance /= minBenchmarkLength;
    benchmarkVariance /= minBenchmarkLength;
    
    const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;

    // Individual holding risk
    const holdingRisk = symbols.map(symbol => {
      const returns = holdingReturns[symbol] || [];
      const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
      const v = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
      const vol = Math.sqrt(v) * Math.sqrt(252) * 100;
      const quote = quotes[symbol] || {};
      
      return {
        symbol,
        weight: weights[symbol] * 100,
        volatility: vol,
        beta: Number(quote.beta) || 1,
        contribution: vol * weights[symbol]
      };
    }).sort((a, b) => b.contribution - a.contribution);

    return {
      totalValue,
      volatility: annualizedVolatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      var95: Math.abs(var95),
      beta,
      holdingRisk,
      riskScore: this.calculateRiskScore(annualizedVolatility, maxDrawdown, beta),
      summary: this.getRiskSummary(annualizedVolatility, maxDrawdown, beta)
    };
  }

  // Helper methods

  static getPeriodDays(period) {
    const periods = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '6M': 180,
      'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
      '1Y': 365,
      '3Y': 1095,
      '5Y': 1825,
      'ALL': 3650
    };
    return periods[period] || 30;
  }

  static calculateRiskScore(volatility, maxDrawdown, beta) {
    // Score from 1-10, higher = riskier
    let score = 5;
    
    if (volatility < 10) score -= 2;
    else if (volatility < 15) score -= 1;
    else if (volatility > 25) score += 1;
    else if (volatility > 35) score += 2;

    if (maxDrawdown < 10) score -= 1;
    else if (maxDrawdown > 20) score += 1;
    else if (maxDrawdown > 30) score += 2;

    if (beta < 0.8) score -= 1;
    else if (beta > 1.2) score += 1;
    else if (beta > 1.5) score += 2;

    return Math.max(1, Math.min(10, score));
  }

  static getRiskSummary(volatility, maxDrawdown, beta) {
    const score = this.calculateRiskScore(volatility, maxDrawdown, beta);

    if (score <= 3) return 'Conservative';
    if (score <= 5) return 'Moderate';
    if (score <= 7) return 'Aggressive';
    return 'Very Aggressive';
  }

  /**
   * Calculate drawdown series over time
   * @param {string} portfolioId
   * @param {string} period
   * @returns {Object} Drawdown data
   */
  static async calculateDrawdownSeries(portfolioId, period = '1Y') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.getPeriodDays(period));

      // Get snapshots
      const snapshots = await prisma.portfolioSnapshot.findMany({
        where: {
          portfolioId,
          snapshotDate: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { snapshotDate: 'asc' }
      });

      if (snapshots.length < 2) {
        return {
          currentDrawdown: 0,
          maxDrawdown: 0,
          drawdownSeries: [],
          peaks: [],
          troughs: []
        };
      }

      // Calculate drawdown series
      let peak = snapshots[0].totalValue;
      let maxDrawdown = 0;
      let maxDrawdownStart = null;
      let maxDrawdownEnd = null;
      const drawdownSeries = [];
      const peaks = [];
      const troughs = [];

      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const value = snapshot.totalValue;

        // Update peak
        if (value > peak) {
          peak = value;
          peaks.push({
            date: snapshot.snapshotDate,
            value: peak
          });
        }

        // Calculate drawdown from peak
        const drawdown = (peak - value) / peak;

        drawdownSeries.push({
          date: snapshot.snapshotDate,
          drawdown: drawdown * 100,
          value: value
        });

        // Track max drawdown
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownEnd = snapshot.snapshotDate;

          // Find when this drawdown started
          for (let j = i - 1; j >= 0; j--) {
            if (snapshots[j].totalValue === peak) {
              maxDrawdownStart = snapshots[j].snapshotDate;
              break;
            }
          }
        }

        // Track troughs (local minima)
        if (i > 0 && i < snapshots.length - 1) {
          const prev = snapshots[i - 1].totalValue;
          const next = snapshots[i + 1].totalValue;
          if (value < prev && value < next) {
            troughs.push({
              date: snapshot.snapshotDate,
              value: value,
              drawdown: drawdown * 100
            });
          }
        }
      }

      const currentValue = snapshots[snapshots.length - 1].totalValue;
      const currentDrawdown = (peak - currentValue) / peak;

      // Calculate recovery time for max drawdown
      let recoveryDays = null;
      if (maxDrawdownEnd) {
        for (let i = snapshots.length - 1; i >= 0; i--) {
          if (snapshots[i].snapshotDate <= maxDrawdownEnd) break;
          if (snapshots[i].totalValue >= peak) {
            recoveryDays = Math.floor((snapshots[i].snapshotDate - maxDrawdownEnd) / (1000 * 60 * 60 * 24));
            break;
          }
        }
      }

      return {
        currentDrawdown: currentDrawdown * 100,
        maxDrawdown: maxDrawdown * 100,
        maxDrawdownPeriod: {
          start: maxDrawdownStart,
          end: maxDrawdownEnd,
          recoveryDays
        },
        drawdownSeries,
        peaks,
        troughs
      };

    } catch (error) {
      logger.error('Drawdown calculation error:', error);
      return {
        currentDrawdown: 0,
        maxDrawdown: 0,
        drawdownSeries: [],
        peaks: [],
        troughs: []
      };
    }
  }

  /**
   * Calculate rolling statistics
   * @param {string} portfolioId
   * @param {number} window - Rolling window in days (default 90)
   * @returns {Object} Rolling statistics
   */
  static async calculateRollingStatistics(portfolioId, window = 90) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365); // Get 1 year of data

      // Get snapshots
      const snapshots = await prisma.portfolioSnapshot.findMany({
        where: {
          portfolioId,
          snapshotDate: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { snapshotDate: 'asc' }
      });

      if (snapshots.length < window) {
        return {
          rollingReturns: [],
          rollingVolatility: [],
          rollingSharpe: [],
          rollingSortino: [],
          distribution: { data: [], labels: [] }
        };
      }

      // Calculate daily returns
      const returns = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prevValue = snapshots[i - 1].totalValue;
        const currValue = snapshots[i].totalValue;
        returns.push((currValue - prevValue) / prevValue);
      }

      // Calculate rolling metrics
      const rollingReturns = [];
      const rollingVolatility = [];
      const rollingSharpe = [];
      const rollingSortino = [];

      for (let i = window; i < returns.length; i++) {
        const windowReturns = returns.slice(i - window, i);
        const date = snapshots[i].snapshotDate;

        // Rolling return (annualized)
        const avgReturn = windowReturns.reduce((a, b) => a + b, 0) / window;
        const annualizedReturn = avgReturn * 252;

        // Rolling volatility (annualized)
        const variance = windowReturns.reduce((sum, r) =>
          sum + Math.pow(r - avgReturn, 2), 0) / window;
        const volatility = Math.sqrt(variance) * Math.sqrt(252);

        // Rolling Sharpe ratio
        const sharpe = volatility > 0 ? (annualizedReturn - 0.04) / volatility : 0;

        // Rolling Sortino ratio (downside deviation)
        const downsideReturns = windowReturns.filter(r => r < 0);
        const downsideVariance = downsideReturns.length > 0
          ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
          : 0;
        const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
        const sortino = downsideDeviation > 0 ? (annualizedReturn - 0.04) / downsideDeviation : 0;

        rollingReturns.push({
          date,
          value: annualizedReturn * 100
        });

        rollingVolatility.push({
          date,
          value: volatility * 100
        });

        rollingSharpe.push({
          date,
          value: sharpe
        });

        rollingSortino.push({
          date,
          value: sortino
        });
      }

      // Create distribution (histogram) of returns
      const distribution = this.createDistribution(returns);

      return {
        window,
        rollingReturns,
        rollingVolatility,
        rollingSharpe,
        rollingSortino,
        distribution,
        summary: {
          avgReturn: rollingReturns.length > 0
            ? rollingReturns.reduce((sum, r) => sum + r.value, 0) / rollingReturns.length
            : 0,
          avgVolatility: rollingVolatility.length > 0
            ? rollingVolatility.reduce((sum, v) => sum + v.value, 0) / rollingVolatility.length
            : 0,
          avgSharpe: rollingSharpe.length > 0
            ? rollingSharpe.reduce((sum, s) => sum + s.value, 0) / rollingSharpe.length
            : 0
        }
      };

    } catch (error) {
      logger.error('Rolling statistics calculation error:', error);
      return {
        rollingReturns: [],
        rollingVolatility: [],
        rollingSharpe: [],
        rollingSortino: [],
        distribution: { data: [], labels: [] }
      };
    }
  }

  /**
   * Create distribution histogram
   */
  static createDistribution(returns) {
    const bins = 30;
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binSize = (max - min) / bins;

    const histogram = Array(bins).fill(0);
    const labels = [];

    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;
      labels.push(`${(binStart * 100).toFixed(1)}%`);

      returns.forEach(r => {
        if (r >= binStart && r < binEnd) {
          histogram[i]++;
        }
      });
    }

    return {
      data: histogram,
      labels,
      mean: returns.reduce((a, b) => a + b, 0) / returns.length,
      median: this.calculateMedian(returns),
      stdDev: Math.sqrt(returns.reduce((sum, r) =>
        sum + Math.pow(r - (returns.reduce((a, b) => a + b, 0) / returns.length), 2), 0) / returns.length)
    };
  }

  static calculateMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}

module.exports = AnalyticsService;
