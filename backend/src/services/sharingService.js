/**
 * Portfolio Sharing Service
 * Handles generating share links, managing privacy, and public portfolio views
 */

const crypto = require('crypto');
const { prisma } = require('../db/simpleDb');

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
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        throw new Error('Portfolio not found or access denied');
      }

      // Check for existing share
      const existing = await prisma.portfolioShare.findUnique({
        where: { portfolioId }
      });

      let shareToken;

      if (existing) {
        // Update existing share
        shareToken = existing.shareToken;
        await prisma.portfolioShare.update({
          where: { portfolioId },
          data: {
            isPublic,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            allowedFields: JSON.stringify(allowedFields),
            showValues,
            showQuantities
          }
        });
      } else {
        // Create new share
        shareToken = this.generateShareToken();
        await prisma.portfolioShare.create({
          data: {
            portfolioId,
            shareToken,
            isPublic,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            allowedFields: JSON.stringify(allowedFields),
            showValues,
            showQuantities
          }
        });
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
      // First verify ownership
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return null;
      }

      const share = await prisma.portfolioShare.findUnique({
        where: { portfolioId }
      });

      if (!share) {
        return { shared: false };
      }

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      return {
        shared: true,
        shareToken: share.shareToken,
        shareUrl: `${baseUrl}/shared/${share.shareToken}`,
        isPublic: share.isPublic,
        expiresAt: share.expiresAt,
        allowedFields: JSON.parse(share.allowedFields || '[]'),
        showValues: share.showValues,
        showQuantities: share.showQuantities,
        viewCount: share.viewCount,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt
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
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        throw new Error('Portfolio not found or access denied');
      }

      await prisma.portfolioShare.delete({
        where: { portfolioId }
      }).catch(() => {}); // Ignore if doesn't exist

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
      const share = await prisma.portfolioShare.findUnique({
        where: { shareToken }
      });

      if (!share) {
        return null;
      }

      // Check expiration
      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return { expired: true };
      }

      // Get portfolio
      const portfolio = await prisma.portfolios.findUnique({
        where: { id: share.portfolioId },
        include: { holdings: true }
      });

      if (!portfolio) {
        return null;
      }

      // Increment view count
      await prisma.portfolioShare.update({
        where: { shareToken },
        data: { viewCount: { increment: 1 } }
      });

      const allowedFields = JSON.parse(share.allowedFields || '[]');

      // Build response based on allowed fields
      const response = {
        name: portfolio.name,
        description: portfolio.description,
        currency: portfolio.currency,
        isPublic: share.isPublic,
        viewCount: share.viewCount + 1
      };

      // Get holdings if allowed
      if (allowedFields.includes('holdings')) {
        response.holdings = portfolio.holdings.map(h => {
          const holding = {
            symbol: h.symbol,
            name: h.name,
            sector: h.sector,
            assetType: h.assetType
          };

          if (share.showQuantities) {
            holding.shares = parseFloat(h.shares);
          }

          if (share.showValues) {
            const currentPrice = parseFloat(h.currentPrice || h.avgCostBasis || 0);
            const avgCost = parseFloat(h.avgCostBasis || 0);
            const shares = parseFloat(h.shares || 0);

            holding.currentPrice = currentPrice;
            holding.avgCost = avgCost;
            holding.marketValue = shares * currentPrice;
            holding.costBasis = shares * avgCost;
            holding.gain = holding.marketValue - holding.costBasis;
            holding.gainPercent = holding.costBasis > 0
              ? ((holding.gain / holding.costBasis) * 100)
              : 0;
          }

          return holding;
        });

        // Calculate totals
        if (share.showValues) {
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
        const sectorMap = {};
        let total = 0;

        portfolio.holdings.forEach(h => {
          const currentPrice = parseFloat(h.currentPrice || h.avgCostBasis || 0);
          const value = parseFloat(h.shares || 0) * currentPrice;
          const sector = h.sector || 'Unknown';

          sectorMap[sector] = (sectorMap[sector] || 0) + value;
          total += value;
        });

        response.sectorAllocation = Object.entries(sectorMap).map(([sector, value]) => ({
          sector,
          percentage: total > 0 ? (value / total * 100) : 0,
          value: share.showValues ? value : undefined
        }));
      }

      // Log view event
      await this.logShareEvent(share.portfolioId, 'viewed', {
        shareToken,
        viewCount: share.viewCount + 1
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
      await prisma.shareEvent.create({
        data: {
          portfolioId,
          eventType,
          eventData: JSON.stringify(data)
        }
      });
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
      const portfolio = await prisma.portfolios.findFirst({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        throw new Error('Portfolio not found or access denied');
      }

      // Get share info
      const share = await prisma.portfolioShare.findUnique({
        where: { portfolioId }
      });

      // Get recent events
      const events = await prisma.shareEvent.findMany({
        where: { portfolioId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      return {
        totalViews: share?.viewCount || 0,
        recentEvents: events.map(e => ({
          type: e.eventType,
          data: JSON.parse(e.eventData || '{}'),
          timestamp: e.createdAt
        }))
      };
    } catch (error) {
      console.error('Get share analytics error:', error.message);
      throw error;
    }
  }
}

module.exports = new SharingService();
