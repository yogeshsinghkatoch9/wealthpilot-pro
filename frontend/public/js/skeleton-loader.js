/**
 * Skeleton Loader Utility
 * Manages showing/hiding skeleton loading states with smart templates
 */

class SkeletonLoader {
  constructor() {
    this.skeletons = new Map();
    this.activeLoaders = new Set();
    this.retryCallbacks = new Map();
  }

  /**
   * Show skeleton for a container
   * @param {string} containerId - ID of the container
   * @param {string} skeletonHTML - HTML content of the skeleton
   */
  show(containerId, skeletonHTML) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    // Store original content
    if (!this.skeletons.has(containerId)) {
      this.skeletons.set(containerId, container.innerHTML);
    }

    this.activeLoaders.add(containerId);

    // Show skeleton
    container.innerHTML = skeletonHTML;
    container.setAttribute('aria-busy', 'true');
    container.setAttribute('aria-live', 'polite');
  }

  /**
   * Hide skeleton and restore content
   * @param {string} containerId - ID of the container
   * @param {string} newContent - Optional new content to replace skeleton
   */
  hide(containerId, newContent = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    this.activeLoaders.delete(containerId);

    // Add fade-out animation
    const skeletonElements = container.querySelectorAll('.skeleton, .skeleton-card, .skeleton-portfolio-card, .skeleton-holdings-row');
    skeletonElements.forEach(el => {
      el.classList.add('skeleton-fade-out');
    });

    // Wait for animation, then restore content
    setTimeout(() => {
      if (newContent) {
        container.innerHTML = newContent;
      } else if (this.skeletons.has(containerId)) {
        container.innerHTML = this.skeletons.get(containerId);
        this.skeletons.delete(containerId);
      }

      container.removeAttribute('aria-busy');
    }, 300);
  }

  /**
   * Show error state with retry button
   * @param {string} containerId - ID of the container
   * @param {Object} options - Error options
   */
  showError(containerId, options = {}) {
    const {
      title = 'Something went wrong',
      message = 'Failed to load data. Please try again.',
      retryFn = null,
      icon = 'error'
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;

    this.activeLoaders.delete(containerId);

    const icons = {
      error: `<svg class="error-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
      network: `<svg class="error-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>`,
      empty: `<svg class="error-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`
    };

    const retryId = `retry-${containerId}-${Date.now()}`;
    if (retryFn) {
      this.retryCallbacks.set(retryId, retryFn);
    }

    container.innerHTML = `
      <div class="error-state">
        ${icons[icon] || icons.error}
        <h3 class="error-state-title">${title}</h3>
        <p class="error-state-message">${message}</p>
        ${retryFn ? `
          <button class="error-state-retry-btn" data-retry-id="${retryId}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Try Again
          </button>
        ` : ''}
      </div>
    `;

    container.removeAttribute('aria-busy');

    // Attach retry handler
    if (retryFn) {
      const retryBtn = container.querySelector(`[data-retry-id="${retryId}"]`);
      retryBtn?.addEventListener('click', () => {
        const callback = this.retryCallbacks.get(retryId);
        if (callback) {
          this.retryCallbacks.delete(retryId);
          callback();
        }
      });
    }
  }

  /**
   * Show skeleton while fetching data with error handling
   * @param {string} containerId - ID of the container
   * @param {string} skeletonType - Type of skeleton template
   * @param {Function} fetchFn - Async function to fetch data
   * @param {Function} renderFn - Function to render the data
   * @param {Object} options - Additional options
   */
  async fetchWithSkeleton(containerId, skeletonType, fetchFn, renderFn, options = {}) {
    const { count = 3, errorTitle, errorMessage } = options;
    const skeletonHTML = this.createSkeleton(skeletonType, count);
    this.show(containerId, skeletonHTML);

    try {
      const data = await fetchFn();
      const html = renderFn(data);
      this.hide(containerId, html);
      return data;
    } catch (error) {
      this.showError(containerId, {
        title: errorTitle || 'Failed to load',
        message: errorMessage || error.message || 'Please try again later.',
        retryFn: () => this.fetchWithSkeleton(containerId, skeletonType, fetchFn, renderFn, options)
      });
      throw error;
    }
  }

  /**
   * Show skeleton while fetching data (legacy)
   */
  async showWhileFetching(containerId, skeletonHTML, fetchFn) {
    this.show(containerId, skeletonHTML);

    try {
      const result = await fetchFn();
      return result;
    } finally {
      this.hide(containerId);
    }
  }

  /**
   * Create skeleton from template
   * @param {string} type - Skeleton template type
   * @param {number} count - Number of skeleton items
   * @returns {string} HTML string
   */
  createSkeleton(type, count = 1) {
    const templates = {
      // Basic templates
      card: `
        <div class="skeleton-card">
          <div class="skeleton-card-header">
            <div class="skeleton skeleton-line skeleton-w-1-3"></div>
          </div>
          <div class="skeleton-card-body">
            <div class="skeleton skeleton-line skeleton-w-full"></div>
            <div class="skeleton skeleton-line skeleton-w-3-4"></div>
            <div class="skeleton skeleton-line skeleton-w-1-2"></div>
          </div>
        </div>
      `,
      table: `
        <div class="skeleton-table-row">
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line"></div>
        </div>
      `,
      list: `
        <div class="flex items-center gap-4 p-4 border-b border-gray-700">
          <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
          <div class="flex-1">
            <div class="skeleton skeleton-line skeleton-w-1-2"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-3" style="margin-top: 4px;"></div>
          </div>
        </div>
      `,
      stat: `
        <div class="skeleton-stat-card">
          <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
          <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
          <div class="skeleton skeleton-line-sm skeleton-w-1-3"></div>
        </div>
      `,
      chart: `
        <div class="skeleton-chart"></div>
      `,

      // Page-specific templates
      portfolio: `
        <div class="skeleton-portfolio-card">
          <div class="skeleton-portfolio-header">
            <div style="flex: 1;">
              <div class="skeleton skeleton-line skeleton-w-1-3" style="margin-bottom: 8px;"></div>
              <div class="skeleton skeleton-line-sm skeleton-w-1-4"></div>
            </div>
            <div class="skeleton skeleton-rect" style="width: 80px; height: 32px;"></div>
          </div>
          <div class="skeleton-portfolio-metrics">
            <div>
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
            <div>
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
            <div>
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
          </div>
        </div>
      `,
      holding: `
        <div class="skeleton-holdings-row">
          <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-line skeleton-w-1-2" style="margin-bottom: 4px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-3"></div>
          </div>
          <div class="skeleton skeleton-line skeleton-w-full" style="width: 100px;"></div>
          <div class="skeleton skeleton-line skeleton-w-full" style="width: 80px;"></div>
          <div class="skeleton skeleton-line skeleton-w-full" style="width: 100px;"></div>
          <div class="skeleton skeleton-line skeleton-w-full" style="width: 80px;"></div>
          <div class="skeleton skeleton-rect" style="width: 60px; height: 28px;"></div>
        </div>
      `,
      dashboard: `
        <div class="skeleton-dashboard-widget">
          <div class="skeleton-card-header">
            <div class="skeleton skeleton-line skeleton-w-1-3"></div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px;">
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-2-3"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-full"></div>
            </div>
          </div>
        </div>
      `,
      stockDetail: `
        <div class="skeleton-stock-detail">
          <div style="display: flex; gap: 24px; margin-bottom: 24px;">
            <div class="skeleton skeleton-circle" style="width: 64px; height: 64px;"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-line-lg skeleton-w-1-3" style="margin-bottom: 8px;"></div>
              <div class="skeleton skeleton-line skeleton-w-1-4"></div>
            </div>
            <div style="text-align: right;">
              <div class="skeleton skeleton-line-lg skeleton-w-full" style="width: 120px; margin-bottom: 8px;"></div>
              <div class="skeleton skeleton-line skeleton-w-full" style="width: 80px;"></div>
            </div>
          </div>
          <div class="skeleton-chart" style="height: 400px; margin-bottom: 24px;"></div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
            </div>
            <div class="skeleton-stat-card">
              <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
              <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
            </div>
          </div>
        </div>
      `,
      watchlist: `
        <div class="skeleton-watchlist-item" style="display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--border-primary, #30363d);">
          <div class="skeleton skeleton-circle" style="width: 36px; height: 36px;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-line skeleton-w-1-3" style="margin-bottom: 4px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-4"></div>
          </div>
          <div style="text-align: right; width: 100px;">
            <div class="skeleton skeleton-line skeleton-w-full" style="margin-bottom: 4px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-2-3" style="margin-left: auto;"></div>
          </div>
        </div>
      `,
      alert: `
        <div class="skeleton-alert-item" style="display: flex; align-items: center; gap: 16px; padding: 16px; border-bottom: 1px solid var(--border-primary, #30363d);">
          <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-line skeleton-w-1-2" style="margin-bottom: 6px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-3-4"></div>
          </div>
          <div class="skeleton skeleton-rect" style="width: 60px; height: 28px;"></div>
        </div>
      `,
      transaction: `
        <div class="skeleton-transaction" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 6px; background: var(--bg-tertiary, #151c25);">
          <div class="skeleton skeleton-circle" style="width: 36px; height: 36px;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-line skeleton-w-1-2" style="margin-bottom: 4px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-3"></div>
          </div>
          <div style="text-align: right;">
            <div class="skeleton skeleton-line skeleton-w-full" style="width: 80px; margin-bottom: 4px;"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-full" style="width: 60px;"></div>
          </div>
        </div>
      `,
      news: `
        <div class="skeleton-news-item">
          <div class="skeleton skeleton-news-image skeleton-rect"></div>
          <div class="skeleton-news-content">
            <div class="skeleton skeleton-line skeleton-w-3-4"></div>
            <div class="skeleton skeleton-line skeleton-w-full"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-3"></div>
          </div>
        </div>
      `,
      kpi: `
        <div class="skeleton-kpi-item">
          <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
          <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
        </div>
      `
    };

    const template = templates[type] || templates.card;
    return template.repeat(count);
  }

  /**
   * Check if a container is currently loading
   */
  isLoading(containerId) {
    return this.activeLoaders.has(containerId);
  }

  /**
   * Show skeleton for API fetch
   */
  static showForFetch(containerId, skeletonType = 'card', count = 3) {
    const loader = new SkeletonLoader();
    const skeletonHTML = loader.createSkeleton(skeletonType, count);
    loader.show(containerId, skeletonHTML);
    return loader;
  }
}

// Global instance
window.skeletonLoader = new SkeletonLoader();

// Utility functions
window.showSkeleton = (containerId, type = 'card', count = 3) => {
  const skeleton = window.skeletonLoader.createSkeleton(type, count);
  window.skeletonLoader.show(containerId, skeleton);
};

window.hideSkeleton = (containerId, newContent = null) => {
  window.skeletonLoader.hide(containerId, newContent);
};

window.showError = (containerId, options = {}) => {
  window.skeletonLoader.showError(containerId, options);
};

window.fetchWithSkeleton = async (containerId, type, fetchFn, renderFn, options = {}) => {
  return window.skeletonLoader.fetchWithSkeleton(containerId, type, fetchFn, renderFn, options);
};
