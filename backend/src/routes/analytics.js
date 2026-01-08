const express = require('express');
const { query, validationResult } = require('express-validator');
const { prisma } = require('../db/simpleDb');
const { authenticate } = require('../middleware/auth');
const AnalyticsService = require('../services/analytics');
const MarketDataService = require('../services/marketData');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/analytics/dashboard
 * Alias for /api/users/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    logger.info(`[Dashboard API] Fetching for user ${req.user.id}`);

    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { 
        holdings: true,
        _count: { select: { transactions: true } }
      }
    });

    // Check if user has any holdings for demo data
    const hasHoldings = portfolios.some(p => p.holdings && p.holdings.length > 0);

    if (!hasHoldings) {
      // Return empty dashboard data - no demo data
      return res.json({
        value: 0,
        cost: 0,
        gain: 0,
        gainPct: 0,
        dayChange: 0,
        dayChangePct: 0,
        cash: 0,
        income: 0,
        ytdReturn: 0,
        portfolioCount: portfolios.length,
        holdingsCount: 0,
        holdings: [],
        sectors: [],
        risk: {
          beta: 0,
          sharpe: 0,
          volatility: 0,
          maxDrawdown: 0
        },
        portfolios: portfolios.map(p => ({
          id: p.id,
          name: p.name,
          holdingsCount: 0,
          transactionsCount: p._count?.transactions || 0
        })),
        recentTransactions: [],
        activeAlerts: [],
        isEmpty: true
      });
    }

    const totalHoldings = portfolios.reduce((sum, p) => sum + p.holdings.length, 0);
    logger.info(`[Dashboard API] Found ${portfolios.length} portfolios with ${totalHoldings} total holdings`);

    const recentTransactions = await prisma.transactions.findMany({
      where: { user_id: req.user.id },
      orderBy: { executed_at: 'desc' },
      take: 10,
      include: { 
        portfolios: { select: { name: true } }
      }
    });

    // Fetch alerts if the table exists, otherwise return empty array
    let alerts = [];
    try {
      alerts = await prisma.alerts.findMany({
        where: { user_id: req.user.id, is_active: true, is_triggered: false },
        take: 5
      });
    } catch (alertError) {
      // Alert table doesn't exist yet, skip
      logger.debug('Alert table not found, skipping alerts');
    }

    // Calculate comprehensive dashboard data
    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;
    let dayChange = 0;
    let totalCash = 0;
    const allHoldings = [];
    const sectorMap = {};
    const returns = []; // For calculating risk metrics

    // Collect all unique symbols first for single batch fetch
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    logger.info(`[Dashboard API] Fetching quotes for ${allSymbols.length} unique symbols`);
    const quotes = allSymbols.length > 0 ? await MarketDataService.getQuotes(allSymbols) : {};
    logger.info(`[Dashboard API] Got ${Object.keys(quotes).length} quotes`);

    for (const portfolio of portfolios) {
      totalCash += Number(portfolio.cash_balance);
      if (portfolio.holdings.length === 0) continue;

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const prevClose = Number(quote.previousClose) || price;
        const value = shares * price;
        const costBasis = shares * cost;
        const sector = quote.sector || h.sector || 'Unknown';

        totalValue += value;
        totalCost += costBasis;
        totalGain += (value - costBasis);
        dayChange += shares * (price - prevClose);

        // Track sector allocation
        sectorMap[sector] = (sectorMap[sector] || 0) + value;

        // Calculate individual holding return for risk metrics
        const holdingReturn = cost > 0 ? ((price - cost) / cost) : 0;
        returns.push(holdingReturn);

        allHoldings.push({
          symbol: h.symbol,
          name: quote.name || h.symbol,
          shares,
          price,
          change: quote.change || 0,
          changePercent: quote.changePercent || 0,
          value,
          cost: costBasis,
          gain: value - costBasis,
          gainPct: costBasis > 0 ? ((value - costBasis) / costBasis * 100) : 0,
          weight: 0, // Will calculate after totalValue is known
          sector,
          dividend: quote.dividend || 0,
          dividendYield: quote.dividendYield || 0
        });
      }
    }

    totalValue += totalCash;

    // Calculate weights and dividend income
    let totalIncome = 0;
    allHoldings.forEach(h => {
      h.weight = totalValue > 0 ? (h.value / totalValue * 100) : 0;
      totalIncome += h.value * (h.dividendYield / 100);
    });

    // Calculate sectors array
    const sectors = Object.entries(sectorMap).map(([name, value]) => ({
      name,
      value,
      weight: totalValue > 0 ? (value / totalValue * 100) : 0
    })).sort((a, b) => b.value - a.value);

    // Calculate YTD return (simplified - using total return as approximation)
    const ytdReturn = totalCost > 0 ? (totalGain / totalCost * 100) : 0;

    // Calculate risk metrics
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
      : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0;

    // Calculate max drawdown from returns
    let peak = 1;
    let maxDrawdown = 0;
    let cumulative = 1;
    for (const r of returns) {
      cumulative *= (1 + r);
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    logger.info(`[Dashboard API] Calculated: ${allHoldings.length} holdings, ${sectors.length} sectors, value=$${totalValue.toFixed(2)}`);

    res.json({
      value: totalValue,
      cost: totalCost,
      gain: totalGain,
      gainPct: totalCost > 0 ? (totalGain / totalCost * 100) : 0,
      dayChange,
      dayChangePct: totalValue > 0 ? (dayChange / (totalValue - dayChange) * 100) : 0,
      cash: totalCash,
      income: totalIncome,
      ytdReturn,
      portfolioCount: portfolios.length,
      holdingsCount: allHoldings.length,
      holdings: allHoldings.slice(0, 15), // Top 15 for dashboard
      sectors,
      risk: {
        beta: 1.0, // Default - would need market data for accurate calculation
        sharpe: sharpeRatio,
        volatility: volatility * 100, // As percentage
        maxDrawdown: maxDrawdown * 100 // As percentage
      },
      portfolios: portfolios.map(p => ({
        id: p.id,
        name: p.name,
        holdingsCount: p.holdings.length,
        transactionsCount: p._count.transactions
      })),
      recentTransactions: recentTransactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        shares: t.shares ? Number(t.shares) : null,
        price: t.price ? Number(t.price) : null
      })),
      activeAlerts: alerts
    });
  } catch (err) {
    logger.error('Get dashboard error:', err);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * GET /api/analytics/performance-history
 * Historical performance data for charts
 * Query params:
 *   - timeframe: 1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL
 *   - portfolioId: (optional) specific portfolio ID to filter by
 */
router.get('/performance-history', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '1M';
    const portfolioId = req.query.portfolioId; // Optional filter

    // Build where clause based on whether portfolioId is provided
    const whereClause = { user_id: req.user.id };
    if (portfolioId && portfolioId !== 'all') {
      whereClause.id = portfolioId;
    }

    const portfolios = await prisma.portfolios.findMany({
      where: whereClause,
      include: { holdings: true }
    });

    // Log aggregation info
    const totalHoldings = portfolios.reduce((sum, p) => sum + (p.holdings?.length || 0), 0);
    const filterInfo = portfolioId && portfolioId !== 'all' ? ` (filtered to portfolio ${portfolioId})` : ' (all portfolios)';
    logger.info(`[Performance History] Aggregating ${portfolios.length} portfolios with ${totalHoldings} total holdings for user ${req.user.id}${filterInfo}`);

    // Calculate number of days based on timeframe
    const days = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      'YTD': Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
      'ALL': 365 * 5
    }[timeframe] || 30;

    // Get all unique symbols and fetch current quotes
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = allSymbols.length > 0 ? await MarketDataService.getQuotes(allSymbols) : {};

    // Calculate current market value and cost basis
    let currentValue = 0;
    let totalCost = 0;
    let totalCash = 0;

    for (const portfolio of portfolios) {
      totalCash += Number(portfolio.cash_balance) || 0;
      for (const h of portfolio.holdings) {
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const quote = quotes[h.symbol] || {};
        const price = Number(quote.price) || cost;

        currentValue += shares * price;
        totalCost += shares * cost;
      }
    }

    currentValue += totalCash;
    totalCost += totalCash;

    // If no holdings, return empty with default structure
    if (currentValue === 0) {
      currentValue = 100000;
      totalCost = 100000;
    }

    // Calculate actual return percentage
    const totalReturn = totalCost > 0 ? ((currentValue - totalCost) / totalCost) : 0;

    // Generate date labels and values
    const labels = [];
    const portfolio = [];
    const benchmark = [];
    const now = new Date();

    // Determine data point interval based on timeframe
    const dataPoints = Math.min(days + 1, 60); // Max 60 data points

    // Fetch real SPY historical data for benchmark
    let spyPrices = [];
    try {
      spyPrices = await MarketDataService.getHistoricalPrices('SPY', days);
    } catch (err) {
      logger.warn('Failed to fetch SPY historical prices:', err.message);
    }

    // Calculate SPY start/end for benchmark returns
    const spyStartPrice = spyPrices.length > 0 ? Number(spyPrices[0].close) : 100;
    const spyEndPrice = spyPrices.length > 0 ? Number(spyPrices[spyPrices.length - 1].close) : 100;
    const spyReturn = spyStartPrice > 0 ? (spyEndPrice - spyStartPrice) / spyStartPrice : 0;

    // Build a map of symbol -> shares and value for quick lookup
    const sharesMap = {};
    const holdingValues = [];
    for (const portfolio of portfolios) {
      for (const h of portfolio.holdings) {
        const shares = Number(h.shares);
        sharesMap[h.symbol] = (sharesMap[h.symbol] || 0) + shares;
        const quote = quotes[h.symbol] || {};
        const price = Number(quote.price) || Number(h.avg_cost_basis) || 0;
        holdingValues.push({ symbol: h.symbol, value: shares * price });
      }
    }

    // Sort symbols by portfolio value (highest first) and fetch historical prices
    // This ensures we get history for the most important holdings
    const sortedSymbols = [...new Set(holdingValues
      .sort((a, b) => b.value - a.value)
      .map(h => h.symbol))];

    logger.info(`[Performance History] Fetching historical prices for ${Math.min(sortedSymbols.length, 50)} of ${allSymbols.length} symbols (sorted by value)`);

    const holdingHistories = {};
    // Fetch historical prices for top 50 symbols by value (covers majority of portfolio)
    for (const symbol of sortedSymbols.slice(0, 50)) {
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, days);
        if (history && history.length > 0) {
          holdingHistories[symbol] = history;
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }
    }

    for (let i = 0; i < dataPoints; i++) {
      const daysAgo = Math.floor((dataPoints - 1 - i) * (days / (dataPoints - 1)));
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);

      // Format label based on timeframe
      let label;
      if (days <= 1) {
        label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      } else if (days <= 7) {
        label = date.toLocaleDateString('en-US', { weekday: 'short' });
      } else if (days <= 90) {
        label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
      labels.push(label);

      // Calculate portfolio value using actual historical prices
      let portfolioValue = totalCash; // Start with cash
      const targetIndex = Math.floor((i / (dataPoints - 1)) * (days - 1));

      for (const [symbol, shares] of Object.entries(sharesMap)) {
        const history = holdingHistories[symbol];
        if (history && history.length > 0) {
          // Find the price at the appropriate historical point
          const priceIndex = Math.min(targetIndex, history.length - 1);
          const histPrice = Number(history[priceIndex]?.close) || Number(history[0]?.close) || 0;
          portfolioValue += shares * histPrice;
        } else {
          // Fallback: use current quote price (no historical data available)
          const quote = quotes[symbol] || {};
          const price = Number(quote.price) || 0;
          portfolioValue += shares * price;
        }
      }
      portfolio.push(Math.round(portfolioValue * 100) / 100);

      // S&P 500 benchmark - use real historical prices
      if (spyPrices.length > 0) {
        const spyIndex = Math.min(targetIndex, spyPrices.length - 1);
        const spyPrice = Number(spyPrices[spyIndex]?.close) || spyStartPrice;
        const spyReturnAtPoint = (spyPrice - spyStartPrice) / spyStartPrice;
        const benchmarkValue = totalCost * (1 + spyReturnAtPoint);
        benchmark.push(Math.round(benchmarkValue * 100) / 100);
      } else {
        // Fallback if no SPY data
        const progress = i / (dataPoints - 1);
        const benchmarkValue = totalCost * (1 + spyReturn * progress);
        benchmark.push(Math.round(benchmarkValue * 100) / 100);
      }
    }

    // Include portfolio names in response for transparency
    const portfolioNames = portfolios.map(p => p.name);

    logger.info(`[Performance History] Returning chart data: ${portfolio.length} data points, current value $${currentValue.toFixed(2)}, portfolios: ${portfolioNames.join(', ')}`);

    res.json({
      labels,
      portfolio,
      benchmark,
      stats: {
        currentValue: Math.round(currentValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalReturn: Math.round(totalReturn * 10000) / 100,
        portfolioCount: portfolios.length,
        portfolioNames,
        holdingsCount: totalHoldings
      }
    });
  } catch (err) {
    logger.error('Get performance history error:', err);
    res.status(500).json({ error: 'Failed to get performance history' });
  }
});

