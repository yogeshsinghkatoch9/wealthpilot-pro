/**
 * Earnings Calendar - Live earnings data with API integration
 */

console.log('=== EARNINGS CALENDAR SCRIPT LOADED ===');

// Global state
let allEarnings = [];
let filteredEarnings = [];
let userHoldings = []; // Will store user's portfolio symbols
let currentFilter = {
  holdingsType: 'all', // 'all', 'holdings', 'watchlist'
  days: 30 // 7, 30, 90
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEarningsCalendar);
} else {
  initEarningsCalendar();
}

async function initEarningsCalendar() {
  console.log('=== INITIALIZING EARNINGS CALENDAR ===');

  // Fetch user holdings first
  await fetchUserHoldings();

  // Setup filter event listeners
  setupFilterListeners();

  // Fetch stats
  try {
    const statsResponse = await fetch('/api/earnings-calendar/stats', {
      credentials: 'include'
    });
    const statsData = await statsResponse.json();
    console.log('Stats data:', statsData);
  } catch (error) {
    console.error('Error fetching stats:', error);
  }

  // Fetch upcoming earnings based on current filter
  await loadEarnings();

  // Add refresh button handler
  addRefreshButton();

  console.log('=== INITIALIZATION COMPLETE ===');
}

async function fetchUserHoldings() {
  try {
    const response = await fetch('/api/portfolios', {
      credentials: 'include'
    });
    const data = await response.json();

    if (data.success && data.portfolios) {
      // Extract all unique symbols from all portfolios
      const symbolsSet = new Set();
      data.portfolios.forEach(portfolio => {
        if (portfolio.holdings) {
          portfolio.holdings.forEach(holding => {
            symbolsSet.add(holding.symbol);
          });
        }
      });
      userHoldings = Array.from(symbolsSet);
      console.log('User holdings:', userHoldings);
    }
  } catch (error) {
    console.error('Error fetching user holdings:', error);
  }
}

function setupFilterListeners() {
  const holdingsFilter = document.getElementById('holdings-filter');
  const periodFilter = document.getElementById('period-filter');
  const applyBtn = document.getElementById('apply-filters-btn');

  // Store selected values but don't apply immediately
  if (holdingsFilter) {
    holdingsFilter.addEventListener('change', (e) => {
      // Just update the state, don't apply yet
      currentFilter.holdingsType = e.target.value;
    });
  }

  if (periodFilter) {
    periodFilter.addEventListener('change', (e) => {
      // Just update the state, don't apply yet
      currentFilter.days = parseInt(e.target.value);
    });
  }

  // Apply filters when button is clicked
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      await applyFiltersWithButton();
    });
  }
}

async function applyFiltersWithButton() {
  const applyBtn = document.getElementById('apply-filters-btn');

  if (applyBtn) {
    // Show loading state
    const originalHTML = applyBtn.innerHTML;
    applyBtn.disabled = true;
    applyBtn.innerHTML = `
      <svg style="width: 20px; height: 20px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      Loading...
    `;

    try {
      // Reload data with new time period
      await loadEarnings();

      showMessage('Results updated successfully!', 'success');
    } catch (error) {
      console.error('Error applying filters:', error);
      showMessage('Error loading results', 'error');
    } finally {
      // Restore button
      applyBtn.disabled = false;
      applyBtn.innerHTML = originalHTML;
    }
  }
}

async function loadEarnings() {
  try {
    const response = await fetch(`/api/earnings-calendar/upcoming?days=${currentFilter.days}&limit=200`, {
      credentials: 'include'
    });
    const data = await response.json();
    console.log('Earnings data:', data);

    if (data.success && data.data) {
      allEarnings = data.data;
      applyFilters();
    } else {
      showMessage('No earnings data available. Click Refresh to load live data.');
    }
  } catch (error) {
    console.error('Error fetching earnings:', error);
    showMessage('Error loading earnings data');
  }
}

