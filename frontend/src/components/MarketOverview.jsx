/**
 * WealthPilot Pro - Market Overview Component
 * Displays market indices and overall market sentiment
 */

import React from 'react';
import { formatCurrency, formatPercent } from '../utils/formatters';

const MarketOverview = ({ indices = [], isLoading = false }) => {
  const getChangeClass = (change) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return 'neutral';
  };

  const getMarketSentiment = () => {
    if (!indices.length) return null;
    
    const sp500 = indices.find(i => i.symbol === '^GSPC' || i.shortName === 'S&P');
    if (!sp500) return null;

    const change = sp500.changePercent || 0;
    
    if (change > 1.5) return { label: 'Very Bullish', color: 'green', emoji: '🚀' };
    if (change > 0.5) return { label: 'Bullish', color: 'green', emoji: '📈' };
    if (change > 0) return { label: 'Slightly Bullish', color: 'light-green', emoji: '↗️' };
    if (change > -0.5) return { label: 'Slightly Bearish', color: 'light-red', emoji: '↘️' };
    if (change > -1.5) return { label: 'Bearish', color: 'red', emoji: '📉' };
    return { label: 'Very Bearish', color: 'red', emoji: '🔻' };
  };

  const sentiment = getMarketSentiment();

  if (isLoading) {
    return (
      <div className="market-overview loading">
        <div className="overview-header">
          <h3>Market Overview</h3>
        </div>
        <div className="indices-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="index-card skeleton">
              <div className="skeleton-text"></div>
              <div className="skeleton-text large"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="market-overview">
      {/* Header with sentiment */}
      <div className="overview-header">
        <h3>Market Overview</h3>
        {sentiment && (
          <div className={`sentiment-badge ${sentiment.color}`}>
            <span className="sentiment-emoji">{sentiment.emoji}</span>
            <span className="sentiment-label">{sentiment.label}</span>
          </div>
        )}
      </div>

      {/* Indices Grid */}
      <div className="indices-grid">
        {indices.map((index, i) => (
          <div key={index.symbol || i} className="index-card">
            <div className="index-header">
              <span className="index-name">{index.shortName || index.name}</span>
              <span className={`index-change-badge ${getChangeClass(index.changePercent)}`}>
                {index.changePercent >= 0 ? '+' : ''}
                {formatPercent(index.changePercent || 0)}
              </span>
            </div>
            <div className="index-price">
              {typeof index.price === 'number' 
                ? index.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '-'
              }
            </div>
            <div className={`index-change ${getChangeClass(index.change)}`}>
              {index.change >= 0 ? '+' : ''}
              {(index.change || 0).toFixed(2)}
            </div>
            
            {/* Mini sparkline placeholder */}
            <div className="index-sparkline">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                <path
                  d={generateSparklinePath(index.changePercent)}
                  fill="none"
                  stroke={index.changePercent >= 0 ? '#10b981' : '#ef4444'}
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Market Stats */}
      <div className="market-stats">
        <div className="stat-row">
          <div className="stat-item">
            <span className="stat-label">Advancing</span>
            <span className="stat-value positive">2,456</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Declining</span>
            <span className="stat-value negative">1,234</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Unchanged</span>
            <span className="stat-value">312</span>
          </div>
        </div>
        <div className="breadth-bar">
          <div className="breadth-positive" style={{ width: '65%' }}></div>
          <div className="breadth-negative" style={{ width: '35%' }}></div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="market-links">
        <a href="/market/sectors" className="market-link">
          <i className="icon-pie-chart"></i>
          Sectors
        </a>
        <a href="/market/movers" className="market-link">
          <i className="icon-trending-up"></i>
          Top Movers
        </a>
        <a href="/market/news" className="market-link">
          <i className="icon-newspaper"></i>
          News
        </a>
      </div>
    </div>
  );
};

// Generate a simple sparkline path based on change
function generateSparklinePath(changePercent) {
  const points = [];
  const baseline = 15;
  const amplitude = Math.min(Math.abs(changePercent || 0) * 3, 12);
  const direction = (changePercent || 0) >= 0 ? -1 : 1;
  
  // Generate a simple trending line with some variation
  for (let i = 0; i <= 10; i++) {
    const x = i * 10;
    const trend = (i / 10) * amplitude * direction;
    const noise = Math.sin(i * 1.5) * 3;
    const y = baseline + trend + noise;
    points.push(`${x},${Math.max(2, Math.min(28, y))}`);
  }
  
  return `M ${points.join(' L ')}`;
}

// Compact version for sidebar
export const MarketOverviewCompact = ({ indices = [] }) => {
  return (
    <div className="market-overview-compact">
      <h4>Markets</h4>
      <div className="compact-indices">
        {indices.slice(0, 3).map((index, i) => (
          <div key={index.symbol || i} className="compact-index">
            <span className="compact-name">{index.shortName}</span>
            <span className={`compact-change ${index.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {index.changePercent >= 0 ? '+' : ''}{formatPercent(index.changePercent || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketOverview;
