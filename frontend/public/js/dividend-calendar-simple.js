/**
 * Modern Dividend Calendar - User-Centric Design
 */

console.log('=== DIVIDEND CALENDAR SCRIPT LOADED ===');

// Global state
let allDividends = [];
let filteredDividends = [];
let currentView = 'upcoming';
let currentSort = 'date-asc';
let currentCalendarDate = new Date();
let miniCalendarDate = new Date();

// Test if DOM is ready
if (document.readyState === 'loading') {
  console.log('DOM still loading, waiting...');
  document.addEventListener('DOMContentLoaded', initDividendCalendar);
} else {
  console.log('DOM already loaded, initializing immediately');
  initDividendCalendar();
}

async function initDividendCalendar() {
  console.log('=== INITIALIZING DIVIDEND CALENDAR ===');

  // Fetch stats
  try {
    console.log('Fetching dividend stats...');
    const response = await fetch('/api/dividend-calendar/stats', {
      credentials: 'include'
    });

    const data = await response.json();
    console.log('Stats data:', data);

    if (data.success && data.data) {
      updateStats(data.data);
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
  }

  // Fetch dividends
  try {
    console.log('Fetching upcoming dividends...');
    const response = await fetch('/api/dividend-calendar/upcoming?limit=50', {
      credentials: 'include'
    });

    const data = await response.json();
    console.log('Dividends data:', data);

    if (data.success && data.data) {
      allDividends = data.data;
      filteredDividends = [...allDividends];

      sortDividends();
      displayDividends(filteredDividends);
      updateResultsCount(filteredDividends.length);

      // Hide loading and show content
      hideLoading();
    }
  } catch (error) {
    console.error('Error fetching dividends:', error);
    hideLoading();
    showToast('Error loading dividend data', 'error');
  }

  // Setup all interactive features
  setupSearch();
  setupViewToggles();
  setupSort();
  setupRefreshButton();
  setupExportButton();
  setupCalendar();
  setupMiniCalendar();

  // Render mini calendar initially
  renderMiniCalendar();

  console.log('=== INITIALIZATION COMPLETE ===');
}

// Update stats cards
function updateStats(stats) {
  document.getElementById('stat-today').textContent = stats.today || 0;
  document.getElementById('stat-week').textContent = stats.thisWeek || 0;
  document.getElementById('stat-month').textContent = stats.thisMonth || 0;
  document.getElementById('stat-total').textContent = stats.upcoming || 0;
}

// Display dividends
function displayDividends(dividends) {
  const grid = document.getElementById('dividends-grid');
  const emptyState = document.getElementById('empty-state');

  if (!grid) return;

  if (!dividends || dividends.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const html = dividends.map(div => {
    const exDate = new Date(div.ex_dividend_date);
    const payDate = div.payment_date ? new Date(div.payment_date) : null;
    const daysUntil = Math.ceil((exDate - new Date()) / (1000 * 60 * 60 * 24));

    const freqBadge = div.frequency === 'monthly' ? 'badge-monthly' :
                      div.frequency === 'quarterly' ? 'badge-quarterly' : 'badge-annual';

    return `
      <div class="dividend-card" data-symbol="${div.symbol}">
        <div class="card-header">
          <div class="card-symbol-info">
            <div class="card-symbol">${div.symbol}</div>
            <div class="card-company">${div.company_name}</div>
          </div>
          <span class="frequency-badge ${freqBadge}">${div.frequency || 'quarterly'}</span>
        </div>

        <div class="card-metrics">
          <div class="metric">
            <span class="metric-label">Dividend</span>
            <span class="metric-value amount">$${div.dividend_amount.toFixed(4)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Yield</span>
            <span class="metric-value yield">${div.dividend_yield ? div.dividend_yield.toFixed(2) + '%' : 'N/A'}</span>
          </div>
        </div>

        <div class="card-dates">
          <div class="date-row">
            <span class="date-label">Ex-Dividend Date</span>
            <span class="date-value highlight">${formatDate(exDate)}</span>
          </div>
          ${payDate ? `
            <div class="date-row">
              <span class="date-label">Payment Date</span>
              <span class="date-value">${formatDate(payDate)}</span>
            </div>
          ` : ''}
          ${daysUntil >= 0 ? `
            <div class="date-row">
              <span class="date-label">Days Until</span>
              <span class="days-until">${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = html;

  // Add click handlers
  const cards = grid.querySelectorAll('.dividend-card');
  cards.forEach((card, index) => {
    card.addEventListener('click', () => {
      showDividendModal(dividends[index]);
    });
  });

  console.log(`Displayed ${dividends.length} dividend cards`);
}

// Format date helper
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Update results count
function updateResultsCount(count) {
  const resultsCount = document.getElementById('results-count');
  const trackedCount = document.getElementById('tracked-count');

  if (currentView === 'upcoming' && resultsCount) {
    resultsCount.textContent = `${count} dividend${count !== 1 ? 's' : ''} found`;
  } else if (currentView === 'tracked' && trackedCount) {
    trackedCount.textContent = `${count} tracked`;
  }
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  const clearSearch = document.getElementById('clear-search');

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();

    // Show/hide clear button
    if (searchTerm && clearSearch) {
      clearSearch.classList.remove('hidden');
    } else if (clearSearch) {
      clearSearch.classList.add('hidden');
    }

    // Filter dividends
    if (searchTerm === '') {
      filteredDividends = [...allDividends];
    } else {
      filteredDividends = allDividends.filter(div =>
        div.symbol.toLowerCase().includes(searchTerm) ||
        div.company_name.toLowerCase().includes(searchTerm)
      );
    }

    sortDividends();
    displayDividends(filteredDividends);
    updateResultsCount(filteredDividends.length);
  });

  // Clear search button
  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      clearSearch.classList.add('hidden');
      filteredDividends = [...allDividends];
      sortDividends();
      displayDividends(filteredDividends);
      updateResultsCount(filteredDividends.length);
    });
  }

  console.log('Search functionality initialized');
}