/**
 * GET /api/analytics/overview
 * Portfolio-wide analytics
 */
router.get('/overview', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;
    const allHoldings = [];
    const sectorExposure = {};

    // Batch fetch all quotes at once
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = allSymbols.length > 0 ? await MarketDataService.getQuotes(allSymbols) : {};

    for (const portfolio of portfolios) {
      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const prevClose = Number(quote.previousClose) || price;
        const value = shares * price;
        const sector = quote.sector || h.sector || 'Unknown';

        totalValue += value;
        totalCost += shares * cost;
        dayChange += shares * (price - prevClose);

        sectorExposure[sector] = (sectorExposure[sector] || 0) + value;

        allHoldings.push({
          symbol: h.symbol,
          shares,
          price,
          value,
          cost: shares * cost,
          gain: value - (shares * cost),
          gainPct: ((price - cost) / cost) * 100,
          sector,
          portfolio_id: portfolio.id,
          portfolioName: portfolio.name
        });
      }
      totalValue += Number(portfolio.cash_balance);
    }

    // Top holdings
    const topHoldings = allHoldings
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(h => ({ ...h, weight: (h.value / totalValue) * 100 }));

    // Best/worst performers
    const bestPerformers = [...allHoldings].sort((a, b) => b.gainPct - a.gainPct).slice(0, 5);
    const worstPerformers = [...allHoldings].sort((a, b) => a.gainPct - b.gainPct).slice(0, 5);

    // Sector allocation
    const sectors = Object.entries(sectorExposure)
      .map(([sector, value]) => ({
        sector,
        value,
        weight: (value / totalValue) * 100
      }))
      .sort((a, b) => b.weight - a.weight);

    res.json({
      totalValue,
      totalCost,
      totalGain: totalValue - totalCost,
      totalGainPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      dayChange,
      dayChangePct: (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      holdingsCount: allHoldings.length,
      portfolioCount: portfolios.length,
      topHoldings,
      bestPerformers,
      worstPerformers,
      sectorAllocation: sectors
    });
  } catch (err) {
    logger.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * GET /api/analytics/correlation
 * Holdings correlation matrix
 */
router.get('/correlation', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    const symbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];

    if (symbols.length < 2) {
      return res.json({ matrix: [], symbols: [] });
    }

    // Get historical returns
    const returns = {};
    for (const symbol of symbols.slice(0, 20)) { // Limit to 20 symbols
      const history = await MarketDataService.getHistoricalPrices(symbol, 90);
      returns[symbol] = [];
      for (let i = 1; i < history.length; i++) {
        const prev = Number(history[i - 1].close);
        const curr = Number(history[i].close);
        if (prev > 0) {
          returns[symbol].push((curr - prev) / prev);
        }
      }
    }

    // Calculate correlation matrix
    const activeSymbols = Object.keys(returns).filter(s => returns[s].length > 10);
    const matrix = [];

    for (const s1 of activeSymbols) {
      const row = [];
      for (const s2 of activeSymbols) {
        if (s1 === s2) {
          row.push(1.0);
        } else {
          const corr = calculateCorrelation(returns[s1], returns[s2]);
          row.push(corr);
        }
      }
      matrix.push(row);
    }

    res.json({ symbols: activeSymbols, matrix });
  } catch (err) {
    logger.error('Correlation error:', err);
    res.status(500).json({ error: 'Failed to calculate correlation' });
  }
});

/**
 * GET /api/analytics/tax-lots
 * Tax lot analysis
 */
