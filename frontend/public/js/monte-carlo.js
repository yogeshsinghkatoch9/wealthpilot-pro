/**
 * Monte Carlo Simulator for Portfolio Forecasting
 * WealthPilot Pro - Premium Portfolio Intelligence
 *
 * Features:
 * - Client-side simulation with Web Workers for performance
 * - Box-Muller transform for normal distribution
 * - Probability cone visualization
 * - Distribution histogram
 * - Goal probability calculation
 */

class MonteCarloSimulator {
  constructor() {
    this.projectionChart = null;
    this.histogramChart = null;
    this.chartScale = 'linear';
    this.lastResults = null;
    this.worker = null;

    // Chart colors matching forest green theme
    this.colors = {
      p5: 'rgba(239, 68, 68, 0.3)',     // Red - worst case
      p25: 'rgba(245, 158, 11, 0.3)',   // Amber
      p50: 'rgba(52, 211, 153, 0.8)',   // Forest green - median
      p75: 'rgba(99, 102, 241, 0.3)',   // Indigo
      p95: 'rgba(139, 92, 246, 0.3)',   // Purple - best case
      fill5_25: 'rgba(245, 158, 11, 0.1)',
      fill25_50: 'rgba(52, 211, 153, 0.15)',
      fill50_75: 'rgba(99, 102, 241, 0.15)',
      fill75_95: 'rgba(139, 92, 246, 0.1)',
      histogram: 'rgba(52, 211, 153, 0.6)',
      histogramBorder: 'rgba(52, 211, 153, 1)',
      goalLine: 'rgba(245, 158, 11, 0.8)'
    };

    this.init();
  }

  init() {
    console.log('Monte Carlo Simulator initialized');
    this.initWorker();
  }

