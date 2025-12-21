/**
 * WealthPilot Pro - UI Components
 * Loading states, error handling, and common components
 */

// Loading spinner component
function LoadingSpinner({ size = 'md', color = 'blue' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };
  
  return `
    <div class="flex items-center justify-center">
      <svg class="${sizes[size]} animate-spin text-${color}-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  `;
}

// Skeleton loader for content
function SkeletonLoader({ type = 'text', count = 1 }) {
  const templates = {
    text: '<div class="h-4 bg-slate-700 rounded animate-pulse w-3/4"></div>',
    card: `
      <div class="card p-5 animate-pulse">
        <div class="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
        <div class="h-8 bg-slate-700 rounded w-1/2 mb-2"></div>
        <div class="h-4 bg-slate-700 rounded w-1/3"></div>
      </div>
    `,
    table: `
      <div class="space-y-3 animate-pulse">
        <div class="h-10 bg-slate-700 rounded"></div>
        <div class="h-8 bg-slate-800 rounded"></div>
        <div class="h-8 bg-slate-800 rounded"></div>
        <div class="h-8 bg-slate-800 rounded"></div>
      </div>
    `,
    chart: `
      <div class="h-64 bg-slate-800 rounded-lg animate-pulse flex items-center justify-center">
        <svg class="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      </div>
    `
  };
  
  return Array(count).fill(templates[type]).join('\n');
}

// Error message component
function ErrorMessage({ message, retry = null, type = 'error' }) {
  const colors = {
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
  };
  
  const icons = {
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
  };
  
  return `
    <div class="p-4 rounded-lg border ${colors[type]}">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${icons[type]}
        </svg>
        <div class="flex-1">
          <p class="font-medium">${message}</p>
          ${retry ? `<button onclick="${retry}" class="mt-2 text-sm underline hover:no-underline">Try again</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// Empty state component
function EmptyState({ icon, title, message, action = null }) {
  return `
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
        ${icon}
      </div>
      <h3 class="text-lg font-semibold text-white mb-2">${title}</h3>
      <p class="text-slate-400 mb-6 max-w-md mx-auto">${message}</p>
      ${action ? `<a href="${action.href}" class="btn-primary">${action.label}</a>` : ''}
    </div>
  `;
}

// Toast notification system
const ToastManager = {
  container: null,
  
  init() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'fixed bottom-4 right-4 z-50 space-y-2';
    document.body.appendChild(this.container);
  },
  
  show(message, type = 'info', duration = 5000) {
    this.init();
    
    const colors = {
      success: 'bg-emerald-500',
      error: 'bg-red-500',
      warning: 'bg-amber-500',
      info: 'bg-blue-500'
    };
    
    const icons = {
      success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
      error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
      warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
      info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
    };
    
    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${colors[type]} text-white transform translate-x-full transition-transform duration-300`;
    toast.innerHTML = `
      <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type]}</svg>
      <span class="font-medium">${message}</span>
      <button onclick="this.parentElement.remove()" class="ml-2 hover:opacity-75">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    
    this.container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full');
    });
    
    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  },
  
  success(message) { this.show(message, 'success'); },
  error(message) { this.show(message, 'error'); },
  warning(message) { this.show(message, 'warning'); },
  info(message) { this.show(message, 'info'); }
};

// API request with loading state and error handling
async function apiRequest(url, options = {}) {
  const token = localStorage.getItem('wealthpilot_token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    },
    ...options
  };
  
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific errors
      if (response.status === 401) {
        // Token expired - redirect to login
        localStorage.removeItem('wealthpilot_token');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('API Error:', error);
    return { data: null, error: error.message };
  }
}

// Data loader with caching
const DataCache = {
  cache: new Map(),
  ttl: 60000, // 1 minute
  
  get(key) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < this.ttl) {
      return item.data;
    }
    return null;
  },
  
  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  },
  
  clear(pattern = null) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }
};

// WebSocket connection manager
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.handlers = new Map();
  }
  
  connect() {
    const token = localStorage.getItem('wealthpilot_token');
    if (!token) return;
    
    const wsUrl = `ws://${window.location.hostname}:4000/ws`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Authenticate
      this.send({ type: 'auth', token });
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }
  
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    setTimeout(() => this.connect(), delay);
  }
  
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  subscribe(symbols) {
    this.send({ type: 'subscribe', symbols });
  }
  
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);
  }
  
  off(type, handler) {
    this.handlers.get(type)?.delete(handler);
  }
  
  handleMessage(data) {
    const handlers = this.handlers.get(data.type);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
    
    // Handle specific message types
    if (data.type === 'quote') {
      this.updateQuoteDisplay(data.symbol, data.data);
    }
    
    if (data.type === 'alert') {
      ToastManager.warning(`Alert: ${data.alert.message}`);
    }
  }
  
  updateQuoteDisplay(symbol, quote) {
    // Update any elements displaying this quote
    const priceElements = document.querySelectorAll(`[data-quote-price="${symbol}"]`);
    const changeElements = document.querySelectorAll(`[data-quote-change="${symbol}"]`);
    
    priceElements.forEach(el => {
      el.textContent = '$' + quote.price.toFixed(2);
    });
    
    changeElements.forEach(el => {
      const pct = quote.changePercent.toFixed(2);
      el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
      el.className = pct >= 0 ? 'text-emerald-400' : 'text-red-400';
    });
  }
}

// Global instances
window.Toast = ToastManager;
window.api = apiRequest;
window.DataCache = DataCache;
window.wsManager = new WebSocketManager();

// Initialize WebSocket on page load
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('wealthpilot_token')) {
    window.wsManager.connect();
  }
});

// Utility: Format money
function formatMoney(value) {
  return '$' + (value || 0).toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

// Utility: Format percentage
function formatPercent(value) {
  const num = value || 0;
  return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
}

// Utility: Format compact number
function formatCompact(value) {
  if (value >= 1000000000) return '$' + (value / 1000000000).toFixed(2) + 'B';
  if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
  if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
  return '$' + value.toFixed(2);
}

// Export for use in templates
if (typeof module !== 'undefined') {
  module.exports = {
    LoadingSpinner,
    SkeletonLoader,
    ErrorMessage,
    EmptyState,
    ToastManager,
    apiRequest,
    DataCache,
    WebSocketManager,
    formatMoney,
    formatPercent,
    formatCompact
  };
}