router.get('/tax-lots', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { 
        holdings: {
          include: { taxLots: true }
        }
      }
    });

    const symbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = await MarketDataService.getQuotes(symbols);

    let totalCostBasis = 0;
    let totalMarketValue = 0;
    let longTermGains = 0;
    let shortTermGains = 0;
    let longTermLosses = 0;
    let shortTermLosses = 0;
    const lots = [];
    const now = new Date();

    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) {
        const quote = quotes[holding.symbol] || {};
        const price = Number(quote.price) || Number(holding.avgCostBasis);

        for (const lot of holding.taxLots) {
          const shares = Number(lot.shares);
          const costBasis = Number(lot.costBasis);
          const marketValue = shares * price;
          const gain = marketValue - (shares * costBasis);
          const holdingDays = Math.floor((now - new Date(lot.purchaseDate)) / (1000 * 60 * 60 * 24));
          const isLongTerm = holdingDays >= 365;

          totalCostBasis += shares * costBasis;
          totalMarketValue += marketValue;

          if (gain > 0) {
            if (isLongTerm) longTermGains += gain;
            else shortTermGains += gain;
          } else {
            if (isLongTerm) longTermLosses += Math.abs(gain);
            else shortTermLosses += Math.abs(gain);
          }

          lots.push({
            portfolio_id: portfolio.id,
            portfolioName: portfolio.name,
            symbol: holding.symbol,
            shares,
            costBasis,
            purchaseDate: lot.purchaseDate,
            currentPrice: price,
            marketValue,
            gain,
            gainPct: ((price - costBasis) / costBasis) * 100,
            holdingDays,
            isLongTerm
          });
        }
      }
    }

    // Tax loss harvesting candidates
    const harvestCandidates = lots
      .filter(l => l.gain < -100) // At least $100 loss
      .sort((a, b) => a.gain - b.gain)
      .slice(0, 10);

    // Approaching long-term (within 60 days)
    const approachingLongTerm = lots
      .filter(l => !l.isLongTerm && l.holdingDays >= 305 && l.holdingDays < 365)
      .sort((a, b) => b.holdingDays - a.holdingDays);

    // Estimated tax liability (simplified)
    const longTermRate = 0.15;
    const shortTermRate = 0.32;
    const netLongTerm = longTermGains - longTermLosses;
    const netShortTerm = shortTermGains - shortTermLosses;
    const estimatedTax = Math.max(0, netLongTerm * longTermRate) + Math.max(0, netShortTerm * shortTermRate);

    res.json({
      summary: {
        totalCostBasis,
        totalMarketValue,
        totalUnrealizedGain: totalMarketValue - totalCostBasis,
        longTermGains,
        shortTermGains,
        longTermLosses,
        shortTermLosses,
        netLongTerm,
        netShortTerm,
        estimatedTax
      },
      lots: lots.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate)),
      harvestCandidates,
      approachingLongTerm
    });
  } catch (err) {
    logger.error('Tax lots error:', err);
    res.status(500).json({ error: 'Failed to get tax lots' });
  }
});

/**
 * GET /api/analytics/income-projection
 * Project dividend income
 */
router.get('/income-projection', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    const symbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate holdings by symbol (aggregate across portfolios)
    const holdingsBySymbol = {};
    for (const portfolio of portfolios) {
      for (const h of portfolio.holdings) {
        if (!holdingsBySymbol[h.symbol]) {
          holdingsBySymbol[h.symbol] = 0;
        }
        holdingsBySymbol[h.symbol] += Number(h.shares);
      }
    }

    // Calculate annual income
    let annualIncome = 0;
    const incomeBySymbol = [];

    for (const [symbol, shares] of Object.entries(holdingsBySymbol)) {
      const quote = quotes[symbol] || {};
      const dividend = Number(quote.dividend) || 0;
      const income = shares * dividend;
      annualIncome += income;

      if (dividend > 0) {
        incomeBySymbol.push({
          symbol,
          shares,
          dividend,
          annualIncome: income,
          monthlyIncome: income / 12,
          yield: Number(quote.dividendYield) || 0
        });
      }
    }

    // Monthly projection (simplified - assumes quarterly dividends evenly distributed)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyProjection = months.map(month => ({
      month,
      projected: annualIncome / 12
    }));

    // Growth projection (assuming 5% dividend growth)
    const growthRate = 0.05;
    const yearlyProjection = [];
    let projectedIncome = annualIncome;
    for (let year = 0; year <= 10; year++) {
      yearlyProjection.push({
        year: new Date().getFullYear() + year,
        income: projectedIncome
      });
      projectedIncome *= (1 + growthRate);
    }

    res.json({
      annualIncome,
      monthlyIncome: annualIncome / 12,
      quarterlyIncome: annualIncome / 4,
      portfolioYield: annualIncome / Object.values(holdingsBySymbol).reduce((sum, shares) => {
        // Rough calculation
        return sum + shares * 100;
      }, 0) * 100,
      incomeBySymbol: incomeBySymbol.sort((a, b) => b.annualIncome - a.annualIncome),
      monthlyProjection,
      yearlyProjection
    });
  } catch (err) {
    logger.error('Income projection error:', err);
    res.status(500).json({ error: 'Failed to project income' });
  }
});

// Helper function
function calculateCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * GET /api/analytics/portfolio-performance
 * Get portfolio performance metrics with returns and benchmarks
 */
router.get('/portfolio-performance', async (req, res) => {
  try {
    const period = req.query.period || '1M';

    // Get all portfolios for the user
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    // Check if user has any holdings
    const hasHoldings = portfolios.some(p => p.holdings && p.holdings.length > 0);

    if (!hasHoldings) {
      // Return empty data - no demo data
      return res.json({
        totalValue: 0,
        totalCost: 0,
        totalReturn: 0,
        totalReturnPct: 0,
        dayChange: 0,
        dayChangePct: 0,
        periodReturn: 0,
        periodReturnPct: 0,
        holdings: [],
        riskMetrics: {
          beta: 0,
          alpha: 0,
          sharpe: 0,
          volatility: 0,
          maxDrawdown: 0
        },
        chartData: { labels: [], values: [] },
        isEmpty: true
      });
    }

    // Calculate aggregate metrics
    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;
    const returns = [];
    const allHoldings = [];

    for (const portfolio of portfolios) {
      totalValue += Number(portfolio.cash_balance);
      const symbols = portfolio.holdings.map(h => h.symbol);
      if (symbols.length === 0) continue;

      const quotes = await MarketDataService.getQuotes(symbols);

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const prevClose = Number(quote.previousClose) || price;

        const value = shares * price;
        const costBasis = shares * cost;
        const gain = value - costBasis;
        const gainPct = costBasis > 0 ? (gain / costBasis * 100) : 0;

        totalValue += value;
        totalCost += costBasis;
        dayChange += shares * (price - prevClose);

        // Track returns for risk calculations
        const holdingReturn = cost > 0 ? ((price - cost) / cost) : 0;
        returns.push(holdingReturn);

        allHoldings.push({
          symbol: h.symbol,
          name: quote.name || h.symbol,
          price,
          prevClose,
          dayChange: price - prevClose,
          dayChangePct: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
          value,
          gain,
          gainPct,
          returnPct: gainPct
        });
      }
    }

    const totalReturn = totalValue - totalCost;
    const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost * 100) : 0;
    const dayChangePct = (totalValue - dayChange) > 0 ? (dayChange / (totalValue - dayChange) * 100) : 0;

    // Calculate risk metrics
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
      : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0;

    // Calculate max drawdown
    let peak = 1;
    let maxDrawdown = 0;
    let cumulative = 1;
    for (const r of returns) {
      cumulative *= (1 + r);
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Generate historical chart data (simplified - based on period)
    const days = period === '1W' ? 7 : period === '1M' ? 30 : period === '3M' ? 90 : period === '6M' ? 180 : period === '1Y' ? 365 : period === 'YTD' ? 365 : 30;
    const labels = [];
    const values = [];
    const now = new Date();

    // Fetch SPY benchmark for alpha calculation
    let benchmarkReturn = 0;
    try {
      const spyHistory = await MarketDataService.getHistoricalPrices('SPY', days);
      if (spyHistory && spyHistory.length > 0) {
        const startPrice = Number(spyHistory[0].close) || 0;
        const endPrice = Number(spyHistory[spyHistory.length - 1].close) || 0;
        if (startPrice > 0) {
          benchmarkReturn = ((endPrice - startPrice) / startPrice) * 100;
        }
      }
    } catch (benchErr) {
      logger.warn('Failed to get SPY benchmark for alpha:', benchErr.message);
    }

    // Fetch historical prices for holdings to reconstruct portfolio history
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const holdingHistories = {};
    for (const symbol of allSymbols.slice(0, 15)) { // Limit for performance
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, days);
        if (history && history.length > 0) {
          holdingHistories[symbol] = history;
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }
    }

    // Build shares map
    const sharesMap = {};
    for (const portfolio of portfolios) {
      for (const h of portfolio.holdings) {
        sharesMap[h.symbol] = (sharesMap[h.symbol] || 0) + Number(h.shares);
      }
    }

    // Calculate weighted portfolio beta from individual stock betas
    let weightedBeta = 0;
    let totalWeight = 0;
    const allQuotes = await MarketDataService.getQuotes(allSymbols);
    for (const [symbol, shares] of Object.entries(sharesMap)) {
      const quote = allQuotes[symbol] || {};
      const price = Number(quote.price) || 0;
      const value = shares * price;
      const weight = totalValue > 0 ? value / totalValue : 0;
      const stockBeta = Number(quote.beta) || 1.0;
      weightedBeta += stockBeta * weight;
      totalWeight += weight;
    }
    const portfolioBeta = totalWeight > 0 ? weightedBeta / totalWeight : 1.0;

    // Get total cash for chart calculation
    const totalCash = portfolios.reduce((sum, p) => sum + (Number(p.cash_balance) || 0), 0);

    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().split('T')[0]);

      // Calculate historical value using actual historical prices
      let historicalValue = totalCash;
      const targetIndex = Math.floor(((days - i) / days) * (days - 1));

      for (const [symbol, shares] of Object.entries(sharesMap)) {
        const history = holdingHistories[symbol];
        if (history && history.length > 0) {
          const priceIndex = Math.min(targetIndex, history.length - 1);
          const histPrice = Number(history[priceIndex]?.close) || 0;
          historicalValue += shares * histPrice;
        } else {
          // Fallback: use current price
          const quote = allQuotes[symbol] || {};
          historicalValue += shares * (Number(quote.price) || 0);
        }
      }
      values.push(Math.round(historicalValue * 100) / 100);
    }

    res.json({
      totalValue,
      totalCost,
      totalReturn,
      totalReturnPct,
      dayChange,
      dayChangePct,
      periodReturn: totalReturn,
      periodReturnPct: totalReturnPct,
      holdings: allHoldings.sort((a, b) => b.value - a.value),
      riskMetrics: {
        beta: Math.round(portfolioBeta * 100) / 100,
        alpha: totalReturnPct - benchmarkReturn,
        sharpe: sharpeRatio,
        volatility: volatility * 100,
        maxDrawdown: maxDrawdown * 100
      },
      chartData: { labels, values }
    });
  } catch (err) {
    logger.error('Get portfolio performance error:', err);
    res.status(500).json({ error: 'Failed to get portfolio performance' });
  }
});

