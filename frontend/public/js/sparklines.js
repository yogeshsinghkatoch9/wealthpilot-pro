/**
 * Sparklines - Tiny inline charts
 * Lightweight, fast inline charts for at-a-glance trends
 */

class Sparkline {
  constructor(element, data, options = {}) {
    this.element = element;
    this.data = Array.isArray(data) ? data : [];
    this.options = {
      type: options.type || 'line', // 'line', 'area', 'bar'
      width: options.width || element.clientWidth || 100,
      height: options.height || element.clientHeight || 30,
      lineColor: options.lineColor || '#ff6600',
      fillColor: options.fillColor || 'rgba(255, 102, 0, 0.1)',
      spotColor: options.spotColor || '#ff6600',
      minSpotColor: options.minSpotColor || '#ef4444',
      maxSpotColor: options.maxSpotColor || '#10b981',
      showSpots: options.showSpots !== false,
      showTooltip: options.showTooltip !== false,
      animate: options.animate !== false,
      ...options
    };

    this.canvas = null;
    this.ctx = null;
    this.tooltip = null;

    this.init();
  }

  init() {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.className = 'sparkline-canvas';
    this.element.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');

    // Draw
    this.draw();

    // Setup interactions
    if (this.options.showTooltip) {
      this.setupTooltip();
    }
  }

  draw() {
    if (this.data.length === 0) return;

    const ctx = this.ctx;
    const { width, height } = this.options;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate scaling
    const min = Math.min(...this.data);
    const max = Math.max(...this.data);
    const range = max - min || 1;
    const step = width / (this.data.length - 1 || 1);

    // Normalize data points
    const points = this.data.map((value, index) => ({
      x: index * step,
      y: height - ((value - min) / range) * height,
      value: value
    }));

    // Draw based on type
    switch (this.options.type) {
      case 'area':
        this.drawArea(points);
        break;
      case 'bar':
        this.drawBars(points);
        break;
      case 'line':
      default:
        this.drawLine(points);
        break;
    }

    // Draw spots for min/max
    if (this.options.showSpots) {
      this.drawSpots(points, min, max);
    }

    // Store points for tooltip
    this.points = points;
  }

  drawLine(points) {
    const ctx = this.ctx;

    ctx.strokeStyle = this.options.lineColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  }

  drawArea(points) {
    const ctx = this.ctx;
    const { height } = this.options;

    // Fill area
    ctx.fillStyle = this.options.fillColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fill();

    // Draw line on top
    this.drawLine(points);
  }

  drawBars(points) {
    const ctx = this.ctx;
    const { height, width } = this.options;
    const barWidth = (width / points.length) * 0.8;

    points.forEach(point => {
      ctx.fillStyle = this.options.lineColor;
      const barHeight = height - point.y;
      ctx.fillRect(point.x - barWidth / 2, point.y, barWidth, barHeight);
    });
  }

  drawSpots(points, min, max) {
    const ctx = this.ctx;

    points.forEach(point => {
      let color;
      if (point.value === min) {
        color = this.options.minSpotColor;
      } else if (point.value === max) {
        color = this.options.maxSpotColor;
      } else if (this.options.showSpots === 'all') {
        color = this.options.spotColor;
      } else {
        return;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  setupTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'sparkline-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Find closest point
      const closest = this.points.reduce((prev, curr) => {
        return Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev;
      });

      // Show tooltip
      this.tooltip.textContent = this.formatValue(closest.value);
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = e.clientX + 10 + 'px';
      this.tooltip.style.top = e.clientY - 30 + 'px';

      // Highlight point
      this.draw();
      this.ctx.fillStyle = this.options.spotColor;
      this.ctx.beginPath();
      this.ctx.arc(closest.x, closest.y, 4, 0, 2 * Math.PI);
      this.ctx.fill();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.tooltip.style.display = 'none';
      this.draw();
    });
  }

  formatValue(value) {
    if (this.options.valueFormatter) {
      return this.options.valueFormatter(value);
    }
    return value.toFixed(2);
  }

  update(newData) {
    this.data = newData;
    this.draw();
  }

  destroy() {
    if (this.tooltip) {
      this.tooltip.remove();
    }
    this.canvas.remove();
  }
}

// Utility function to create sparklines from data attributes
function initSparklines() {
  document.querySelectorAll('[data-sparkline]').forEach(element => {
    const data = JSON.parse(element.dataset.sparkline || '[]');
    const type = element.dataset.sparklineType || 'line';
    const color = element.dataset.sparklineColor || '#ff6600';

    new Sparkline(element, data, {
      type,
      lineColor: color,
      fillColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba')
    });
  });
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', initSparklines);

// Expose to global scope
window.Sparkline = Sparkline;
window.initSparklines = initSparklines;

// Usage examples:
// <div data-sparkline='[1,3,2,5,4,6,5,7]' data-sparkline-type="area" data-sparkline-color="#10b981"></div>
//
// OR
//
// const sparkline = new Sparkline(element, [1, 3, 2, 5, 4, 6], {
//   type: 'line',
//   lineColor: '#ff6600',
//   showTooltip: true
// });
