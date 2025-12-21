/**
 * Market Movers Dashboard - Real-time Client
 * Handles live data fetching, WebSocket updates, and auto-refresh
 */

let ws = null;
let wsReconnectAttempts = 0;
let autoRefreshInterval = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('[MarketMovers] Initializing dashboard...');

  // Connect WebSocket for real-time updates
  connectWebSocket();

  // Auto-refresh every 30 seconds (fallback if WebSocket fails)
  autoRefreshInterval = setInterval(refreshData, AUTO_REFRESH_INTERVAL);

  console.log('[MarketMovers] Dashboard initialized with auto-refresh');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  if (ws) {
    ws.close();
  }
});

/**
 * Refresh all market movers data
 */
async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;

  btn.disabled = true;
  btn.classList.add('opacity-50');

  try {
    const response = await fetch('/api/market/movers', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Update all sections
    updateGainersList(data.gainers || []);
    updateLosersList(data.losers || []);
    updateActiveList(data.active || []);

    // Update timestamp
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      lastUpdate.textContent = new Date(data.lastUpdated || new Date()).toLocaleTimeString();
    }

    console.log('[MarketMovers] Data refreshed successfully');

  } catch (error) {
    console.error('[MarketMovers] Refresh error:', error);
    showError('Failed to refresh market movers data. Please try again.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

/**
 * Update Top Gainers list
 */
function updateGainersList(gainers) {
  const container = document.getElementById('gainersList');
  const countEl = document.getElementById('gainersCount');

  if (!container) return;

  if (gainers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="text-slate-500 text-sm">No gainers data available</p>
      </div>
    `;
    if (countEl) countEl.textContent = '0 STOCKS';
    return;
  }

  if (countEl) countEl.textContent = `${gainers.length} STOCKS`;

  container.innerHTML = gainers.map((stock, index) => `
    <a href="/charts?symbol=${stock.symbol}" class="block">
      <div class="stock-row stock-row-positive fade-in cursor-pointer" style="animation-delay: ${index * 50}ms">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="font-bold text-white text-sm">${stock.symbol}</div>
            <div class="text-xs text-slate-500 mt-0.5">${stock.name || stock.symbol}</div>
          </div>
          <div class="text-right">
            <div class="font-mono text-sm text-white">$${stock.price.toFixed(2)}</div>
            <div class="flex items-center justify-end gap-2 mt-0.5">
              <span class="text-xs font-mono text-emerald-400">+$${Math.abs(stock.change).toFixed(2)}</span>
              <span class="badge badge-positive">+${stock.changePercent.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  `).join('');
}

/**
 * Update Top Losers list
 */
function updateLosersList(losers) {
  const container = document.getElementById('losersList');
  const countEl = document.getElementById('losersCount');

  if (!container) return;

  if (losers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="text-slate-500 text-sm">No losers data available</p>
      </div>
    `;
    if (countEl) countEl.textContent = '0 STOCKS';
    return;
  }

  if (countEl) countEl.textContent = `${losers.length} STOCKS`;

  container.innerHTML = losers.map((stock, index) => `
    <a href="/charts?symbol=${stock.symbol}" class="block">
      <div class="stock-row stock-row-negative fade-in cursor-pointer" style="animation-delay: ${index * 50}ms">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="font-bold text-white text-sm">${stock.symbol}</div>
            <div class="text-xs text-slate-500 mt-0.5">${stock.name || stock.symbol}</div>
          </div>
          <div class="text-right">
            <div class="font-mono text-sm text-white">$${stock.price.toFixed(2)}</div>
            <div class="flex items-center justify-end gap-2 mt-0.5">
              <span class="text-xs font-mono text-red-400">$${stock.change.toFixed(2)}</span>
              <span class="badge badge-negative">${stock.changePercent.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  `).join('');
}

/**
 * Update Most Active list
 */
function updateActiveList(active) {
  const container = document.getElementById('activeList');
  const countEl = document.getElementById('activeCount');

  if (!container) return;

  if (active.length === 0) {
    container.innerHTML = `
      <div class="col-span-full empty-state">
        <p class="text-slate-500 text-sm">No activity data available</p>
      </div>
    `;
    if (countEl) countEl.textContent = '0 STOCKS';
    return;
  }

  if (countEl) countEl.textContent = `${active.length} STOCKS`;

  container.innerHTML = active.map((stock, index) => {
    const isPositive = stock.changePercent >= 0;
    return `
      <a href="/charts?symbol=${stock.symbol}" class="block">
        <div class="stock-row ${isPositive ? 'stock-row-positive' : 'stock-row-negative'} fade-in cursor-pointer" style="animation-delay: ${index * 30}ms">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-bold text-white text-sm">${stock.symbol}</div>
              <div class="text-xs text-slate-500 mt-0.5">Vol: ${(stock.volume / 1000000).toFixed(1)}M</div>
            </div>
            <div class="text-right">
              <div class="font-mono text-sm text-white">$${stock.price.toFixed(2)}</div>
              <div class="flex items-center justify-end gap-2 mt-0.5">
                <span class="badge ${isPositive ? 'badge-positive' : 'badge-negative'} text-xs">
                  ${isPositive ? '+' : ''}${stock.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Show error notification
 */
function showError(message) {
  // Check if error container exists, create if not
  let errorContainer = document.getElementById('error-notification');
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'error-notification';
    errorContainer.className = 'fixed top-4 right-4 z-50';
    document.body.appendChild(errorContainer);
  }

  const errorEl = document.createElement('div');
  errorEl.className = 'bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 mb-2 animate-slideIn';
  errorEl.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span class="text-red-300 text-sm">${message}</span>
    </div>
  `;

  errorContainer.appendChild(errorEl);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    errorEl.classList.add('animate-fadeOut');
    setTimeout(() => errorEl.remove(), 300);
  }, 5000);
}

/**
 * Update WebSocket status indicator
 */
function updateWSStatus(status) {
  const statusEl = document.getElementById('ws-status');
  if (!statusEl) return;

  statusEl.classList.remove('status-live', 'status-connecting', 'status-disconnected');

  switch(status) {
    case 'connected':
      statusEl.classList.add('status-live');
      statusEl.textContent = 'LIVE';
      break;
    case 'connecting':
      statusEl.classList.add('status-connecting');
      statusEl.textContent = 'CONNECTING';
      break;
    case 'disconnected':
      statusEl.classList.add('status-disconnected');
      statusEl.textContent = 'DISCONNECTED';
      break;
  }
}

/**
 * Connect to WebSocket for real-time updates
 */
function connectWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to backend WebSocket server on port 4000
    const wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;

    console.log('[MarketMovers] Connecting to WebSocket:', wsUrl);
    updateWSStatus('connecting');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[MarketMovers] WebSocket connected');
      updateWSStatus('connected');
      wsReconnectAttempts = 0;

      // Subscribe to market movers updates
      ws.send(JSON.stringify({
        type: 'subscribe_movers'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('[MarketMovers] Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[MarketMovers] WebSocket error:', error);
      updateWSStatus('disconnected');
    };

    ws.onclose = () => {
      console.log('[MarketMovers] WebSocket disconnected');
      updateWSStatus('disconnected');

      // Attempt to reconnect
      if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        wsReconnectAttempts++;
        console.log(`[MarketMovers] Reconnecting... (Attempt ${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connectWebSocket, RECONNECT_DELAY * wsReconnectAttempts);
      } else {
        console.log('[MarketMovers] Max reconnection attempts reached. Using auto-refresh fallback.');
        showError('WebSocket connection lost. Using auto-refresh mode.');
      }
    };

  } catch (error) {
    console.error('[MarketMovers] Failed to create WebSocket:', error);
    updateWSStatus('disconnected');
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(message) {
  switch(message.type) {
    case 'connected':
      console.log('[MarketMovers] Server acknowledged connection');
      break;

    case 'movers_update':
      console.log('[MarketMovers] Received movers update');
      if (message.data) {
        updateGainersList(message.data.gainers || []);
        updateLosersList(message.data.losers || []);
        updateActiveList(message.data.active || []);

        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
          lastUpdate.textContent = new Date(message.timestamp || new Date()).toLocaleTimeString();
        }
      }
      break;

    case 'pong':
      // Keep-alive response
      break;

    case 'error':
      console.error('[MarketMovers] Server error:', message.error);
      showError(message.error);
      break;

    default:
      console.log('[MarketMovers] Unknown message type:', message.type);
  }
}

/**
 * Send keep-alive ping every 30 seconds
 */
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
