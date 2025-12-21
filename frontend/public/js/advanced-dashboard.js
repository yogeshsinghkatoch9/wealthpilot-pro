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
    this.setupEventListeners();
    this.loadCurrentTab();
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
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

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
      const maxDDElement = document.getElementById('max-drawdown');
      if (maxDDElement && drawdown.maxDrawdown) {
        maxDDElement.textContent = `${drawdown.maxDrawdown.toFixed(2)}%`;
      }
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
      if (varScenarios.var95) document.getElementById('var-95').textContent = `${varScenarios.var95.toFixed(2)}%`;
      if (varScenarios.var99) document.getElementById('var-99').textContent = `${varScenarios.var99.toFixed(2)}%`;
      if (varScenarios.cvar95) document.getElementById('cvar').textContent = `${varScenarios.cvar95.toFixed(2)}%`;
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
      if (concentration.hhi) document.getElementById('hhi-index').textContent = concentration.hhi.toFixed(2);
      if (concentration.top10Weight) document.getElementById('top10-weight').textContent = `${concentration.top10Weight.toFixed(1)}%`;
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
      if (peerBench.percentile) document.getElementById('peer-percentile').textContent = `${peerBench.percentile}th`;
      if (peerBench.rank) document.getElementById('peer-rank').textContent = `${peerBench.rank} of ${peerBench.total}`;
      if (peerBench.avgReturn) document.getElementById('peer-avg-return').textContent = `${peerBench.avgReturn.toFixed(2)}%`;
      if (peerBench.avgRisk) document.getElementById('peer-avg-risk').textContent = `${peerBench.avgRisk.toFixed(2)}%`;
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
      
      if (turnover.annualTurnover) {
        document.getElementById('annual-turnover').textContent = `${turnover.annualTurnover.toFixed(1)}%`;
      }
    }

    if (liquidity) {
      this.advancedCharts.createBubbleChart('chart-liquidity', liquidity);
      this.advancedCharts.addExportButton('chart-liquidity', 'export-liquidity');
      
      if (liquidity.avgDaysToLiquidate) {
        document.getElementById('avg-dtl').textContent = `${liquidity.avgDaysToLiquidate.toFixed(1)} days`;
      }
      if (liquidity.score) {
        document.getElementById('liquidity-score').textContent = liquidity.score;
      }
    }

    if (tca) {
      this.advancedCharts.createBoxPlot('chart-tca-boxplot', tca);
      this.advancedCharts.addExportButton('chart-tca-boxplot', 'export-tca');
      this.setupTCAToggle(tca);
      
      // Update TCA metrics
      if (tca.avgCost) document.getElementById('avg-tca').textContent = `${tca.avgCost.toFixed(2)} bps`;
      if (tca.implicit) document.getElementById('implicit-cost').textContent = `${tca.implicit.toFixed(2)} bps`;
      if (tca.explicit) document.getElementById('explicit-cost').textContent = `${tca.explicit.toFixed(2)} bps`;
      if (tca.slippage) document.getElementById('slippage-cost').textContent = `${tca.slippage.toFixed(2)} bps`;
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
      if (alternatives.startingNAV) document.getElementById('alt-start').textContent = `$${alternatives.startingNAV.toLocaleString()}`;
      if (alternatives.income) document.getElementById('alt-income').textContent = `$${alternatives.income.toLocaleString()}`;
      if (alternatives.appreciation) document.getElementById('alt-appreciation').textContent = `$${alternatives.appreciation.toLocaleString()}`;
      if (alternatives.fees) document.getElementById('alt-fees').textContent = `-$${Math.abs(alternatives.fees).toLocaleString()}`;
      if (alternatives.endingNAV) document.getElementById('alt-end').textContent = `$${alternatives.endingNAV.toLocaleString()}`;
    }

    if (esg) {
      this.advancedCharts.createESGRadar('chart-esg-radar', esg);
      this.advancedCharts.addExportButton('chart-esg-radar', 'export-esg');
      this.setupESGToggle(esg);
      
      // Update ESG metrics
      if (esg.score) document.getElementById('esg-score').textContent = esg.score.toFixed(1);
      if (esg.carbonIntensity) document.getElementById('carbon-intensity').textContent = `${esg.carbonIntensity.toFixed(1)} tCO2e`;
      if (esg.vsBenchmark) document.getElementById('esg-vs-benchmark').textContent = `${esg.vsBenchmark > 0 ? '+' : ''}${esg.vsBenchmark.toFixed(1)}`;
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
      const portfolioParam = this.currentPortfolio !== 'all' ? `?portfolioId=${this.currentPortfolio}` : '';
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
    if (attribution && attribution.totalReturn) {
      document.getElementById('metric-total-return').textContent = `${attribution.totalReturn.toFixed(2)}%`;
    }
    if (rolling && rolling.sharpe) {
      document.getElementById('metric-sharpe').textContent = rolling.sharpe.toFixed(2);
    }
    if (excessReturn && excessReturn.alpha) {
      document.getElementById('metric-alpha').textContent = `${excessReturn.alpha.toFixed(2)}%`;
    }
    if (excessReturn && excessReturn.beta) {
      document.getElementById('metric-beta').textContent = excessReturn.beta.toFixed(2);
    }
  }

  updateRiskMetrics(riskDecomp, varScenarios, concentration) {
    if (riskDecomp && riskDecomp.volatility) {
      document.getElementById('metric-volatility').textContent = `${riskDecomp.volatility.toFixed(2)}%`;
    }
    if (riskDecomp && riskDecomp.downsideDeviation) {
      document.getElementById('metric-downside').textContent = `${riskDecomp.downsideDeviation.toFixed(2)}%`;
    }
    if (varScenarios && varScenarios.maxDrawdown) {
      document.getElementById('metric-max-dd').textContent = `${varScenarios.maxDrawdown.toFixed(2)}%`;
    }
    if (riskDecomp && riskDecomp.sortino) {
      document.getElementById('metric-sortino').textContent = riskDecomp.sortino.toFixed(2);
    }
  }

  updateAttributionMetrics(regional) {
    if (!regional) return;
    
    if (regional.allocationEffect) {
      document.getElementById('metric-allocation').textContent = `${regional.allocationEffect.toFixed(2)}%`;
    }
    if (regional.selectionEffect) {
      document.getElementById('metric-selection').textContent = `${regional.selectionEffect.toFixed(2)}%`;
    }
    if (regional.interaction) {
      document.getElementById('metric-interaction').textContent = `${regional.interaction.toFixed(2)}%`;
    }
    if (regional.totalAttribution) {
      document.getElementById('metric-total-attribution').textContent = `${regional.totalAttribution.toFixed(2)}%`;
    }
  }

  updateConstructionMetrics(frontier, turnover, tca) {
    if (frontier && frontier.efficiency) {
      document.getElementById('metric-efficiency').textContent = `${frontier.efficiency.toFixed(1)}%`;
    }
    if (turnover && turnover.annualTurnover) {
      document.getElementById('metric-turnover-rate').textContent = `${turnover.annualTurnover.toFixed(1)}%`;
    }
    if (turnover && turnover.avgHoldingPeriod) {
      document.getElementById('metric-holding-period').textContent = `${turnover.avgHoldingPeriod} days`;
    }
    if (tca && tca.totalCost) {
      document.getElementById('metric-total-tca').textContent = `${tca.totalCost.toFixed(2)} bps`;
    }
  }

  updateSpecializedMetrics(alternatives, esg, clientReporting) {
    if (alternatives && alternatives.percentOfPortfolio) {
      document.getElementById('metric-alternatives-pct').textContent = `${alternatives.percentOfPortfolio.toFixed(1)}%`;
    }
    if (esg && esg.score) {
      document.getElementById('metric-overall-esg').textContent = esg.score.toFixed(1);
    }
    if (clientReporting && clientReporting.goalProgress && clientReporting.goalProgress.current) {
      document.getElementById('metric-goal-progress').textContent = `${clientReporting.goalProgress.current}%`;
    }
    if (clientReporting && clientReporting.onTrack !== undefined) {
      document.getElementById('metric-on-track').textContent = clientReporting.onTrack ? 'Yes' : 'No';
    }
  }

  showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.add('flex');
  }

  hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('loading-overlay').classList.remove('flex');
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
