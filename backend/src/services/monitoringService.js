/**
 * Monitoring & APM Service
 * Provides health checks, metrics, and alerting
 */

const os = require('os');
const logger = require('../utils/logger');

class MonitoringService {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: { total: 0, success: 0, error: 0 },
      responseTime: { total: 0, count: 0, min: Infinity, max: 0 },
      errors: [],
      endpoints: {}
    };
  }

  // Record request metrics
  recordRequest(req, res, duration) {
    this.metrics.requests.total++;

    if (res.statusCode >= 400) {
      this.metrics.requests.error++;
    } else {
      this.metrics.requests.success++;
    }

    // Response time tracking
    this.metrics.responseTime.total += duration;
    this.metrics.responseTime.count++;
    this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, duration);
    this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, duration);

    // Per-endpoint tracking
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    if (!this.metrics.endpoints[endpoint]) {
      this.metrics.endpoints[endpoint] = { count: 0, totalTime: 0, errors: 0 };
    }
    this.metrics.endpoints[endpoint].count++;
    this.metrics.endpoints[endpoint].totalTime += duration;
    if (res.statusCode >= 400) {
      this.metrics.endpoints[endpoint].errors++;
    }
  }

  // Record error
  recordError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context
    };

    this.metrics.errors.push(errorEntry);

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }

    logger.error('Monitoring captured error', errorEntry);
  }

  // Get system health
  getSystemHealth() {
    const memUsage = process.memoryUsage();
    const cpuUsage = os.loadavg();
    const uptime = Date.now() - this.startTime;

    return {
      status: 'healthy',
      uptime: {
        ms: uptime,
        formatted: this.formatUptime(uptime)
      },
      memory: {
        heapUsed: this.formatBytes(memUsage.heapUsed),
        heapTotal: this.formatBytes(memUsage.heapTotal),
        external: this.formatBytes(memUsage.external),
        rss: this.formatBytes(memUsage.rss),
        percentUsed: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2) + '%'
      },
      cpu: {
        load1m: cpuUsage[0].toFixed(2),
        load5m: cpuUsage[1].toFixed(2),
        load15m: cpuUsage[2].toFixed(2),
        cores: os.cpus().length
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: this.formatBytes(os.totalmem()),
        freeMemory: this.formatBytes(os.freemem())
      }
    };
  }

  // Get request metrics
  getRequestMetrics() {
    const avgResponseTime = this.metrics.responseTime.count > 0
      ? (this.metrics.responseTime.total / this.metrics.responseTime.count).toFixed(2)
      : 0;

    return {
      total: this.metrics.requests.total,
      success: this.metrics.requests.success,
      error: this.metrics.requests.error,
      successRate: this.metrics.requests.total > 0
        ? ((this.metrics.requests.success / this.metrics.requests.total) * 100).toFixed(2) + '%'
        : '100%',
      responseTime: {
        average: avgResponseTime + 'ms',
        min: this.metrics.responseTime.min === Infinity ? '0ms' : this.metrics.responseTime.min.toFixed(2) + 'ms',
        max: this.metrics.responseTime.max.toFixed(2) + 'ms'
      },
      topEndpoints: this.getTopEndpoints(10)
    };
  }

  // Get top endpoints by request count
  getTopEndpoints(limit = 10) {
    return Object.entries(this.metrics.endpoints)
      .map(([endpoint, data]) => ({
        endpoint,
        requests: data.count,
        avgResponseTime: (data.totalTime / data.count).toFixed(2) + 'ms',
        errorRate: ((data.errors / data.count) * 100).toFixed(2) + '%'
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }

  // Get recent errors
  getRecentErrors(limit = 10) {
    return this.metrics.errors.slice(-limit).reverse();
  }

  // Full dashboard data
  getDashboard() {
    return {
      timestamp: new Date().toISOString(),
      system: this.getSystemHealth(),
      requests: this.getRequestMetrics(),
      recentErrors: this.getRecentErrors(5)
    };
  }

  // Prometheus format metrics
  getPrometheusMetrics() {
    const memUsage = process.memoryUsage();
    const lines = [
      '# HELP wealthpilot_requests_total Total HTTP requests',
      '# TYPE wealthpilot_requests_total counter',
      `wealthpilot_requests_total{status="success"} ${this.metrics.requests.success}`,
      `wealthpilot_requests_total{status="error"} ${this.metrics.requests.error}`,
      '',
      '# HELP wealthpilot_response_time_ms Response time in milliseconds',
      '# TYPE wealthpilot_response_time_ms gauge',
      `wealthpilot_response_time_avg_ms ${this.metrics.responseTime.count > 0 ? (this.metrics.responseTime.total / this.metrics.responseTime.count).toFixed(2) : 0}`,
      '',
      '# HELP wealthpilot_memory_bytes Memory usage in bytes',
      '# TYPE wealthpilot_memory_bytes gauge',
      `wealthpilot_memory_heap_used_bytes ${memUsage.heapUsed}`,
      `wealthpilot_memory_heap_total_bytes ${memUsage.heapTotal}`,
      '',
      '# HELP wealthpilot_uptime_seconds Uptime in seconds',
      '# TYPE wealthpilot_uptime_seconds gauge',
      `wealthpilot_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`
    ];
    return lines.join('\n');
  }

  // Helper: Format bytes to human readable
  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  }

  // Helper: Format uptime
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Singleton instance
const monitoringService = new MonitoringService();

// Express middleware for request tracking
const requestMonitoringMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    monitoringService.recordRequest(req, res, duration);
  });

  next();
};

module.exports = {
  monitoringService,
  requestMonitoringMiddleware
};
