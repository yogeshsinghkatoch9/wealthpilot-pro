/**
 * WealthPilot Pro - Onboarding Service
 * Quick-start wizard and progressive disclosure
 */

const ImportService = require('./import');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available for onboarding service, using mock data');
  Database = {
    getUserById: (id) => ({ id, first_name: 'Demo', last_name: 'User' }),
    getPortfoliosByUser: () => [],
    getHoldingsByUser: () => [],
    getWatchlistsByUser: () => [],
    getAlertsByUser: () => [],
    createPortfolio: () => uuidv4(),
    getQuote: () => null,
    addHolding: () => ({})
  };
}

class OnboardingService {
  
  /**
   * Get onboarding progress for a user
   */
  static getProgress(userId) {
    const user = Database.getUserById(userId);
    const portfolios = Database.getPortfoliosByUser(userId);
    const holdings = Database.getHoldingsByUser(userId);
    const watchlists = Database.getWatchlistsByUser(userId);
    const alerts = Database.getAlertsByUser(userId);

    const steps = {
      profile: {
        completed: !!(user?.first_name && user?.last_name),
        label: 'Complete Profile',
        description: 'Add your name and preferences'
      },
      portfolio: {
        completed: portfolios.length > 0,
        label: 'Create Portfolio',
        description: 'Set up your first portfolio'
      },
      holdings: {
        completed: holdings.length > 0,
        label: 'Add Holdings',
        description: 'Import or manually add your investments'
      },
      watchlist: {
        completed: watchlists.some(w => w.items?.length > 0),
        label: 'Create Watchlist',
        description: 'Track stocks you\'re interested in'
      },
      alerts: {
        completed: alerts.length > 0,
        label: 'Set Alerts',
        description: 'Get notified of price movements'
      }
    };

    const completedSteps = Object.values(steps).filter(s => s.completed).length;
    const totalSteps = Object.keys(steps).length;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    return {
      steps,
      completedSteps,
      totalSteps,
      progress,
      isComplete: progress === 100,
      nextStep: Object.entries(steps).find(([_, s]) => !s.completed)?.[0] || null
    };
  }

  /**
   * Quick portfolio templates
   */
  static getPortfolioTemplates() {
    return [
      {
        id: 'growth',
        name: 'Growth Portfolio',
        description: 'Focus on capital appreciation with tech and growth stocks',
        riskLevel: 'High',
        holdings: [
          { symbol: 'AAPL', allocation: 15, name: 'Apple Inc.' },
          { symbol: 'MSFT', allocation: 15, name: 'Microsoft' },
          { symbol: 'NVDA', allocation: 12, name: 'NVIDIA' },
          { symbol: 'GOOGL', allocation: 10, name: 'Alphabet' },
          { symbol: 'AMZN', allocation: 10, name: 'Amazon' },
          { symbol: 'META', allocation: 8, name: 'Meta Platforms' },
          { symbol: 'TSLA', allocation: 8, name: 'Tesla' },
          { symbol: 'NFLX', allocation: 5, name: 'Netflix' },
          { symbol: 'CRM', allocation: 5, name: 'Salesforce' },
          { symbol: 'CASH', allocation: 12, name: 'Cash' }
        ]
      },
      {
        id: 'dividend',
        name: 'Dividend Income',
        description: 'Steady income from dividend-paying blue chips',
        riskLevel: 'Low-Medium',
        holdings: [
          { symbol: 'JNJ', allocation: 12, name: 'Johnson & Johnson' },
          { symbol: 'PG', allocation: 12, name: 'Procter & Gamble' },
          { symbol: 'KO', allocation: 10, name: 'Coca-Cola' },
          { symbol: 'VZ', allocation: 10, name: 'Verizon' },
          { symbol: 'T', allocation: 8, name: 'AT&T' },
          { symbol: 'PFE', allocation: 8, name: 'Pfizer' },
          { symbol: 'XOM', allocation: 8, name: 'ExxonMobil' },
          { symbol: 'CVX', allocation: 8, name: 'Chevron' },
          { symbol: 'MMM', allocation: 7, name: '3M' },
          { symbol: 'IBM', allocation: 7, name: 'IBM' },
          { symbol: 'CASH', allocation: 10, name: 'Cash' }
        ]
      },
      {
        id: 'balanced',
        name: 'Balanced Portfolio',
        description: 'Mix of growth and value across sectors',
        riskLevel: 'Medium',
        holdings: [
          { symbol: 'VTI', allocation: 30, name: 'Total Stock Market ETF' },
          { symbol: 'VXUS', allocation: 15, name: 'International Stocks ETF' },
          { symbol: 'BND', allocation: 20, name: 'Total Bond Market ETF' },
          { symbol: 'AAPL', allocation: 8, name: 'Apple Inc.' },
          { symbol: 'MSFT', allocation: 7, name: 'Microsoft' },
          { symbol: 'JNJ', allocation: 5, name: 'Johnson & Johnson' },
          { symbol: 'JPM', allocation: 5, name: 'JPMorgan Chase' },
          { symbol: 'CASH', allocation: 10, name: 'Cash' }
        ]
      },
      {
        id: 'conservative',
        name: 'Conservative Income',
        description: 'Capital preservation with bonds and utilities',
        riskLevel: 'Low',
        holdings: [
          { symbol: 'BND', allocation: 40, name: 'Total Bond Market ETF' },
          { symbol: 'VTIP', allocation: 15, name: 'TIPS Bond ETF' },
          { symbol: 'VPU', allocation: 10, name: 'Utilities ETF' },
          { symbol: 'VNQ', allocation: 10, name: 'Real Estate ETF' },
          { symbol: 'JNJ', allocation: 5, name: 'Johnson & Johnson' },
          { symbol: 'PG', allocation: 5, name: 'Procter & Gamble' },
          { symbol: 'CASH', allocation: 15, name: 'Cash' }
        ]
      }
    ];
  }

