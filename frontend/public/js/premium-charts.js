/**
 * WealthPilot Pro - Premium Chart Library
 * Advanced visualizations with 3D, Sankey, Multi-timeframe & more
 */

class PremiumCharts {
  constructor() {
    this.charts = new Map();
    this.threeScenes = new Map();
    this.syncedCharts = [];

    // Forest Green Color Palette
    this.colors = {
      forest: {
        darkest: '#0D2818',
        dark: '#142E1F',
        base: '#1A3D28',
        mid: '#245534',
        light: '#2E6B40',
        bright: '#34D399'
      },
      positive: '#34D399',
      negative: '#ef4444',
      neutral: '#71717a',
      primary: '#6366f1',
      secondary: '#8b5cf6',
      amber: '#f59e0b',
      surface: '#0f0f11',
      border: 'rgba(255,255,255,0.06)',
      text: '#fafafa',
      textMuted: '#71717a'
    };

    this.sectorColors = {
      'Technology': '#6366f1',
      'Healthcare': '#10b981',
      'Financial': '#f59e0b',
      'Consumer': '#ec4899',
      'Industrial': '#8b5cf6',
      'Energy': '#ef4444',
      'Materials': '#06b6d4',
      'Utilities': '#14b8a6',
      'Real Estate': '#f97316',
      'Communication': '#3b82f6',
      'Other': '#71717a'
    };
  }

  // ==================== 1. ENHANCED WATERFALL CHART ====================
  createWaterfallChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    // Calculate cumulative values for true waterfall
    const values = data.values || [];
    const labels = data.labels || [];
    const cumulative = [];
    let running = data.startValue || 0;

    // Build waterfall data structure
    const waterfallData = values.map((val, i) => {
      const start = running;
      running += val;
      cumulative.push(running);
      return {
        start: start,
        end: running,
        value: val,
        isPositive: val >= 0
      };
    });

