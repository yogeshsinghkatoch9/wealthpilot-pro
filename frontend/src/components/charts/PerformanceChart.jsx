/**
 * WealthPilot Pro - Performance Chart Component
 * Interactive line chart for portfolio performance visualization
 */

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart
} from 'recharts';
import { usePortfolioStore } from '../../store/portfolioStore';
import { formatCurrency, formatPercent, formatDate } from '../../utils/formatters';

const PerformanceChart = ({ portfolioId, timeRange, showBenchmark = true }) => {
  const [chartType, setChartType] = useState('value'); // 'value' | 'return' | 'comparison'
  const [hoveredData, setHoveredData] = useState(null);
  
  const { getPerformanceHistory, getBenchmarkData } = usePortfolioStore();

  const performanceData = useMemo(() => {
    return getPerformanceHistory(portfolioId, timeRange);
  }, [portfolioId, timeRange, getPerformanceHistory]);

  const benchmarkData = useMemo(() => {
    if (!showBenchmark) return null;
    return getBenchmarkData('SPY', timeRange);
  }, [showBenchmark, timeRange, getBenchmarkData]);

  const chartData = useMemo(() => {
    if (!performanceData?.length) return [];

    const startValue = performanceData[0]?.value || 1;
    const benchmarkStartValue = benchmarkData?.[0]?.value || 1;

    return performanceData.map((point, index) => {
      const portfolioReturn = ((point.value - startValue) / startValue) * 100;
      const benchmarkReturn = benchmarkData?.[index] 
        ? ((benchmarkData[index].value - benchmarkStartValue) / benchmarkStartValue) * 100
        : null;

      return {
        date: point.date,
        value: point.value,
        portfolioReturn,
        benchmarkReturn,
        benchmarkValue: benchmarkData?.[index]?.value,
        dayChange: point.dayChange || 0,
        dayChangePercent: point.dayChangePercent || 0
      };
    });
  }, [performanceData, benchmarkData]);

  const stats = useMemo(() => {
    if (!chartData.length) return null;

    const values = chartData.map(d => d.value);
    const returns = chartData.map(d => d.portfolioReturn);
    const startValue = values[0];
    const endValue = values[values.length - 1];
    const totalReturn = ((endValue - startValue) / startValue) * 100;
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const maxDrawdown = ((minValue - maxValue) / maxValue) * 100;

    // Calculate volatility (standard deviation of daily returns)
    const dailyReturns = chartData.slice(1).map((d, i) => 
      ((d.value - chartData[i].value) / chartData[i].value) * 100
    );
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Benchmark comparison
    const benchmarkReturn = chartData[chartData.length - 1]?.benchmarkReturn || 0;
    const alpha = totalReturn - benchmarkReturn;

    return {
      startValue,
      endValue,
      totalReturn,
      maxValue,
      minValue,
      maxDrawdown,
      volatility,
      benchmarkReturn,
      alpha,
      isOutperforming: alpha > 0
    };
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0].payload;
    
    return (
      <div className="chart-tooltip">
        <div className="tooltip-header">
          {formatDate(label, 'long')}
        </div>
        <div className="tooltip-body">
          <div className="tooltip-row">
            <span className="tooltip-label">Portfolio Value:</span>
            <span className="tooltip-value">{formatCurrency(data.value)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Return:</span>
            <span className={`tooltip-value ${data.portfolioReturn >= 0 ? 'positive' : 'negative'}`}>
              {data.portfolioReturn >= 0 ? '+' : ''}{formatPercent(data.portfolioReturn)}
            </span>
          </div>
          {data.benchmarkReturn !== null && (
            <div className="tooltip-row">
              <span className="tooltip-label">S&P 500:</span>
              <span className={`tooltip-value ${data.benchmarkReturn >= 0 ? 'positive' : 'negative'}`}>
                {data.benchmarkReturn >= 0 ? '+' : ''}{formatPercent(data.benchmarkReturn)}
              </span>
            </div>
          )}
          <div className="tooltip-row">
            <span className="tooltip-label">Day Change:</span>
            <span className={`tooltip-value ${data.dayChange >= 0 ? 'positive' : 'negative'}`}>
              {data.dayChange >= 0 ? '+' : ''}{formatCurrency(data.dayChange)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const formatXAxis = (dateStr) => {
    const date = new Date(dateStr);
    switch (timeRange) {
      case '1D':
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      case '1W':
      case '1M':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case '3M':
      case '6M':
      case 'YTD':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
  };

  const formatYAxis = (value) => {
    if (chartType === 'return' || chartType === 'comparison') {
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    }
    return formatCurrency(value, true);
  };

  if (!chartData.length) {
    return (
      <div className="chart-empty">
        <p>No performance data available for the selected period</p>
      </div>
    );
  }

  return (
    <div className="performance-chart">
      {/* Chart Type Selector */}
      <div className="chart-controls">
        <div className="chart-type-selector">
          <button 
            className={chartType === 'value' ? 'active' : ''}
            onClick={() => setChartType('value')}
          >
            Value
          </button>
          <button 
            className={chartType === 'return' ? 'active' : ''}
            onClick={() => setChartType('return')}
          >
            Return %
          </button>
          {showBenchmark && (
            <button 
              className={chartType === 'comparison' ? 'active' : ''}
              onClick={() => setChartType('comparison')}
            >
              vs S&P 500
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="chart-stats">
          <div className="stat">
            <span className="stat-label">Total Return</span>
            <span className={`stat-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
              {stats.totalReturn >= 0 ? '+' : ''}{formatPercent(stats.totalReturn)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Max Drawdown</span>
            <span className="stat-value negative">{formatPercent(stats.maxDrawdown)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Volatility</span>
            <span className="stat-value">{formatPercent(stats.volatility)}</span>
          </div>
          {showBenchmark && (
            <div className="stat">
              <span className="stat-label">Alpha</span>
              <span className={`stat-value ${stats.alpha >= 0 ? 'positive' : 'negative'}`}>
                {stats.alpha >= 0 ? '+' : ''}{formatPercent(stats.alpha)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={350}>
          {chartType === 'value' ? (
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatXAxis}
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                tickFormatter={formatYAxis}
                stroke="#64748b"
                fontSize={12}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fill="url(#valueGradient)"
                strokeWidth={2}
              />
            </ComposedChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatXAxis}
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                tickFormatter={formatYAxis}
                stroke="#64748b"
                fontSize={12}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="portfolioReturn"
                name="Portfolio"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
              {(chartType === 'comparison' && showBenchmark) && (
                <Line
                  type="monotone"
                  dataKey="benchmarkReturn"
                  name="S&P 500"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
              )}
              <Legend />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Period Summary */}
      <div className="chart-summary">
        <div className="summary-item">
          <span>Start: {formatCurrency(stats?.startValue)}</span>
        </div>
        <div className="summary-item">
          <span>End: {formatCurrency(stats?.endValue)}</span>
        </div>
        <div className="summary-item">
          <span>High: {formatCurrency(stats?.maxValue)}</span>
        </div>
        <div className="summary-item">
          <span>Low: {formatCurrency(stats?.minValue)}</span>
        </div>
      </div>
    </div>
  );
};

export default PerformanceChart;