  /**
   * Create portfolio from template
   */
  static createFromTemplate(userId, templateId, portfolioValue, name = null) {
    const templates = this.getPortfolioTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Calculate cash allocation
    const cashAllocation = template.holdings.find(h => h.symbol === 'CASH')?.allocation || 10;
    const cashBalance = (portfolioValue * cashAllocation) / 100;
    const investableAmount = portfolioValue - cashBalance;

    // Create portfolio
    const portfolioId = Database.createPortfolio({
      userId,
      name: name || template.name,
      description: template.description,
      cashBalance,
      benchmark: 'SPY'
    });

    // Add holdings (excluding cash)
    const addedHoldings = [];
    for (const holding of template.holdings) {
      if (holding.symbol === 'CASH') continue;

      const allocationAmount = (portfolioValue * holding.allocation) / 100;
      
      // Get current price (mock for now)
      const quote = Database.getQuote(holding.symbol);
      const price = quote?.price || 100;
      const shares = Math.floor(allocationAmount / price);

      if (shares > 0) {
        Database.addHolding({
          portfolioId,
          symbol: holding.symbol,
          shares,
          costBasis: price
        });

        addedHoldings.push({
          symbol: holding.symbol,
          shares,
          price,
          value: shares * price
        });
      }
    }

    return {
      portfolioId,
      name: name || template.name,
      totalValue: portfolioValue,
      cashBalance,
      holdings: addedHoldings
    };
  }

  /**
   * Smart import suggestions based on CSV content
   */
  static analyzeImport(csvContent) {
    const { headers, rows } = ImportService.parseCSV(csvContent);
    
    // Detect broker format
    const brokerPatterns = {
      'fidelity': ['run date', 'account', 'action', 'symbol', 'quantity', 'price'],
      'schwab': ['date', 'action', 'symbol', 'quantity', 'price', 'amount'],
      'vanguard': ['trade date', 'symbol', 'transaction type', 'shares', 'share price'],
      'etrade': ['transactiondate', 'transactiontype', 'symbol', 'quantity', 'price'],
      'robinhood': ['activity date', 'instrument', 'trans code', 'quantity', 'price'],
      'tdameritrade': ['date', 'transaction id', 'description', 'quantity', 'symbol', 'price']
    };

    let detectedBroker = 'generic';
    const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

    for (const [broker, pattern] of Object.entries(brokerPatterns)) {
      const matches = pattern.filter(p => 
        normalizedHeaders.some(h => h.includes(p.replace(/[^a-z]/g, '')))
      );
      if (matches.length >= 3) {
        detectedBroker = broker;
        break;
      }
    }

    // Analyze content
    const symbols = new Set();
    const dateRange = { min: null, max: null };
    const transactionTypes = new Set();

    for (const row of rows) {
      // Extract symbols
      for (const val of Object.values(row)) {
        if (typeof val === 'string' && /^[A-Z]{1,5}$/.test(val)) {
          symbols.add(val);
        }
      }
      
      // Extract dates
      for (const val of Object.values(row)) {
        const date = ImportService.parseDate(val);
        if (date) {
          if (!dateRange.min || date < dateRange.min) dateRange.min = date;
          if (!dateRange.max || date > dateRange.max) dateRange.max = date;
        }
      }
    }

    return {
      detectedBroker,
      headers,
      rowCount: rows.length,
      symbols: Array.from(symbols).slice(0, 20),
      dateRange: {
        start: dateRange.min?.toISOString().split('T')[0],
        end: dateRange.max?.toISOString().split('T')[0]
      },
      suggestions: this.getImportSuggestions(detectedBroker, headers)
    };
  }

