/**
 * AI Reports Routes
 * Endpoints for generating and managing AI-powered portfolio reports
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const aiReportService = require('../services/aiReportService');
const unifiedAI = require('../services/unifiedAIService');

/**
 * Generate a new portfolio report
 * POST /api/ai-reports/generate
 */
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { portfolioId, reportType, sections, includeCharts } = req.body;
    const userId = req.user.id;

    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    console.log(`[AIReports] Generating report for portfolio ${portfolioId}`);

    const result = await aiReportService.generateReport(userId, portfolioId, {
      reportType: reportType || 'comprehensive',
      includeCharts: includeCharts !== false,
      sections
    });

    res.json({
      success: true,
      message: 'Report generated successfully',
      ...result
    });

  } catch (error) {
    console.error('[AIReports] Generate error:', error.message);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

/**
 * Download a report PDF
 * GET /api/ai-reports/:id/download
 */
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const report = await aiReportService.getReport(id);

    if (!report) {
      // Try to find the most recent PDF file as fallback
      const reportsDir = path.join(__dirname, '../../reports');
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir)
          .filter(f => f.endsWith('.pdf'))
          .sort((a, b) => {
            const statA = fs.statSync(path.join(reportsDir, a));
            const statB = fs.statSync(path.join(reportsDir, b));
            return statB.mtime - statA.mtime;
          });

        if (files.length > 0) {
          const filePath = path.join(reportsDir, files[0]);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
          return fs.createReadStream(filePath).pipe(res);
        }
      }
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check ownership if userId is set on report
    if (report.userId && report.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!report.filePath || !fs.existsSync(report.filePath)) {
      return res.status(404).json({ error: 'Report file not found' });
    }

    const fileName = path.basename(report.filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(report.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('[AIReports] Download error:', error.message);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

/**
 * Get report history
 * GET /api/ai-reports/history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const reports = await aiReportService.getReportHistory(userId, limit);

    res.json({
      success: true,
      reports: reports.map(r => ({
        id: r.id,
        portfolioId: r.portfolioId,
        reportType: r.reportType,
        status: r.status,
        createdAt: r.createdAt,
        downloadUrl: `/api/ai-reports/${r.id}/download`
      }))
    });

  } catch (error) {
    console.error('[AIReports] History error:', error.message);
    res.status(500).json({ error: 'Failed to get report history' });
  }
});

/**
 * Delete a report
 * DELETE /api/ai-reports/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await aiReportService.deleteReport(userId, id);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('[AIReports] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

/**
 * Get quick AI analysis for a portfolio
 * GET /api/ai-reports/quick-analysis/:portfolioId
 */
router.get('/quick-analysis/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.user.id;

    const portfolioData = await aiReportService.getPortfolioData(userId, portfolioId);

    if (!portfolioData) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const analysis = await unifiedAI.analyzePortfolio(portfolioData, 'quick');

    res.json({
      success: true,
      analysis: analysis.content,
      provider: analysis.provider,
      usage: analysis.usage
    });

  } catch (error) {
    console.error('[AIReports] Quick analysis error:', error.message);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

/**
 * Get AI status
 * GET /api/ai-reports/status
 */
router.get('/status', authenticate, async (req, res) => {
  const status = unifiedAI.getStatus();
  res.json({
    success: true,
    status
  });
});

/**
 * Generate specific insight
 * POST /api/ai-reports/insight
 */
router.post('/insight', authenticate, async (req, res) => {
  try {
    const { topic, data } = req.body;
    const userId = req.user.id;

    if (!topic || !data) {
      return res.status(400).json({ error: 'Topic and data are required' });
    }

    const insight = await unifiedAI.generateInsight(topic, data);

    res.json({
      success: true,
      insight: insight.content,
      provider: insight.provider,
      usage: insight.usage
    });

  } catch (error) {
    console.error('[AIReports] Insight error:', error.message);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

module.exports = router;
