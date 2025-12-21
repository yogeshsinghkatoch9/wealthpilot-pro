# Advanced Charts Usage Guide

Complete examples for all 20 chart types in the WealthPilot Pro analytics dashboard.

## Prerequisites

Ensure these scripts are loaded in your HTML:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.2.5/build/index.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
<script src="/js/advanced-charts.js"></script>
```

Initialize the charts library:
```javascript
const advancedCharts = new AdvancedCharts();
```

---

## PERFORMANCE TAB (4 Charts)

### 1. Performance Attribution Waterfall Chart

**Endpoint**: `GET /api/advanced-analytics/performance-attribution`

**Sample Data**:
```javascript
const attributionData = {
  categories: ['Starting Value', 'Allocation Effect', 'Selection Effect', 'Interaction', 'Ending Value'],
  values: [100, 2.5, 1.8, -0.3, 104],
  colors: ['#10b981', '#10b981', '#10b981', '#ef4444', '#10b981']
};
```

**Usage**:
```javascript
advancedCharts.createWaterfallChart('attribution-waterfall', attributionData);

// Add export button
advancedCharts.addExportButton('attribution-waterfall', 'attribution-controls');
```

**HTML**:
```html
<div class="chart-container">
  <h3>Performance Attribution</h3>
  <canvas id="attribution-waterfall"></canvas>
  <div id="attribution-controls"></div>
