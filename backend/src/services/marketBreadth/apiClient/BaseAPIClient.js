/**
 * Base API Client with Rate Limiting and Error Handling
 * Provides foundation for all market data API integrations
 */

const axios = require('axios');
const EventEmitter = require('events');

const logger = require('../../../utils/logger');
class RateLimiter extends EventEmitter {
  constructor(requestsPerMinute) {
    super();
    this.requestsPerMinute = requestsPerMinute;
    this.requests = [];
    this.queue = [];
  }

  async throttle() {
    const now = Date.now();

    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => now - time < 60000);

    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer

      this.emit('rateLimit', { waitTime, provider: this.providerName });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle();
    }

    this.requests.push(now);
    return true;
  }

  reset() {
    this.requests = [];
  }
}

class BaseAPIClient {
  constructor(config) {
    this.providerName = config.providerName;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.rateLimiter = new RateLimiter(config.requestsPerMinute);
    this.timeout = config.timeout || 10000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Axios instance with default config
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WealthPilot-MarketBreadth/1.0'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      config => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      error => Promise.reject(error)
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      response => {
        const duration = Date.now() - response.config.metadata.startTime;
        this.logAPICall(response.config.url, true, duration);
        return response;
      },
      error => {
        if (error.config && error.config.metadata) {
          const duration = Date.now() - error.config.metadata.startTime;
          this.logAPICall(error.config.url, false, duration, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a rate-limited API request with retry logic
   */
  async request(method, endpoint, params = {}, options = {}) {
    await this.rateLimiter.throttle();

    const retries = options.retries || 0;

    try {
      const config = {
        method,
        url: endpoint,
        ...options
      };

      if (method.toLowerCase() === 'get') {
        config.params = params;
      } else {
        config.data = params;
      }

      const response = await this.client.request(config);
      return this.parseResponse(response.data);

    } catch (error) {
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        logger.debug(`[${this.providerName}] Retrying request (${retries + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
        return this.request(method, endpoint, params, { ...options, retries: retries + 1 });
      }

      throw this.handleError(error);
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}, options = {}) {
    return this.request('GET', endpoint, params, options);
  }

  /**
   * POST request
   */
  async post(endpoint, data = {}, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * Parse API response (override in subclasses for provider-specific parsing)
   */
  parseResponse(data) {
    return data;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    if (!error.response) return true; // Network error, retry

    const status = error.response.status;
    return status === 429 || status >= 500; // Rate limit or server error
  }

  /**
   * Handle and standardize errors
   */
  handleError(error) {
    const standardError = {
      provider: this.providerName,
      timestamp: new Date().toISOString(),
      message: 'Unknown error'
    };

    if (error.response) {
      // Server responded with error
      standardError.status = error.response.status;
      standardError.message = error.response.data?.message || error.response.statusText;
      standardError.data = error.response.data;
    } else if (error.request) {
      // Request made but no response
      standardError.message = 'No response from server';
      standardError.code = 'NO_RESPONSE';
    } else {
      // Error setting up request
      standardError.message = error.message;
      standardError.code = 'REQUEST_SETUP_ERROR';
    }

    logger.error(`[${this.providerName}] API Error:`, standardError);
    return new Error(JSON.stringify(standardError));
  }

  /**
   * Log API call for monitoring (will be saved to database)
   */
  logAPICall(endpoint, success, responseTime, errorMessage = null) {
    const logEntry = {
      provider: this.providerName,
      endpoint,
      success,
      responseTime,
      errorMessage,
      timestamp: new Date().toISOString()
    };

    // Emit event for logging service to catch
    this.rateLimiter.emit('apiCall', logEntry);
  }

  /**
   * Get rate limiter stats
   */
  getRateLimiterStats() {
    return {
      provider: this.providerName,
      requestsInLastMinute: this.rateLimiter.requests.length,
      maxRequestsPerMinute: this.rateLimiter.requestsPerMinute,
      available: this.rateLimiter.requestsPerMinute - this.rateLimiter.requests.length
    };
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimiter() {
    this.rateLimiter.reset();
  }
}

module.exports = BaseAPIClient;
