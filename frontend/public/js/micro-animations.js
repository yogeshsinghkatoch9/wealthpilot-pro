/**
 * Micro-Animations Utility
 * Helper functions to trigger animations programmatically
 */

class MicroAnimations {
  constructor() {
    this.init();
  }

  init() {
    // Observe scroll for reveal animations
    this.setupScrollReveal();

    // Setup stagger animations for lists
    this.setupStaggerAnimations();

    // Monitor price changes
    this.setupPriceChangeAnimations();
  }

  /**
   * Flash price change animation
   * @param {string|HTMLElement} element - Element or selector
   * @param {boolean} isIncrease - True for green flash, false for red
   */
  flashPriceChange(element, isIncrease) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    const className = isIncrease ? 'price-increase' : 'price-decrease';

    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), 600);
  }

  /**
   * Animate number count up
   * @param {string|HTMLElement} element - Element or selector
   * @param {number} start - Starting number
   * @param {number} end - Ending number
   * @param {number} duration - Duration in ms
   */
  countUp(element, start, end, duration = 1000) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    const startTime = performance.now();
    const isDecimal = (end % 1) !== 0;
    const decimals = isDecimal ? (end.toString().split('.')[1] || '').length : 0;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const current = start + (end - start) * easeProgress;
      el.textContent = isDecimal ? current.toFixed(decimals) : Math.round(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    el.classList.add('animate-count');
    requestAnimationFrame(animate);
  }

  /**
   * Pulse element to draw attention
   * @param {string|HTMLElement} element - Element or selector
   * @param {number} times - Number of pulses
   */
  pulse(element, times = 1) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    let count = 0;
    const doPulse = () => {
      el.style.animation = 'pulse-update 0.5s ease-out';
      count++;

      setTimeout(() => {
        el.style.animation = '';
        if (count < times) {
          setTimeout(doPulse, 200);
        }
      }, 500);
    };

    doPulse();
  }

  /**
   * Shake element (e.g., for validation errors)
   * @param {string|HTMLElement} element - Element or selector
   */
  shake(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    el.classList.add('animate-shake');
    setTimeout(() => el.classList.remove('animate-shake'), 500);
  }

  /**
   * Wiggle element
   * @param {string|HTMLElement} element - Element or selector
   */
  wiggle(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    el.classList.add('animate-wiggle');
    setTimeout(() => el.classList.remove('animate-wiggle'), 500);
  }

  /**
   * Bounce element
   * @param {string|HTMLElement} element - Element or selector
   */
  bounce(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    el.classList.add('animate-bounce');
    setTimeout(() => el.classList.remove('animate-bounce'), 1000);
  }

  /**
   * Setup scroll reveal for elements
   */
  setupScrollReveal() {
    const revealElements = document.querySelectorAll('.scroll-reveal');

    if (revealElements.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
  }

  /**
   * Setup stagger animations for lists
   */
  setupStaggerAnimations() {
    const containers = document.querySelectorAll('[data-stagger]');

    containers.forEach(container => {
      const items = container.children;
      Array.from(items).forEach((item, index) => {
        item.classList.add('stagger-item');
        item.style.animationDelay = `${index * 0.05}s`;
      });
    });
  }

  /**
   * Setup price change monitoring
   */
  setupPriceChangeAnimations() {
    // Create a MutationObserver to watch for price changes
    const priceElements = document.querySelectorAll('[data-price]');

    priceElements.forEach(el => {
      let lastValue = parseFloat(el.textContent.replace(/[^0-9.-]/g, ''));

      const observer = new MutationObserver(() => {
        const newValue = parseFloat(el.textContent.replace(/[^0-9.-]/g, ''));

        if (!isNaN(lastValue) && !isNaN(newValue) && lastValue !== newValue) {
          this.flashPriceChange(el, newValue > lastValue);
          lastValue = newValue;
        }
      });

      observer.observe(el, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }

  /**
   * Add trend arrow to element
   * @param {string|HTMLElement} element - Element or selector
   * @param {string} direction - 'up' or 'down'
   */
  addTrendArrow(element, direction) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    const arrow = document.createElement('span');
    arrow.className = `trend-arrow ${direction}`;
    arrow.innerHTML = direction === 'up' ? '▲' : '▼';

    el.appendChild(arrow);
  }

  /**
   * Highlight element temporarily
   * @param {string|HTMLElement} element - Element or selector
   * @param {string} color - Highlight color (default: accent)
   * @param {number} duration - Duration in ms
   */
  highlight(element, color = 'rgba(255, 102, 0, 0.2)', duration = 1000) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    const originalBg = el.style.backgroundColor;
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = color;

    setTimeout(() => {
      el.style.backgroundColor = originalBg;
      setTimeout(() => {
        el.style.transition = '';
      }, 300);
    }, duration);
  }

  /**
   * Ripple effect on click
   * @param {MouseEvent} event - Click event
   */
  ripple(event) {
    const button = event.currentTarget;

    const ripple = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    ripple.style.top = `${event.clientY - button.offsetTop - radius}px`;
    ripple.classList.add('ripple-effect');

    const existingRipple = button.querySelector('.ripple-effect');
    if (existingRipple) {
      existingRipple.remove();
    }

    button.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  }

  /**
   * Morph number with smooth transition
   * @param {string|HTMLElement} element - Element or selector
   * @param {number} newValue - New number value
   */
  morphNumber(element, newValue) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    const oldValue = parseFloat(el.textContent.replace(/[^0-9.-]/g, ''));

    if (isNaN(oldValue)) {
      el.textContent = newValue;
      return;
    }

    this.countUp(el, oldValue, newValue, 800);
  }

  /**
   * Setup automatic animations for common elements
   */
  autoSetup() {
    // Auto-animate buttons with action-btn class
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', this.ripple);
    });

    // Auto-animate form validation errors
    document.querySelectorAll('input[required]').forEach(input => {
      input.addEventListener('invalid', () => {
        this.shake(input);
      });
    });

    // Auto-animate stat cards on value change
    document.querySelectorAll('.stat-value').forEach(stat => {
      const observer = new MutationObserver(() => {
        stat.classList.add('updating');
        setTimeout(() => stat.classList.remove('updating'), 500);
      });

      observer.observe(stat, { childList: true, characterData: true, subtree: true });
    });
  }
}

// Create global instance
window.microAnimations = new MicroAnimations();

// Auto-setup on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.microAnimations.autoSetup();
  });
} else {
  window.microAnimations.autoSetup();
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MicroAnimations;
}

// Usage Examples:
// microAnimations.flashPriceChange('#stock-price', true); // Green flash
// microAnimations.countUp('#portfolio-value', 10000, 15000, 1500); // Count up animation
// microAnimations.pulse('.notification-badge', 3); // Pulse 3 times
// microAnimations.shake('#error-message'); // Shake element
// microAnimations.highlight('.new-transaction', 'rgba(16, 185, 129, 0.2)', 2000); // Green highlight