</div>
```

---

### 2. Excess Return vs Benchmark (Dual-Axis Line)

**Endpoint**: `GET /api/advanced-analytics/excess-return`

**Sample Data**:
```javascript
const excessReturnData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  portfolio: [2.1, 3.5, 2.8, 4.2, 3.9, 5.1],
  benchmark: [1.8, 2.9, 2.5, 3.8, 3.5, 4.5],
  excess: [0.3, 0.6, 0.3, 0.4, 0.4, 0.6]
};
```

**Usage**:
```javascript
advancedCharts.createDualAxisLine('excess-return-chart', excessReturnData);
```

---

### 3. Drawdown Analysis (Area Chart)

**Endpoint**: `GET /api/advanced-analytics/drawdown-analysis`

**Sample Data**:
```javascript
const drawdownData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  drawdowns: [0, -2.1, -3.5, -1.8, 0, -0.5, -2.3, -4.1, -3.2, -1.5, 0, -0.8],
  peaks: [100, 100, 100, 100, 102, 102, 102, 102, 102, 102, 105, 105],
  maxDrawdown: -4.1,
  maxDrawdownDate: 'Aug'
};
```

**Usage**:
```javascript
advancedCharts.createDrawdownChart('drawdown-chart', drawdownData);
```

---

### 4. Rolling Statistics (Multi-Line)

**Endpoint**: `GET /api/advanced-analytics/rolling-statistics`

**Sample Data**:
```javascript
const rollingStatsData = {
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  datasets: [
    { label: 'Sharpe Ratio', data: [1.2, 1.5, 1.3, 1.8], color: '#10b981' },
    { label: 'Sortino Ratio', data: [1.5, 1.8, 1.6, 2.1], color: '#3b82f6' },
    { label: 'Information Ratio', data: [0.8, 1.1, 0.9, 1.3], color: '#f59e0b' }
  ]
};
```

**Usage**:
```javascript
advancedCharts.createRollingStats('rolling-stats-chart', rollingStatsData);
```

---

## RISK TAB (5 Charts)

### 5. Risk Decomposition / Factor Exposures (Horizontal Bar)

**Endpoint**: `GET /api/advanced-analytics/risk-decomposition`

**Sample Data**:
```javascript
const factorExposuresData = {
  factors: ['Market', 'Size', 'Value', 'Momentum', 'Quality', 'Low Vol'],
  exposures: [0.95, 0.12, -0.08, 0.25, 0.18, -0.15],
  contributions: [65, 8, -5, 18, 12, -8]
};
```

**Usage**:
```javascript
advancedCharts.createFactorExposures('factor-exposures-chart', factorExposuresData);
```

---

### 6. VaR & Stress Scenarios (Histogram)

**Endpoint**: `GET /api/advanced-analytics/var-scenarios`

**Sample Data**:
```javascript
const varData = {
  returns: [-15, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 15],
  frequencies: [2, 5, 8, 15, 25, 40, 55, 60, 55, 40, 25, 15, 8, 5, 2],
  var95: -8.5,
  var99: -12.3,
  cvar95: -10.2
};
```

**Usage**:
```javascript
advancedCharts.createVaRHistogram('var-histogram', varData);
```

---

### 7. Correlation Matrix (Heatmap)

**Endpoint**: `GET /api/advanced-analytics/correlation-matrix`

**Sample Data**:
```javascript
const correlationData = {
  labels: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
  matrix: [
    [1.00, 0.75, 0.68, 0.62, 0.45],
    [0.75, 1.00, 0.82, 0.71, 0.52],
    [0.68, 0.82, 1.00, 0.78, 0.48],
    [0.62, 0.71, 0.78, 1.00, 0.55],
    [0.45, 0.52, 0.48, 0.55, 1.00]
  ]
};
```

**Usage**:
```javascript
advancedCharts.createHeatmap('correlation-heatmap', correlationData);
```

---

### 8. Stress Scenarios (Stacked Bar)

**Endpoint**: `GET /api/advanced-analytics/stress-scenarios`

**Sample Data**:
```javascript
const stressData = {
  scenarios: ['2008 Crisis', 'COVID-19', 'Dot-com', 'Oil Shock', 'Rate Spike'],
  components: ['Equities', 'Bonds', 'Commodities', 'Cash'],
  data: {
    'Equities': [-35, -28, -42, -18, -22],
    'Bonds': [5, 3, 8, -2, -8],
    'Commodities': [-15, 12, -8, 45, 8],
    'Cash': [0, 0, 0, 0, 0]
  }
};
```

**Usage**:
```javascript
advancedCharts.createStackedBar('stress-scenarios-chart', stressData);
```

---

### 9. Holdings Concentration (Treemap + Pareto)

**Endpoint**: `GET /api/advanced-analytics/concentration-analysis`

**Sample Data for Treemap**:
```javascript
const concentrationTreemap = {
  holdings: [
    { symbol: 'AAPL', weight: 15.2, sector: 'Technology' },
    { symbol: 'MSFT', weight: 12.8, sector: 'Technology' },
    { symbol: 'GOOGL', weight: 10.5, sector: 'Technology' },
    { symbol: 'JPM', weight: 8.3, sector: 'Financials' },
    { symbol: 'JNJ', weight: 7.1, sector: 'Healthcare' }
  ]
};
```

**Sample Data for Pareto**:
```javascript
const concentrationPareto = {
  holdings: ['AAPL', 'MSFT', 'GOOGL', 'JPM', 'JNJ', 'BAC', 'PFE', 'WMT', 'HD', 'Others'],
  weights: [15.2, 12.8, 10.5, 8.3, 7.1, 5.9, 4.8, 3.9, 3.2, 28.3],
  cumulative: [15.2, 28.0, 38.5, 46.8, 53.9, 59.8, 64.6, 68.5, 71.7, 100.0]
};
```

**Usage**:
```javascript
advancedCharts.createTreemap('concentration-treemap', concentrationTreemap);
advancedCharts.createParetoChart('concentration-pareto', concentrationPareto);
```

---

## ATTRIBUTION TAB (4 Charts)

### 10. Regional Attribution (Stacked Columns)

**Endpoint**: `GET /api/advanced-analytics/regional-attribution`

**Sample Data**:
```javascript
const regionalData = {
  regions: ['North America', 'Europe', 'Asia Pacific', 'Emerging Markets'],
  allocation: [2.5, -0.8, 1.2, 0.5],
  selection: [1.3, 0.4, -0.3, 0.8],
  interaction: [0.2, -0.1, 0.1, -0.2]
};
```

**Usage**:
```javascript
advancedCharts.createStackedBar('regional-attribution', regionalData);
```

---

### 11. Sector Rotation (Stacked Area)

**Endpoint**: `GET /api/advanced-analytics/sector-rotation`

**Sample Data**:
```javascript
const sectorRotationData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  sectors: {
    'Technology': [25, 27, 26, 28, 30, 29],
    'Financials': [18, 17, 18, 16, 15, 16],
    'Healthcare': [15, 16, 17, 18, 18, 19],
    'Consumer': [20, 19, 18, 17, 16, 15],
    'Energy': [12, 11, 11, 11, 11, 11],
    'Other': [10, 10, 10, 10, 10, 10]
  }
};
```

**Usage**:
```javascript
advancedCharts.createStackedArea('sector-rotation-chart', sectorRotationData);
```

---

### 12. Peer Benchmarking (Quadrant Scatter)

**Endpoint**: `GET /api/advanced-analytics/peer-benchmarking`

**Sample Data**:
```javascript
const peerData = {
  portfolios: [
    { name: 'Your Portfolio', return: 12.5, risk: 15.2, size: 5000000, isYours: true },
    { name: 'Peer A', return: 10.2, risk: 14.8, size: 3000000 },
    { name: 'Peer B', return: 11.8, risk: 16.5, size: 7000000 },
    { name: 'Peer C', return: 9.5, risk: 12.3, size: 2000000 },
    { name: 'Peer D', return: 13.2, risk: 18.1, size: 4500000 }
  ],
  avgReturn: 11.4,
  avgRisk: 15.4
};
```

**Usage**:
```javascript
advancedCharts.createQuadrantScatter('peer-benchmarking', peerData);
```

---

### 13. Alpha Decay / Factor Crowding (Heatmap)

**Endpoint**: `GET /api/advanced-analytics/alpha-decay`

**Sample Data**:
```javascript
const alphaDecayData = {
  labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
  factors: ['Momentum', 'Value', 'Quality', 'Low Vol', 'Size'],
  matrix: [
    [0.85, 0.72, 0.58, 0.42],  // Momentum
    [0.90, 0.88, 0.85, 0.82],  // Value
    [0.78, 0.75, 0.71, 0.68],  // Quality
    [0.65, 0.60, 0.55, 0.50],  // Low Vol
    [0.55, 0.48, 0.40, 0.35]   // Size
  ]
};
```

**Usage**:
```javascript
advancedCharts.createHeatmap('alpha-decay-heatmap', alphaDecayData);
```

---

## PORTFOLIO CONSTRUCTION TAB (4 Charts)

### 14. Efficient Frontier (Scatter)

**Endpoint**: `GET /api/advanced-analytics/efficient-frontier`

**Sample Data**:
```javascript
const frontierData = {
  frontier: [
    { risk: 8, return: 6 },
    { risk: 10, return: 7.5 },
    { risk: 12, return: 8.8 },
    { risk: 14, return: 10 },
    { risk: 16, return: 11 },
    { risk: 18, return: 11.8 },
    { risk: 20, return: 12.5 }
  ],
  currentPortfolio: { risk: 15, return: 10.5, label: 'Current' },
  optimalPortfolio: { risk: 12, return: 8.8, label: 'Optimal' }
};
```

**Usage**:
```javascript
advancedCharts.createEfficientFrontier('efficient-frontier', frontierData);
```

---

### 15. Holdings Turnover & Trade Cadence (Calendar Heatmap)

**Endpoint**: `GET /api/advanced-analytics/turnover-analysis`

**Sample Data**:
```javascript
const turnoverData = {
  dates: [],  // Array of Date objects for each day
  values: []  // Turnover % for each day
};

