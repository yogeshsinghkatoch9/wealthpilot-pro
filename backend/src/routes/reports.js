const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const pdfGenerator = require('../services/pdfGenerator');
const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');


/**
 * POST /api/reports/generate
 * Generate and download PDF report
 */
router.post('/generate', [
  authenticate,
  body('reportType').isIn(['portfolio', 'performance', 'tax', 'client']).withMessage('Invalid report type'),
  body('portfolioId').notEmpty().withMessage('Portfolio ID is required'),
  body('options').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reportType, portfolioId, options = {} } = req.body;
    const userId = req.user.id;

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    logger.info(`Generating ${reportType} report for portfolio ${portfolioId}`);

    let pdfBuffer;

    // Generate appropriate report type
    switch (reportType) {
      case 'portfolio':
        pdfBuffer = await pdfGenerator.generatePortfolioReport(userId, portfolioId, options);
        break;

      case 'performance':
        pdfBuffer = await pdfGenerator.generatePerformanceReport(
          userId,
          portfolioId,
          options.period || '1Y'
        );
        break;

      case 'tax':
        pdfBuffer = await pdfGenerator.generateTaxReport(
          userId,
          portfolioId,
          options.year || new Date().getFullYear()
        );
        break;

      case 'client':
        pdfBuffer = await pdfGenerator.generateClientReport(userId, portfolioId, options);
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Set response headers for PDF download
    const portfolioName = portfolio.name.replace(/\s+/g, '-');
    const timestamp = Date.now();
    const filename = `${reportType}-report-${portfolioName}-${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

    logger.info(`Report generated successfully: ${reportType} for portfolio ${portfolioId}`);

  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

/**
 * GET /api/reports/templates
 * Get available report templates
 */
router.get('/templates', authenticate, (req, res) => {
  try {
    const templates = [
      {
        id: 'portfolio',
        name: 'Portfolio Overview',
        description: 'Comprehensive portfolio summary with holdings, allocation, and performance metrics',
        icon: '📊',
        options: [
          { name: 'includeCharts', type: 'boolean', default: true, label: 'Include charts' },
          { name: 'includeTransactions', type: 'boolean', default: false, label: 'Include transaction history' }
        ]
      },
      {
        id: 'performance',
        name: 'Performance Report',
        description: 'Detailed performance analysis with returns, benchmarks, and attribution',
        icon: '📈',
        options: [
          { name: 'period', type: 'select', options: ['1M', '3M', '6M', '1Y', 'YTD', 'ALL'], default: '1Y', label: 'Time period' },
          { name: 'benchmark', type: 'select', options: ['SPY', 'QQQ', 'DIA'], default: 'SPY', label: 'Benchmark' }
        ]
      },
      {
        id: 'tax',
        name: 'Tax Report',
        description: 'Tax optimization analysis with capital gains, losses, and harvesting opportunities',
        icon: '💰',
        options: [
          { name: 'year', type: 'number', default: new Date().getFullYear(), label: 'Tax year' },
          { name: 'includeRecommendations', type: 'boolean', default: true, label: 'Include tax-loss harvesting recommendations' }
        ]
      },
      {
        id: 'client',
        name: 'Client Report',
        description: 'Professional client-facing report with executive summary and insights',
        icon: '👔',
        options: [
          { name: 'clientName', type: 'text', default: '', label: 'Client name' },
          { name: 'includeDisclosures', type: 'boolean', default: true, label: 'Include legal disclosures' }
        ]
      }
    ];

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    logger.error('Error getting report templates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/reports/preview
 * Get preview data for a report (without generating PDF)
 */
router.get('/preview', authenticate, async (req, res) => {
  try {
    const { reportType, portfolioId } = req.query;
    const userId = req.user.id;

    if (!reportType || !portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'reportType and portfolioId are required'
      });
    }

    // Verify portfolio ownership
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId },
      include: {
        holdings: {
          include: {
            stock: true
          }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    // Calculate basic metrics for preview
    const totalValue = portfolio.holdings.reduce((sum, h) =>
      sum + (h.quantity * (h.stock?.currentPrice || h.purchasePrice)), 0
    );

    const totalCost = portfolio.holdings.reduce((sum, h) =>
      sum + (h.quantity * h.purchasePrice), 0
    );

    const totalGainLoss = totalValue - totalCost;
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    const preview = {
      reportType,
      portfolio: {
        name: portfolio.name,
        description: portfolio.description,
        holdings: portfolio.holdings.length,
        totalValue,
        totalCost,
        totalGainLoss,
        totalGainLossPct
      },
      generatedAt: new Date().toISOString(),
      estimatedPages: reportType === 'client' ? 8 : reportType === 'performance' ? 6 : 4
    };

    res.json({
      success: true,
      preview
    });

  } catch (error) {
    logger.error('Error generating report preview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
