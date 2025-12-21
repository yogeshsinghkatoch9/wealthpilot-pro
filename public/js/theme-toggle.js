/**
 * Theme Toggle
 * Switch between light and dark themes
 */

class ThemeToggle {
  constructor(options = {}) {
    this.options = {
      storageKey: options.storageKey || 'theme_preference',
      defaultTheme: options.defaultTheme || 'dark',
      toggleButton: options.toggleButton || null,
      ...options
    };

    this.currentTheme = this.loadTheme();
    this.init();
  }

  init() {
    this.applyTheme(this.currentTheme);
    this.createToggleButton();
    this.setupKeyboardShortcut();
  }

  loadTheme() {
    const stored = localStorage.getItem(this.options.storageKey);
    if (stored) return stored;

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return this.options.defaultTheme;
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.options.storageKey, theme);

    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'dark' ? '#0a0e17' : '#ffffff';
    }

    // Dispatch event
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);

    if (window.toast) {
      toast.info(`${newTheme === 'dark' ? '🌙' : '☀️'} ${newTheme} theme activated`);
    }
  }

  createToggleButton() {
    if (this.options.toggleButton) {
      // Use existing button
      const btn = document.querySelector(this.options.toggleButton);
      if (btn) {
        btn.addEventListener('click', () => this.toggle());
        this.updateButtonIcon(btn);
      }
      return;
    }

    // Create floating toggle button
    const button = document.createElement('button');
    button.className = 'theme-toggle-btn';
    button.setAttribute('aria-label', 'Toggle theme');
    button.innerHTML = this.getIcon(this.currentTheme);
    button.addEventListener('click', () => {
      this.toggle();
      button.innerHTML = this.getIcon(this.currentTheme);
    });

    document.body.appendChild(button);
    this.toggleButton = button;
  }

  updateButtonIcon(button) {
    button.innerHTML = this.getIcon(this.currentTheme);
  }

  getIcon(theme) {
    if (theme === 'dark') {
      return `
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
      `;
    } else {
      return `
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      `;
    }
  }

  setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+L or Cmd+Shift+L
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        this.toggle();
        if (this.toggleButton) {
          this.toggleButton.innerHTML = this.getIcon(this.currentTheme);
        }
      }
    });
  }
}

// Initialize theme toggle
document.addEventListener('DOMContentLoaded', () => {
  window.themeToggle = new ThemeToggle();

  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme_preference')) {
        window.themeToggle.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
});

// Expose to global
window.ThemeToggle = ThemeToggle;

// Helper function
window.toggleTheme = function() {
  if (window.themeToggle) {
    window.themeToggle.toggle();
  }
};
