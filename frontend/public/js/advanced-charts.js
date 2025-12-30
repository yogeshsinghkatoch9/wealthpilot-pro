/**
 * WealthPilot Pro - Advanced Chart Library
 * Complete visualization toolkit with 20+ chart types
 */
class AdvancedCharts {
  constructor() {
    this.charts = new Map();
    this.colors = {
      amber: '#f59e0b', green: '#10b981', red: '#ef4444', blue: '#3b82f6',
      purple: '#8b5cf6', cyan: '#06b6d4', surface: '#161b22', border: '#30363d', text: '#e5e7eb'
    };
  }

  // Helper: Get color palette
  getColorPalette() {
    return [
      this.colors.blue, this.colors.green, this.colors.amber,
      this.colors.purple, this.colors.cyan, this.colors.red,
      '#ec4899', '#14b8a6', '#f97316', '#6366f1'
    ];
  }

  // Helper: Escape HTML to prevent XSS
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 1. WATERFALL CHART - Performance Attribution
  createWaterfallChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const colors = data.values.map(v => v >= 0 ? this.colors.green : this.colors.red);

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Contribution',
          data: data.values,
          backgroundColor: colors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Performance Attribution', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 2. EFFICIENT FRONTIER - Portfolio Optimization
  createEfficientFrontier(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Frontier', data: data.frontier || [], showLine: true, borderColor: this.colors.blue, fill: false },
          { label: 'Current', data: data.current ? [data.current] : [], backgroundColor: this.colors.amber, pointRadius: 8 },
          { label: 'Optimal', data: data.optimal ? [data.optimal] : [], backgroundColor: this.colors.green, pointRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Efficient Frontier', color: this.colors.text } },
        scales: {
          x: { title: { display: true, text: 'Risk %', color: this.colors.text } },
          y: { title: { display: true, text: 'Return %', color: this.colors.text } }
        }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 3. DRAWDOWN CHART
  createDrawdownChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [{
          label: 'Drawdown',
          data: data.values || [],
          borderColor: this.colors.red,
          backgroundColor: 'rgba(239,68,68,0.2)',
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { reverse: true } },
        plugins: { title: { display: true, text: 'Portfolio Drawdown', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 4. FACTOR EXPOSURES - Horizontal Bar
  createFactorExposures(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels || [],
        datasets: [{
          label: 'Beta',
          data: data.values || [],
          backgroundColor: this.colors.blue
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Factor Exposures', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 5. ESG RADAR CHART
  createESGRadar(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: data.labels || ['Environmental', 'Social', 'Governance'],
        datasets: [
          { label: 'Portfolio', data: data.portfolio || [], borderColor: this.colors.green, backgroundColor: 'rgba(16,185,129,0.2)' },
          { label: 'Benchmark', data: data.benchmark || [], borderColor: this.colors.blue, backgroundColor: 'rgba(59,130,246,0.2)' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 100 } },
        plugins: { title: { display: true, text: 'ESG Scores', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 6. HEATMAP - Correlation Matrix
  createHeatmap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const matrix = data.matrix || [];
    const labels = data.labels || [];
    const self = this;

    const chart = new Chart(ctx, {
      type: 'matrix',
      data: {
        datasets: [{
          label: 'Correlation',
          data: matrix.flatMap((row, i) => row.map((value, j) => ({
            x: labels[j], y: labels[i], v: value
          }))),
          backgroundColor(c) {
            const value = c.dataset.data[c.dataIndex]?.v || 0;
            const alpha = Math.abs(value);
            return value >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
          },
          width: ({chart}) => (chart.chartArea?.width / Math.max(labels.length, 1)) - 1,
          height: ({chart}) => (chart.chartArea?.height / Math.max(labels.length, 1)) - 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Correlation Matrix', color: self.colors.text },
          legend: { display: false }
        }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 7. DUAL-AXIS LINE CHART - Excess Return
  createDualAxisLine(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [
          { label: 'Portfolio', data: data.portfolio || [], borderColor: this.colors.amber, yAxisID: 'y', fill: false },
          { label: 'Benchmark', data: data.benchmark || [], borderColor: this.colors.blue, yAxisID: 'y', fill: false },
          { label: 'Excess', data: data.excess || [], borderColor: this.colors.green, yAxisID: 'y1', fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Cumulative Return %', color: this.colors.text } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Excess Return %', color: this.colors.text }, grid: { drawOnChartArea: false } }
        },
        plugins: { title: { display: true, text: 'Portfolio vs Benchmark', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 8. TREEMAP - Concentration Analysis
  createTreemap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const self = this;

    const chart = new Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          label: 'Holdings',
          tree: data.holdings || [],
          key: 'value',
          groups: ['symbol'],
          backgroundColor(c) {
            const item = c.dataset.tree[c.dataIndex];
            const weight = item?.weight || 0;
            return weight > 20 ? self.colors.red : weight > 10 ? self.colors.amber : self.colors.green;
          },
          labels: {
            display: true,
            formatter: (ctx) => ctx.raw?.g || ''
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Holdings Concentration', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 9. STACKED BAR CHART - Stress Test Results
  createStackedBar(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const datasets = (data.scenarios || []).map((scenario, i) => ({
      label: scenario.name || `Scenario ${i + 1}`,
      data: scenario.values || [],
      backgroundColor: this.getColorPalette()[i % 10]
    }));

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels || [],
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true }
        },
        plugins: { title: { display: true, text: 'Stress Test Results', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 10. ROLLING STATISTICS CHART
  createRollingStats(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [
          { label: 'Rolling Return', data: data.returns || [], borderColor: this.colors.green, fill: false },
          { label: 'Rolling Volatility', data: data.volatility || [], borderColor: this.colors.red, fill: false },
          { label: 'Rolling Sharpe', data: data.sharpe || [], borderColor: this.colors.blue, yAxisID: 'y1', fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Return / Volatility %', color: this.colors.text } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Sharpe Ratio', color: this.colors.text }, grid: { drawOnChartArea: false } }
        },
        plugins: { title: { display: true, text: 'Rolling Statistics', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 11. VaR HISTOGRAM
  createVaRHistogram(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.bins || [],
        datasets: [{
          label: 'Frequency',
          data: data.frequencies || [],
          backgroundColor: data.frequencies?.map((_, i) => {
            const binValue = data.bins?.[i] || 0;
            return binValue < (data.var95 || -2) ? this.colors.red : this.colors.blue;
          }) || []
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Return Distribution & VaR', color: this.colors.text },
          annotation: {
            annotations: {
              var95: {
                type: 'line',
                xMin: data.var95Index,
                xMax: data.var95Index,
                borderColor: this.colors.amber,
                borderWidth: 2,
                label: { display: true, content: 'VaR 95%' }
              }
            }
          }
        }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 12. PARETO CHART - Cumulative Concentration
  createParetoChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels || [],
        datasets: [
          { label: 'Weight %', data: data.weights || [], backgroundColor: this.colors.blue, yAxisID: 'y' },
          { label: 'Cumulative %', data: data.cumulative || [], type: 'line', borderColor: this.colors.amber, yAxisID: 'y1', fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left' },
          y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } }
        },
        plugins: { title: { display: true, text: 'Holdings Concentration', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 13. STACKED AREA CHART - Sector Rotation
  createStackedArea(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const datasets = (data.sectors || []).map((sector, i) => ({
      label: sector.name || `Sector ${i + 1}`,
      data: sector.values || [],
      backgroundColor: this.getColorPalette()[i % 10],
      borderColor: this.getColorPalette()[i % 10],
      fill: true
    }));

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: data.labels || [], datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { stacked: true } },
        plugins: { title: { display: true, text: 'Sector Allocation Over Time', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 14. BUBBLE CHART - Liquidity Analysis
  createBubbleChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Holdings',
          data: (data.holdings || []).map(h => ({ x: h.weight || 0, y: h.adv || 0, r: (h.impact || 1) * 10 })),
          backgroundColor: this.colors.blue
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Position Weight %', color: this.colors.text } },
          y: { title: { display: true, text: 'Avg Daily Volume', color: this.colors.text } }
        },
        plugins: { title: { display: true, text: 'Liquidity Analysis', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 15. BOX PLOT - Transaction Costs
  createBoxPlot(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'boxplot',
      data: {
        labels: data.brokers || [],
        datasets: [{
          label: 'Cost (bps)',
          data: data.costs || [],
          backgroundColor: this.colors.blue,
          borderColor: this.colors.amber
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'TCA by Broker', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 16. TIMELINE CHART - Cost Over Time
  createTimelineChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.dates || [],
        datasets: [{
          label: 'Cost (bps)',
          data: data.costs || [],
          borderColor: this.colors.red,
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Transaction Costs Timeline', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 17. GAUGE CHART - Goal Progress
  createGaugeChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [data.current || 0, Math.max((data.target || 100) - (data.current || 0), 0)],
          backgroundColor: [this.colors.green, this.colors.surface],
          circumference: 180,
          rotation: 270
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: data.label || 'Progress', color: this.colors.text },
          legend: { display: false }
        }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 18. KPI CARDS - Summary Metrics
  createKPICards(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const safeMetrics = (data.metrics || []).map(m => ({
      label: this.escapeHtml(m.label || ''),
      value: this.escapeHtml(String(m.value || 0)),
      change: parseFloat(m.change) || 0
    }));

    container.innerHTML = safeMetrics.map(m => `
      <div class="kpi-card bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div class="text-xs text-slate-500 uppercase">${m.label}</div>
        <div class="text-2xl font-bold text-white font-mono">${m.value}</div>
        <div class="text-sm ${m.change >= 0 ? 'text-emerald-400' : 'text-red-400'}">
          ${m.change >= 0 ? '↑' : '↓'} ${Math.abs(m.change).toFixed(2)}%
        </div>
      </div>
    `).join('');
  }

  // 19. QUADRANT SCATTER - Peer Benchmarking
  createQuadrantScatter(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Peers', data: data.peers || [], backgroundColor: this.colors.blue },
          { label: 'Your Portfolio', data: data.portfolio ? [data.portfolio] : [], backgroundColor: this.colors.amber, pointRadius: 10 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Peer Comparison', color: this.colors.text },
          annotation: {
            annotations: {
              line1: { type: 'line', yMin: data.avgReturn || 0, yMax: data.avgReturn || 0, borderColor: this.colors.text, borderWidth: 1, borderDash: [5, 5] },
              line2: { type: 'line', xMin: data.avgRisk || 0, xMax: data.avgRisk || 0, borderColor: this.colors.text, borderWidth: 1, borderDash: [5, 5] }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Risk %', color: this.colors.text } },
          y: { title: { display: true, text: 'Return %', color: this.colors.text } }
        }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 20. CALENDAR HEATMAP - Trading Activity
  createCalendarHeatmap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'matrix',
      data: {
        datasets: [{
          label: 'Activity',
          data: (data.days || []).map(d => ({ x: d.date, y: d.weekday, v: d.value })),
          backgroundColor(c) {
            const value = c.dataset.data[c.dataIndex]?.v || 0;
            const alpha = Math.min(value / 100, 1);
            return `rgba(59,130,246,${alpha})`;
          },
          width: 15,
          height: 15
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Trading Calendar', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 21. LINE CHART - Simple line chart
  createLineChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [{
          label: data.label || 'Value',
          data: data.values || [],
          borderColor: this.colors.blue,
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: data.title || 'Chart', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // 22. DOUGHNUT CHART - Allocation
  createDoughnutChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.labels || [],
        datasets: [{
          data: data.values || [],
          backgroundColor: this.getColorPalette()
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: data.title || 'Allocation', color: this.colors.text } }
      }
    });
    this.charts.set(canvasId, chart);
    return chart;
  }

  // Destroy a specific chart
  destroyChart(canvasId) {
    if (this.charts.has(canvasId)) {
      this.charts.get(canvasId).destroy();
      this.charts.delete(canvasId);
    }
  }

  // Destroy all charts
  destroyAllCharts() {
    this.charts.forEach((chart, id) => {
      chart.destroy();
    });
    this.charts.clear();
  }

  // ==================== EXPORT FUNCTIONALITY ====================

  // Export chart as PNG
  exportChartAsPNG(canvasId, filename) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error('Canvas not found:', canvasId);
      return;
    }

    const link = document.createElement('a');
    link.download = `${filename || 'chart'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // Export chart as PDF
  exportChartAsPDF(canvasId, filename) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const imgData = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>${this.escapeHtml(filename || 'Chart')}</title></head>
        <body style="margin:0;padding:20px">
          <img src="${imgData}" style="max-width:100%"/>
          <script>window.print();setTimeout(() => window.close(), 100);</script>
        </body>
      </html>
    `);
  }

  // Export chart data as CSV
  exportChartDataAsCSV(chartData, filename) {
    if (!chartData || !chartData.labels) {
      console.error('Invalid chart data');
      return;
    }

    let csv = 'Label';
    chartData.datasets.forEach(ds => {
      csv += `,${ds.label || 'Value'}`;
    });
    csv += '\n';

    chartData.labels.forEach((label, i) => {
      csv += `${label}`;
      chartData.datasets.forEach(ds => {
        const value = Array.isArray(ds.data) ? ds.data[i] : '';
        csv += `,${typeof value === 'object' ? JSON.stringify(value) : value}`;
      });
      csv += '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `${filename || 'chart-data'}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }

  // Print chart
  printChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const imgData = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>Print Chart</title>
          <style>
            @media print {
              body { margin: 0; }
              img { max-width: 100%; page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <img src="${imgData}" />
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
  }

  // Copy chart to clipboard
  async copyChartToClipboard(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return false;

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      console.log('Chart copied to clipboard');
      return true;
    } catch (err) {
      console.error('Failed to copy chart:', err);
      return false;
    }
  }

  // Add export button for a chart
  addExportButton(canvasId, containerId) {
    const container = document.getElementById(containerId || canvasId + '-controls');
    if (!container) {
      console.warn('Export controls container not found for:', canvasId);
      return;
    }

    const buttonHTML = `
      <div class="chart-export-controls flex gap-2 mt-2">
        <button onclick="advancedCharts.exportChartAsPNG('${canvasId}')"
                class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          PNG
        </button>
        <button onclick="advancedCharts.exportChartAsPDF('${canvasId}')"
                class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
          PDF
        </button>
        <button onclick="advancedCharts.printChart('${canvasId}')"
                class="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700">
          Print
        </button>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', buttonHTML);
  }
}

// Initialize global instance
window.advancedCharts = new AdvancedCharts();
