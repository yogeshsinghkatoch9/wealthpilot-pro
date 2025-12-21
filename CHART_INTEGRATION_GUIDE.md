# Chart Integration Guide

Step-by-step guide for integrating the 20 advanced charts into the WealthPilot Pro dashboard.

## Quick Start

### 1. Test Charts are Working

Open the test page in your browser:
```
http://localhost:3000/chart-test.html
```

You should see all 20 chart types rendering with sample data across 5 tabs.

### 2. Verify Prerequisites

Ensure the following are loaded in `/frontend/views/partials/header.ejs`:

```html
<!-- Chart.js Core -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>

<!-- Chart.js Plugins -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.2.5/build/index.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
```

---

## Integration Pattern

All charts follow the same integration pattern:

### Step 1: Add Canvas to EJS Template

```html
<div class="chart-container">
  <div class="chart-header">
    <h3>Chart Title</h3>
    <div class="chart-controls">
      <select id="chart-period">
        <option value="1M">1 Month</option>
        <option value="3M">3 Months</option>
        <option value="1Y" selected>1 Year</option>
      </select>
    </div>
  </div>
  <canvas id="my-chart-id"></canvas>
  <div id="my-chart-export"></div>
</div>
```

### Step 2: Fetch Data from Backend

```javascript
async function loadChartData(portfolioId, period = '1Y') {
  try {
    const response = await fetch(
      `/api/advanced-analytics/endpoint-name?portfolioId=${portfolioId}&period=${period}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('Failed to load chart data:', error);
    showError('my-chart-id', error.message);
    return null;
  }
}
```

### Step 3: Transform Backend Data to Chart Format

```javascript
function transformDataForChart(backendData) {
  // Transform backend format to chart format
  return {
    labels: backendData.dates,
    values: backendData.values,
    // ... other chart-specific fields
  };
}
```

### Step 4: Create Chart

```javascript
async function renderChart(portfolioId) {
  // Show loading state
  showLoading('my-chart-id');
  
  // Fetch data
  const backendData = await loadChartData(portfolioId);
  if (!backendData) return;
  
  // Transform data
  const chartData = transformDataForChart(backendData);
  
  // Create chart
  const chart = advancedCharts.createChartType('my-chart-id', chartData);
  
  // Add export buttons
  advancedCharts.addExportButton('my-chart-id', 'my-chart-export');
  
  // Store reference
  window.myChart = chart;
  
  // Hide loading
  hideLoading('my-chart-id');
}
```

### Step 5: Handle Updates

```javascript
function updateChart(newData) {
  if (!window.myChart) return;
  
  const chartData = transformDataForChart(newData);
  
  // Update chart data
  window.myChart.data.labels = chartData.labels;
  window.myChart.data.datasets[0].data = chartData.values;
  
  // Re-render
  window.myChart.update('none'); // 'none' disables animation for faster updates
}
```

---

## Tab-Specific Integration

### Performance Tab

**File**: `/frontend/views/partials/tabs/performance-tab.ejs`

```html
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  
  <!-- Chart 1: Performance Attribution -->
  <div class="chart-container">
    <h3>Performance Attribution</h3>
    <canvas id="perf-attribution"></canvas>
    <div id="perf-attribution-export"></div>
  </div>
  
  <!-- Chart 2: Excess Return -->
  <div class="chart-container">
    <h3>Excess Return vs Benchmark</h3>
    <canvas id="excess-return"></canvas>
    <div id="excess-return-export"></div>
  </div>
  
  <!-- Chart 3: Drawdown -->
  <div class="chart-container">
    <h3>Drawdown Analysis</h3>
    <canvas id="drawdown"></canvas>
    <div id="drawdown-export"></div>
  </div>
  
  <!-- Chart 4: Rolling Stats -->
  <div class="chart-container">
    <h3>Rolling Statistics</h3>
    <canvas id="rolling-stats"></canvas>
    <div id="rolling-stats-export"></div>
  </div>
  
</div>

<script>
  async function loadPerformanceTab(portfolioId) {
    const advancedCharts = new AdvancedCharts();
    
    // Parallel data fetching
    const [attribution, excessReturn, drawdown, rolling] = await Promise.all([
      fetch(`/api/advanced-analytics/performance-attribution?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/excess-return?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/drawdown-analysis?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/rolling-statistics?portfolioId=${portfolioId}`).then(r => r.json())
    ]);
    
    // Create charts
    advancedCharts.createWaterfallChart('perf-attribution', attribution);
    advancedCharts.createDualAxisLine('excess-return', excessReturn);
    advancedCharts.createDrawdownChart('drawdown', drawdown);
    advancedCharts.createRollingStats('rolling-stats', rolling);
    
    // Add export buttons
    advancedCharts.addExportButton('perf-attribution', 'perf-attribution-export');
    advancedCharts.addExportButton('excess-return', 'excess-return-export');
    advancedCharts.addExportButton('drawdown', 'drawdown-export');
    advancedCharts.addExportButton('rolling-stats', 'rolling-stats-export');
  }
  
  // Load on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const portfolioId = document.getElementById('portfolio-select').value;
    loadPerformanceTab(portfolioId);
  });