// Generate 365 days of data
const startDate = new Date('2024-01-01');
for (let i = 0; i < 365; i++) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + i);
  turnoverData.dates.push(date);
  turnoverData.values.push(Math.random() * 5);  // 0-5% daily turnover
}
```

**Usage**:
```javascript
advancedCharts.createCalendarHeatmap('turnover-calendar', turnoverData);
```

---

### 16. Liquidity & Market Impact (Bubble Chart)

**Endpoint**: `GET /api/advanced-analytics/liquidity-analysis`

**Sample Data**:
```javascript
const liquidityData = {
  holdings: [
    { symbol: 'AAPL', weight: 15.2, adv: 85000000, daysToLiquidate: 0.5 },
    { symbol: 'MSFT', weight: 12.8, adv: 32000000, daysToLiquidate: 1.2 },
    { symbol: 'GOOGL', weight: 10.5, adv: 28000000, daysToLiquidate: 1.5 },
    { symbol: 'SMCP', weight: 2.1, adv: 500000, daysToLiquidate: 8.5 }
  ]
};
```

**Usage**:
```javascript
advancedCharts.createBubbleChart('liquidity-bubble', liquidityData);
```

---

### 17. Transaction Cost Analysis (Box Plot)

**Endpoint**: `GET /api/advanced-analytics/transaction-cost-analysis`

**Sample Data**:
```javascript
const tcaData = {
  brokers: ['Broker A', 'Broker B', 'Broker C', 'Broker D'],
  costs: [
    { min: 2, q1: 4, median: 5.5, q3: 7, max: 10 },
    { min: 3, q1: 5, median: 6.5, q3: 8, max: 12 },
    { min: 2.5, q1: 4.5, median: 6, q3: 7.5, max: 11 },
    { min: 1.5, q1: 3.5, median: 5, q3: 6.5, max: 9 }
  ]
};
```

**Usage**:
```javascript
advancedCharts.createBoxPlot('tca-boxplot', tcaData);
```

**Timeline Chart for TCA**:
```javascript
const tcaTimelineData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  implicitCosts: [5.2, 4.8, 5.5, 4.9, 5.1, 4.7],
  explicitCosts: [2.1, 2.0, 2.2, 2.1, 2.0, 1.9],
  slippage: [1.5, 1.3, 1.8, 1.4, 1.6, 1.2]
};

