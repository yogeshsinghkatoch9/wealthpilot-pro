/**
 * WealthPilot Pro - Advanced Chart Library
 */
class AdvancedCharts {
  constructor() {
    this.charts = new Map();
    this.colors = {
      amber: '#f59e0b', green: '#10b981', red: '#ef4444', blue: '#3b82f6',
      purple: '#8b5cf6', cyan: '#06b6d4', surface: '#161b22', border: '#30363d', text: '#e5e7eb'
    };
  }

  createWaterfallChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const colors = data.values.map(v => v >= 0 ? this.colors.green : this.colors.red);
    
    return new Chart(ctx, {
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
        plugins: { title: { display: true, text: 'Performance Attribution' } }
      }
    });
  }

  createEfficientFrontier(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    return new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Frontier', data: data.frontier, showLine: true, borderColor: this.colors.blue },
          { label: 'Current', data: [data.current], backgroundColor: this.colors.amber, pointRadius: 8 },
          { label: 'Optimal', data: [data.optimal], backgroundColor: this.colors.green, pointRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Efficient Frontier' } },
        scales: {
          x: { title: { display: true, text: 'Risk %' } },
          y: { title: { display: true, text: 'Return %' } }
        }
      }
    });
  }

  createDrawdownChart(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Drawdown', data: data.values, borderColor: this.colors.red, fill: true }]
      },
      options: { responsive: true, scales: { y: { reverse: true } } }
    });
  }

  createFactorExposures(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Beta', data: data.values, backgroundColor: this.colors.blue }]
      },
      options: { indexAxis: 'y', responsive: true }
    });
  }

  createESGRadar(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'radar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Portfolio', data: data.portfolio, borderColor: this.colors.green },
          { label: 'Benchmark', data: data.benchmark, borderColor: this.colors.blue }
        ]
      },
      options: { responsive: true, scales: { r: { min: 0, max: 100 } } }
    });
  }

  destroyChart(id) {
    if (this.charts.has(id)) {
      this.charts.get(id).destroy();
      this.charts.delete(id);
    }
  }
}


  // 6. HEATMAP - Correlation Matrix
  createHeatmap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    const matrix = data.matrix || [];
    const labels = data.labels || [];
    
    return new Chart(ctx, {
      type: 'matrix',
      data: {
        datasets: [{
          label: 'Correlation',
          data: matrix.flatMap((row, i) => row.map((value, j) => ({
            x: labels[j], y: labels[i], v: value
          }))),
          backgroundColor(c) {
            const value = c.dataset.data[c.dataIndex].v;
            const alpha = Math.abs(value);
            return value >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
          },
          width: ({chart}) => (chart.chartArea.width / labels.length) - 1,
          height: ({chart}) => (chart.chartArea.height / labels.length) - 1
        }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Correlation Matrix' }, legend: { display: false } }
      }
    });
  }

  // 7. DUAL-AXIS LINE CHART - Excess Return
  createDualAxisLine(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Portfolio', data: data.portfolio, borderColor: this.colors.amber, yAxisID: 'y' },
          { label: 'Benchmark', data: data.benchmark, borderColor: this.colors.blue, yAxisID: 'y' },
          { label: 'Excess', data: data.excess, borderColor: this.colors.green, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Cumulative Return %' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Excess Return %' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // 8. TREEMAP - Concentration
  createTreemap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    return new Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          label: 'Holdings',
          tree: data.holdings,
          key: 'value',
          groups: ['symbol'],
          backgroundColor(c) {
            const value = c.dataset.tree[c.dataIndex].weight;
            return value > 20 ? this.colors.red : value > 10 ? this.colors.amber : this.colors.green;
          }
        }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Holdings Concentration' } } }
    });
  }

  // 9. PARETO CHART - Cumulative Concentration
  createParetoChart(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Weight %', data: data.weights, backgroundColor: this.colors.blue, yAxisID: 'y' },
          { label: 'Cumulative %', data: data.cumulative, type: 'line', borderColor: this.colors.amber, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { type: 'linear', position: 'left' },
          y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // 10. STACKED AREA CHART - Sector Rotation
  createStackedArea(canvasId, data) {
    const datasets = data.sectors.map((sector, i) => ({
      label: sector.name,
      data: sector.values,
      backgroundColor: this.getColorPalette()[i],
      borderColor: this.getColorPalette()[i],
      fill: true
    }));

    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: true,
        scales: { y: { stacked: true }, x: { stacked: true } },
        plugins: { title: { display: true, text: 'Sector Allocation Over Time' } }
      }
    });
  }

  // 11. BUBBLE CHART - Liquidity Analysis
  createBubbleChart(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Holdings',
          data: data.holdings.map(h => ({ x: h.weight, y: h.adv, r: h.impact * 10 })),
          backgroundColor: this.colors.blue
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Position Weight %' } },
          y: { title: { display: true, text: 'Avg Daily Volume' } }
        }
      }
    });
  }

  // 12. BOX PLOT - Transaction Costs
  createBoxPlot(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'boxplot',
      data: {
        labels: data.brokers,
        datasets: [{
          label: 'Cost (bps)',
          data: data.costs,
          backgroundColor: this.colors.blue,
          borderColor: this.colors.amber
        }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'TCA by Broker' } } }
    });
  }

  // 13. TIMELINE CHART - Cost Over Time
  createTimelineChart(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: data.dates,
        datasets: [{
          label: 'Cost (bps)',
          data: data.costs,
          borderColor: this.colors.red,
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Transaction Costs Timeline' } }
      }
    });
  }

  // 14. GAUGE CHART - Goal Progress
  createGaugeChart(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [data.current, data.target - data.current],
          backgroundColor: [this.colors.green, this.colors.surface],
          circumference: 180,
          rotation: 270
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: data.label },
          legend: { display: false }
        }
      }
    });
  }

  // 15. KPI CARDS - Summary Metrics (HTML generation)
  createKPICards(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = data.metrics.map(m => `
      <div class="kpi-card bg-bloomberg-surface border border-bloomberg-border rounded p-4">
        <div class="text-xs text-slate-500 uppercase">${m.label}</div>
        <div class="text-3xl font-bold text-white font-mono">${m.value}</div>
        <div class="text-sm ${m.change >= 0 ? 'text-green-500' : 'text-red-500'}">
          ${m.change >= 0 ? '↑' : '↓'} ${Math.abs(m.change).toFixed(2)}%
        </div>
      </div>
    `).join('');
  }

  // 16. QUADRANT SCATTER - Peer Benchmarking
  createQuadrantScatter(canvasId, data) {
    return new Chart(document.getElementById(canvasId), {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Peers', data: data.peers, backgroundColor: this.colors.blue },
          { label: 'Your Portfolio', data: [data.portfolio], backgroundColor: this.colors.amber, pointRadius: 10 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          annotation: {
            annotations: {
              line1: { type: 'line', yMin: data.avgReturn, yMax: data.avgReturn, borderColor: this.colors.text, borderWidth: 1 },
              line2: { type: 'line', xMin: data.avgRisk, xMax: data.avgRisk, borderColor: this.colors.text, borderWidth: 1 }
            }
          }
        }
      }
    });
  }

  // 17. CALENDAR HEATMAP - Trading Activity
  createCalendarHeatmap(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    return new Chart(ctx, {
      type: 'matrix',
      data: {
        datasets: [{
          label: 'Activity',
          data: data.days.map(d => ({ x: d.date, y: d.weekday, v: d.value })),
          backgroundColor(c) {
            const value = c.dataset.data[c.dataIndex].v;
            const alpha = value / 100;
            return `rgba(59,130,246,${alpha})`;
          },
          width: 15,
          height: 15
        }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Trading Calendar' } }
      }
    });
  }

  // Helper: Get color palette
  getColorPalette() {
    return [
      this.colors.blue, this.colors.green, this.colors.amber,
      this.colors.purple, this.colors.cyan, this.colors.red
    ];
  }

}

