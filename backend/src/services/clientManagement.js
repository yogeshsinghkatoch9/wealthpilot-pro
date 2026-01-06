/**
 * WealthPilot Pro - Client Management Service
 * Multi-client/household management for wealth advisors and RIAs
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available for client management service, using mock data');
  Database = {
    createClient: () => ({}),
    getClientsByAdvisor: () => [],
    getPortfoliosByClient: () => [],
    getHoldingsByPortfolio: () => [],
    getQuote: () => null,
    getClientById: () => null,
    getTransactionsByClient: () => [],
    createHousehold: () => ({}),
    getHouseholdById: () => null,
    getHouseholdsByAdvisor: () => [],
    updateClient: () => true
  };
}

class ClientService {
  
  /**
   * Create a new client (for advisor accounts)
   */
  static createClient(advisorId, clientData) {
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      riskTolerance = 'moderate',
      investmentGoals = [],
      notes = ''
    } = clientData;

    const client = {
      id: uuidv4(),
      advisorId,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      riskTolerance,
      investmentGoals,
      notes,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in database (extend schema as needed)
    Database.createClient(client);
    
    return client;
  }

  /**
   * Get all clients for an advisor
   */
  static getClients(advisorId, options = {}) {
    const { 
      status = 'active',
      search = '',
      sortBy = 'lastName',
      sortOrder = 'asc',
      limit = 50,
      offset = 0
    } = options;

    let clients = Database.getClientsByAdvisor(advisorId);
    
    // Filter by status
    if (status !== 'all') {
      clients = clients.filter(c => c.status === status);
    }
    
    // Search by name or email
    if (search) {
      const term = search.toLowerCase();
      clients = clients.filter(c => 
        c.firstName?.toLowerCase().includes(term) ||
        c.lastName?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
      );
    }
    
    // Sort
    clients.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      const cmp = aVal.localeCompare(bVal);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    
    // Paginate
    const total = clients.length;
    clients = clients.slice(offset, offset + limit);
    
    // Add portfolio summaries
    clients = clients.map(client => ({
      ...client,
      portfolioSummary: this.getClientPortfolioSummary(client.id)
    }));
    
    return { clients, total, limit, offset };
  }

  /**
   * Get portfolio summary for a client
   */
  static getClientPortfolioSummary(clientId) {
    const portfolios = Database.getPortfoliosByClient(clientId);
    
    if (portfolios.length === 0) {
      return {
        portfolioCount: 0,
        totalValue: 0,
        totalGain: 0,
        totalGainPct: 0
      };
    }
    
    let totalValue = 0;
    let totalCost = 0;
    
    for (const portfolio of portfolios) {
      const holdings = Database.getHoldingsByPortfolio(portfolio.id);
      
      for (const holding of holdings) {
        const quote = Database.getQuote(holding.symbol);
        const price = quote ? Number(quote.price) : Number(holding.cost_basis);
        const shares = Number(holding.shares);
        
        totalValue += shares * price;
        totalCost += shares * Number(holding.cost_basis);
      }
      
      totalValue += Number(portfolio.cash_balance) || 0;
      totalCost += Number(portfolio.cash_balance) || 0;
    }
    
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    
    return {
      portfolioCount: portfolios.length,
      totalValue,
      totalCost,
      totalGain,
      totalGainPct
    };
  }

  /**
   * Get client details with full portfolio data
   */
  static getClientDetails(clientId, advisorId) {
    const client = Database.getClientById(clientId);
    
    if (!client || client.advisorId !== advisorId) {
      return null;
    }
    
    const portfolios = Database.getPortfoliosByClient(clientId);
    
    // Enrich portfolios with holdings
    const enrichedPortfolios = portfolios.map(portfolio => {
      const holdings = Database.getHoldingsByPortfolio(portfolio.id);
      
      let portfolioValue = Number(portfolio.cash_balance) || 0;
      let portfolioCost = Number(portfolio.cash_balance) || 0;
      
      const enrichedHoldings = holdings.map(h => {
        const quote = Database.getQuote(h.symbol);
        const price = quote ? Number(quote.price) : Number(h.cost_basis);
        const shares = Number(h.shares);
        const costBasis = Number(h.cost_basis);
        const marketValue = shares * price;
        const totalCost = shares * costBasis;
        
        portfolioValue += marketValue;
        portfolioCost += totalCost;
        
        return {
          ...h,
          price,
          marketValue,
          gain: marketValue - totalCost,
          gainPct: ((price - costBasis) / costBasis) * 100
        };
      });
      
      return {
        ...portfolio,
        holdings: enrichedHoldings,
        totalValue: portfolioValue,
        totalCost: portfolioCost,
        totalGain: portfolioValue - portfolioCost,
        totalGainPct: portfolioCost > 0 ? ((portfolioValue - portfolioCost) / portfolioCost) * 100 : 0
      };
    });
    
    // Get recent activity
    const recentTransactions = Database.getTransactionsByClient(clientId, { limit: 10 });
    
    return {
      ...client,
      portfolios: enrichedPortfolios,
      recentTransactions,
      summary: this.getClientPortfolioSummary(clientId)
    };
  }

  /**
   * Create a household (group of related clients)
   */
  static createHousehold(advisorId, householdData) {
    const {
      name,
      clientIds = [],
      notes = ''
    } = householdData;

    const household = {
      id: uuidv4(),
      advisorId,
      name,
      clientIds,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    Database.createHousehold(household);
    
    return household;
  }

  /**
   * Get household summary with aggregated portfolio data
   */
  static getHouseholdSummary(householdId, advisorId) {
    const household = Database.getHouseholdById(householdId);
    
    if (!household || household.advisorId !== advisorId) {
      return null;
    }
    
    let totalValue = 0;
    let totalCost = 0;
    let totalPortfolios = 0;
    const members = [];
    
    for (const clientId of household.clientIds) {
      const client = Database.getClientById(clientId);
      if (!client) continue;
      
      const summary = this.getClientPortfolioSummary(clientId);
      
      totalValue += summary.totalValue;
      totalCost += summary.totalCost;
      totalPortfolios += summary.portfolioCount;
      
      members.push({
        ...client,
        portfolioSummary: summary
      });
    }
    
    return {
      ...household,
      members,
      aggregateSummary: {
        totalValue,
        totalCost,
        totalGain: totalValue - totalCost,
        totalGainPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        portfolioCount: totalPortfolios,
        memberCount: members.length
      }
    };
  }

  /**
   * Get advisor dashboard summary
   */
  static getAdvisorDashboard(advisorId) {
    const clients = Database.getClientsByAdvisor(advisorId);
    const households = Database.getHouseholdsByAdvisor(advisorId);
    
    let totalAUM = 0;
    const totalClients = clients.length;
    let activeClients = 0;
    
    const clientSummaries = clients.map(client => {
      const summary = this.getClientPortfolioSummary(client.id);
      totalAUM += summary.totalValue;
      if (client.status === 'active') activeClients++;
      
      return {
        id: client.id,
        name: `${client.firstName} ${client.lastName}`,
        ...summary
      };
    });
    
    // Top clients by AUM
    const topClients = [...clientSummaries]
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);
    
    // Clients needing attention (negative performance, no activity, etc.)
    const needsAttention = clientSummaries.filter(c => 
      c.totalGainPct < -10 || c.portfolioCount === 0
    );
    
    // Recent activity across all clients
    const recentActivity = [];
    for (const client of clients.slice(0, 20)) {
      const transactions = Database.getTransactionsByClient(client.id, { limit: 5 });
      for (const tx of transactions) {
        recentActivity.push({
          ...tx,
          clientName: `${client.firstName} ${client.lastName}`
        });
      }
    }
    recentActivity.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
    
    return {
      summary: {
        totalAUM,
        totalClients,
        activeClients,
        householdCount: households.length
      },
      topClients,
      needsAttention,
      recentActivity: recentActivity.slice(0, 20),
      households: households.map(h => this.getHouseholdSummary(h.id, advisorId))
    };
  }

  /**
   * Generate client report
   */
  static generateClientReport(clientId, advisorId, options = {}) {
    const client = this.getClientDetails(clientId, advisorId);
    if (!client) return null;
    
    const {
      period = '1M',
      includePerformance = true,
      includeHoldings = true,
      includeTransactions = true
    } = options;
    
    const report = {
      generatedAt: new Date().toISOString(),
      period,
      client: {
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        riskTolerance: client.riskTolerance
      },
      summary: client.summary,
      portfolios: client.portfolios.map(p => ({
        name: p.name,
        totalValue: p.totalValue,
        totalGain: p.totalGain,
        totalGainPct: p.totalGainPct,
        holdings: includeHoldings ? p.holdings : undefined
      })),
      recentTransactions: includeTransactions ? client.recentTransactions : undefined
    };
    
    return report;
  }

  /**
   * Bulk operations for multiple clients
   */
  static bulkUpdateClients(advisorId, clientIds, updates) {
    const results = {
      success: [],
      failed: []
    };
    
    for (const clientId of clientIds) {
      try {
        const client = Database.getClientById(clientId);
        if (!client || client.advisorId !== advisorId) {
          results.failed.push({ clientId, reason: 'Not found or unauthorized' });
          continue;
        }
        
        Database.updateClient(clientId, {
          ...updates,
          updatedAt: new Date().toISOString()
        });
        
        results.success.push(clientId);
      } catch (err) {
        results.failed.push({ clientId, reason: err.message });
      }
    }
    
    return results;
  }

  /**
   * Search across all client data
   */
  static globalSearch(advisorId, query) {
    const term = query.toLowerCase();
    const results = {
      clients: [],
      portfolios: [],
      holdings: []
    };
    
    const clients = Database.getClientsByAdvisor(advisorId);
    
    for (const client of clients) {
      // Search clients
      if (
        client.firstName?.toLowerCase().includes(term) ||
        client.lastName?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term)
      ) {
        results.clients.push({
          id: client.id,
          name: `${client.firstName} ${client.lastName}`,
          email: client.email,
          type: 'client'
        });
      }
      
      // Search portfolios
      const portfolios = Database.getPortfoliosByClient(client.id);
      for (const portfolio of portfolios) {
        if (portfolio.name?.toLowerCase().includes(term)) {
          results.portfolios.push({
            id: portfolio.id,
            name: portfolio.name,
            clientName: `${client.firstName} ${client.lastName}`,
            type: 'portfolio'
          });
        }
        
        // Search holdings
        const holdings = Database.getHoldingsByPortfolio(portfolio.id);
        for (const holding of holdings) {
          if (holding.symbol?.toLowerCase().includes(term)) {
            results.holdings.push({
              id: holding.id,
              symbol: holding.symbol,
              portfolioName: portfolio.name,
              clientName: `${client.firstName} ${client.lastName}`,
              type: 'holding'
            });
          }
        }
      }
    }
    
    return results;
  }
}

module.exports = ClientService;
