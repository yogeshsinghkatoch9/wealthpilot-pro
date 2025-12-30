class AdvancedDashboard {
  constructor() {
    this.currentTab = 'performance';
    this.currentPortfolio = 'all';
    this.advancedCharts = new AdvancedCharts();
    this.charts = new Map();
    this.data = {};
    this.init();
  }

  init() {
    // Auto-select first portfolio if 'all' is default (required for analytics endpoints)
    const portfolioSelect = document.getElementById('portfolio-select');
    if (portfolioSelect && portfolioSelect.options.length > 1) {
      // Select first real portfolio (skip 'all' option)
      const firstPortfolio = portfolioSelect.options[1]?.value;
      if (firstPortfolio && firstPortfolio !== 'all') {
        portfolioSelect.value = firstPortfolio;
        this.currentPortfolio = firstPortfolio;
      }
    }
    this.setupEventListeners();
    this.loadCurrentTab();
  }

  /**
   * Safely set text content of an element by ID
   * @param {string} elementId - The DOM element ID
   * @param {string|null} value - The value to set, or null to skip
   */
  safeSetText(elementId, value) {
    if (value == null) return;
    const el = document.getElementById(elementId);
    if (el) el.textContent = value;
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Portfolio selection
    const portfolioSelect = document.getElementById('portfolio-select');
    if (portfolioSelect) {
      portfolioSelect.addEventListener('change', (e) => {
        this.currentPortfolio = e.target.value;
        this.loadCurrentTab();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadCurrentTab();
      });
    }

    // Export all button
    const exportAllBtn = document.getElementById('export-all-btn');
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', () => {
        this.exportAllCharts();
      });
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) {
      tabContent.classList.remove('hidden');
    }

    this.currentTab = tabName;
    this.loadCurrentTab();
  }

  async loadCurrentTab() {
    this.showLoading();

    try {
      switch(this.currentTab) {
        case 'performance':
          await this.loadPerformanceTab();
          break;
        case 'risk':
          await this.loadRiskTab();
          break;
        case 'attribution':
          await this.loadAttributionTab();
          break;
        case 'construction':
          await this.loadConstructionTab();
          break;
        case 'specialized':
          await this.loadSpecializedTab();
          break;
      }
    } catch (error) {
      console.error('Tab load error:', error);
      this.showError('Failed to load analytics. Please refresh the page.');
    } finally {
      this.hideLoading();
    }
  }

  async loadPerformanceTab() {
    // Fetch data from backend
    const [attribution, excessReturn, drawdown, rolling] = await Promise.all([
      this.fetchData('/advanced-analytics/performance-attribution'),
      this.fetchData('/advanced-analytics/excess-return'),
      this.fetchData('/advanced-analytics/drawdown-analysis'),
      this.fetchData('/advanced-analytics/rolling-statistics')
    ]);

    // Create charts
    if (attribution) {
      this.advancedCharts.createWaterfallChart('chart-attribution', attribution);
      this.advancedCharts.addExportButton('chart-attribution', 'export-attribution');
    }

    if (excessReturn) {
      this.advancedCharts.createDualAxisLine('chart-excess-return', excessReturn);
      this.advancedCharts.addExportButton('chart-excess-return', 'export-excess-return');
    }

    if (drawdown) {
      this.advancedCharts.createDrawdownChart('chart-drawdown', drawdown);
      this.advancedCharts.addExportButton('chart-drawdown', 'export-drawdown');

      // Update max drawdown display
      this.safeSetText('max-drawdown', drawdown.maxDrawdown != null ? `${drawdown.maxDrawdown.toFixed(2)}%` : null);
    }

    if (rolling) {
      this.advancedCharts.createRollingStats('chart-rolling-stats', rolling);
      this.advancedCharts.addExportButton('chart-rolling-stats', 'export-rolling-stats');
    }

    // Update performance metrics
    this.updatePerformanceMetrics(attribution, excessReturn, rolling);
  }

  async loadRiskTab() {
    const [riskDecomp, varScenarios, correlation, stress, concentration] = await Promise.all([
      this.fetchData('/advanced-analytics/risk-decomposition'),
      this.fetchData('/advanced-analytics/var-scenarios'),
      this.fetchData('/advanced-analytics/correlation-matrix'),
      this.fetchData('/advanced-analytics/stress-scenarios'),
      this.fetchData('/advanced-analytics/concentration-analysis')
    ]);

    if (riskDecomp) {
      this.advancedCharts.createFactorExposures('chart-factor-exposures', riskDecomp);
      this.advancedCharts.addExportButton('chart-factor-exposures', 'export-factor-exposures');
    }

    if (varScenarios) {
      this.advancedCharts.createVaRHistogram('chart-var', varScenarios);
      this.advancedCharts.addExportButton('chart-var', 'export-var');

      // Update VaR metrics
      this.safeSetText('var-95', varScenarios.var95 != null ? `${varScenarios.var95.toFixed(2)}%` : null);
      this.safeSetText('var-99', varScenarios.var99 != null ? `${varScenarios.var99.toFixed(2)}%` : null);
      this.safeSetText('cvar', varScenarios.cvar95 != null ? `${varScenarios.cvar95.toFixed(2)}%` : null);
    }

    if (correlation) {
      this.advancedCharts.createHeatmap('chart-correlation', correlation);
      this.advancedCharts.addExportButton('chart-correlation', 'export-correlation');
    }

    if (stress) {
      this.advancedCharts.createStackedBar('chart-stress', stress);
      this.advancedCharts.addExportButton('chart-stress', 'export-stress');
    }

    if (concentration) {
      this.advancedCharts.createTreemap('chart-concentration-treemap', concentration);
      this.advancedCharts.addExportButton('chart-concentration-treemap', 'export-concentration');

      // Setup toggle
      this.setupConcentrationToggle(concentration);

      // Update HHI
      this.safeSetText('hhi-index', concentration.hhi != null ? concentration.hhi.toFixed(2) : null);
      this.safeSetText('top10-weight', concentration.top10Weight != null ? `${concentration.top10Weight.toFixed(1)}%` : null);
    }

    this.updateRiskMetrics(riskDecomp, varScenarios, concentration);
  }

  async loadAttributionTab() {
    const [regional, sectorRotation, peerBench, alphaDecay] = await Promise.all([
      this.fetchData('/advanced-analytics/regional-attribution'),
      this.fetchData('/advanced-analytics/sector-rotation'),
      this.fetchData('/advanced-analytics/peer-benchmarking'),
      this.fetchData('/advanced-analytics/alpha-decay')
    ]);

    if (regional) {
      this.advancedCharts.createStackedBar('chart-regional', regional);
      this.advancedCharts.addExportButton('chart-regional', 'export-regional');
    }

    if (sectorRotation) {
      this.advancedCharts.createStackedArea('chart-sector-rotation', sectorRotation);
      this.advancedCharts.addExportButton('chart-sector-rotation', 'export-sector-rotation');
    }

    if (peerBench) {
      this.advancedCharts.createQuadrantScatter('chart-peer-benchmarking', peerBench);
      this.advancedCharts.addExportButton('chart-peer-benchmarking', 'export-peer-benchmarking');

      // Update peer metrics
      this.safeSetText('peer-percentile', peerBench.percentile != null ? `${peerBench.percentile}th` : null);
      this.safeSetText('peer-rank', peerBench.rank != null && peerBench.total != null ? `${peerBench.rank} of ${peerBench.total}` : null);
      this.safeSetText('peer-avg-return', peerBench.avgReturn != null ? `${peerBench.avgReturn.toFixed(2)}%` : null);
      this.safeSetText('peer-avg-risk', peerBench.avgRisk != null ? `${peerBench.avgRisk.toFixed(2)}%` : null);
    }

    if (alphaDecay) {
      this.advancedCharts.createHeatmap('chart-alpha-decay', alphaDecay);
      this.advancedCharts.addExportButton('chart-alpha-decay', 'export-alpha-decay');
    }

    this.updateAttributionMetrics(regional);
  }

  async loadConstructionTab() {
    const [frontier, turnover, liquidity, tca] = await Promise.all([
      this.fetchData('/advanced-analytics/efficient-frontier'),
      this.fetchData('/advanced-analytics/turnover-analysis'),
      this.fetchData('/advanced-analytics/liquidity-analysis'),
      this.fetchData('/advanced-analytics/transaction-cost-analysis')
    ]);

    if (frontier) {
      this.advancedCharts.createEfficientFrontier('chart-efficient-frontier', frontier);
      this.advancedCharts.addExportButton('chart-efficient-frontier', 'export-efficient-frontier');
      this.setupFrontierSlider(frontier);
    }

    if (turnover) {
      this.advancedCharts.createCalendarHeatmap('chart-turnover', turnover);
      this.advancedCharts.addExportButton('chart-turnover', 'export-turnover');

      this.safeSetText('annual-turnover', turnover.annualTurnover != null ? `${turnover.annualTurnover.toFixed(1)}%` : null);
    }

    if (liquidity) {
      this.advancedCharts.createBubbleChart('chart-liquidity', liquidity);
      this.advancedCharts.addExportButton('chart-liquidity', 'export-liquidity');

      this.safeSetText('avg-dtl', liquidity.avgDaysToLiquidate != null ? `${liquidity.avgDaysToLiquidate.toFixed(1)} days` : null);
      this.safeSetText('liquidity-score', liquidity.score != null ? liquidity.score : null);
    }

    if (tca) {
      this.advancedCharts.createBoxPlot('chart-tca-boxplot', tca);
      this.advancedCharts.addExportButton('chart-tca-boxplot', 'export-tca');
      this.setupTCAToggle(tca);

      // Update TCA metrics
      this.safeSetText('avg-tca', tca.avgCost != null ? `${tca.avgCost.toFixed(2)} bps` : null);
      this.safeSetText('implicit-cost', tca.implicit != null ? `${tca.implicit.toFixed(2)} bps` : null);
      this.safeSetText('explicit-cost', tca.explicit != null ? `${tca.explicit.toFixed(2)} bps` : null);
      this.safeSetText('slippage-cost', tca.slippage != null ? `${tca.slippage.toFixed(2)} bps` : null);
    }

    this.updateConstructionMetrics(frontier, turnover, tca);
  }

  async loadSpecializedTab() {
    const [alternatives, esg, clientReporting] = await Promise.all([
      this.fetchData('/advanced-analytics/alternatives-attribution'),
      this.fetchData('/advanced-analytics/esg-analysis'),
      this.fetchData('/advanced-analytics/client-reporting')
    ]);

    if (alternatives) {
      this.advancedCharts.createWaterfallChart('chart-alternatives', alternatives);
      this.advancedCharts.addExportButton('chart-alternatives', 'export-alternatives');

      // Update alternatives metrics
      this.safeSetText('alt-start', alternatives.startingNAV != null ? `$${alternatives.startingNAV.toLocaleString()}` : null);
      this.safeSetText('alt-income', alternatives.income != null ? `$${alternatives.income.toLocaleString()}` : null);
      this.safeSetText('alt-appreciation', alternatives.appreciation != null ? `$${alternatives.appreciation.toLocaleString()}` : null);
      this.safeSetText('alt-fees', alternatives.fees != null ? `-$${Math.abs(alternatives.fees).toLocaleString()}` : null);
      this.safeSetText('alt-end', alternatives.endingNAV != null ? `$${alternatives.endingNAV.toLocaleString()}` : null);
    }

    if (esg) {
      this.advancedCharts.createESGRadar('chart-esg-radar', esg);
      this.advancedCharts.addExportButton('chart-esg-radar', 'export-esg');
      this.setupESGToggle(esg);

      // Update ESG metrics
      this.safeSetText('esg-score', esg.score != null ? esg.score.toFixed(1) : null);
      this.safeSetText('carbon-intensity', esg.carbonIntensity != null ? `${esg.carbonIntensity.toFixed(1)} tCO2e` : null);
      this.safeSetText('esg-vs-benchmark', esg.vsBenchmark != null ? `${esg.vsBenchmark > 0 ? '+' : ''}${esg.vsBenchmark.toFixed(1)}` : null);
    }

    if (clientReporting) {
      this.advancedCharts.createKPICards('chart-kpi-cards', clientReporting);
      this.advancedCharts.createGaugeChart('chart-goal-gauge', clientReporting.goalProgress);
      this.advancedCharts.addExportButton('chart-goal-gauge', 'export-client-reporting');
    }

    this.updateSpecializedMetrics(alternatives, esg, clientReporting);
  }

  /**
   * Get authentication token from localStorage
   */
  getToken() {
    return localStorage.getItem('wealthpilot_token') || '';
  }

  /**
   * Make authenticated fetch request
   */
  async authFetch(url, options = {}) {
    const token = this.getToken();

    // Don't set Content-Type for FormData - browser will set it with boundary
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers
    });
  }

  async fetchData(endpoint) {
    try {
      // If no portfolio is selected, show a message
      if (!this.currentPortfolio || this.currentPortfolio === 'all') {
        console.warn('No portfolio selected for analytics. Please select a specific portfolio.');
        return null;
      }

      const portfolioParam = `?portfolioId=${this.currentPortfolio}`;
      const response = await this.authFetch(`/api${endpoint}${portfolioParam}`);

      if (!response.ok) {
        console.error(`API error: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Fetch error for ${endpoint}:`, error);
      return null;
    }
  }

  setupConcentrationToggle(data) {
    const toggleBtn = document.getElementById('toggle-concentration');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const treemap = document.getElementById('chart-concentration-treemap');
      const pareto = document.getElementById('chart-concentration-pareto');
      
      if (treemap.classList.contains('hidden')) {
        // Show treemap
        treemap.classList.remove('hidden');
        pareto.classList.add('hidden');
        toggleBtn.textContent = 'Switch to Pareto';
      } else {
        // Show pareto
        treemap.classList.add('hidden');
        pareto.classList.remove('hidden');
        toggleBtn.textContent = 'Switch to Treemap';
        
        // Create pareto chart if not already created
        if (!this.charts.has('chart-concentration-pareto')) {
          this.advancedCharts.createParetoChart('chart-concentration-pareto', data);
        }
      }
    });
  }

  setupTCAToggle(data) {
    const toggleBtn = document.getElementById('toggle-tca');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const boxplot = document.getElementById('chart-tca-boxplot');
      const timeline = document.getElementById('chart-tca-timeline');
      
      if (boxplot.classList.contains('hidden')) {
        boxplot.classList.remove('hidden');
        timeline.classList.add('hidden');
        toggleBtn.textContent = 'Switch to Timeline';
      } else {
        boxplot.classList.add('hidden');
        timeline.classList.remove('hidden');
        toggleBtn.textContent = 'Switch to Box Plot';
        
        if (!this.charts.has('chart-tca-timeline')) {
          this.advancedCharts.createTimelineChart('chart-tca-timeline', data);
        }
      }
    });
  }

  setupESGToggle(data) {
    const toggleBtn = document.getElementById('toggle-esg');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const radar = document.getElementById('chart-esg-radar');
      const breakdown = document.getElementById('chart-esg-breakdown');
      
      if (radar.classList.contains('hidden')) {
        radar.classList.remove('hidden');
        breakdown.classList.add('hidden');
        toggleBtn.textContent = 'Switch to Breakdown';
      } else {
        radar.classList.add('hidden');
        breakdown.classList.remove('hidden');
        toggleBtn.textContent = 'Switch to Radar';
        
        if (!this.charts.has('chart-esg-breakdown')) {
          // Create a bar chart showing ESG component breakdown
          const breakdownData = {
            categories: ['Environmental', 'Social', 'Governance'],
            portfolio: [data.portfolio.environmental, data.portfolio.social, data.portfolio.governance],
            benchmark: [data.benchmark.environmental, data.benchmark.social, data.benchmark.governance]
          };
          this.advancedCharts.createStackedBar('chart-esg-breakdown', breakdownData);
        }
      }
    });
  }

  setupFrontierSlider(data) {
    const slider = document.getElementById('target-return-slider');
    const valueDisplay = document.getElementById('target-return-value');
    
    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      valueDisplay.textContent = `${value.toFixed(1)}%`;
      
      // Recalculate optimal position based on target return
      // This would typically involve optimization calculations
    });
  }

  updatePerformanceMetrics(attribution, excessReturn, rolling) {
    this.safeSetText('metric-total-return', attribution?.totalReturn != null ? `${attribution.totalReturn.toFixed(2)}%` : null);
    this.safeSetText('metric-sharpe', rolling?.sharpe != null ? rolling.sharpe.toFixed(2) : null);
    this.safeSetText('metric-alpha', excessReturn?.alpha != null ? `${excessReturn.alpha.toFixed(2)}%` : null);
    this.safeSetText('metric-beta', excessReturn?.beta != null ? excessReturn.beta.toFixed(2) : null);
  }

  updateRiskMetrics(riskDecomp, varScenarios, concentration) {
    this.safeSetText('metric-volatility', riskDecomp?.volatility != null ? `${riskDecomp.volatility.toFixed(2)}%` : null);
    this.safeSetText('metric-downside', riskDecomp?.downsideDeviation != null ? `${riskDecomp.downsideDeviation.toFixed(2)}%` : null);
    this.safeSetText('metric-max-dd', varScenarios?.maxDrawdown != null ? `${varScenarios.maxDrawdown.toFixed(2)}%` : null);
    this.safeSetText('metric-sortino', riskDecomp?.sortino != null ? riskDecomp.sortino.toFixed(2) : null);
  }

  updateAttributionMetrics(regional) {
    if (!regional) return;

    this.safeSetText('metric-allocation', regional.allocationEffect != null ? `${regional.allocationEffect.toFixed(2)}%` : null);
    this.safeSetText('metric-selection', regional.selectionEffect != null ? `${regional.selectionEffect.toFixed(2)}%` : null);
    this.safeSetText('metric-interaction', regional.interaction != null ? `${regional.interaction.toFixed(2)}%` : null);
    this.safeSetText('metric-total-attribution', regional.totalAttribution != null ? `${regional.totalAttribution.toFixed(2)}%` : null);
  }

  updateConstructionMetrics(frontier, turnover, tca) {
    this.safeSetText('metric-efficiency', frontier?.efficiency != null ? `${frontier.efficiency.toFixed(1)}%` : null);
    this.safeSetText('metric-turnover-rate', turnover?.annualTurnover != null ? `${turnover.annualTurnover.toFixed(1)}%` : null);
    this.safeSetText('metric-holding-period', turnover?.avgHoldingPeriod != null ? `${turnover.avgHoldingPeriod} days` : null);
    this.safeSetText('metric-total-tca', tca?.totalCost != null ? `${tca.totalCost.toFixed(2)} bps` : null);
  }

  updateSpecializedMetrics(alternatives, esg, clientReporting) {
    this.safeSetText('metric-alternatives-pct', alternatives?.percentOfPortfolio != null ? `${alternatives.percentOfPortfolio.toFixed(1)}%` : null);
    this.safeSetText('metric-overall-esg', esg?.score != null ? esg.score.toFixed(1) : null);
    this.safeSetText('metric-goal-progress', clientReporting?.goalProgress?.current != null ? `${clientReporting.goalProgress.current}%` : null);
    this.safeSetText('metric-on-track', clientReporting?.onTrack !== undefined ? (clientReporting.onTrack ? 'Yes' : 'No') : null);
  }

  showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
    }
  }

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
    }
  }

  showError(message) {
    // Could implement a toast notification here
    console.error(message);
  }

  async exportAllCharts() {
    await this.advancedCharts.exportAllChartsAsZIP(`analytics-${this.currentTab}-${Date.now()}`);
  }

  async generatePDF() {
    // This would generate a comprehensive PDF report
    window.print();
  }

  async exportData() {
    // Export all current data as CSV
    console.log('Export data functionality - to be implemented');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.advancedDashboard = new AdvancedDashboard();
});
