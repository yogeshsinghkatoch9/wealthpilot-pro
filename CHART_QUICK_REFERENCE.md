# Chart Library Quick Reference

Fast reference for the AdvancedCharts library in WealthPilot Pro.

## Initialization

```javascript
const advancedCharts = new AdvancedCharts();
```

## All 20 Chart Methods

### Performance Tab
```javascript
// 1. Waterfall
advancedCharts.createWaterfallChart(canvasId, {
  categories: ['Start', 'Effect1', 'Effect2', 'End'],
  values: [100, 5, 3, 108],
  colors: ['#10b981', '#10b981', '#10b981', '#10b981']
});

// 2. Dual-Axis Line
advancedCharts.createDualAxisLine(canvasId, {
  labels: ['Jan', 'Feb', 'Mar'],
  portfolio: [2.1, 3.5, 2.8],
  benchmark: [1.8, 2.9, 2.5],
  excess: [0.3, 0.6, 0.3]
});

// 3. Drawdown
advancedCharts.createDrawdownChart(canvasId, {
  labels: ['Jan', 'Feb', 'Mar'],
  drawdowns: [0, -2.1, -3.5],
  peaks: [100, 100, 100],
  maxDrawdown: -3.5,
  maxDrawdownDate: 'Mar'
});

// 4. Rolling Statistics
advancedCharts.createRollingStats(canvasId, {
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  datasets: [
    { label: 'Sharpe', data: [1.2, 1.5, 1.3, 1.8], color: '#10b981' }
  ]
});
```

### Risk Tab
```javascript
// 5. Factor Exposures
advancedCharts.createFactorExposures(canvasId, {
  factors: ['Market', 'Size', 'Value'],
  exposures: [0.95, 0.12, -0.08],
  contributions: [65, 8, -5]
});

// 6. VaR Histogram
advancedCharts.createVaRHistogram(canvasId, {
  returns: [-10, -5, 0, 5, 10],
  frequencies: [5, 15, 50, 15, 5],
  var95: -8.5,
  var99: -12.3,
  cvar95: -10.2
});

// 7. Correlation Heatmap
advancedCharts.createHeatmap(canvasId, {
  labels: ['AAPL', 'MSFT', 'GOOGL'],
  matrix: [
    [1.00, 0.75, 0.68],
    [0.75, 1.00, 0.82],
    [0.68, 0.82, 1.00]
  ]
});

// 8. Stress Scenarios (Stacked Bar)
advancedCharts.createStackedBar(canvasId, {
  scenarios: ['2008 Crisis', 'COVID-19'],
  components: ['Equities', 'Bonds'],
  data: {
    'Equities': [-35, -28],
    'Bonds': [5, 3]
  }
});

// 9. Concentration
advancedCharts.createTreemap(canvasId, {
  holdings: [
    { symbol: 'AAPL', weight: 15.2, sector: 'Technology' }
  ]
});

advancedCharts.createParetoChart(canvasId, {
  holdings: ['AAPL', 'MSFT', 'GOOGL'],
  weights: [15.2, 12.8, 10.5],
  cumulative: [15.2, 28.0, 38.5]
});
```

### Attribution Tab
```javascript
// 10. Regional Attribution (uses createStackedBar)

// 11. Sector Rotation
advancedCharts.createStackedArea(canvasId, {
  labels: ['Jan', 'Feb', 'Mar'],
  sectors: {
    'Technology': [25, 27, 26],
    'Financials': [18, 17, 18]
  }
});

// 12. Peer Benchmarking
advancedCharts.createQuadrantScatter(canvasId, {
  portfolios: [
    { name: 'You', return: 12.5, risk: 15.2, size: 5000000, isYours: true },
    { name: 'Peer A', return: 10.2, risk: 14.8, size: 3000000 }
  ],
  avgReturn: 11.4,
  avgRisk: 15.4
});

// 13. Alpha Decay (uses createHeatmap)
```

