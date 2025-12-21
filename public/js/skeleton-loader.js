/**
 * Skeleton Loader Utility
 * Manages showing/hiding skeleton loading states
 */

class SkeletonLoader {
  constructor() {
    this.skeletons = new Map();
  }

  /**
   * Show skeleton for a container
   * @param {string} containerId - ID of the container
   * @param {string} skeletonHTML - HTML content of the skeleton
   */
  show(containerId, skeletonHTML) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container #${containerId} not found`);
      return;
    }

    // Store original content
    if (!this.skeletons.has(containerId)) {
      this.skeletons.set(containerId, container.innerHTML);
    }

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

    // Add fade-out animation
    const skeletonElements = container.querySelectorAll('.skeleton, .skeleton-card');
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
   * Show skeleton while fetching data
   * @param {string} containerId - ID of the container
   * @param {string} skeletonHTML - HTML content of the skeleton
   * @param {Function} fetchFn - Async function to fetch data
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
      `
    };

    const template = templates[type] || templates.card;
    return template.repeat(count);
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

// Example usage:
// showSkeleton('holdings-container', 'table', 5);
//
// fetch('/api/holdings')
//   .then(res => res.json())
//   .then(data => {
//     const html = renderHoldings(data);
//     hideSkeleton('holdings-container', html);
//   });
