/**
 * Error Handler Utility
 * Provides structured error handling, retry logic, and offline detection
 */

class ErrorHandler {
  constructor() {
    this.isOnline = navigator.onLine;
    this.offlineBanner = null;
    this.retryQueue = new Map();
    this.errorCodes = {
      NETWORK_ERROR: { code: 'E001', message: 'Network connection failed' },
      SERVER_ERROR: { code: 'E002', message: 'Server error occurred' },
      AUTH_ERROR: { code: 'E003', message: 'Authentication required' },
      VALIDATION_ERROR: { code: 'E004', message: 'Invalid data provided' },
      NOT_FOUND: { code: 'E005', message: 'Resource not found' },
      RATE_LIMIT: { code: 'E006', message: 'Too many requests' },
      TIMEOUT: { code: 'E007', message: 'Request timed out' },
      UNKNOWN: { code: 'E999', message: 'An unexpected error occurred' }
    };

    this.init();
  }

  init() {
    // Monitor online/offline status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Create offline banner
    this.createOfflineBanner();

    // Check initial status
    if (!navigator.onLine) {
      this.handleOffline();
    }
  }

  createOfflineBanner() {
    if (document.getElementById('offline-banner')) {
      this.offlineBanner = document.getElementById('offline-banner');
      return;
    }

    this.offlineBanner = document.createElement('div');
    this.offlineBanner.id = 'offline-banner';
    this.offlineBanner.className = 'offline-banner';
    this.offlineBanner.innerHTML = `
      <svg class="offline-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
      <span class="offline-banner-text">You're offline. Some features may be unavailable.</span>
    `;
    document.body.appendChild(this.offlineBanner);
  }

  handleOnline() {
    this.isOnline = true;
    this.offlineBanner?.classList.remove('visible');

    // Show toast
    if (window.toast) {
      window.toast.success('Back online!', { duration: 3000 });
    }

    // Retry queued operations
    this.processRetryQueue();
  }

  handleOffline() {
    this.isOnline = false;
    this.offlineBanner?.classList.add('visible');

    // Show toast
    if (window.toast) {
      window.toast.warning('You\'re offline', { duration: 5000 });
    }
  }

  /**
   * Classify an error into a structured error type
   */
  classifyError(error, response = null) {
    if (!this.isOnline || error.message === 'Failed to fetch') {
      return { ...this.errorCodes.NETWORK_ERROR, originalError: error };
    }

    if (response) {
      switch (response.status) {
        case 401:
        case 403:
          return { ...this.errorCodes.AUTH_ERROR, originalError: error };
        case 404:
          return { ...this.errorCodes.NOT_FOUND, originalError: error };
        case 400:
        case 422:
          return { ...this.errorCodes.VALIDATION_ERROR, originalError: error };
        case 429:
          return { ...this.errorCodes.RATE_LIMIT, originalError: error };
        case 500:
        case 502:
        case 503:
          return { ...this.errorCodes.SERVER_ERROR, originalError: error };
        case 504:
          return { ...this.errorCodes.TIMEOUT, originalError: error };
      }
    }

    if (error.name === 'AbortError') {
      return { ...this.errorCodes.TIMEOUT, originalError: error };
    }

    return { ...this.errorCodes.UNKNOWN, originalError: error };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(classifiedError) {
    const messages = {
      E001: 'Unable to connect. Please check your internet connection and try again.',
      E002: 'Something went wrong on our end. Please try again in a moment.',
      E003: 'Your session has expired. Please log in again.',
      E004: 'Some information is missing or incorrect. Please check and try again.',
      E005: 'The requested item could not be found.',
      E006: 'You\'re making too many requests. Please wait a moment and try again.',
      E007: 'The request took too long. Please try again.',
      E999: 'Something unexpected happened. Please try again.'
    };

    return messages[classifiedError.code] || messages.E999;
  }

  /**
   * Handle an error with optional retry
   */
  handle(error, options = {}) {
    const {
      response = null,
      containerId = null,
      retryFn = null,
      showToast = true,
      title = null
    } = options;

    const classifiedError = this.classifyError(error, response);
    const userMessage = this.getUserMessage(classifiedError);

    // Show error in container if provided
    if (containerId && window.skeletonLoader) {
      const icon = classifiedError.code === 'E001' ? 'network' : 'error';
      window.skeletonLoader.showError(containerId, {
        title: title || classifiedError.message,
        message: userMessage,
        retryFn: retryFn,
        icon: icon
      });
    } else if (showToast && window.toast) {
      // Show toast notification
      const toastOptions = retryFn ? {
        duration: 8000,
        action: 'Retry',
        onAction: retryFn
      } : { duration: 5000 };

      window.toast.error(userMessage, toastOptions);
    }

    // Log error for debugging
    console.error(`[${classifiedError.code}] ${classifiedError.message}:`, error);

    return classifiedError;
  }

  /**
   * Wrap a fetch call with error handling
   */
  async fetchWithHandling(url, options = {}) {
    const {
      containerId = null,
      skeletonType = 'card',
      skeletonCount = 3,
      renderFn = null,
      retryable = true,
      timeout = 30000,
      ...fetchOptions
    } = options;

    // Show skeleton if container provided
    if (containerId && window.skeletonLoader) {
      const skeleton = window.skeletonLoader.createSkeleton(skeletonType, skeletonCount);
      window.skeletonLoader.show(containerId, skeleton);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        throw { error, response };
      }

      const data = await response.json();

      // Render content if function provided
      if (containerId && renderFn && window.skeletonLoader) {
        const html = renderFn(data);
        window.skeletonLoader.hide(containerId, html);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      const error = err.error || err;
      const response = err.response || null;

      const retryFn = retryable ? () => this.fetchWithHandling(url, options) : null;

      this.handle(error, {
        response,
        containerId,
        retryFn
      });

      throw error;
    }
  }

  /**
   * Add operation to retry queue (for offline mode)
   */
  queueForRetry(key, fn) {
    this.retryQueue.set(key, fn);
  }

  /**
   * Process queued retry operations
   */
  async processRetryQueue() {
    if (this.retryQueue.size === 0) return;

    const entries = [...this.retryQueue.entries()];
    this.retryQueue.clear();

    for (const [key, fn] of entries) {
      try {
        await fn();
      } catch (err) {
        console.error(`Retry failed for ${key}:`, err);
      }
    }
  }

  /**
   * Create a retry wrapper for any async function
   */
  withRetry(fn, options = {}) {
    const { maxRetries = 3, delay = 1000, backoff = 2 } = options;

    return async (...args) => {
      let lastError;
      let currentDelay = delay;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn(...args);
        } catch (error) {
          lastError = error;

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            currentDelay *= backoff;
          }
        }
      }

      throw lastError;
    };
  }
}

// Global instance
window.errorHandler = new ErrorHandler();

// Convenience functions
window.handleError = (error, options = {}) => window.errorHandler.handle(error, options);

window.fetchWithHandling = async (url, options = {}) => {
  return window.errorHandler.fetchWithHandling(url, options);
};

window.withRetry = (fn, options = {}) => {
  return window.errorHandler.withRetry(fn, options);
};