/**
 * GET /api/analytics/attribution
 * Get performance attribution analysis (sector/asset)
 */
router.get('/attribution', async (req, res) => {
  try {
    // Get all portfolios for the user
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    // Check if user has any holdings
    const hasHoldings = portfolios.some(p => p.holdings && p.holdings.length > 0);

    if (!hasHoldings) {
      // Return empty attribution data when no holdings exist
      return res.json({
        totalReturn: 0,
        benchmarkReturn: 0,
        alpha: 0,
        informationRatio: 0,
        sectorAttribution: [],
        factorAttribution: [],
        topContributors: [],
        topDetractors: [],
        isEmpty: true,
        message: 'No holdings found. Add holdings to see attribution analysis.'
      });
    }

    // Calculate aggregate portfolio metrics
    const sectorMap = {};
    let totalValue = 0;
    let totalCost = 0;

    for (const portfolio of portfolios) {
      totalValue += Number(portfolio.cash_balance);
      const symbols = portfolio.holdings.map(h => h.symbol);
      if (symbols.length === 0) continue;

      const quotes = await MarketDataService.getQuotes(symbols);

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const value = shares * price;
        const costBasis = shares * cost;
        const sector = quote.sector || h.sector || 'Unknown';

        totalValue += value;
        totalCost += costBasis;

        // Aggregate by sector
        if (!sectorMap[sector]) {
          sectorMap[sector] = { value: 0, cost: 0, weight: 0 };
        }
        sectorMap[sector].value += value;
        sectorMap[sector].cost += costBasis;
      }
    }

    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

    // Fetch real S&P 500 benchmark return
    let benchmarkReturn = 0;
    try {
      const spyHistory = await MarketDataService.getHistoricalPrices('SPY', 365);
      if (spyHistory && spyHistory.length > 0) {
        const startPrice = Number(spyHistory[0].close) || 0;
        const endPrice = Number(spyHistory[spyHistory.length - 1].close) || 0;
        if (startPrice > 0) {
          benchmarkReturn = ((endPrice - startPrice) / startPrice) * 100;
        }
      }
    } catch (benchErr) {
      logger.warn('Failed to get SPY benchmark data:', benchErr.message);
      benchmarkReturn = 10.0; // Fallback only if API fails
    }
    const alpha = totalReturn - benchmarkReturn;

    // S&P 500 Sector Weights (based on SPDR sector ETF weights - updated periodically)
    // Source: Based on actual S&P 500 sector allocations
    const SP500_SECTOR_WEIGHTS = {
      'Technology': 29.5,
      'Information Technology': 29.5,
      'Healthcare': 12.8,
      'Health Care': 12.8,
      'Financials': 12.9,
      'Financial Services': 12.9,
      'Consumer Discretionary': 10.5,
      'Consumer Cyclical': 10.5,
      'Communication Services': 8.9,
      'Industrials': 8.5,
      'Consumer Staples': 6.2,
      'Consumer Defensive': 6.2,
      'Energy': 3.9,
      'Utilities': 2.4,
      'Real Estate': 2.3,
      'Materials': 2.4,
      'Basic Materials': 2.4,
      'Unknown': 5.0
    };

    // Calculate sector attribution
    const sectorAttribution = Object.entries(sectorMap).map(([sector, data]) => {
      const weight = totalValue > 0 ? (data.value / totalValue * 100) : 0;
      const sectorReturn = data.cost > 0 ? ((data.value - data.cost) / data.cost * 100) : 0;
      const contribution = (weight / 100) * sectorReturn;

      // Use real S&P 500 sector weights
      const benchmarkWeight = SP500_SECTOR_WEIGHTS[sector] || 5.0;

      // Attribution effects (Brinson model)
      const allocationEffect = (weight - benchmarkWeight) * (benchmarkReturn / 100);
      const selectionEffect = benchmarkWeight * ((sectorReturn - benchmarkReturn) / 100);

      return {
        sector,
        weight,
        benchmarkWeight,
        sectorReturn,
        contribution,
        allocationEffect,
        selectionEffect
      };
    }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Calculate factor exposures from actual holdings
    // Get quotes with fundamental data for factor analysis
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const allQuotes = await MarketDataService.getQuotes(allSymbols);

    // Calculate weighted average metrics across holdings
    let totalMarketCap = 0;
    let weightedPE = 0;
    let weightedBeta = 0;
    let momentumScore = 0;
    let qualityScore = 0;
    let valueScore = 0;

    for (const portfolio of portfolios) {
      for (const h of portfolio.holdings) {
        const quote = allQuotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const value = shares * price;
        const weight = totalValue > 0 ? value / totalValue : 0;

        // Market cap factor (size)
        const marketCap = Number(quote.marketCap) || 0;
        totalMarketCap += marketCap * weight;

        // Value factor (P/E ratio - lower is more value-oriented)
        const pe = Number(quote.pe) || Number(quote.trailingPE) || 20;
        weightedPE += pe * weight;

        // Beta exposure
        const stockBeta = Number(quote.beta) || 1.0;
        weightedBeta += stockBeta * weight;

        // Momentum (based on price change)
        const changePercent = Number(quote.changePercent) || 0;
        momentumScore += changePercent * weight;

        // Quality (based on profit margins if available)
        const profitMargin = Number(quote.profitMargins) || 0.1;
        qualityScore += profitMargin * weight;
      }
    }

    // Calculate factor contributions based on actual exposures
    const avgMarketCapBillions = totalMarketCap / 1e9;
    const sizeExposure = avgMarketCapBillions > 100 ? -0.5 : avgMarketCapBillions > 10 ? 0 : 0.5; // Large cap = negative size exposure
    const valueExposure = weightedPE < 15 ? 0.8 : weightedPE < 25 ? 0 : -0.5; // Low P/E = value exposure
    const momentumExposure = momentumScore > 0.5 ? 1.0 : momentumScore > 0 ? 0.3 : momentumScore > -0.5 ? -0.3 : -1.0;
    const qualityExposure = qualityScore > 0.15 ? 0.8 : qualityScore > 0.08 ? 0.3 : -0.3;
    const betaExposure = weightedBeta;

    // Attribution based on actual factor exposures and alpha
    const factorAttribution = [
      { factor: 'Market Beta', contribution: betaExposure * benchmarkReturn / 100, exposure: Math.round(betaExposure * 100) / 100 },
      { factor: 'Quality', contribution: qualityExposure * alpha * 0.15, exposure: Math.round(qualityExposure * 100) / 100 },
      { factor: 'Momentum', contribution: momentumExposure * alpha * 0.2, exposure: Math.round(momentumExposure * 100) / 100 },
      { factor: 'Size', contribution: sizeExposure * alpha * 0.1, exposure: Math.round(sizeExposure * 100) / 100 },
      { factor: 'Value', contribution: valueExposure * alpha * 0.15, exposure: Math.round(valueExposure * 100) / 100 },
      { factor: 'Selection', contribution: alpha - (betaExposure * benchmarkReturn / 100) - (qualityExposure * alpha * 0.15) - (momentumExposure * alpha * 0.2) - (sizeExposure * alpha * 0.1) - (valueExposure * alpha * 0.15), exposure: 0.0 }
    ];

    // Top contributors and detractors
    const allContributions = sectorAttribution.map(s => ({
      name: s.sector,
      contribution: s.contribution
    }));
    const topContributors = allContributions
      .filter(c => c.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5);
    const topDetractors = allContributions
      .filter(c => c.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution)
      .slice(0, 5);

    // Calculate tracking error from actual returns variance vs benchmark
    // Use sector return variances as proxy for tracking error
    const sectorReturns = sectorAttribution.map(s => s.sectorReturn);
    const avgSectorReturn = sectorReturns.length > 0 ? sectorReturns.reduce((a, b) => a + b, 0) / sectorReturns.length : 0;
    const sectorVariance = sectorReturns.length > 1
      ? sectorReturns.reduce((sum, r) => sum + Math.pow(r - avgSectorReturn, 2), 0) / (sectorReturns.length - 1)
      : 0;
    const trackingError = Math.sqrt(sectorVariance) || 1.0; // Fallback to 1.0 if no variance
    const informationRatio = trackingError > 0 ? (alpha / trackingError) : 0;

    res.json({
      totalReturn,
      benchmarkReturn,
      alpha,
      informationRatio,
      sectorAttribution,
      factorAttribution,
      topContributors,
      topDetractors
    });
  } catch (err) {
    logger.error('Get attribution error:', err);
    res.status(500).json({ error: 'Failed to get attribution data' });
  }
});

