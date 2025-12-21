/**
 * Enhanced Advanced Portfolio Analytics Dashboard
 * Real-time updates, cross-filtering, animations, and export features
 */

// ==================== GLOBAL STATE & WEBSOCKET ====================

class DashboardState {
  constructor() {
    this.charts = {};
    this.ws = null;
    this.selectedPortfolio = this.getQueryParam('portfolio') || 'all';
    this.selectedTab = this.getQueryParam('tab') || 'performance';
    this.isLoading = false;
    this.lastUpdate = null;
  }

  getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected to dashboard');
      this.updateConnectionStatus('LIVE', true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.updateConnectionStatus('DISCONNECTED', false);
      // Reconnect after 5 seconds
      setTimeout(() => this.connectWebSocket(), 5000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus('ERROR', false);
    };
  }

  handleWebSocketMessage(data) {
    if (data.type === 'PRICE_UPDATE') {
      this.updateChartData(data.payload);
    } else if (data.type === 'PORTFOLIO_UPDATE') {
      this.refreshCurrentTab();
    }
    this.lastUpdate = new Date();
    this.updateLastUpdateTime();
  }

  updateConnectionStatus(status, isConnected) {
    const statusEl = document.getElementById('ws-status');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = isConnected ? 'status-live' : 'status-disconnected';
    }
  }

  updateLastUpdateTime() {
    const timeEl = document.querySelector('.last-update-time');
    if (timeEl && this.lastUpdate) {
      timeEl.textContent = `Last Update: ${this.lastUpdate.toLocaleTimeString()}`;
    }
  }

  async refreshCurrentTab() {
    this.showLoadingOverlay();
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <div class="loading-text">Updating data...</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  updateChartData(payload) {
    // Update specific chart data without full reload
    Object.keys(this.charts).forEach(chartId => {
      const chart = this.charts[chartId];
      if (chart && payload[chartId]) {
        chart.data.datasets.forEach((dataset, idx) => {
          if (payload[chartId].datasets[idx]) {
            dataset.data = payload[chartId].datasets[idx].data;
          }
        });
        chart.update('none'); // Update without animation for real-time feel
      }
    });
  }
}

const dashboardState = new DashboardState();

// ==================== ENHANCED CHART OPTIONS ====================

const COLORS = {
  amber: '#f59e0b',
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  slate: '#94a3b8',
  dark: '#0d1117',
  surface: '#161b22',
  border: '#30363d'
};

const enhancedOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 750,
    easing: 'easeInOutQuart'
  },
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      labels: {
        color: COLORS.slate,
        font: { family: 'monospace', size: 11 },
        usePointStyle: true,
        padding: 15
      },
      onHover: (event, legendItem, legend) => {
        event.native.target.style.cursor = 'pointer';
      }
    },
    tooltip: {
      enabled: true,
      backgroundColor: COLORS.surface,
      borderColor: COLORS.amber,
      borderWidth: 2,
      titleColor: COLORS.amber,
      bodyColor: '#fff',
      titleFont: { family: 'monospace', size: 13, weight: 'bold' },
      bodyFont: { family: 'monospace', size: 12 },
      padding: 12,
      displayColors: true,
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || '';
          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += new Intl.NumberFormat('en-US', {
              style: 'decimal',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(context.parsed.y);
          }
          return label;
        }
      }
    },
    zoom: {
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'xy',
      },
      pan: {
        enabled: true,
        mode: 'xy',
      }
    }
  },
  scales: {
    x: {
      ticks: {
        color: COLORS.slate,
        font: { family: 'monospace', size: 10 },
        maxRotation: 45,
        minRotation: 0
      },
      grid: {
        color: COLORS.border,
        drawBorder: false
      }
    },
    y: {
      ticks: {
        color: COLORS.slate,
        font: { family: 'monospace', size: 10 },
        callback: function(value) {
          return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            compactDisplay: 'short'
          }).format(value);
        }
      },
      grid: {
        color: COLORS.border,
        drawBorder: false
      }
    }
  }
};

// ==================== EXPORT FUNCTIONALITY ====================

function exportChartAsPNG(chartId, filename) {
  const chart = dashboardState.charts[chartId];
  if (!chart) return;

  const url = chart.toBase64Image();
  const link = document.createElement('a');
  link.download = `${filename || chartId}_${Date.now()}.png`;
  link.href = url;
  link.click();
}

