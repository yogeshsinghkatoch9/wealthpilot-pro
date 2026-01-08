/**
 * WealthPilot Pro - Mobile Gesture Handler
 * Native app-like touch interactions with haptic feedback
 * Handles swipe gestures, pull-to-refresh, bottom sheets, and offline mode
 */

class MobileGestureHandler {
  constructor(options = {}) {
    this.options = {
      swipeThreshold: 80,
      pullToRefreshThreshold: 80,
      hapticFeedback: true,
      ...options
    };

    this.isMobile = this.detectMobile();
    this.isOnline = navigator.onLine;
    this.activeSwipeElement = null;
    this.pullRefreshActive = false;

    // Bind methods
    this.handleOfflineStatus = this.handleOfflineStatus.bind(this);

    this.init();
  }

  /**
   * Detect mobile device
   */
  detectMobile() {
    return window.matchMedia('(max-width: 768px)').matches ||
           'ontouchstart' in window ||
           navigator.maxTouchPoints > 0;
  }

  /**
   * Initialize gesture handlers
   */
  init() {
    // Setup viewport height fix for mobile browsers
    this.setupViewportHeight();
    window.addEventListener('resize', () => this.setupViewportHeight());

    // Setup touch feedback
    this.setupTouchFeedback();

    // Register service worker
    this.registerServiceWorker();
  }

