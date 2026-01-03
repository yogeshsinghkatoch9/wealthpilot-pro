/**
 * Webhook Service
 * Manages webhook subscriptions, event dispatch, and delivery with retry logic
 */

const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../db/simpleDb');
const logger = require('../utils/logger');

class WebhookService {
  constructor() {
    this.maxRetries = 5;
    this.retryDelays = [1000, 5000, 30000, 120000, 600000]; // 1s, 5s, 30s, 2m, 10m
    this.timeout = 30000; // 30 second timeout
    this.pendingDeliveries = new Map();
  }

  /**
   * Event types supported by the webhook system
   */
  static EVENTS = {
    // Portfolio events
    PORTFOLIO_CREATED: 'portfolio.created',
    PORTFOLIO_UPDATED: 'portfolio.updated',
    PORTFOLIO_DELETED: 'portfolio.deleted',

    // Holdings events
    HOLDING_ADDED: 'holding.added',
    HOLDING_UPDATED: 'holding.updated',
    HOLDING_REMOVED: 'holding.removed',

    // Transaction events
    TRANSACTION_CREATED: 'transaction.created',
    TRANSACTION_EXECUTED: 'transaction.executed',

    // Alert events
    ALERT_TRIGGERED: 'alert.triggered',
    PRICE_TARGET_HIT: 'price.target_hit',

    // Tax events
    TAX_HARVEST_EXECUTED: 'tax.harvest_executed',
    WASH_SALE_WARNING: 'tax.wash_sale_warning',

    // Market events
    MARKET_OPEN: 'market.open',
    MARKET_CLOSE: 'market.close',

    // Account events
    USER_SETTINGS_UPDATED: 'user.settings_updated',
    REPORT_GENERATED: 'report.generated'
  };

