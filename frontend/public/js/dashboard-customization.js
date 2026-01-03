/**
 * Dashboard Customization Manager
 * Handles chart visibility, reordering, favorites, and view management
 */

class DashboardCustomization {
  constructor() {
    this.preferences = null;
    this.currentView = 'default';
    this.charts = new Map(); // Map of chartId -> chart element
    this.isDragging = false;
    this.draggedElement = null;
    this.init();
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

  async init() {
    try {
      await this.loadPreferences();
      this.setupChartControls();
      this.setupViewSelector();
      this.setupDragDrop();
      this.applyPreferences();
      console.log('Dashboard customization initialized');
    } catch (error) {
      console.error('Error initializing customization:', error);
      this.useDefaultPreferences();
    }
  }

  /**
   * Load user preferences from API
   */
  async loadPreferences() {
    try {
      const response = await this.authFetch('/api/dashboard/preferences');
      if (response.ok) {
        const data = await response.json();
        this.preferences = data.data.preferences;
        this.currentView = data.data.viewName;
      } else {
        this.preferences = this.getDefaultPreferences();
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      this.preferences = this.getDefaultPreferences();
    }
  }

  /**
   * Save preferences to API
   */
  async savePreferences(updates = {}) {
    try {
      this.preferences = { ...this.preferences, ...updates };

      const response = await this.authFetch('/api/dashboard/preferences', {
        method: 'POST',
        body: JSON.stringify({
          viewName: this.currentView,
          preferences: this.preferences
        })
      });

      if (response.ok) {
        this.showToast('Preferences saved!', 'success');
      } else {
        this.showToast('Failed to save preferences', 'error');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.showToast('Error saving preferences', 'error');
    }
  }

  /**
   * Setup chart control buttons
   */
  setupChartControls() {
    document.querySelectorAll('.chart-container').forEach(chart => {
      const chartId = chart.dataset.chartId || chart.id;
      this.charts.set(chartId, chart);

      // Add control buttons to chart header
      const header = chart.querySelector('.chart-header');
      if (!header) return;

      // Create controls container
      const controls = document.createElement('div');
      controls.className = 'chart-controls flex items-center gap-2';
      controls.innerHTML = `
        <button class="favorite-btn p-1 hover:bg-bloomberg-elevated rounded transition-colors"
                data-chart-id="${chartId}"
                title="Add to favorites">
          <span class="star-icon text-gray-400">☆</span>
        </button>
        <button class="visibility-toggle p-1 hover:bg-bloomberg-elevated rounded transition-colors"
                data-chart-id="${chartId}"
                title="Hide chart">
          <span class="eye-icon">👁</span>
        </button>
        <button class="drag-handle p-1 hover:bg-bloomberg-elevated rounded transition-colors cursor-move"
                draggable="true"
                data-chart-id="${chartId}"
                title="Drag to reorder">
          <span class="grip-icon">⋮⋮</span>
        </button>
      `;

      header.appendChild(controls);

      // Event listeners
      controls.querySelector('.favorite-btn').addEventListener('click', () => {
        this.toggleFavorite(chartId);
      });

      controls.querySelector('.visibility-toggle').addEventListener('click', () => {
        this.toggleVisibility(chartId);
      });
    });
  }

  /**
   * Setup view selector dropdown and buttons
   */
  setupViewSelector() {
    const dashboardHeader = document.querySelector('.dashboard-header');
    if (!dashboardHeader) return;

    // Add view selector to header
    const viewSelector = document.createElement('div');
    viewSelector.className = 'view-selector flex items-center gap-2';
    viewSelector.innerHTML = `
      <select id="dashboard-view-select" class="bg-bloomberg-elevated border border-bloomberg-border rounded px-3 py-1.5 text-sm">
        <option value="default" selected>Default View</option>
      </select>
      <button id="save-view-btn" class="px-3 py-1.5 bg-bloomberg-accent hover:bg-bloomberg-accent-hover rounded text-sm transition-colors">
        Save As...
      </button>
      <button id="manage-views-btn" class="px-3 py-1.5 bg-bloomberg-elevated hover:bg-bloomberg-card border border-bloomberg-border rounded text-sm transition-colors">
        Manage Views
      </button>
    `;

    dashboardHeader.appendChild(viewSelector);

    // Load all views
    this.loadAllViews();

    // Event listeners
    document.getElementById('dashboard-view-select').addEventListener('change', (e) => {
      this.switchView(e.target.value);
    });

    document.getElementById('save-view-btn').addEventListener('click', () => {
      this.showSaveViewDialog();
    });

    document.getElementById('manage-views-btn').addEventListener('click', () => {
      this.showManageViewsDialog();
    });
  }

  /**
   * Load all available views into dropdown
   */
  async loadAllViews() {
    try {
      const response = await this.authFetch('/api/dashboard/views');
      if (response.ok) {
        const data = await response.json();
        const select = document.getElementById('dashboard-view-select');
        if (!select) return;

        select.innerHTML = '';
        data.data.forEach(view => {
          const option = document.createElement('option');
          option.value = view.viewName;
          option.textContent = view.viewName;
          option.selected = view.isActive;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading views:', error);
    }
  }

  /**
   * Switch to a different view
   */
  async switchView(viewName) {
    try {
      const response = await this.authFetch(`/api/dashboard/views/${viewName}/activate`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        this.preferences = data.data.preferences;
        this.currentView = viewName;
        this.applyPreferences();
        this.showToast(`Switched to ${viewName}`, 'success');
      }
    } catch (error) {
      console.error('Error switching view:', error);
      this.showToast('Error switching view', 'error');
    }
  }

  /**
   * Setup HTML5 drag and drop for chart reordering
   */
  setupDragDrop() {
    document.querySelectorAll('.drag-handle').forEach(handle => {
      handle.addEventListener('dragstart', this.handleDragStart.bind(this));
      handle.addEventListener('dragend', this.handleDragEnd.bind(this));
    });

    document.querySelectorAll('.chart-container').forEach(chart => {
      chart.addEventListener('dragover', this.handleDragOver.bind(this));
      chart.addEventListener('drop', this.handleDrop.bind(this));
    });
  }

  handleDragStart(e) {
    const chartId = e.target.dataset.chartId;
    const chartElement = this.charts.get(chartId);

    this.isDragging = true;
    this.draggedElement = chartElement;

    chartElement.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', chartElement.innerHTML);
  }

  handleDragOver(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  handleDrop(e) {
    if (!this.isDragging) return;
    e.stopPropagation();
    e.preventDefault();

    const targetChart = e.currentTarget;

    if (this.draggedElement !== targetChart) {
      const parent = targetChart.parentNode;
      const draggedIndex = Array.from(parent.children).indexOf(this.draggedElement);
      const targetIndex = Array.from(parent.children).indexOf(targetChart);

      if (draggedIndex < targetIndex) {
        parent.insertBefore(this.draggedElement, targetChart.nextSibling);
      } else {
        parent.insertBefore(this.draggedElement, targetChart);
      }

      // Save new order
      this.saveChartOrder();
    }

    return false;
  }

  handleDragEnd(e) {
    this.isDragging = false;
    if (this.draggedElement) {
      this.draggedElement.style.opacity = '1';
    }
    this.draggedElement = null;
  }

  /**
   * Save chart order after drag and drop
   */
  saveChartOrder() {
    const currentTab = this.getCurrentTab();
    const chartContainers = document.querySelectorAll(`#tab-${currentTab} .chart-container`);

    const newOrder = Array.from(chartContainers).map((el, idx) => {
      const chartId = el.dataset.chartId || el.id;
      return { id: chartId, order: idx };
    });

    // Update preferences
    if (this.preferences.tabs[currentTab]) {
      newOrder.forEach(({ id, order }) => {
        const chart = this.preferences.tabs[currentTab].charts.find(c => c.id === id);
        if (chart) {
          chart.order = order;
        }
      });

      this.savePreferences();
    }
  }

  /**
   * Toggle chart visibility
   */
  toggleVisibility(chartId) {
    const currentTab = this.getCurrentTab();
    const chart = this.preferences.tabs[currentTab]?.charts.find(c => c.id === chartId);

    if (chart) {
      chart.visible = !chart.visible;
      this.applyPreferences();
      this.savePreferences();

      const icon = document.querySelector(`[data-chart-id="${chartId}"] .eye-icon`);
      if (icon) {
        icon.textContent = chart.visible ? '👁' : '🚫';
      }
    }
  }

  /**
   * Toggle chart favorite status
   */
  toggleFavorite(chartId) {
    const currentTab = this.getCurrentTab();
    const chart = this.preferences.tabs[currentTab]?.charts.find(c => c.id === chartId);

    if (chart) {
      chart.favorited = !chart.favorited;
      this.savePreferences();
      this.updateFavorites();

      const icon = document.querySelector(`[data-chart-id="${chartId}"] .star-icon`);
      if (icon) {
        icon.textContent = chart.favorited ? '★' : '☆';
        icon.classList.toggle('text-yellow-400', chart.favorited);
        icon.classList.toggle('text-gray-400', !chart.favorited);
      }
    }
  }

  /**
   * Apply current preferences to dashboard
   */
  applyPreferences() {
    const currentTab = this.getCurrentTab();
    const tabPrefs = this.preferences.tabs[currentTab];

    if (!tabPrefs) return;

    // Apply visibility
    tabPrefs.charts.forEach(chart => {
      const el = this.charts.get(chart.id);
      if (el) {
        el.style.display = chart.visible ? 'block' : 'none';
      }
    });

    // Apply order
    this.reorderCharts(tabPrefs.charts);

    // Update favorites
    this.updateFavorites();

    // Update UI state
    this.updateChartControls();
  }

  /**
   * Reorder charts based on preferences
   */
  reorderCharts(charts) {
    const currentTab = this.getCurrentTab();
    const container = document.querySelector(`#tab-${currentTab} .charts-grid`);
    if (!container) return;

    const sortedCharts = [...charts].sort((a, b) => a.order - b.order);

    sortedCharts.forEach(chartPref => {
      const chartEl = this.charts.get(chartPref.id);
      if (chartEl && chartEl.parentNode === container) {
        container.appendChild(chartEl);
      }
    });
  }

  /**
   * Update favorites tab
   */
  updateFavorites() {
    // Create favorites tab if it doesn't exist
    let favoritesTab = document.querySelector('[data-tab="favorites"]');
    if (!favoritesTab) {
      this.createFavoritesTab();
      favoritesTab = document.querySelector('[data-tab="favorites"]');
    }

    const favoritesGrid = document.getElementById('favorites-grid');
    if (!favoritesGrid) return;

    favoritesGrid.innerHTML = '';
    let count = 0;

    // Collect all favorited charts
    Object.keys(this.preferences.tabs).forEach(tabName => {
      this.preferences.tabs[tabName].charts.forEach(chart => {
        if (chart.favorited) {
          const chartEl = this.charts.get(chart.id);
          if (chartEl) {
            const clone = chartEl.cloneNode(true);
            clone.dataset.sourceTab = tabName;
            clone.classList.add('favorited-chart');
            favoritesGrid.appendChild(clone);
            count++;
          }
        }
      });
    });

    // Update count
    const countBadge = favoritesTab.querySelector('.favorites-count');
    if (countBadge) {
      countBadge.textContent = count;
    }

    // Show/hide favorites tab
    if (count > 0) {
      favoritesTab.style.display = 'block';
    }
  }

  /**
   * Create favorites tab
   */
  createFavoritesTab() {
    const tabsContainer = document.querySelector('.dashboard-tabs');
    if (!tabsContainer) return;

    // Add tab button
    const favTab = document.createElement('button');
    favTab.className = 'dashboard-tab';
    favTab.dataset.tab = 'favorites';
    favTab.innerHTML = `
      Favorites ⭐
      <span class="favorites-count ml-1 px-2 py-0.5 bg-bloomberg-accent rounded-full text-xs">0</span>
    `;
    tabsContainer.insertBefore(favTab, tabsContainer.firstChild);

    // Add tab content
    const mainContent = document.querySelector('.dashboard-content');
    if (mainContent) {
      const favContent = document.createElement('div');
      favContent.id = 'tab-favorites';
      favContent.className = 'tab-content hidden';
      favContent.innerHTML = `
        <div id="favorites-grid" class="charts-grid grid grid-cols-1 lg:grid-cols-2 gap-6"></div>
      `;
      mainContent.insertBefore(favContent, mainContent.firstChild);
    }

    // Add click handler
    favTab.addEventListener('click', () => {
      document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

      favTab.classList.add('active');
      document.getElementById('tab-favorites').classList.remove('hidden');
    });
  }

  /**
   * Update chart control button states
   */
  updateChartControls() {
    const currentTab = this.getCurrentTab();
    const tabPrefs = this.preferences.tabs[currentTab];

    if (!tabPrefs) return;

    tabPrefs.charts.forEach(chart => {
      const starIcon = document.querySelector(`[data-chart-id="${chart.id}"] .star-icon`);
      const eyeIcon = document.querySelector(`[data-chart-id="${chart.id}"] .eye-icon`);

      if (starIcon) {
        starIcon.textContent = chart.favorited ? '★' : '☆';
        starIcon.classList.toggle('text-yellow-400', chart.favorited);
        starIcon.classList.toggle('text-gray-400', !chart.favorited);
      }

      if (eyeIcon) {
        eyeIcon.textContent = chart.visible ? '👁' : '🚫';
      }
    });
  }

  /**
   * Show save view dialog
   */
  showSaveViewDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="bg-bloomberg-elevated border border-bloomberg-border rounded-lg p-6 max-w-md w-full">
        <h3 class="text-xl font-semibold mb-4">Save Dashboard View</h3>
        <input type="text" id="new-view-name"
               class="w-full px-4 py-2 bg-bloomberg-surface border border-bloomberg-border rounded mb-4"
               placeholder="Enter view name...">
        <div class="flex justify-end gap-2">
          <button id="cancel-save-view" class="px-4 py-2 bg-bloomberg-surface hover:bg-bloomberg-card rounded transition-colors">
            Cancel
          </button>
          <button id="confirm-save-view" class="px-4 py-2 bg-bloomberg-accent hover:bg-bloomberg-accent-hover rounded transition-colors">
            Save
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector('#cancel-save-view').addEventListener('click', () => {
      dialog.remove();
    });

    dialog.querySelector('#confirm-save-view').addEventListener('click', async () => {
      const viewName = document.getElementById('new-view-name').value.trim();
      if (!viewName) {
        this.showToast('Please enter a view name', 'error');
        return;
      }

      try {
        const response = await this.authFetch('/api/dashboard/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            viewName,
            preferences: this.preferences
          })
        });

        if (response.ok) {
          this.showToast(`View '${viewName}' saved!`, 'success');
          this.loadAllViews();
          dialog.remove();
        } else {
          const data = await response.json();
          this.showToast(data.error || 'Failed to save view', 'error');
        }
      } catch (error) {
        console.error('Error saving view:', error);
        this.showToast('Error saving view', 'error');
      }
    });
  }

  /**
   * Show manage views dialog
   */
  async showManageViewsDialog() {
    try {
      const response = await this.authFetch('/api/dashboard/views');
      const data = await response.json();
      const views = data.data;

      const dialog = document.createElement('div');
      dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      dialog.innerHTML = `
        <div class="bg-bloomberg-elevated border border-bloomberg-border rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-semibold mb-4">Manage Dashboard Views</h3>
          <div id="views-list" class="space-y-2 mb-4">
            ${views.map(view => `
              <div class="flex items-center justify-between p-3 bg-bloomberg-surface rounded border border-bloomberg-border ${view.isActive ? 'border-bloomberg-accent' : ''}">
                <div>
                  <span class="font-medium">${view.viewName}</span>
                  ${view.isActive ? '<span class="ml-2 text-xs text-bloomberg-accent">Active</span>' : ''}
                </div>
                <div class="flex gap-2">
                  ${!view.isActive ? `<button class="activate-view px-3 py-1 bg-bloomberg-accent hover:bg-bloomberg-accent-hover rounded text-sm transition-colors" data-view="${view.viewName}">Activate</button>` : ''}
                  ${view.viewName !== 'default' ? `<button class="delete-view px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors" data-view="${view.viewName}">Delete</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <button id="close-manage-views" class="w-full px-4 py-2 bg-bloomberg-surface hover:bg-bloomberg-card rounded transition-colors">
            Close
          </button>
        </div>
      `;

      document.body.appendChild(dialog);

      // Event listeners
      dialog.querySelectorAll('.activate-view').forEach(btn => {
        btn.addEventListener('click', async () => {
          const viewName = btn.dataset.view;
          await this.switchView(viewName);
          dialog.remove();
        });
      });

      dialog.querySelectorAll('.delete-view').forEach(btn => {
        btn.addEventListener('click', async () => {
          const viewName = btn.dataset.view;
          if (confirm(`Delete view '${viewName}'?`)) {
            try {
              const response = await this.authFetch(`/api/dashboard/views/${viewName}`, {
                method: 'DELETE'
              });

              if (response.ok) {
                this.showToast(`View '${viewName}' deleted`, 'success');
                this.loadAllViews();
                dialog.remove();
              }
            } catch (error) {
              console.error('Error deleting view:', error);
              this.showToast('Error deleting view', 'error');
            }
          }
        });
      });

      dialog.querySelector('#close-manage-views').addEventListener('click', () => {
        dialog.remove();
      });
    } catch (error) {
      console.error('Error loading views:', error);
      this.showToast('Error loading views', 'error');
    }
  }

  /**
   * Get current active tab
   */
  getCurrentTab() {
    const activeTab = document.querySelector('.dashboard-tab.active');
    return activeTab ? activeTab.dataset.tab : 'performance';
  }

  /**
   * Get default preferences
   */
  getDefaultPreferences() {
    return {
      viewName: 'default',
      tabs: {
        performance: {
          charts: [
            { id: 'chart-attribution', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-excess-return', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-drawdown', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-rolling-stats', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        risk: {
          charts: [
            { id: 'chart-risk-decomposition', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-var', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-correlation', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-stress', visible: true, order: 3, size: 'normal', favorited: false },
            { id: 'chart-concentration-treemap', visible: true, order: 4, size: 'normal', favorited: false }
          ]
        },
        attribution: {
          charts: [
            { id: 'chart-regional', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-sector-rotation', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-peer-benchmarking', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-alpha-decay', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        construction: {
          charts: [
            { id: 'chart-efficient-frontier', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-turnover', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-liquidity', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-tca-boxplot', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        specialized: {
          charts: [
            { id: 'chart-alternatives', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-esg-radar', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-goals', visible: true, order: 2, size: 'normal', favorited: false }
          ]
        }
      },
      colorScheme: 'bloomberg-default',
      compactMode: false,
      showExportButtons: true
    };
  }

  /**
   * Use default preferences (fallback)
   */
  useDefaultPreferences() {
    this.preferences = this.getDefaultPreferences();
    this.currentView = 'default';
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-up ${
      type === 'success' ? 'bg-green-600' :
      type === 'error' ? 'bg-red-600' :
      'bg-bloomberg-accent'
    }`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize when dashboard is loaded
if (document.querySelector('.dashboard-content') || document.querySelector('[data-page="advanced-analytics"]')) {
  window.addEventListener('DOMContentLoaded', () => {
    window.dashboardCustomization = new DashboardCustomization();
  });
}
