/**
 * Onboarding Flow
 * Guided tour for new users
 */

class OnboardingTour {
  constructor(steps, options = {}) {
    this.steps = steps;
    this.currentStep = 0;
    this.options = {
      skipEnabled: options.skipEnabled !== false,
      showProgress: options.showProgress !== false,
      storageKey: options.storageKey || 'onboarding_completed',
      overlayOpacity: options.overlayOpacity || 0.8,
      ...options
    };

    this.overlay = null;
    this.spotlight = null;
    this.tooltip = null;
    this.isActive = false;
  }

  start() {
    // Check if already completed
    if (localStorage.getItem(this.options.storageKey)) {
      return;
    }

    this.isActive = true;
    this.currentStep = 0;
    this.createElements();
    this.showStep(0);
  }

  createElements() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'onboarding-overlay';
    this.overlay.style.opacity = this.options.overlayOpacity;
    document.body.appendChild(this.overlay);

    // Spotlight (highlight element)
    this.spotlight = document.createElement('div');
    this.spotlight.className = 'onboarding-spotlight';
    document.body.appendChild(this.spotlight);

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'onboarding-tooltip';
    document.body.appendChild(this.tooltip);
  }

  showStep(index) {
    if (index < 0 || index >= this.steps.length) {
      this.complete();
      return;
    }

    this.currentStep = index;
    const step = this.steps[index];

    // Get target element
    const target = typeof step.target === 'string'
      ? document.querySelector(step.target)
      : step.target;

    if (!target) {
      console.warn(`Onboarding: Target not found for step ${index}`);
      this.next();
      return;
    }

    // Scroll to target
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Position spotlight
    setTimeout(() => {
      this.positionSpotlight(target);
      this.showTooltip(step, target);
    }, 300);
  }

  positionSpotlight(element) {
    const rect = element.getBoundingClientRect();
    const padding = 8;

    this.spotlight.style.top = (rect.top - padding) + 'px';
    this.spotlight.style.left = (rect.left - padding) + 'px';
    this.spotlight.style.width = (rect.width + padding * 2) + 'px';
    this.spotlight.style.height = (rect.height + padding * 2) + 'px';
  }

  showTooltip(step, target) {
    const rect = target.getBoundingClientRect();

    this.tooltip.innerHTML = `
      <div class="onboarding-tooltip-header">
        ${this.options.showProgress ? `
          <div class="onboarding-progress">
            Step ${this.currentStep + 1} of ${this.steps.length}
          </div>
        ` : ''}
        ${this.options.skipEnabled ? `
          <button class="onboarding-skip-btn" onclick="window.onboardingTour.skip()">
            Skip Tour
          </button>
        ` : ''}
      </div>

      <div class="onboarding-tooltip-body">
        ${step.title ? `<h3 class="onboarding-tooltip-title">${step.title}</h3>` : ''}
        <p class="onboarding-tooltip-description">${step.description}</p>
      </div>

      <div class="onboarding-tooltip-footer">
        ${this.currentStep > 0 ? `
          <button class="onboarding-btn onboarding-btn-secondary" onclick="window.onboardingTour.previous()">
            Previous
          </button>
        ` : '<div></div>'}

        <div class="onboarding-dots">
          ${this.steps.map((_, i) => `
            <span class="onboarding-dot ${i === this.currentStep ? 'active' : ''}"></span>
          `).join('')}
        </div>

        <button class="onboarding-btn onboarding-btn-primary" onclick="window.onboardingTour.next()">
          ${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    `;

    // Position tooltip
    this.positionTooltip(rect, step.placement || 'bottom');
  }

  positionTooltip(rect, placement) {
    const tooltip = this.tooltip;
    const tooltipRect = tooltip.getBoundingClientRect();
    const spacing = 20;

    let top, left;

    switch (placement) {
      case 'top':
        top = rect.top - tooltipRect.height - spacing;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'bottom':
        top = rect.bottom + spacing;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.left - tooltipRect.width - spacing;
        break;
      case 'right':
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.right + spacing;
        break;
      default:
        top = rect.bottom + spacing;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    }

    // Keep within viewport
    top = Math.max(20, Math.min(top, window.innerHeight - tooltipRect.height - 20));
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipRect.width - 20));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  next() {
    this.showStep(this.currentStep + 1);
  }

  previous() {
    this.showStep(this.currentStep - 1);
  }

  skip() {
    this.complete(true);
  }

  complete(skipped = false) {
    this.isActive = false;

    // Cleanup
    if (this.overlay) this.overlay.remove();
    if (this.spotlight) this.spotlight.remove();
    if (this.tooltip) this.tooltip.remove();

    // Mark as completed
    if (!skipped) {
      localStorage.setItem(this.options.storageKey, 'true');
    }

    // Callback
    if (this.options.onComplete) {
      this.options.onComplete(skipped);
    }

    if (window.toast) {
      toast.success(skipped ? 'Tour skipped' : 'Tour completed! 🎉');
    }
  }

  reset() {
    localStorage.removeItem(this.options.storageKey);
  }
}

