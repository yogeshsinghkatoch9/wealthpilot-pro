/**
 * Dividend Calendar Client-Side JavaScript
 * Handles fetching and displaying dividend data
 */

class DividendCalendar {
  constructor() {
    this.currentView = 'upcoming';
    this.dividendData = [];
    this.trackedData = [];
    this.init();
  }

  async init() {
    console.log('Dividend calendar initializing...');

    try {
      // Load initial data
      await this.loadStats();
      await this.loadUpcomingDividends();

      // Setup event listeners
      this.setupEventListeners();

      console.log('Dividend calendar initialized successfully');
    } catch (error) {
      console.error('Error initializing dividend calendar:', error);
      this.showError('Failed to initialize dividend calendar');
    }
  }

  setupEventListeners() {
    // View switcher buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshData();
    });

    // Export button
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchDividends(e.target.value);
      }, 500);
    });
  }

  async loadStats() {
    try {
      console.log('Loading dividend stats...');
      const response = await fetch('/api/dividend-calendar/stats', {
        credentials: 'include'
      });

      console.log('Stats response status:', response.status);
      const result = await response.json();
      console.log('Stats result:', result);

      if (result.success) {
        this.updateStats(result.data);
      } else {
        console.error('Failed to load stats:', result.error);
        // Set default stats
        this.updateStats({ today: 0, thisWeek: 0, thisMonth: 0, upcoming: 0 });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      // Set default stats on error
      this.updateStats({ today: 0, thisWeek: 0, thisMonth: 0, upcoming: 0 });
    }
  }

  updateStats(stats) {
    const todayEl = document.getElementById('stat-today');
    const weekEl = document.getElementById('stat-week');
    const monthEl = document.getElementById('stat-month');
    const totalEl = document.getElementById('stat-total');

    if (todayEl) todayEl.textContent = stats.today || 0;
    if (weekEl) weekEl.textContent = stats.thisWeek || 0;
    if (monthEl) monthEl.textContent = stats.thisMonth || 0;
    if (totalEl) totalEl.textContent = stats.upcoming || 0;

    console.log('Stats updated:', stats);
  }

  async loadUpcomingDividends() {
    try {
      console.log('Loading upcoming dividends...');
      this.showLoading(true);

      const response = await fetch('/api/dividend-calendar/upcoming?limit=100', {
        credentials: 'include'
      });

      console.log('Dividends response status:', response.status);
      const result = await response.json();
      console.log('Dividends result:', result);

      if (result.success) {
        this.dividendData = result.data;
        this.displayDividends(result.data);
        console.log(`Loaded ${result.data.length} dividends`);
      } else {
        console.error('Failed to load dividends:', result.error);
        this.showError(result.error || 'Failed to load dividend data');
        this.displayDividends([]);
      }
    } catch (error) {
      console.error('Error loading dividends:', error);
      this.showError('Failed to load dividend data: ' + error.message);
      this.displayDividends([]);
    } finally {
      this.showLoading(false);
    }
  }

  async loadTrackedDividends() {
    try {
      this.showLoading(true);

      const response = await fetch('/api/dividend-calendar/my-dividends', {
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        this.trackedData = result.data;
        this.displayTrackedDividends(result.data);
      }
    } catch (error) {
      console.error('Error loading tracked dividends:', error);
      this.showError('Failed to load your dividends');
    } finally {
      this.showLoading(false);
    }
  }

  displayDividends(dividends) {
    const grid = document.getElementById('dividends-grid');

    if (!dividends || dividends.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-gray-400">No upcoming dividends found</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = dividends.map(div => this.createDividendCard(div)).join('');

    // Add click listeners to cards
    grid.querySelectorAll('.dividend-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.showDividendDetails(dividends[index]);
      });
    });
  }

  createDividendCard(dividend) {
    const exDate = new Date(dividend.ex_dividend_date);
    const payDate = dividend.payment_date ? new Date(dividend.payment_date) : null;
    const today = new Date();

    const daysUntilEx = Math.ceil((exDate - today) / (1000 * 60 * 60 * 24));
    const isUpcoming = daysUntilEx >= 0;

    const frequencyBadge = dividend.frequency === 'monthly' ? 'badge-monthly' :
                          dividend.frequency === 'quarterly' ? 'badge-quarterly' :
                          'badge-annual';

    return `
      <div class="dividend-card">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold text-white mb-1">${dividend.symbol}</h3>
            <p class="text-sm text-gray-400">${dividend.company_name}</p>
          </div>
          <span class="badge ${frequencyBadge}">${dividend.frequency || 'quarterly'}</span>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-xs text-gray-400 mb-1">Dividend Amount</p>
            <p class="text-lg font-bold text-amber-400">$${dividend.dividend_amount.toFixed(4)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-1">Yield</p>
            <p class="text-lg font-bold text-green-400">${dividend.dividend_yield ? dividend.dividend_yield.toFixed(2) + '%' : 'N/A'}</p>
          </div>
        </div>

        <div class="border-t border-gray-700 pt-4 space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">Ex-Dividend Date:</span>
            <span class="text-white font-semibold">${exDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          ${payDate ? `
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Payment Date:</span>
              <span class="text-emerald-400 font-semibold">${payDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          ` : ''}
          ${isUpcoming ? `
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Days Until Ex-Date:</span>
              <span class="text-blue-400 font-semibold">${daysUntilEx} ${daysUntilEx === 1 ? 'day' : 'days'}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  displayTrackedDividends(dividends) {
    const grid = document.getElementById('tracked-dividends-grid');

    if (!dividends || dividends.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
          </svg>
          <p class="text-gray-400 mb-2">No dividends from your holdings</p>
          <p class="text-sm text-gray-500">Add dividend-paying stocks to your portfolio to track them here</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = dividends.map(div => this.createTrackedDividendCard(div)).join('');

    // Add click listeners
    grid.querySelectorAll('.dividend-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.showDividendDetails(dividends[index]);
      });
    });
  }

  createTrackedDividendCard(dividend) {
    const exDate = new Date(dividend.ex_dividend_date);
    const payDate = dividend.payment_date ? new Date(dividend.payment_date) : null;
    const estimatedIncome = parseFloat(dividend.estimated_income || 0);

    const frequencyBadge = dividend.frequency === 'monthly' ? 'badge-monthly' :
                          dividend.frequency === 'quarterly' ? 'badge-quarterly' :
                          'badge-annual';

    return `
      <div class="dividend-card">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold text-white mb-1">${dividend.symbol}</h3>
            <p class="text-sm text-gray-400">${dividend.company_name}</p>
            <p class="text-xs text-gray-500 mt-1">${dividend.portfolio_name || 'Your Portfolio'}</p>
          </div>
          <span class="badge ${frequencyBadge}">${dividend.frequency || 'quarterly'}</span>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-xs text-gray-400 mb-1">Your Shares</p>
            <p class="text-lg font-bold text-white">${dividend.shares.toFixed(2)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-1">Estimated Income</p>
            <p class="text-lg font-bold text-emerald-400">$${estimatedIncome.toFixed(2)}</p>
          </div>
        </div>

        <div class="border-t border-gray-700 pt-4 space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">Dividend/Share:</span>
            <span class="text-amber-400 font-semibold">$${dividend.dividend_amount.toFixed(4)}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">Ex-Date:</span>
            <span class="text-white font-semibold">${exDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
          ${payDate ? `
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Pay Date:</span>
              <span class="text-emerald-400 font-semibold">${payDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  showDividendDetails(dividend) {
    const modal = document.getElementById('dividend-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    modalTitle.textContent = `${dividend.symbol} - Dividend Details`;

    const exDate = new Date(dividend.ex_dividend_date);
    const payDate = dividend.payment_date ? new Date(dividend.payment_date) : null;
    const recordDate = dividend.record_date ? new Date(dividend.record_date) : null;
    const declDate = dividend.declaration_date ? new Date(dividend.declaration_date) : null;

    modalBody.innerHTML = `
      <div class="space-y-6">
        <div>
          <h4 class="text-lg font-semibold text-amber-500 mb-3">${dividend.company_name}</h4>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-800 rounded-lg p-4">
              <p class="text-xs text-gray-400 mb-1">Dividend Amount</p>
              <p class="text-2xl font-bold text-amber-400">$${dividend.dividend_amount.toFixed(4)}</p>
              <p class="text-xs text-gray-500 mt-1">per share</p>
            </div>
            <div class="bg-slate-800 rounded-lg p-4">
              <p class="text-xs text-gray-400 mb-1">Dividend Yield</p>
              <p class="text-2xl font-bold text-green-400">${dividend.dividend_yield ? dividend.dividend_yield.toFixed(2) + '%' : 'N/A'}</p>
              <p class="text-xs text-gray-500 mt-1">annual yield</p>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-700 pt-4">
          <h5 class="text-sm font-semibold text-gray-300 mb-3">Important Dates</h5>
          <div class="space-y-3">
            ${declDate ? `
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Declaration Date:</span>
                <span class="text-white">${declDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ` : ''}
            <div class="flex items-center justify-between bg-blue-500/10 p-2 rounded">
              <span class="text-gray-400">Ex-Dividend Date:</span>
              <span class="text-blue-400 font-semibold">${exDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            ${recordDate ? `
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Record Date:</span>
                <span class="text-white">${recordDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ` : ''}
            ${payDate ? `
              <div class="flex items-center justify-between bg-emerald-500/10 p-2 rounded">
                <span class="text-gray-400">Payment Date:</span>
                <span class="text-emerald-400 font-semibold">${payDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ` : ''}
          </div>
        </div>

        ${dividend.shares ? `
          <div class="border-t border-gray-700 pt-4">
            <h5 class="text-sm font-semibold text-gray-300 mb-3">Your Position</h5>
            <div class="bg-emerald-500/10 rounded-lg p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-gray-400">Shares Owned:</span>
                <span class="text-white font-semibold">${dividend.shares.toFixed(2)}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Estimated Dividend Income:</span>
                <span class="text-emerald-400 font-bold text-xl">$${(dividend.shares * dividend.dividend_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="border-t border-gray-700 pt-4">
          <p class="text-xs text-gray-500">
            <strong>Note:</strong> To receive this dividend, you must own the stock before the ex-dividend date.
            If you buy on or after the ex-dividend date, you will not receive this dividend.
          </p>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  async searchDividends(query) {
    if (!query || query.trim().length === 0) {
      // Show all dividends
      if (this.currentView === 'upcoming') {
        this.displayDividends(this.dividendData);
      } else {
        this.displayTrackedDividends(this.trackedData);
      }
      return;
    }

    try {
      const response = await fetch(`/api/dividend-calendar/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        this.displayDividends(result.data);
      }
    } catch (error) {
      console.error('Error searching dividends:', error);
    }
  }

  switchView(view) {
    this.currentView = view;

    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Hide all views
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));

    // Show selected view
    if (view === 'upcoming') {
      document.getElementById('upcoming-view').classList.remove('hidden');
      if (this.dividendData.length === 0) {
        this.loadUpcomingDividends();
      }
    } else if (view === 'tracked') {
      document.getElementById('tracked-view').classList.remove('hidden');
      if (this.trackedData.length === 0) {
        this.loadTrackedDividends();
      }
    }
  }

  async refreshData() {
    await this.loadStats();
    if (this.currentView === 'upcoming') {
      await this.loadUpcomingDividends();
    } else {
      await this.loadTrackedDividends();
    }
    this.showToast('Data refreshed successfully', 'success');
  }

  exportData() {
    const data = this.currentView === 'upcoming' ? this.dividendData : this.trackedData;

    if (data.length === 0) {
      this.showToast('No data to export', 'warning');
      return;
    }

    // Create CSV
    const headers = ['Symbol', 'Company', 'Ex-Date', 'Payment Date', 'Amount', 'Yield', 'Frequency'];
    const rows = data.map(d => [
      d.symbol,
      d.company_name,
      d.ex_dividend_date,
      d.payment_date || '',
      d.dividend_amount,
      d.dividend_yield || '',
      d.frequency || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dividend-calendar-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.showToast('Data exported successfully', 'success');
  }

  showLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const upcomingView = document.getElementById('upcoming-view');
    const trackedView = document.getElementById('tracked-view');

    console.log('showLoading called:', show);

    if (!loadingState || !upcomingView || !trackedView) {
      console.error('Loading elements not found!');
      return;
    }

    if (show) {
      loadingState.classList.remove('hidden');
      upcomingView.classList.add('hidden');
      trackedView.classList.add('hidden');
    } else {
      loadingState.classList.add('hidden');
      if (this.currentView === 'upcoming') {
        upcomingView.classList.remove('hidden');
      } else {
        trackedView.classList.remove('hidden');
      }
    }
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-emerald-500' :
      type === 'error' ? 'bg-red-500' :
      type === 'warning' ? 'bg-amber-500' :
      'bg-blue-500'
    } text-white`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// Close modal function
function closeDividendModal() {
  document.getElementById('dividend-modal').classList.add('hidden');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.dividendCalendar = new DividendCalendar();
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('dividend-modal');
  if (e.target === modal) {
    closeDividendModal();
  }
});
