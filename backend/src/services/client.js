/**
 * WealthPilot Pro - Multi-Client Management
 * Client/household management for RIAs and wealth advisors
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available for client service, using mock data');
  Database = {
    query: () => [],
    queryOne: () => null,
    run: () => ({})
  };
}

class ClientService {
  
  /**
   * Get all clients for an advisor
   */
  static getClients(advisorId, options = {}) {
    const { search, sortBy = 'name', sortOrder = 'asc', limit = 50, offset = 0 } = options;
    
    const clients = Database.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM portfolios WHERE client_id = c.id AND deleted_at IS NULL) as portfolio_count,
        (SELECT COALESCE(SUM(p.total_value), 0) FROM portfolios p WHERE p.client_id = c.id AND p.deleted_at IS NULL) as total_aum
      FROM clients c
      WHERE c.advisor_id = ? AND c.deleted_at IS NULL
      ${search ? 'AND (c.name LIKE ? OR c.email LIKE ?)' : ''}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `, search ? [advisorId, `%${search}%`, `%${search}%`, limit, offset] : [advisorId, limit, offset]);

    return clients;
  }

  /**
   * Get single client with full details
   */
  static getClient(clientId, advisorId) {
    const client = Database.queryOne(`
      SELECT * FROM clients WHERE id = ? AND advisor_id = ? AND deleted_at IS NULL
    `, [clientId, advisorId]);

    if (!client) return null;

    // Get portfolios
    client.portfolios = Database.query(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM holdings WHERE portfolio_id = p.id AND deleted_at IS NULL) as holdings_count
      FROM portfolios p 
      WHERE p.client_id = ? AND p.deleted_at IS NULL
      ORDER BY p.is_default DESC, p.name ASC
    `, [clientId]);

    // Get household members
    client.householdMembers = Database.query(`
      SELECT * FROM household_members WHERE client_id = ? AND deleted_at IS NULL
    `, [clientId]);

    // Get notes
    client.notes = Database.query(`
      SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 10
    `, [clientId]);

    // Get recent activity
    client.recentActivity = Database.query(`
      SELECT al.* FROM audit_log al
      JOIN portfolios p ON al.portfolio_id = p.id
      WHERE p.client_id = ?
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [clientId]);

    return client;
  }

  /**
   * Create new client
   */
  static createClient(advisorId, data) {
    const {
      name,
      email,
      phone,
      address,
      dateOfBirth,
      ssn, // Should be encrypted in production
      riskTolerance = 'moderate',
      investmentObjective = 'growth',
      timeHorizon = 'medium',
      annualIncome,
      netWorth,
      liquidNetWorth,
      taxBracket,
      employmentStatus,
      employer,
      notes,
      tags = []
    } = data;

    const id = uuidv4();
    
    Database.run(`
      INSERT INTO clients (
        id, advisor_id, name, email, phone, address, date_of_birth,
        ssn_encrypted, risk_tolerance, investment_objective, time_horizon,
        annual_income, net_worth, liquid_net_worth, tax_bracket,
        employment_status, employer, notes, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      id, advisorId, name, email, phone, address, dateOfBirth,
      ssn, // Should encrypt
      riskTolerance, investmentObjective, timeHorizon,
      annualIncome, netWorth, liquidNetWorth, taxBracket,
      employmentStatus, employer, notes, JSON.stringify(tags)
    ]);

    return { id, name, email };
  }

  /**
   * Update client
   */
  static updateClient(clientId, advisorId, updates) {
    const allowedFields = [
      'name', 'email', 'phone', 'address', 'date_of_birth',
      'risk_tolerance', 'investment_objective', 'time_horizon',
      'annual_income', 'net_worth', 'liquid_net_worth', 'tax_bracket',
      'employment_status', 'employer', 'notes', 'tags', 'status'
    ];

    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
      if (allowedFields.includes(dbKey)) {
        setClauses.push(`${dbKey} = ?`);
        values.push(key === 'tags' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length === 0) return false;

    setClauses.push('updated_at = datetime("now")');
    values.push(clientId, advisorId);

    Database.run(`
      UPDATE clients SET ${setClauses.join(', ')}
      WHERE id = ? AND advisor_id = ? AND deleted_at IS NULL
    `, values);

    return true;
  }

  /**
   * Delete client (soft delete)
   */
  static deleteClient(clientId, advisorId) {
    Database.run(`
      UPDATE clients SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND advisor_id = ?
    `, [clientId, advisorId]);

    // Soft delete all portfolios
    Database.run(`
      UPDATE portfolios SET deleted_at = datetime('now')
      WHERE client_id = ?
    `, [clientId]);

    return true;
  }

  /**
   * Add household member
   */
  static addHouseholdMember(clientId, member) {
    const id = uuidv4();
    
    Database.run(`
      INSERT INTO household_members (id, client_id, name, relationship, date_of_birth, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [id, clientId, member.name, member.relationship, member.dateOfBirth, member.email, member.phone]);

    return { id, ...member };
  }

  /**
   * Add client note
   */
  static addNote(clientId, advisorId, content, type = 'general') {
    const id = uuidv4();
    
    Database.run(`
      INSERT INTO client_notes (id, client_id, advisor_id, content, type, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [id, clientId, advisorId, content, type]);

    return { id, content, type, createdAt: new Date() };
  }

  /**
   * Get dashboard summary for advisor
   */
  static getAdvisorDashboard(advisorId) {
    const summary = Database.queryOne(`
      SELECT 
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT CASE WHEN c.created_at > date('now', '-30 days') THEN c.id END) as new_clients_30d,
        (SELECT COUNT(*) FROM portfolios p 
          JOIN clients c2 ON p.client_id = c2.id 
          WHERE c2.advisor_id = ? AND p.deleted_at IS NULL) as total_portfolios,
        (SELECT COALESCE(SUM(p.total_value), 0) FROM portfolios p 
          JOIN clients c2 ON p.client_id = c2.id 
          WHERE c2.advisor_id = ? AND p.deleted_at IS NULL) as total_aum
      FROM clients c
      WHERE c.advisor_id = ? AND c.deleted_at IS NULL
    `, [advisorId, advisorId, advisorId]);

    // Top clients by AUM
    const topClients = Database.query(`
      SELECT c.id, c.name, 
        SUM(p.total_value) as aum,
        COUNT(p.id) as portfolios
      FROM clients c
      LEFT JOIN portfolios p ON c.id = p.client_id AND p.deleted_at IS NULL
      WHERE c.advisor_id = ? AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY aum DESC
      LIMIT 10
    `, [advisorId]);

    // Recent activity
    const recentActivity = Database.query(`
      SELECT al.*, c.name as client_name, p.name as portfolio_name
      FROM audit_log al
      JOIN portfolios p ON al.portfolio_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE c.advisor_id = ?
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [advisorId]);

    // Alerts across all clients
    const activeAlerts = Database.query(`
      SELECT a.*, c.name as client_name
      FROM alerts a
      JOIN portfolios p ON a.portfolio_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE c.advisor_id = ? AND a.is_active = 1 AND a.triggered_at IS NOT NULL
      ORDER BY a.triggered_at DESC
      LIMIT 10
    `, [advisorId]);

    // Risk distribution
    const riskDistribution = Database.query(`
      SELECT risk_tolerance, COUNT(*) as count
      FROM clients
      WHERE advisor_id = ? AND deleted_at IS NULL
      GROUP BY risk_tolerance
    `, [advisorId]);

    return {
      summary,
      topClients,
      recentActivity,
      activeAlerts,
      riskDistribution
    };
  }

  /**
   * Bulk operations
   */
  static bulkUpdateClients(advisorId, clientIds, updates) {
    const results = [];
    
    for (const clientId of clientIds) {
      try {
        this.updateClient(clientId, advisorId, updates);
        results.push({ clientId, success: true });
      } catch (err) {
        results.push({ clientId, success: false, error: err.message });
      }
    }

    return results;
  }

  /**
   * Export client data
   */
  static exportClientData(clientId, advisorId) {
    const client = this.getClient(clientId, advisorId);
    if (!client) throw new Error('Client not found');

    // Get all holdings
    const holdings = [];
    for (const portfolio of client.portfolios) {
      const portfolioHoldings = Database.query(`
        SELECT h.*, p.name as portfolio_name
        FROM holdings h
        JOIN portfolios p ON h.portfolio_id = p.id
        WHERE h.portfolio_id = ? AND h.deleted_at IS NULL
      `, [portfolio.id]);
      holdings.push(...portfolioHoldings);
    }

    // Get all transactions
    const transactions = Database.query(`
      SELECT t.*, p.name as portfolio_name
      FROM transactions t
      JOIN portfolios p ON t.portfolio_id = p.id
      WHERE p.client_id = ?
      ORDER BY t.executed_at DESC
    `, [clientId]);

    return {
      client: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        riskTolerance: client.risk_tolerance,
        investmentObjective: client.investment_objective
      },
      portfolios: client.portfolios,
      holdings,
      transactions,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Search across all client data
   */
  static globalSearch(advisorId, query) {
    const results = {
      clients: [],
      portfolios: [],
      holdings: []
    };

    const searchTerm = `%${query}%`;

    // Search clients
    results.clients = Database.query(`
      SELECT id, name, email FROM clients
      WHERE advisor_id = ? AND deleted_at IS NULL
      AND (name LIKE ? OR email LIKE ?)
      LIMIT 10
    `, [advisorId, searchTerm, searchTerm]);

    // Search portfolios
    results.portfolios = Database.query(`
      SELECT p.id, p.name, c.name as client_name, c.id as client_id
      FROM portfolios p
      JOIN clients c ON p.client_id = c.id
      WHERE c.advisor_id = ? AND p.deleted_at IS NULL
      AND p.name LIKE ?
      LIMIT 10
    `, [advisorId, searchTerm]);

    // Search holdings by symbol
    results.holdings = Database.query(`
      SELECT h.symbol, p.name as portfolio_name, c.name as client_name, 
        h.shares, h.cost_basis, c.id as client_id, p.id as portfolio_id
      FROM holdings h
      JOIN portfolios p ON h.portfolio_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE c.advisor_id = ? AND h.deleted_at IS NULL
      AND h.symbol LIKE ?
      LIMIT 20
    `, [advisorId, searchTerm.toUpperCase()]);

    return results;
  }

  /**
   * Get clients with upcoming reviews
   */
  static getUpcomingReviews(advisorId, days = 30) {
    return Database.query(`
      SELECT c.*, 
        (SELECT MAX(created_at) FROM client_notes WHERE client_id = c.id AND type = 'review') as last_review
      FROM clients c
      WHERE c.advisor_id = ? AND c.deleted_at IS NULL
      AND (
        c.next_review_date <= date('now', '+' || ? || ' days')
        OR c.next_review_date IS NULL
      )
      ORDER BY c.next_review_date ASC
    `, [advisorId, days]);
  }

  /**
   * Generate client report
   */
  static generateClientReport(clientId, advisorId, options = {}) {
    const client = this.getClient(clientId, advisorId);
    if (!client) throw new Error('Client not found');

    const { startDate, endDate } = options;
    
    // Get performance data for each portfolio
    const portfolioPerformance = [];
    for (const portfolio of client.portfolios) {
      // This would call the analytics service
      portfolioPerformance.push({
        portfolio_id: portfolio.id,
        name: portfolio.name,
        totalValue: portfolio.total_value
        // Add more metrics
      });
    }

    // Get transaction summary
    const transactionSummary = Database.queryOne(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN type = 'buy' THEN amount ELSE 0 END) as total_bought,
        SUM(CASE WHEN type = 'sell' THEN amount ELSE 0 END) as total_sold,
        SUM(CASE WHEN type = 'dividend' THEN amount ELSE 0 END) as total_dividends
      FROM transactions t
      JOIN portfolios p ON t.portfolio_id = p.id
      WHERE p.client_id = ?
      ${startDate ? 'AND t.executed_at >= ?' : ''}
      ${endDate ? 'AND t.executed_at <= ?' : ''}
    `, [clientId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]);

    return {
      client: {
        name: client.name,
        riskTolerance: client.risk_tolerance,
        investmentObjective: client.investment_objective
      },
      portfolios: portfolioPerformance,
      transactions: transactionSummary,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = ClientService;