  /**
   * Get column mapping suggestions for detected broker
   */
  static getImportSuggestions(broker, headers) {
    const mappings = {
      'fidelity': {
        date: 'run date',
        symbol: 'symbol',
        type: 'action',
        shares: 'quantity',
        price: 'price',
        amount: 'amount'
      },
      'schwab': {
        date: 'date',
        symbol: 'symbol',
        type: 'action',
        shares: 'quantity',
        price: 'price',
        amount: 'amount'
      },
      'generic': {
        date: headers.find(h => /date/i.test(h)) || headers[0],
        symbol: headers.find(h => /symbol|ticker/i.test(h)) || headers[1],
        type: headers.find(h => /type|action/i.test(h)) || headers[2],
        shares: headers.find(h => /shares|quantity|qty/i.test(h)) || headers[3],
        price: headers.find(h => /price/i.test(h)) || headers[4],
        amount: headers.find(h => /amount|total/i.test(h)) || headers[5]
      }
    };

    return mappings[broker] || mappings['generic'];
  }

  /**
   * Generate quick-start checklist based on user's goals
   */
  static getPersonalizedChecklist(userId, goals = []) {
    const progress = this.getProgress(userId);
    const checklist = [];

    // Basic setup (always required)
    checklist.push({
      category: 'Setup',
      items: [
        { id: 'profile', label: 'Complete your profile', done: progress.steps.profile.completed, priority: 'high' },
        { id: 'portfolio', label: 'Create your first portfolio', done: progress.steps.portfolio.completed, priority: 'high' },
        { id: 'holdings', label: 'Add your holdings', done: progress.steps.holdings.completed, priority: 'high' }
      ]
    });

    // Goal-specific items
    if (goals.includes('income') || goals.includes('dividends')) {
      checklist.push({
        category: 'Dividend Tracking',
        items: [
          { id: 'dividend-holdings', label: 'Add dividend-paying stocks', done: false, priority: 'medium' },
          { id: 'dividend-calendar', label: 'Check dividend calendar', done: false, priority: 'low', link: '/dividend-calendar' },
          { id: 'income-projection', label: 'Review income projections', done: false, priority: 'low', link: '/income-projections' }
        ]
      });
    }

    if (goals.includes('growth')) {
      checklist.push({
        category: 'Growth Tracking',
        items: [
          { id: 'performance', label: 'Set up performance tracking', done: false, priority: 'medium', link: '/performance' },
          { id: 'benchmark', label: 'Select benchmark', done: false, priority: 'low' },
          { id: 'watchlist', label: 'Create a growth watchlist', done: progress.steps.watchlist.completed, priority: 'medium' }
        ]
      });
    }

    if (goals.includes('tax')) {
      checklist.push({
        category: 'Tax Optimization',
        items: [
          { id: 'tax-lots', label: 'Review tax lots', done: false, priority: 'medium', link: '/tax-lots' },
          { id: 'harvesting', label: 'Check loss harvesting opportunities', done: false, priority: 'low', link: '/tax' }
        ]
      });
    }

    // Alerts (always useful)
    checklist.push({
      category: 'Alerts & Monitoring',
      items: [
        { id: 'price-alert', label: 'Set up price alerts', done: progress.steps.alerts.completed, priority: 'medium' },
        { id: 'daily-snapshot', label: 'Review daily snapshot', done: false, priority: 'low', link: '/snapshot' }
      ]
    });

    return checklist;
  }

  /**
   * Get recommended pages based on user's portfolio
   */
  static getRecommendedPages(userId) {
    const holdings = Database.getHoldingsByUser(userId);
    const portfolios = Database.getPortfoliosByUser(userId);

    const recommendations = [];

    // Always recommend dashboard
    recommendations.push({
      page: '/dashboard',
      label: 'Dashboard',
      reason: 'Overview of your portfolio',
      priority: 1
    });

    if (holdings.length > 0) {
      // Has holdings - recommend analytics
      recommendations.push({
        page: '/performance',
        label: 'Performance',
        reason: 'Track your returns',
        priority: 2
      });

      recommendations.push({
        page: '/sectors',
        label: 'Sector Allocation',
        reason: 'Understand your exposure',
        priority: 3
      });

      // Check for dividend stocks
      const dividendHoldings = holdings.filter(h => {
        const quote = Database.getQuote(h.symbol);
        return quote && Number(quote.dividend_yield) > 0;
      });

      if (dividendHoldings.length > 0) {
        recommendations.push({
          page: '/dividends',
          label: 'Dividend Analysis',
          reason: `You have ${dividendHoldings.length} dividend-paying stocks`,
          priority: 4
        });
      }

      // Multiple portfolios
      if (portfolios.length > 1) {
        recommendations.push({
          page: '/compare-portfolios',
          label: 'Compare Portfolios',
          reason: 'See how your portfolios stack up',
          priority: 5
        });
      }

      // Tax lots if has gains/losses
      recommendations.push({
        page: '/tax-lots',
        label: 'Tax Lots',
        reason: 'Review for tax optimization',
        priority: 6
      });
    } else {
      // No holdings yet - recommend import
      recommendations.push({
        page: '/import-wizard',
        label: 'Import Holdings',
        reason: 'Get started quickly with import',
        priority: 2
      });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  }
}

module.exports = OnboardingService;
