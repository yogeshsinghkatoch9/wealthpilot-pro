/**
 * WealthPilot Pro - Allocation Chart Component
 * Interactive pie/donut charts for asset and sector allocation
 */

import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Sector
} from 'recharts';
import { usePortfolioStore } from '../../store/portfolioStore';
import { formatCurrency, formatPercent } from '../../utils/formatters';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9'
];

const AllocationChart = ({ portfolioId, type = 'asset' }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const [viewMode, setViewMode] = useState('donut'); // 'donut' | 'pie' | 'bar'
  
  const { getAllocation } = usePortfolioStore();

  const allocationData = useMemo(() => {
    const data = getAllocation(portfolioId, type);
    
    // Sort by value descending and add colors
    return data
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length]
      }));
  }, [portfolioId, type, getAllocation]);

  const totalValue = useMemo(() => {
    return allocationData.reduce((sum, item) => sum + item.value, 0);
  }, [allocationData]);

  const topHoldings = useMemo(() => {
    // Get top 8 and group rest as "Other"
    if (allocationData.length <= 8) return allocationData;

    const top = allocationData.slice(0, 7);
    const otherValue = allocationData.slice(7).reduce((sum, item) => sum + item.value, 0);
    const otherPercent = allocationData.slice(7).reduce((sum, item) => sum + item.percent, 0);

    return [
      ...top,
      {
        name: 'Other',
        value: otherValue,
        percent: otherPercent,
        color: '#94a3b8',
        count: allocationData.length - 7
      }
    ];
  }, [allocationData]);

  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  const renderActiveShape = (props) => {
    const {
      cx, cy, innerRadius, outerRadius, startAngle, endAngle,
      fill, payload, percent
    } = props;

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 10}
          outerRadius={outerRadius + 14}
          fill={fill}
        />
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0].payload;
    
    return (
      <div className="allocation-tooltip">
        <div className="tooltip-header" style={{ borderLeftColor: data.color }}>
          {data.name}
        </div>
        <div className="tooltip-body">
          <div className="tooltip-row">
            <span>Value:</span>
            <span>{formatCurrency(data.value)}</span>
          </div>
          <div className="tooltip-row">
            <span>Weight:</span>
            <span>{formatPercent(data.percent)}</span>
          </div>
          {data.count && (
            <div className="tooltip-row">
              <span>Holdings:</span>
              <span>{data.count} items</span>
            </div>
          )}
          {data.holdings && (
            <div className="tooltip-row">
              <span>Holdings:</span>
              <span>{data.holdings}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const CustomLegend = ({ payload }) => {
    return (
      <div className="allocation-legend">
        {payload.map((entry, index) => (
          <div 
            key={index} 
            className={`legend-item ${activeIndex === index ? 'active' : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <span 
              className="legend-color" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="legend-name">{entry.value}</span>
            <span className="legend-percent">
              {formatPercent(topHoldings[index]?.percent || 0)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!allocationData.length) {
    return (
      <div className="chart-empty">
        <p>No allocation data available</p>
      </div>
    );
  }

  return (
    <div className="allocation-chart">
      {/* View Mode Toggle */}
      <div className="chart-controls">
        <div className="view-mode-selector">
          <button 
            className={viewMode === 'donut' ? 'active' : ''}
            onClick={() => setViewMode('donut')}
            title="Donut Chart"
          >
            <i className="icon-pie-chart"></i>
          </button>
          <button 
            className={viewMode === 'bar' ? 'active' : ''}
            onClick={() => setViewMode('bar')}
            title="Bar Chart"
          >
            <i className="icon-bar-chart"></i>
          </button>
        </div>
      </div>

      {viewMode === 'donut' ? (
        <div className="chart-with-center">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={topHoldings}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
              >
                {topHoldings.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Content */}
          <div className="chart-center">
            {activeIndex !== null ? (
              <>
                <div className="center-name">{topHoldings[activeIndex]?.name}</div>
                <div className="center-value">{formatCurrency(topHoldings[activeIndex]?.value)}</div>
                <div className="center-percent">{formatPercent(topHoldings[activeIndex]?.percent)}</div>
              </>
            ) : (
              <>
                <div className="center-label">Total</div>
                <div className="center-value">{formatCurrency(totalValue)}</div>
                <div className="center-count">{allocationData.length} {type === 'sector' ? 'sectors' : 'categories'}</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bar-chart-view">
          {topHoldings.map((item, index) => (
            <div 
              key={index}
              className={`bar-item ${activeIndex === index ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div className="bar-header">
                <span className="bar-name">
                  <span className="bar-color" style={{ backgroundColor: item.color }}></span>
                  {item.name}
                </span>
                <span className="bar-values">
                  <span className="bar-value">{formatCurrency(item.value)}</span>
                  <span className="bar-percent">{formatPercent(item.percent)}</span>
                </span>
              </div>
              <div className="bar-track">
                <div 
                  className="bar-fill" 
                  style={{ 
                    width: `${item.percent}%`,
                    backgroundColor: item.color 
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <CustomLegend payload={topHoldings.map(item => ({ value: item.name, color: item.color }))} />

      {/* Allocation Details */}
      {type === 'asset' && (
        <div className="allocation-insights">
          <div className="insight">
            <span className="insight-label">Largest Position</span>
            <span className="insight-value">
              {allocationData[0]?.name} ({formatPercent(allocationData[0]?.percent)})
            </span>
          </div>
          {allocationData[0]?.percent > 25 && (
            <div className="insight warning">
              <i className="icon-alert-triangle"></i>
              <span>High concentration in {allocationData[0]?.name}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AllocationChart;