// View toggle functionality
function setupViewToggles() {
  const viewBtns = document.querySelectorAll('.view-btn');
  const upcomingView = document.getElementById('upcoming-view');
  const calendarView = document.getElementById('calendar-view');
  const trackedView = document.getElementById('tracked-view');

  viewBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;

      // Update button states
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Hide all views
      upcomingView.classList.add('hidden');
      calendarView.classList.add('hidden');
      trackedView.classList.add('hidden');

      // Switch views
      if (view === 'upcoming') {
        upcomingView.classList.remove('hidden');
        currentView = 'upcoming';
        displayDividends(filteredDividends);
        updateResultsCount(filteredDividends.length);
      } else if (view === 'calendar') {
        calendarView.classList.remove('hidden');
        currentView = 'calendar';
        renderCalendar();
      } else if (view === 'tracked') {
        trackedView.classList.remove('hidden');
        currentView = 'tracked';
        await loadTrackedDividends();
      }
    });
  });

  console.log('View toggles initialized');
}

// Load tracked dividends
async function loadTrackedDividends() {
  try {
    const response = await fetch('/api/dividend-calendar/my-dividends', {
      credentials: 'include'
    });

    const data = await response.json();

    const grid = document.getElementById('tracked-dividends-grid');
    const emptyState = document.getElementById('tracked-empty-state');

    if (grid && data.success && data.data) {
      if (data.data.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
        displayDividends(data.data);
        updateResultsCount(data.data.length);
      }
    }
  } catch (error) {
    console.error('Error loading tracked dividends:', error);
    showToast('Error loading tracked dividends', 'error');
  }
}

// Sort functionality
function setupSort() {
  const sortSelect = document.getElementById('sort-select');

  if (!sortSelect) return;

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortDividends();
    displayDividends(filteredDividends);
  });

  console.log('Sort functionality initialized');
}

