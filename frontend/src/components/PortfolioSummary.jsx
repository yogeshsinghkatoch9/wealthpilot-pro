/**
 * WealthPilot Pro - Portfolio Summary Component
 * Card component displaying portfolio overview
 */

import React, { useMemo } from 'react';
import { formatCurrency, formatPercent } from '../utils/formatters';

const PortfolioSummary = ({ portfolio, onClick, isSelected }) => {
  const metrics = useMemo(() => {
    if (!portfolio) return null;

    const holdings = portfolio.holdings || [];
    const holdingsValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    const totalValue = holdingsValue + (portfolio.cashBalance || 0);
    const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);
    const unrealizedGainLoss = holdings.reduce((sum, h) => sum + (h.unrealizedGainLoss || 0), 0);
    const dayChange = holdings.reduce((sum, h) => sum + (h.dayChange || 0), 0);
    
    return {
      totalValue,
      holdingsValue,
      cashBalance: portfolio.cashBalance || 0,
      cashPercent: totalValue > 0 ? (portfolio.cashBalance / totalValue) * 100 : 0,
      unrealizedGainLoss,
      unrealizedGainLossPercent: totalCost > 0 ? (unrealizedGainLoss / totalCost) * 100 : 0,
      dayChange,
      dayChangePercent: totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      holdingsCount: holdings.length,
      topHoldings: [...holdings]
        .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
        .slice(0, 3)
    };
  }, [portfolio]);

  if (!portfolio || !metrics) {
    return null;
  }

  const getPortfolioTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'retirement':
      case '401k':
      case 'ira':
        return '🏦';
      case 'brokerage':
        return '📈';
      case 'crypto':
        return '₿';
      case 'real estate':
        return '🏠';
      default:
        return '💼';
    }
  };

  const getAccountBadge = (accountType) => {
    const badges = {
      'taxable': { label: 'Taxable', color: 'gray' },
      'traditional_ira': { label: 'Trad IRA', color: 'blue' },
      'roth_ira': { label: 'Roth IRA', color: 'green' },
      '401k': { label: '401(k)', color: 'purple' },
      'roth_401k': { label: 'Roth 401(k)', color: 'teal' },
      'hsa': { label: 'HSA', color: 'orange' },
      '529': { label: '529', color: 'pink' }
    };
    return badges[accountType] || { label: accountType || 'Account', color: 'gray' };
  };

  const badge = getAccountBadge(portfolio.accountType);

  return (
    <div 
      className={`portfolio-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onClick?.(portfolio.id)}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && onClick?.(portfolio.id)}
    >
      {/* Header */}
      <div className="card-header">
        <div className="portfolio-icon">
          {getPortfolioTypeIcon(portfolio.type)}
        </div>
        <div className="portfolio-info">
          <h3 className="portfolio-name">{portfolio.name}</h3>
          <span className={`account-badge badge-${badge.color}`}>
            {badge.label}
          </span>
        </div>
        {isSelected && (
          <div className="selected-indicator">
            <i className="icon-check-circle"></i>
          </div>
        )}
      </div>

      {/* Value Section */}
      <div className="value-section">
        <div className="total-value">
          {formatCurrency(metrics.totalValue)}
        </div>
        <div className={`day-change ${metrics.dayChange >= 0 ? 'positive' : 'negative'}`}>
          <span className="change-arrow">
            {metrics.dayChange >= 0 ? '↑' : '↓'}
          </span>
          <span className="change-amount">
            {formatCurrency(Math.abs(metrics.dayChange))}
          </span>
          <span className="change-percent">
            ({formatPercent(Math.abs(metrics.dayChangePercent))})
          </span>
          <span className="change-period">today</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-row">
        <div className="metric">
          <span className="metric-label">Total Gain/Loss</span>
          <span className={`metric-value ${metrics.unrealizedGainLoss >= 0 ? 'positive' : 'negative'}`}>
            {metrics.unrealizedGainLoss >= 0 ? '+' : ''}
            {formatCurrency(metrics.unrealizedGainLoss)}
            <span className="metric-percent">
              ({formatPercent(metrics.unrealizedGainLossPercent)})
            </span>
          </span>
        </div>
      </div>

      {/* Holdings Preview */}
      {metrics.holdingsCount > 0 && (
        <div className="holdings-preview">
          <div className="preview-header">
            <span>Top Holdings</span>
            <span className="holdings-count">{metrics.holdingsCount} total</span>
          </div>
          <div className="preview-list">
            {metrics.topHoldings.map(holding => {
              const weight = metrics.holdingsValue > 0 
                ? (holding.marketValue / metrics.holdingsValue) * 100 
                : 0;
              return (
                <div key={holding.id || holding.symbol} className="preview-item">
                  <div className="item-info">
                    <span className="item-symbol">{holding.symbol}</span>
                    <span className="item-weight">{formatPercent(weight)}</span>
                  </div>
                  <div className="item-bar">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${Math.min(weight, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cash Balance */}
      {metrics.cashBalance > 0 && (
        <div className="cash-section">
          <div className="cash-info">
            <span className="cash-label">Cash</span>
            <span className="cash-value">{formatCurrency(metrics.cashBalance)}</span>
          </div>
          <div className="cash-bar">
            <div 
              className="bar-fill cash" 
              style={{ width: `${metrics.cashPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="card-footer">
        <button 
          className="action-btn"
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/portfolios/${portfolio.id}`;
          }}
        >
          <i className="icon-eye"></i>
          View
        </button>
        <button 
          className="action-btn"
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/portfolios/${portfolio.id}/edit`;
          }}
        >
          <i className="icon-edit"></i>
          Edit
        </button>
        <button 
          className="action-btn"
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/portfolios/${portfolio.id}/transactions/new`;
          }}
        >
          <i className="icon-plus"></i>
          Trade
        </button>
      </div>
    </div>
  );
};

// Mini version for compact displays
export const PortfolioMiniCard = ({ portfolio, onClick }) => {
  const totalValue = (portfolio.holdings || []).reduce((sum, h) => sum + (h.marketValue || 0), 0) + (portfolio.cashBalance || 0);
  const dayChange = (portfolio.holdings || []).reduce((sum, h) => sum + (h.dayChange || 0), 0);
  const dayChangePercent = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  return (
    <div className="portfolio-mini-card" onClick={() => onClick?.(portfolio.id)}>
      <div className="mini-header">
        <span className="mini-name">{portfolio.name}</span>
      </div>
      <div className="mini-value">{formatCurrency(totalValue)}</div>
      <div className={`mini-change ${dayChange >= 0 ? 'positive' : 'negative'}`}>
        {dayChange >= 0 ? '+' : ''}{formatPercent(dayChangePercent)}
      </div>
    </div>
  );
};

// Skeleton loader
export const PortfolioCardSkeleton = () => (
  <div className="portfolio-card skeleton">
    <div className="card-header">
      <div className="skeleton-circle"></div>
      <div className="skeleton-text"></div>
    </div>
    <div className="value-section">
      <div className="skeleton-text large"></div>
      <div className="skeleton-text small"></div>
    </div>
    <div className="metrics-row">
      <div className="skeleton-text"></div>
    </div>
    <div className="holdings-preview">
      <div className="skeleton-text"></div>
      <div className="skeleton-bar"></div>
      <div className="skeleton-bar"></div>
      <div className="skeleton-bar"></div>
    </div>
  </div>
);

export default PortfolioSummary;
