const express = require('express');
const { authenticate } = require('../middleware/authSimple');
const DashboardService = require('../services/dashboardService');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/dashboard/preferences
 * Get user's active dashboard preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = DashboardService.getActivePreferences(userId);

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Error getting preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard preferences'
    });
  }
});

/**
 * GET /api/dashboard/views
 * Get all saved views for user
 */
router.get('/views', async (req, res) => {
  try {
    const userId = req.user.id;
    const views = DashboardService.getAllViews(userId);

    res.json({
      success: true,
      data: views
    });
  } catch (error) {
    logger.error('Error getting views:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard views'
    });
  }
});

/**
 * GET /api/dashboard/views/:viewName
 * Get specific view by name
 */
router.get('/views/:viewName', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;

    const view = DashboardService.getView(userId, viewName);

    if (!view) {
      return res.status(404).json({
        success: false,
        error: `View '${viewName}' not found`
      });
    }

    res.json({
      success: true,
      data: view
    });
  } catch (error) {
    logger.error('Error getting view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard view'
    });
  }
});

/**
 * POST /api/dashboard/preferences
 * Save or update preferences for active view
 */
router.post('/preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName = 'default', preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({
        success: false,
        error: 'Preferences object is required'
      });
    }

    const saved = DashboardService.savePreferences(userId, viewName, preferences);

    res.json({
      success: true,
      message: 'Preferences saved successfully',
      data: saved
    });
  } catch (error) {
    logger.error('Error saving preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save dashboard preferences'
    });
  }
});

/**
 * POST /api/dashboard/views
 * Create a new view
 */
router.post('/views', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName, preferences } = req.body;

    if (!viewName) {
      return res.status(400).json({
        success: false,
        error: 'View name is required'
      });
    }

    if (!preferences) {
      return res.status(400).json({
        success: false,
        error: 'Preferences object is required'
      });
    }

    // Check if view already exists
    const existing = DashboardService.getView(userId, viewName);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `View '${viewName}' already exists`
      });
    }

    const saved = DashboardService.savePreferences(userId, viewName, preferences);

    res.json({
      success: true,
      message: 'View created successfully',
      data: saved
    });
  } catch (error) {
    logger.error('Error creating view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create dashboard view'
    });
  }
});

/**
 * PUT /api/dashboard/views/:viewName
 * Update existing view
 */
router.put('/views/:viewName', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({
        success: false,
        error: 'Preferences object is required'
      });
    }

    const updated = DashboardService.savePreferences(userId, viewName, preferences);

    res.json({
      success: true,
      message: 'View updated successfully',
      data: updated
    });
  } catch (error) {
    logger.error('Error updating view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update dashboard view'
    });
  }
});

/**
 * POST /api/dashboard/views/:viewName/activate
 * Activate a specific view
 */
router.post('/views/:viewName/activate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;

    const activated = DashboardService.activateView(userId, viewName);

    res.json({
      success: true,
      message: `View '${viewName}' activated`,
      data: activated
    });
  } catch (error) {
    logger.error('Error activating view:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to activate dashboard view'
    });
  }
});

/**
 * DELETE /api/dashboard/views/:viewName
 * Delete a view
 */
router.delete('/views/:viewName', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;

    DashboardService.deleteView(userId, viewName);

    res.json({
      success: true,
      message: `View '${viewName}' deleted successfully`
    });
  } catch (error) {
    logger.error('Error deleting view:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete dashboard view'
    });
  }
});

/**
 * POST /api/dashboard/views/:viewName/clone
 * Clone a view with a new name
 */
router.post('/views/:viewName/clone', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;
    const { newViewName } = req.body;

    if (!newViewName) {
      return res.status(400).json({
        success: false,
        error: 'New view name is required'
      });
    }

    const cloned = DashboardService.cloneView(userId, viewName, newViewName);

    res.json({
      success: true,
      message: `View cloned as '${newViewName}'`,
      data: cloned
    });
  } catch (error) {
    logger.error('Error cloning view:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clone dashboard view'
    });
  }
});

/**
 * POST /api/dashboard/views/:viewName/reset
 * Reset a view to default preferences
 */
router.post('/views/:viewName/reset', async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewName } = req.params;

    const reset = DashboardService.resetView(userId, viewName);

    res.json({
      success: true,
      message: `View '${viewName}' reset to defaults`,
      data: reset
    });
  } catch (error) {
    logger.error('Error resetting view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset dashboard view'
    });
  }
});

/**
 * GET /api/dashboard/export
 * Export all user's views as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const exportData = DashboardService.exportViews(userId);

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    logger.error('Error exporting views:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export dashboard views'
    });
  }
});

/**
 * POST /api/dashboard/import
 * Import views from JSON
 */
router.post('/import', async (req, res) => {
  try {
    const userId = req.user.id;
    const importData = req.body;

    const imported = DashboardService.importViews(userId, importData);

    res.json({
      success: true,
      message: `Imported ${imported.length} views`,
      data: imported
    });
  } catch (error) {
    logger.error('Error importing views:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to import dashboard views'
    });
  }
});

/**
 * GET /api/dashboard/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Dashboard Customization API',
    endpoints: 13,
    timestamp: new Date()
  });
});

module.exports = router;