/**
 * GET /api/analytics/comparison
 * Compare portfolio performance against benchmarks
 */
router.get('/comparison', async (req, res) => {
  try {
    const period = req.query.period || '1M';

    // Benchmark definitions
    const benchmarkDefs = [
      { symbol: 'SPY', name: 'S&P 500' },
      { symbol: 'QQQ', name: 'NASDAQ 100' },
      { symbol: 'DIA', name: 'Dow Jones' },
      { symbol: 'IWM', name: 'Russell 2000' },
      { symbol: 'VTI', name: 'Total Market' }
    ];

    // Period to days mapping
    const periodDays = {
      '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'YTD': 'ytd'
    };
    const days = periodDays[period] || 30;

    // Get live benchmark quotes
    const benchmarkSymbols = benchmarkDefs.map(b => b.symbol);
    const quotes = await MarketDataService.getQuotes(benchmarkSymbols);

    // Fetch historical data for each benchmark to calculate real returns
    const benchmarkData = await Promise.all(benchmarkDefs.map(async (b) => {
      const quote = quotes[b.symbol] || {};
      const price = Number(quote.price) || 0;
      const prevClose = Number(quote.previousClose) || price;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose * 100) : 0;

      // Fetch historical data to calculate real period return
      let periodReturn = 0;
      let yearReturn = 0;
      try {
        // Get historical prices for the period
        const histDays = days === 'ytd' ? 365 : days;
        const history = await MarketDataService.getHistoricalPrices(b.symbol, histDays);

        if (history && history.length > 0) {
          // Calculate period return from first to last price
          const oldestPrice = Number(history[0].close) || 0;
          const latestPrice = Number(history[history.length - 1].close) || price;

          if (oldestPrice > 0) {
            periodReturn = ((latestPrice - oldestPrice) / oldestPrice) * 100;
          }

          // Calculate YTD return
          if (days !== 'ytd') {
            const yearHistory = await MarketDataService.getHistoricalPrices(b.symbol, 365);
            if (yearHistory && yearHistory.length > 0) {
              const yearStartPrice = Number(yearHistory[0].close) || 0;
              const yearEndPrice = Number(yearHistory[yearHistory.length - 1].close) || price;
              if (yearStartPrice > 0) {
                yearReturn = ((yearEndPrice - yearStartPrice) / yearStartPrice) * 100;
              }
            }
          } else {
            yearReturn = periodReturn;
          }
        }
      } catch (histErr) {
        logger.warn(`Failed to get historical data for ${b.symbol}:`, histErr.message);
        // Use daily change as fallback estimate
        periodReturn = changePct;
        yearReturn = changePct * 252; // Rough annualized estimate
      }

      return {
        symbol: b.symbol,
        name: b.name,
        price,
        change,
        changePct,
        periodReturn: Math.round(periodReturn * 100) / 100,
        yearReturn: Math.round(yearReturn * 100) / 100
      };
    }));

    res.json({
      benchmarks: benchmarkData,
      period
    });
  } catch (err) {
    logger.error('Get comparison error:', err);
    res.status(500).json({ error: 'Failed to get comparison data' });
  }
});

/**
 * GET /api/analytics/performance
 * Get portfolio performance metrics
 */
router.get('/performance', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    const totalValue = portfolios.reduce((sum, p) => sum + (p.totalValue || 0), 0);
    const totalCost = portfolios.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    res.json({
      totalValue,
      totalCost,
      totalGain,
      totalGainPct,
      portfolioCount: portfolios.length,
      metrics: {
        dayChange: 0,
        dayChangePct: 0,
        weekChange: 0,
        monthChange: 0,
        yearToDateReturn: 0
      }
    });
  } catch (err) {
    logger.error('Get performance error:', err);
    res.status(500).json({ error: 'Failed to get performance data' });
  }
});

/**
 * GET /api/analytics/risk
 * Get portfolio risk metrics calculated from actual holdings
 */
