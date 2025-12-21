/**
 * WealthPilot Pro V4 - Client JavaScript
 * WebSocket support, modals, toasts, and utilities
 */

// ============================================
// MODAL FUNCTIONS
// ============================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

// ============================================
// FORMAT HELPERS
// ============================================
function formatMoney(n, decimals = 0) {
  if (n == null) return '$0';
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPct(n) {
  if (n == null) return '0%';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
}

function formatCompact(n) {
  if (!n) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    info: '<svg class="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    warning: '<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
  };

  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span class="${document.documentElement.dataset.theme === 'light' ? 'text-gray-900' : 'text-white'}">${message}</span>
    <button onclick="this.parentElement.remove()" class="ml-auto ${document.documentElement.dataset.theme === 'light' ? 'text-gray-400 hover:text-gray-600' : 'text-slate-400 hover:text-white'}">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// API HELPER
// ============================================
async function api(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.detail || 'Request failed');
    }

    return await response.json();
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

// ============================================
// LOADING STATE
// ============================================
function setLoading(element, loading) {
  if (loading) {
    element.dataset.originalText = element.innerHTML;
    element.innerHTML = `<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    element.disabled = true;
  } else {
    element.innerHTML = element.dataset.originalText;
    element.disabled = false;
  }
}

// ============================================
// CHART.JS DEFAULTS
// ============================================
if (typeof Chart !== 'undefined') {
  const isDark = document.documentElement.dataset.theme !== 'light';

  Chart.defaults.color = isDark ? '#94a3b8' : '#6b7280';
  Chart.defaults.borderColor = isDark ? '#334155' : '#e5e7eb';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;

  Chart.defaults.elements.arc.borderWidth = 0;
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.line.tension = 0.4;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 6;
}

// ============================================
// REAL-TIME PRICE UPDATES
// ============================================
function updatePriceElement(symbol, price, change) {
  const elements = document.querySelectorAll(`[data-symbol="${symbol}"]`);
  elements.forEach(el => {
    const priceEl = el.querySelector('.price');
    const changeEl = el.querySelector('.change');

    if (priceEl) {
      const oldPrice = parseFloat(priceEl.textContent.replace(/[$,]/g, ''));
      priceEl.textContent = '$' + parseFloat(price).toFixed(2);

      // Flash effect
      if (price > oldPrice) {
        priceEl.classList.add('text-emerald-400');
        setTimeout(() => priceEl.classList.remove('text-emerald-400'), 1000);
      } else if (price < oldPrice) {
        priceEl.classList.add('text-red-400');
        setTimeout(() => priceEl.classList.remove('text-red-400'), 1000);
      }
    }

    if (changeEl) {
      changeEl.textContent = (change >= 0 ? '+' : '') + parseFloat(change).toFixed(2) + '%';
      changeEl.className = 'change font-medium ' + (change >= 0 ? 'text-emerald-400' : 'text-red-400');
    }
  });
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + K for search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
    if (searchInput) searchInput.focus();
  }

  // Ctrl/Cmd + D for dashboard
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    window.location.href = '/dashboard';
  }
});

// ============================================
// AUTO-REFRESH DATA
// ============================================
let refreshInterval = null;

function startAutoRefresh(interval = 60000) {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    // Trigger custom refresh event
    document.dispatchEvent(new CustomEvent('dataRefresh'));
  }, interval);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// ============================================
// CONFIRMATION DIALOG
// ============================================
function confirmAction(message, onConfirm) {
  if (confirm(message)) {
    onConfirm();
  }
}

// ============================================
// LOCAL STORAGE HELPERS
// ============================================
const storage = {
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  },
  remove: (key) => {
    localStorage.removeItem(key);
  }
};

// ============================================
// DEBOUNCE UTILITY
// ============================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 WealthPilot Pro V6 loaded');

  // Start auto-refresh on dashboard
  if (window.location.pathname === '/dashboard') {
    startAutoRefresh(60000);
  }

  // Smooth scroll for anchors
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Auto-hide alerts after 5 seconds
  document.querySelectorAll('[data-auto-hide]').forEach(el => {
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    }, 5000);
  });

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  // Show onboarding for new users
  if (!localStorage.getItem('onboardingComplete') && window.location.pathname === '/dashboard') {
    setTimeout(showOnboardingTip, 2000);
  }
});

// =============================================================================
// V6: KEYBOARD SHORTCUTS
// =============================================================================
function initKeyboardShortcuts() {
  const shortcuts = {
    'd': '/dashboard',
    'p': '/portfolios',
    'a': '/chat',
    'n': '/news',
    'c': '/calendar',
    's': '/screener',
    'r': '/retirement',
    't': '/tax',
    'w': '/watchlist',
    'g': '/goals',
    'h': '/charts',      // V7: charts
    'x': '/crypto',      // V7: crypto
    'o': '/options',     // V7: options
    'f': '/social',      // V7: social feed
    '?': 'showShortcuts'
  };

  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
      return;
    }

    // G + key for go to page
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
      window._waitingForGo = true;
      setTimeout(() => { window._waitingForGo = false; }, 500);
      return;
    }

    if (window._waitingForGo && shortcuts[e.key]) {
      window._waitingForGo = false;
      if (shortcuts[e.key] === 'showShortcuts') {
        showKeyboardShortcuts();
      } else {
        window.location.href = shortcuts[e.key];
      }
      return;
    }

    // ? for help
    if (e.key === '?' && e.shiftKey) {
      showKeyboardShortcuts();
    }

    // Escape to close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active, [id$="Modal"]:not(.hidden)').forEach(modal => {
        modal.classList.add('hidden');
        modal.classList.remove('active');
      });
      document.querySelector('aside.open')?.classList.remove('open');
      document.querySelector('.sidebar-overlay.active')?.classList.remove('active');
    }
  });
}

function showKeyboardShortcuts() {
  const shortcuts = [
    { key: 'g d', desc: 'Go to Dashboard' },
    { key: 'g p', desc: 'Go to Portfolios' },
    { key: 'g a', desc: 'Go to AI Chat' },
    { key: 'g n', desc: 'Go to News' },
    { key: 'g h', desc: 'Go to Charts' },
    { key: 'g x', desc: 'Go to Crypto' },
    { key: 'g o', desc: 'Go to Options' },
    { key: 'g f', desc: 'Go to Social Feed' },
    { key: 'g s', desc: 'Go to Screener' },
    { key: 'g r', desc: 'Go to Retirement' },
    { key: 'g t', desc: 'Go to Tax' },
    { key: 'g w', desc: 'Go to Watchlist' },
    { key: '⌘/Ctrl K', desc: 'Focus Search' },
    { key: 'Esc', desc: 'Close Modal' },
    { key: '?', desc: 'Show Shortcuts' },
  ];

  const html = `
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onclick="this.remove()">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Keyboard Shortcuts</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-white">✕</button>
        </div>
        <div class="space-y-2">
          ${shortcuts.map(s => `
            <div class="flex justify-between py-2 border-b border-slate-800">
              <span class="text-slate-400">${s.desc}</span>
              <kbd class="px-2 py-1 bg-slate-800 rounded text-xs text-sky-400 font-mono">${s.key}</kbd>
            </div>
          `).join('')}
        </div>
        <p class="text-slate-500 text-xs mt-4">Press 'g' then a letter to navigate</p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

// =============================================================================
// V6: ONBOARDING
// =============================================================================
function showOnboardingTip() {
  if (localStorage.getItem('onboardingComplete')) return;

  const tips = [
    { title: 'Welcome to WealthPilot! 👋', text: 'Let me show you around. Start by adding some holdings to track.', target: '.nav-item[href="/portfolios"]' },
    { title: 'AI Assistant', text: 'Ask me anything about your portfolio, tax strategies, or investments.', target: '.nav-item[href="/chat"]' },
    { title: 'Keyboard Shortcuts', text: 'Press ? anytime to see all shortcuts. Pro tip: g+d goes to dashboard!', target: null },
  ];

  let currentTip = 0;

  function showTip(index) {
    if (index >= tips.length) {
      localStorage.setItem('onboardingComplete', 'true');
      return;
    }

    const tip = tips[index];
    const target = tip.target ? document.querySelector(tip.target) : null;

    // Remove existing
    document.querySelector('.onboarding-tip')?.remove();

    const html = `
      <div class="onboarding-tip fixed z-50 animate-fade-in" style="${target ? 'top: ' + (target.getBoundingClientRect().top + window.scrollY) + 'px; left: 280px;' : 'bottom: 100px; right: 20px;'}">
        <div class="bg-gradient-to-r from-sky-500 to-purple-500 p-1 rounded-2xl shadow-2xl">
          <div class="bg-slate-900 rounded-xl p-4 max-w-xs">
            <h4 class="font-semibold text-white mb-1">${tip.title}</h4>
            <p class="text-slate-300 text-sm mb-3">${tip.text}</p>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 text-xs">${index + 1}/${tips.length}</span>
              <div class="flex gap-2">
                <button onclick="document.querySelector('.onboarding-tip').remove(); localStorage.setItem('onboardingComplete', 'true');" class="text-slate-400 text-sm hover:text-white">Skip</button>
                <button onclick="document.querySelector('.onboarding-tip').remove(); showOnboardingStep(${index + 1});" class="px-3 py-1 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600">${index === tips.length - 1 ? 'Done' : 'Next'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    if (target) {
      target.classList.add('ring-2', 'ring-sky-500', 'ring-offset-2', 'ring-offset-slate-900');
      setTimeout(() => target.classList.remove('ring-2', 'ring-sky-500', 'ring-offset-2', 'ring-offset-slate-900'), 3000);
    }
  }

  window.showOnboardingStep = showTip;
  showTip(0);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});
