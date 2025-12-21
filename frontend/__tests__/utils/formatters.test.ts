/**
 * Formatter Utilities Tests
 * Tests for currency, percentage, number, and date formatting functions
 */

import {
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
} from '../../src/utils/formatters';

describe('formatCurrency', () => {
  test('formats positive numbers correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });

  test('formats negative numbers correctly', () => {
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    expect(formatCurrency(-0.01)).toBe('-$0.01');
  });

  test('handles null/undefined/NaN values', () => {
    expect(formatCurrency(null as unknown as number)).toBe('$0.00');
    expect(formatCurrency(undefined as unknown as number)).toBe('$0.00');
    expect(formatCurrency(NaN)).toBe('$0.00');
  });

  test('handles compact notation for millions', () => {
    expect(formatCurrency(1500000, true)).toMatch(/\$1\.5M/);
    expect(formatCurrency(2500000000, true)).toMatch(/\$2\.5B/);
  });

  test('supports different currencies', () => {
    expect(formatCurrency(1234.56, false, 'EUR')).toMatch(/1,234\.56/);
    expect(formatCurrency(1234.56, false, 'GBP')).toMatch(/1,234\.56/);
  });
});

describe('formatPercent', () => {
  test('formats percentages correctly', () => {
    expect(formatPercent(50)).toBe('50.00%');
    expect(formatPercent(12.345)).toBe('12.35%');
    expect(formatPercent(0)).toBe('0.00%');
  });

  test('handles negative percentages', () => {
    expect(formatPercent(-25.5)).toBe('-25.50%');
  });

  test('respects decimal places parameter', () => {
    expect(formatPercent(33.333, 1)).toBe('33.3%');
    expect(formatPercent(33.333, 0)).toBe('33%');
    expect(formatPercent(33.333, 3)).toBe('33.333%');
  });

  test('handles includeSign parameter', () => {
    expect(formatPercent(25, 2, true)).toMatch(/\+25\.00%/);
    expect(formatPercent(-25, 2, true)).toBe('-25.00%');
  });

  test('handles null/undefined/NaN values', () => {
    expect(formatPercent(null as unknown as number)).toBe('0.00%');
    expect(formatPercent(undefined as unknown as number)).toBe('0.00%');
    expect(formatPercent(NaN)).toBe('0.00%');
  });
});

describe('formatNumber', () => {
  test('formats numbers with decimals correctly', () => {
    expect(formatNumber(1234.5678)).toBe('1,234.57');
    expect(formatNumber(1000)).toBe('1,000.00');
  });

  test('respects decimal places parameter', () => {
    expect(formatNumber(1234.5678, 0)).toBe('1,235');
    expect(formatNumber(1234.5678, 3)).toBe('1,234.568');
  });

  test('handles compact notation', () => {
    // When compact is true, maximumFractionDigits is set to 1
    expect(formatNumber(1500000, 0, true)).toMatch(/1\.5M/);
  });

  test('handles null/undefined/NaN values', () => {
    expect(formatNumber(null as unknown as number)).toBe('0');
    expect(formatNumber(undefined as unknown as number)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });
});

describe('formatCompact', () => {
  test('formats thousands with K suffix', () => {
    expect(formatCompact(1000)).toBe('1.00K');
    expect(formatCompact(5500)).toBe('5.50K');
    expect(formatCompact(999999)).toBe('1000.00K');
  });

  test('formats millions with M suffix', () => {
    expect(formatCompact(1000000)).toBe('1.00M');
    expect(formatCompact(2500000)).toBe('2.50M');
  });

  test('formats billions with B suffix', () => {
    expect(formatCompact(1000000000)).toBe('1.00B');
    expect(formatCompact(3750000000)).toBe('3.75B');
  });

  test('formats trillions with T suffix', () => {
    expect(formatCompact(1000000000000)).toBe('1.00T');
  });

  test('handles negative numbers', () => {
    expect(formatCompact(-1500000)).toBe('-1.50M');
  });

  test('handles small numbers', () => {
    expect(formatCompact(500)).toBe('500.00');
    // Zero is formatted through formatNumber which returns '0.00' with 2 decimals
    expect(formatCompact(0)).toBe('0.00');
  });

  test('handles null/undefined/NaN values', () => {
    expect(formatCompact(null as unknown as number)).toBe('0');
    expect(formatCompact(undefined as unknown as number)).toBe('0');
    expect(formatCompact(NaN)).toBe('0');
  });
});

describe('formatDate', () => {
  const testDate = new Date('2024-06-15T10:30:00Z');

  test('formats short date correctly', () => {
    const result = formatDate(testDate, 'short');
    expect(result).toMatch(/Jun 15, 2024|Jun\s+15,\s+2024/);
  });

  test('formats long date correctly', () => {
    const result = formatDate(testDate, 'long');
    expect(result).toMatch(/Saturday/);
    expect(result).toMatch(/June/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  test('formats time correctly', () => {
    const result = formatDate(testDate, 'time');
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  test('formats datetime correctly', () => {
    const result = formatDate(testDate, 'datetime');
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  test('formats ISO date correctly', () => {
    expect(formatDate(testDate, 'iso')).toBe('2024-06-15');
  });

  test('handles string dates', () => {
    const result = formatDate('2024-06-15', 'short');
    expect(result).toMatch(/Jun/);
    // Date might be 14 or 15 depending on timezone, just verify it includes a day
    expect(result).toMatch(/\d{1,2}/);
    expect(result).toMatch(/2024/);
  });

  test('handles empty/invalid dates', () => {
    expect(formatDate(null as unknown as Date)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('invalid-date')).toBe('');
  });
});

describe('formatRelativeTime', () => {
  test('formats recent times as just now', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  test('formats minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('5m ago');
  });

  test('formats hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  test('formats days ago', () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2d ago');
  });

  test('formats weeks ago', () => {
    const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2w ago');
  });

  test('formats months ago', () => {
    const date = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2mo ago');
  });

  test('formats years ago', () => {
    const date = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1y ago');
  });
});

describe('formatShares', () => {
  test('formats whole shares without decimals', () => {
    expect(formatShares(100)).toBe('100');
    expect(formatShares(1500)).toBe('1,500');
  });

  test('formats fractional shares with 4 decimals', () => {
    expect(formatShares(100.5)).toBe('100.5000');
    expect(formatShares(0.0001)).toBe('0.0001');
  });

  test('handles null/undefined', () => {
    expect(formatShares(null as unknown as number)).toBe('0');
    expect(formatShares(undefined as unknown as number)).toBe('0');
  });
});

describe('formatPriceChange', () => {
  test('formats positive changes correctly', () => {
    const result = formatPriceChange(5.50, 2.5);
    expect(result.value).toMatch(/\+\$5\.50/);
    expect(result.percent).toMatch(/\+2\.50%/);
    expect(result.colorClass).toBe('positive');
    expect(result.arrow).toBe('↑');
  });

  test('formats negative changes correctly', () => {
    const result = formatPriceChange(-3.25, -1.5);
    expect(result.value).toMatch(/-\$3\.25/);
    expect(result.percent).toMatch(/-1\.50%/);
    expect(result.colorClass).toBe('negative');
    expect(result.arrow).toBe('↓');
  });

  test('formats zero changes as positive', () => {
    const result = formatPriceChange(0, 0);
    expect(result.colorClass).toBe('positive');
  });
});

describe('parseCurrency', () => {
  test('parses currency strings correctly', () => {
    expect(parseCurrency('$1,234.56')).toBe(1234.56);
    expect(parseCurrency('$100')).toBe(100);
    expect(parseCurrency('1,000,000.00')).toBe(1000000);
  });

  test('handles numbers passed directly', () => {
    expect(parseCurrency(1234.56 as unknown as string)).toBe(1234.56);
  });

  test('handles empty/null values', () => {
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency(null as unknown as string)).toBe(0);
  });
});

describe('formatMarketCap', () => {
  test('formats trillions correctly', () => {
    expect(formatMarketCap(3000000000000)).toBe('$3.00T');
  });

  test('formats billions correctly', () => {
    expect(formatMarketCap(2500000000)).toBe('$2.50B');
  });

  test('formats millions correctly', () => {
    expect(formatMarketCap(50000000)).toBe('$50.00M');
  });

  test('formats smaller values as currency', () => {
    expect(formatMarketCap(500000)).toBe('$500,000.00');
  });

  test('handles null/zero', () => {
    expect(formatMarketCap(0)).toBe('N/A');
    expect(formatMarketCap(null as unknown as number)).toBe('N/A');
  });
});

describe('formatVolume', () => {
  test('formats volume correctly', () => {
    expect(formatVolume(1500000)).toBe('1.50M');
    expect(formatVolume(50000)).toBe('50.00K');
  });

  test('handles zero/null', () => {
    expect(formatVolume(0)).toBe('0');
    expect(formatVolume(null as unknown as number)).toBe('0');
  });
});

describe('formatPE', () => {
  test('formats P/E ratio correctly', () => {
    expect(formatPE(25.5)).toBe('25.50');
    expect(formatPE(100.123)).toBe('100.12');
  });

  test('handles negative/null P/E', () => {
    expect(formatPE(-10)).toBe('N/A');
    expect(formatPE(0)).toBe('N/A');
    expect(formatPE(null as unknown as number)).toBe('N/A');
  });
});

describe('formatDividendYield', () => {
  test('formats yield correctly', () => {
    expect(formatDividendYield(3.5)).toBe('3.50%');
  });

  test('handles zero/null yield', () => {
    expect(formatDividendYield(0)).toBe('0.00%');
    expect(formatDividendYield(null as unknown as number)).toBe('0.00%');
  });
});

describe('getValueColorClass', () => {
  test('returns green for positive values', () => {
    expect(getValueColorClass(1)).toBe('text-green-600');
    expect(getValueColorClass(0.01)).toBe('text-green-600');
  });

  test('returns red for negative values', () => {
    expect(getValueColorClass(-1)).toBe('text-red-600');
    expect(getValueColorClass(-0.01)).toBe('text-red-600');
  });

  test('returns gray for zero', () => {
    expect(getValueColorClass(0)).toBe('text-gray-600');
  });
});

describe('formatTimePeriod', () => {
  test('converts period codes to readable strings', () => {
    expect(formatTimePeriod('1D')).toBe('1 Day');
    expect(formatTimePeriod('1W')).toBe('1 Week');
    expect(formatTimePeriod('1M')).toBe('1 Month');
    expect(formatTimePeriod('3M')).toBe('3 Months');
    expect(formatTimePeriod('6M')).toBe('6 Months');
    expect(formatTimePeriod('YTD')).toBe('Year to Date');
    expect(formatTimePeriod('1Y')).toBe('1 Year');
    expect(formatTimePeriod('3Y')).toBe('3 Years');
    expect(formatTimePeriod('5Y')).toBe('5 Years');
    expect(formatTimePeriod('ALL')).toBe('All Time');
  });

  test('returns original string for unknown periods', () => {
    expect(formatTimePeriod('custom')).toBe('custom');
  });
});