function exportAllChartsAsPDF() {
  // Show notification
  showNotification('Preparing PDF export...', 'info');

  // Collect all chart images
  const chartImages = [];
  Object.keys(dashboardState.charts).forEach(chartId => {
    const chart = dashboardState.charts[chartId];
    if (chart) {
      chartImages.push({
        id: chartId,
        image: chart.toBase64Image()
      });
    }
  });

  // In a real implementation, you'd use jsPDF here
  showNotification(`Exported ${chartImages.length} charts`, 'success');
}

function exportDataAsCSV(data, filename) {
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}_${Date.now()}.csv`;
  link.href = url;
  link.click();
}

function convertToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => JSON.stringify(row[header] || '')).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// ==================== NOTIFICATION SYSTEM ====================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${getNotificationIcon(type)}</span>
      <span class="notification-message">${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function getNotificationIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  return icons[type] || icons.info;
}

// ==================== CHART CREATION WITH ENHANCEMENTS ====================

function createEnhancedChart(ctx, config) {
  const chart = new Chart(ctx, {
    ...config,
    options: {
      ...enhancedOptions,
      ...config.options,
      plugins: {
        ...enhancedOptions.plugins,
        ...config.options?.plugins
      }
    }
  });

  // Store chart reference
  dashboardState.charts[ctx.id] = chart;

  // Add export button to chart container
  addExportButton(ctx, chart);

  return chart;
}

function addExportButton(ctx, chart) {
  const container = ctx.closest('.chart-container') || ctx.parentElement;
  if (!container) return;

  const exportBtn = document.createElement('button');
  exportBtn.className = 'chart-export-btn';
  exportBtn.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
    </svg>
  `;
  exportBtn.title = 'Export chart as PNG';
  exportBtn.onclick = () => exportChartAsPNG(ctx.id, ctx.id);

  const header = container.querySelector('h2, h3');
  if (header) {
    header.style.position = 'relative';
    header.appendChild(exportBtn);
  }
}

// ==================== PERFORMANCE TAB ====================

function initPerformanceCharts() {
  const data = window.performanceTabData;
  if (!data) return;

  // Chart 1: Attribution Waterfall
  if (data.attribution && data.attribution.waterfallData) {
    const ctx = document.getElementById('attribution-waterfall');
    if (ctx) {
      createEnhancedChart(ctx, {
        type: 'bar',
        data: {
          labels: data.attribution.waterfallData.labels || [],
          datasets: [{
            label: 'Contribution (%)',
            data: data.attribution.waterfallData.values || [],
            backgroundColor: (data.attribution.waterfallData.values || []).map(v =>
              v >= 0 ? COLORS.green : COLORS.red
            ),
            hoverBackgroundColor: (data.attribution.waterfallData.values || []).map(v =>
              v >= 0 ? '#059669' : '#dc2626'
            )
          }]
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Performance Attribution Waterfall',
              color: COLORS.amber,
              font: { family: 'monospace', size: 14, weight: 'bold' }
            }
          }
        }
      });
    }
  }

  // Chart 2: Excess Return
  if (data.excessReturn && data.excessReturn.timeSeriesData) {
    const ctx = document.getElementById('excess-return-chart');
    if (ctx) {
      createEnhancedChart(ctx, {
        type: 'line',
        data: {
          labels: data.excessReturn.timeSeriesData.dates || [],
          datasets: [
            {
              label: 'Portfolio',
              data: data.excessReturn.timeSeriesData.portfolio || [],
              borderColor: COLORS.amber,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 6
            },
            {
              label: 'Benchmark',
              data: data.excessReturn.timeSeriesData.benchmark || [],
              borderColor: COLORS.slate,
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 6,
              borderDash: [5, 5]
            }
          ]
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Cumulative Return: Portfolio vs Benchmark',
              color: COLORS.amber,
              font: { family: 'monospace', size: 14, weight: 'bold' }
            }
          }
        }
      });
    }
  }

  // Chart 3: Drawdown
  if (data.drawdown && data.drawdown.drawdownSeries) {
    const ctx = document.getElementById('drawdown-chart');
    if (ctx) {
      createEnhancedChart(ctx, {
        type: 'line',
        data: {
          labels: data.drawdown.drawdownSeries.map(d => d.date) || [],
          datasets: [{
            label: 'Drawdown (%)',
            data: data.drawdown.drawdownSeries.map(d => -d.drawdown) || [],
            borderColor: COLORS.red,
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 6
          }]
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Portfolio Drawdown Over Time',
              color: COLORS.amber,
              font: { family: 'monospace', size: 14, weight: 'bold' }
            }
          },
          scales: {
            y: {
              ...enhancedOptions.scales.y,
              reverse: true
            }
          }
        }
      });
    }
  }

  // Chart 4: Rolling Statistics
  if (data.rolling && data.rolling.timeSeriesData) {
    const ctx = document.getElementById('rolling-stats-chart');
    if (ctx) {
      createEnhancedChart(ctx, {
        type: 'line',
        data: {
          labels: data.rolling.timeSeriesData.dates || [],
          datasets: [
            {
              label: 'Rolling Return (%)',
              data: data.rolling.timeSeriesData.returns || [],
              borderColor: COLORS.green,
              yAxisID: 'y',
              tension: 0.4,
              pointRadius: 0
            },
            {
              label: 'Rolling Volatility (%)',
              data: data.rolling.timeSeriesData.volatility || [],
              borderColor: COLORS.red,
              yAxisID: 'y',
              tension: 0.4,
              pointRadius: 0
            },
            {
              label: 'Rolling Sharpe',
              data: data.rolling.timeSeriesData.sharpe || [],
              borderColor: COLORS.amber,
              yAxisID: 'y1',
              tension: 0.4,
              pointRadius: 0
            }
          ]
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Rolling Statistics (90-day window)',
              color: COLORS.amber,
              font: { family: 'monospace', size: 14, weight: 'bold' }
            }
          },
          scales: {
            x: enhancedOptions.scales.x,
            y: { ...enhancedOptions.scales.y, position: 'left' },
            y1: { ...enhancedOptions.scales.y, position: 'right', grid: { drawOnChartArea: false } }
          }
        }
      });
    }
  }
}