router.get('/risk', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    // Check if user has any holdings
    const hasHoldings = portfolios.some(p => p.holdings && p.holdings.length > 0);

    if (!hasHoldings) {
      // Return empty risk metrics when no holdings exist
      return res.json({
        volatility: 0,
        sharpeRatio: 0,
        beta: 1.0,
        var95: 0,
        maxDrawdown: 0,
        riskScore: 0,
        riskLevel: 'N/A',
        isEmpty: true,
        message: 'No holdings found. Add holdings to see risk metrics.'
      });
    }

    // Collect all symbols
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];

    if (allSymbols.length === 0) {
      return res.json({
        volatility: 0,
        sharpeRatio: 0,
        beta: 1.0,
        var95: 0,
        maxDrawdown: 0,
        riskScore: 0,
        riskLevel: 'Unknown'
      });
    }

    // Fetch historical prices for returns calculation
    const historicalReturns = [];
    const spyReturns = [];

    // Get SPY returns for beta calculation
    try {
      const spyHistory = await MarketDataService.getHistoricalPrices('SPY', 90);
      for (let i = 1; i < spyHistory.length; i++) {
        const prev = Number(spyHistory[i - 1].close);
        const curr = Number(spyHistory[i].close);
        if (prev > 0) {
          spyReturns.push((curr - prev) / prev);
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch SPY data for beta:', err.message);
    }

    // Calculate portfolio returns from holdings
    const quotes = await MarketDataService.getQuotes(allSymbols);
    let totalValue = 0;
    let totalCost = 0;

    for (const portfolio of portfolios) {
      totalValue += Number(portfolio.cash_balance) || 0;
      for (const h of portfolio.holdings) {
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const quote = quotes[h.symbol] || {};
        const price = Number(quote.price) || cost;

        totalValue += shares * price;
        totalCost += shares * cost;

        // Add individual holding returns
        const holdingReturn = cost > 0 ? ((price - cost) / cost) : 0;
        historicalReturns.push(holdingReturn);
      }
    }

    // Calculate metrics
    const avgReturn = historicalReturns.length > 0
      ? historicalReturns.reduce((a, b) => a + b, 0) / historicalReturns.length
      : 0;

    const variance = historicalReturns.length > 1
      ? historicalReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (historicalReturns.length - 1)
      : 0;

    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized volatility %
    const sharpeRatio = volatility > 0 ? (avgReturn * 252 * 100) / volatility : 0;

    // Calculate beta using proper covariance/variance formula
    // Beta = Covariance(portfolio, market) / Variance(market)
    let beta = 1.0;
    if (spyReturns.length > 10) {
      // Get weighted portfolio beta from individual stock betas
      let weightedBeta = 0;
      let totalWeight = 0;

      for (const portfolio of portfolios) {
        for (const h of portfolio.holdings) {
          const quote = quotes[h.symbol] || {};
          const shares = Number(h.shares);
          const cost = Number(h.avg_cost_basis);
          const price = Number(quote.price) || cost;
          const value = shares * price;
          const weight = totalValue > 0 ? value / totalValue : 0;

          // Use individual stock beta from quote data, or calculate from correlation
          const stockBeta = Number(quote.beta) || 1.0;
          weightedBeta += stockBeta * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        beta = weightedBeta / totalWeight;
      }

      // If no quote betas available, calculate from returns correlation
      if (beta === 1.0 && historicalReturns.length > 5) {
        const spyMean = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
        const portMean = historicalReturns.reduce((a, b) => a + b, 0) / historicalReturns.length;

        // Calculate covariance and variance
        const n = Math.min(spyReturns.length, historicalReturns.length);
        let covariance = 0;
        let spyVariance = 0;

        for (let i = 0; i < n; i++) {
          const spyDev = (spyReturns[i] || 0) - spyMean;
          const portDev = (historicalReturns[i % historicalReturns.length] || 0) - portMean;
          covariance += spyDev * portDev;
          spyVariance += spyDev * spyDev;
        }

        if (spyVariance > 0 && n > 1) {
          beta = covariance / spyVariance;
        }
      }

      // Bound to reasonable range
      beta = Math.max(0.3, Math.min(2.5, beta));
    }

    // Calculate Value at Risk (95% confidence - 1.645 standard deviations)
    const dailyVol = volatility / Math.sqrt(252);
    const var95 = dailyVol * 1.645;

    // Calculate max drawdown
    let peak = 1;
    let maxDrawdown = 0;
    let cumulative = 1;
    for (const r of historicalReturns) {
      cumulative *= (1 + r);
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / peak * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Calculate risk score (1-10 scale based on volatility)
    const riskScore = Math.min(10, Math.max(1, volatility / 5));
    const riskLevel = riskScore <= 3 ? 'Low' : riskScore <= 6 ? 'Moderate' : riskScore <= 8 ? 'High' : 'Very High';

    res.json({
      volatility: Math.round(volatility * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      beta: Math.round(beta * 100) / 100,
      var95: Math.round(var95 * 100) / 100,
      maxDrawdown: -Math.round(maxDrawdown * 100) / 100,
      riskScore: Math.round(riskScore * 10) / 10,
      riskLevel
    });
  } catch (err) {
    logger.error('Get risk error:', err);
    res.status(500).json({ error: 'Failed to get risk data' });
  }
});

/**
 * GET /api/analytics/allocation
 * Get portfolio asset allocation based on actual holdings
 */
router.get('/allocation', async (req, res) => {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    // Check if user has any holdings
    const hasHoldings = portfolios.some(p => p.holdings && p.holdings.length > 0);

    if (!hasHoldings) {
      // Return empty allocation data when no holdings exist
      return res.json({
        sectors: [],
        assetClasses: [],
        totalValue: 0,
        isEmpty: true,
        message: 'No holdings found. Add holdings to see allocation breakdown.'
      });
    }

    // Collect all symbols and fetch quotes
    const allSymbols = [...new Set(portfolios.flatMap(p => p.holdings.map(h => h.symbol)))];
    const quotes = allSymbols.length > 0 ? await MarketDataService.getQuotes(allSymbols) : {};

    // Asset class categorization based on symbol patterns and quote data
    const ASSET_CLASS_PATTERNS = {
      'Bonds': ['BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'VGIT', 'GOVT', 'MUB', 'TIP'],
      'REITs': ['VNQ', 'SCHH', 'REIT', 'IYR', 'XLRE', 'USRT', 'RWR'],
      'Commodities': ['GLD', 'SLV', 'IAU', 'PDBC', 'DBC', 'USO', 'UNG', 'GOLD'],
      'Crypto': ['BTC', 'ETH', 'GBTC', 'ETHE', 'BITO', 'ARKB', 'IBIT'],
      'International': ['VXUS', 'EFA', 'VEA', 'EEM', 'VWO', 'IEFA', 'IEMG']
    };

    // Calculate actual values
    let totalValue = 0;
    let totalCash = 0;
    const sectorMap = {};
    const assetClassMap = {
      'Stocks': 0,
      'Bonds': 0,
      'REITs': 0,
      'Commodities': 0,
      'Crypto': 0,
      'International': 0,
      'Cash': 0
    };

    for (const portfolio of portfolios) {
      totalCash += Number(portfolio.cash_balance) || 0;

      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const cost = Number(h.avg_cost_basis);
        const price = Number(quote.price) || cost;
        const value = shares * price;
        const sector = quote.sector || h.sector || 'Other';

        totalValue += value;

        // Sector allocation
        if (!sectorMap[sector]) {
          sectorMap[sector] = 0;
        }
        sectorMap[sector] += value;

        // Determine asset class from symbol
        let classified = false;
        for (const [assetClass, patterns] of Object.entries(ASSET_CLASS_PATTERNS)) {
          if (patterns.some(p => h.symbol.toUpperCase().includes(p))) {
            assetClassMap[assetClass] += value;
            classified = true;
            break;
          }
        }

        // Default to stocks if not classified
        if (!classified) {
          assetClassMap['Stocks'] += value;
        }
      }
    }

    // Add cash to totals
    totalValue += totalCash;
    assetClassMap['Cash'] = totalCash;

    // Build sector allocation
    const sectors = Object.entries(sectorMap)
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
      }))
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value);

    // Build asset class allocation (only include non-zero)
    const assetClasses = Object.entries(assetClassMap)
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
      }))
      .filter(a => a.value > 0)
      .sort((a, b) => b.value - a.value);

    res.json({
      sectors,
      assetClasses,
      totalValue
    });
  } catch (err) {
    logger.error('Get allocation error:', err);
    res.status(500).json({ error: 'Failed to get allocation data' });
  }
});

// ===================== ADVANCED CHART ENDPOINTS =====================

/**
 * GET /api/analytics/charts/waterfall
 * Return attribution data for waterfall chart using real portfolio data
 */
router.get('/charts/waterfall', async (req, res) => {
  try {
    const { portfolioId, period = '3M' } = req.query;

    // Get portfolio holdings using correct Prisma model names
    let portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    if (portfolioId) {
      portfolios = portfolios.filter(p => p.id === portfolioId);
    }

    const allHoldings = portfolios.flatMap(p => p.holdings || []);

    // Return proper empty state when user has no holdings
    if (allHoldings.length === 0) {
      return res.json({
        data: [],
        message: 'No holdings to analyze',
        startValue: 0,
        endValue: 0,
        labels: [],
        values: [],
        period,
        topContributor: null,
        biggestDetractor: null
      });
    }

    // Calculate period days for historical lookup
    const periodDays = {
      '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'YTD': Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24))
    };
    const days = periodDays[period] || 90;

    // Get unique symbols and fetch current quotes
    const symbols = [...new Set(allHoldings.map(h => h.symbol))];
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate total portfolio value first for weight calculation
    let totalPortfolioValue = 0;
    for (const portfolio of portfolios) {
      totalPortfolioValue += Number(portfolio.cash_balance) || 0;
      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const price = Number(quote.price) || Number(h.avg_cost_basis);
        totalPortfolioValue += shares * price;
      }
    }

    // Fetch historical prices and calculate real attribution for each holding
    const attributions = [];
    let totalReturn = 0;

    for (const holding of allHoldings) {
      const symbol = holding.symbol;
      const shares = Number(holding.shares);
      const costBasis = Number(holding.avg_cost_basis) || 0;
      const quote = quotes[symbol] || {};
      const currentPrice = Number(quote.price) || costBasis;
      const currentValue = shares * currentPrice;

      // Calculate weight in portfolio
      const weight = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;

      // Fetch historical price for the period start
      let periodStartPrice = costBasis;
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, days);
        if (history && history.length > 0) {
          periodStartPrice = Number(history[0].close) || costBasis;
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }

      // Calculate actual return percentage for the period
      const returnPct = periodStartPrice > 0 ? ((currentPrice - periodStartPrice) / periodStartPrice) * 100 : 0;

      // Contribution = weight * return (weighted contribution to portfolio return)
      const contribution = (weight / 100) * returnPct;

      attributions.push({
        symbol,
        name: quote.name || symbol,
        shares,
        currentPrice,
        periodStartPrice,
        returnPct: Math.round(returnPct * 100) / 100,
        weight: Math.round(weight * 100) / 100,
        contribution: Math.round(contribution * 100) / 100
      });

      totalReturn += contribution;
    }

    // Sort by contribution (highest to lowest)
    attributions.sort((a, b) => b.contribution - a.contribution);

    // Find top contributor and biggest detractor
    const topContributor = attributions.length > 0 ? {
      symbol: attributions[0].symbol,
      contribution: attributions[0].contribution
    } : null;

    const sortedByContribution = [...attributions].sort((a, b) => a.contribution - b.contribution);
    const biggestDetractor = sortedByContribution.length > 0 && sortedByContribution[0].contribution < 0 ? {
      symbol: sortedByContribution[0].symbol,
      contribution: sortedByContribution[0].contribution
    } : null;

    res.json({
      startValue: 0,
      endValue: Math.round(totalReturn * 100) / 100,
      labels: attributions.map(a => a.symbol),
      values: attributions.map(a => a.contribution),
      attributions, // Include detailed attribution data
      period,
      topContributor,
      biggestDetractor
    });
  } catch (err) {
    logger.error('Waterfall chart error:', err);
    res.status(500).json({ error: 'Failed to generate waterfall data' });
  }
});