    // Add starting and ending totals if needed
    if (data.showTotals !== false) {
      waterfallData.unshift({ start: 0, end: data.startValue || 0, value: data.startValue || 0, isTotal: true });
      waterfallData.push({ start: 0, end: running, value: running, isTotal: true });
      labels.unshift(data.startLabel || 'Start');
      labels.push(data.endLabel || 'Total');
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Decrease',
            data: waterfallData.map(d => d.isTotal ? null : (d.value < 0 ? Math.abs(d.value) : null)),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack'
          },
          {
            label: 'Increase',
            data: waterfallData.map(d => d.isTotal ? null : (d.value >= 0 ? d.value : null)),
            backgroundColor: 'rgba(52, 211, 153, 0.8)',
            borderColor: this.colors.positive,
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack'
          },
          {
            label: 'Total',
            data: waterfallData.map(d => d.isTotal ? d.value : null),
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack'
          },
          {
            label: 'Invisible Base',
            data: waterfallData.map((d, i) => {
              if (d.isTotal) return 0;
              return d.value >= 0 ? d.start : d.end;
            }),
            backgroundColor: 'transparent',
            borderWidth: 0,
            stack: 'stack'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: options.title || 'Return Attribution',
            color: this.colors.text,
            font: { size: 16, weight: 700, family: 'Inter' }
          },
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const d = waterfallData[idx];
                if (!d) return '';
                const sign = d.value >= 0 ? '+' : '';
                return `${sign}${d.value.toFixed(2)}% (Total: ${d.end.toFixed(2)}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: this.colors.textMuted, font: { family: 'Inter' } }
          },
          y: {
            grid: { color: this.colors.border },
            ticks: {
              color: this.colors.textMuted,
              callback: (val) => val.toFixed(1) + '%'
            },
            title: {
              display: true,
              text: 'Cumulative Return (%)',
              color: this.colors.textMuted
            }
          }
        }
      }
    });

    // Add connecting lines
    this._addWaterfallConnectors(chart, waterfallData);

    this.charts.set(canvasId, chart);
    return chart;
  }

  _addWaterfallConnectors(chart, data) {
    const connectorPlugin = {
      id: 'waterfallConnectors',
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(3); // Invisible base dataset

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        for (let i = 0; i < meta.data.length - 1; i++) {
          const current = meta.data[i];
          const next = meta.data[i + 1];

          if (current && next) {
            ctx.beginPath();
            ctx.moveTo(current.x + current.width / 2, current.y);
            ctx.lineTo(next.x - next.width / 2, current.y);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    };

    Chart.register(connectorPlugin);
  }

  // ==================== 2. 3D PORTFOLIO BUBBLE CHART ====================
  create3DBubbleChart(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || typeof THREE === 'undefined') {
      console.error('Container not found or Three.js not loaded');
      return null;
    }

    // Clear existing scene
    if (this.threeScenes.has(containerId)) {
      this.threeScenes.get(containerId).dispose();
    }

    const width = container.clientWidth || 600;
    const height = options.height || 500;

    // Setup Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f11);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(50, 50, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    // Create grid
    const gridHelper = new THREE.GridHelper(100, 10, 0x333333, 0x222222);
    scene.add(gridHelper);

    // Add axes
    this._add3DAxes(scene);

    // Create bubbles from data
    const holdings = data.holdings || [];
    const bubbles = [];
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    holdings.forEach((holding, i) => {
      const sector = holding.sector || 'Other';
      const color = new THREE.Color(this.sectorColors[sector] || this.colors.primary);

      // Position: X = sector index, Y = value, Z = volatility
      const sectorIndex = Object.keys(this.sectorColors).indexOf(sector);
      const x = (sectorIndex !== -1 ? sectorIndex : 10) * 8 - 40;
      const y = (holding.value || 0) / 1000; // Scale down
      const z = (holding.volatility || 15) * 2 - 30;

      // Size based on weight
      const radius = Math.max(1, Math.sqrt(holding.weight || 5) * 1.5);

      // Create sphere
      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.85,
        emissive: color,
        emissiveIntensity: 0.1
      });

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);
      sphere.userData = holding;

      // Glow effect for positive returns
      if (holding.return > 0) {
        const glowGeometry = new THREE.SphereGeometry(radius * 1.3, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0x34D399,
          transparent: true,
          opacity: 0.15
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        sphere.add(glow);
      }

      scene.add(sphere);
      bubbles.push(sphere);
    });

    // Add labels
    this._add3DLabels(scene, holdings);

    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'three-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      padding: 12px 16px;
      background: rgba(15, 15, 17, 0.95);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fafafa;
      font-size: 13px;
      pointer-events: none;
      display: none;
      z-index: 100;
      backdrop-filter: blur(10px);
    `;
    container.appendChild(tooltip);

    // Mouse interaction
    container.addEventListener('mousemove', (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(bubbles);

      if (intersects.length > 0) {
        const holding = intersects[0].object.userData;
        tooltip.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 4px;">${holding.symbol || 'N/A'}</div>
          <div style="font-size: 11px; color: #71717a;">${holding.name || ''}</div>
          <div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <span style="color: #71717a;">Value:</span>
            <span style="font-family: monospace;">$${(holding.value || 0).toLocaleString()}</span>
            <span style="color: #71717a;">Weight:</span>
            <span style="font-family: monospace;">${(holding.weight || 0).toFixed(1)}%</span>
            <span style="color: #71717a;">Return:</span>
            <span style="font-family: monospace; color: ${holding.return >= 0 ? '#34D399' : '#ef4444'};">
              ${holding.return >= 0 ? '+' : ''}${(holding.return || 0).toFixed(2)}%
            </span>
          </div>
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
        tooltip.style.top = (event.clientY - rect.top + 15) + 'px';

        // Highlight bubble
        intersects[0].object.material.emissiveIntensity = 0.4;
      } else {
        tooltip.style.display = 'none';
        bubbles.forEach(b => b.material.emissiveIntensity = 0.1);
      }
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();

      // Gentle rotation for bubbles
      bubbles.forEach((bubble, i) => {
        bubble.rotation.y += 0.002;
      });

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      const newWidth = container.clientWidth;
      camera.aspect = newWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, height);
    };
    window.addEventListener('resize', handleResize);

