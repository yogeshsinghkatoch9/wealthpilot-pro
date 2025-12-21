/**
 * WealthPilot Pro Data Service
 * Provides data to frontend pages from the API
 * Falls back to mock data when API is unavailable
 */

const { api } = require('./client');

class DataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  // Cache management
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(pattern) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // ==================== DASHBOARD ====================

  async getDashboardData() {
    const cacheKey = 'dashboard';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const data = await api.getDashboard();
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
      return this.getMockDashboard();
    }
  }

  // ==================== PORTFOLIOS ====================

  async getPortfolios() {
    const cacheKey = 'portfolios';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const data = await api.getPortfolios();
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Failed to fetch portfolios:', err);
      return this.getMockPortfolios();
    }
  }

  async getPortfolioDetails(id) {
    try {
      const [portfolio, performance, allocation, dividends, risk] = await Promise.all([
        api.getPortfolio(id),
        api.getPortfolioPerformance(id, '1M').catch(() => null),
        api.getPortfolioAllocation(id).catch(() => null),
        api.getPortfolioDividends(id).catch(() => null),
        api.getPortfolioRisk(id).catch(() => null)
      ]);

      return {
        ...portfolio,
        performance,
        allocation,
        dividends,
        risk
      };
    } catch (err) {
      console.error('Failed to fetch portfolio details:', err);
      return this.getMockPortfolioDetails(id);
    }
  }

  // ==================== HOLDINGS ====================

  async getHoldings(portfolioId) {
    try {
      const portfolio = await api.getPortfolio(portfolioId);
      return portfolio.holdings || [];
    } catch (err) {
      console.error('Failed to fetch holdings:', err);
      return this.getMockHoldings();
    }
  }

  async getHoldingDetails(id) {
    try {
      return await api.getHolding(id);
    } catch (err) {
      console.error('Failed to fetch holding:', err);
      return null;
    }
  }

  // ==================== TRANSACTIONS ====================

  async getTransactions(params = {}) {
    try {
      const result = await api.getTransactions(params);
      return result.transactions || [];
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      return this.getMockTransactions();
    }
  }

  // ==================== WATCHLISTS ====================

  async getWatchlists() {
    try {
      return await api.getWatchlists();
    } catch (err) {
      console.error('Failed to fetch watchlists:', err);
      return this.getMockWatchlists();
    }
  }

  // ==================== MARKET DATA ====================

  async getQuote(symbol) {
    const cacheKey = `quote:${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const data = await api.getQuote(symbol);
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch quote for ${symbol}:`, err);
      return this.getMockQuote(symbol);
    }
  }

  async getQuotes(symbols) {
    try {
      return await api.getQuotes(symbols);
    } catch (err) {
      console.error('Failed to fetch quotes:', err);
      const quotes = {};
      for (const symbol of symbols) {
        quotes[symbol] = this.getMockQuote(symbol);
      }
      return quotes;
    }
  }

  async getHistoricalData(symbol, days = 365) {
    try {
      const result = await api.getHistoricalPrices(symbol, days);
      return result.data || [];
    } catch (err) {
      console.error(`Failed to fetch history for ${symbol}:`, err);
      return this.getMockHistory(symbol, days);
    }
  }

  // ==================== ANALYTICS ====================

  async getPerformance(portfolioId, period) {
    try {
      if (portfolioId) {
        return await api.getPortfolioPerformance(portfolioId, period);
      }
      return await api.getOverallPerformance(period);
    } catch (err) {
      console.error('Failed to fetch performance:', err);
      return this.getMockPerformance();
    }
  }

  async getAllocation(portfolioId) {
    try {
      if (portfolioId) {
        return await api.getPortfolioAllocation(portfolioId);
      }
      return await api.getOverallAllocation();
    } catch (err) {
      console.error('Failed to fetch allocation:', err);
      return this.getMockAllocation();
    }
  }

  async getRisk(portfolioId) {
    try {
      if (portfolioId) {
        return await api.getPortfolioRisk(portfolioId);
      }
      return await api.getOverallRisk();
    } catch (err) {
      console.error('Failed to fetch risk:', err);
      return this.getMockRisk();
    }
  }

  async getTaxLots() {
    try {
      return await api.getTaxLots();
    } catch (err) {
      console.error('Failed to fetch tax lots:', err);
      return this.getMockTaxLots();
    }
  }

  // ==================== DIVIDENDS ====================

  async getDividends(portfolioId) {
    try {
      if (portfolioId) {
        return await api.getPortfolioDividends(portfolioId);
      }
      return await api.getDividendIncome();
    } catch (err) {
      console.error('Failed to fetch dividends:', err);
      return this.getMockDividends();
    }
  }

  async getDividendCalendar() {
    try {
      return await api.getDividendCalendar();
    } catch (err) {
      console.error('Failed to fetch dividend calendar:', err);
      return [];
    }
  }

  // ==================== MOCK DATA ====================

  getMockDashboard() {
    return {
      totalValue: 1248642.50,
      totalCost: 985420.00,
      totalGain: 263222.50,
      totalGainPct: 26.71,
      dayChange: 4842.24,
      dayChangePct: 0.39,
      portfoliosCount: 2,
      holdingsCount: 15,
      topGainers: [
        { symbol: 'NVDA', name: 'NVIDIA', dayChangePct: 3.82, dayChange: 2420.50 },
        { symbol: 'META', name: 'Meta', dayChangePct: 2.18, dayChange: 1842.40 }
      ],
      topLosers: [
        { symbol: 'INTC', name: 'Intel', dayChangePct: -2.14, dayChange: -428.20 }
      ],
      sectorAllocation: [
        { sector: 'Technology', weight: 62.4 },
        { sector: 'Healthcare', weight: 12.8 },
        { sector: 'Financial Services', weight: 10.2 },
        { sector: 'Consumer Cyclical', weight: 8.4 },
        { sector: 'Communication Services', weight: 6.2 }
      ]
    };
  }

  getMockPortfolios() {
    return [
      {
        id: '1',
        name: 'Growth Portfolio',
        totalValue: 842420.50,
        totalGain: 184220.50,
        totalGainPct: 28.0,
        dayChange: 3242.20,
        dayChangePct: 0.39,
        holdingsCount: 8
      },
      {
        id: '2',
        name: 'Dividend Income',
        totalValue: 406222.00,
        totalGain: 79002.00,
        totalGainPct: 24.15,
        dayChange: 1600.04,
        dayChangePct: 0.40,
        holdingsCount: 7
      }
    ];
  }

  getMockPortfolioDetails(id) {
    return {
      id,
      name: 'Growth Portfolio',
      totalValue: 842420.50,
      cashBalance: 15420.50,
      holdings: this.getMockHoldings(),
      performance: this.getMockPerformance(),
      allocation: this.getMockAllocation(),
      risk: this.getMockRisk()
    };
  }

  getMockHoldings() {
    return [
      { symbol: 'AAPL', name: 'Apple Inc.', shares: 100, price: 189.65, marketValue: 18965, gain: 4415, gainPct: 30.35, weight: 15.2 },
      { symbol: 'MSFT', name: 'Microsoft', shares: 50, price: 428.42, marketValue: 21421, gain: 5421, gainPct: 33.88, weight: 17.2 },
      { symbol: 'NVDA', name: 'NVIDIA', shares: 75, price: 142.84, marketValue: 10713, gain: 3588, gainPct: 50.36, weight: 8.6 },
      { symbol: 'GOOGL', name: 'Alphabet', shares: 40, price: 174.82, marketValue: 6993, gain: 1473, gainPct: 26.68, weight: 5.6 },
      { symbol: 'META', name: 'Meta', shares: 30, price: 584.24, marketValue: 17527, gain: 8977, gainPct: 105.00, weight: 14.1 }
    ];
  }

  getMockTransactions() {
    return [
      { id: '1', symbol: 'AAPL', type: 'buy', shares: 50, price: 140.00, amount: 7000, executedAt: '2022-03-15' },
      { id: '2', symbol: 'AAPL', type: 'dividend', amount: 96.00, executedAt: '2024-02-15' },
      { id: '3', symbol: 'NVDA', type: 'buy', shares: 75, price: 95.00, amount: 7125, executedAt: '2022-06-10' },
      { id: '4', symbol: 'MSFT', type: 'dividend', amount: 37.50, executedAt: '2024-03-14' }
    ];
  }

  getMockWatchlists() {
    return [
      {
        id: '1',
        name: 'Tech Watchlist',
        items: [
          { symbol: 'AMD', quote: { price: 142.50, change: 2.40, changePercent: 1.71 } },
          { symbol: 'CRM', quote: { price: 284.20, change: -1.80, changePercent: -0.63 } }
        ]
      }
    ];
  }

  getMockQuote(symbol) {
    const quotes = {
      'AAPL': { symbol: 'AAPL', name: 'Apple Inc.', price: 189.65, change: 1.23, changePercent: 0.65 },
      'MSFT': { symbol: 'MSFT', name: 'Microsoft', price: 428.42, change: 3.24, changePercent: 0.76 },
      'NVDA': { symbol: 'NVDA', name: 'NVIDIA', price: 142.84, change: 2.72, changePercent: 1.94 },
      'GOOGL': { symbol: 'GOOGL', name: 'Alphabet', price: 174.82, change: 1.58, changePercent: 0.91 },
      'META': { symbol: 'META', name: 'Meta', price: 584.24, change: 5.82, changePercent: 1.01 }
    };
    return quotes[symbol] || { symbol, price: 100, change: 0, changePercent: 0 };
  }

  getMockHistory(symbol, days) {
    const data = [];
    let price = 100;
    for (let i = days; i >= 0; i--) {
      price += (Math.random() - 0.48) * 3;
      data.push({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        close: price,
        open: price * 0.99,
        high: price * 1.02,
        low: price * 0.98,
        volume: Math.floor(Math.random() * 50000000)
      });
    }
    return data;
  }

  getMockPerformance() {
    return {
      currentValue: 842420.50,
      totalGain: 184220.50,
      totalGainPct: 28.0,
      dayChange: 3242.20,
      dayChangePct: 0.39,
      periodReturn: 12420.50,
      periodReturnPct: 1.5,
      benchmark: { symbol: 'SPY', return: 1.2 },
      alpha: 0.3
    };
  }

  getMockAllocation() {
    return {
      byHolding: [
        { symbol: 'MSFT', weight: 17.2 },
        { symbol: 'AAPL', weight: 15.2 },
        { symbol: 'META', weight: 14.1 },
        { symbol: 'NVDA', weight: 8.6 },
        { symbol: 'GOOGL', weight: 5.6 }
      ],
      bySector: [
        { sector: 'Technology', weight: 62.4 },
        { sector: 'Consumer Cyclical', weight: 18.2 },
        { sector: 'Communication Services', weight: 14.1 }
      ],
      cash: { weight: 1.8 }
    };
  }

  getMockRisk() {
    return {
      volatility: 18.4,
      sharpeRatio: 1.24,
      beta: 1.12,
      maxDrawdown: 15.2,
      var95: 42500,
      riskScore: 6,
      summary: 'Moderate-Aggressive'
    };
  }

  getMockTaxLots() {
    return {
      summary: {
        totalCostBasis: 658200,
        totalMarketValue: 842420.50,
        totalGain: 184220.50,
        longTermGains: 142000,
        shortTermGains: 42220.50,
        estimatedTax: 34800
      },
      taxLots: []
    };
  }

  getMockDividends() {
    return {
      portfolioYield: 1.84,
      annualDividends: 15500,
      monthlyDividends: 1292,
      totalReceived: 8420,
      holdings: []
    };
  }
}

// Export singleton
const dataService = new DataService();
module.exports = { dataService, DataService };