  /**
   * Initialize Web Worker for background computation
   */
  initWorker() {
    // Create inline worker for simulation
    const workerCode = `
      // Box-Muller transform for normal distribution
      function boxMullerRandom() {
        let u1 = Math.random();
        let u2 = Math.random();
        while (u1 === 0) u1 = Math.random();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      }

      // Run single simulation path
      function runSingleSimulation(params) {
        const { initialInvestment, monthlyContribution, months, monthlyReturn, monthlyVol } = params;
        const path = [initialInvestment];
        let currentValue = initialInvestment;

        for (let month = 1; month <= months; month++) {
          // Generate random monthly return using geometric Brownian motion
          const randomReturn = monthlyReturn + monthlyVol * boxMullerRandom();
          currentValue = currentValue * (1 + randomReturn) + monthlyContribution;

          // Store quarterly values for charting
          if (month % 3 === 0 || month === months) {
            path.push(Math.max(0, currentValue));
          }
        }

        return {
          path: path,
          finalValue: Math.max(0, currentValue)
        };
      }

      // Handle messages from main thread
      self.onmessage = function(e) {
        const { params, numSimulations, batchSize } = e.data;
        const results = [];
        const allPaths = [];

        for (let i = 0; i < numSimulations; i++) {
          const result = runSingleSimulation(params);
          results.push(result.finalValue);
          allPaths.push(result.path);

          // Report progress every batch
          if ((i + 1) % batchSize === 0 || i === numSimulations - 1) {
            self.postMessage({
              type: 'progress',
              completed: i + 1,
              total: numSimulations
            });
          }
        }

        // Sort results for percentile calculation
        results.sort((a, b) => a - b);

        self.postMessage({
          type: 'complete',
          results: results,
          allPaths: allPaths
        });
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      console.log('Web Worker not available, using main thread');
      this.worker = null;
    }
  }

  /**
   * Get current input parameters from form
   */
  getParams() {
    return {
      initialInvestment: parseFloat(document.getElementById('initialInvestment').value) || 100000,
      monthlyContribution: parseFloat(document.getElementById('monthlyContribution').value) || 1000,
      timeHorizon: parseInt(document.getElementById('timeHorizon').value) || 20,
      expectedReturn: parseFloat(document.getElementById('expectedReturn').value) / 100 || 0.08,
      volatility: parseFloat(document.getElementById('volatility').value) / 100 || 0.15,
      numSimulations: parseInt(document.getElementById('numSimulations').value) || 1000,
      goalAmount: parseFloat(document.getElementById('goalAmount').value) || 1000000
    };
  }

  /**
   * Apply preset scenario
   */
  applyPreset(type) {
    const presets = {
      conservative: { expectedReturn: 5, volatility: 10 },
      moderate: { expectedReturn: 8, volatility: 15 },
      aggressive: { expectedReturn: 12, volatility: 22 }
    };

    const preset = presets[type];
    if (preset) {
      document.getElementById('expectedReturn').value = preset.expectedReturn;
      document.getElementById('volatility').value = preset.volatility;

      // Visual feedback
      if (typeof showToast === 'function') {
        showToast(`Applied ${type} preset: ${preset.expectedReturn}% return, ${preset.volatility}% volatility`, 'success');
      }
    }
  }

  /**
   * Box-Muller transform for normal distribution (fallback for main thread)
   */
  boxMullerRandom() {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Run single simulation path (fallback for main thread)
   */
  runSingleSimulation(params) {
    const months = params.timeHorizon * 12;
    const monthlyReturn = params.expectedReturn / 12;
    const monthlyVol = params.volatility / Math.sqrt(12);

    const path = [params.initialInvestment];
    let currentValue = params.initialInvestment;

    for (let month = 1; month <= months; month++) {
      const randomReturn = monthlyReturn + monthlyVol * this.boxMullerRandom();
      currentValue = currentValue * (1 + randomReturn) + params.monthlyContribution;

      if (month % 3 === 0 || month === months) {
        path.push(Math.max(0, currentValue));
      }
    }

    return {
      path: path,
      finalValue: Math.max(0, currentValue)
    };
  }

  /**
   * Run Monte Carlo simulation
   */
  async runSimulation() {
    const params = this.getParams();
    const numSimulations = params.numSimulations;

    // Show progress indicator
    this.showProgress(true);
    this.updateProgress(0, numSimulations);

    // Disable run button
    const runBtn = document.getElementById('runSimulationBtn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<div class="loading-spinner"></div> Running...';
    }

    // Convert to monthly parameters
    const months = params.timeHorizon * 12;
    const monthlyReturn = params.expectedReturn / 12;
    const monthlyVol = params.volatility / Math.sqrt(12);

    const workerParams = {
      initialInvestment: params.initialInvestment,
      monthlyContribution: params.monthlyContribution,
      months: months,
      monthlyReturn: monthlyReturn,
      monthlyVol: monthlyVol
    };

    try {
      let results, allPaths;

      if (this.worker) {
        // Use Web Worker
        const workerResult = await new Promise((resolve, reject) => {
          this.worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
              this.updateProgress(e.data.completed, e.data.total);
            } else if (e.data.type === 'complete') {
              resolve(e.data);
            }
          };
          this.worker.onerror = reject;
          this.worker.postMessage({
            params: workerParams,
            numSimulations: numSimulations,
            batchSize: Math.max(50, Math.floor(numSimulations / 20))
          });
        });

        results = workerResult.results;
        allPaths = workerResult.allPaths;
      } else {
        // Fallback to main thread with async breaks
        results = [];
        allPaths = [];

        for (let i = 0; i < numSimulations; i++) {
          const result = this.runSingleSimulation({
            ...params,
            timeHorizon: params.timeHorizon
          });
          results.push(result.finalValue);
          allPaths.push(result.path);

          if ((i + 1) % 50 === 0) {
            this.updateProgress(i + 1, numSimulations);
            await new Promise(r => setTimeout(r, 0)); // Yield to UI
          }
        }

        results.sort((a, b) => a - b);
      }

      // Calculate percentiles
      const percentiles = this.calculatePercentiles(results);

      // Generate probability cone data
      const coneData = this.generateProbabilityCone(allPaths, params.timeHorizon);

      // Calculate goal probability
      const goalProbability = this.calculateProbabilityOfGoal(results, params.goalAmount);

      // Store results for chart updates
      this.lastResults = {
        params,
        results,
        percentiles,
        coneData,
        goalProbability,
        allPaths
      };

      // Update UI
      this.updateStatistics(params, percentiles, goalProbability);
      this.renderProjectionChart(coneData, params);
      this.renderHistogramChart(results, params.goalAmount);
      this.updateDetailedStats(params, percentiles, results);

      // Hide progress
      this.showProgress(false);

      if (typeof showToast === 'function') {
        showToast(`Simulation complete: ${numSimulations.toLocaleString()} paths analyzed`, 'success');
      }

    } catch (error) {
      console.error('Simulation error:', error);
      if (typeof showToast === 'function') {
        showToast('Simulation failed. Please try again.', 'error');
      }
    }

    // Re-enable run button
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        Run Simulation
      `;
    }
  }

  /**
   * Calculate percentiles from sorted results
   */
  calculatePercentiles(sortedResults) {
    const n = sortedResults.length;
    const getPercentile = (p) => {
      const index = Math.floor(p * n / 100);
      return sortedResults[Math.min(index, n - 1)];
    };

    return {
      p5: getPercentile(5),
      p10: getPercentile(10),
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
      p95: getPercentile(95),
      mean: sortedResults.reduce((a, b) => a + b, 0) / n,
      min: sortedResults[0],
      max: sortedResults[n - 1]
    };
  }

  /**
   * Generate probability cone data from all paths
   */
  generateProbabilityCone(allPaths, years) {
    const numPoints = allPaths[0].length;
    const labels = [];
    const p5 = [], p25 = [], p50 = [], p75 = [], p95 = [];

    for (let i = 0; i < numPoints; i++) {
      // Get all values at this point
      const valuesAtPoint = allPaths.map(path => path[i]).sort((a, b) => a - b);
      const n = valuesAtPoint.length;

      // Calculate percentiles
      p5.push(valuesAtPoint[Math.floor(0.05 * n)]);
      p25.push(valuesAtPoint[Math.floor(0.25 * n)]);
      p50.push(valuesAtPoint[Math.floor(0.50 * n)]);
      p75.push(valuesAtPoint[Math.floor(0.75 * n)]);
      p95.push(valuesAtPoint[Math.floor(0.95 * n)]);

      // Generate label (quarterly)
      if (i === 0) {
        labels.push('Start');
      } else {
        const quarter = i;
        const year = Math.floor(quarter / 4);
        if (quarter % 4 === 0 || i === numPoints - 1) {
          labels.push(`Y${year}`);
        } else {
          labels.push('');
        }
      }
    }

    return { labels, p5, p25, p50, p75, p95 };
  }

  /**
   * Calculate probability of reaching goal
   */
  calculateProbabilityOfGoal(sortedResults, goalAmount) {
    const aboveGoal = sortedResults.filter(v => v >= goalAmount).length;
    return (aboveGoal / sortedResults.length) * 100;
  }

  /**
   * Update statistics display
   */
  updateStatistics(params, percentiles, goalProbability) {
    const totalInvested = params.initialInvestment + (params.monthlyContribution * params.timeHorizon * 12);

    // Format currency
    const formatMoney = (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const formatGrowth = (v) => {
      const multiple = v / totalInvested;
      return multiple >= 1 ? `${multiple.toFixed(1)}x invested` : `${(multiple * 100).toFixed(0)}% of invested`;
    };

    // Update median
    document.getElementById('medianOutcome').textContent = formatMoney(percentiles.p50);
    document.getElementById('medianGrowth').textContent = formatGrowth(percentiles.p50);

    // Update best case
    document.getElementById('bestCase').textContent = formatMoney(percentiles.p95);
    document.getElementById('bestCaseMultiple').textContent = formatGrowth(percentiles.p95);

    // Update worst case
    document.getElementById('worstCase').textContent = formatMoney(percentiles.p5);
    document.getElementById('worstCaseMultiple').textContent = formatGrowth(percentiles.p5);

    // Update goal probability
    const goalProb = document.getElementById('goalProbability');
    goalProb.textContent = goalProbability.toFixed(1) + '%';
    goalProb.className = 'stat-value ' + (goalProbability >= 70 ? 'value-positive' : goalProbability >= 40 ? 'value-warning' : 'value-negative');
    document.getElementById('goalInfo').textContent = `of reaching ${formatMoney(params.goalAmount)}`;
  }

  /**
   * Render probability cone chart
   */
  renderProjectionChart(coneData, params) {
    const ctx = document.getElementById('projectionChart');
    const placeholder = document.getElementById('chartPlaceholder');

    if (placeholder) placeholder.style.display = 'none';
    ctx.style.display = 'block';

    // Destroy existing chart
    if (this.projectionChart) {
      this.projectionChart.destroy();
    }

    this.projectionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: coneData.labels,
        datasets: [
          // Fill areas (order matters for layering)
          {
            label: '5th-25th Percentile',
            data: coneData.p5,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            order: 5
          },
          {
            label: '25th Percentile',
            data: coneData.p25,
            borderColor: this.colors.p25,
            backgroundColor: this.colors.fill5_25,
            fill: '-1',
            borderWidth: 1,
            pointRadius: 0,
            order: 4
          },
          {
            label: '50th Percentile (Median)',
            data: coneData.p50,
            borderColor: this.colors.p50,
            backgroundColor: this.colors.fill25_50,
            fill: '-1',
            borderWidth: 3,
            pointRadius: 0,
            order: 1
          },
          {
            label: '75th Percentile',
            data: coneData.p75,
            borderColor: this.colors.p75,
            backgroundColor: this.colors.fill50_75,
            fill: '-1',
            borderWidth: 1,
            pointRadius: 0,
            order: 3
          },
          {
            label: '95th Percentile',
            data: coneData.p95,
            borderColor: this.colors.p95,
            backgroundColor: this.colors.fill75_95,
            fill: '-1',
            borderWidth: 1,
            pointRadius: 0,
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#a1a1aa',
              font: { family: 'Inter', size: 11 },
              boxWidth: 12,
              padding: 15,
              filter: (item) => !item.text.includes('5th-25th')
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 17, 0.95)',
            titleColor: '#fafafa',
            bodyColor: '#a1a1aa',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                return context.dataset.label + ': $' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#71717a',
              font: { family: 'Inter', size: 11 },
              maxRotation: 0
            }
          },
          y: {
            type: this.chartScale,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#71717a',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (v) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)
            }
          }
        }
      }
    });
  }

  /**
   * Render histogram chart
   */
  renderHistogramChart(results, goalAmount) {
    const ctx = document.getElementById('histogramChart');
    const placeholder = document.getElementById('histogramPlaceholder');

    if (placeholder) placeholder.style.display = 'none';
    ctx.style.display = 'block';

    // Destroy existing chart
    if (this.histogramChart) {
      this.histogramChart.destroy();
    }

    // Create histogram bins
    const numBins = 30;
    const min = results[0];
    const max = results[results.length - 1];
    const binWidth = (max - min) / numBins;

    const bins = [];
    const binLabels = [];
    for (let i = 0; i < numBins; i++) {
      bins.push(0);
      const binStart = min + i * binWidth;
      const binEnd = min + (i + 1) * binWidth;
      binLabels.push(this.formatCompact((binStart + binEnd) / 2));
    }

    // Fill bins
    results.forEach(v => {
      const binIndex = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
      bins[binIndex]++;
    });

    // Find goal bin for annotation
    const goalBinIndex = Math.floor((goalAmount - min) / binWidth);

    // Create bar colors (highlight goal region)
    const barColors = bins.map((_, i) => {
      const binMid = min + (i + 0.5) * binWidth;
      return binMid >= goalAmount ? 'rgba(52, 211, 153, 0.7)' : 'rgba(99, 102, 241, 0.5)';
    });

    this.histogramChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{
          label: 'Frequency',
          data: bins,
          backgroundColor: barColors,
          borderColor: barColors.map(c => c.replace('0.7', '1').replace('0.5', '0.8')),
          borderWidth: 1,
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 17, 0.95)',
            titleColor: '#fafafa',
            bodyColor: '#a1a1aa',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              title: (items) => 'Range: ' + items[0].label,
              label: (context) => {
                const pct = ((context.parsed.y / results.length) * 100).toFixed(1);
                return `${context.parsed.y} simulations (${pct}%)`;
              }
            }
          },
          annotation: goalAmount > min && goalAmount < max ? {
            annotations: {
              goalLine: {
                type: 'line',
                xMin: goalBinIndex,
                xMax: goalBinIndex,
                borderColor: this.colors.goalLine,
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: 'Goal: ' + this.formatCompact(goalAmount),
                  position: 'start',
                  backgroundColor: 'rgba(245, 158, 11, 0.9)',
                  color: '#fff',
                  font: { size: 10, weight: 'bold' }
                }
              }
            }
          } : {}
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#71717a',
              font: { family: 'JetBrains Mono', size: 9 },
              maxRotation: 45,
              callback: function(val, index) {
                return index % 5 === 0 ? this.getLabelForValue(val) : '';
              }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#71717a',
              font: { family: 'Inter', size: 11 }
            }
          }
        }
      }
    });
  }

  /**
   * Update detailed statistics table
   */
  updateDetailedStats(params, percentiles, results) {
    const card = document.getElementById('detailedStatsCard');
    const tbody = document.getElementById('detailedStatsBody');

    if (!card || !tbody) return;

    card.style.display = 'block';

    const totalInvested = params.initialInvestment + (params.monthlyContribution * params.timeHorizon * 12);
    const formatMoney = (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const formatPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

    const stats = [
      { label: 'Total Invested', value: formatMoney(totalInvested), growth: '-' },
      { label: 'Mean Outcome', value: formatMoney(percentiles.mean), growth: formatPct(((percentiles.mean / totalInvested) - 1) * 100) },
      { label: '5th Percentile', value: formatMoney(percentiles.p5), growth: formatPct(((percentiles.p5 / totalInvested) - 1) * 100) },
      { label: '10th Percentile', value: formatMoney(percentiles.p10), growth: formatPct(((percentiles.p10 / totalInvested) - 1) * 100) },
      { label: '25th Percentile', value: formatMoney(percentiles.p25), growth: formatPct(((percentiles.p25 / totalInvested) - 1) * 100) },
      { label: '50th Percentile (Median)', value: formatMoney(percentiles.p50), growth: formatPct(((percentiles.p50 / totalInvested) - 1) * 100) },
      { label: '75th Percentile', value: formatMoney(percentiles.p75), growth: formatPct(((percentiles.p75 / totalInvested) - 1) * 100) },
      { label: '90th Percentile', value: formatMoney(percentiles.p90), growth: formatPct(((percentiles.p90 / totalInvested) - 1) * 100) },
      { label: '95th Percentile', value: formatMoney(percentiles.p95), growth: formatPct(((percentiles.p95 / totalInvested) - 1) * 100) },
      { label: 'Maximum', value: formatMoney(percentiles.max), growth: formatPct(((percentiles.max / totalInvested) - 1) * 100) },
      { label: 'Minimum', value: formatMoney(percentiles.min), growth: formatPct(((percentiles.min / totalInvested) - 1) * 100) }
    ];

    tbody.innerHTML = stats.map(s => `
      <tr>
        <td class="text-secondary">${s.label}</td>
        <td class="text-right font-mono text-primary">${s.value}</td>
        <td class="text-right font-mono ${s.growth.startsWith('+') ? 'value-positive' : s.growth.startsWith('-') ? 'value-negative' : 'text-tertiary'}">${s.growth}</td>
      </tr>
    `).join('');
  }

  /**
   * Set chart scale (linear/logarithmic)
   */
  setChartScale(scale) {
    this.chartScale = scale;

    // Update tab styling
    document.querySelectorAll('.premium-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.textContent.toLowerCase().includes(scale === 'logarithmic' ? 'log' : 'linear')) {
        tab.classList.add('active');
      }
    });

    // Re-render chart if results exist
    if (this.lastResults) {
      this.renderProjectionChart(this.lastResults.coneData, this.lastResults.params);
    }
  }

  /**
   * Show/hide progress indicator
   */
  showProgress(show) {
    const progress = document.getElementById('simulationProgress');
    if (progress) {
      progress.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Update progress display
   */
  updateProgress(completed, total) {
    const text = document.getElementById('progressText');
    const bar = document.getElementById('progressBar');

    if (text) {
      text.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()} complete`;
    }
    if (bar) {
      bar.style.width = `${(completed / total) * 100}%`;
    }
  }

  /**
   * Format number in compact form
   */
  formatCompact(v) {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }
}

// Initialize simulator when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.monteCarloSimulator = new MonteCarloSimulator();
});