</script>
```

### Risk Tab

**File**: `/frontend/views/partials/tabs/risk-tab.ejs`

```html
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  
  <!-- Chart 5: Factor Exposures -->
  <div class="chart-container">
    <h3>Factor Exposures</h3>
    <canvas id="factor-exposures"></canvas>
  </div>
  
  <!-- Chart 6: VaR -->
  <div class="chart-container">
    <h3>Value at Risk</h3>
    <canvas id="var-histogram"></canvas>
  </div>
  
  <!-- Chart 7: Correlation Matrix -->
  <div class="chart-container lg:col-span-2">
    <h3>Correlation Matrix</h3>
    <canvas id="correlation-matrix"></canvas>
  </div>
  
  <!-- Chart 8: Stress Scenarios -->
  <div class="chart-container">
    <h3>Stress Scenarios</h3>
    <canvas id="stress-scenarios"></canvas>
  </div>
  
  <!-- Chart 9: Concentration -->
  <div class="chart-container">
    <h3>Holdings Concentration</h3>
    <canvas id="concentration-treemap"></canvas>
    <canvas id="concentration-pareto" class="mt-4"></canvas>
  </div>
  
</div>

<script>
  async function loadRiskTab(portfolioId) {
    const advancedCharts = new AdvancedCharts();
    
    const [riskDecomp, var, correlation, stress, concentration] = await Promise.all([
      fetch(`/api/advanced-analytics/risk-decomposition?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/var-scenarios?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/correlation-matrix?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/stress-scenarios?portfolioId=${portfolioId}`).then(r => r.json()),
      fetch(`/api/advanced-analytics/concentration-analysis?portfolioId=${portfolioId}`).then(r => r.json())
    ]);
    
    advancedCharts.createFactorExposures('factor-exposures', riskDecomp);
    advancedCharts.createVaRHistogram('var-histogram', var);
    advancedCharts.createHeatmap('correlation-matrix', correlation);
    advancedCharts.createStackedBar('stress-scenarios', stress);
    advancedCharts.createTreemap('concentration-treemap', concentration);
    advancedCharts.createParetoChart('concentration-pareto', concentration);
  }
</script>
```

### Attribution Tab

**File**: `/frontend/views/partials/tabs/attribution-tab.ejs`

```javascript
async function loadAttributionTab(portfolioId) {
  const advancedCharts = new AdvancedCharts();
  
  const [regional, sector, peer, alphaDecay] = await Promise.all([
    fetch(`/api/advanced-analytics/regional-attribution?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/sector-rotation?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/peer-benchmarking?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/alpha-decay?portfolioId=${portfolioId}`).then(r => r.json())
  ]);
  
  advancedCharts.createStackedBar('regional-attribution', regional);
  advancedCharts.createStackedArea('sector-rotation', sector);
  advancedCharts.createQuadrantScatter('peer-benchmarking', peer);
  advancedCharts.createHeatmap('alpha-decay', alphaDecay);
}
```

### Construction Tab

**File**: `/frontend/views/partials/tabs/construction-tab.ejs`

```javascript
async function loadConstructionTab(portfolioId) {
  const advancedCharts = new AdvancedCharts();
  
  const [frontier, turnover, liquidity, tca] = await Promise.all([
    fetch(`/api/advanced-analytics/efficient-frontier?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/turnover-analysis?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/liquidity-analysis?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/transaction-cost-analysis?portfolioId=${portfolioId}`).then(r => r.json())
  ]);
  
  advancedCharts.createEfficientFrontier('efficient-frontier', frontier);
  advancedCharts.createCalendarHeatmap('turnover-calendar', turnover);
  advancedCharts.createBubbleChart('liquidity-bubble', liquidity);
  advancedCharts.createBoxPlot('tca-boxplot', tca);
  advancedCharts.createTimelineChart('tca-timeline', tca);
}
```

### Specialized Tab

**File**: `/frontend/views/partials/tabs/specialized-tab.ejs`

```javascript
async function loadSpecializedTab(portfolioId) {
  const advancedCharts = new AdvancedCharts();
  
  const [alternatives, esg, reporting] = await Promise.all([
    fetch(`/api/advanced-analytics/alternatives-attribution?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/esg-analysis?portfolioId=${portfolioId}`).then(r => r.json()),
    fetch(`/api/advanced-analytics/client-reporting?portfolioId=${portfolioId}`).then(r => r.json())
  ]);
  
  advancedCharts.createWaterfallChart('alternatives-waterfall', alternatives);
  advancedCharts.createESGRadar('esg-radar', esg);
  advancedCharts.createKPICards('kpi-container', reporting);
  advancedCharts.createGaugeChart('goal-gauge', reporting.goalProgress);
}
```

---

## Real-Time Updates via WebSocket

Integrate with existing WebSocket service for live updates:

```javascript
class DashboardCharts {
  constructor() {
    this.advancedCharts = new AdvancedCharts();
    this.ws = null;
    this.init();
  }
  