### Construction Tab
```javascript
// 14. Efficient Frontier
advancedCharts.createEfficientFrontier(canvasId, {
  frontier: [
    { risk: 8, return: 6 },
    { risk: 10, return: 7.5 }
  ],
  currentPortfolio: { risk: 15, return: 10.5, label: 'Current' },
  optimalPortfolio: { risk: 12, return: 8.8, label: 'Optimal' }
});

// 15. Calendar Heatmap
advancedCharts.createCalendarHeatmap(canvasId, {
  dates: [new Date('2024-01-01'), ...],
  values: [2.5, 1.8, ...]
});

// 16. Bubble Chart
advancedCharts.createBubbleChart(canvasId, {
  holdings: [
    { symbol: 'AAPL', weight: 15.2, adv: 85000000, daysToLiquidate: 0.5 }
  ]
});

// 17. Transaction Cost Analysis
advancedCharts.createBoxPlot(canvasId, {
  brokers: ['Broker A', 'Broker B'],
  costs: [
    { min: 2, q1: 4, median: 5.5, q3: 7, max: 10 }
  ]
});

advancedCharts.createTimelineChart(canvasId, {
  labels: ['Jan', 'Feb', 'Mar'],
  implicitCosts: [5.2, 4.8, 5.5],
  explicitCosts: [2.1, 2.0, 2.2],
  slippage: [1.5, 1.3, 1.8]
});
```

### Specialized Tab
```javascript
// 18. Alternatives (uses createWaterfallChart)

// 19. ESG Radar
advancedCharts.createESGRadar(canvasId, {
  categories: ['Environmental', 'Social', 'Governance'],
  portfolio: [75, 82, 88],
  benchmark: [68, 75, 80],
  best: [90, 90, 90]
});

// 20. Client Reporting
advancedCharts.createKPICards(containerId, {
  kpis: [
    { title: 'Total Return', value: '12.5%', change: '+2.3%', positive: true }
  ]
});

advancedCharts.createGaugeChart(canvasId, {
  current: 75,
  target: 100,
  label: 'Goal Progress',
  threshold: 80
});
```

## Export Functions

```javascript
// PNG
advancedCharts.exportChartAsPNG('canvas-id', 'filename');

// PDF
advancedCharts.exportChartAsPDF('canvas-id', 'filename');

// CSV
const chart = advancedCharts.charts.get('canvas-id');
advancedCharts.exportChartDataAsCSV(chart.data, 'filename');

// JSON
advancedCharts.exportChartDataAsJSON(chart.data, 'filename');

// Print
advancedCharts.printChart('canvas-id');

// Clipboard
await advancedCharts.copyChartToClipboard('canvas-id');

// ZIP (all charts)
await advancedCharts.exportAllChartsAsZIP('filename');

// Add export buttons
advancedCharts.addExportButton('canvas-id', 'container-id');
```

## Common Patterns

### Fetch and Render
```javascript
async function renderChart(portfolioId) {
  const data = await fetch(`/api/endpoint?portfolioId=${portfolioId}`)
    .then(r => r.json());
  
  advancedCharts.createChartType('canvas-id', data);
}
```

### Update Existing Chart
```javascript
const chart = advancedCharts.charts.get('canvas-id');
chart.data.labels = newLabels;
chart.data.datasets[0].data = newData;
chart.update('none'); // 'none' = no animation
```

### Destroy Chart
```javascript
const chart = advancedCharts.charts.get('canvas-id');
chart.destroy();
advancedCharts.charts.delete('canvas-id');
```

## Color Palette

```javascript
const colors = {
  amber: '#f59e0b',
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  surface: '#161b22',
  border: '#30363d',
  text: '#e5e7eb'
};
```

## Common Errors

**"Cannot read property 'data' of undefined"**
→ Chart not created yet. Ensure createChart() called first.

**"Canvas is already in use"**
→ Previous chart not destroyed. Call chart.destroy() first.

**"Matrix plugin not found"**
→ Plugin script not loaded. Check header.ejs includes.

**Export not working**
→ For clipboard: requires HTTPS. For PNG/PDF: ensure chart rendered.
