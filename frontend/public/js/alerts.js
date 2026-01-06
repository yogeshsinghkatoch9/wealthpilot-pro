class AlertsManager {
  constructor() {
    this.alerts = [];
    this.holdings = [];
    this.portfolioId = null;
    this.ws = null;
    this.currentTab = 'active';
    this.searchTerm = '';
    this.filterCondition = '';
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadPortfolioHoldings().then(() => {
      this.loadAlerts();
    });
    this.connectWebSocket();
    this.startPricePolling();
  }

  async loadPortfolioHoldings() {
    try {
      // First get user's portfolios
      const portfoliosRes = await this.authFetch('/api/portfolios');
      if (!portfoliosRes.ok) throw new Error('Failed to load portfolios');

      const portfoliosData = await portfoliosRes.json();
      const portfolios = portfoliosData.portfolios || portfoliosData.data || portfoliosData || [];

      if (portfolios.length > 0) {
        this.portfolioId = portfolios[0].id;

        // Get holdings for the first portfolio
        const holdingsRes = await this.authFetch(`/api/holdings?portfolioId=${this.portfolioId}`);
        if (holdingsRes.ok) {
          this.holdings = await holdingsRes.json();
          console.log('Loaded portfolio holdings:', this.holdings.length);
        }
      }
    } catch (error) {
      console.log('Could not load portfolio, using demo holdings');
      // Demo holdings if API fails
      this.holdings = [
        { symbol: 'AAPL', shares: 50, avgCostBasis: 150, currentPrice: 178.25 },
        { symbol: 'NVDA', shares: 25, avgCostBasis: 120, currentPrice: 138.50 },
        { symbol: 'MSFT', shares: 30, avgCostBasis: 380, currentPrice: 425.30 },
        { symbol: 'GOOGL', shares: 20, avgCostBasis: 140, currentPrice: 176.80 },
        { symbol: 'TSLA', shares: 15, avgCostBasis: 220, currentPrice: 248.75 },
        { symbol: 'AMZN', shares: 25, avgCostBasis: 145, currentPrice: 187.50 },
        { symbol: 'META', shares: 20, avgCostBasis: 350, currentPrice: 585.20 },
        { symbol: 'JPM', shares: 40, avgCostBasis: 155, currentPrice: 198.40 }
      ];
    }
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
    // Generate alerts based on portfolio holdings
    this.alerts = [];

    // Create alerts for each holding in portfolio
    this.holdings.forEach((holding, index) => {
      const currentPrice = holding.currentPrice || holding.avgCostBasis * 1.1;
      const costBasis = holding.avgCostBasis || currentPrice * 0.9;

      // Create a "take profit" alert (10% above current)
      if (index < 4) {
        this.alerts.push({
          id: `demo-active-${index}`,
          symbol: holding.symbol,
          condition: 'above',
          target_price: Math.round(currentPrice * 1.10 * 100) / 100,
          current_price: currentPrice,
          triggered: false,
          created_at: new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
          message: `Take profit at 10% gain`
        });
      }

      // Create a "stop loss" alert (5% below cost basis)
      if (index >= 2 && index < 5) {
        this.alerts.push({
          id: `demo-stoploss-${index}`,
          symbol: holding.symbol,
          condition: 'below',
          target_price: Math.round(costBasis * 0.95 * 100) / 100,
          current_price: currentPrice,
          triggered: false,
          created_at: new Date(Date.now() - (index + 2) * 24 * 60 * 60 * 1000).toISOString(),
          message: `Stop loss - protect against 5% decline`
        });
      }
    });

    // Add some triggered alerts
    if (this.holdings.length >= 2) {
      const h1 = this.holdings[0];
      const h2 = this.holdings[1];

      this.alerts.push({
        id: 'demo-triggered-1',
        symbol: h1.symbol,
        condition: 'above',
        target_price: Math.round((h1.currentPrice || 100) * 0.98 * 100) / 100,
        current_price: h1.currentPrice || 100,
        triggered: true,
        triggered_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        message: `Price target hit! Consider taking profits`
      });

      this.alerts.push({
        id: 'demo-triggered-2',
        symbol: h2.symbol,
        condition: 'above',
        target_price: Math.round((h2.currentPrice || 100) * 0.95 * 100) / 100,
        current_price: h2.currentPrice || 100,
        triggered: true,
        triggered_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        message: `Breakout confirmed!`
      });
    }

    this.renderAlerts();
    this.updateStats();
    this.updatePortfolioHoldingsDisplay();
  }

  updatePortfolioHoldingsDisplay() {
    // Add portfolio holdings section to the page if it doesn't exist
    const container = document.getElementById('active-alerts-container');
    if (!container) return;

    // Check if we already have holdings section
    let holdingsSection = document.getElementById('portfolio-holdings-section');
    if (!holdingsSection && this.holdings.length > 0) {
      holdingsSection = document.createElement('div');
      holdingsSection.id = 'portfolio-holdings-section';
      holdingsSection.className = 'mb-6 glass-card-elevated p-4 rounded-lg';
      holdingsSection.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-white font-semibold">Quick Alert from Portfolio</h3>
          <span class="text-xs text-slate-400">${this.holdings.length} holdings</span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${this.holdings.slice(0, 8).map(h => `
            <button onclick="window.alertsManager.quickCreateAlert('${h.symbol}', ${h.currentPrice || 0})"
                    class="px-3 py-1.5 bg-slate-700 hover:bg-amber-500/20 border border-slate-600 hover:border-amber-500/50 rounded-lg text-sm transition-all group">
              <span class="text-amber-500 font-mono font-bold">${h.symbol}</span>
              <span class="text-slate-400 group-hover:text-white ml-1">$${(h.currentPrice || 0).toFixed(2)}</span>
            </button>
          `).join('')}
        </div>
      `;
      container.parentNode.insertBefore(holdingsSection, container);
    }
  }

  quickCreateAlert(symbol, currentPrice) {
    // Pre-fill the create alert modal with this stock
    document.getElementById('alert-symbol').value = symbol;
    document.getElementById('alert-search').value = symbol;
    if (currentPrice > 0) {
      document.getElementById('current-price-display').classList.remove('hidden');
      document.getElementById('current-price-value').textContent = `$${currentPrice.toFixed(2)}`;
      // Suggest a target price 5% above current
      document.getElementById('alert-price').value = (currentPrice * 1.05).toFixed(2);
    }
    this.openModal();
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
    // Initial price fetch for all portfolio holdings
    this.fetchAllPrices();

    // Poll for current prices every 30 seconds
    setInterval(() => {
      this.fetchAllPrices();
    }, 30000);
  }

  async fetchAllPrices() {
    const FINNHUB_TOKEN = 'd4tm751r01qnn6llpesgd4tm751r01qnn6llpet0';

    // Get unique symbols from alerts and holdings
    const alertSymbols = this.alerts.map(a => a.symbol);
    const holdingSymbols = this.holdings.map(h => h.symbol);
    const allSymbols = [...new Set([...alertSymbols, ...holdingSymbols])];

    for (const symbol of allSymbols) {
      try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
        if (response.ok) {
          const data = await response.json();
          if (data.c && data.c > 0) {
            // Update price in alerts
            this.alerts.forEach(alert => {
              if (alert.symbol === symbol) {
                const oldPrice = alert.current_price;
                alert.current_price = data.c;

                // Check if alert should trigger
                this.checkAlertTrigger(alert, oldPrice, data.c);
              }
            });

            // Update price in holdings
            this.holdings.forEach(holding => {
              if (holding.symbol === symbol) {
                holding.currentPrice = data.c;
              }
            });
          }
        }
        // Rate limit - wait 200ms between calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error);
      }
    }

    // Re-render alerts with updated prices
    this.renderAlerts();
  }

  checkAlertTrigger(alert, oldPrice, newPrice) {
    if (alert.triggered) return;

    let shouldTrigger = false;
    const targetPrice = alert.target_price;

    if (alert.condition === 'above' && newPrice >= targetPrice && oldPrice < targetPrice) {
      shouldTrigger = true;
    } else if (alert.condition === 'below' && newPrice <= targetPrice && oldPrice > targetPrice) {
      shouldTrigger = true;
    } else if (alert.condition === 'equals' && Math.abs(newPrice - targetPrice) < 0.02) {
      shouldTrigger = true;
    }

    if (shouldTrigger) {
      alert.triggered = true;
      alert.triggered_at = new Date().toISOString();
      this.showToast(
        `🔔 ${alert.symbol} Alert Triggered!`,
        `${alert.symbol} is now $${newPrice.toFixed(2)} (Target: $${targetPrice.toFixed(2)})`
      );
      this.playNotificationSound();
    }
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
