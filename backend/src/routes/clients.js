/**
 * WealthPilot Pro - Client Management Routes
 * Multi-client/household management for RIAs
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const ClientService = require('../services/client');
const { auditService } = require('../services/audit');

// Middleware to check advisor role
const requireAdvisor = (req, res, next) => {
  if (!req.user || req.user.role !== 'advisor') {
    return res.status(403).json({ error: 'Advisor access required' });
  }
  next();
};

/**
 * GET /api/clients
 * List all clients for the advisor
 */
router.get('/', requireAdvisor, (req, res) => {
  try {
    const { search, sortBy, sortOrder, limit, offset } = req.query;
    
    const clients = ClientService.getClients(req.user.id, {
      search,
      sortBy,
      sortOrder,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json(clients);
  } catch (err) {
    logger.error('Get clients error:', err);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

/**
 * GET /api/clients/dashboard
 * Get advisor dashboard summary
 */
router.get('/dashboard', requireAdvisor, (req, res) => {
  try {
    const dashboard = ClientService.getAdvisorDashboard(req.user.id);
    res.json(dashboard);
  } catch (err) {
    logger.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * GET /api/clients/search
 * Global search across all client data
 */
router.get('/search', requireAdvisor, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ clients: [], portfolios: [], holdings: [] });
    }

    const results = ClientService.globalSearch(req.user.id, q);
    res.json(results);
  } catch (err) {
    logger.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/clients/reviews
 * Get clients with upcoming reviews
 */
router.get('/reviews', requireAdvisor, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const clients = ClientService.getUpcomingReviews(req.user.id, days);
    res.json(clients);
  } catch (err) {
    logger.error('Reviews error:', err);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
});

/**
 * GET /api/clients/:id
 * Get single client with full details
 */
router.get('/:id', requireAdvisor, (req, res) => {
  try {
    const client = ClientService.getClient(req.params.id, req.user.id);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (err) {
    logger.error('Get client error:', err);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

/**
 * POST /api/clients
 * Create new client
 */
router.post('/', requireAdvisor, (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const client = ClientService.createClient(req.user.id, req.body);
    
    auditService.log({
      category: 'client',
      action: 'create',
      userId: req.user.id,
      details: { clientId: client.id, name }
    });

    res.status(201).json(client);
  } catch (err) {
    logger.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

/**
 * PUT /api/clients/:id
 * Update client
 */
router.put('/:id', requireAdvisor, (req, res) => {
  try {
    const success = ClientService.updateClient(req.params.id, req.user.id, req.body);
    
    if (!success) {
      return res.status(404).json({ error: 'Client not found or no changes made' });
    }

    auditService.log({
      category: 'client',
      action: 'update',
      userId: req.user.id,
      details: { clientId: req.params.id, updates: Object.keys(req.body) }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Update client error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

/**
 * DELETE /api/clients/:id
 * Delete client (soft delete)
 */
router.delete('/:id', requireAdvisor, (req, res) => {
  try {
    ClientService.deleteClient(req.params.id, req.user.id);
    
    auditService.log({
      category: 'client',
      action: 'delete',
      userId: req.user.id,
      details: { clientId: req.params.id }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Delete client error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

/**
 * POST /api/clients/:id/household
 * Add household member
 */
router.post('/:id/household', requireAdvisor, (req, res) => {
  try {
    // Verify client belongs to advisor
    const client = ClientService.getClient(req.params.id, req.user.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const member = ClientService.addHouseholdMember(req.params.id, req.body);
    res.status(201).json(member);
  } catch (err) {
    logger.error('Add household member error:', err);
    res.status(500).json({ error: 'Failed to add household member' });
  }
});

/**
 * POST /api/clients/:id/notes
 * Add client note
 */
router.post('/:id/notes', requireAdvisor, (req, res) => {
  try {
    const { content, type } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Verify client belongs to advisor
    const client = ClientService.getClient(req.params.id, req.user.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const note = ClientService.addNote(req.params.id, req.user.id, content, type);
    res.status(201).json(note);
  } catch (err) {
    logger.error('Add note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * GET /api/clients/:id/export
 * Export client data
 */
router.get('/:id/export', requireAdvisor, (req, res) => {
  try {
    const data = ClientService.exportClientData(req.params.id, req.user.id);
    
    auditService.log({
      category: 'data',
      action: 'export',
      userId: req.user.id,
      details: { clientId: req.params.id, type: 'client_data' }
    });

    res.json(data);
  } catch (err) {
    logger.error('Export client error:', err);
    res.status(500).json({ error: err.message || 'Failed to export client data' });
  }
});

/**
 * GET /api/clients/:id/report
 * Generate client report
 */
router.get('/:id/report', requireAdvisor, (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;
    
    const report = ClientService.generateClientReport(req.params.id, req.user.id, {
      startDate,
      endDate
    });

    auditService.log({
      category: 'report',
      action: 'generate',
      userId: req.user.id,
      details: { clientId: req.params.id, type: 'client_report' }
    });

    res.json(report);
  } catch (err) {
    logger.error('Generate report error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate report' });
  }
});

/**
 * POST /api/clients/bulk
 * Bulk update clients
 */
router.post('/bulk', requireAdvisor, (req, res) => {
  try {
    const { clientIds, updates } = req.body;
    
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({ error: 'Client IDs required' });
    }

    const results = ClientService.bulkUpdateClients(req.user.id, clientIds, updates);
    
    auditService.log({
      category: 'client',
      action: 'bulk_update',
      userId: req.user.id,
      details: { count: clientIds.length, updates: Object.keys(updates) }
    });

    res.json({ results });
  } catch (err) {
    logger.error('Bulk update error:', err);
    res.status(500).json({ error: 'Failed to perform bulk update' });
  }
});

module.exports = router;
