-- Migration 007: Dashboard Preferences
-- Adds support for user dashboard customization

-- Create dashboard_preferences table
CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  view_name TEXT NOT NULL DEFAULT 'default',
  is_active INTEGER DEFAULT 0, -- SQLite uses INTEGER for boolean (0 = false, 1 = true)
  preferences TEXT NOT NULL, -- JSON blob containing chart visibility, order, favorites, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, view_name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_user
  ON dashboard_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_active
  ON dashboard_preferences(user_id, is_active);

-- Insert default preferences for existing users (if any)
-- This ensures all users get a default view
INSERT OR IGNORE INTO dashboard_preferences (user_id, view_name, is_active, preferences)
SELECT
  id as user_id,
  'default' as view_name,
  1 as is_active,
  '{
    "viewName": "default",
    "tabs": {
      "performance": {
        "charts": [
          {"id": "chart-attribution", "visible": true, "order": 0, "size": "normal", "favorited": false},
          {"id": "chart-excess-return", "visible": true, "order": 1, "size": "normal", "favorited": false},
          {"id": "chart-drawdown", "visible": true, "order": 2, "size": "normal", "favorited": false},
          {"id": "chart-rolling-stats", "visible": true, "order": 3, "size": "normal", "favorited": false}
        ]
      },
      "risk": {
        "charts": [
          {"id": "chart-risk-decomposition", "visible": true, "order": 0, "size": "normal", "favorited": false},
          {"id": "chart-var", "visible": true, "order": 1, "size": "normal", "favorited": false},
          {"id": "chart-correlation", "visible": true, "order": 2, "size": "normal", "favorited": false},
          {"id": "chart-stress", "visible": true, "order": 3, "size": "normal", "favorited": false},
          {"id": "chart-concentration-treemap", "visible": true, "order": 4, "size": "normal", "favorited": false}
        ]
      },
      "attribution": {
        "charts": [
          {"id": "chart-regional", "visible": true, "order": 0, "size": "normal", "favorited": false},
          {"id": "chart-sector-rotation", "visible": true, "order": 1, "size": "normal", "favorited": false},
          {"id": "chart-peer-benchmarking", "visible": true, "order": 2, "size": "normal", "favorited": false},
          {"id": "chart-alpha-decay", "visible": true, "order": 3, "size": "normal", "favorited": false}
        ]
      },
      "construction": {
        "charts": [
          {"id": "chart-efficient-frontier", "visible": true, "order": 0, "size": "normal", "favorited": false},
          {"id": "chart-turnover", "visible": true, "order": 1, "size": "normal", "favorited": false},
          {"id": "chart-liquidity", "visible": true, "order": 2, "size": "normal", "favorited": false},
          {"id": "chart-tca-boxplot", "visible": true, "order": 3, "size": "normal", "favorited": false}
        ]
      },
      "specialized": {
        "charts": [
          {"id": "chart-alternatives", "visible": true, "order": 0, "size": "normal", "favorited": false},
          {"id": "chart-esg-radar", "visible": true, "order": 1, "size": "normal", "favorited": false},
          {"id": "chart-goals", "visible": true, "order": 2, "size": "normal", "favorited": false}
        ]
      }
    },
    "colorScheme": "bloomberg-default",
    "compactMode": false,
    "showExportButtons": true
  }' as preferences
FROM users;
