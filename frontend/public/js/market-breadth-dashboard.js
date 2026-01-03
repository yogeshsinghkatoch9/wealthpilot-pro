/**
 * Market Breadth Dashboard - Client-side JavaScript
 * Handles all data fetching, chart rendering, and real-time updates
 */

// Global state
let currentIndex = 'SPY';
let currentADTimeframe = '1M';
let charts = {};
let autoRefreshInterval = null;
let ws = null;
let wsReconnectAttempts = 0;
let wsMaxReconnectAttempts = 5;

// Chart.js Configuration for Bloomberg style
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "'JetBrains Mono', 'Inter', sans-serif";

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[MarketBreadth] Initializing dashboard...');

  // Set up index selector
  document.getElementById('indexSelector').addEventListener('change', (e) => {
    currentIndex = e.target.value;
    refreshAllData();
  });

  // Set up search on Enter key
  document.getElementById('stockSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchStock();
    }
  });

  // Initial data load
  await refreshAllData();

  // Connect to WebSocket for real-time updates
  connectWebSocket();

  // Auto-refresh every 60 seconds as fallback
  autoRefreshInterval = setInterval(refreshAllData, 60000);

  console.log('[MarketBreadth] Dashboard initialized successfully');
});

/**
 * Connect to WebSocket for real-time updates
 */
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || (protocol === 'wss:' ? 443 : 80)}/ws`;

  console.log('[MarketBreadth] Connecting to WebSocket:', wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[MarketBreadth] WebSocket connected');
    wsReconnectAttempts = 0;

    // Update status indicator
    document.getElementById('ws-status').textContent = 'LIVE';
    document.getElementById('ws-status').className = 'status-live';

    // Subscribe to current index
    ws.send(JSON.stringify({
      type: 'subscribe_breadth',
      index: currentIndex
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('[MarketBreadth] Error parsing WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('[MarketBreadth] WebSocket error:', error);
    document.getElementById('ws-status').textContent = 'ERROR';
    document.getElementById('ws-status').className = 'status-offline';
  };

  ws.onclose = () => {
    console.log('[MarketBreadth] WebSocket disconnected');
    document.getElementById('ws-status').textContent = 'DISCONNECTED';
    document.getElementById('ws-status').className = 'status-offline';

    // Attempt to reconnect
    if (wsReconnectAttempts < wsMaxReconnectAttempts) {
      wsReconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
      console.log(`[MarketBreadth] Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${wsMaxReconnectAttempts})`);
      setTimeout(connectWebSocket, delay);
    } else {
      console.error('[MarketBreadth] Max reconnection attempts reached');
      document.getElementById('ws-status').textContent = 'OFFLINE';
    }
  };
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(data) {
  console.log('[MarketBreadth] WebSocket message received:', data.type);

  switch (data.type) {
    case 'connected':
      console.log('[MarketBreadth] WebSocket acknowledged connection');
      break;

    case 'breadth_update':
      if (data.index === currentIndex) {
        updateDashboardFromWebSocket(data.data);
      }
      break;

    case 'error':
      console.error('[MarketBreadth] WebSocket error:', data.error);
      showError(`WebSocket error: ${data.error}`);
      break;

    case 'pong':
      console.log('[MarketBreadth] Pong received');
      break;

    default:
      console.warn('[MarketBreadth] Unknown WebSocket message type:', data.type);
  }
}

/**
 * Update dashboard from WebSocket data
 */
function updateDashboardFromWebSocket(data) {
  console.log('[MarketBreadth] Updating dashboard from WebSocket data');

  // Update health score if available
  if (data.healthScore) {
    updateHealthScoreFromData(data.healthScore, data.advanceDecline, data.maBreath, data.highsLows);
  }

  // Update MA breadth
  if (data.maBreath) {
    updateMABreadthFromData(data.maBreath);
  }

  // Update last update timestamp
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

  // Add subtle animation to indicate update
  document.querySelectorAll('.bloomberg-card').forEach(card => {
    card.classList.add('fade-in');
    setTimeout(() => card.classList.remove('fade-in'), 500);
  });
}

/**
 * Update health score from WebSocket data
 */
function updateHealthScoreFromData(healthScore, advanceDecline, maBreath, highsLows) {
  const score = healthScore.score;
  const signal = healthScore.signal;

  // Animate score update
  const healthScoreEl = document.getElementById('healthScore');
  const healthScoreValueEl = document.getElementById('healthScoreValue');
  const healthCircle = document.getElementById('healthCircle');

  // Add fade-in animation
  healthScoreEl.style.opacity = '0';
  setTimeout(() => {
    healthScoreEl.textContent = score;
    healthScoreValueEl.textContent = score + '/100';
    healthScoreEl.style.opacity = '1';
  }, 100);

  // Update circular progress with smooth transition
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (score / 100) * circumference;
  healthCircle.style.strokeDashoffset = offset;

  // Update color based on score with smooth transition
  let color = '#6b7280'; // neutral
  if (score >= 65) color = '#10b981'; // bullish
  else if (score <= 35) color = '#ef4444'; // bearish
  healthCircle.style.stroke = color;

  // Update signal
  const signalEl = document.getElementById('overallSignal');
  signalEl.textContent = signal;
  signalEl.className = 'mt-4 px-4 py-2 rounded text-sm font-bold ' + getSignalClass(signal);

  // Update component scores if available
  if (advanceDecline) {
    document.getElementById('adSignal').textContent = advanceDecline.signal;
    document.getElementById('advancingCount').textContent = advanceDecline.advancing;
    document.getElementById('decliningCount').textContent = advanceDecline.declining;
    document.getElementById('adLineValue').textContent = advanceDecline.currentADLine?.toFixed(0) || '--';
  }

  if (maBreath) {
    document.getElementById('maSignal').textContent = maBreath.ma200?.signal || '--';
    document.getElementById('ma200Pct').textContent = (maBreath.ma200?.percentage || '--') + '%';
    document.getElementById('ma50Pct').textContent = (maBreath.ma50?.percentage || '--') + '%';
  }

  if (highsLows) {
    document.getElementById('hlSignal').textContent = highsLows.signal;
    document.getElementById('newHighs').textContent = highsLows.newHighs52w;
    document.getElementById('newLows').textContent = highsLows.newLows52w;
    document.getElementById('hlIndex').textContent = highsLows.hlIndex;
  }
}

/**
 * Update MA breadth from WebSocket data
 */
function updateMABreadthFromData(maBreath) {
  ['20', '50', '100', '200'].forEach(period => {
    const key = `ma${period}`;
    if (maBreath[key]) {
      const pct = parseFloat(maBreath[key].percentage);
      document.getElementById(`${key}Value`).textContent = pct.toFixed(1) + '%';
      document.getElementById(`${key}Bar`).style.width = pct + '%';
    }
  });
}

/**
 * Refresh all market breadth data
 */
async function refreshAllData() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle><path class="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> UPDATING...';

  try {
    document.getElementById('ws-status').textContent = 'UPDATING...';
    document.getElementById('ws-status').className = 'status-offline';

    console.log(`[MarketBreadth] Fetching data for ${currentIndex}...`);

    // Fetch all data in parallel
    const [healthData, adData, maData, hlData, providerHealth] = await Promise.all([
      fetchMarketHealth(currentIndex),
      fetchADLine(currentIndex),
      fetchMABreadth(currentIndex),
      fetchHighsLows(currentIndex),
      fetchProviderHealth()
    ]);

    // Update UI
    updateHealthScore(healthData);
    updateADLineChart(adData);
    updateMABreadth(maData);
    updateHighsLowsChart(hlData);
    updateProviderStatus(providerHealth);

    // Update timestamp
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    document.getElementById('ws-status').textContent = 'LIVE';
    document.getElementById('ws-status').className = 'status-live';

    console.log('[MarketBreadth] Data refresh complete');

  } catch (error) {
    console.error('[MarketBreadth] Error refreshing data:', error);
    document.getElementById('ws-status').textContent = 'ERROR';
    document.getElementById('ws-status').className = 'status-offline';

    showError('Failed to refresh market breadth data. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> REFRESH';
  }
}

/**
 * Fetch market health data
 */
async function fetchMarketHealth(index) {
  const response = await fetch(`/api/market-breadth/health/${index}`, {
    credentials: 'include'
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch market health');
  return data.data;
}

/**
 * Fetch A/D Line data
 */
async function fetchADLine(index) {
  const response = await fetch(`/api/market-breadth/advance-decline/${index}?period=${currentADTimeframe}`, {
    credentials: 'include'
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch A/D Line');
  return data.data;
}

/**
 * Fetch MA Breadth data
 */
async function fetchMABreadth(index) {
  const response = await fetch(`/api/market-breadth/percent-above-ma/${index}?periods=20,50,100,200`, {
    credentials: 'include'
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch MA Breadth');
  return data.data;
}

/**
 * Fetch Highs-Lows data
 */
async function fetchHighsLows(index) {
  const response = await fetch(`/api/market-breadth/highs-lows/${index}`, {
    credentials: 'include'
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch Highs-Lows');
  return data.data;
}

/**
 * Fetch provider health
 */
async function fetchProviderHealth() {
  const response = await fetch('/api/market-breadth/provider-health', {
    credentials: 'include'
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch provider health');
  return data.providers;
}

/**
 * Update health score display
 */
function updateHealthScore(data) {
  const score = data.healthScore;
  const signal = data.overallSignal;

  // Animate score update
  const healthScoreEl = document.getElementById('healthScore');
  const healthScoreValueEl = document.getElementById('healthScoreValue');
  const healthCircle = document.getElementById('healthCircle');

  // Add fade-in animation
  healthScoreEl.style.opacity = '0';
  setTimeout(() => {
    healthScoreEl.textContent = score;
    healthScoreValueEl.textContent = score + '/100';
    healthScoreEl.style.opacity = '1';
  }, 100);

  // Update circular progress with smooth transition
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (score / 100) * circumference;
  healthCircle.style.strokeDashoffset = offset;

  // Update color based on score with smooth transition
  let color = '#6b7280'; // neutral
  if (score >= 65) color = '#10b981'; // bullish
  else if (score <= 35) color = '#ef4444'; // bearish
  healthCircle.style.stroke = color;

  // Update signal
  const signalEl = document.getElementById('overallSignal');
  signalEl.textContent = signal;
  signalEl.className = 'mt-4 px-4 py-2 rounded text-sm font-bold ' + getSignalClass(signal);

  // Update component scores
  document.getElementById('adSignal').textContent = data.indicators.advanceDecline.signal;
  document.getElementById('advancingCount').textContent = data.indicators.advanceDecline.advancing;
  document.getElementById('decliningCount').textContent = data.indicators.advanceDecline.declining;
  document.getElementById('adLineValue').textContent = data.indicators.advanceDecline.currentADLine.toFixed(0);

  document.getElementById('maSignal').textContent = data.indicators.maBreath.signal;
  document.getElementById('ma200Pct').textContent = (data.indicators.maBreath.ma200?.percentage?.toFixed(1) || '--') + '%';
  document.getElementById('ma50Pct').textContent = (data.indicators.maBreath.ma50?.percentage?.toFixed(1) || '--') + '%';

  document.getElementById('hlSignal').textContent = data.indicators.highsLows.signal;
  document.getElementById('newHighs').textContent = data.indicators.highsLows.newHighs;
  document.getElementById('newLows').textContent = data.indicators.highsLows.newLows;
  document.getElementById('hlIndex').textContent = data.indicators.highsLows.hlIndex;
}

/**
 * Update A/D Line chart
 */
function updateADLineChart(data) {
  const canvas = document.getElementById('adLineChart');
  const ctx = canvas.getContext('2d');

  // Add loading state
  canvas.classList.add('updating');

  if (charts.adLine) {
    charts.adLine.destroy();
  }

  const adData = data.adData || [];
  const labels = adData.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const values = adData.map(d => d.adLine);

  // Remove loading state after a short delay for smooth transition
  setTimeout(() => {
    canvas.classList.remove('updating');
  }, 100);

  charts.adLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'A/D Line',
        data: values,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeInOutQuart'
      },
      transitions: {
        active: {
          animation: {
            duration: 300
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#161b22',
          titleColor: '#f59e0b',
          bodyColor: '#fff',
          borderColor: '#30363d',
          borderWidth: 1
        }
      },
      scales: {
        x: { grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } },
        y: { grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } }
      }
    }
  });

  // Update stats
  const latest = adData[adData.length - 1] || {};
  document.getElementById('adRatio').textContent = latest.adRatio?.toFixed(2) || '--';
  document.getElementById('netAdvances').textContent = latest.netAdvances || '--';
  document.getElementById('totalIssues').textContent = data.totalIssues || '--';
}

/**
 * Update MA Breadth display
 */
function updateMABreadth(data) {
  const periods = data.maPeriods;

  // Update bars and values
  ['20', '50', '100', '200'].forEach(period => {
    const key = `ma${period}`;
    if (periods[key]) {
      const pct = periods[key].percentage;
      document.getElementById(`${key}Value`).textContent = pct.toFixed(1) + '%';
      document.getElementById(`${key}Bar`).style.width = pct + '%';
    }
  });
}

/**
 * Update Highs-Lows chart
 */
function updateHighsLowsChart(data) {
  const canvas = document.getElementById('highsLowsChart');
  const ctx = canvas.getContext('2d');

  // Add loading state
  canvas.classList.add('updating');

  if (charts.highsLows) {
    charts.highsLows.destroy();
  }

  // Remove loading state after a short delay
  setTimeout(() => {
    canvas.classList.remove('updating');
  }, 100);

  charts.highsLows = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['52-Week Highs', '52-Week Lows', '20-Day Highs', '20-Day Lows'],
      datasets: [{
        label: 'Count',
        data: [data.newHighs52w, -data.newLows52w, data.newHighs20d, -data.newLows20d],
        backgroundColor: ['#10b981', '#ef4444', '#10b981', '#ef4444'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeInOutQuart'
      },
      transitions: {
        active: {
          animation: {
            duration: 300
          }
        }
      },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8b949e', font: { size: 10 } } },
        y: { grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } }
      }
    }
  });

  document.getElementById('hlRatio').textContent = data.hlRatio?.toFixed(2) || '--';
}

/**
 * Update provider status
 */
function updateProviderStatus(providers) {
  const html = Object.entries(providers).map(([name, health]) => {
    const status = health.available ? '✅' : '❌';
    const errors = health.errorCount > 0 ? ` (${health.errorCount} errors)` : '';
    return `<div>${status} ${name}${errors}</div>`;
  }).join('');

  document.getElementById('providerStatus').innerHTML = html;
}

/**
 * Get CSS class for signal
 */
function getSignalClass(signal) {
  if (signal.includes('BULLISH')) return 'bg-emerald-500 text-white';
  if (signal.includes('BEARISH')) return 'bg-red-500 text-white';
  return 'bg-slate-700 text-white';
}

/**
 * Change A/D timeframe
 */
function changeADTimeframe(timeframe) {
  console.log(`[MarketBreadth] ⏱️ Changing A/D timeframe from ${currentADTimeframe} to ${timeframe}`);
  currentADTimeframe = timeframe;

  // Update button active states
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.timeframe === timeframe) {
      btn.classList.add('active');
      console.log(`[MarketBreadth] ✓ Activated ${timeframe} button`);
    }
  });

  // Show loading state
  console.log(`[MarketBreadth] 📊 Fetching ${timeframe} data for ${currentIndex}...`);

  // Fetch and update chart with new timeframe data
  fetchADLine(currentIndex).then(data => {
    console.log(`[MarketBreadth] ✓ Loaded ${data.adData.length} data points for ${timeframe} period`);
    console.log(`[MarketBreadth] 📈 Updating A/D Line chart...`);
    updateADLineChart(data);
    console.log(`[MarketBreadth] ✓ Chart updated successfully`);
  }).catch(error => {
    console.error('[MarketBreadth] ❌ Error changing A/D timeframe:', error);
    showError('Failed to update A/D Line chart');
  });
}

/**
 * Show error message
 */
function showError(message) {
  if (typeof showToast !== 'undefined') {
    showToast(message, 'error');
  } else {
    console.error(message);
  }
}

/**
 * Search for stock
 */
async function searchStock() {
  const searchInput = document.getElementById('stockSearch');
  const query = searchInput.value.trim().toUpperCase();

  if (!query) {
    showError('Please enter a stock symbol');
    return;
  }

  const modal = document.getElementById('searchModal');
  const resultsDiv = document.getElementById('searchResults');

  modal.classList.remove('hidden');
  resultsDiv.innerHTML = '<div class="text-center text-slate-400">Searching...</div>';

  try {
    // Search using the market data API
    const response = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`, {
      credentials: 'include'
    });

    const data = await response.json();

    if (!data.success || !data.results || data.results.length === 0) {
      resultsDiv.innerHTML = `
        <div class="text-center text-slate-400 py-8">
          <svg class="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No results found for "${query}"</p>
          <p class="text-sm mt-2">Try searching for: AAPL, TSLA, MSFT, etc.</p>
        </div>
      `;
      return;
    }

    // Display results
    const html = data.results.map(stock => `
      <div class="bg-bloomberg-elevated border border-bloomberg-border rounded p-4 mb-3 hover:border-amber-500 transition-colors">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-lg font-bold text-white font-mono">${stock.symbol}</span>
              <span class="text-sm text-slate-400">${stock.name || 'N/A'}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
              <div>
                <div class="text-xs text-slate-500 uppercase">Price</div>
                <div class="text-white">${stock.price ? '$' + stock.price.toFixed(2) : '--'}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500 uppercase">Change</div>
                <div class="${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                  ${stock.changePercent !== undefined ? stock.changePercent.toFixed(2) + '%' : '--'}
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 uppercase">Volume</div>
                <div class="text-white">${stock.volume ? formatVolume(stock.volume) : '--'}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500 uppercase">Exchange</div>
                <div class="text-slate-400">${stock.exchange || 'N/A'}</div>
              </div>
            </div>
          </div>
          <a href="/holdings?symbol=${stock.symbol}" class="bloomberg-btn bloomberg-btn-ghost ml-4">
            View Details
          </a>
        </div>
      </div>
    `).join('');

    resultsDiv.innerHTML = html;

  } catch (error) {
    console.error('Search error:', error);
    resultsDiv.innerHTML = `
      <div class="text-center text-red-400 py-8">
        <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>Error searching for stocks</p>
        <p class="text-sm mt-2 text-slate-400">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Close search modal
 */
function closeSearchModal() {
  const modal = document.getElementById('searchModal');
  modal.classList.add('hidden');
}

/**
 * Format volume for display
 */
function formatVolume(volume) {
  if (volume >= 1000000) {
    return (volume / 1000000).toFixed(2) + 'M';
  } else if (volume >= 1000) {
    return (volume / 1000).toFixed(2) + 'K';
  }
  return volume.toString();
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  // Destroy all charts
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });
});

// Expose functions globally for onclick handlers
window.changeADTimeframe = changeADTimeframe;
window.searchStock = searchStock;
window.closeSearchModal = closeSearchModal;
window.refreshAllData = refreshAllData;

console.log('[MarketBreadth] Dashboard script loaded');