    // Store scene info for cleanup
    this.threeScenes.set(containerId, {
      scene, camera, renderer, controls,
      dispose: () => {
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
        controls.dispose();
        bubbles.forEach(b => {
          b.geometry.dispose();
          b.material.dispose();
        });
      }
    });

    return { scene, camera, renderer, controls };
  }

  _add3DAxes(scene) {
    // X axis (Sector)
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-50, 0, 0),
      new THREE.Vector3(50, 0, 0)
    ]);
    const xLine = new THREE.Line(xGeometry, new THREE.LineBasicMaterial({ color: 0x6366f1 }));
    scene.add(xLine);

    // Y axis (Value)
    const yGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 50, 0)
    ]);
    const yLine = new THREE.Line(yGeometry, new THREE.LineBasicMaterial({ color: 0x34D399 }));
    scene.add(yLine);

    // Z axis (Volatility)
    const zGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -50),
      new THREE.Vector3(0, 0, 50)
    ]);
    const zLine = new THREE.Line(zGeometry, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
    scene.add(zLine);
  }

  _add3DLabels(scene, holdings) {
    // Add sector labels using CSS2D if available, otherwise skip
    // This is handled in the tooltip for now
  }

  // ==================== 3. MULTI-TIMEFRAME SYNCHRONIZED CHARTS ====================
  createMultiTimeframeCharts(containerIds, symbol, options = {}) {
    const timeframes = options.timeframes || ['1D', '1W', '1M', '3M'];
    const charts = [];

    containerIds.forEach((containerId, index) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      const timeframe = timeframes[index] || '1D';
      const canvas = document.createElement('canvas');
      canvas.id = `${containerId}-canvas`;
      container.innerHTML = '';
      container.appendChild(canvas);

      // Add timeframe label
      const label = document.createElement('div');
      label.className = 'timeframe-label';
      label.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(99, 102, 241, 0.2);
        border: 1px solid rgba(99, 102, 241, 0.3);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        color: #a5b4fc;
      `;
      label.textContent = timeframe;
      container.style.position = 'relative';
      container.appendChild(label);

      // Generate sample data (in real app, fetch from API)
      const data = this._generateTimeframeData(symbol, timeframe);

      const chart = new Chart(canvas, {
        type: 'candlestick',
        data: {
          datasets: [{
            label: `${symbol} - ${timeframe}`,
            data: data,
            color: {
              up: this.colors.positive,
              down: this.colors.negative,
              unchanged: this.colors.neutral
            }
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: false },
            zoom: {
              pan: { enabled: true, mode: 'x' },
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'x'
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: { unit: this._getTimeUnit(timeframe) },
              grid: { color: this.colors.border },
              ticks: { color: this.colors.textMuted, maxRotation: 0 }
            },
            y: {
              position: 'right',
              grid: { color: this.colors.border },
              ticks: { color: this.colors.textMuted }
            }
          }
        }
      });

      charts.push({ chart, timeframe, containerId });
      this.charts.set(containerId, chart);
    });

    // Sync crosshairs
    this._syncChartCrosshairs(charts);
    this.syncedCharts = charts;

    return charts;
  }

  _generateTimeframeData(symbol, timeframe) {
    const now = new Date();
    const data = [];
    const periods = { '1D': 390, '1W': 5 * 78, '1M': 22, '3M': 66, '1Y': 252 };
    const intervals = { '1D': 1, '1W': 5, '1M': 1440, '3M': 1440, '1Y': 1440 };

    const count = periods[timeframe] || 100;
    const interval = intervals[timeframe] || 1;

    let price = 150 + Math.random() * 50;

    for (let i = count; i >= 0; i--) {
      const date = new Date(now - i * interval * 60000);
      const volatility = 0.02 * (timeframe === '1D' ? 0.3 : 1);
      const change = (Math.random() - 0.5) * price * volatility;

      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;

      data.push({
        x: date,
        o: open,
        h: high,
        l: low,
        c: close
      });

      price = close;
    }

    return data;
  }

  _getTimeUnit(timeframe) {
    const units = { '1D': 'minute', '1W': 'hour', '1M': 'day', '3M': 'day', '1Y': 'week' };
    return units[timeframe] || 'day';
  }

  _syncChartCrosshairs(charts) {
    charts.forEach(({ chart, containerId }) => {
      const canvas = chart.canvas;

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const xPercent = x / rect.width;

        charts.forEach(({ chart: otherChart, containerId: otherId }) => {
          if (otherId !== containerId) {
            // Trigger crosshair update on other charts
            const otherRect = otherChart.canvas.getBoundingClientRect();
            const syncX = xPercent * otherRect.width;

            otherChart.setActiveElements([{
              datasetIndex: 0,
              index: Math.floor(xPercent * (otherChart.data.datasets[0]?.data?.length || 0))
            }]);
            otherChart.update('none');
          }
        });
      });
    });
  }

  // ==================== 4. INTERACTIVE CORRELATION HEATMAP ====================
  createCorrelationHeatmap(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const matrix = data.matrix || [];
    const labels = data.labels || [];
    const size = labels.length;
    const cellSize = options.cellSize || Math.min(50, (container.clientWidth - 100) / size);

    // Create SVG
    const svgWidth = cellSize * size + 100;
    const svgHeight = cellSize * size + 100;

    container.innerHTML = `
      <svg id="${containerId}-svg" width="${svgWidth}" height="${svgHeight}">
        <defs>
          <linearGradient id="correlationGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#ef4444;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#1f2937;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#34D399;stop-opacity:1" />
          </linearGradient>
        </defs>
        <g id="cells" transform="translate(80, 60)"></g>
        <g id="xLabels" transform="translate(80, 50)"></g>
        <g id="yLabels" transform="translate(75, 60)"></g>
        <g id="legend" transform="translate(${svgWidth - 100}, 60)"></g>
      </svg>
      <div id="${containerId}-tooltip" class="heatmap-tooltip" style="
        position: absolute;
        display: none;
        background: rgba(15, 15, 17, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 12px;
        font-size: 13px;
        color: #fafafa;
        pointer-events: none;
        z-index: 100;
      "></div>
    `;

    const svg = container.querySelector('svg');
    const cellsGroup = svg.querySelector('#cells');
    const xLabelsGroup = svg.querySelector('#xLabels');
    const yLabelsGroup = svg.querySelector('#yLabels');
    const tooltip = container.querySelector(`#${containerId}-tooltip`);

    // Create cells
    matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', j * cellSize);
        rect.setAttribute('y', i * cellSize);
        rect.setAttribute('width', cellSize - 2);
        rect.setAttribute('height', cellSize - 2);
        rect.setAttribute('rx', 4);
        rect.setAttribute('fill', this._getCorrelationColor(value));
        rect.setAttribute('stroke', 'rgba(255,255,255,0.05)');
        rect.setAttribute('data-row', i);
        rect.setAttribute('data-col', j);
        rect.setAttribute('data-value', value);
        rect.style.cursor = 'pointer';
        rect.style.transition = 'all 0.2s';

        // Hover effects
        rect.addEventListener('mouseenter', (e) => {
          rect.setAttribute('stroke', '#6366f1');
          rect.setAttribute('stroke-width', 2);

          tooltip.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 8px;">
              ${labels[i]} vs ${labels[j]}
            </div>
            <div style="font-size: 24px; font-family: 'JetBrains Mono', monospace; color: ${this._getCorrelationColor(value)};">
              ${value.toFixed(3)}
            </div>
            <div style="font-size: 11px; color: #71717a; margin-top: 4px;">
              ${this._getCorrelationDescription(value)}
            </div>
          `;
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX - container.getBoundingClientRect().left + 15) + 'px';
          tooltip.style.top = (e.clientY - container.getBoundingClientRect().top + 15) + 'px';
        });

        rect.addEventListener('mouseleave', () => {
          rect.setAttribute('stroke', 'rgba(255,255,255,0.05)');
          rect.setAttribute('stroke-width', 1);
          tooltip.style.display = 'none';
        });

        rect.addEventListener('click', () => {
          if (options.onCellClick) {
            options.onCellClick(labels[i], labels[j], value);
          }
        });

        cellsGroup.appendChild(rect);

        // Add value text for larger cells
        if (cellSize >= 40) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', j * cellSize + cellSize / 2);
          text.setAttribute('y', i * cellSize + cellSize / 2 + 4);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('fill', Math.abs(value) > 0.5 ? '#fafafa' : '#71717a');
          text.setAttribute('font-size', '11px');
          text.setAttribute('font-family', 'JetBrains Mono, monospace');
          text.textContent = value.toFixed(2);
          text.style.pointerEvents = 'none';
          cellsGroup.appendChild(text);
        }
      });
    });

    // X-axis labels
    labels.forEach((label, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', i * cellSize + cellSize / 2);
      text.setAttribute('y', 0);
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('transform', `rotate(-45, ${i * cellSize + cellSize / 2}, 0)`);
      text.setAttribute('fill', this.colors.textMuted);
      text.setAttribute('font-size', '11px');
      text.setAttribute('font-family', 'Inter, sans-serif');
      text.textContent = label;
      xLabelsGroup.appendChild(text);
    });

    // Y-axis labels
    labels.forEach((label, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 0);
      text.setAttribute('y', i * cellSize + cellSize / 2 + 4);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('fill', this.colors.textMuted);
      text.setAttribute('font-size', '11px');
      text.setAttribute('font-family', 'Inter, sans-serif');
      text.textContent = label;
      yLabelsGroup.appendChild(text);
    });

    // Legend
    this._addHeatmapLegend(svg.querySelector('#legend'), cellSize * size);

    return { svg, matrix, labels };
  }

  _getCorrelationColor(value) {
    if (value >= 0.7) return '#34D399';
    if (value >= 0.4) return '#10b981';
    if (value >= 0.1) return '#064e3b';
    if (value >= -0.1) return '#374151';
    if (value >= -0.4) return '#7f1d1d';
    if (value >= -0.7) return '#dc2626';
    return '#ef4444';
  }

  _getCorrelationDescription(value) {
    if (value >= 0.7) return 'Strong positive correlation';
    if (value >= 0.4) return 'Moderate positive correlation';
    if (value >= 0.1) return 'Weak positive correlation';
    if (value >= -0.1) return 'No significant correlation';
    if (value >= -0.4) return 'Weak negative correlation';
    if (value >= -0.7) return 'Moderate negative correlation';
    return 'Strong negative correlation';
  }

  _addHeatmapLegend(group, height) {
    const gradientRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gradientRect.setAttribute('x', 0);
    gradientRect.setAttribute('y', 0);
    gradientRect.setAttribute('width', 20);
    gradientRect.setAttribute('height', Math.min(height, 200));
    gradientRect.setAttribute('fill', 'url(#correlationGradient)');
    gradientRect.setAttribute('transform', 'rotate(90)');
    group.appendChild(gradientRect);

    // Legend labels
    const legendLabels = ['+1.0', '0', '-1.0'];
    legendLabels.forEach((label, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 30);
      text.setAttribute('y', i * 100 + 4);
      text.setAttribute('fill', this.colors.textMuted);
      text.setAttribute('font-size', '10px');
      text.textContent = label;
      group.appendChild(text);
    });
  }

  // ==================== 5. SANKEY DIAGRAM ====================
  createSankeyDiagram(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || typeof d3 === 'undefined') {
      console.error('Container not found or D3.js not loaded');
      return null;
    }

    const width = options.width || container.clientWidth || 800;
    const height = options.height || 500;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    container.innerHTML = '';

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create sankey generator
    const sankey = d3.sankey()
      .nodeWidth(20)
      .nodePadding(15)
      .extent([[0, 0], [width - margin.left - margin.right, height - margin.top - margin.bottom]]);

    // Process data
    const { nodes, links } = sankey({
      nodes: data.nodes.map(d => Object.assign({}, d)),
      links: data.links.map(d => Object.assign({}, d))
    });

    // Add links
    const link = svg.append('g')
      .selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('stroke', d => {
        const sourceColor = this._getSankeyNodeColor(d.source);
        const targetColor = this._getSankeyNodeColor(d.target);
        return d.value >= 0 ? sourceColor : this.colors.negative;
      })
      .attr('stroke-opacity', 0.5)
      .attr('fill', 'none')
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('stroke-opacity', 0.8);
      })
      .on('mouseleave', function() {
        d3.select(this).attr('stroke-opacity', 0.5);
      });

    // Add link titles
    link.append('title')
      .text(d => `${d.source.name} → ${d.target.name}\n$${d.value.toLocaleString()}`);

    // Add nodes
    const node = svg.append('g')
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    // Node rectangles
    node.append('rect')
      .attr('height', d => d.y1 - d.y0)
      .attr('width', sankey.nodeWidth())
      .attr('fill', d => this._getSankeyNodeColor(d))
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('fill-opacity', 1);
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).attr('fill-opacity', 0.9);
      });

    // Node labels
    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? sankey.nodeWidth() + 8 : -8)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .attr('fill', this.colors.text)
      .attr('font-size', '12px')
      .attr('font-family', 'Inter, sans-serif')
      .text(d => d.name);

    // Node value labels
    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? sankey.nodeWidth() + 8 : -8)
      .attr('y', d => (d.y1 - d.y0) / 2 + 14)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .attr('fill', this.colors.textMuted)
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => `$${(d.value || 0).toLocaleString()}`);

    return { svg, nodes, links };
  }

  _getSankeyNodeColor(node) {
    const category = node.category || node.name;
    if (category === 'Portfolio' || category === 'Total') return this.colors.primary;
    if (category === 'Gains' || category === 'Income') return this.colors.positive;
    if (category === 'Losses' || category === 'Expenses') return this.colors.negative;
    if (this.sectorColors[category]) return this.sectorColors[category];
    return this.colors.secondary;
  }

  // ==================== 6. VOLUME PROFILE CHART ====================
  createVolumeProfile(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const width = options.width || container.clientWidth || 800;
    const height = options.height || 500;
    const profileWidth = options.profileWidth || 100;

    container.innerHTML = `
      <div style="display: flex; height: ${height}px;">
        <canvas id="${containerId}-price" style="flex: 1;"></canvas>
        <div id="${containerId}-profile" style="width: ${profileWidth}px; position: relative;"></div>
      </div>
    `;

    const priceCanvas = document.getElementById(`${containerId}-price`);
    const profileContainer = document.getElementById(`${containerId}-profile`);

    // Price chart (candlestick or line)
    const priceChart = new Chart(priceCanvas, {
      type: 'line',
      data: {
        labels: data.dates || [],
        datasets: [{
          label: 'Price',
          data: data.prices || [],
          borderColor: this.colors.primary,
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.1,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            display: true,
            grid: { color: this.colors.border },
            ticks: { color: this.colors.textMuted }
          },
          y: {
            position: 'left',
            grid: { color: this.colors.border },
            ticks: { color: this.colors.textMuted }
          }
        }
      }
    });

    // Volume profile (horizontal bars)
    const volumeProfile = data.volumeProfile || [];
    const maxVolume = Math.max(...volumeProfile.map(v => v.volume));
    const priceMin = Math.min(...data.prices);
    const priceMax = Math.max(...data.prices);
    const priceRange = priceMax - priceMin;

    profileContainer.innerHTML = volumeProfile.map(level => {
      const barWidth = (level.volume / maxVolume) * (profileWidth - 10);
      const topPercent = ((priceMax - level.price) / priceRange) * 100;
      const color = level.buyVolume > level.sellVolume ? this.colors.positive : this.colors.negative;

      return `
        <div class="volume-bar" style="
          position: absolute;
          right: 0;
          top: ${topPercent}%;
          width: ${barWidth}px;
          height: ${100 / volumeProfile.length}%;
          background: ${color};
          opacity: 0.7;
          border-radius: 2px 0 0 2px;
          transition: all 0.2s;
        " data-price="${level.price}" data-volume="${level.volume}">
        </div>
      `;
    }).join('');

    // Add POC (Point of Control) line
    const poc = volumeProfile.reduce((max, v) => v.volume > max.volume ? v : max, volumeProfile[0]);
    if (poc) {
      const pocTop = ((priceMax - poc.price) / priceRange) * 100;
      profileContainer.innerHTML += `
        <div class="poc-line" style="
          position: absolute;
          left: 0;
          right: 0;
          top: ${pocTop}%;
          height: 2px;
          background: ${this.colors.amber};
          z-index: 10;
        ">
          <span style="
            position: absolute;
            right: 100%;
            top: -8px;
            font-size: 10px;
            color: ${this.colors.amber};
            white-space: nowrap;
            padding-right: 4px;
          ">POC $${poc.price.toFixed(2)}</span>
        </div>
      `;
    }

    // Add Value Area
    const totalVolume = volumeProfile.reduce((sum, v) => sum + v.volume, 0);
    const valueAreaVolume = totalVolume * 0.7;
    let accumVolume = 0;
    let vaStart = null, vaEnd = null;

    const sortedByVolume = [...volumeProfile].sort((a, b) => b.volume - a.volume);
    for (const level of sortedByVolume) {
      accumVolume += level.volume;
      if (vaStart === null) vaStart = level.price;
      vaEnd = level.price;
      if (accumVolume >= valueAreaVolume) break;
    }

    if (vaStart !== null && vaEnd !== null) {
      const vaHigh = Math.max(vaStart, vaEnd);
      const vaLow = Math.min(vaStart, vaEnd);
      const vaTopPercent = ((priceMax - vaHigh) / priceRange) * 100;
      const vaHeightPercent = ((vaHigh - vaLow) / priceRange) * 100;

      profileContainer.innerHTML += `
        <div class="value-area" style="
          position: absolute;
          left: 0;
          right: 0;
          top: ${vaTopPercent}%;
          height: ${vaHeightPercent}%;
          background: rgba(99, 102, 241, 0.1);
          border-top: 1px dashed rgba(99, 102, 241, 0.5);
          border-bottom: 1px dashed rgba(99, 102, 241, 0.5);
          pointer-events: none;
        "></div>
      `;
    }

    this.charts.set(containerId, priceChart);
    return { priceChart, volumeProfile, poc };
  }

  // ==================== UTILITY METHODS ====================

  // Generate sample volume profile data
  generateVolumeProfileData(prices, volumes) {
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const buckets = 20;
    const bucketSize = (priceMax - priceMin) / buckets;

    const profile = [];
    for (let i = 0; i < buckets; i++) {
      const bucketPrice = priceMin + (i + 0.5) * bucketSize;
      let bucketVolume = 0;
      let buyVolume = 0;
      let sellVolume = 0;

      prices.forEach((price, idx) => {
        if (price >= priceMin + i * bucketSize && price < priceMin + (i + 1) * bucketSize) {
          const vol = volumes[idx] || 1000;
          bucketVolume += vol;
          if (idx > 0 && prices[idx] > prices[idx - 1]) {
            buyVolume += vol;
          } else {
            sellVolume += vol;
          }
        }
      });

      profile.push({
        price: bucketPrice,
        volume: bucketVolume,
        buyVolume,
        sellVolume
      });
    }

    return profile;
  }

  // Destroy chart
  destroyChart(containerId) {
    if (this.charts.has(containerId)) {
      this.charts.get(containerId).destroy();
      this.charts.delete(containerId);
    }
    if (this.threeScenes.has(containerId)) {
      this.threeScenes.get(containerId).dispose();
      this.threeScenes.delete(containerId);
    }
  }

  // Destroy all
  destroyAll() {
    this.charts.forEach((chart, id) => chart.destroy());
    this.charts.clear();
    this.threeScenes.forEach((scene, id) => scene.dispose());
    this.threeScenes.clear();
  }
}

// Initialize global instance
window.premiumCharts = new PremiumCharts();
