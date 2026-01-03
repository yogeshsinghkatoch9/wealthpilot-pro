/**
 * Interactive Chart Features
 * Adds zoom, pan, export, fullscreen, and interactive controls to Chart.js
 */

class InteractiveChart {
  constructor(chartInstance, options = {}) {
    this.chart = chartInstance;
    this.canvas = chartInstance.canvas;
    this.container = this.canvas.parentElement;
    this.options = {
      enableZoom: options.enableZoom !== false,
      enablePan: options.enablePan !== false,
      enableExport: options.enableExport !== false,
      enableFullscreen: options.enableFullscreen !== false,
      enableDataLabels: options.enableDataLabels !== false,
      enableTooltipPin: options.enableTooltipPin !== false,
      ...options
    };

    this.isFullscreen = false;
    this.pinnedTooltip = null;

    this.init();
  }

  init() {
    this.createControlBar();
    this.setupZoomPan();
    this.setupTooltipInteractions();
    this.setupKeyboardShortcuts();
  }

  createControlBar() {
    const controlBar = document.createElement('div');
    controlBar.className = 'chart-control-bar';
    controlBar.innerHTML = `
      <div class="chart-control-group">
        ${this.options.enableZoom ? `
          <button class="chart-control-btn" data-action="zoom-in" title="Zoom In (+ key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/>
            </svg>
          </button>
          <button class="chart-control-btn" data-action="zoom-out" title="Zoom Out (- key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM7 10h6"/>
            </svg>
          </button>
          <button class="chart-control-btn" data-action="reset-zoom" title="Reset Zoom (R key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        ` : ''}
      </div>

      <div class="chart-control-group">
        ${this.options.enableDataLabels ? `
          <button class="chart-control-btn" data-action="toggle-labels" title="Toggle Data Labels (L key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
            </svg>
          </button>
        ` : ''}

        <button class="chart-control-btn" data-action="toggle-legend" title="Toggle Legend">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>

      <div class="chart-control-group">
        ${this.options.enableExport ? `
          <button class="chart-control-btn" data-action="export-png" title="Export as PNG (E key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </button>
          <button class="chart-control-btn" data-action="export-csv" title="Export Data as CSV">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </button>
        ` : ''}

        ${this.options.enableFullscreen ? `
          <button class="chart-control-btn" data-action="fullscreen" title="Fullscreen (F key)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;

    // Insert control bar before canvas
    this.container.insertBefore(controlBar, this.canvas);

    // Attach event listeners
    controlBar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        this.handleAction(action);
      });
    });
  }

  handleAction(action) {
    switch (action) {
      case 'zoom-in':
        this.zoomIn();
        break;
      case 'zoom-out':
        this.zoomOut();
        break;
      case 'reset-zoom':
        this.resetZoom();
        break;
      case 'toggle-labels':
        this.toggleDataLabels();
        break;
      case 'toggle-legend':
        this.toggleLegend();
        break;
      case 'export-png':
        this.exportAsPNG();
        break;
      case 'export-csv':
        this.exportAsCSV();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
    }
  }

  setupZoomPan() {
    if (!this.options.enableZoom && !this.options.enablePan) return;

    // Add zoom plugin if not already present
    if (this.chart.options.plugins) {
      this.chart.options.plugins.zoom = {
        zoom: {
          wheel: {
            enabled: this.options.enableZoom
          },
          pinch: {
            enabled: this.options.enableZoom
          },
          mode: 'xy'
        },
        pan: {
          enabled: this.options.enablePan,
          mode: 'xy'
        }
      };
    }

    this.chart.update();
  }

  zoomIn() {
    if (this.chart.zoom) {
      this.chart.zoom(1.1);
    }
  }

  zoomOut() {
    if (this.chart.zoom) {
      this.chart.zoom(0.9);
    }
  }

  resetZoom() {
    if (this.chart.resetZoom) {
      this.chart.resetZoom();
    }
  }

  toggleDataLabels() {
    const datasets = this.chart.data.datasets;
    const showLabels = !datasets[0].datalabels?.display;

    datasets.forEach(dataset => {
      if (!dataset.datalabels) dataset.datalabels = {};
      dataset.datalabels.display = showLabels;
    });

    this.chart.update();

    if (window.toast) {
      toast.info(`Data labels ${showLabels ? 'shown' : 'hidden'}`);
    }
  }

  toggleLegend() {
    const legend = this.chart.options.plugins.legend;
    legend.display = !legend.display;
    this.chart.update();
  }

  exportAsPNG() {
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();

    if (window.toast) {
      toast.success('Chart exported as PNG');
    }
  }

  exportAsCSV() {
    const data = this.chart.data;
    let csv = 'Label,' + data.datasets.map(d => d.label).join(',') + '\n';

    data.labels.forEach((label, i) => {
      const row = [label];
      data.datasets.forEach(dataset => {
        row.push(dataset.data[i]);
      });
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `chart-data-${Date.now()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();

    if (window.toast) {
      toast.success('Data exported as CSV');
    }
  }

  toggleFullscreen() {
    if (!this.isFullscreen) {
      this.container.classList.add('chart-fullscreen');
      this.isFullscreen = true;
      this.chart.resize();
    } else {
      this.container.classList.remove('chart-fullscreen');
      this.isFullscreen = false;
      this.chart.resize();
    }
  }

  setupTooltipInteractions() {
    if (!this.options.enableTooltipPin) return;

    this.canvas.addEventListener('click', (e) => {
      const elements = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);

      if (elements.length > 0) {
        this.pinTooltip(elements[0]);
      }
    });
  }

  pinTooltip(element) {
    // Create pinned tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-pinned-tooltip';

    const datasetIndex = element.datasetIndex;
    const index = element.index;
    const dataset = this.chart.data.datasets[datasetIndex];
    const value = dataset.data[index];
    const label = this.chart.data.labels[index];

    tooltip.innerHTML = `
      <div class="chart-pinned-tooltip-header">
        <strong>${label}</strong>
        <button class="chart-pinned-tooltip-close">&times;</button>
      </div>
      <div class="chart-pinned-tooltip-body">
        <span style="color: ${dataset.borderColor}">${dataset.label}:</span>
        <strong>${value}</strong>
      </div>
    `;

    tooltip.style.left = element.element.x + 'px';
    tooltip.style.top = element.element.y + 'px';

    this.container.appendChild(tooltip);

    tooltip.querySelector('.chart-pinned-tooltip-close').addEventListener('click', () => {
      tooltip.remove();
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.canvas.matches(':hover')) return;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          this.zoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          this.zoomOut();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          this.resetZoom();
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          this.exportAsPNG();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          this.toggleDataLabels();
          break;
      }
    });
  }

  destroy() {
    // Cleanup
    this.container.querySelector('.chart-control-bar')?.remove();
    this.container.querySelectorAll('.chart-pinned-tooltip').forEach(t => t.remove());
  }
}

// Auto-enhance all charts with data-interactive attribute
document.addEventListener('DOMContentLoaded', () => {
  // Wait for Chart.js to be available
  if (typeof Chart !== 'undefined') {
    const interactiveCharts = document.querySelectorAll('canvas[data-interactive]');

    interactiveCharts.forEach(canvas => {
      // Wait for chart instance to be created
      const checkChart = setInterval(() => {
        const chartInstance = Chart.getChart(canvas);
        if (chartInstance) {
          clearInterval(checkChart);
          new InteractiveChart(chartInstance);
        }
      }, 100);
    });
  }
});

// Expose to global scope
window.InteractiveChart = InteractiveChart;

// Usage:
// <canvas id="myChart" data-interactive></canvas>
// OR
// const chart = new Chart(ctx, config);
// new InteractiveChart(chart);