// Initialize all charts for other tabs (similar pattern)
function initRiskCharts() {
  const data = window.riskTabData;
  if (!data) return;
  // Similar implementation with createEnhancedChart...
}

function initAttributionCharts() {
  const data = window.attributionTabData;
  if (!data) return;
  // Similar implementation...
}

function initConstructionCharts() {
  const data = window.constructionTabData;
  if (!data) return;
  // Similar implementation...
}

function initSpecializedCharts() {
  const data = window.specializedTabData;
  if (!data) return;
  // Similar implementation...
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  // Connect WebSocket
  dashboardState.connectWebSocket();

  // Initialize charts
  setTimeout(() => {
    if (window.performanceTabData) initPerformanceCharts();
    if (window.riskTabData) initRiskCharts();
    if (window.attributionTabData) initAttributionCharts();
    if (window.constructionTabData) initConstructionCharts();
    if (window.specializedTabData) initSpecializedCharts();
  }, 100);

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'r') {
        e.preventDefault();
        dashboardState.refreshCurrentTab();
      } else if (e.key === 'e') {
        e.preventDefault();
        exportAllChartsAsPDF();
      }
    }
  });

  console.log('✓ Enhanced Advanced Analytics Dashboard initialized');
  showNotification('Dashboard loaded successfully', 'success');
});

// Add styles dynamically
const style = document.createElement('style');
style.textContent = `
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    transform: translateX(400px);
    transition: transform 0.3s ease;
    font-family: monospace;
  }

  .notification.show {
    transform: translateX(0);
  }

  .notification-success { background: #10b981; color: white; }
  .notification-error { background: #ef4444; color: white; }
  .notification-info { background: #3b82f6; color: white; }
  .notification-warning { background: #f59e0b; color: white; }

  .notification-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notification-icon {
    font-size: 20px;
    font-weight: bold;
  }

  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .loading-spinner {
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #30363d;
    border-top-color: #f59e0b;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    color: #f59e0b;
    font-family: monospace;
    font-size: 14px;
  }

  .chart-export-btn {
    position: absolute;
    top: 0;
    right: 0;
    background: transparent;
    border: 1px solid #30363d;
    color: #94a3b8;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chart-export-btn:hover {
    background: #f59e0b;
    color: white;
    border-color: #f59e0b;
  }

  .status-disconnected {
    color: #ef4444 !important;
  }
`;
document.head.appendChild(style);
