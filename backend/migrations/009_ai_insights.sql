-- Migration 009: AI Insights System
-- Adds table for storing AI-generated portfolio insights

CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  insights_data TEXT NOT NULL, -- JSON blob with insights
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_portfolio
  ON ai_insights(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_date
  ON ai_insights(generated_at DESC);
