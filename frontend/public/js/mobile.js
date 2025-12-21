/**
 * Mobile Experience Enhancements
 * Bottom sheets, pull-to-refresh, haptic feedback, and swipe gestures
 */

class MobileExperience {
  constructor() {
    this.isMobile = this.detectMobile();
    this.bottomSheets = new Map();
    this.pullToRefresh = null;
    this.fabMenu = null;

    if (this.isMobile) {
      this.init();
    }
  }

  detectMobile() {
    return window.matchMedia('(max-width: 768px)').matches ||
           'ontouchstart' in window ||
           navigator.maxTouchPoints > 0;
  }

  init() {
    this.setupViewportHeight();
    this.setupTouchFeedback();
    this.setupHapticFeedback();
    window.addEventListener('resize', () => this.setupViewportHeight());
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
      const target = e.target.closest('button, a, .touch-feedback');
      if (target) {
        target.classList.add('touching');
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      document.querySelectorAll('.touching').forEach(el => {
        el.classList.remove('touching');
      });
    }, { passive: true });
  }

  /**
   * Setup haptic feedback support
   */
  setupHapticFeedback() {
    if (!('vibrate' in navigator)) return;

    document.addEventListener('click', (e) => {
      const target = e.target.closest('.haptic-light, .haptic-medium, .haptic-heavy');
      if (!target) return;

      if (target.classList.contains('haptic-light')) {
        navigator.vibrate(10);
      } else if (target.classList.contains('haptic-medium')) {
        navigator.vibrate(25);
      } else if (target.classList.contains('haptic-heavy')) {
        navigator.vibrate(50);
      }
    });
  }

  /**
   * Create a bottom sheet
   */
  createBottomSheet(options = {}) {
    const {
      id = `bottom-sheet-${Date.now()}`,
      title = '',
      content = '',
      onClose = null
    } = options;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.id = `${id}-overlay`;

    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet';
    sheet.id = id;
    sheet.innerHTML = `
      <div class="bottom-sheet-handle"></div>
      <div class="bottom-sheet-header">
        <h2 class="bottom-sheet-title">${title}</h2>
        <button class="bottom-sheet-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>
      <div class="bottom-sheet-content">${content}</div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    // Setup gestures
    this.setupBottomSheetGestures(sheet, overlay, id, onClose);

    // Store reference
    this.bottomSheets.set(id, { sheet, overlay, onClose });

    return {
      open: () => this.openBottomSheet(id),
      close: () => this.closeBottomSheet(id),
      setContent: (html) => {
        sheet.querySelector('.bottom-sheet-content').innerHTML = html;
      }
    };
  }

  setupBottomSheetGestures(sheet, overlay, id, onClose) {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handle = sheet.querySelector('.bottom-sheet-handle');
    const closeBtn = sheet.querySelector('.bottom-sheet-close');

    // Handle drag
    const onTouchStart = (e) => {
      startY = e.touches[0].clientY;
      isDragging = true;
      sheet.style.transition = 'none';
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
      }
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      sheet.style.transition = '';

      const diff = currentY - startY;
      if (diff > 100) {
        this.closeBottomSheet(id);
      } else {
        sheet.style.transform = 'translateY(0)';
      }
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd, { passive: true });

    // Close button
    closeBtn.addEventListener('click', () => this.closeBottomSheet(id));

    // Overlay click
    overlay.addEventListener('click', () => this.closeBottomSheet(id));
  }

  openBottomSheet(id) {
    const data = this.bottomSheets.get(id);
    if (!data) return;

    data.overlay.classList.add('visible');
    data.sheet.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  closeBottomSheet(id) {
    const data = this.bottomSheets.get(id);
    if (!data) return;

    data.overlay.classList.remove('visible');
    data.sheet.classList.remove('visible');
    document.body.style.overflow = '';

    if (data.onClose) {
      data.onClose();
    }
  }

  /**
   * Create pull-to-refresh
   */
  createPullToRefresh(options = {}) {
    const {
      container = document.body,
      onRefresh = null,
      threshold = 80
    } = options;

    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'pull-to-refresh';
    indicator.innerHTML = `
      <div class="pull-to-refresh-spinner"></div>
      <span class="pull-to-refresh-text">Release to refresh</span>
    `;
    container.insertBefore(indicator, container.firstChild);

    let startY = 0;
    let pulling = false;
    let refreshing = false;

    container.addEventListener('touchstart', (e) => {
      if (refreshing) return;
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!pulling || refreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && window.scrollY === 0) {
        const progress = Math.min(diff / threshold, 1);
        indicator.style.transform = `translateY(${Math.min(diff * 0.5, 60)}px)`;
        indicator.classList.add('pulling');
      }
    }, { passive: true });

    container.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;

      const transform = indicator.style.transform;
      const match = transform.match(/translateY\(([\d.]+)px\)/);
      const distance = match ? parseFloat(match[1]) : 0;

      if (distance >= 50 && onRefresh) {
        refreshing = true;
        indicator.querySelector('.pull-to-refresh-text').textContent = 'Refreshing...';

        try {
          await onRefresh();
        } catch (err) {
          console.error('Refresh failed:', err);
        }

        refreshing = false;
      }

      indicator.classList.remove('pulling');
      indicator.style.transform = '';
      indicator.querySelector('.pull-to-refresh-text').textContent = 'Release to refresh';
    }, { passive: true });

    this.pullToRefresh = { indicator, container };
  }

  /**
   * Create floating action button with menu
   */
  createFAB(options = {}) {
    const {
      icon = '+',
      menuItems = []
    } = options;

    // Create FAB
    const fab = document.createElement('button');
    fab.className = 'fab haptic-medium';
    fab.innerHTML = `
      <svg class="fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    `;

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'fab-menu';
    menu.innerHTML = menuItems.map(item => `
      <a href="${item.href || '#'}" class="fab-menu-item" ${item.onClick ? `onclick="${item.onClick}"` : ''}>
        <div class="fab-menu-icon">
          ${item.icon || ''}
        </div>
        <span class="fab-menu-label">${item.label}</span>
      </a>
    `).join('');

    document.body.appendChild(fab);
    document.body.appendChild(menu);

    let isOpen = false;

    fab.addEventListener('click', () => {
      isOpen = !isOpen;
      menu.classList.toggle('visible', isOpen);
      fab.style.transform = isOpen ? 'rotate(45deg)' : '';
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!fab.contains(e.target) && !menu.contains(e.target)) {
        isOpen = false;
        menu.classList.remove('visible');
        fab.style.transform = '';
      }
    });

    this.fabMenu = { fab, menu };
    return { fab, menu };
  }

  /**
   * Create swipeable list item
   */
  makeSwipeable(element, options = {}) {
    const {
      leftAction = null,
      rightAction = null,
      threshold = 80
    } = options;

    element.classList.add('swipeable');

    const content = element.innerHTML;
    element.innerHTML = `
      ${leftAction ? `
        <div class="swipeable-action swipeable-action-left">
          <span class="swipeable-action-icon">${leftAction.icon || ''}</span>
        </div>
      ` : ''}
      <div class="swipeable-content">${content}</div>
      ${rightAction ? `
        <div class="swipeable-action swipeable-action-right">
          <span class="swipeable-action-icon">${rightAction.icon || ''}</span>
        </div>
      ` : ''}
    `;

    const contentEl = element.querySelector('.swipeable-content');
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      contentEl.style.transition = 'none';
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;

      // Limit swipe distance
      const maxSwipe = 100;
      const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));

      contentEl.style.transform = `translateX(${limitedDiff}px)`;
    }, { passive: true });

    element.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      contentEl.style.transition = '';

      const diff = currentX - startX;

      if (diff > threshold && leftAction?.onSwipe) {
        leftAction.onSwipe();
      } else if (diff < -threshold && rightAction?.onSwipe) {
        rightAction.onSwipe();
      }

      contentEl.style.transform = '';
    }, { passive: true });
  }
}

// Global instance
window.mobileExperience = new MobileExperience();

// Convenience functions
window.createBottomSheet = (options) => window.mobileExperience.createBottomSheet(options);
window.createPullToRefresh = (options) => window.mobileExperience.createPullToRefresh(options);
window.createFAB = (options) => window.mobileExperience.createFAB(options);
window.makeSwipeable = (el, options) => window.mobileExperience.makeSwipeable(el, options);
