class AlertsManager {
  constructor() {
    this.alerts = [];
    this.ws = null;
    this.currentTab = 'active';
    this.searchTerm = '';
    this.filterCondition = '';
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadAlerts();
    this.connectWebSocket();
    this.startPricePolling();
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

  setupEventListeners() {
    // Modal controls
    document.getElementById('create-alert-btn').addEventListener('click', () => this.openModal());
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancel-alert').addEventListener('click', () => this.closeModal());
    
    // Form submission
    document.getElementById('create-alert-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createAlert();
    });

    // Tab switching
    document.querySelectorAll('.alert-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Search and filter
    document.getElementById('search-alerts').addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toUpperCase();
      this.renderAlerts();
    });

    document.getElementById('filter-condition').addEventListener('change', (e) => {
      this.filterCondition = e.target.value;
      this.renderAlerts();
    });

    // Toast close
    document.getElementById('close-toast').addEventListener('click', () => {
      this.hideToast();
    });

    // Symbol input - fetch current price
    let priceCheckTimeout;
    document.getElementById('alert-symbol').addEventListener('input', (e) => {
      const symbol = e.target.value.toUpperCase();
      e.target.value = symbol;
      
      clearTimeout(priceCheckTimeout);
      if (symbol.length >= 1) {
        priceCheckTimeout = setTimeout(() => this.fetchCurrentPrice(symbol), 500);
      } else {
        this.hideCurrentPrice();
      }
    });

