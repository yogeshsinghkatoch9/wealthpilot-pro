/**
 * WealthPilot Pro - Formatting Utilities
 * Helper functions for formatting currency, percentages, numbers, and dates
 */

/**
 * Format a number as currency
 * @param {number} value - The value to format
 * @param {boolean} compact - Whether to use compact notation for large numbers
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, compact = false, currency = 'USD') => {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }

  const absValue = Math.abs(value);
  
  if (compact && absValue >= 1000000000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  }
  
  if (compact && absValue >= 1000000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

/**
 * Format a number as percentage
 * @param {number} value - The value to format (already multiplied by 100 or not)
 * @param {number} decimals - Number of decimal places
 * @param {boolean} includeSign - Whether to include + sign for positive numbers
 * @returns {string} Formatted percentage string
 */
export const formatPercent = (value, decimals = 2, includeSign = false) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: includeSign ? 'always' : 'auto'
  }).format(value / 100);

  return formatted;
};

/**
 * Format a raw number
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places
 * @param {boolean} compact - Whether to use compact notation
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 2, compact = false) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const options = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  };

  if (compact) {
    options.notation = 'compact';
    options.maximumFractionDigits = 1;
  }

  return new Intl.NumberFormat('en-US', options).format(value);
};

/**
 * Format large numbers with K, M, B suffixes
 * @param {number} value - The value to format
 * @returns {string} Formatted string with suffix
 */
export const formatCompact = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) {
    return `${sign}${(absValue / 1e12).toFixed(2)}T`;
  }
  if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(2)}B`;
  }
  if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(2)}M`;
  }
  if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(2)}K`;
  }

  return formatNumber(value, 2);
};

/**
 * Format a date
 * @param {string|Date} date - The date to format
 * @param {string} format - Format type: 'short', 'long', 'relative', 'time', 'datetime'
 * @returns {string} Formatted date string
 */
export const formatDate = (date, format = 'short') => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return '';

  switch (format) {
    case 'short':
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

    case 'long':
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

    case 'time':
      return dateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

    case 'datetime':
      return dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

    case 'relative':
      return formatRelativeTime(dateObj);

    case 'iso':
      return dateObj.toISOString().split('T')[0];

    default:
      return dateObj.toLocaleDateString('en-US');
  }
};

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {Date} date - The date to format
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
};

/**
 * Format shares/quantity with appropriate decimals
 * @param {number} shares - Number of shares
 * @returns {string} Formatted shares string
 */
export const formatShares = (shares) => {
  if (shares === null || shares === undefined) return '0';
  
  // Use 4 decimal places for fractional shares
  if (shares % 1 !== 0) {
    return formatNumber(shares, 4);
  }
  
  return formatNumber(shares, 0);
};

/**
 * Format a price change with color class
 * @param {number} change - The change value
 * @param {number} changePercent - The percentage change
 * @returns {object} Object with formatted values and color class
 */
export const formatPriceChange = (change, changePercent) => {
  const isPositive = change >= 0;
  
  return {
    value: `${isPositive ? '+' : ''}${formatCurrency(change)}`,
    percent: `${isPositive ? '+' : ''}${formatPercent(changePercent)}`,
    colorClass: isPositive ? 'positive' : 'negative',
    arrow: isPositive ? '↑' : '↓'
  };
};

/**
 * Parse a currency string to number
 * @param {string} value - Currency string (e.g., "$1,234.56")
 * @returns {number} Parsed number
 */
export const parseCurrency = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  return parseFloat(value.replace(/[$,]/g, '')) || 0;
};

/**
 * Format market cap
 * @param {number} marketCap - Market capitalization value
 * @returns {string} Formatted market cap
 */
export const formatMarketCap = (marketCap) => {
  if (!marketCap) return 'N/A';
  
  if (marketCap >= 1e12) {
    return `$${(marketCap / 1e12).toFixed(2)}T`;
  }
  if (marketCap >= 1e9) {
    return `$${(marketCap / 1e9).toFixed(2)}B`;
  }
  if (marketCap >= 1e6) {
    return `$${(marketCap / 1e6).toFixed(2)}M`;
  }
  
  return formatCurrency(marketCap);
};

/**
 * Format volume
 * @param {number} volume - Trading volume
 * @returns {string} Formatted volume
 */
export const formatVolume = (volume) => {
  if (!volume) return '0';
  return formatCompact(volume);
};

/**
 * Format P/E ratio
 * @param {number} pe - P/E ratio
 * @returns {string} Formatted P/E
 */
export const formatPE = (pe) => {
  if (!pe || pe < 0) return 'N/A';
  return pe.toFixed(2);
};

/**
 * Format dividend yield
 * @param {number} yield - Dividend yield as decimal
 * @returns {string} Formatted yield
 */
export const formatDividendYield = (yieldValue) => {
  if (!yieldValue) return '0.00%';
  return formatPercent(yieldValue);
};

/**
 * Get color class based on value
 * @param {number} value - The value to evaluate
 * @returns {string} CSS class name
 */
export const getValueColorClass = (value) => {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
};

/**
 * Format time period
 * @param {string} period - Period code (1D, 1W, 1M, etc.)
 * @returns {string} Human readable period
 */
export const formatTimePeriod = (period) => {
  const periods = {
    '1D': '1 Day',
    '1W': '1 Week',
    '1M': '1 Month',
    '3M': '3 Months',
    '6M': '6 Months',
    'YTD': 'Year to Date',
    '1Y': '1 Year',
    '3Y': '3 Years',
    '5Y': '5 Years',
    'ALL': 'All Time'
  };
  
  return periods[period] || period;
};

export default {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatCompact,
  formatDate,
  formatRelativeTime,
  formatShares,
  formatPriceChange,
  parseCurrency,
  formatMarketCap,
  formatVolume,
  formatPE,
  formatDividendYield,
  getValueColorClass,
  formatTimePeriod
};
