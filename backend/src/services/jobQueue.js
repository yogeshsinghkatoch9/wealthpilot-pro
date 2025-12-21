/**
 * Simple Background Job Queue
 * Handles async tasks like PDF generation, email sending, data processing
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.workers = new Map();
    this.stats = {
      totalJobs: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      running: 0
    };

    this.maxConcurrent = 5;
    this.currentRunning = 0;

    logger.info('Job queue initialized');
  }

  /**
   * Add a job to the queue
   */
  async addJob(name, data, options = {}) {
    const jobId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job = {
      id: jobId,
      name,
      data,
      status: 'pending',
      priority: options.priority || 5,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null
    };

    this.jobs.set(jobId, job);
    this.stats.totalJobs++;
    this.stats.pending++;

    logger.info(`Job added: ${jobId} (${name})`);

    // Try to process immediately
    this.processNext();

    return jobId;
  }

  /**
   * Register a worker for a job type
   */
  registerWorker(jobName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Worker handler must be a function');
    }

    this.workers.set(jobName, handler);
    logger.info(`Worker registered for job type: ${jobName}`);
  }

  /**
   * Process next job in queue
   */
  async processNext() {
    if (this.currentRunning >= this.maxConcurrent) {
      return; // Max concurrent jobs reached
    }

    // Get next pending job sorted by priority
    const pendingJobs = Array.from(this.jobs.values())
      .filter(j => j.status === 'pending')
      .sort((a, b) => b.priority - a.priority);

    if (pendingJobs.length === 0) {
      return; // No pending jobs
    }

    const job = pendingJobs[0];
    await this.processJob(job);
  }

  /**
   * Process a specific job
   */
  async processJob(job) {
    const worker = this.workers.get(job.name);

    if (!worker) {
      logger.error(`No worker found for job type: ${job.name}`);
      job.status = 'failed';
      job.error = `No worker found for job type: ${job.name}`;
      this.stats.pending--;
      this.stats.failed++;
      this.emit('job:failed', job);
      return;
    }

    job.status = 'running';
    job.startedAt = new Date();
    job.attempts++;
    this.currentRunning++;
    this.stats.pending--;
    this.stats.running++;

    logger.info(`Processing job: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

    try {
      const result = await worker(job.data);

      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      this.currentRunning--;
      this.stats.running--;
      this.stats.completed++;

      logger.info(`Job completed: ${job.id}`);
      this.emit('job:completed', job);

      // Process next job
      this.processNext();

    } catch (error) {
      logger.error(`Job failed: ${job.id}`, error);

      job.error = error.message;
      this.currentRunning--;
      this.stats.running--;

      // Retry if attempts remaining
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending';
        this.stats.pending++;
        logger.info(`Retrying job: ${job.id} (attempt ${job.attempts + 1}/${job.maxAttempts})`);

        // Retry after delay (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, job.attempts), 30000);
        setTimeout(() => this.processNext(), delay);

      } else {
        job.status = 'failed';
        job.completedAt = new Date();
        this.stats.failed++;
        logger.error(`Job exhausted retries: ${job.id}`);
        this.emit('job:failed', job);
      }

      // Process next job
      this.processNext();
    }
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status) {
    return Array.from(this.jobs.values()).filter(j => j.status === status);
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanup(olderThanMs = 3600000) { // Default: 1 hour
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') &&
          job.completedAt && job.completedAt.getTime() < cutoff) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old jobs`);
    }

    return cleaned;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentRunning: this.currentRunning,
      queueSize: this.jobs.size
    };
  }

  /**
   * Pause the queue
   */
  pause() {
    this.paused = true;
    logger.info('Job queue paused');
  }

  /**
   * Resume the queue
   */
  resume() {
    this.paused = false;
    logger.info('Job queue resumed');
    this.processNext();
  }

  /**
   * Clear all pending jobs
   */
  clearPending() {
    const pending = this.getJobsByStatus('pending');
    pending.forEach(job => {
      this.jobs.delete(job.id);
    });
    this.stats.pending = 0;
    logger.info(`Cleared ${pending.length} pending jobs`);
    return pending.length;
  }
}

// Export singleton instance
const jobQueue = new JobQueue();

// Register common workers