  init() {
    this.connectWebSocket();
    this.loadAllCharts();
  }
  
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'quote') {
        this.handleQuoteUpdate(data);
      } else if (data.type === 'portfolio_snapshot_update') {
        this.handleSnapshotUpdate(data);
      }
    };
  }
  
  handleQuoteUpdate(quote) {
    // Update relevant charts with new price data
    // Throttle to avoid excessive re-renders
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      setTimeout(() => {
        this.updateChartsWithNewPrices();
        this.updateScheduled = false;
      }, 1000); // Update max once per second
    }
  }
  
  handleSnapshotUpdate(snapshot) {
    // Reload charts with new snapshot data
    this.loadAllCharts();
  }
  
  async loadAllCharts() {
    const portfolioId = this.getSelectedPortfolio();
    
    // Load appropriate tab charts
    const activeTab = this.getActiveTab();
    switch(activeTab) {
      case 'performance':
        await loadPerformanceTab(portfolioId);
        break;
      case 'risk':
        await loadRiskTab(portfolioId);
        break;
      // ... other tabs
    }
  }
}

// Initialize
window.dashboardCharts = new DashboardCharts();
```

---

## Error Handling

Always include error handling for failed data fetches:

```javascript
function showError(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw error message
  ctx.fillStyle = '#ef4444';
  ctx.font = '16px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(`Error: ${message}`, canvas.width / 2, canvas.height / 2);
}

function showLoading(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f59e0b';
  ctx.font = '16px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
}

function hideLoading(canvasId) {
  // Chart creation will replace the loading message
}
```

---

## Performance Optimization

### 1. Lazy Load Charts

Only load charts for the active tab:

```javascript
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', async () => {
    const tab = button.dataset.tab;
    
    // Check if tab charts already loaded
    if (!window[`${tab}ChartsLoaded`]) {
      await loadTabCharts(tab);
      window[`${tab}ChartsLoaded`] = true;
    }
  });
});
```

### 2. Chart Caching

Cache chart instances to avoid recreation:

```javascript
class ChartCache {
  constructor() {
    this.cache = new Map();
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, chart) {
    this.cache.set(key, chart);
  }
  
  update(key, data) {
    const chart = this.get(key);
    if (chart) {
      chart.data = data;
      chart.update('none');
    }
  }
  
  destroy(key) {
    const chart = this.get(key);
    if (chart) {
      chart.destroy();
      this.cache.delete(key);
    }
  }
  
  destroyAll() {
    this.cache.forEach(chart => chart.destroy());
    this.cache.clear();
  }
}

window.chartCache = new ChartCache();
```

### 3. Update Throttling

Throttle real-time updates:

```javascript
class UpdateThrottler {
  constructor(delay = 1000) {
    this.delay = delay;
    this.timers = new Map();
  }
  
  throttle(key, callback) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    
    const timer = setTimeout(() => {
      callback();
      this.timers.delete(key);
    }, this.delay);
    
    this.timers.set(key, timer);
  }
}

const throttler = new UpdateThrottler(1000);
```

---

## Testing Checklist

- [ ] All 20 chart types render correctly in `/chart-test.html`
- [ ] Charts display with Bloomberg Terminal aesthetic (dark theme, correct colors)
- [ ] Export functionality works (PNG, PDF, CSV, Clipboard)
- [ ] Charts are responsive on mobile/tablet
- [ ] Loading states display while fetching data
- [ ] Error messages display on failed data fetches
- [ ] Real-time updates work via WebSocket
- [ ] Charts update when portfolio selection changes
- [ ] Charts update when time period changes
- [ ] No console errors
- [ ] Performance is acceptable (< 3s load time per tab)

---

## Troubleshooting

### Chart not rendering

1. Check canvas element exists: `document.getElementById('chart-id')`
2. Check Chart.js is loaded: `typeof Chart !== 'undefined'`
3. Check plugins are loaded (check network tab in DevTools)
4. Check console for errors
5. Verify data format matches chart requirements

### Export not working

1. For PNG/PDF: Ensure canvas has rendered content
2. For CSV/JSON: Ensure chart instance exists and has data
3. For Clipboard: Requires HTTPS (localhost works)
4. Check browser permissions

### Performance issues

1. Use `update('none')` to disable animations on real-time updates
2. Implement lazy loading for off-screen charts
3. Cache chart instances instead of recreating
4. Throttle real-time updates to max 1/second
5. Use `requestAnimationFrame` for smooth updates

### WebSocket updates not working

1. Check WebSocket connection: `ws.readyState === WebSocket.OPEN`
2. Verify message format matches expected structure
3. Check throttling isn't blocking updates
4. Ensure chart instances are stored and accessible

---

## Next Steps

1. ✅ Test all charts in `/chart-test.html`
2. Create tab partial files with chart canvases
3. Add chart loading logic to each tab
4. Connect to backend API endpoints
5. Implement WebSocket real-time updates
6. Add loading and error states
7. Test on multiple screen sizes
8. Performance testing and optimization

---

## Support

For issues or questions:
- Check `CHART_USAGE_EXAMPLES.md` for detailed chart examples
- Review `/frontend/public/js/advanced-charts.js` for chart implementations
- Test individual charts in `/chart-test.html`
- Check browser console for error messages
