// Use SQLite compatibility layer for Railway support
const db = require('../db/sqliteCompat');
const path = require('path');
const logger = require('../utils/logger');


class DashboardService {
  /**
   * Get default preferences structure
   */
  static getDefaultPreferences() {
    return {
      viewName: 'default',
      tabs: {
        performance: {
          charts: [
            { id: 'chart-attribution', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-excess-return', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-drawdown', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-rolling-stats', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        risk: {
          charts: [
            { id: 'chart-risk-decomposition', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-var', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-correlation', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-stress', visible: true, order: 3, size: 'normal', favorited: false },
            { id: 'chart-concentration-treemap', visible: true, order: 4, size: 'normal', favorited: false }
          ]
        },
        attribution: {
          charts: [
            { id: 'chart-regional', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-sector-rotation', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-peer-benchmarking', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-alpha-decay', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        construction: {
          charts: [
            { id: 'chart-efficient-frontier', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-turnover', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-liquidity', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-tca-boxplot', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        specialized: {
          charts: [
            { id: 'chart-alternatives', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-esg-radar', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-goals', visible: true, order: 2, size: 'normal', favorited: false }
          ]
        }
      },
      colorScheme: 'bloomberg-default',
      compactMode: false,
      showExportButtons: true
    };
  }

  /**
   * Get user's active view preferences
   * @param {string} userId - User ID
   * @returns {object} Active view preferences or default if none exists
   */
  static getActivePreferences(userId) {
    try {
      const stmt = db.prepare(`
        SELECT * FROM dashboard_preferences
        WHERE user_id = ? AND is_active = 1
        LIMIT 1
      `);

      const row = stmt.get(userId);

      if (row) {
        return {
          id: row.id,
          viewName: row.view_name,
          isActive: row.is_active === 1,
          preferences: JSON.parse(row.preferences),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }

      // If no active view, create default
      return this.createDefaultView(userId);
    } catch (error) {
      logger.error('Error getting active preferences:', error);
      throw error;
    }
  }

  /**
   * Get all views for a user
   * @param {string} userId - User ID
   * @returns {Array} Array of all user's saved views
   */
  static getAllViews(userId) {
    try {
      const stmt = db.prepare(`
        SELECT * FROM dashboard_preferences
        WHERE user_id = ?
        ORDER BY is_active DESC, view_name ASC
      `);

      const rows = stmt.all(userId);

      return rows.map(row => ({
        id: row.id,
        viewName: row.view_name,
        isActive: row.is_active === 1,
        preferences: JSON.parse(row.preferences),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Error getting all views:', error);
      throw error;
    }
  }

  /**
   * Create default view for user
   * @param {string} userId - User ID
   * @returns {object} Created default view
   */
  static createDefaultView(userId) {
    try {
      const defaultPrefs = this.getDefaultPreferences();

      const stmt = db.prepare(`
        INSERT INTO dashboard_preferences (user_id, view_name, is_active, preferences)
        VALUES (?, ?, 1, ?)
      `);

      const result = stmt.run(userId, 'default', JSON.stringify(defaultPrefs));

      logger.info(`Created default dashboard view for user ${userId}`);

      return {
        id: result.lastInsertRowid,
        viewName: 'default',
        isActive: true,
        preferences: defaultPrefs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        // View already exists, fetch it
        return this.getView(userId, 'default');
      }
      logger.error('Error creating default view:', error);
      throw error;
    }
  }

  /**
   * Get specific view by name
   * @param {string} userId - User ID
   * @param {string} viewName - View name
   * @returns {object|null} View or null if not found
   */
  static getView(userId, viewName) {
    try {
      const stmt = db.prepare(`
        SELECT * FROM dashboard_preferences
        WHERE user_id = ? AND view_name = ?
      `);

      const row = stmt.get(userId, viewName);

      if (!row) return null;

      return {
        id: row.id,
        viewName: row.view_name,
        isActive: row.is_active === 1,
        preferences: JSON.parse(row.preferences),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      logger.error('Error getting view:', error);
      throw error;
    }
  }

  /**
   * Save or update preferences for a view
   * @param {string} userId - User ID
   * @param {string} viewName - View name
   * @param {object} preferences - Preferences object
   * @returns {object} Saved preferences
   */
  static savePreferences(userId, viewName, preferences) {
    try {
      const prefsJson = JSON.stringify(preferences);

      const stmt = db.prepare(`
        INSERT INTO dashboard_preferences (user_id, view_name, preferences, is_active, updated_at)
        VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, view_name) DO UPDATE SET
          preferences = excluded.preferences,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(userId, viewName, prefsJson);

      logger.info(`Saved dashboard preferences for user ${userId}, view ${viewName}`);

      return this.getView(userId, viewName);
    } catch (error) {
      logger.error('Error saving preferences:', error);
      throw error;
    }
  }

  /**
   * Activate a specific view
   * @param {string} userId - User ID
   * @param {string} viewName - View name to activate
   * @returns {object} Activated view
   */
  static activateView(userId, viewName) {
    try {
      // Start transaction
      const deactivateStmt = db.prepare(`
        UPDATE dashboard_preferences
        SET is_active = 0
        WHERE user_id = ?
      `);

      const activateStmt = db.prepare(`
        UPDATE dashboard_preferences
        SET is_active = 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND view_name = ?
      `);

      const transaction = db.transaction(() => {
        deactivateStmt.run(userId);
        const result = activateStmt.run(userId, viewName);

        if (result.changes === 0) {
          throw new Error(`View '${viewName}' not found`);
        }
      });

      transaction();

      logger.info(`Activated view '${viewName}' for user ${userId}`);

      return this.getView(userId, viewName);
    } catch (error) {
      logger.error('Error activating view:', error);
      throw error;
    }
  }

  /**
   * Delete a view
   * @param {string} userId - User ID
   * @param {string} viewName - View name to delete
   * @returns {boolean} Success
   */
  static deleteView(userId, viewName) {
    try {
      // Can't delete default view
      if (viewName === 'default') {
        throw new Error('Cannot delete default view');
      }

      const stmt = db.prepare(`
        DELETE FROM dashboard_preferences
        WHERE user_id = ? AND view_name = ?
      `);

      const result = stmt.run(userId, viewName);

      if (result.changes === 0) {
        throw new Error(`View '${viewName}' not found`);
      }

      logger.info(`Deleted view '${viewName}' for user ${userId}`);

      // If deleted view was active, activate default
      const activeView = this.getActivePreferences(userId);
      if (!activeView || activeView.viewName === viewName) {
        this.activateView(userId, 'default');
      }

      return true;
    } catch (error) {
      logger.error('Error deleting view:', error);
      throw error;
    }
  }

  /**
   * Clone a view with a new name
   * @param {string} userId - User ID
   * @param {string} sourceViewName - Source view name
   * @param {string} newViewName - New view name
   * @returns {object} Cloned view
   */
  static cloneView(userId, sourceViewName, newViewName) {
    try {
      const sourceView = this.getView(userId, sourceViewName);

      if (!sourceView) {
        throw new Error(`Source view '${sourceViewName}' not found`);
      }

      const newPrefs = {
        ...sourceView.preferences,
        viewName: newViewName
      };

      return this.savePreferences(userId, newViewName, newPrefs);
    } catch (error) {
      logger.error('Error cloning view:', error);
      throw error;
    }
  }

  /**
   * Reset view to defaults
   * @param {string} userId - User ID
   * @param {string} viewName - View name to reset
   * @returns {object} Reset view
   */
  static resetView(userId, viewName) {
    try {
      const defaultPrefs = this.getDefaultPreferences();
      defaultPrefs.viewName = viewName;

      return this.savePreferences(userId, viewName, defaultPrefs);
    } catch (error) {
      logger.error('Error resetting view:', error);
      throw error;
    }
  }

  /**
   * Export user's all views as JSON
   * @param {string} userId - User ID
   * @returns {object} All views for export
   */
  static exportViews(userId) {
    try {
      const views = this.getAllViews(userId);

      return {
        exportedAt: new Date().toISOString(),
        userId,
        views: views.map(v => ({
          viewName: v.viewName,
          preferences: v.preferences
        }))
      };
    } catch (error) {
      logger.error('Error exporting views:', error);
      throw error;
    }
  }

  /**
   * Import views from JSON
   * @param {string} userId - User ID
   * @param {object} importData - Import data
   * @returns {Array} Imported views
   */
  static importViews(userId, importData) {
    try {
      if (!importData.views || !Array.isArray(importData.views)) {
        throw new Error('Invalid import data format');
      }

      const imported = [];

      for (const view of importData.views) {
        // Skip if view name already exists (don't overwrite)
        const existing = this.getView(userId, view.viewName);
        if (existing) {
          logger.warn(`View '${view.viewName}' already exists, skipping import`);
          continue;
        }

        const saved = this.savePreferences(userId, view.viewName, view.preferences);
        imported.push(saved);
      }

      logger.info(`Imported ${imported.length} views for user ${userId}`);

      return imported;
    } catch (error) {
      logger.error('Error importing views:', error);
      throw error;
    }
  }
}

module.exports = DashboardService;