// Predefined onboarding tours
const onboardingTours = {
  dashboard: [
    {
      target: '.topnav-logo',
      title: 'Welcome to WealthPilot Pro!',
      description: 'Let\'s take a quick tour of the main features to help you get started.',
      placement: 'bottom'
    },
    {
      target: '[href="/portfolios"]',
      title: 'Your Portfolios',
      description: 'Manage all your investment portfolios here. Create, edit, and track performance.',
      placement: 'bottom'
    },
    {
      target: '[href="/holdings"]',
      title: 'Holdings',
      description: 'View all your stock positions, cost basis, and current values in one place.',
      placement: 'bottom'
    },
    {
      target: '.dashboard-grid',
      title: 'Key Performance Indicators',
      description: 'Monitor your portfolio\'s total value, gains/losses, and performance metrics at a glance.',
      placement: 'top'
    },
    {
      target: '.command-palette-overlay',
      title: 'Quick Navigation',
      description: 'Press ⌘K (Mac) or Ctrl+K (Windows) anywhere to quickly navigate to any page or feature.',
      placement: 'center'
    }
  ],

  portfolio: [
    {
      target: '[data-action="add-holding"]',
      title: 'Add Holdings',
      description: 'Click here to add stocks, ETFs, or other securities to your portfolio.',
      placement: 'bottom'
    },
    {
      target: '.holdings-table',
      title: 'Holdings Table',
      description: 'View and manage all your positions. Click any row for detailed information.',
      placement: 'top'
    },
    {
      target: '[data-action="export"]',
      title: 'Export Data',
      description: 'Export your portfolio data as CSV for analysis in other tools.',
      placement: 'left'
    }
  ]
};

// Helper function to start onboarding
window.startOnboarding = function(tourName = 'dashboard') {
  const steps = onboardingTours[tourName];
  if (!steps) {
    console.error(`Onboarding tour "${tourName}" not found`);
    return;
  }

  window.onboardingTour = new OnboardingTour(steps, {
    storageKey: `onboarding_${tourName}_completed`,
    onComplete: (skipped) => {
      console.log(`Onboarding ${skipped ? 'skipped' : 'completed'}`);
    }
  });

  window.onboardingTour.start();
};

// Auto-start onboarding for new users
document.addEventListener('DOMContentLoaded', () => {
  // Check if this is first visit
  const isFirstVisit = !localStorage.getItem('visited_before');

  if (isFirstVisit) {
    localStorage.setItem('visited_before', 'true');

    // Show welcome message
    if (window.toast) {
      setTimeout(() => {
        toast.info('Welcome! Click here to start the tour', {
          duration: 8000,
          action: 'Start Tour',
          onAction: () => startOnboarding('dashboard')
        });
      }, 2000);
    }
  }
});

// Expose to global
window.OnboardingTour = OnboardingTour;
window.onboardingTours = onboardingTours;

// Usage:
// startOnboarding('dashboard');
// OR
// const tour = new OnboardingTour([...steps]);
// tour.start();