  /**
   * Fix for mobile viewport height (100vh issue)
   */
  setupViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  /**
   * Add touch feedback to interactive elements
   */
  setupTouchFeedback() {
    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest('button, a, .touch-feedback, .mobile-card, .holding-item, .quick-action-tile');
      if (target && !target.classList.contains('no-feedback')) {
        target.classList.add('touching');
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      document.querySelectorAll('.touching').forEach(el => {
        el.classList.remove('touching');
      });
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
      document.querySelectorAll('.touching').forEach(el => {
        el.classList.remove('touching');
      });
    }, { passive: true });
  }

  /**
   * Trigger haptic feedback
   */
  haptic(type = 'light') {
    if (!this.options.hapticFeedback || !('vibrate' in navigator)) return;

    const patterns = {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [10, 50, 10],
      error: [50, 30, 50],
      warning: [30, 30]
    };

    navigator.vibrate(patterns[type] || patterns.light);
  }

  /**
   * Initialize swipeable portfolio cards
   */
  initSwipeableCards() {
    const container = document.getElementById('portfolioCardsContainer');
    if (!container) return;

    let startX = 0;
    let scrollLeft = 0;
    let isDragging = false;
    let startTime = 0;

    container.addEventListener('touchstart', (e) => {
      isDragging = true;
      startX = e.touches[0].pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      startTime = Date.now();
      container.style.scrollBehavior = 'auto';
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const x = e.touches[0].pageX - container.offsetLeft;
      const walk = (x - startX) * 1.5;
      container.scrollLeft = scrollLeft - walk;
    }, { passive: true });

    container.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      container.style.scrollBehavior = 'smooth';

      // Snap to nearest card
      const cardWidth = container.querySelector('.mobile-card')?.offsetWidth || 260;
      const gap = 12;
      const scrollPosition = container.scrollLeft;
      const cardIndex = Math.round(scrollPosition / (cardWidth + gap));

      container.scrollLeft = cardIndex * (cardWidth + gap);

      // Update indicators
      this.updateSwipeIndicators(cardIndex);

      // Light haptic on snap
      this.haptic('light');
    }, { passive: true });

    // Initialize scroll indicator updates
    container.addEventListener('scroll', () => {
      const cardWidth = container.querySelector('.mobile-card')?.offsetWidth || 260;
      const gap = 12;
      const cardIndex = Math.round(container.scrollLeft / (cardWidth + gap));
      this.updateSwipeIndicators(cardIndex);
    }, { passive: true });
  }

  /**
   * Update swipe indicators
   */
  updateSwipeIndicators(activeIndex) {
    const indicators = document.querySelectorAll('#portfolioIndicators .swipe-dot');
    indicators.forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  /**
   * Initialize pull-to-refresh functionality
   */
  initPullToRefresh() {
    const container = document.getElementById('pullRefreshContainer');
    const indicator = document.getElementById('pullRefresh');

    if (!container || !indicator) return;

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isRefreshing = false;

    container.addEventListener('touchstart', (e) => {
      if (isRefreshing) return;
      if (window.scrollY === 0 && container.scrollTop === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!isPulling || isRefreshing) return;

      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && window.scrollY === 0) {
        const progress = Math.min(diff / this.options.pullToRefreshThreshold, 1.5);
        const translateY = Math.min(diff * 0.5, 80);

        indicator.style.transform = `translateX(-50%) translateY(${translateY}px)`;
        indicator.classList.add('pulling');

        // Update text based on progress
        const textEl = indicator.querySelector('.pull-refresh-text');
        if (textEl) {
          textEl.textContent = progress >= 1 ? 'Release to refresh' : 'Pull to refresh';
        }

        // Rotate spinner based on progress
        const spinner = indicator.querySelector('.pull-refresh-spinner');
        if (spinner) {
          spinner.style.transform = `rotate(${progress * 360}deg)`;
        }

        // Prevent default scrolling when pulling
        if (diff > 10) {
          e.preventDefault();
        }
      }
    }, { passive: false });

    container.addEventListener('touchend', async () => {
      if (!isPulling) return;
      isPulling = false;

      const diff = currentY - startY;
      const textEl = indicator.querySelector('.pull-refresh-text');

      if (diff > this.options.pullToRefreshThreshold) {
        // Trigger refresh
        isRefreshing = true;
        this.haptic('medium');

        indicator.classList.add('refreshing');
        if (textEl) textEl.textContent = 'Refreshing...';

        try {
          await this.refreshData();
          this.haptic('success');
          if (textEl) textEl.textContent = 'Done!';
          await this.delay(500);
          window.location.reload();
        } catch (err) {
          this.haptic('error');
          if (textEl) textEl.textContent = 'Failed to refresh';
          await this.delay(1500);
        }

        isRefreshing = false;
      }

      // Reset indicator
      indicator.style.transform = '';
      indicator.classList.remove('pulling', 'refreshing');
      if (textEl) textEl.textContent = 'Pull to refresh';

      const spinner = indicator.querySelector('.pull-refresh-spinner');
      if (spinner) spinner.style.transform = '';

      startY = 0;
      currentY = 0;
    }, { passive: true });
  }

  /**
   * Initialize swipe actions for an element
   */
  initSwipeActions(element, leftAction, rightAction) {
    if (!element) return;

    const content = element.querySelector('.holding-content');
    if (!content) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    const maxSwipe = 100;

    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      content.style.transition = 'none';
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!isDragging) return;

      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));

      content.style.transform = `translateX(${limitedDiff}px)`;

      // Add visual feedback
      if (Math.abs(diff) > 20) {
        element.classList.add('swiping');
      }

      // Show appropriate action
      const leftActionEl = element.querySelector('.swipe-action-left');
      const rightActionEl = element.querySelector('.swipe-action-right');

      if (leftActionEl) {
        leftActionEl.style.opacity = diff > 0 ? Math.min(diff / this.options.swipeThreshold, 1) : 0;
      }
      if (rightActionEl) {
        rightActionEl.style.opacity = diff < 0 ? Math.min(Math.abs(diff) / this.options.swipeThreshold, 1) : 0;
      }
    }, { passive: true });

    element.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;

      content.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      const diff = currentX - startX;

      // Trigger action if threshold met
      if (diff > this.options.swipeThreshold && leftAction) {
        this.haptic('medium');
        content.style.transform = `translateX(${maxSwipe}px)`;
        setTimeout(() => {
          leftAction();
          this.resetSwipeElement(element);
        }, 150);
      } else if (diff < -this.options.swipeThreshold && rightAction) {
        this.haptic('medium');
        content.style.transform = `translateX(-${maxSwipe}px)`;
        setTimeout(() => {
          rightAction();
          this.resetSwipeElement(element);
        }, 150);
      } else {
        this.resetSwipeElement(element);
      }
    }, { passive: true });

    // Reset on touch cancel
    element.addEventListener('touchcancel', () => {
      this.resetSwipeElement(element);
    }, { passive: true });
  }

  /**
   * Reset swipe element to original position
   */
  resetSwipeElement(element) {
    const content = element.querySelector('.holding-content');
    if (content) {
      content.style.transform = '';
    }

    element.classList.remove('swiping');

    const leftActionEl = element.querySelector('.swipe-action-left');
    const rightActionEl = element.querySelector('.swipe-action-right');
    if (leftActionEl) leftActionEl.style.opacity = '0';
    if (rightActionEl) rightActionEl.style.opacity = '0';
  }

  /**
   * Initialize bottom sheet gestures
   */
  initBottomSheet(element) {
    if (!element) return;

    const handle = element.querySelector('.bottom-sheet-handle');
    if (!handle) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    const sheetHeight = element.offsetHeight;

    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      isDragging = true;
      element.style.transition = 'none';
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!isDragging) return;

      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0) {
        element.style.transform = `translateY(${diff}px)`;
        // Reduce opacity of overlay
        const overlay = document.querySelector('.bottom-sheet-overlay.visible');
        if (overlay) {
          overlay.style.opacity = 1 - (diff / sheetHeight);
        }
      }
    }, { passive: true });

    element.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;

      element.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)';

      const diff = currentY - startY;

      if (diff > 100) {
        // Close the sheet
        this.haptic('light');
        this.closeBottomSheet(element);
      } else {
        // Snap back
        element.style.transform = '';
        const overlay = document.querySelector('.bottom-sheet-overlay.visible');
        if (overlay) {
          overlay.style.opacity = '';
        }
      }

      startY = 0;
      currentY = 0;
    }, { passive: true });
  }

  /**
   * Close bottom sheet
   */
  closeBottomSheet(element) {
    element.classList.remove('visible');
    element.style.transform = '';

    const overlay = document.querySelector('.bottom-sheet-overlay.visible');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.style.opacity = '';
    }

    document.body.style.overflow = '';
  }

  /**
   * Handle offline mode detection
   */
  handleOfflineMode() {
    const indicator = document.getElementById('offlineIndicator');
    if (!indicator) return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.handleOfflineStatus();
      this.haptic('success');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.handleOfflineStatus();
      this.haptic('warning');
    });

    // Initial check
    this.handleOfflineStatus();
  }

  /**
   * Update offline status indicator
   */
  handleOfflineStatus() {
    const indicator = document.getElementById('offlineIndicator');
    if (!indicator) return;

    if (this.isOnline) {
      indicator.classList.remove('visible');
    } else {
      indicator.classList.add('visible');
    }
  }

  /**
   * Register service worker for offline support
   */
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('[MobileGestures] Service Worker registered:', registration.scope);

          // Handle updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available
                  this.showUpdateNotification();
                }
              };
            }
          };
        } catch (err) {
          console.log('[MobileGestures] Service Worker registration failed:', err);
        }
      });
    }
  }

  /**
   * Show update notification
   */
  showUpdateNotification() {
    if (typeof showToast === 'function') {
      showToast('New version available! Tap to refresh.', 'info', {
        duration: 10000,
        onClick: () => window.location.reload()
      });
    }
  }

  /**
   * Refresh data from server
   */
  async refreshData() {
    const token = localStorage.getItem('wealthpilot_token') || '';

    const response = await fetch('/api/refresh-prices', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    return response.json();
  }

  /**
   * Utility: Delay promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize chart touch interactions
   */
  initChartTouch(chartElement, tooltipElement) {
    if (!chartElement || !tooltipElement) return;

    let isDragging = false;

    chartElement.addEventListener('touchstart', () => {
      isDragging = true;
      tooltipElement.classList.add('visible');
    }, { passive: true });

    chartElement.addEventListener('touchmove', (e) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const rect = chartElement.getBoundingClientRect();
      const x = touch.clientX - rect.left;

      // Position tooltip
      tooltipElement.style.left = `${x}px`;

      // Light haptic on movement
      if (Math.random() < 0.1) {
        this.haptic('light');
      }
    }, { passive: true });

    chartElement.addEventListener('touchend', () => {
      isDragging = false;
      setTimeout(() => {
        tooltipElement.classList.remove('visible');
      }, 1500);
    }, { passive: true });
  }

  /**
   * Initialize long press for context menu
   */
  initLongPress(element, callback, duration = 500) {
    if (!element) return;

    let timer = null;
    let isLongPress = false;

    element.addEventListener('touchstart', (e) => {
      timer = setTimeout(() => {
        isLongPress = true;
        this.haptic('heavy');
        callback(e);
      }, duration);
    }, { passive: true });

    element.addEventListener('touchmove', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      // Prevent click if long press was triggered
      if (isLongPress) {
        e.preventDefault();
        isLongPress = false;
      }
    });
  }

  /**
   * Initialize double tap to zoom/action
   */
  initDoubleTap(element, callback) {
    if (!element) return;

    let lastTap = 0;
    const doubleTapDelay = 300;

    element.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;

      if (tapLength < doubleTapDelay && tapLength > 0) {
        this.haptic('medium');
        callback(e);
        e.preventDefault();
      }

      lastTap = currentTime;
    });
  }

  /**
   * Initialize pinch to zoom
   */
  initPinchZoom(element, options = {}) {
    if (!element) return;

    const {
      minScale = 1,
      maxScale = 3,
      onZoom = null
    } = options;

    let initialDistance = 0;
    let currentScale = 1;

    element.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        initialDistance = this.getDistance(e.touches[0], e.touches[1]);
      }
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) return;

      const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
      const scale = (currentDistance / initialDistance) * currentScale;
      const clampedScale = Math.min(maxScale, Math.max(minScale, scale));

      element.style.transform = `scale(${clampedScale})`;

      if (onZoom) {
        onZoom(clampedScale);
      }
    }, { passive: true });

    element.addEventListener('touchend', () => {
      const transform = element.style.transform;
      const match = transform.match(/scale\(([\d.]+)\)/);
      if (match) {
        currentScale = parseFloat(match[1]);
      }
    }, { passive: true });
  }

  /**
   * Get distance between two touch points
   */
  getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Destroy gesture handlers
   */
  destroy() {
    // Clean up event listeners if needed
    window.removeEventListener('online', this.handleOfflineStatus);
    window.removeEventListener('offline', this.handleOfflineStatus);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MobileGestureHandler;
}

// Create global instance
window.MobileGestureHandler = MobileGestureHandler;

// Auto-initialize on DOMContentLoaded if on mobile
document.addEventListener('DOMContentLoaded', () => {
  const isMobile = window.matchMedia('(max-width: 768px)').matches ||
                   'ontouchstart' in window ||
                   navigator.maxTouchPoints > 0;

  if (isMobile && !window.mobileGestures) {
    window.mobileGestures = new MobileGestureHandler();
  }
});
