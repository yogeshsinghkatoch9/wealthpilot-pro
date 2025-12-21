/**
 * WealthPilot Pro - Extended API Routes
 * Import, Reports, Onboarding, Audit
 */

const express = require('express');
const multer = require('multer');
const ImportService = require('../services/import');
const ReportService = require('../services/report');
const OnboardingService = require('../services/onboarding');
const { auditService } = require('../services/audit');
const Database = require('../db/database');

const logger = require('../utils/logger');
const router = express.Router();

// File upload config
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Auth middleware
const authenticate = (req, res, next) => {
  // Simplified - use actual auth middleware in production
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-only-insecure-key' : null);
    if (!jwtSecret) throw new Error('JWT_SECRET required in production');
    const decoded = jwt.verify(token, jwtSecret);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== IMPORT ROUTES ====================

/**
 * POST /api/import/analyze
 * Analyze CSV content before import
 */
router.post('/import/analyze', authenticate, upload.single('file'), (req, res) => {
  try {
    let content;
    
    if (req.file) {
      content = req.file.buffer.toString('utf-8');
    } else if (req.body.content) {
      content = req.body.content;
    } else {
      return res.status(400).json({ error: 'No file or content provided' });
    }

    const analysis = OnboardingService.analyzeImport(content);
    res.json(analysis);
  } catch (err) {
    logger.error('Import analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze import' });
  }
});

/**
 * POST /api/import/transactions
 * Import transactions from CSV
 */