advancedCharts.createTimelineChart('tca-timeline', tcaTimelineData);
```

---

## SPECIALIZED TAB (3 Charts)

### 18. Performance Attribution for Alternatives (Waterfall)

**Endpoint**: `GET /api/advanced-analytics/alternatives-attribution`

**Sample Data**:
```javascript
const alternativesData = {
  categories: ['Starting NAV', 'Operating Income', 'Capital Appreciation', 'Distributions', 'Fees', 'Ending NAV'],
  values: [1000, 85, 125, -45, -15, 1150],
  colors: ['#10b981', '#10b981', '#10b981', '#ef4444', '#ef4444', '#10b981']
};
```

**Usage**:
```javascript
advancedCharts.createWaterfallChart('alternatives-waterfall', alternativesData);
```

---

### 19. ESG / Sustainability Exposure (Radar Chart)

**Endpoint**: `GET /api/advanced-analytics/esg-analysis`

**Sample Data**:
```javascript
const esgData = {
  categories: ['Environmental', 'Social', 'Governance', 'Carbon Footprint', 'Diversity', 'Labor Practices'],
  portfolio: [75, 82, 88, 45, 78, 85],
  benchmark: [68, 75, 80, 52, 70, 78],
  best: [90, 90, 90, 90, 90, 90]
};
```

**Usage**:
```javascript
advancedCharts.createESGRadar('esg-radar', esgData);
```

---

### 20. Client/Product Performance Reporting (KPI Cards + Gauges)

**Endpoint**: `GET /api/advanced-analytics/client-reporting`

**Sample Data**:
```javascript
const reportingData = {
  kpis: [
    { title: 'Total Return', value: '12.5%', change: '+2.3%', positive: true },
    { title: 'Alpha', value: '1.8%', change: '+0.5%', positive: true },
    { title: 'Sharpe Ratio', value: '1.45', change: '+0.12', positive: true },
    { title: 'Max Drawdown', value: '-8.2%', change: '-1.1%', positive: false }
  ]
};

const goalProgressData = {
  current: 75,
  target: 100,
  label: 'Goal Progress',
  threshold: 80
};
```

**Usage**:
```javascript
// KPI Cards (renders HTML, not canvas)
advancedCharts.createKPICards('kpi-container', reportingData);