/**
 * GET /api/analytics/charts/correlation
 * Correlation matrix for holdings using real historical returns
 */
router.get('/charts/correlation', async (req, res) => {
  try {
    const { portfolioId, period = '3M' } = req.query;

    // Use correct Prisma model names
    let portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    if (portfolioId) {
      portfolios = portfolios.filter(p => p.id === portfolioId);
    }

    const allHoldings = portfolios.flatMap(p => p.holdings || []);
    const symbols = [...new Set(allHoldings.map(h => h.symbol))].slice(0, 15); // Limit to 15 for performance

    // Return proper empty state when not enough holdings for correlation
    if (symbols.length < 2) {
      return res.json({
        data: [],
        message: 'No holdings to analyze',
        labels: [],
        matrix: [],
        avgCorrelation: 0,
        highestPair: null,
        lowestPair: null
      });
    }

    // Calculate period days
    const periodDays = {
      '1M': 30, '3M': 90, '6M': 180, '1Y': 365
    };
    const days = periodDays[period] || 90;

    // Fetch historical returns for each symbol
    const returns = {};
    const activeSymbols = [];

    for (const symbol of symbols) {
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, days);
        if (history && history.length > 10) {
          // Calculate daily returns
          const dailyReturns = [];
          for (let i = 1; i < history.length; i++) {
            const prev = Number(history[i - 1].close);
            const curr = Number(history[i].close);
            if (prev > 0) {
              dailyReturns.push((curr - prev) / prev);
            }
          }
          if (dailyReturns.length > 10) {
            returns[symbol] = dailyReturns;
            activeSymbols.push(symbol);
          }
        }
      } catch (err) {
        logger.debug(`Failed to get history for ${symbol}:`, err.message);
      }
    }

    // Need at least 2 symbols with data
    if (activeSymbols.length < 2) {
      return res.json({
        data: [],
        message: 'Insufficient historical data for correlation analysis',
        labels: [],
        matrix: [],
        avgCorrelation: 0,
        highestPair: null,
        lowestPair: null
      });
    }

    // Calculate correlation matrix using actual returns
    const n = activeSymbols.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else if (j > i) {
          // Calculate real correlation between returns
          const corr = calculateCorrelation(returns[activeSymbols[i]], returns[activeSymbols[j]]);
          matrix[i][j] = Math.round(corr * 100) / 100;
          matrix[j][i] = matrix[i][j];
        }
      }
    }

    // Find highest and lowest correlations
    let highest = { symbols: [], correlation: -2 };
    let lowest = { symbols: [], correlation: 2 };
    let sum = 0, count = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const corr = matrix[i][j];
        sum += corr;
        count++;
        if (corr > highest.correlation) {
          highest = { symbols: [activeSymbols[i], activeSymbols[j]], correlation: corr };
        }
        if (corr < lowest.correlation) {
          lowest = { symbols: [activeSymbols[i], activeSymbols[j]], correlation: corr };
        }
      }
    }

    res.json({
      labels: activeSymbols,
      matrix,
      avgCorrelation: count > 0 ? Math.round((sum / count) * 100) / 100 : 0,
      highestPair: highest.symbols.length > 0 ? highest : null,
      lowestPair: lowest.symbols.length > 0 ? lowest : null,
      period,
      dataPoints: Object.values(returns)[0]?.length || 0
    });
  } catch (err) {
    logger.error('Correlation chart error:', err);
    res.status(500).json({ error: 'Failed to generate correlation data' });
  }
});

/**
 * GET /api/analytics/charts/sankey
 * Capital flow data for Sankey diagram using real portfolio data
 */
router.get('/charts/sankey', async (req, res) => {
  try {
    const { portfolioId, view = 'allocation' } = req.query;

    // Use correct Prisma model names
    let portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    if (portfolioId) {
      portfolios = portfolios.filter(p => p.id === portfolioId);
    }

    const allHoldings = portfolios.flatMap(p => p.holdings || []);

    // Return proper empty state when no holdings
    if (allHoldings.length === 0) {
      return res.json({
        data: [],
        message: 'No holdings to analyze',
        nodes: [],
        links: [],
        totalValue: 0
      });
    }

    // Get unique symbols and fetch current quotes for real prices and sector data
    const symbols = [...new Set(allHoldings.map(h => h.symbol))];
    const quotes = await MarketDataService.getQuotes(symbols);

    // Build nodes and links from actual holdings with real market data
    const nodes = [{ name: 'Portfolio', category: 'Portfolio' }];
    const links = [];
    const sectorMap = new Map();
    let totalValue = 0;

    // First pass: calculate values and group by sector
    for (const holding of allHoldings) {
      const quote = quotes[holding.symbol] || {};
      const shares = Number(holding.shares) || 0;
      const price = Number(quote.price) || Number(holding.avg_cost_basis) || 0;
      const value = shares * price;
      const sector = quote.sector || holding.sector || 'Other';

      totalValue += value;

      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { value: 0, holdings: [] });
      }

      sectorMap.get(sector).value += value;
      sectorMap.get(sector).holdings.push({
        symbol: holding.symbol,
        name: quote.name || holding.symbol,
        value,
        shares,
        price
      });
    }

    // Add cash as a separate node if exists
    let totalCash = 0;
    for (const portfolio of portfolios) {
      totalCash += Number(portfolio.cash_balance) || 0;
    }
    if (totalCash > 0) {
      totalValue += totalCash;
      sectorMap.set('Cash', { value: totalCash, holdings: [{ symbol: 'Cash', name: 'Cash Balance', value: totalCash }] });
    }

    // Create sector nodes and links from portfolio to sectors
    let sectorIndex = 1;
    const sectorIndexMap = new Map();

    for (const [sector, data] of sectorMap) {
      nodes.push({
        name: sector,
        category: sector,
        value: Math.round(data.value * 100) / 100
      });
      sectorIndexMap.set(sector, sectorIndex);
      links.push({
        source: 0,
        target: sectorIndex,
        value: Math.round(data.value * 100) / 100
      });
      sectorIndex++;
    }

    // Add holdings as nodes and links from sectors to holdings
    for (const [sector, data] of sectorMap) {
      const sectorIdx = sectorIndexMap.get(sector);

      for (const holding of data.holdings) {
        const holdingIndex = nodes.length;
        nodes.push({
          name: holding.symbol,
          fullName: holding.name,
          category: sector,
          value: Math.round(holding.value * 100) / 100,
          shares: holding.shares,
          price: holding.price
        });
        links.push({
          source: sectorIdx,
          target: holdingIndex,
          value: Math.round(holding.value * 100) / 100
        });
      }
    }

    res.json({
      nodes,
      links,
      totalValue: Math.round(totalValue * 100) / 100,
      sectorCount: sectorMap.size,
      holdingsCount: allHoldings.length
    });
  } catch (err) {
    logger.error('Sankey chart error:', err);
    res.status(500).json({ error: 'Failed to generate sankey data' });
  }
});

/**
 * GET /api/analytics/charts/volume-profile/:symbol
 * Volume profile data for a symbol using real OHLCV data
 */
