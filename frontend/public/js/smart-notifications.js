/**
 * Smart Notification Manager
 * Comprehensive notification system for WealthPilot Pro
 * Handles alerts, real-time updates, preferences, and history
 */

class SmartNotificationManager {
  constructor() {
    this.notifications = [];
    this.alerts = [];
    this.preferences = this.loadPreferences();
    this.currentTab = 'all';
    this.searchTerm = '';
    this.filterPriority = '';
    this.ws = null;
    this.page = 1;
    this.pageSize = 10;
    this.totalNotifications = 0;

    this.init();
  }

  /**
   * Initialize the notification manager
   */
  init() {
    this.loadSampleNotifications();
    this.setupEventListeners();
    this.connectWebSocket();
    this.renderNotifications();
    this.updateStats();
    this.renderHistory();
    this.applyPreferences();
  }

  /**
   * Load preferences from localStorage
   */
  loadPreferences() {
    const stored = localStorage.getItem('wealthpilot_notification_preferences');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse notification preferences:', e);
      }
    }

    return {
      priceAlerts: true,
      riskAlerts: true,
      opportunityAlerts: true,
      dividendAlerts: true,
      earningsAlerts: true,
      priceAbove: null,
      priceBelow: null,
      betaThreshold: 1.5,
      unusualVolume: true,
      insiderBuying: true,
      exDateAlert: true,
      paymentDateAlert: true,
      earningsDaysBefore: 3,
      deliveryInApp: true,
      deliveryEmail: true,
      deliveryPush: false,
      quietHoursEnabled: false,
      quietStart: '22:00',
      quietEnd: '07:00',
      smartFilter: true
    };
  }

  /**
   * Save preferences to localStorage
   */
  savePreferences() {
    const preferences = {
      priceAlerts: document.getElementById('enable-price-alerts')?.checked ?? true,
      riskAlerts: document.getElementById('enable-risk-alerts')?.checked ?? true,
      opportunityAlerts: document.getElementById('enable-opportunity-alerts')?.checked ?? true,
      dividendAlerts: document.getElementById('enable-dividend-alerts')?.checked ?? true,
      earningsAlerts: document.getElementById('enable-earnings-alerts')?.checked ?? true,
      priceAbove: parseFloat(document.getElementById('price-above')?.value) || null,
      priceBelow: parseFloat(document.getElementById('price-below')?.value) || null,
      betaThreshold: parseFloat(document.getElementById('beta-threshold')?.value) || 1.5,
      unusualVolume: document.getElementById('alert-unusual-volume')?.checked ?? true,
      insiderBuying: document.getElementById('alert-insider-buying')?.checked ?? true,
      exDateAlert: document.getElementById('alert-ex-date')?.checked ?? true,
      paymentDateAlert: document.getElementById('alert-payment-date')?.checked ?? true,
      earningsDaysBefore: parseInt(document.getElementById('earnings-days-before')?.value) || 3,
      deliveryInApp: document.getElementById('delivery-inapp')?.checked ?? true,
      deliveryEmail: document.getElementById('delivery-email')?.checked ?? true,
      deliveryPush: document.getElementById('delivery-push')?.checked ?? false,
      quietHoursEnabled: document.getElementById('enable-quiet-hours')?.checked ?? false,
      quietStart: document.getElementById('quiet-start')?.value || '22:00',
      quietEnd: document.getElementById('quiet-end')?.value || '07:00',
      smartFilter: document.getElementById('enable-smart-filter')?.checked ?? true
    };

    this.preferences = preferences;
    localStorage.setItem('wealthpilot_notification_preferences', JSON.stringify(preferences));

    // Show success toast
    if (window.toast) {
      window.toast.success('Preferences saved successfully!');
    } else {
      this.showNotificationToast('Success', 'Preferences saved successfully!', 'success');
    }

    // Subscribe to alerts with new preferences
    this.subscribeToAlerts(preferences);
  }

  /**
   * Apply preferences to UI elements
   */
  applyPreferences() {
    const p = this.preferences;

    // Alert toggles
    if (document.getElementById('enable-price-alerts')) {
      document.getElementById('enable-price-alerts').checked = p.priceAlerts;
    }
    if (document.getElementById('enable-risk-alerts')) {
      document.getElementById('enable-risk-alerts').checked = p.riskAlerts;
    }
    if (document.getElementById('enable-opportunity-alerts')) {
      document.getElementById('enable-opportunity-alerts').checked = p.opportunityAlerts;
    }
    if (document.getElementById('enable-dividend-alerts')) {
      document.getElementById('enable-dividend-alerts').checked = p.dividendAlerts;
    }
    if (document.getElementById('enable-earnings-alerts')) {
      document.getElementById('enable-earnings-alerts').checked = p.earningsAlerts;
    }

    // Thresholds
    if (document.getElementById('price-above') && p.priceAbove) {
      document.getElementById('price-above').value = p.priceAbove;
    }
    if (document.getElementById('price-below') && p.priceBelow) {
      document.getElementById('price-below').value = p.priceBelow;
    }
    if (document.getElementById('beta-threshold')) {
      document.getElementById('beta-threshold').value = p.betaThreshold;
    }

    // Opportunity alerts
    if (document.getElementById('alert-unusual-volume')) {
      document.getElementById('alert-unusual-volume').checked = p.unusualVolume;
    }
    if (document.getElementById('alert-insider-buying')) {
      document.getElementById('alert-insider-buying').checked = p.insiderBuying;
    }

    // Dividend alerts
    if (document.getElementById('alert-ex-date')) {
      document.getElementById('alert-ex-date').checked = p.exDateAlert;
    }
    if (document.getElementById('alert-payment-date')) {
      document.getElementById('alert-payment-date').checked = p.paymentDateAlert;
    }

    // Earnings
    if (document.getElementById('earnings-days-before')) {
      document.getElementById('earnings-days-before').value = p.earningsDaysBefore;
    }

    // Delivery methods
    if (document.getElementById('delivery-inapp')) {
      document.getElementById('delivery-inapp').checked = p.deliveryInApp;
    }
    if (document.getElementById('delivery-email')) {
      document.getElementById('delivery-email').checked = p.deliveryEmail;
    }
    if (document.getElementById('delivery-push')) {
      document.getElementById('delivery-push').checked = p.deliveryPush;
    }

    // Quiet hours
    if (document.getElementById('enable-quiet-hours')) {
      document.getElementById('enable-quiet-hours').checked = p.quietHoursEnabled;
    }
    if (document.getElementById('quiet-start')) {
      document.getElementById('quiet-start').value = p.quietStart;
    }
    if (document.getElementById('quiet-end')) {
      document.getElementById('quiet-end').value = p.quietEnd;
    }

    // Smart filter
    if (document.getElementById('enable-smart-filter')) {
      document.getElementById('enable-smart-filter').checked = p.smartFilter;
    }
  }

  /**
   * Subscribe to alerts based on preferences
   */
  subscribeToAlerts(preferences) {
    // Send preferences to server via WebSocket or API
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        preferences: preferences
      }));
    }

    // Also save to server via API
    this.authFetch('/api/notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(preferences)
    }).catch(err => console.log('Could not save preferences to server:', err));
  }

  /**
   * Create a new alert
   */
  createAlert(type, params) {
    const alert = {
      id: 'alert-' + Date.now(),
      type: type,
      symbol: params.symbol,
      threshold: params.threshold,
      note: params.note || '',
      priority: params.priority || 'medium',
      createdAt: new Date().toISOString(),
      triggered: false,
      active: true
    };

    this.alerts.push(alert);
    localStorage.setItem('wealthpilot_alerts', JSON.stringify(this.alerts));

    // Create a notification for the new alert
    const notification = {
      id: 'notif-' + Date.now(),
      type: 'alert-created',
      category: 'alerts',
      icon: 'price',
      title: `Alert Created: ${params.symbol}`,
      description: this.getAlertDescription(type, params),
      timestamp: new Date().toISOString(),
      priority: params.priority,
      read: false,
      symbol: params.symbol,
      actions: ['view', 'dismiss']
    };

    this.notifications.unshift(notification);
    this.renderNotifications();
    this.updateStats();

    if (window.toast) {
      window.toast.success(`Alert created for ${params.symbol}`);
    } else {
      this.showNotificationToast('Alert Created', `Alert created for ${params.symbol}`, 'success');
    }

    // Send to server
    this.authFetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(alert)
    }).catch(err => console.log('Could not save alert to server:', err));

    return alert;
  }

  /**
   * Get alert description based on type
   */
  getAlertDescription(type, params) {
    switch (type) {
      case 'price_above':
        return `Alert when ${params.symbol} rises above $${params.threshold.toFixed(2)}`;
      case 'price_below':
        return `Alert when ${params.symbol} falls below $${params.threshold.toFixed(2)}`;
      case 'percent_change':
        return `Alert when ${params.symbol} changes by ${params.threshold}%`;
      case 'volume':
        return `Alert when ${params.symbol} volume exceeds ${params.threshold.toLocaleString()}`;
      case 'earnings':
        return `Alert for ${params.symbol} earnings announcement`;
      case 'dividend':
        return `Alert for ${params.symbol} dividend events`;
      default:
        return `Alert for ${params.symbol}`;
    }
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(id) {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.renderNotifications();
      this.updateStats();
    }
  }

  /**
   * Snooze a notification
   */
  snoozeNotification(id, duration = 3600000) { // Default 1 hour
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.snoozedUntil = new Date(Date.now() + duration).toISOString();
      notification.snoozed = true;
      this.renderNotifications();

      if (window.toast) {
        window.toast.info('Notification snoozed for 1 hour');
      }

      // Re-show after duration
      setTimeout(() => {
        notification.snoozed = false;
        notification.snoozedUntil = null;
        this.renderNotifications();
        this.showNotificationToast(notification.title, notification.description, notification.type);
      }, duration);
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllRead() {
    this.notifications.forEach(n => n.read = true);
    this.renderNotifications();
    this.updateStats();

    if (window.toast) {
      window.toast.success('All notifications marked as read');
    }
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    if (confirm('Are you sure you want to clear all notifications?')) {
      this.notifications = [];
      this.renderNotifications();
      this.updateStats();

      if (window.toast) {
        window.toast.success('All notifications cleared');
      }
    }
  }

  /**
   * Filter notifications based on criteria
   */
  filterNotifications(criteria) {
    let filtered = [...this.notifications];

    // Filter by tab/category
    if (criteria.category && criteria.category !== 'all') {
      filtered = filtered.filter(n => n.category === criteria.category);
    }

    // Filter by search term
    if (criteria.search) {
      const search = criteria.search.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(search) ||
        n.description.toLowerCase().includes(search) ||
        (n.symbol && n.symbol.toLowerCase().includes(search))
      );
    }

    // Filter by priority
    if (criteria.priority) {
      filtered = filtered.filter(n => n.priority === criteria.priority);
    }

    // Filter out snoozed
    filtered = filtered.filter(n => !n.snoozed);

    return filtered;
  }

  /**
   * Get notification history with filters
   */
  getNotificationHistory(filters = {}) {
    let history = [...this.notifications].filter(n => n.read);

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      history = history.filter(n => new Date(n.timestamp) >= from);
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      history = history.filter(n => new Date(n.timestamp) <= to);
    }

    return history;
  }

  /**
   * Search notification history
   */
  searchHistory() {
    const dateFrom = document.getElementById('history-date-from')?.value;
    const dateTo = document.getElementById('history-date-to')?.value;

    const history = this.getNotificationHistory({ dateFrom, dateTo });
    this.renderHistory(history);
  }

  /**
   * Load more notifications
   */
  loadMore() {
    this.page++;
    // In a real app, this would fetch more from server
    // For demo, we'll just show a message
    if (window.toast) {
      window.toast.info('All notifications loaded');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('#notification-tabs .premium-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#notification-tabs .premium-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.renderNotifications();
      });
    });

    // Search
    const searchInput = document.getElementById('notification-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchTerm = e.target.value;
          this.renderNotifications();
        }, 300);
      });
    }

    // Priority filter
    const filterSelect = document.getElementById('notification-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.filterPriority = e.target.value;
        this.renderNotifications();
      });
    }
  }

  /**
   * Connect to WebSocket for real-time notifications
   */
  connectWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Smart Notifications: WebSocket connected');
        // Subscribe with current preferences
        this.subscribeToAlerts(this.preferences);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 5s...');
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (e) {
      console.log('WebSocket not available, using polling');
      this.startPolling();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'notification':
        this.addNotification(data.notification);
        break;
      case 'alert_triggered':
        this.handleAlertTriggered(data.alert);
        break;
      case 'price_update':
        this.checkPriceAlerts(data);
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }

  /**
   * Handle triggered alert
   */
  handleAlertTriggered(alert) {
    const notification = {
      id: 'notif-' + Date.now(),
      type: 'alert-triggered',
      category: 'alerts',
      icon: 'price',
      title: `Alert Triggered: ${alert.symbol}`,
      description: `${alert.symbol} has reached your target of $${alert.threshold.toFixed(2)}`,
      timestamp: new Date().toISOString(),
      priority: 'high',
      read: false,
      symbol: alert.symbol,
      actions: ['view', 'dismiss']
    };

    this.addNotification(notification);
    this.showNotificationToast(notification.title, notification.description, 'alert');
    this.playNotificationSound();
  }

  /**
   * Check price alerts against current prices
   */
  checkPriceAlerts(priceData) {
    this.alerts.forEach(alert => {
      if (!alert.active || alert.triggered) return;
      if (alert.symbol !== priceData.symbol) return;

      let shouldTrigger = false;
      const price = priceData.price;

      if (alert.type === 'price_above' && price >= alert.threshold) {
        shouldTrigger = true;
      } else if (alert.type === 'price_below' && price <= alert.threshold) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
        this.handleAlertTriggered(alert);
      }
    });
  }

  /**
   * Add a new notification
   */
  addNotification(notification) {
    // Check quiet hours
    if (this.isInQuietHours()) {
      notification.queued = true;
      return;
    }

    this.notifications.unshift(notification);
    this.renderNotifications();
    this.updateStats();

    // Show toast if in-app delivery is enabled
    if (this.preferences.deliveryInApp) {
      this.showNotificationToast(notification.title, notification.description, notification.type);
    }

    // Send push notification if enabled
    if (this.preferences.deliveryPush && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.description,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png'
      });
    }
  }

  /**
   * Check if currently in quiet hours
   */
  isInQuietHours() {
    if (!this.preferences.quietHoursEnabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = this.preferences.quietStart.split(':').map(Number);
    const [endHour, endMin] = this.preferences.quietEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  /**
   * Start polling for notifications (fallback)
   */
  startPolling() {
    setInterval(() => {
      this.fetchNotifications();
    }, 30000);
  }

  /**
   * Fetch notifications from server
   */
  async fetchNotifications() {
    try {
      const response = await this.authFetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        if (data.notifications) {
          data.notifications.forEach(n => {
            if (!this.notifications.find(existing => existing.id === n.id)) {
              this.addNotification(n);
            }
          });
        }
      }
    } catch (error) {
      console.log('Could not fetch notifications:', error);
    }
  }

  /**
   * Load sample notifications for demo
   */
  loadSampleNotifications() {
    const now = new Date();

    this.notifications = [
      {
        id: 'notif-1',
        type: 'price_alert',
        category: 'alerts',
        icon: 'price',
        title: 'NVDA hit your price target!',
        description: 'NVIDIA rose above $140.00, your target was $138.00',
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        read: false,
        symbol: 'NVDA',
        actions: ['view', 'dismiss', 'snooze']
      },
      {
        id: 'notif-2',
        type: 'dividend',
        category: 'portfolio',
        icon: 'dividend',
        title: 'Dividend Payment: MSFT',
        description: '$68.50 dividend received for 100 shares of Microsoft',
        timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        read: false,
        symbol: 'MSFT',
        actions: ['view', 'dismiss']
      },
      {
        id: 'notif-3',
        type: 'earnings',
        category: 'alerts',
        icon: 'earnings',
        title: 'Earnings Tomorrow: AAPL',
        description: 'Apple Inc. reports Q4 earnings tomorrow after market close',
        timestamp: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        read: false,
        symbol: 'AAPL',
        actions: ['view', 'dismiss', 'snooze']
      },
      {
        id: 'notif-4',
        type: 'risk_warning',
        category: 'portfolio',
        icon: 'risk',
        title: 'Portfolio Beta Warning',
        description: 'Your portfolio beta has exceeded 1.5 threshold (current: 1.62)',
        timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        read: false,
        actions: ['view', 'dismiss']
      },
      {
        id: 'notif-5',
        type: 'opportunity',
        category: 'opportunities',
        icon: 'opportunity',
        title: 'Unusual Volume: AMD',
        description: 'AMD trading at 3.5x average volume - potential breakout',
        timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        read: false,
        symbol: 'AMD',
        actions: ['view', 'dismiss']
      },
      {
        id: 'notif-6',
        type: 'opportunity',
        category: 'opportunities',
        icon: 'opportunity',
        title: 'Insider Buying: GOOGL',
        description: 'Multiple insiders purchased shares totaling $2.1M in the past week',
        timestamp: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
        priority: 'low',
        read: true,
        symbol: 'GOOGL',
        actions: ['view', 'dismiss']
      },
      {
        id: 'notif-7',
        type: 'market',
        category: 'market',
        icon: 'market',
        title: 'Market Alert: VIX Spike',
        description: 'VIX has risen 15% today, indicating increased market volatility',
        timestamp: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        read: true,
        actions: ['view', 'dismiss']
      },
      {
        id: 'notif-8',
        type: 'dividend',
        category: 'portfolio',
        icon: 'dividend',
        title: 'Ex-Dividend Date: JPM',
        description: 'JPMorgan Chase ex-dividend date is in 3 days. $1.15 per share.',
        timestamp: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
        priority: 'low',
        read: true,
        symbol: 'JPM',
        actions: ['view', 'dismiss']
      }
    ];

    // Load saved alerts
    const savedAlerts = localStorage.getItem('wealthpilot_alerts');
    if (savedAlerts) {
      try {
        this.alerts = JSON.parse(savedAlerts);
      } catch (e) {
        this.alerts = [];
      }
    }
  }

  /**
   * Render notifications list
   */
  renderNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    const filtered = this.filterNotifications({
      category: this.currentTab,
      search: this.searchTerm,
      priority: this.filterPriority
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state py-12">
          <div class="empty-state-icon">
            <svg class="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
          </div>
          <div class="empty-state-title">No Notifications</div>
          <div class="empty-state-description">You're all caught up! No notifications match your filters.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(notification => this.renderNotificationCard(notification)).join('');

    // Attach event listeners
    filtered.forEach(notification => {
      const card = document.getElementById(`notification-${notification.id}`);
      if (!card) return;

      const dismissBtn = card.querySelector('.action-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dismissNotification(notification.id);
        });
      }

      const snoozeBtn = card.querySelector('.action-snooze');
      if (snoozeBtn) {
        snoozeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.snoozeNotification(notification.id);
        });
      }

      const viewBtn = card.querySelector('.action-view');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewNotificationDetails(notification);
        });
      }

      // Mark as read on click
      card.addEventListener('click', () => {
        if (!notification.read) {
          notification.read = true;
          this.renderNotifications();
          this.updateStats();
        }
      });
    });
  }

  /**
   * Render a single notification card
   */
  renderNotificationCard(notification) {
    const timeAgo = this.getTimeAgo(new Date(notification.timestamp));
    const priorityClass = `priority-${notification.priority}`;
    const unreadClass = notification.read ? '' : 'unread';

    const iconSvg = this.getNotificationIcon(notification.icon);
    const priorityBadge = this.getPriorityBadge(notification.priority);

    return `
      <div id="notification-${notification.id}" class="notification-card ${unreadClass} ${priorityClass} cursor-pointer">
        <div class="flex items-start gap-4">
          <div class="notification-icon type-${notification.icon}">
            ${iconSvg}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="font-semibold text-white text-sm">${notification.title}</h4>
                <p class="text-zinc-400 text-sm mt-1">${notification.description}</p>
              </div>
              ${priorityBadge}
            </div>
            <div class="flex items-center justify-between mt-3">
              <span class="text-xs text-zinc-500">${timeAgo}</span>
              <div class="flex items-center gap-2">
                ${notification.actions.includes('snooze') ? `
                  <button class="action-snooze text-xs text-zinc-400 hover:text-amber-400 transition-colors">
                    Snooze
                  </button>
                ` : ''}
                ${notification.actions.includes('view') ? `
                  <button class="action-view text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    View Details
                  </button>
                ` : ''}
                <button class="action-dismiss text-xs text-zinc-500 hover:text-red-400 transition-colors">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get icon SVG based on type
   */
  getNotificationIcon(type) {
    const icons = {
      price: `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
      </svg>`,
      dividend: `<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>`,
      earnings: `<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>`,
      risk: `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>`,
      opportunity: `<svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>`,
      portfolio: `<svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
      </svg>`,
      market: `<svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>`
    };

    return icons[type] || icons.portfolio;
  }

  /**
   * Get priority badge HTML
   */
  getPriorityBadge(priority) {
    const badges = {
      high: '<span class="premium-badge premium-badge-danger">High</span>',
      medium: '<span class="premium-badge premium-badge-warning">Medium</span>',
      low: '<span class="premium-badge premium-badge-info">Low</span>'
    };

    return badges[priority] || '';
  }

  /**
   * View notification details
   */
  viewNotificationDetails(notification) {
    // Navigate to relevant page based on type
    if (notification.symbol) {
      if (notification.type === 'earnings') {
        window.location.href = `/earnings-calendar?symbol=${notification.symbol}`;
      } else if (notification.type === 'dividend') {
        window.location.href = `/dividend-calendar?symbol=${notification.symbol}`;
      } else {
        window.location.href = `/stock/${notification.symbol}`;
      }
    } else if (notification.type === 'risk_warning') {
      window.location.href = '/portfolio-tools';
    } else if (notification.category === 'market') {
      window.location.href = '/market-movers';
    }
  }

  /**
   * Render notification history
   */
  renderHistory(history = null) {
    const container = document.getElementById('notification-history');
    if (!container) return;

    const items = history || this.notifications.filter(n => n.read).slice(0, 5);

    if (items.length === 0) {
      container.innerHTML = `
        <p class="text-zinc-500 text-sm text-center py-4">No notification history</p>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      return `
        <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
          <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
            ${this.getNotificationIcon(item.icon)}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-zinc-300 truncate">${item.title}</p>
            <p class="text-xs text-zinc-500">${timeAgo}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Update stats display
   */
  updateStats() {
    const unread = this.notifications.filter(n => !n.read).length;
    const active = this.alerts.filter(a => a.active && !a.triggered).length;
    const opportunities = this.notifications.filter(n => n.category === 'opportunities' && !n.read).length;
    const warnings = this.notifications.filter(n => n.icon === 'risk' && !n.read).length;

    const statUnread = document.getElementById('stat-unread');
    const statActive = document.getElementById('stat-active');
    const statOpportunities = document.getElementById('stat-opportunities');
    const statWarnings = document.getElementById('stat-warnings');

    if (statUnread) statUnread.textContent = unread;
    if (statActive) statActive.textContent = active;
    if (statOpportunities) statOpportunities.textContent = opportunities;
    if (statWarnings) statWarnings.textContent = warnings;
  }

  /**
   * Show notification toast
   */
  showNotificationToast(title, message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    if (!toast) return;

    const toastTitle = document.getElementById('toast-title');
    const toastMessage = document.getElementById('toast-message');
    const toastTime = document.getElementById('toast-time');
    const toastIcon = document.getElementById('toast-icon');

    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.textContent = message;
    if (toastTime) toastTime.textContent = 'Just now';

    // Update icon color based on type
    if (toastIcon) {
      const colors = {
        success: 'bg-emerald-500/20',
        error: 'bg-red-500/20',
        warning: 'bg-amber-500/20',
        alert: 'bg-red-500/20',
        info: 'bg-indigo-500/20'
      };
      toastIcon.className = `w-10 h-10 rounded-full ${colors[type] || colors.info} flex items-center justify-center shrink-0`;
    }

    toast.classList.remove('hidden');
    toast.classList.add('animate-slide-in-right');

    // Auto-hide after 5 seconds
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('animate-slide-in-right');
    }, 5000);
  }

  /**
   * Play notification sound
   */
  playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;

      oscillator.start();
      setTimeout(() => oscillator.stop(), 150);
    } catch (e) {
      console.log('Could not play notification sound');
    }
  }

  /**
   * Get relative time string
   */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Make authenticated fetch request
   */
  async authFetch(url, options = {}) {
    const token = localStorage.getItem('wealthpilot_token') || '';

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartNotificationManager;
}