router.post('/import/transactions', authenticate, upload.single('file'), (req, res) => {
  try {
    let content;
    
    if (req.file) {
      content = req.file.buffer.toString('utf-8');
    } else if (req.body.content) {
      content = req.body.content;
    } else {
      return res.status(400).json({ error: 'No file or content provided' });
    }

    const portfolioId = req.body.portfolioId;
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const result = ImportService.processCSVImport(content);

    if (!result.success && result.errors.length > 0) {
      return res.status(400).json({
        error: 'Import validation failed',
        ...result
      });
    }

    // Save valid transactions
    let importedCount = 0;
    const importErrors = [];

    for (const tx of result.transactions) {
      try {
        Database.createTransaction({
          userId: req.user.id,
          portfolioId,
          symbol: tx.symbol,
          type: tx.type,
          shares: tx.shares,
          price: tx.price,
          amount: tx.amount,
          fees: tx.fees,
          executedAt: tx.date,
          notes: tx.notes
        });
        importedCount++;
      } catch (err) {
        importErrors.push(`Row ${tx.rowIndex}: ${err.message}`);
      }
    }

    // Audit log
    auditService.logDataImport(req.user.id, 'transactions', importedCount);

    res.json({
      success: true,
      imported: importedCount,
      total: result.transactions.length,
      errors: importErrors,
      warnings: result.warnings
    });
  } catch (err) {
    logger.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

/**
 * POST /api/import/holdings
 * Import holdings from CSV
 */
router.post('/import/holdings', authenticate, upload.single('file'), (req, res) => {
  try {
    let content;
    
    if (req.file) {
      content = req.file.buffer.toString('utf-8');
    } else if (req.body.content) {
      content = req.body.content;
    } else {
      return res.status(400).json({ error: 'No file or content provided' });
    }

    const portfolioId = req.body.portfolioId;
    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID required' });
    }

    const result = ImportService.processHoldingsImport(content);

    if (!result.success) {
      return res.status(400).json({
        error: 'Import validation failed',
        ...result
      });
    }

    // Save valid holdings
    let importedCount = 0;

    for (const holding of result.holdings) {
      try {
        Database.addHolding({
          portfolioId,
          symbol: holding.symbol,
          shares: holding.shares,
          costBasis: holding.costBasis,
          sector: holding.sector
        });
        importedCount++;
      } catch (err) {
        // Skip duplicates
      }
    }

    auditService.logDataImport(req.user.id, 'holdings', importedCount);

    res.json({
      success: true,
      imported: importedCount,
      total: result.holdings.length
    });
  } catch (err) {
    logger.error('Holdings import error:', err);
    res.status(500).json({ error: 'Failed to import holdings' });
  }
});

/**
 * GET /api/import/template
 * Download CSV template
 */
router.get('/import/template', (req, res) => {
  const template = ImportService.generateTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=wealthpilot-template.csv');
  res.send(template);
});

// ==================== REPORT ROUTES ====================

/**
 * GET /api/reports/portfolio/:id
 * Generate portfolio report
 */
router.get('/reports/portfolio/:id', authenticate, async (req, res) => {
  try {
    const portfolio = Database.getPortfolioById(req.params.id);
    if (!portfolio || portfolio.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const holdings = Database.getHoldingsByPortfolio(req.params.id);
    const transactions = Database.getTransactionsByPortfolio(req.params.id);

    // Enrich holdings with market data
    const enrichedHoldings = holdings.map(h => {
      const quote = Database.getQuote(h.symbol);
      const price = quote ? Number(quote.price) : Number(h.cost_basis);
      const shares = Number(h.shares);
      const costBasis = Number(h.cost_basis);
      const marketValue = shares * price;
      const totalCost = shares * costBasis;

      return {
        symbol: h.symbol,
        name: quote?.name || h.symbol,
        shares,
        price,
        costBasis,
        marketValue,
        gain: marketValue - totalCost,
        gainPct: ((price - costBasis) / costBasis) * 100,
        weight: 0 // Will calculate
      };
    });

    // Calculate totals and weights
    const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0) + Number(portfolio.cash_balance);
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + (h.shares * h.costBasis), 0);
    
    enrichedHoldings.forEach(h => {
      h.weight = (h.marketValue / totalValue) * 100;
    });

    const reportData = {
      portfolio: {
        ...portfolio,
        name: portfolio.name,
        totalValue,
        totalCost,
        totalGain: totalValue - totalCost,
        totalGainPct: ((totalValue - totalCost) / totalCost) * 100,
        annualDividends: 0 // Calculate if needed
      },
      holdings: enrichedHoldings,
      allocation: {
        bySector: [] // Calculate sector allocation
      },
      performance: null,
      transactions: transactions.slice(0, 20)
    };

    const html = ReportService.generatePortfolioReportHTML(reportData);
    
    // Audit log
    auditService.logReportGenerated(req.user.id, 'portfolio', req.params.id);

    // Return as HTML or save to file
    if (req.query.format === 'file') {
      const filename = `portfolio-report-${Date.now()}.html`;
      const filepath = ReportService.saveHTMLReport(html, filename);
      res.json({ success: true, file: `/reports/${filename}` });
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    }
  } catch (err) {
    logger.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /api/reports/tax
 * Generate tax report
 */
router.get('/reports/tax', authenticate, (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    
    // Get all holdings with tax lots
    const holdings = Database.getHoldingsByUser(req.user.id);
    
    const taxLots = [];
    const summary = {
      longTermGains: 0,
      shortTermGains: 0,
      longTermLosses: 0,
      shortTermLosses: 0,
      netGain: 0,
      estimatedTax: 0
    };

    // Calculate tax implications for each lot
    for (const holding of holdings) {
      const quote = Database.getQuote(holding.symbol);
      const currentPrice = quote ? Number(quote.price) : Number(holding.cost_basis);
      
      const lot = {
        symbol: holding.symbol,
        purchaseDate: holding.created_at,
        shares: Number(holding.shares),
        costBasis: Number(holding.cost_basis),
        totalCost: Number(holding.shares) * Number(holding.cost_basis),
        currentPrice,
        marketValue: Number(holding.shares) * currentPrice,
        gain: (Number(holding.shares) * currentPrice) - (Number(holding.shares) * Number(holding.cost_basis)),
        isLongTerm: (Date.now() - new Date(holding.created_at).getTime()) > 365 * 24 * 60 * 60 * 1000
      };
      
      lot.proceeds = lot.marketValue;
      
      if (lot.gain >= 0) {
        if (lot.isLongTerm) {
          summary.longTermGains += lot.gain;
        } else {
          summary.shortTermGains += lot.gain;
        }
      } else {
        if (lot.isLongTerm) {
          summary.longTermLosses += Math.abs(lot.gain);
        } else {
          summary.shortTermLosses += Math.abs(lot.gain);
        }
      }
      
      taxLots.push(lot);
    }

    summary.netGain = summary.longTermGains + summary.shortTermGains - summary.longTermLosses - summary.shortTermLosses;
    summary.estimatedTax = (summary.longTermGains * 0.15) + (summary.shortTermGains * 0.32);

    const html = ReportService.generateTaxReportHTML({
      taxLots,
      summary,
      year
    });

    auditService.logReportGenerated(req.user.id, 'tax', null);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    logger.error('Tax report error:', err);
    res.status(500).json({ error: 'Failed to generate tax report' });
  }
});

// ==================== ONBOARDING ROUTES ====================

/**
 * GET /api/onboarding/progress
 * Get user's onboarding progress
 */
router.get('/onboarding/progress', authenticate, (req, res) => {
  try {
    const progress = OnboardingService.getProgress(req.user.id);
    res.json(progress);
  } catch (err) {
    logger.error('Onboarding progress error:', err);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

/**
 * GET /api/onboarding/templates
 * Get portfolio templates
 */
router.get('/onboarding/templates', (req, res) => {
  const templates = OnboardingService.getPortfolioTemplates();
  res.json(templates);
});

/**
 * POST /api/onboarding/create-from-template
 * Create portfolio from template
 */
router.post('/onboarding/create-from-template', authenticate, (req, res) => {
  try {
    const { templateId, portfolioValue, name } = req.body;

    if (!templateId || !portfolioValue) {
      return res.status(400).json({ error: 'Template ID and value required' });
    }

    const result = OnboardingService.createFromTemplate(
      req.user.id,
      templateId,
      Number(portfolioValue),
      name
    );

    res.json(result);
  } catch (err) {
    logger.error('Template creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/onboarding/checklist
 * Get personalized checklist
 */
router.get('/onboarding/checklist', authenticate, (req, res) => {
  try {
    const goals = req.query.goals ? req.query.goals.split(',') : [];
    const checklist = OnboardingService.getPersonalizedChecklist(req.user.id, goals);
    res.json(checklist);
  } catch (err) {
    logger.error('Checklist error:', err);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

/**
 * GET /api/onboarding/recommendations
 * Get recommended pages
 */
router.get('/onboarding/recommendations', authenticate, (req, res) => {
  try {
    const recommendations = OnboardingService.getRecommendedPages(req.user.id);
    res.json(recommendations);
  } catch (err) {
    logger.error('Recommendations error:', err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// ==================== AUDIT ROUTES ====================

/**
 * GET /api/audit/activity
 * Get user's activity log
 */
router.get('/audit/activity', authenticate, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const activity = auditService.getUserActivity(req.user.id, days);
    res.json(activity);
  } catch (err) {
    logger.error('Audit activity error:', err);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

/**
 * GET /api/audit/logs
 * Query audit logs (admin only in production)
 */
router.get('/audit/logs', authenticate, (req, res) => {
  try {
    const { category, action, startDate, endDate, limit } = req.query;
    
    const logs = auditService.query({
      userId: req.user.id, // Only own logs
      category,
      action,
      startDate,
      endDate,
      limit: parseInt(limit) || 100
    });

    res.json(logs);
  } catch (err) {
    logger.error('Audit query error:', err);
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

module.exports = router;