router.get('/charts/volume-profile/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '3M' } = req.query;

    // Validate symbol
    if (!symbol || typeof symbol !== 'string' || !/^[A-Z0-9.\-^]{1,10}$/i.test(symbol.trim())) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const cleanSymbol = symbol.trim().toUpperCase();

    // Calculate days based on period
    const periodDays = {
      '1M': 22, '3M': 66, '6M': 132, '1Y': 252, 'YTD': Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24))
    };
    const days = periodDays[period] || 66;

    // Fetch real historical OHLCV data
    let history = [];
    try {
      history = await MarketDataService.getHistoricalPrices(cleanSymbol, days);
    } catch (err) {
      logger.warn(`Failed to fetch history for ${cleanSymbol}:`, err.message);
    }

    // Return empty state if no historical data
    if (!history || history.length === 0) {
      return res.json({
        data: [],
        message: `No historical data available for ${cleanSymbol}`,
        symbol: cleanSymbol,
        period,
        dates: [],
        prices: [],
        volumes: [],
        volumeProfile: [],
        poc: null,
        valueArea: null,
        currentPrice: 0
      });
    }

    // Extract dates, prices (close), and volumes from real data
    const dates = [];
    const prices = [];
    const volumes = [];
    const ohlcv = []; // Full OHLCV data

    for (const bar of history) {
      const date = bar.date || new Date().toISOString().split('T')[0];
      const close = Number(bar.close) || 0;
      const volume = Number(bar.volume) || 0;

      if (close > 0) {
        dates.push(date);
        prices.push(Math.round(close * 100) / 100);
        volumes.push(volume);
        ohlcv.push({
          date,
          open: Number(bar.open) || close,
          high: Number(bar.high) || close,
          low: Number(bar.low) || close,
          close,
          volume
        });
      }
    }

    // Return empty if no valid data
    if (prices.length === 0) {
      return res.json({
        data: [],
        message: `No valid price data for ${cleanSymbol}`,
        symbol: cleanSymbol,
        period,
        dates: [],
        prices: [],
        volumes: [],
        volumeProfile: [],
        poc: null,
        valueArea: null,
        currentPrice: 0
      });
    }

    // Calculate volume profile buckets using real data
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const priceRange = priceMax - priceMin;

    // Determine bucket count based on price range (aim for ~$1-5 per bucket)
    const idealBucketSize = Math.max(0.5, priceRange / 30);
    const buckets = Math.max(10, Math.min(50, Math.ceil(priceRange / idealBucketSize)));
    const bucketSize = priceRange / buckets;

    const volumeProfile = [];
    for (let i = 0; i < buckets; i++) {
      const bucketLow = priceMin + i * bucketSize;
      const bucketHigh = priceMin + (i + 1) * bucketSize;
      const bucketPrice = (bucketLow + bucketHigh) / 2;
      let bucketVolume = 0;
      let buyVolume = 0;
      let sellVolume = 0;

      prices.forEach((p, idx) => {
        if (p >= bucketLow && p < bucketHigh) {
          const vol = volumes[idx];
          bucketVolume += vol;
          // Determine buy/sell volume based on price direction
          if (idx > 0 && prices[idx] > prices[idx - 1]) {
            buyVolume += vol;
          } else {
            sellVolume += vol;
          }
        }
      });

      if (bucketVolume > 0) {
        volumeProfile.push({
          price: Math.round(bucketPrice * 100) / 100,
          priceRange: { low: Math.round(bucketLow * 100) / 100, high: Math.round(bucketHigh * 100) / 100 },
          volume: bucketVolume,
          buyVolume,
          sellVolume,
          buyPercent: bucketVolume > 0 ? Math.round((buyVolume / bucketVolume) * 100) : 0
        });
      }
    }

    // Find POC (Point of Control) - price level with highest volume
    const poc = volumeProfile.length > 0
      ? volumeProfile.reduce((max, v) => v.volume > max.volume ? v : max, volumeProfile[0])
      : null;

    // Calculate Value Area (70% of total volume)
    const totalVolume = volumeProfile.reduce((sum, v) => sum + v.volume, 0);
    const valueAreaVolume = totalVolume * 0.7;
    const sortedByVolume = [...volumeProfile].sort((a, b) => b.volume - a.volume);

    let accumVolume = 0;
    let vaHigh = poc ? poc.price : priceMax;
    let vaLow = poc ? poc.price : priceMin;

    for (const level of sortedByVolume) {
      accumVolume += level.volume;
      if (level.price > vaHigh) vaHigh = level.price;
      if (level.price < vaLow) vaLow = level.price;
      if (accumVolume >= valueAreaVolume) break;
    }

    // Get current price from most recent quote
    let currentPrice = prices[prices.length - 1];
    try {
      const quote = await MarketDataService.getQuotes([cleanSymbol]);
      if (quote[cleanSymbol] && quote[cleanSymbol].price) {
        currentPrice = Number(quote[cleanSymbol].price);
      }
    } catch (err) {
      logger.debug(`Using historical close for current price`);
    }

    res.json({
      symbol: cleanSymbol,
      period,
      dates,
      prices,
      volumes,
      ohlcv, // Include full OHLCV data for candlestick charting
      volumeProfile,
      poc: poc ? { price: poc.price, volume: poc.volume } : null,
      valueArea: { high: Math.round(vaHigh * 100) / 100, low: Math.round(vaLow * 100) / 100 },
      currentPrice: Math.round(currentPrice * 100) / 100,
      stats: {
        totalVolume,
        avgVolume: Math.round(totalVolume / volumes.length),
        priceRange: { min: Math.round(priceMin * 100) / 100, max: Math.round(priceMax * 100) / 100 },
        dataPoints: prices.length
      }
    });
  } catch (err) {
    logger.error('Volume profile error:', err);
    res.status(500).json({ error: 'Failed to generate volume profile data' });
  }
});

/**
 * GET /api/analytics/charts/bubble-3d
 * 3D bubble chart data for portfolio visualization using real data
 */
router.get('/charts/bubble-3d', async (req, res) => {
  try {
    const { portfolioId } = req.query;

    // Use correct Prisma model names
    let portfolios = await prisma.portfolios.findMany({
      where: { user_id: req.user.id },
      include: { holdings: true }
    });

    if (portfolioId) {
      portfolios = portfolios.filter(p => p.id === portfolioId);
    }

    const allHoldings = portfolios.flatMap(p => p.holdings || []);

    // Return proper empty state when no holdings
    if (allHoldings.length === 0) {
      return res.json({
        data: [],
        message: 'No holdings to analyze',
        holdings: [],
        totalValue: 0
      });
    }

    // Get unique symbols and fetch current quotes
    const symbols = [...new Set(allHoldings.map(h => h.symbol))];
    const quotes = await MarketDataService.getQuotes(symbols);

    // Calculate total portfolio value first
    let totalValue = 0;
    for (const portfolio of portfolios) {
      totalValue += Number(portfolio.cash_balance) || 0;
      for (const h of portfolio.holdings) {
        const quote = quotes[h.symbol] || {};
        const shares = Number(h.shares);
        const price = Number(quote.price) || Number(h.avg_cost_basis);
        totalValue += shares * price;
      }
    }

    // Fetch historical data to calculate real volatility and returns for each holding
    const holdings = [];

    for (const holding of allHoldings) {
      const symbol = holding.symbol;
      const quote = quotes[symbol] || {};
      const shares = Number(holding.shares);
      const costBasis = Number(holding.avg_cost_basis) || 0;
      const currentPrice = Number(quote.price) || costBasis;
      const value = shares * currentPrice;
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      const sector = quote.sector || holding.sector || 'Other';

      // Calculate actual return from cost basis
      const returnPct = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0;

      // Fetch historical data to calculate real volatility
      let volatility = 20; // Default volatility
      try {
        const history = await MarketDataService.getHistoricalPrices(symbol, 90);
        if (history && history.length > 10) {
          // Calculate daily returns
          const returns = [];
          for (let i = 1; i < history.length; i++) {
            const prev = Number(history[i - 1].close);
            const curr = Number(history[i].close);
            if (prev > 0) {
              returns.push((curr - prev) / prev);
            }
          }

          // Calculate annualized volatility (standard deviation * sqrt(252))
          if (returns.length > 5) {
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
            volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized as percentage
          }
        }
      } catch (err) {
        logger.debug(`Using default volatility for ${symbol}`);
      }

      // Get beta from quote data if available
      const beta = Number(quote.beta) || 1.0;

      holdings.push({
        symbol,
        name: quote.name || symbol,
        sector,
        value: Math.round(value * 100) / 100,
        weight: Math.round(weight * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        return: Math.round(returnPct * 100) / 100,
        shares,
        currentPrice: Math.round(currentPrice * 100) / 100,
        costBasis: Math.round(costBasis * 100) / 100,
        beta: Math.round(beta * 100) / 100,
        dayChange: Number(quote.change) || 0,
        dayChangePct: Number(quote.changePercent) || 0
      });
    }

    // Sort by value (largest first)
    holdings.sort((a, b) => b.value - a.value);

    // Calculate portfolio-level stats
    const avgVolatility = holdings.length > 0
      ? holdings.reduce((sum, h) => sum + (h.volatility * h.weight / 100), 0)
      : 0;

    const avgReturn = holdings.length > 0
      ? holdings.reduce((sum, h) => sum + (h.return * h.weight / 100), 0)
      : 0;

    res.json({
      holdings,
      totalValue: Math.round(totalValue * 100) / 100,
      holdingsCount: holdings.length,
      sectorCount: [...new Set(holdings.map(h => h.sector))].length,
      stats: {
        weightedAvgVolatility: Math.round(avgVolatility * 100) / 100,
        weightedAvgReturn: Math.round(avgReturn * 100) / 100,
        topHolding: holdings[0] || null
      }
    });
  } catch (err) {
    logger.error('3D bubble chart error:', err);
    res.status(500).json({ error: 'Failed to generate 3D bubble data' });
  }
});

module.exports = router;