function applyFilters() {
  // Start with all earnings
  let filtered = [...allEarnings];

  // Apply holdings filter
  if (currentFilter.holdingsType === 'holdings') {
    if (userHoldings.length === 0) {
      showMessage('You have no holdings in your portfolio', 'info');
      filtered = [];
    } else {
      filtered = filtered.filter(earning =>
        userHoldings.includes(earning.symbol)
      );
    }
  } else if (currentFilter.holdingsType === 'watchlist') {
    // For now, show message that watchlist feature is coming
    // In production, you'd fetch from a watchlist API
    showMessage('Watchlist feature coming soon! Showing all stocks.', 'info');
  }

  filteredEarnings = filtered;
  displayEarnings(filteredEarnings);

  // Update result count message
  const periodText = currentFilter.days === 7 ? 'this week' :
                     currentFilter.days === 30 ? 'next 30 days' :
                     'this quarter';
  const filterText = currentFilter.holdingsType === 'holdings' ? 'from your holdings ' :
                     currentFilter.holdingsType === 'watchlist' ? 'from your watchlist ' : '';

  console.log(`Showing ${filteredEarnings.length} earnings ${filterText}for ${periodText}`);
}

function displayEarnings(earnings) {
  const container = document.getElementById('earnings-content');

  // Determine filter description
  const periodText = currentFilter.days === 7 ? 'This Week' :
                     currentFilter.days === 30 ? 'Next 30 Days' :
                     'This Quarter';
  const filterText = currentFilter.holdingsType === 'holdings' ? ' (Your Holdings)' :
                     currentFilter.holdingsType === 'watchlist' ? ' (Watchlist)' : '';

  if (!earnings || earnings.length === 0) {
    let message = 'No earnings data available.';
    let subMessage = 'Click the Refresh button to load live earnings data from the API.';

    if (currentFilter.holdingsType === 'holdings' && userHoldings.length === 0) {
      message = 'No Holdings Found';
      subMessage = 'Add stocks to your portfolio to track their earnings here.';
    } else if (currentFilter.holdingsType === 'holdings') {
      message = `No Earnings ${periodText}`;
      subMessage = 'None of your holdings have earnings scheduled for this period.';
    }

    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #9ca3af;">
        <svg style="width: 80px; height: 80px; margin: 0 auto 1.5rem; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
        </svg>
        <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: #fff;">${message}</h3>
        <p>${subMessage}</p>
      </div>
    `;
    return;
  }

  const html = `
    <div style="background: #1a1f2e; border-radius: 12px; padding: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h2 style="color: #f59e0b; font-size: 1.5rem; margin: 0;">
          Earnings ${periodText}${filterText}
        </h2>
        <div style="
          padding: 0.5rem 1rem;
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          color: #f59e0b;
          font-weight: 600;
          font-size: 0.9rem;
        ">
          ${earnings.length} ${earnings.length === 1 ? 'result' : 'results'}
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;">
        ${earnings.map(earning => createEarningCard(earning)).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function createEarningCard(earning) {
  const date = new Date(earning.earnings_date);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = earning.time_of_day || 'TBD';

  const epsEstimate = earning.eps_estimate ? `$${earning.eps_estimate.toFixed(2)}` : 'N/A';
  const epsActual = earning.eps_actual ? `$${earning.eps_actual.toFixed(2)}` : '-';
  const isReported = earning.reported === 1 || earning.reported === true;

  return `
    <div style="
      background: #252b3d;
      border: 1px solid #2d3748;
      border-radius: 12px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s ease;
    " onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='#f59e0b'"
       onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='#2d3748'">

      <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
        <div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #fff; font-family: Monaco, monospace;">
            ${earning.symbol}
          </div>
          <div style="font-size: 0.9rem; color: #9ca3af; margin-top: 0.25rem;">
            ${earning.company_name}
          </div>
        </div>
        <div style="
          padding: 0.5rem 1rem;
          background: ${isReported ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)'};
          color: ${isReported ? '#10b981' : '#3b82f6'};
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          height: fit-content;
        ">
          ${isReported ? 'Reported' : 'Scheduled'}
        </div>
      </div>

      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 1rem;
        background: rgba(10, 14, 23, 0.5);
        border-radius: 8px;
      ">
        <div>
          <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">EPS Estimate</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #f59e0b; font-family: Monaco, monospace;">
            ${epsEstimate}
          </div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">EPS Actual</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: ${isReported ? '#10b981' : '#6b7280'}; font-family: Monaco, monospace;">
            ${epsActual}
          </div>
        </div>
      </div>

      <div style="
        display: flex;
        justify-content: space-between;
        padding-top: 1rem;
        border-top: 1px solid #2d3748;
        font-size: 0.9rem;
      ">
        <div>
          <span style="color: #9ca3af;">Date:</span>
          <span style="color: #fff; font-weight: 600; margin-left: 0.5rem;">${dateStr}</span>
        </div>
        <div>
          <span style="color: #9ca3af;">Time:</span>
          <span style="color: #fff; font-weight: 600; margin-left: 0.5rem;">${timeStr}</span>
        </div>
      </div>

      ${earning.fiscal_quarter ? `
        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: #9ca3af;">
          Quarter: <span style="color: #fff;">${earning.fiscal_quarter} ${earning.fiscal_year || ''}</span>
        </div>
      ` : ''}
    </div>
  `;
}

function addRefreshButton() {
  const container = document.getElementById('earnings-content');

  const refreshBtn = document.createElement('button');
  refreshBtn.innerHTML = `
    <svg style="width: 20px; height: 20px; margin-right: 0.5rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
    </svg>
    Refresh Live Data from API
  `;
  refreshBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: #000;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    transition: all 0.3s ease;
  `;

  refreshBtn.onmouseover = function() {
    this.style.transform = 'translateY(-2px)';
    this.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.4)';
  };

  refreshBtn.onmouseout = function() {
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.3)';
  };

  refreshBtn.onclick = refreshEarningsData;

  container.insertBefore(refreshBtn, container.firstChild);
}

async function refreshEarningsData() {
  console.log('Refreshing earnings data from API...');
  showMessage('Fetching live earnings data from Financial Modeling Prep API...');

  try {
    // Use current period filter for refresh
    const response = await fetch(`/api/earnings-calendar/refresh?days=${currentFilter.days}`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    console.log('Refresh result:', data);

    if (data.success) {
      showMessage(`Success! Loaded ${data.total || 0} earnings. Refreshing view...`, 'success');

      // Reload earnings data with current filters
      setTimeout(async () => {
        await loadEarnings();
      }, 1000);
    } else {
      showMessage('Failed to refresh data: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Error refreshing data:', error);
    showMessage('Error refreshing earnings data', 'error');
  }
}

function showMessage(message, type = 'info') {
  const existing = document.getElementById('earnings-message');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.id = 'earnings-message';
  msg.textContent = message;
  msg.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    padding: 1rem 1.5rem;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(msg);

  setTimeout(() => {
    msg.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => msg.remove(), 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100px); opacity: 0; }
  }
  .hero-header {
    background: linear-gradient(135deg, #0f1419 0%, #1a1f2e 100%);
    border-bottom: 1px solid #2d3748;
    padding: 2.5rem 0;
    margin-bottom: 2rem;
  }
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 2rem;
  }
  .header-content {
    display: flex;
    align-items: center;
    gap: 2rem;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .icon-wrapper {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 20px rgba(245, 158, 11, 0.3);
  }
  .header-icon {
    width: 32px;
    height: 32px;
    color: white;
  }
  .page-title {
    font-size: 2rem;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 0.5rem 0;
  }
  .page-subtitle {
    font-size: 1rem;
    color: #9ca3af;
    margin: 0;
  }
  .header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .filter-select {
    padding: 0.75rem 1.25rem;
    background: #1a1f2e;
    border: 1px solid #2d3748;
    border-radius: 8px;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23f59e0b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    background-size: 16px;
    padding-right: 2.5rem;
  }
  .filter-select:hover {
    border-color: #f59e0b;
    background-color: #252b3d;
  }
  .filter-select:focus {
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }
  .filter-select option {
    background: #1a1f2e;
    color: #fff;
  }
  .apply-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: #000;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
  }
  .apply-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  }
  .apply-btn:active:not(:disabled) {
    transform: translateY(0);
  }
  .apply-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .earnings-calendar-page {
    min-height: 100vh;
    background: #0a0e17;
    padding-bottom: 4rem;
  }
  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      align-items: flex-start;
    }
    .header-actions {
      width: 100%;
      flex-direction: column;
    }
    .filter-select {
      width: 100%;
    }
    .apply-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;
document.head.appendChild(style);

console.log('=== SCRIPT SETUP COMPLETE ===');