  /**
   * Generate a webhook signing secret
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  generateSignature(payload, secret) {
    const timestamp = Date.now();
    const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    return {
      signature: `v1=${signature}`,
      timestamp
    };
  }

  /**
   * Verify incoming webhook signature
   */
  verifySignature(payload, signature, timestamp, secret) {
    const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    const expectedFull = `v1=${expectedSignature}`;

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedFull.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedFull)
    );
  }

  /**
   * Create a new webhook subscription
   */
  async createWebhook(userId, data) {
    const { url, events, description, headers } = data;

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Validate events
    const validEvents = Object.values(WebhookService.EVENTS);
    for (const event of events) {
      if (event !== '*' && !validEvents.includes(event)) {
        throw new Error(`Invalid event type: ${event}`);
      }
    }

    const secret = this.generateSecret();

    const webhook = await prisma.webhook.create({
      data: {
        userId,
        url,
        secret,
        events: JSON.stringify(events),
        description,
        headers: headers ? JSON.stringify(headers) : null,
        isActive: true
      }
    });

    logger.info(`[Webhook] Created webhook ${webhook.id} for user ${userId}`);

    return {
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: webhook.headers ? JSON.parse(webhook.headers) : null,
      secret // Only returned on creation
    };
  }

  /**
   * Update a webhook subscription
   */
  async updateWebhook(webhookId, userId, data) {
    const { url, events, description, headers, isActive } = data;

    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const updated = await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        url: url || webhook.url,
        events: events ? JSON.stringify(events) : webhook.events,
        description: description !== undefined ? description : webhook.description,
        headers: headers ? JSON.stringify(headers) : webhook.headers,
        isActive: isActive !== undefined ? isActive : webhook.isActive,
        updatedAt: new Date()
      }
    });

    logger.info(`[Webhook] Updated webhook ${webhookId}`);

    return {
      ...updated,
      events: JSON.parse(updated.events),
      headers: updated.headers ? JSON.parse(updated.headers) : null
    };
  }

  /**
   * Delete a webhook subscription
   */
  async deleteWebhook(webhookId, userId) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    await prisma.webhook.delete({
      where: { id: webhookId }
    });

    logger.info(`[Webhook] Deleted webhook ${webhookId}`);
  }

  /**
   * Get all webhooks for a user
   */
  async getUserWebhooks(userId) {
    const webhooks = await prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return webhooks.map(w => ({
      ...w,
      events: JSON.parse(w.events),
      headers: w.headers ? JSON.parse(w.headers) : null,
      secret: undefined // Never expose secret in list
    }));
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhookId, userId) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      return null;
    }

    return {
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: webhook.headers ? JSON.parse(webhook.headers) : null,
      secret: undefined
    };
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(webhookId, userId) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const newSecret = this.generateSecret();

    await prisma.webhook.update({
      where: { id: webhookId },
      data: { secret: newSecret, updatedAt: new Date() }
    });

    logger.info(`[Webhook] Regenerated secret for webhook ${webhookId}`);

    return { secret: newSecret };
  }

  /**
   * Dispatch an event to all matching webhooks
   */
  async dispatch(userId, eventType, payload) {
    try {
      // Find all active webhooks for this user that subscribe to this event
      const webhooks = await prisma.webhook.findMany({
        where: {
          userId,
          isActive: true
        }
      });

      const matchingWebhooks = webhooks.filter(w => {
        const events = JSON.parse(w.events);
        return events.includes('*') || events.includes(eventType);
      });

      if (matchingWebhooks.length === 0) {
        return { delivered: 0, queued: 0 };
      }

      logger.info(`[Webhook] Dispatching ${eventType} to ${matchingWebhooks.length} webhooks`);

      const deliveryPromises = matchingWebhooks.map(webhook =>
        this.deliver(webhook, eventType, payload)
      );

      const results = await Promise.allSettled(deliveryPromises);

      const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

      return { delivered, failed, total: matchingWebhooks.length };

    } catch (error) {
      logger.error('[Webhook] Dispatch error:', error);
      throw error;
    }
  }

  /**
   * Deliver a webhook to a single endpoint
   */
  async deliver(webhook, eventType, payload, attempt = 0) {
    const deliveryId = crypto.randomUUID();

    const webhookPayload = {
      id: deliveryId,
      type: eventType,
      created: new Date().toISOString(),
      data: payload
    };

    const { signature, timestamp } = this.generateSignature(webhookPayload, webhook.secret);

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'WealthPilot-Webhook/1.0',
      'X-Webhook-Id': webhook.id,
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': timestamp.toString(),
      'X-Webhook-Event': eventType,
      'X-Webhook-Delivery': deliveryId,
      ...(webhook.headers ? JSON.parse(webhook.headers) : {})
    };

    try {
      const response = await axios.post(webhook.url, webhookPayload, {
        headers,
        timeout: this.timeout,
        validateStatus: status => status >= 200 && status < 300
      });

      // Log successful delivery
      await this.logDelivery(webhook.id, deliveryId, eventType, 'success', response.status, attempt);

      logger.info(`[Webhook] Delivered ${eventType} to ${webhook.url} (attempt ${attempt + 1})`);

      return { success: true, deliveryId, statusCode: response.status };

    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMessage = error.message;

      // Log failed attempt
      await this.logDelivery(webhook.id, deliveryId, eventType, 'failed', statusCode, attempt, errorMessage);

      logger.warn(`[Webhook] Delivery failed for ${webhook.url}: ${errorMessage} (attempt ${attempt + 1})`);

      // Retry logic
      if (attempt < this.maxRetries) {
        const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];

        logger.info(`[Webhook] Scheduling retry ${attempt + 2} in ${delay}ms`);

        // Schedule retry
        setTimeout(() => {
          this.deliver(webhook, eventType, payload, attempt + 1);
        }, delay);

        return { success: false, deliveryId, willRetry: true, nextAttempt: attempt + 2 };
      }

      // Max retries exceeded - disable webhook if consistently failing
      await this.handleMaxRetriesExceeded(webhook);

      return { success: false, deliveryId, willRetry: false, error: errorMessage };
    }
  }

  /**
   * Log webhook delivery attempt
   */
  async logDelivery(webhookId, deliveryId, eventType, status, statusCode, attempt, error = null) {
    try {
      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          deliveryId,
          eventType,
          status,
          statusCode,
          attempt,
          error,
          createdAt: new Date()
        }
      });
    } catch (err) {
      logger.error('[Webhook] Failed to log delivery:', err);
    }
  }

  /**
   * Handle webhook that has exceeded max retries
   */
  async handleMaxRetriesExceeded(webhook) {
    // Count recent failures
    const recentFailures = await prisma.webhookDelivery.count({
      where: {
        webhookId: webhook.id,
        status: 'failed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    // Disable webhook if too many failures
    if (recentFailures >= 10) {
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          isActive: false,
          disabledReason: 'Too many delivery failures',
          disabledAt: new Date()
        }
      });

      logger.warn(`[Webhook] Disabled webhook ${webhook.id} due to repeated failures`);
    }
  }

  /**
   * Get delivery history for a webhook
   */
  async getDeliveryHistory(webhookId, userId, limit = 50) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return deliveries;
  }

  /**
   * Test a webhook endpoint
   */
  async testWebhook(webhookId, userId) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload = {
      test: true,
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString()
    };

    const result = await this.deliver(webhook, 'test.ping', testPayload);

    return result;
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId, userId) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const [total, successful, failed] = await Promise.all([
      prisma.webhookDelivery.count({ where: { webhookId } }),
      prisma.webhookDelivery.count({ where: { webhookId, status: 'success' } }),
      prisma.webhookDelivery.count({ where: { webhookId, status: 'failed' } })
    ]);

    const recentDeliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0,
      recentDeliveries
    };
  }
}

// Singleton instance
const webhookService = new WebhookService();

module.exports = webhookService;
module.exports.WebhookService = WebhookService;