// Sort dividends based on current sort option
function sortDividends() {
  switch (currentSort) {
    case 'date-asc':
      filteredDividends.sort((a, b) => new Date(a.ex_dividend_date) - new Date(b.ex_dividend_date));
      break;
    case 'date-desc':
      filteredDividends.sort((a, b) => new Date(b.ex_dividend_date) - new Date(a.ex_dividend_date));
      break;
    case 'amount-desc':
      filteredDividends.sort((a, b) => b.dividend_amount - a.dividend_amount);
      break;
    case 'amount-asc':
      filteredDividends.sort((a, b) => a.dividend_amount - b.dividend_amount);
      break;
    case 'yield-desc':
      filteredDividends.sort((a, b) => (b.dividend_yield || 0) - (a.dividend_yield || 0));
      break;
    case 'yield-asc':
      filteredDividends.sort((a, b) => (a.dividend_yield || 0) - (b.dividend_yield || 0));
      break;
  }
}

// Refresh button
function setupRefreshButton() {
  const refreshBtn = document.getElementById('refresh-btn');

  if (!refreshBtn) return;

  refreshBtn.addEventListener('click', async () => {
    console.log('Refreshing dividend data from API...');

    const originalHTML = refreshBtn.innerHTML;
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      Refreshing...
    `;

    try {
      const response = await fetch('/api/dividend-calendar/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        showToast('Dividend data refreshed successfully!', 'success');
        // Reload the page to show fresh data
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast('Failed to refresh data', 'error');
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      showToast('Error refreshing dividend data', 'error');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = originalHTML;
    }
  });

  console.log('Refresh button initialized');
}

// Export button
function setupExportButton() {
  const exportBtn = document.getElementById('export-btn');

  if (!exportBtn) return;

  exportBtn.addEventListener('click', () => {
    if (filteredDividends.length === 0) {
      showToast('No dividends to export', 'error');
      return;
    }

    // Create CSV
    const csv = convertToCSV(filteredDividends);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dividend-calendar-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast(`Exported ${filteredDividends.length} dividends to CSV`, 'success');
  });

  console.log('Export button initialized');
}

// Convert to CSV
function convertToCSV(dividends) {
  const headers = ['Symbol', 'Company', 'Ex-Dividend Date', 'Payment Date', 'Dividend Amount', 'Yield %', 'Frequency'];
  const rows = dividends.map(div => [
    div.symbol,
    div.company_name,
    div.ex_dividend_date,
    div.payment_date || '',
    div.dividend_amount,
    div.dividend_yield || '',
    div.frequency || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

// Show dividend modal
function showDividendModal(dividend) {
  console.log('Showing modal for', dividend.symbol);

  const modal = document.getElementById('dividend-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');

  if (!modal || !modalTitle || !modalBody) {
    console.error('Modal elements not found!');
    return;
  }

  modalTitle.textContent = `${dividend.symbol} - ${dividend.company_name}`;

  const exDate = new Date(dividend.ex_dividend_date);
  const payDate = dividend.payment_date ? new Date(dividend.payment_date) : null;
  const recordDate = dividend.record_date ? new Date(dividend.record_date) : null;
  const declDate = dividend.declaration_date ? new Date(dividend.declaration_date) : null;

  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 2rem;">
      <!-- Company Info -->
      <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%); border-radius: 12px;">
        <h4 style="font-size: 1.5rem; font-weight: 700; color: #f59e0b; margin-bottom: 1rem;">${dividend.company_name}</h4>
        <div style="font-size: 2.5rem; font-weight: 700; font-family: 'Monaco', 'Courier New', monospace; color: #fff;">${dividend.symbol}</div>
      </div>

      <!-- Key Metrics -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="background: rgba(245, 158, 11, 0.1); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
          <p style="font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.5rem;">Dividend Amount</p>
          <p style="font-size: 2rem; font-weight: 700; color: #f59e0b; font-family: 'Monaco', 'Courier New', monospace;">$${dividend.dividend_amount.toFixed(4)}</p>
          <p style="font-size: 0.75rem; color: #6b7280; margin-top: 0.5rem;">per share</p>
        </div>
        <div style="background: rgba(16, 185, 129, 0.1); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
          <p style="font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.5rem;">Dividend Yield</p>
          <p style="font-size: 2rem; font-weight: 700; color: #10b981; font-family: 'Monaco', 'Courier New', monospace;">${dividend.dividend_yield ? dividend.dividend_yield.toFixed(2) + '%' : 'N/A'}</p>
          <p style="font-size: 0.75rem; color: #6b7280; margin-top: 0.5rem;">annual yield</p>
        </div>
      </div>

      <!-- Important Dates -->
      <div style="background: rgba(26, 31, 46, 0.5); padding: 1.5rem; border-radius: 12px; border: 1px solid #2d3748;">
        <h5 style="font-size: 1rem; font-weight: 600; color: #9ca3af; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">Important Dates</h5>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${declDate ? `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #9ca3af;">Declaration Date:</span>
              <span style="color: #fff; font-weight: 600;">${formatDate(declDate)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px;">
            <span style="color: #9ca3af;">Ex-Dividend Date:</span>
            <span style="color: #3b82f6; font-weight: 700; font-size: 1.1rem;">${formatDate(exDate)}</span>
          </div>
          ${recordDate ? `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #9ca3af;">Record Date:</span>
              <span style="color: #fff; font-weight: 600;">${formatDate(recordDate)}</span>
            </div>
          ` : ''}
          ${payDate ? `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 8px;">
              <span style="color: #9ca3af;">Payment Date:</span>
              <span style="color: #10b981; font-weight: 700; font-size: 1.1rem;">${formatDate(payDate)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Info Box -->
      <div style="background: rgba(59, 130, 246, 0.05); padding: 1rem; border-radius: 8px; border-left: 3px solid #3b82f6;">
        <p style="font-size: 0.875rem; color: #9ca3af; line-height: 1.6;">
          <strong style="color: #3b82f6;">Important:</strong> To receive this dividend, you must own the stock before the ex-dividend date. The stock will trade "ex-dividend" on and after this date.
        </p>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

// Close modal
window.closeDividendModal = function() {
  const modal = document.getElementById('dividend-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('dividend-modal');
  if (e.target.classList.contains('modal-backdrop')) {
    closeDividendModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDividendModal();
  }
});

// Hide loading state
function hideLoading() {
  const loading = document.getElementById('loading-state');
  const upcomingView = document.getElementById('upcoming-view');

  if (loading) {
    loading.classList.add('hidden');
    loading.style.display = 'none';
  }

  if (upcomingView) {
    upcomingView.classList.remove('hidden');
    upcomingView.style.display = 'block';
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = toast.querySelector('.toast-icon');

  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;

  // Update icon and border color based on type
  if (type === 'error') {
    toast.style.borderColor = '#ef4444';
    toastIcon.style.color = '#ef4444';
    toastIcon.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    `;
  } else {
    toast.style.borderColor = '#10b981';
    toastIcon.style.color = '#10b981';
    toastIcon.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    `;
  }

  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Calendar functions
function setupCalendar() {
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      renderCalendar();
    });
  }

  console.log('Calendar initialized');
}

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Update month display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonthEl = document.getElementById('current-month');
  if (currentMonthEl) {
    currentMonthEl.textContent = `${monthNames[month]} ${year}`;
  }

  // Get calendar days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const prevLastDay = new Date(year, month, 0);
  const firstDayOfWeek = firstDay.getDay();
  const lastDate = lastDay.getDate();
  const prevLastDate = prevLastDay.getDate();

  const calendarDaysEl = document.getElementById('calendar-days');
  if (!calendarDaysEl) return;

  let html = '';

  // Previous month days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    html += createDayCell(prevLastDate - i, month - 1, year, true);
  }

  // Current month days
  for (let day = 1; day <= lastDate; day++) {
    html += createDayCell(day, month, year, false);
  }

  // Next month days to fill the grid
  const totalCells = html.split('calendar-day').length - 1;
  const remainingCells = 42 - totalCells; // 6 rows * 7 days
  for (let day = 1; day <= remainingCells; day++) {
    html += createDayCell(day, month + 1, year, true);
  }

  calendarDaysEl.innerHTML = html;

  // Add click handlers
  const dayElements = calendarDaysEl.querySelectorAll('.calendar-day');
  dayElements.forEach(dayEl => {
    const dateStr = dayEl.dataset.date;
    if (dateStr && !dayEl.classList.contains('other-month')) {
      dayEl.addEventListener('click', () => {
        showDayDividends(dateStr);
      });
    }
  });

  console.log('Calendar rendered');
}

function createDayCell(day, month, year, isOtherMonth) {
  const date = new Date(year, month, day);
  const dateStr = date.toISOString().split('T')[0];
  const today = new Date();
  const isToday = dateStr === today.toISOString().split('T')[0];

  // Find dividends for this day
  const dayDividends = allDividends.filter(div => {
    const exDate = div.ex_dividend_date.split('T')[0];
    const payDate = div.payment_date ? div.payment_date.split('T')[0] : null;
    return exDate === dateStr || payDate === dateStr;
  });

  const exDividends = dayDividends.filter(div => div.ex_dividend_date.split('T')[0] === dateStr);
  const payDividends = dayDividends.filter(div => div.payment_date && div.payment_date.split('T')[0] === dateStr);

  const hasDividends = dayDividends.length > 0;

  let classes = 'calendar-day';
  if (isOtherMonth) classes += ' other-month';
  if (isToday) classes += ' today';
  if (hasDividends) classes += ' has-dividends';

  let indicators = '';
  if (exDividends.length > 0) {
    indicators += '<div class="dividend-dot ex-date"></div>';
  }
  if (payDividends.length > 0) {
    indicators += '<div class="dividend-dot payment-date"></div>';
  }

  let count = '';
  if (hasDividends) {
    count = `<span class="dividend-count">${dayDividends.length} div${dayDividends.length > 1 ? 's' : ''}</span>`;
  }

  return `
    <div class="${classes}" data-date="${dateStr}">
      <div class="day-number">${day}</div>
      ${indicators ? `<div class="dividend-indicators">${indicators}</div>` : ''}
      ${count}
    </div>
  `;
}

function showDayDividends(dateStr) {
  const dividends = allDividends.filter(div => {
    const exDate = div.ex_dividend_date.split('T')[0];
    const payDate = div.payment_date ? div.payment_date.split('T')[0] : null;
    return exDate === dateStr || payDate === dateStr;
  });

  if (dividends.length === 0) {
    showToast('No dividends on this date', 'error');
    return;
  }

  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const modal = document.getElementById('dividend-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');

  if (!modal || !modalTitle || !modalBody) return;

  modalTitle.textContent = dateFormatted;

  const html = `
    <div class="day-details-list">
      ${dividends.map(div => {
        const isExDate = div.ex_dividend_date.split('T')[0] === dateStr;
        const isPayDate = div.payment_date && div.payment_date.split('T')[0] === dateStr;

        return `
          <div class="day-dividend-item" onclick="event.stopPropagation(); showDividendModal(${JSON.stringify(div).replace(/"/g, '&quot;')})">
            <div class="day-dividend-header">
              <span class="day-dividend-symbol">${div.symbol}</span>
              ${isExDate ? '<span class="legend-dot ex-date"></span>' : ''}
              ${isPayDate ? '<span class="legend-dot payment-date"></span>' : ''}
            </div>
            <div class="day-dividend-company">${div.company_name}</div>
            <div class="day-dividend-info">
              <div class="day-dividend-metric">
                <span class="day-dividend-label">Dividend Amount</span>
                <span class="day-dividend-value">$${div.dividend_amount.toFixed(4)}</span>
              </div>
              <div class="day-dividend-metric">
                <span class="day-dividend-label">Yield</span>
                <span class="day-dividend-value">${div.dividend_yield ? div.dividend_yield.toFixed(2) + '%' : 'N/A'}</span>
              </div>
              <div class="day-dividend-metric">
                <span class="day-dividend-label">Type</span>
                <span class="day-dividend-value">${isExDate ? 'Ex-Date' : 'Payment'}</span>
              </div>
              <div class="day-dividend-metric">
                <span class="day-dividend-label">Frequency</span>
                <span class="day-dividend-value">${div.frequency || 'quarterly'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(59, 130, 246, 0.05); border-radius: 8px; border-left: 3px solid #3b82f6;">
      <p style="font-size: 0.875rem; color: #9ca3af;">
        <strong style="color: #3b82f6;">Tip:</strong> Click on any dividend to see full details
      </p>
    </div>
  `;

  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

// Mini Calendar functions
function setupMiniCalendar() {
  const miniPrevBtn = document.getElementById('mini-prev-month');
  const miniNextBtn = document.getElementById('mini-next-month');

  if (miniPrevBtn) {
    miniPrevBtn.addEventListener('click', () => {
      miniCalendarDate.setMonth(miniCalendarDate.getMonth() - 1);
      renderMiniCalendar();
    });
  }

  if (miniNextBtn) {
    miniNextBtn.addEventListener('click', () => {
      miniCalendarDate.setMonth(miniCalendarDate.getMonth() + 1);
      renderMiniCalendar();
    });
  }

  console.log('Mini calendar initialized');
}

function renderMiniCalendar() {
  const year = miniCalendarDate.getFullYear();
  const month = miniCalendarDate.getMonth();

  // Update month display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const miniCurrentMonthEl = document.getElementById('mini-current-month');
  if (miniCurrentMonthEl) {
    miniCurrentMonthEl.textContent = `${monthNames[month]} ${year}`;
  }

  // Get calendar days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const prevLastDay = new Date(year, month, 0);
  const firstDayOfWeek = firstDay.getDay();
  const lastDate = lastDay.getDate();
  const prevLastDate = prevLastDay.getDate();

  const miniCalendarDaysEl = document.getElementById('mini-calendar-days');
  if (!miniCalendarDaysEl) return;

  let html = '';

  // Previous month days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    html += createMiniDayCell(prevLastDate - i, month - 1, year, true);
  }

  // Current month days
  for (let day = 1; day <= lastDate; day++) {
    html += createMiniDayCell(day, month, year, false);
  }

  // Next month days to fill the grid
  const totalCells = html.split('mini-day').length - 1;
  const remainingCells = 42 - totalCells; // 6 rows * 7 days
  for (let day = 1; day <= remainingCells; day++) {
    html += createMiniDayCell(day, month + 1, year, true);
  }

  miniCalendarDaysEl.innerHTML = html;

  // Add click handlers
  const dayElements = miniCalendarDaysEl.querySelectorAll('.mini-day');
  dayElements.forEach(dayEl => {
    const dateStr = dayEl.dataset.date;
    if (dateStr && !dayEl.classList.contains('other-month')) {
      dayEl.addEventListener('click', () => {
        showDayDividends(dateStr);
      });
    }
  });

  console.log('Mini calendar rendered');
}

function createMiniDayCell(day, month, year, isOtherMonth) {
  const date = new Date(year, month, day);
  const dateStr = date.toISOString().split('T')[0];
  const today = new Date();
  const isToday = dateStr === today.toISOString().split('T')[0];

  // Find dividends for this day
  const dayDividends = allDividends.filter(div => {
    const exDate = div.ex_dividend_date.split('T')[0];
    const payDate = div.payment_date ? div.payment_date.split('T')[0] : null;
    return exDate === dateStr || payDate === dateStr;
  });

  const hasExDate = dayDividends.some(div => div.ex_dividend_date.split('T')[0] === dateStr);
  const hasPayDate = dayDividends.some(div => div.payment_date && div.payment_date.split('T')[0] === dateStr);

  const hasDividends = dayDividends.length > 0;

  let classes = 'mini-day';
  if (isOtherMonth) classes += ' other-month';
  if (isToday) classes += ' today';
  if (hasDividends) classes += ' has-dividends';

  let dots = '';
  if (hasExDate || hasPayDate) {
    dots = '<div class="mini-day-dots">';
    if (hasExDate) dots += '<div class="mini-dot ex"></div>';
    if (hasPayDate) dots += '<div class="mini-dot pay"></div>';
    dots += '</div>';
  }

  return `
    <div class="${classes}" data-date="${dateStr}">
      <span>${day}</span>
      ${dots}
    </div>
  `;
}

console.log('=== SCRIPT SETUP COMPLETE ===');