// Gauge Chart
advancedCharts.createGaugeChart('goal-gauge', goalProgressData);
```

---

## Export Functionality

All charts support multiple export formats:

### Export as PNG
```javascript
advancedCharts.exportChartAsPNG('chart-canvas-id', 'my-chart');
// Downloads: my-chart.png
```

### Export as PDF
```javascript
advancedCharts.exportChartAsPDF('chart-canvas-id', 'my-chart');
// Opens print dialog with chart
```

### Export Data as CSV
```javascript
const chartInstance = advancedCharts.charts.get('chart-canvas-id');
advancedCharts.exportChartDataAsCSV(chartInstance.data, 'chart-data');
// Downloads: chart-data.csv
```

### Export Data as JSON
```javascript
const chartInstance = advancedCharts.charts.get('chart-canvas-id');
advancedCharts.exportChartDataAsJSON(chartInstance.data, 'chart-data');
// Downloads: chart-data.json
```

### Print Chart
```javascript
advancedCharts.printChart('chart-canvas-id');
// Opens print dialog
```

### Copy to Clipboard
```javascript
await advancedCharts.copyChartToClipboard('chart-canvas-id');
// Copies chart image to clipboard
```

### Export All Charts as ZIP
```javascript
await advancedCharts.exportAllChartsAsZIP('all-charts');
// Downloads: all-charts.zip with all chart PNGs
```

### Add Export Buttons Automatically
```javascript
advancedCharts.addExportButton('chart-canvas-id', 'button-container-id');
// Adds PNG, PDF, Print, Copy buttons
```

---

## Complete Integration Example

Here's a complete example of integrating a chart with backend data:

```javascript
// Fetch data from backend
async function loadPerformanceAttribution(portfolioId) {
  try {
    const response = await fetch(`/api/advanced-analytics/performance-attribution?portfolioId=${portfolioId}`);
    const data = await response.json();
    
    // Transform backend data to chart format
    const chartData = {
      categories: data.components.map(c => c.name),
      values: data.components.map(c => c.value),
      colors: data.components.map(c => c.value >= 0 ? '#10b981' : '#ef4444')
    };
    
    // Create chart
    const chart = advancedCharts.createWaterfallChart('attribution-chart', chartData);
    
    // Add export controls
    advancedCharts.addExportButton('attribution-chart', 'export-controls');
    
    // Store reference
    window.attributionChart = chart;
    
  } catch (error) {
    console.error('Failed to load attribution data:', error);
  }
}

// Load on page ready
document.addEventListener('DOMContentLoaded', () => {
  const portfolioId = document.getElementById('portfolio-select').value;
  loadPerformanceAttribution(portfolioId);
});
```

---

## Bloomberg Styling Guidelines

All charts follow Bloomberg Terminal aesthetics:

**Colors**:
- Background: `#0d1117` or `#161b22`
- Text: `#e5e7eb`
- Positive: `#10b981` (green)
- Negative: `#ef4444` (red)
- Accent: `#f59e0b` (amber)
- Blue: `#3b82f6`
- Purple: `#8b5cf6`
- Cyan: `#06b6d4`
- Border: `#30363d`

**Fonts**:
- Numbers: JetBrains Mono (monospace)
- Labels: Inter

**Grid**:
- Color: `rgba(255, 255, 255, 0.1)`
- Dashed lines for minor grids

---

## Testing Charts

Simple test script to verify all charts work:

```javascript
// Run this in browser console
async function testAllCharts() {
  const charts = new AdvancedCharts();
  
  // Test each chart type
  console.log('Testing Waterfall...');
  charts.createWaterfallChart('test-canvas', {
    categories: ['Start', 'Add', 'End'],
    values: [100, 10, 110],
    colors: ['#10b981', '#10b981', '#10b981']
  });
  
  // Add more tests for each chart type...
  console.log('All charts tested successfully!');
}

testAllCharts();
```

---

## Troubleshooting

**Chart not rendering?**
1. Check canvas element exists: `document.getElementById('canvas-id')`
2. Verify Chart.js is loaded: `typeof Chart !== 'undefined'`
3. Check browser console for errors
4. Ensure data format matches examples above

**Plugins not working?**
1. Verify plugin scripts are loaded before advanced-charts.js
2. Check script URLs are accessible
3. Look for CORS errors in console

**Export not working?**
1. For clipboard: check HTTPS (required for clipboard API)
2. For ZIP: verify JSZip library is loaded (optional dependency)
3. Check browser permissions

---

## Next Steps

1. Connect charts to actual backend endpoints
2. Add loading states while fetching data
3. Implement error handling for failed requests
4. Add chart refresh on data updates
5. Test on mobile/tablet devices
