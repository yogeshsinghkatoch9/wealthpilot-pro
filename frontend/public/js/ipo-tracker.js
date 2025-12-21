/**
 * IPO Tracker - Live IPO data with API integration
 */

console.log('=== IPO TRACKER SCRIPT LOADED ===');

// Global state
let allIPOs = [];
let currentFilter = {
  sector: 'all',
  status: 'all'
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIPOTracker);
} else {
  initIPOTracker();
}

async function initIPOTracker() {
  console.log('=== INITIALIZING IPO TRACKER ===');

  // Fetch stats
  await loadStats();

  // Fetch upcoming IPOs
  await loadIPOs();

  // Setup filter listeners
  setupFilterListeners();

  console.log('=== INITIALIZATION COMPLETE ===');
}

async function loadStats() {
  try {
    const response = await fetch('/api/ipo-calendar/stats', {
      credentials: 'include'
    });
    const data = await response.json();
    console.log('IPO stats:', data);

    if (data.success && data.data) {
      updateStatsDisplay(data.data);
    }
  } catch (error) {
    console.error('Error fetching IPO stats:', error);
  }
}

async function loadIPOs(days = 90) {
  try {
    const response = await fetch(`/api/ipo-calendar/upcoming?days=${days}&limit=200`, {
      credentials: 'include'
    });
    const data = await response.json();
    console.log('IPO data:', data);

    if (data.success && data.data) {
      allIPOs = data.data;
      displayIPOs(allIPOs);
    } else {
      showMessage('No IPO data available. Click Refresh to load live data.');
    }
  } catch (error) {
    console.error('Error fetching IPOs:', error);
    showMessage('Error loading IPO data');
  }
}

function setupFilterListeners() {
  const sectorFilter = document.getElementById('sector-filter');
  const statusFilter = document.getElementById('status-filter');
  const refreshBtn = document.getElementById('refresh-btn');

  if (sectorFilter) {
    sectorFilter.addEventListener('change', () => {
      currentFilter.sector = sectorFilter.value;
      applyFilters();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      currentFilter.status = statusFilter.value;
      applyFilters();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await refreshIPOData();
    });
  }
}

function applyFilters() {
  let filtered = [...allIPOs];

  if (currentFilter.sector !== 'all') {
    filtered = filtered.filter(ipo => ipo.sector === currentFilter.sector);
  }

  if (currentFilter.status !== 'all') {
    filtered = filtered.filter(ipo => ipo.status === currentFilter.status);
  }

  displayIPOs(filtered);
}

function displayIPOs(ipos) {
  const container = document.getElementById('ipo-content');
  if (!container) return;

  if (!ipos || ipos.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #9ca3af;">
        <svg style="width: 80px; height: 80px; margin: 0 auto 1.5rem; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: #fff;">No IPOs Found</h3>
        <p>No IPOs match your current filters. Try adjusting your selection.</p>
      </div>
    `;
    return;
  }

  const html = `
    <div style="background: #1a1f2e; border-radius: 12px; padding: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h2 style="color: #f59e0b; font-size: 1.5rem; margin: 0;">
          Upcoming IPOs (${ipos.length})
        </h2>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #374151;">
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Company</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Symbol</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">IPO Date</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Price Range</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Sector</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Status</th>
              <th style="padding: 1rem; text-align: left; color: #9ca3af; font-weight: 600;">Market Cap</th>
            </tr>
          </thead>
          <tbody>
            ${ipos.map(ipo => `
              <tr style="border-bottom: 1px solid #374151; transition: background 0.2s;" onmouseover="this.style.background='#252b3b'" onmouseout="this.style.background='transparent'">
                <td style="padding: 1rem;">
                  <div style="font-weight: 600; color: #fff; margin-bottom: 0.25rem;">${ipo.company_name}</div>
                  <div style="font-size: 0.75rem; color: #9ca3af;">${ipo.industry || 'N/A'}</div>
                </td>
                <td style="padding: 1rem; color: #f59e0b; font-weight: 600; font-family: 'Monaco', monospace;">${ipo.symbol}</td>
                <td style="padding: 1rem; color: #fff;">${formatDate(ipo.ipo_date)}</td>
                <td style="padding: 1rem; color: #fff;">
                  ${ipo.price_range_low && ipo.price_range_high ?
                    `$${ipo.price_range_low.toFixed(2)} - $${ipo.price_range_high.toFixed(2)}` :
                    'TBD'}
                </td>
                <td style="padding: 1rem;">
                  <span style="padding: 0.25rem 0.75rem; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; color: #60a5fa; font-size: 0.75rem; font-weight: 600;">
                    ${ipo.sector || 'N/A'}
                  </span>
                </td>
                <td style="padding: 1rem;">
                  <span style="padding: 0.25rem 0.75rem; background: ${getStatusColor(ipo.status).bg}; border: 1px solid ${getStatusColor(ipo.status).border}; border-radius: 6px; color: ${getStatusColor(ipo.status).text}; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">
                    ${ipo.status}
                  </span>
                </td>
                <td style="padding: 1rem; color: #fff; font-family: 'Monaco', monospace;">
                  ${ipo.market_cap ? formatMarketCap(ipo.market_cap) : 'N/A'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function updateStatsDisplay(stats) {
  const thisWeekEl = document.getElementById('stat-this-week');
  const thisMonthEl = document.getElementById('stat-this-month');
  const thisQuarterEl = document.getElementById('stat-this-quarter');
  const totalMarketCapEl = document.getElementById('stat-total-market-cap');

  if (thisWeekEl) thisWeekEl.textContent = stats.thisWeek || 0;
  if (thisMonthEl) thisMonthEl.textContent = stats.thisMonth || 0;
  if (thisQuarterEl) thisQuarterEl.textContent = stats.thisQuarter || 0;
  if (totalMarketCapEl) totalMarketCapEl.textContent = formatMarketCap(stats.totalMarketCap || 0);
}

async function refreshIPOData() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    const originalText = refreshBtn.innerHTML;
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = 'Refreshing...';

    try {
      const response = await fetch('/api/ipo-calendar/refresh', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        showMessage(`Refreshed: ${data.total} IPOs loaded`, 'success');
        await loadIPOs();
        await loadStats();
      } else {
        showMessage('Failed to refresh IPO data', 'error');
      }
    } catch (error) {
      console.error('Error refreshing IPO data:', error);
      showMessage('Error refreshing IPO data', 'error');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = originalText;
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatMarketCap(value) {
  if (!value || value === 0) return 'N/A';

  const num = parseFloat(value);
  if (num >= 1000000000) {
    return `$${(num / 1000000000).toFixed(2)}B`;
  } else if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  } else {
    return `$${num.toFixed(2)}`;
  }
}

function getStatusColor(status) {
  const colors = {
    filed: { bg: 'rgba(156, 163, 175, 0.15)', border: 'rgba(156, 163, 175, 0.3)', text: '#9ca3af' },
    priced: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
    upcoming: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' },
    withdrawn: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' }
  };

  return colors[status] || colors.filed;
}

function showMessage(message, type = 'info') {
  console.log(`[${type}] ${message}`);
  // Could add toast notification here
}