window.advancedCharts = new AdvancedCharts();

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

    // Create a new window and print
    const imgData = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>${filename || 'Chart'}</title></head>
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

  // Export chart data as JSON
  exportChartDataAsJSON(chartData, filename) {
    const json = JSON.stringify(chartData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${filename || 'chart-data'}.json`;
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
    if (!canvas) return;

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

  // Export all charts as ZIP
  async exportAllChartsAsZIP(filename) {
    const charts = Array.from(this.charts.entries());
    if (charts.length === 0) {
      console.error('No charts to export');
      return;
    }

    // Note: This requires JSZip library
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip library not loaded. Download images separately.');
      charts.forEach(([id], i) => {
        setTimeout(() => this.exportChartAsPNG(id, `chart-${i + 1}`), i * 100);
      });
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder('charts');

    for (const [canvasId, chart] of charts) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) continue;
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      folder.file(`${canvasId}.png`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `${filename || 'charts'}.zip`;
    link.href = URL.createObjectURL(content);
    link.click();
  }

  // Create export button for a chart
  addExportButton(canvasId, containerId) {
    const container = document.getElementById(containerId || canvasId + '-controls');
    if (!container) {
      console.warn('Export controls container not found');
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
        <button onclick="advancedCharts.copyChartToClipboard('${canvasId}')"
                class="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">
          Copy
        </button>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', buttonHTML);
  }

