/**
 * WealthPilot Pro - Holdings Table Component
 * Interactive data table with sorting, filtering, and real-time updates
 */

import React, { useState, useMemo, useCallback } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';

const HoldingsTable = ({ portfolioId }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'value', direction: 'desc' });
  const [filters, setFilters] = useState({
    search: '',
    sector: 'all',
    gainLoss: 'all',
    minValue: ''
  });
  const [selectedHoldings, setSelectedHoldings] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const { portfolios, getHoldingsForPortfolio } = usePortfolioStore();

  const holdings = useMemo(() => {
    return portfolioId 
      ? getHoldingsForPortfolio(portfolioId)
      : portfolios.flatMap(p => p.holdings || []);
  }, [portfolioId, portfolios, getHoldingsForPortfolio]);

  const sectors = useMemo(() => {
    const sectorSet = new Set(holdings.map(h => h.sector).filter(Boolean));
    return ['all', ...Array.from(sectorSet)];
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    return holdings.filter(holding => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          holding.symbol?.toLowerCase().includes(searchLower) ||
          holding.name?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Sector filter
      if (filters.sector !== 'all' && holding.sector !== filters.sector) {
        return false;
      }

      // Gain/Loss filter
      if (filters.gainLoss === 'gains' && holding.unrealizedGainLoss < 0) return false;
      if (filters.gainLoss === 'losses' && holding.unrealizedGainLoss >= 0) return false;

      // Min value filter
      if (filters.minValue && holding.marketValue < parseFloat(filters.minValue)) {
        return false;
      }

      return true;
    });
  }, [holdings, filters]);

  const sortedHoldings = useMemo(() => {
    const sorted = [...filteredHoldings];
    
    sorted.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle nested properties
      if (sortConfig.key === 'dayChangePercent') {
        aValue = a.dayChange / (a.marketValue - a.dayChange) * 100 || 0;
        bValue = b.dayChange / (b.marketValue - b.dayChange) * 100 || 0;
      }

      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortConfig.direction === 'asc' 
        ? (aValue || 0) - (bValue || 0)
        : (bValue || 0) - (aValue || 0);
    });

    return sorted;
  }, [filteredHoldings, sortConfig]);

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedHoldings.size === sortedHoldings.length) {
      setSelectedHoldings(new Set());
    } else {
      setSelectedHoldings(new Set(sortedHoldings.map(h => h.id)));
    }
  }, [sortedHoldings, selectedHoldings]);

  const handleSelectHolding = useCallback((id) => {
    setSelectedHoldings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const totals = useMemo(() => {
    return sortedHoldings.reduce((acc, h) => ({
      marketValue: acc.marketValue + (h.marketValue || 0),
      costBasis: acc.costBasis + (h.costBasis || 0),
      dayChange: acc.dayChange + (h.dayChange || 0),
      unrealizedGainLoss: acc.unrealizedGainLoss + (h.unrealizedGainLoss || 0)
    }), { marketValue: 0, costBasis: 0, dayChange: 0, unrealizedGainLoss: 0 });
  }, [sortedHoldings]);

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="sort-icon">↕</span>;
    }
    return <span className="sort-icon active">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const columns = [
    { key: 'symbol', label: 'Symbol', align: 'left' },
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'shares', label: 'Shares', align: 'right' },
    { key: 'price', label: 'Price', align: 'right' },
    { key: 'dayChange', label: 'Day Change', align: 'right' },
    { key: 'marketValue', label: 'Market Value', align: 'right' },
    { key: 'costBasis', label: 'Cost Basis', align: 'right' },
    { key: 'unrealizedGainLoss', label: 'Gain/Loss', align: 'right' },
    { key: 'weight', label: 'Weight', align: 'right' }
  ];

  return (
    <div className="holdings-table-container">
      {/* Toolbar */}
      <div className="table-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="icon-search"></i>
            <input
              type="text"
              placeholder="Search holdings..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <button 
            className={`btn btn-icon ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <i className="icon-filter"></i>
            Filters
          </button>
        </div>
        <div className="toolbar-right">
          <span className="holdings-count">
            {sortedHoldings.length} of {holdings.length} holdings
          </span>
          {selectedHoldings.size > 0 && (
            <div className="bulk-actions">
              <span>{selectedHoldings.size} selected</span>
              <button className="btn btn-sm">Edit</button>
              <button className="btn btn-sm btn-danger">Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Sector</label>
            <select 
              value={filters.sector}
              onChange={(e) => setFilters(prev => ({ ...prev, sector: e.target.value }))}
            >
              {sectors.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Sectors' : s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Performance</label>
            <select
              value={filters.gainLoss}
              onChange={(e) => setFilters(prev => ({ ...prev, gainLoss: e.target.value }))}
            >
              <option value="all">All</option>
              <option value="gains">Gains Only</option>
              <option value="losses">Losses Only</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Min Value</label>
            <input
              type="number"
              placeholder="$0"
              value={filters.minValue}
              onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))}
            />
          </div>
          <button 
            className="btn btn-sm"
            onClick={() => setFilters({ search: '', sector: 'all', gainLoss: 'all', minValue: '' })}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="table-wrapper">
        <table className="holdings-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input
                  type="checkbox"
                  checked={selectedHoldings.size === sortedHoldings.length && sortedHoldings.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              {columns.map(col => (
                <th 
                  key={col.key}
                  className={`sortable ${col.align}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon columnKey={col.key} />
                </th>
              ))}
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map(holding => {
              const dayChangePercent = holding.price > 0 
                ? (holding.dayChange / (holding.marketValue - holding.dayChange)) * 100 
                : 0;
              const gainLossPercent = holding.costBasis > 0
                ? (holding.unrealizedGainLoss / holding.costBasis) * 100
                : 0;
              const weight = totals.marketValue > 0
                ? (holding.marketValue / totals.marketValue) * 100
                : 0;

              return (
                <tr 
                  key={holding.id}
                  className={selectedHoldings.has(holding.id) ? 'selected' : ''}
                >
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedHoldings.has(holding.id)}
                      onChange={() => handleSelectHolding(holding.id)}
                    />
                  </td>
                  <td className="symbol-cell">
                    <div className="symbol-wrapper">
                      <span className="symbol">{holding.symbol}</span>
                      {holding.sector && (
                        <span className="sector-badge">{holding.sector}</span>
                      )}
                    </div>
                  </td>
                  <td className="name-cell">{holding.name || '-'}</td>
                  <td className="right">{formatNumber(holding.shares, 4)}</td>
                  <td className="right">{formatCurrency(holding.price)}</td>
                  <td className={`right ${holding.dayChange >= 0 ? 'positive' : 'negative'}`}>
                    <div className="change-cell">
                      <span>{holding.dayChange >= 0 ? '+' : ''}{formatCurrency(holding.dayChange)}</span>
                      <span className="percent">({formatPercent(dayChangePercent)})</span>
                    </div>
                  </td>
                  <td className="right">{formatCurrency(holding.marketValue)}</td>
                  <td className="right">{formatCurrency(holding.costBasis)}</td>
                  <td className={`right ${holding.unrealizedGainLoss >= 0 ? 'positive' : 'negative'}`}>
                    <div className="change-cell">
                      <span>{holding.unrealizedGainLoss >= 0 ? '+' : ''}{formatCurrency(holding.unrealizedGainLoss)}</span>
                      <span className="percent">({formatPercent(gainLossPercent)})</span>
                    </div>
                  </td>
                  <td className="right">
                    <div className="weight-cell">
                      <div className="weight-bar" style={{ width: `${Math.min(weight, 100)}%` }}></div>
                      <span>{formatPercent(weight)}</span>
                    </div>
                  </td>
                  <td className="actions-col">
                    <div className="row-actions">
                      <button className="btn-icon" title="View Details">
                        <i className="icon-eye"></i>
                      </button>
                      <button className="btn-icon" title="Edit">
                        <i className="icon-edit"></i>
                      </button>
                      <button className="btn-icon" title="Add Transaction">
                        <i className="icon-plus"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td></td>
              <td colSpan="4"><strong>Total ({sortedHoldings.length} holdings)</strong></td>
              <td className={`right ${totals.dayChange >= 0 ? 'positive' : 'negative'}`}>
                <strong>{totals.dayChange >= 0 ? '+' : ''}{formatCurrency(totals.dayChange)}</strong>
              </td>
              <td className="right"><strong>{formatCurrency(totals.marketValue)}</strong></td>
              <td className="right"><strong>{formatCurrency(totals.costBasis)}</strong></td>
              <td className={`right ${totals.unrealizedGainLoss >= 0 ? 'positive' : 'negative'}`}>
                <strong>{totals.unrealizedGainLoss >= 0 ? '+' : ''}{formatCurrency(totals.unrealizedGainLoss)}</strong>
              </td>
              <td className="right"><strong>100%</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {sortedHoldings.length === 0 && (
        <div className="empty-state">
          <i className="icon-inbox"></i>
          <p>No holdings found</p>
          {filters.search || filters.sector !== 'all' || filters.gainLoss !== 'all' ? (
            <button 
              className="btn btn-secondary"
              onClick={() => setFilters({ search: '', sector: 'all', gainLoss: 'all', minValue: '' })}
            >
              Clear Filters
            </button>
          ) : (
            <button className="btn btn-primary">Add Your First Holding</button>
          )}
        </div>
      )}
    </div>
  );
};

export default HoldingsTable;
