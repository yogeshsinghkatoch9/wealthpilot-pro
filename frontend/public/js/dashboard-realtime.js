/**
 * WealthPilot Pro - Real-Time Dashboard
 * WebSocket integration for live market data updates
 */

class RealtimeDashboard {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.subscribedSymbols = new Set();
    this.priceUpdateCallbacks = new Map();
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;

    this.init();
  }

  init() {
    this.connectWebSocket();
    this.setupRefreshHandlers();
    this.startMarketIndicesPolling();
    this.setupAutoRefresh();
  }

  /**
   * Get authentication token from localStorage
   */
  getToken() {
    return localStorage.getItem('wealthpilot_token') || '';
  }

  /**
   * Make authenticated fetch request
   */
  async authFetch(url, options = {}) {
    const token = this.getToken();

    // Don't set Content-Type for FormData - browser will set it with boundary
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers
    });
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✓ WebSocket connected');
      this.reconnectAttempts = 0;
      this.showConnectionStatus(true);

      // Authenticate
      const token = localStorage.getItem('wealthpilot_token') || this.getTokenFromCookie();
      if (token) {
        this.send({ type: 'auth', token });
      }

      // Start heartbeat
      this.startHeartbeat();

      // Re-subscribe to symbols
      if (this.subscribedSymbols.size > 0) {
        this.send({
          type: 'subscribe',
          symbols: Array.from(this.subscribedSymbols)
        });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.showConnectionStatus(false);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.showConnectionStatus(false);
      this.stopHeartbeat();
      this.attemptReconnect();
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'connected':
        console.log('✓ WebSocket connected:', data.message);
        break;

      case 'authenticated':
        console.log('✓ Authenticated as user:', data.userId);
        console.log('✓ Auto-subscribed to:', data.subscribedSymbols);
        break;

      case 'subscribed':
        console.log('✓ Subscribed to symbols:', data.symbols);
        data.symbols.forEach(s => this.subscribedSymbols.add(s));
        break;

      case 'quote':
        this.handlePriceUpdate(data);
        break;

      case 'alert':
        this.showAlert(data.alert);
        break;

      case 'portfolio_update':
        this.refreshPortfolio();
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  handlePriceUpdate(data) {
    const { symbol, data: quote } = data;

    // Update price displays
    document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach(el => {
      const priceEl = el.querySelector('.stock-price');
      const changeEl = el.querySelector('.stock-change');
      const changePctEl = el.querySelector('.stock-change-pct');

      if (priceEl && quote.price) {
        // Animate price change
        this.animatePriceChange(priceEl, quote.price);
        priceEl.textContent = this.formatMoney(quote.price);
      }

      if (changeEl && quote.change !== undefined) {
        changeEl.textContent = this.formatChange(quote.change);
        changeEl.className = `stock-change ${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}`;
      }

      if (changePctEl && quote.changePercent !== undefined) {
        changePctEl.textContent = this.formatPercent(quote.changePercent);
        changePctEl.className = `stock-change-pct ${quote.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`;
      }
    });

    // Call registered callbacks
    const callback = this.priceUpdateCallbacks.get(symbol);
    if (callback) {
      callback(quote);
    }
  }

  animatePriceChange(element, newPrice) {
    element.classList.add('price-flash');
    setTimeout(() => element.classList.remove('price-flash'), 500);
  }

  subscribeToSymbol(symbol, callback) {
    this.subscribedSymbols.add(symbol.toUpperCase());
    if (callback) {
      this.priceUpdateCallbacks.set(symbol.toUpperCase(), callback);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', symbols: [symbol.toUpperCase()] });
    }
  }

  subscribeToSymbols(symbols) {
    symbols.forEach(s => this.subscribeToSymbol(s));
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // Every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.showConnectionError();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connectWebSocket();
    }, delay);
  }

  showConnectionStatus(connected) {
    const statusEl = document.getElementById('ws-status');
    if (statusEl) {
      statusEl.textContent = connected ? 'LIVE' : 'OFFLINE';
      statusEl.className = connected ? 'status-live' : 'status-offline';
    }
  }

  showConnectionError() {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50';
    toast.textContent = 'Real-time updates unavailable. Refresh page to reconnect.';
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
  }

  getTokenFromCookie() {
    const match = document.cookie.match(/token=([^;]+)/);
    return match ? match[1] : null;
  }

  // Market Indices Polling (supplement WebSocket)
  async startMarketIndicesPolling() {
    await this.updateMarketIndices();
    setInterval(() => this.updateMarketIndices(), 60000); // Every minute
  }

  async updateMarketIndices() {
    try {
      const response = await this.authFetch('/api/market/indices');
      const indices = await response.json();

      if (!indices.error && Array.isArray(indices)) {
        this.renderMarketIndices(indices);
      }
    } catch (err) {
      console.error('Failed to fetch market indices:', err);
    }
  }

  renderMarketIndices(indices) {
    const container = document.getElementById('market-indices');
    if (!container) return;

    container.innerHTML = indices.map(idx => `
      <div class="flex items-center gap-2 font-mono text-sm whitespace-nowrap">
        <span class="text-slate-400">${idx.symbol}</span>
        <span class="text-white font-medium">${this.formatMoney(idx.price)}</span>
        <span class="${idx.change >= 0 ? 'text-green-500' : 'text-red-500'} font-medium">
          ${this.formatChange(idx.change)} (${this.formatPercent(idx.changePercent)})
        </span>
      </div>
    `).join('');
  }

  // Top Movers Updates
  async updateTopMovers() {
    try {
      const response = await this.authFetch('/api/market/movers');
      const data = await response.json();

      if (!data.error) {
        this.renderTopMovers(data);
      }
    } catch (err) {
      console.error('Failed to fetch top movers:', err);
    }
  }

  renderTopMovers(data) {
    const gainersEl = document.getElementById('top-gainers');
    const losersEl = document.getElementById('top-losers');

    if (gainersEl && data.gainers) {
      gainersEl.innerHTML = data.gainers.slice(0, 5).map(stock => `
        <div class="flex items-center justify-between py-2 border-b border-gray-700">
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm text-white">${stock.symbol}</span>
            <span class="text-xs text-gray-400">${stock.name || ''}</span>
          </div>
          <div class="text-right">
            <div class="text-sm text-white">${this.formatMoney(stock.price)}</div>
            <div class="text-xs text-green-500">${this.formatPercent(stock.changePercent)}</div>
          </div>
        </div>
      `).join('');
    }

    if (losersEl && data.losers) {
      losersEl.innerHTML = data.losers.slice(0, 5).map(stock => `
        <div class="flex items-center justify-between py-2 border-b border-gray-700">
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm text-white">${stock.symbol}</span>
            <span class="text-xs text-gray-400">${stock.name || ''}</span>
          </div>
          <div class="text-right">
            <div class="text-sm text-white">${this.formatMoney(stock.price)}</div>
            <div class="text-xs text-red-500">${this.formatPercent(stock.changePercent)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  // Refresh Handlers
  setupRefreshHandlers() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshAll());
    }
  }

  async refreshAll() {
    const btn = document.getElementById('refreshBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('animate-spin');
    }

    try {
      await Promise.all([
        this.updateMarketIndices(),
        this.updateTopMovers(),
        this.refreshPortfolio()
      ]);

      this.showToast('Dashboard refreshed', 'success');
    } catch (err) {
      console.error('Refresh failed:', err);
      this.showToast('Refresh failed', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('animate-spin');
      }
    }
  }

  async refreshPortfolio() {
    // Reload portfolio data
    window.location.reload();
  }

  setupAutoRefresh() {
    // Auto-refresh movers every 2 minutes
    setInterval(() => this.updateTopMovers(), 120000);
  }

  showToast(message, type = 'info') {
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      info: 'bg-blue-600'
    };

    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  showAlert(alert) {
    const notification = new Notification('Price Alert', {
      body: alert.message,
      icon: '/favicon.ico'
    });
  }

  // Formatting helpers
  formatMoney(value) {
    return '$' + (value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  formatChange(value) {
    return (value >= 0 ? '+' : '') + this.formatMoney(value);
  }

  formatPercent(value) {
    return (value >= 0 ? '+' : '') + (value || 0).toFixed(2) + '%';
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
  }
}

// Initialize when DOM is ready
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  dashboard = new RealtimeDashboard();

  // Subscribe to all visible symbols
  document.querySelectorAll('[data-symbol]').forEach(el => {
    const symbol = el.getAttribute('data-symbol');
    if (symbol) {
      dashboard.subscribeToSymbol(symbol);
    }
  });

  // Initial load of top movers
  dashboard.updateTopMovers();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (dashboard) {
    dashboard.disconnect();
  }
});

// Global refresh function
function refreshPrices() {
  if (dashboard) {
    dashboard.refreshAll();
  }
}