// PDF generation job
jobQueue.registerWorker('generate-pdf', async (data) => {
  const pdfGenerator = require('./pdfGenerator');
  const { userId, portfolioId, reportType, options } = data;

  let buffer;
  switch (reportType) {
    case 'portfolio':
      buffer = await pdfGenerator.generatePortfolioReport(userId, portfolioId, options);
      break;
    case 'performance':
      buffer = await pdfGenerator.generatePerformanceReport(userId, portfolioId, options.period);
      break;
    case 'tax':
      buffer = await pdfGenerator.generateTaxReport(userId, portfolioId, options.year);
      break;
    case 'client':
      buffer = await pdfGenerator.generateClientReport(userId, portfolioId, options);
      break;
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }

  return { buffer, size: buffer.length };
});

// Email sending job
jobQueue.registerWorker('send-email', async (data) => {
  const EmailService = require('./emailService');
  const emailService = new EmailService();

  try {
    // Initialize email transporter
    await emailService.initialize();

    const { to, subject, template, templateData, html, text } = data;

    // Build email options
    const emailOptions = {
      to,
      subject,
      from: process.env.EMAIL_FROM || 'WealthPilot Pro <noreply@wealthpilot.com>'
    };

    // Use template if provided
    if (template && emailService.templates[template]) {
      const rendered = emailService.templates[template](templateData || {});
      emailOptions.html = rendered.html;
      emailOptions.text = rendered.text;
    } else if (html) {
      emailOptions.html = html;
      emailOptions.text = text || html.replace(/<[^>]*>/g, '');
    } else if (text) {
      emailOptions.text = text;
    }

    // Send the email
    const result = await emailService.send(emailOptions);

    logger.info(`Email sent to ${to}: ${subject}`);
    return {
      sent: result.success,
      messageId: result.messageId || 'email-' + Date.now(),
      to,
      subject
    };
  } catch (error) {
    logger.error('Email sending failed:', error.message);
    throw error;
  }
});

// Data export job
jobQueue.registerWorker('export-data', async (data) => {
  const { PrismaClient } = require('../db/simpleDb');
  const prisma = new PrismaClient();
  const { userId } = data;

  // Export all user data
  const [user, portfolios, transactions, alerts, watchlists] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.portfolio.findMany({ where: { userId }, include: { holdings: true } }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.alert.findMany({ where: { userId } }),
    prisma.watchlist.findMany({ where: { userId }, include: { items: true } })
  ]);

  return {
    user,
    portfolios,
    transactions,
    alerts,
    watchlists,
    exportedAt: new Date()
  };
});

// Portfolio snapshot job
jobQueue.registerWorker('create-snapshot', async (data) => {
  const { prisma } = require('../db/simpleDb');
  const MarketDataService = require('./marketData');
  const { portfolioId, userId } = data;

  try {
    // Get portfolio with holdings
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${portfolioId}`);
    }

    // Get current market prices for all holdings
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = symbols.length > 0 ? await MarketDataService.getQuotes(symbols) : {};

    // Calculate portfolio metrics
    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;

    for (const holding of portfolio.holdings) {
      const quote = quotes[holding.symbol] || {};
      const shares = parseFloat(holding.shares) || 0;
      const avgCost = parseFloat(holding.avgCost) || 0;
      const price = parseFloat(quote.price) || avgCost;
      const prevClose = parseFloat(quote.previousClose) || price;

      totalValue += shares * price;
      totalCost += shares * avgCost;
      dayChange += shares * (price - prevClose);
    }

    // Add cash balance
    totalValue += parseFloat(portfolio.cashBalance) || 0;

    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const dayChangePct = (totalValue - dayChange) > 0
      ? (dayChange / (totalValue - dayChange)) * 100
      : 0;

    // Create snapshot record
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        portfolioId,
        snapshotDate: new Date(),
        totalValue,
        totalCost,
        totalGain,
        totalGainPct,
        dayChange,
        dayChangePct,
        holdingsCount: portfolio.holdings.length,
        cashBalance: parseFloat(portfolio.cashBalance) || 0,
        metadata: JSON.stringify({
          holdings: portfolio.holdings.map(h => ({
            symbol: h.symbol,
            shares: h.shares,
            avgCost: h.avgCost,
            currentPrice: quotes[h.symbol]?.price || h.avgCost
          }))
        })
      }
    });

    logger.info(`Snapshot created for portfolio ${portfolioId}: $${totalValue.toFixed(2)}`);

    return {
      snapshotId: snapshot.id,
      portfolioId,
      totalValue,
      totalGain,
      totalGainPct,
      createdAt: snapshot.snapshotDate
    };
  } catch (error) {
    logger.error(`Snapshot creation failed for ${portfolioId}:`, error.message);
    throw error;
  }
});

// Cleanup old jobs every hour
setInterval(() => {
  jobQueue.cleanup();
}, 3600000);

module.exports = jobQueue;
