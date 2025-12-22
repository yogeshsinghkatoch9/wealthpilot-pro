/**
 * Portfolio Sharing Service
 * Handles generating share links, managing privacy, and public portfolio views
 */

const crypto = require('crypto');
const db = require('../db');

class SharingService {
  constructor() {
    this.shareTokenLength = 12;
  }

  /**
   * Generate a unique share token
   */
  generateShareToken() {
    return crypto.randomBytes(this.shareTokenLength).toString('base64url');
  }

  /**
   * Create or update a share link for a portfolio
   */
  async createShareLink(userId, portfolioId, options = {}) {
    const {
      isPublic = false,
      expiresAt = null,
      allowedFields = ['holdings', 'performance', 'allocation'],
      showValues = true,
      showQuantities = true
    } = options;

    try {
      // Verify portfolio ownership
      const portfolio = await db.query(
        `SELECT id, name FROM portfolios WHERE id = $1 AND user_id = $2`,
        [portfolioId, userId]
      );

      if (portfolio.rows.length === 0) {
        throw new Error('Portfolio not found or access denied');
      }

      // Check for existing share
      const existing = await db.query(
        `SELECT share_token FROM portfolio_shares WHERE portfolio_id = $1`,
        [portfolioId]
      );

      let shareToken;

      if (existing.rows.length > 0) {
        // Update existing share
        shareToken = existing.rows[0].share_token;
        await db.query(
          `UPDATE portfolio_shares
           SET is_public = $1, expires_at = $2, allowed_fields = $3,
               show_values = $4, show_quantities = $5, updated_at = NOW()
           WHERE portfolio_id = $6`,
          [isPublic, expiresAt, JSON.stringify(allowedFields), showValues, showQuantities, portfolioId]
        );
      } else {
        // Create new share
        shareToken = this.generateShareToken();
        await db.query(
          `INSERT INTO portfolio_shares
           (portfolio_id, share_token, is_public, expires_at, allowed_fields, show_values, show_quantities)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [portfolioId, shareToken, isPublic, expiresAt, JSON.stringify(allowedFields), showValues, showQuantities]
        );
      }

      // Track share event
      await this.logShareEvent(portfolioId, 'link_created', { isPublic, expiresAt });

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const shareUrl = `${baseUrl}/shared/${shareToken}`;

      return {
        shareToken,
        shareUrl,
        isPublic,
        expiresAt,
        allowedFields,
        showValues,
        showQuantities
      };
    } catch (error) {
      console.error('Create share link error:', error.message);
      throw error;
    }
  }

  /**
   * Get share settings for a portfolio
   */
  async getShareSettings(userId, portfolioId) {
    try {
      const result = await db.query(
        `SELECT ps.*, p.name as portfolio_name
         FROM portfolio_shares ps
         JOIN portfolios p ON ps.portfolio_id = p.id
         WHERE ps.portfolio_id = $1 AND p.user_id = $2`,
        [portfolioId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const share = result.rows[0];
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      return {
        shareToken: share.share_token,
        shareUrl: `${baseUrl}/shared/${share.share_token}`,
        isPublic: share.is_public,
        expiresAt: share.expires_at,
        allowedFields: JSON.parse(share.allowed_fields || '[]'),
        showValues: share.show_values,
        showQuantities: share.show_quantities,
        viewCount: share.view_count,
        createdAt: share.created_at,
        updatedAt: share.updated_at
      };
    } catch (error) {
      console.error('Get share settings error:', error.message);
      throw error;
    }
  }

  /**
   * Disable sharing for a portfolio
   */
  async disableSharing(userId, portfolioId) {
    try {
      // Verify ownership
      const portfolio = await db.query(
        `SELECT id FROM portfolios WHERE id = $1 AND user_id = $2`,
        [portfolioId, userId]
      );

      if (portfolio.rows.length === 0) {
        throw new Error('Portfolio not found or access denied');
      }

      await db.query(
        `DELETE FROM portfolio_shares WHERE portfolio_id = $1`,
        [portfolioId]
      );

      await this.logShareEvent(portfolioId, 'sharing_disabled', {});

      return { disabled: true };
    } catch (error) {
      console.error('Disable sharing error:', error.message);
      throw error;
    }
  }

  /**
   * Get shared portfolio data (public access)
   */
  async getSharedPortfolio(shareToken) {
    try {
      const result = await db.query(
        `SELECT ps.*, p.id as portfolio_id, p.name, p.description, p.currency,
                u.id as user_id
         FROM portfolio_shares ps
         JOIN portfolios p ON ps.portfolio_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE ps.share_token = $1`,
        [shareToken]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const share = result.rows[0];

      // Check expiration
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return { expired: true };
      }

      // Increment view count
      await db.query(
        `UPDATE portfolio_shares SET view_count = view_count + 1 WHERE share_token = $1`,
        [shareToken]
      );

      const allowedFields = JSON.parse(share.allowed_fields || '[]');

      // Build response based on allowed fields
      const response = {
        name: share.name,
        description: share.description,
        currency: share.currency,
        isPublic: share.is_public,
        viewCount: share.view_count + 1
      };

      // Get holdings if allowed
      if (allowedFields.includes('holdings')) {
        const holdingsResult = await db.query(
          `SELECT h.symbol, h.name, h.shares, h.avg_cost_basis,
                  h.current_price, h.sector, h.asset_type
           FROM holdings h
           WHERE h.portfolio_id = $1`,
          [share.portfolio_id]
        );

        response.holdings = holdingsResult.rows.map(h => {
          const holding = {
            symbol: h.symbol,
            name: h.name,
            sector: h.sector,
            assetType: h.asset_type
          };

          if (share.show_quantities) {
            holding.shares = parseFloat(h.shares);
          }

          if (share.show_values) {
            holding.currentPrice = parseFloat(h.current_price);
            holding.avgCost = parseFloat(h.avg_cost_basis);
            holding.marketValue = parseFloat(h.shares) * parseFloat(h.current_price);
            holding.costBasis = parseFloat(h.shares) * parseFloat(h.avg_cost_basis);
            holding.gain = holding.marketValue - holding.costBasis;
            holding.gainPercent = holding.costBasis > 0
              ? ((holding.gain / holding.costBasis) * 100)
              : 0;
          }

          return holding;
        });

        // Calculate totals
        if (share.show_values) {
          response.totalValue = response.holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
          response.totalCost = response.holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);
          response.totalGain = response.totalValue - response.totalCost;
          response.totalGainPercent = response.totalCost > 0
            ? ((response.totalGain / response.totalCost) * 100)
            : 0;
        }
      }

      // Get allocation if allowed
      if (allowedFields.includes('allocation')) {
        const holdingsResult = await db.query(
          `SELECT h.sector, SUM(h.shares * h.current_price) as value
           FROM holdings h
           WHERE h.portfolio_id = $1
           GROUP BY h.sector`,
          [share.portfolio_id]
        );

        const total = holdingsResult.rows.reduce((sum, r) => sum + parseFloat(r.value), 0);

        response.sectorAllocation = holdingsResult.rows.map(r => ({
          sector: r.sector || 'Unknown',
          percentage: total > 0 ? (parseFloat(r.value) / total * 100) : 0,
          value: share.show_values ? parseFloat(r.value) : undefined
        }));
      }

      // Log view event
      await this.logShareEvent(share.portfolio_id, 'viewed', {
        shareToken,
        viewCount: share.view_count + 1
      });

      return response;
    } catch (error) {
      console.error('Get shared portfolio error:', error.message);
      throw error;
    }
  }

  /**
   * Log share events for analytics
   */
  async logShareEvent(portfolioId, eventType, data) {
    try {
      await db.query(
        `INSERT INTO share_events (portfolio_id, event_type, event_data)
         VALUES ($1, $2, $3)`,
        [portfolioId, eventType, JSON.stringify(data)]
      );
    } catch (error) {
      // Don't throw, just log
      console.error('Log share event error:', error.message);
    }
  }

  /**
   * Get share analytics for a portfolio
   */
  async getShareAnalytics(userId, portfolioId) {
    try {
      // Verify ownership
      const portfolio = await db.query(
        `SELECT id FROM portfolios WHERE id = $1 AND user_id = $2`,
        [portfolioId, userId]
      );

      if (portfolio.rows.length === 0) {
        throw new Error('Portfolio not found or access denied');
      }

      // Get view count
      const viewResult = await db.query(
        `SELECT view_count FROM portfolio_shares WHERE portfolio_id = $1`,
        [portfolioId]
      );

      // Get recent events
      const eventsResult = await db.query(
        `SELECT event_type, event_data, created_at
         FROM share_events
         WHERE portfolio_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [portfolioId]
      );

      // Get daily views for last 30 days
      const dailyViewsResult = await db.query(
        `SELECT DATE(created_at) as date, COUNT(*) as views
         FROM share_events
         WHERE portfolio_id = $1 AND event_type = 'viewed'
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [portfolioId]
      );

      return {
        totalViews: viewResult.rows[0]?.view_count || 0,
        recentEvents: eventsResult.rows.map(e => ({
          type: e.event_type,
          data: JSON.parse(e.event_data || '{}'),
          timestamp: e.created_at
        })),
        dailyViews: dailyViewsResult.rows.map(d => ({
          date: d.date,
          views: parseInt(d.views)
        }))
      };
    } catch (error) {
      console.error('Get share analytics error:', error.message);
      throw error;
    }
  }
}

module.exports = new SharingService();