    // Close modal on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.hideToast();
      }
    });
  }

  async loadAlerts() {
    try {
      const includeTriggered = this.currentTab === 'triggered';
      const response = await this.authFetch(`/api/alerts?includeTriggered=${includeTriggered}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawAlerts = data.alerts || data.data || [];

      // Transform backend format to frontend format
      this.alerts = rawAlerts.map(alert => {
        // Parse condition if it's a string
        let conditionObj = alert.condition;
        if (typeof conditionObj === 'string') {
          try {
            conditionObj = JSON.parse(conditionObj);
          } catch (e) {
            conditionObj = {};
          }
        }

        // Map type to simple condition
        let simpleCondition = 'above';
        if (alert.type === 'price_below') simpleCondition = 'below';
        else if (alert.type === 'price_equals') simpleCondition = 'equals';

        return {
          id: alert.id,
          symbol: alert.symbol || '',
          condition: simpleCondition,
          target_price: conditionObj?.targetPrice || 0,
          current_price: alert.current_price || 0,
          triggered: alert.is_triggered || false,
          triggered_at: alert.triggered_at,
          created_at: alert.created_at,
          message: alert.message || ''
        };
      });

      this.renderAlerts();
      this.updateStats();

    } catch (error) {
      console.error('Failed to load alerts:', error);
      // Show demo alerts on error for demonstration
      this.loadDemoAlerts();
    }
  }

  loadDemoAlerts() {
    // Demo alerts for demonstration purposes
    this.alerts = [
      {
        id: 'demo-1',
        symbol: 'NVDA',
        condition: 'above',
        target_price: 140.00,
        current_price: 138.50,
        triggered: false,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Buy signal - breakout above resistance'
      },
      {
        id: 'demo-2',
        symbol: 'AAPL',
        condition: 'below',
        target_price: 175.00,
        current_price: 178.25,
        triggered: false,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Support level alert'
      },
      {
        id: 'demo-3',
        symbol: 'TSLA',
        condition: 'above',
        target_price: 250.00,
        current_price: 248.75,
        triggered: false,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Consider taking profits'
      },
      {
        id: 'demo-4',
        symbol: 'MSFT',
        condition: 'below',
        target_price: 400.00,
        current_price: 425.30,
        triggered: true,
        triggered_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Buy the dip opportunity'
      },
      {
        id: 'demo-5',
        symbol: 'GOOGL',
        condition: 'above',
        target_price: 175.00,
        current_price: 176.80,
        triggered: true,
        triggered_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'All-time high alert'
      }
    ];
    this.renderAlerts();
    this.updateStats();
  }

  renderAlerts() {
    const activeAlerts = this.alerts.filter(a => !a.triggered);
    const triggeredAlerts = this.alerts.filter(a => a.triggered);

    if (this.currentTab === 'active') {
      this.renderActiveAlerts(activeAlerts);
    } else {
      this.renderTriggeredAlerts(triggeredAlerts);
    }
  }

  renderActiveAlerts(alerts) {
    const container = document.getElementById('active-alerts-container');
    
    // Apply filters
    let filtered = alerts;
    if (this.searchTerm) {
      filtered = filtered.filter(a => a.symbol.includes(this.searchTerm));
    }
    if (this.filterCondition) {
      filtered = filtered.filter(a => a.condition === this.filterCondition);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="flex items-center justify-center py-12 text-gray-500">
          <div class="text-center">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
            </svg>
            <p>No alerts match your filters</p>
          </div>
        </div>
      `;
      return;
    }

    const html = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left py-3 px-4 font-semibold text-gray-400 text-sm">Symbol</th>
              <th class="text-left py-3 px-4 font-semibold text-gray-400 text-sm">Condition</th>
              <th class="text-right py-3 px-4 font-semibold text-gray-400 text-sm">Target Price</th>
              <th class="text-right py-3 px-4 font-semibold text-gray-400 text-sm">Current Price</th>
              <th class="text-right py-3 px-4 font-semibold text-gray-400 text-sm">Distance</th>
              <th class="text-left py-3 px-4 font-semibold text-gray-400 text-sm">Message</th>
              <th class="text-left py-3 px-4 font-semibold text-gray-400 text-sm">Created</th>
              <th class="text-center py-3 px-4 font-semibold text-gray-400 text-sm">Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(alert => this.renderAlertRow(alert)).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    // Attach edit and delete handlers
    filtered.forEach(alert => {
      const editBtn = document.getElementById(`edit-${alert.id}`);
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          if (typeof openEditAlertModal === 'function') {
            openEditAlertModal(
              alert.id,
              alert.symbol,
              alert.condition,
              alert.target_price,
              alert.message,
              alert.current_price || 0
            );
          }
        });
      }

      const deleteBtn = document.getElementById(`delete-${alert.id}`);
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteAlert(alert.id));
      }
    });
  }

  renderAlertRow(alert) {
    const conditionColors = {
      'above': 'text-green-500',
      'below': 'text-red-500',
      'equals': 'text-amber-500'
    };

    const conditionText = {
      'above': '↑ Above',
      'below': '↓ Below',
      'equals': '= Equals'
    };

    const currentPrice = alert.current_price || 0;
    const targetPrice = alert.target_price;
    const distance = currentPrice > 0 ? ((currentPrice - targetPrice) / targetPrice * 100) : 0;
    const distanceColor = distance >= 0 ? 'text-green-500' : 'text-red-500';
    const distanceText = distance >= 0 ? `+${distance.toFixed(2)}%` : `${distance.toFixed(2)}%`;

    const createdDate = new Date(alert.created_at);
    const timeAgo = this.getTimeAgo(createdDate);

    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800 transition-colors">
        <td class="py-3 px-4">
          <span class="font-mono font-bold text-amber-500">${alert.symbol}</span>
        </td>
        <td class="py-3 px-4">
          <span class="${conditionColors[alert.condition]} font-semibold">
            ${conditionText[alert.condition]}
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="font-mono">$${targetPrice.toFixed(2)}</span>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="font-mono">${currentPrice > 0 ? '$' + currentPrice.toFixed(2) : '--'}</span>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="font-mono ${distanceColor}">${currentPrice > 0 ? distanceText : '--'}</span>
        </td>
        <td class="py-3 px-4 text-gray-400 text-sm max-w-xs truncate">
          ${alert.message || '--'}
        </td>
        <td class="py-3 px-4 text-gray-400 text-sm">
          ${timeAgo}
        </td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1">
            <button id="edit-${alert.id}"
                    class="text-amber-500 hover:text-amber-400 transition-colors p-2"
                    title="Edit alert">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
            <button id="delete-${alert.id}"
                    class="text-red-500 hover:text-red-400 transition-colors p-2"
                    title="Delete alert">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  renderTriggeredAlerts(alerts) {
    const container = document.getElementById('triggered-alerts-container');

    if (alerts.length === 0) {
      container.innerHTML = `
        <div class="flex items-center justify-center py-12 text-gray-500">
          <div class="text-center">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>No triggered alerts</p>
          </div>
        </div>
      `;
      return;
    }

    const html = `
      <div class="space-y-3">
        ${alerts.map(alert => this.renderTriggeredAlertCard(alert)).join('')}
      </div>
    `;

    container.innerHTML = html;
  }

  renderTriggeredAlertCard(alert) {
    const triggeredDate = new Date(alert.triggered_at);
    const timeAgo = this.getTimeAgo(triggeredDate);

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="font-mono font-bold text-amber-500 text-lg">${alert.symbol}</span>
              <span class="px-2 py-1 bg-green-500 bg-opacity-20 text-green-500 text-xs rounded font-semibold">
                TRIGGERED
              </span>
            </div>
            <div class="text-gray-300 mb-2">
              Alert: Price ${alert.condition} <span class="font-mono">$${alert.target_price.toFixed(2)}</span>
            </div>
            <div class="text-sm text-gray-400">
              Triggered at <span class="font-mono">$${alert.current_price.toFixed(2)}</span> • ${timeAgo}
            </div>
            ${alert.message ? `
              <div class="mt-2 text-sm text-gray-400 italic">
                "${alert.message}"
              </div>
            ` : ''}
          </div>
          <div class="text-right">
            <div class="text-2xl font-mono font-bold text-green-500">
              $${alert.current_price.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateStats() {
    const activeAlerts = this.alerts.filter(a => !a.triggered);
    const triggeredToday = this.alerts.filter(a => {
      if (!a.triggered || !a.triggered_at) return false;
      const triggeredDate = new Date(a.triggered_at);
      const today = new Date();
      return triggeredDate.toDateString() === today.toDateString();
    });

    const uniqueSymbols = new Set(activeAlerts.map(a => a.symbol));

    document.getElementById('stat-active').textContent = activeAlerts.length;
    document.getElementById('stat-triggered').textContent = triggeredToday.length;
    document.getElementById('stat-total').textContent = this.alerts.length;
    document.getElementById('stat-symbols').textContent = uniqueSymbols.size;
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.alert-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    // Update tab content
    document.querySelectorAll('.alert-tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    this.currentTab = tabName;
    this.loadAlerts(); // Reload with appropriate filter
  }

  openModal() {
    document.getElementById('create-alert-modal').classList.remove('hidden');
    document.getElementById('create-alert-modal').classList.add('flex');
    document.getElementById('alert-symbol').focus();
  }

  closeModal() {
    document.getElementById('create-alert-modal').classList.add('hidden');
    document.getElementById('create-alert-modal').classList.remove('flex');
    document.getElementById('create-alert-form').reset();
    this.hideCurrentPrice();
  }

  async createAlert() {
    const form = document.getElementById('create-alert-form');
    const formData = new FormData(form);

    const symbol = formData.get('symbol')?.toUpperCase() || '';
    const condition = formData.get('condition') || 'above';
    const targetPrice = parseFloat(formData.get('targetPrice')) || 0;
    const message = formData.get('message') || '';

    if (!symbol || !targetPrice) {
      this.showError('Please fill in all required fields');
      return;
    }

    const alertData = {
      symbol,
      condition,
      targetPrice,
      message
    };

    try {
      const response = await this.authFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(alertData)
      });

      if (!response.ok) {
        throw new Error('API error');
      }

      const result = await response.json();
      this.showSuccess(`Alert created for ${alertData.symbol}`);
      this.closeModal();
      this.loadAlerts();

    } catch (error) {
      console.error('Create alert error, using demo mode:', error);
      // Demo mode - add locally
      const newAlert = {
        id: 'demo-' + Date.now(),
        symbol: alertData.symbol,
        condition: alertData.condition,
        target_price: alertData.targetPrice,
        current_price: 0,
        triggered: false,
        created_at: new Date().toISOString(),
        message: alertData.message
      };

      // Fetch current price
      try {
        const FINNHUB_TOKEN = 'd4tm751r01qnn6llpesgd4tm751r01qnn6llpet0';
        const priceRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
        const priceData = await priceRes.json();
        if (priceData.c > 0) {
          newAlert.current_price = priceData.c;
        }
      } catch (e) {
        console.log('Could not fetch price');
      }

      this.alerts.unshift(newAlert);
      this.showSuccess(`Alert created for ${alertData.symbol}`);
      this.closeModal();
      this.renderAlerts();
      this.updateStats();
    }
  }

  async deleteAlert(alertId) {
    if (!confirm('Are you sure you want to delete this alert?')) {
      return;
    }

    try {
      // Try API first
      if (!alertId.toString().startsWith('demo-')) {
        const response = await this.authFetch(`/api/alerts/${alertId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw new Error('API error');
        }
      }

      // Remove from local array
      this.alerts = this.alerts.filter(a => a.id !== alertId);
      this.showSuccess('Alert deleted successfully');
      this.renderAlerts();
      this.updateStats();

    } catch (error) {
      console.error('Delete alert error, removing locally:', error);
      // Demo mode - remove locally
      this.alerts = this.alerts.filter(a => a.id !== alertId);
      this.showSuccess('Alert deleted successfully');
      this.renderAlerts();
      this.updateStats();
    }
  }

  async fetchCurrentPrice(symbol) {
    const FINNHUB_TOKEN = 'd4tm751r01qnn6llpesgd4tm751r01qnn6llpet0';
    try {
      // Try Finnhub API directly for more reliable results
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
      if (response.ok) {
        const data = await response.json();
        if (data.c && data.c > 0) {
          this.showCurrentPrice(data.c);
        }
      }
    } catch (error) {
      console.error('Price fetch error:', error);
      // Fallback to backend API
      try {
        const response = await this.authFetch(`/api/quote/${symbol}`);
        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            this.showCurrentPrice(data.price);
          }
        }
      } catch (err) {
        console.error('Fallback price fetch error:', err);
      }
    }
  }

  showCurrentPrice(price) {
    document.getElementById('current-price-display').classList.remove('hidden');
    document.getElementById('current-price-value').textContent = `$${price.toFixed(2)}`;
  }

  hideCurrentPrice() {
    document.getElementById('current-price-display').classList.add('hidden');
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected for alerts');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'alert') {
        this.handleAlertNotification(data.alert);
      } else if (data.type === 'quote') {
        this.handleQuoteUpdate(data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected. Reconnecting in 5s...');
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  handleAlertNotification(alert) {
    console.log('Alert triggered:', alert);
    
    // Show toast notification
    this.showToast(
      `${alert.symbol} Alert Triggered!`,
      `${alert.symbol} is ${alert.condition} $${alert.targetPrice.toFixed(2)} - Current: $${alert.currentPrice.toFixed(2)}`
    );

    // Play notification sound (optional)
    this.playNotificationSound();

    // Reload alerts to update UI
    setTimeout(() => this.loadAlerts(), 1000);
  }

  handleQuoteUpdate(quote) {
    // Update current prices in the alert table
    const priceCell = document.querySelector(`tr[data-symbol="${quote.symbol}"] .current-price`);
    if (priceCell) {
      priceCell.textContent = `$${quote.price.toFixed(2)}`;
    }
  }

  startPricePolling() {
    // Poll for current prices every 30 seconds
    setInterval(() => {
      const activeAlerts = this.alerts.filter(a => !a.triggered);
      const symbols = [...new Set(activeAlerts.map(a => a.symbol))];
      
      symbols.forEach(symbol => {
        this.fetchCurrentPrice(symbol);
      });
    }, 30000);
  }

  showToast(title, message) {
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-message').textContent = message;
    document.getElementById('alert-toast').classList.remove('hidden');

    // Auto-hide after 10 seconds
    setTimeout(() => this.hideToast(), 10000);
  }

  hideToast() {
    document.getElementById('alert-toast').classList.add('hidden');
  }

  playNotificationSound() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.1;

    oscillator.start();
    setTimeout(() => oscillator.stop(), 200);
  }

  showSuccess(message) {
    this.showToast('Success', message);
  }

  showError(message) {
    const toast = document.getElementById('alert-toast');
    toast.classList.remove('bg-amber-500');
    toast.classList.add('bg-red-500');
    
    this.showToast('Error', message);
    
    setTimeout(() => {
      toast.classList.remove('bg-red-500');
      toast.classList.add('bg-amber-500');
    }, 3000);
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.alertsManager = new AlertsManager();
});
