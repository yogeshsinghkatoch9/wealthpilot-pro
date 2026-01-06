/**
 * WealthPilot Pro - Main Dashboard Component
 * React-based interactive dashboard with real-time updates
 */

import React, { useState, useEffect, useMemo } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMarketData } from '../hooks/useMarketData';
import PortfolioSummary from './PortfolioSummary';
import HoldingsTable from './HoldingsTable';
import PerformanceChart from './charts/PerformanceChart';
import AllocationChart from './charts/AllocationChart';
import MarketOverview from './MarketOverview';
import AlertsPanel from './AlertsPanel';
import QuickActions from './QuickActions';
import { formatCurrency, formatPercent } from '../utils/formatters';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('1M');
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { 
    portfolios, 
    totalValue, 
    totalGainLoss,
    dayChange,
    fetchPortfolios,
    updateHoldingPrice 
  } = usePortfolioStore();
  
  const { isConnected, lastUpdate } = useWebSocket({
    onPriceUpdate: (data) => {
      updateHoldingPrice(data.symbol, data.price, data.change);
    }
  });
  
  const { marketIndices, isMarketOpen } = useMarketData();

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchPortfolios();
      setIsLoading(false);
    };
    loadData();
  }, [fetchPortfolios]);

  const summaryMetrics = useMemo(() => {
    if (!portfolios.length) return null;
    
    return {
      totalValue,
      dayChange,
      dayChangePercent: totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      totalGainLoss,
      totalGainLossPercent: totalValue > 0 ? (totalGainLoss / (totalValue - totalGainLoss)) * 100 : 0,
      portfolioCount: portfolios.length,
      holdingsCount: portfolios.reduce((sum, p) => sum + (p.holdings?.length || 0), 0)
    };
  }, [portfolios, totalValue, dayChange, totalGainLoss]);

  const timeRangeOptions = [
    { value: '1D', label: '1 Day' },
    { value: '1W', label: '1 Week' },
    { value: '1M', label: '1 Month' },
    { value: '3M', label: '3 Months' },
    { value: '6M', label: '6 Months' },
    { value: 'YTD', label: 'YTD' },
    { value: '1Y', label: '1 Year' },
    { value: 'ALL', label: 'All Time' }
  ];

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading your portfolios...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Portfolio Dashboard</h1>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Live' : 'Offline'}</span>
            {lastUpdate && (
              <span className="last-update">
                Updated {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="time-range-selector">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                className={`range-btn ${timeRange === option.value ? 'active' : ''}`}
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="summary-section">
        <div className="summary-cards">
          <div className="summary-card primary">
            <div className="card-label">Total Portfolio Value</div>
            <div className="card-value">{formatCurrency(summaryMetrics?.totalValue || 0)}</div>
            <div className={`card-change ${summaryMetrics?.dayChange >= 0 ? 'positive' : 'negative'}`}>
              {summaryMetrics?.dayChange >= 0 ? '+' : ''}
              {formatCurrency(summaryMetrics?.dayChange || 0)} 
              ({formatPercent(summaryMetrics?.dayChangePercent || 0)}) today
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-label">Total Gain/Loss</div>
            <div className={`card-value ${summaryMetrics?.totalGainLoss >= 0 ? 'positive' : 'negative'}`}>
              {summaryMetrics?.totalGainLoss >= 0 ? '+' : ''}
              {formatCurrency(summaryMetrics?.totalGainLoss || 0)}
            </div>
            <div className="card-subtitle">
              {formatPercent(summaryMetrics?.totalGainLossPercent || 0)} return
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-label">Portfolios</div>
            <div className="card-value">{summaryMetrics?.portfolioCount || 0}</div>
            <div className="card-subtitle">
              {summaryMetrics?.holdingsCount || 0} holdings
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-label">Market Status</div>
            <div className={`card-value ${isMarketOpen ? 'positive' : ''}`}>
              {isMarketOpen ? 'Open' : 'Closed'}
            </div>
            <div className="card-subtitle">
              {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="dashboard-grid">
        {/* Left Column - Charts */}
        <div className="grid-left">
          <div className="chart-card">
            <div className="card-header">
              <h3>Performance</h3>
              <select 
                value={selectedPortfolio || 'all'}
                onChange={(e) => setSelectedPortfolio(e.target.value === 'all' ? null : e.target.value)}
                className="portfolio-selector"
              >
                <option value="all">All Portfolios</option>
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <PerformanceChart 
              portfolioId={selectedPortfolio} 
              timeRange={timeRange}
            />
          </div>
          
          <div className="chart-row">
            <div className="chart-card half">
              <h3>Asset Allocation</h3>
              <AllocationChart 
                portfolioId={selectedPortfolio}
                type="asset"
              />
            </div>
            <div className="chart-card half">
              <h3>Sector Allocation</h3>
              <AllocationChart 
                portfolioId={selectedPortfolio}
                type="sector"
              />
            </div>
          </div>
        </div>

        {/* Right Column - Data & Actions */}
        <div className="grid-right">
          <MarketOverview indices={marketIndices} />
          <QuickActions />
          <AlertsPanel />
        </div>
      </section>

      {/* Holdings Table */}
      <section className="holdings-section">
        <div className="section-header">
          <h2>Holdings</h2>
          <div className="section-actions">
            <button className="btn btn-secondary">
              <i className="icon-filter"></i> Filter
            </button>
            <button className="btn btn-secondary">
              <i className="icon-download"></i> Export
            </button>
            <button className="btn btn-primary">
              <i className="icon-plus"></i> Add Holding
            </button>
          </div>
        </div>
        <HoldingsTable portfolioId={selectedPortfolio} />
      </section>

      {/* Portfolio Summary Cards */}
      <section className="portfolios-section">
        <h2>Your Portfolios</h2>
        <div className="portfolio-cards">
          {portfolios.map(portfolio => (
            <PortfolioSummary 
              key={portfolio.id}
              portfolio={portfolio}
              onClick={() => setSelectedPortfolio(portfolio.id)}
              isSelected={selectedPortfolio === portfolio.id}
            />
          ))}
          <div className="portfolio-card add-new" onClick={() => window.location.href = '/portfolios/new'}>
            <i className="icon-plus-circle"></i>
            <span>Create Portfolio</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
