/**
 * Toast Notification System
 * Elegant, non-intrusive notifications
 */

class ToastManager {
  constructor(options = {}) {
    this.position = options.position || 'top-right';
    this.duration = options.duration || 4000;
    this.maxToasts = options.maxToasts || 5;
    this.toasts = [];
    this.container = null;
    this.init();
  }

  init() {
    // Create container if it doesn't exist
    if (!document.getElementById('toast-container')) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = this.position;
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('toast-container');
    }
  }

  /**
   * Show toast notification
   * @param {Object} options - Toast options
   * @returns {string} Toast ID
   */
  show(options) {
    const {
      type = 'info',
      title,
      message,
      duration = this.duration,
      icon,
      action,
      onAction,
      dismissible = true,
      position = this.position
    } = options;

    // Update container position if different
    if (position !== this.position) {
      this.container.className = position;
      this.position = position;
    }

    // Remove oldest toast if max reached
    if (this.toasts.length >= this.maxToasts) {
      this.remove(this.toasts[0].id);
    }

    // Create toast element
    const toast = this.createToast({
      type,
      title,
      message,
      icon,
      action,
      onAction,
      dismissible,
      duration
    });

    // Add to container
    this.container.appendChild(toast.element);
    this.toasts.push(toast);

    // Auto dismiss if duration is set
    if (duration && duration > 0) {
      toast.timeout = setTimeout(() => {
        this.remove(toast.id);
      }, duration);
    }

    return toast.id;
  }

  /**
   * Create toast element
   */
  createToast(options) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const element = document.createElement('div');
    element.className = `toast ${options.type}`;
    element.id = id;
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'assertive');
    element.setAttribute('aria-atomic', 'true');

    // Icon
    const iconHTML = options.icon || this.getDefaultIcon(options.type);
    const iconElement = `
      <div class="toast-icon">
        ${iconHTML}
      </div>
    `;

    // Content
    const contentHTML = `
      <div class="toast-content">
        ${options.title ? `<div class="toast-title">${options.title}</div>` : ''}
        ${options.message ? `<div class="toast-message">${options.message}</div>` : ''}
      </div>
    `;

    // Action button
    const actionHTML = options.action ? `
      <button class="toast-action" data-action="true">
        ${options.action}
      </button>
    ` : '';

    // Close button
    const closeHTML = options.dismissible ? `
      <button class="toast-close" aria-label="Close" data-close="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4l8 8M12 4l-8 8"/>
        </svg>
      </button>
    ` : '';

    // Progress bar
    const progressHTML = options.duration ? `
      <div class="toast-progress" style="animation-duration: ${options.duration}ms;"></div>
    ` : '';

    element.innerHTML = iconElement + contentHTML + actionHTML + closeHTML + progressHTML;

    // Event listeners
    if (options.dismissible) {
      const closeBtn = element.querySelector('[data-close]');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(id);
      });
    }

    if (options.action && options.onAction) {
      const actionBtn = element.querySelector('[data-action]');
      actionBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onAction();
        this.remove(id);
      });
    }

    // Click to dismiss
    element.addEventListener('click', () => {
      if (options.dismissible) {
        this.remove(id);
      }
    });

    return { id, element, timeout: null };
  }

  /**
   * Get default icon for toast type
   */
  getDefaultIcon(type) {
    const icons = {
      success: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
      `,
      error: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
      `,
      warning: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
      `,
      info: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
      `,
      loading: `<div class="toast-spinner"></div>`
    };

    return icons[type] || icons.info;
  }

  /**
   * Remove toast
   */
  remove(id) {
    const toastIndex = this.toasts.findIndex(t => t.id === id);
    if (toastIndex === -1) return;

    const toast = this.toasts[toastIndex];

    // Clear timeout
    if (toast.timeout) {
      clearTimeout(toast.timeout);
    }

    // Add exit animation
    toast.element.classList.add('toast-exiting');

    // Remove after animation
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.splice(toastIndex, 1);
    }, 200);
  }

  /**
   * Remove all toasts
   */
  clear() {
    this.toasts.forEach(toast => {
      if (toast.timeout) {
        clearTimeout(toast.timeout);
      }
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
    });
    this.toasts = [];
  }

  /**
   * Update toast
   */
  update(id, options) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast) return;

    // Update content
    if (options.title) {
      const titleEl = toast.element.querySelector('.toast-title');
      if (titleEl) titleEl.textContent = options.title;
    }

    if (options.message) {
      const messageEl = toast.element.querySelector('.toast-message');
      if (messageEl) messageEl.textContent = options.message;
    }

    if (options.type) {
      toast.element.className = `toast ${options.type}`;
    }
  }

  // Convenience methods
  success(message, options = {}) {
    return this.show({ type: 'success', message, ...options });
  }

  error(message, options = {}) {
    return this.show({ type: 'error', message, ...options });
  }

  warning(message, options = {}) {
    return this.show({ type: 'warning', message, ...options });
  }

  info(message, options = {}) {
    return this.show({ type: 'info', message, ...options });
  }

  loading(message, options = {}) {
    return this.show({ type: 'loading', message, duration: 0, dismissible: false, ...options });
  }

  promise(promise, messages = {}) {
    const loadingId = this.loading(messages.loading || 'Loading...');

    return promise
      .then(result => {
        this.remove(loadingId);
        this.success(messages.success || 'Success!');
        return result;
      })
      .catch(error => {
        this.remove(loadingId);
        this.error(messages.error || 'Something went wrong');
        throw error;
      });
  }
}

// Global instance
window.toastManager = new ToastManager();

// Convenience global functions
window.toast = {
  success: (message, options) => window.toastManager.success(message, options),
  error: (message, options) => window.toastManager.error(message, options),
  warning: (message, options) => window.toastManager.warning(message, options),
  info: (message, options) => window.toastManager.info(message, options),
  loading: (message, options) => window.toastManager.loading(message, options),
  promise: (promise, messages) => window.toastManager.promise(promise, messages),
  remove: (id) => window.toastManager.remove(id),
  clear: () => window.toastManager.clear()
};

// Example usage:
// toast.success('Portfolio updated successfully!');
// toast.error('Failed to load data', { duration: 6000 });
// toast.warning('Market is closed', { title: 'Warning' });
// toast.info('New feature available', { action: 'Learn More', onAction: () => console.log('clicked') });
//
// const loadingId = toast.loading('Saving...');
// // ... do something
// toast.remove(loadingId);
// toast.success('Saved!');
//
// toast.promise(
//   fetch('/api/portfolio'),
//   {
//     loading: 'Loading portfolio...',
//     success: 'Portfolio loaded!',
//     error: 'Failed to load portfolio'
//   }
// );
