/**
 * Chart Generator Service
 * Server-side chart rendering for PDF reports using chartjs-node-canvas
 */

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

class ChartGenerator {
  constructor() {
    this.width = 800;
    this.height = 400;
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: this.width,
      height: this.height,
      backgroundColour: 'white'
    });
  }

  /**
   * Generate allocation pie chart
   */
  async generateAllocationPieChart(allocations) {
    const labels = allocations.map(a => a.name || a.sector);
    const data = allocations.map(a => a.percentage || a.value);
    const colors = this.generateColors(labels.length);

    const configuration = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: 'white',
          borderWidth: 2
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { size: 12 },
              padding: 15
            }
          },
          title: {
            display: true,
            text: 'Portfolio Allocation',
            font: { size: 16, weight: 'bold' }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate performance line chart
   */
  async generatePerformanceChart(performanceData) {
    const labels = performanceData.map(p => p.date);
    const portfolioValues = performanceData.map(p => p.portfolioValue);
    const benchmarkValues = performanceData.map(p => p.benchmarkValue);

    const configuration = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Portfolio',
            data: portfolioValues,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
          },
          {
            label: 'S&P 500',
            data: benchmarkValues,
            borderColor: '#9CA3AF',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: 'top'
          },
          title: {
            display: true,
            text: 'Portfolio Performance vs Benchmark',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          x: {
            grid: { display: false }
          },
          y: {
            beginAtZero: false,
            ticks: {
              callback: (value) => '$' + value.toLocaleString()
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate sector breakdown bar chart
   */
  async generateSectorBarChart(sectorData) {
    const labels = sectorData.map(s => s.sector);
    const portfolioWeights = sectorData.map(s => s.portfolioWeight);
    const benchmarkWeights = sectorData.map(s => s.benchmarkWeight || 0);

    const configuration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Portfolio',
            data: portfolioWeights,
            backgroundColor: '#3B82F6',
            borderRadius: 4
          },
          {
            label: 'Benchmark',
            data: benchmarkWeights,
            backgroundColor: '#9CA3AF',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            position: 'top'
          },
          title: {
            display: true,
            text: 'Sector Allocation vs Benchmark',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 50,
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate risk radar chart
   */
  async generateRiskRadarChart(riskMetrics) {
    const configuration = {
      type: 'radar',
      data: {
        labels: ['Volatility', 'Beta', 'Concentration', 'Drawdown Risk', 'Sector Risk', 'Liquidity'],
        datasets: [{
          label: 'Risk Profile',
          data: [
            riskMetrics.volatilityScore || 50,
            riskMetrics.betaScore || 50,
            riskMetrics.concentrationScore || 50,
            riskMetrics.drawdownScore || 50,
            riskMetrics.sectorScore || 50,
            riskMetrics.liquidityScore || 50
          ],
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          borderColor: '#EF4444',
          borderWidth: 2,
          pointBackgroundColor: '#EF4444'
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Risk Assessment',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              stepSize: 20
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate holdings bar chart (top 10)
   */
  async generateHoldingsChart(holdings) {
    const topHoldings = holdings.slice(0, 10);
    const labels = topHoldings.map(h => h.symbol);
    const values = topHoldings.map(h => h.marketValue || (h.shares * (h.currentPrice || h.avgCostBasis || 0)));
    const colors = topHoldings.map(h => h.gainPercent >= 0 ? '#10B981' : '#EF4444');

    const configuration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Market Value',
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Top 10 Holdings by Value',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => '$' + value.toLocaleString()
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate dividend income chart
   */
  async generateDividendChart(dividendData) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyIncome = dividendData.monthlyIncome || months.map(() => 0);

    const configuration = {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Dividend Income',
          data: monthlyIncome,
          backgroundColor: '#8B5CF6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Monthly Dividend Income',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => '$' + value.toLocaleString()
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate gain/loss chart
   */
  async generateGainLossChart(holdings) {
    const sortedByGain = [...holdings].sort((a, b) => (b.gainPercent || 0) - (a.gainPercent || 0));
    const topGainers = sortedByGain.slice(0, 5);
    const topLosers = sortedByGain.slice(-5).reverse();

    const combined = [...topGainers, ...topLosers];
    const labels = combined.map(h => h.symbol);
    const data = combined.map(h => h.gainPercent || 0);
    const colors = data.map(v => v >= 0 ? '#10B981' : '#EF4444');

    const configuration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Gain/Loss %',
          data: data,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Top Gainers & Losers',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          x: {
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate correlation heatmap (simplified as bar chart)
   */
  async generateCorrelationChart(correlationData) {
    const pairs = correlationData.pairs || [];
    const labels = pairs.map(p => `${p.symbol1}-${p.symbol2}`);
    const values = pairs.map(p => p.correlation);
    const colors = values.map(v => {
      if (v > 0.7) return '#EF4444';
      if (v > 0.4) return '#F59E0B';
      return '#10B981';
    });

    const configuration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Correlation',
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Holdings Correlation (Top Pairs)',
            font: { size: 16, weight: 'bold' }
          }
        },
        scales: {
          x: {
            min: -1,
            max: 1
          }
        }
      }
    };

    return await this.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  /**
   * Generate colors for charts
   */
  generateColors(count) {
    const baseColors = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#06B6D4', // Cyan
      '#84CC16', // Lime
      '#F97316', // Orange
      '#6366F1', // Indigo
      '#14B8A6', // Teal
      '#A855F7'  // Violet
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
  }

  /**
   * Generate all charts for a report
   */
  async generateReportCharts(portfolioData) {
    const charts = {};

    try {
      // Allocation chart
      if (portfolioData.holdings?.length > 0) {
        const allocations = portfolioData.holdings.map(h => ({
          name: h.symbol,
          percentage: (h.marketValue || (h.shares * (h.currentPrice || h.avgCostBasis || 0))) / (portfolioData.totalValue || 1) * 100
        }));
        charts.allocation = await this.generateAllocationPieChart(allocations);
      }

      // Holdings chart
      if (portfolioData.holdings?.length > 0) {
        charts.holdings = await this.generateHoldingsChart(portfolioData.holdings);
      }

      // Sector chart
      if (portfolioData.sectorAllocation) {
        const sectorData = Object.entries(portfolioData.sectorAllocation).map(([sector, data]) => ({
          sector,
          portfolioWeight: data.percentage || 0,
          benchmarkWeight: this.getBenchmarkWeight(sector)
        }));
        charts.sectors = await this.generateSectorBarChart(sectorData);
      }

      // Gain/Loss chart
      if (portfolioData.holdings?.length > 0) {
        charts.gainLoss = await this.generateGainLossChart(portfolioData.holdings);
      }

      // Risk radar chart
      if (portfolioData.riskMetrics) {
        charts.risk = await this.generateRiskRadarChart(portfolioData.riskMetrics);
      }

      // Performance chart (if historical data available)
      if (portfolioData.performanceHistory?.length > 0) {
        charts.performance = await this.generatePerformanceChart(portfolioData.performanceHistory);
      }

      // Dividend chart
      if (portfolioData.dividends) {
        charts.dividends = await this.generateDividendChart(portfolioData.dividends);
      }

    } catch (error) {
      console.error('[ChartGenerator] Error generating charts:', error.message);
    }

    return charts;
  }

  /**
   * Get S&P 500 benchmark weights
   */
  getBenchmarkWeight(sector) {
    const benchmarks = {
      'Technology': 28,
      'Healthcare': 13,
      'Financials': 12,
      'Consumer Discretionary': 11,
      'Communication Services': 9,
      'Industrials': 8,
      'Consumer Staples': 6,
      'Energy': 4,
      'Utilities': 3,
      'Real Estate': 3,
      'Materials': 3
    };
    return benchmarks[sector] || 5;
  }
}

module.exports = new ChartGenerator();
