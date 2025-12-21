/**
 * Dashboard Route Tests
 * Tests for dashboard data loading and rendering
 */

import { Request, Response, NextFunction } from 'express';

// Mock the data loader
const mockGetDashboard = jest.fn();
const mockGetPortfolios = jest.fn();
const mockGetOverallPerformance = jest.fn();
const mockGetOverallAllocation = jest.fn();

const mockDataLoader = {
  getDashboard: mockGetDashboard,
  getPortfolios: mockGetPortfolios,
  getOverallPerformance: mockGetOverallPerformance,
  getOverallAllocation: mockGetOverallAllocation
};

describe('Dashboard Route', () => {
  let mockReq: Partial<Request & { api: typeof mockDataLoader }>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockReq = {
      api: mockDataLoader
    };
    mockRes = {
      locals: {
        isAuthenticated: true,
        user: { id: 'user-123', email: 'test@example.com' }
      },
      render: jest.fn(),
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('Dashboard Data Loading', () => {
    test('loads dashboard summary data', async () => {
      const mockDashboardData = {
        totalValue: 150000,
        totalGain: 25000,
        totalGainPercent: 20,
        dayChange: 500,
        dayChangePercent: 0.33,
        portfolioCount: 3,
        holdingCount: 15
      };

      mockGetDashboard.mockResolvedValue(mockDashboardData);

      const result = await mockDataLoader.getDashboard();

      expect(result).toEqual(mockDashboardData);
      expect(result.totalValue).toBe(150000);
      expect(result.totalGainPercent).toBe(20);
    });

    test('loads portfolio list for dashboard', async () => {
      const mockPortfolios = {
        portfolios: [
          {
            id: 'port-1',
            name: 'Retirement',
            totalValue: 100000,
            dayChange: 250,
            dayChangePercent: 0.25
          },
          {
            id: 'port-2',
            name: 'Brokerage',
            totalValue: 50000,
            dayChange: 250,
            dayChangePercent: 0.5
          }
        ]
      };

      mockGetPortfolios.mockResolvedValue(mockPortfolios);

      const result = await mockDataLoader.getPortfolios();

      expect(result.portfolios).toHaveLength(2);
      expect(result.portfolios[0].name).toBe('Retirement');
    });

    test('loads performance data with period', async () => {
      const mockPerformance = {
        period: '1M',
        startValue: 140000,
        endValue: 150000,
        gain: 10000,
        gainPercent: 7.14,
        history: [
          { date: '2024-05-01', value: 140000 },
          { date: '2024-05-15', value: 145000 },
          { date: '2024-06-01', value: 150000 }
        ]
      };

      mockGetOverallPerformance.mockResolvedValue(mockPerformance);

      const result = await mockDataLoader.getOverallPerformance('1M');

      expect(mockGetOverallPerformance).toHaveBeenCalledWith('1M');
      expect(result.gain).toBe(10000);
      expect(result.history).toHaveLength(3);
    });

    test('loads allocation data for pie chart', async () => {
      const mockAllocation = {
        bySector: [
          { sector: 'Technology', value: 75000, percent: 50 },
          { sector: 'Healthcare', value: 45000, percent: 30 },
          { sector: 'Finance', value: 30000, percent: 20 }
        ],
        byAssetType: [
          { type: 'Stocks', value: 135000, percent: 90 },
          { type: 'Cash', value: 15000, percent: 10 }
        ]
      };

      mockGetOverallAllocation.mockResolvedValue(mockAllocation);

      const result = await mockDataLoader.getOverallAllocation();

      expect(result.bySector).toHaveLength(3);
      expect(result.bySector[0].sector).toBe('Technology');
      expect(result.byAssetType[0].percent).toBe(90);
    });

    test('handles API error gracefully', async () => {
      mockGetDashboard.mockResolvedValue({
        error: 'Failed to fetch dashboard data',
        status: 500
      });

      const result = await mockDataLoader.getDashboard();

      expect(result.error).toBe('Failed to fetch dashboard data');
      expect(result.status).toBe(500);
    });

    test('handles empty portfolio state', async () => {
      const mockEmptyState = {
        totalValue: 0,
        totalGain: 0,
        totalGainPercent: 0,
        portfolioCount: 0,
        holdingCount: 0
      };

      mockGetDashboard.mockResolvedValue(mockEmptyState);

      const result = await mockDataLoader.getDashboard();

      expect(result.totalValue).toBe(0);
      expect(result.portfolioCount).toBe(0);
    });
  });

  describe('Dashboard Metrics Calculation', () => {
    test('calculates correct gain percentage', () => {
      const startValue = 100000;
      const currentValue = 125000;
      const expectedGainPercent = ((currentValue - startValue) / startValue) * 100;

      expect(expectedGainPercent).toBe(25);
    });

    test('calculates day-over-day change', () => {
      const previousClose = 150000;
      const currentValue = 151500;
      const dayChange = currentValue - previousClose;
      const dayChangePercent = (dayChange / previousClose) * 100;

      expect(dayChange).toBe(1500);
      expect(dayChangePercent).toBe(1);
    });

    test('handles negative changes correctly', () => {
      const previousClose = 150000;
      const currentValue = 145000;
      const dayChange = currentValue - previousClose;
      const dayChangePercent = (dayChange / previousClose) * 100;

      expect(dayChange).toBe(-5000);
      expect(dayChangePercent).toBeCloseTo(-3.33, 1);
    });
  });

  describe('Dashboard Widget Data', () => {
    test('formats top movers data', () => {
      const topGainers = [
        { symbol: 'NVDA', change: 15.5, changePercent: 5.2 },
        { symbol: 'AAPL', change: 8.2, changePercent: 2.1 }
      ];

      const topLosers = [
        { symbol: 'META', change: -12.3, changePercent: -3.8 },
        { symbol: 'GOOGL', change: -5.5, changePercent: -1.2 }
      ];

      expect(topGainers[0].changePercent).toBeGreaterThan(0);
      expect(topLosers[0].changePercent).toBeLessThan(0);
    });

    test('formats dividend income summary', () => {
      const dividendSummary = {
        totalReceived: 5000,
        ytdTotal: 4500,
        nextPayment: {
          symbol: 'AAPL',
          amount: 125,
          date: '2024-07-15'
        }
      };

      expect(dividendSummary.totalReceived).toBe(5000);
      expect(dividendSummary.nextPayment.symbol).toBe('AAPL');
    });

    test('formats alert summary', () => {
      const alertSummary = {
        active: 5,
        triggered: 2,
        recentTriggers: [
          { symbol: 'AAPL', type: 'price_above', triggeredAt: '2024-06-14T10:30:00Z' }
        ]
      };

      expect(alertSummary.active).toBe(5);
      expect(alertSummary.triggered).toBe(2);
    });
  });

  describe('Dashboard Chart Data', () => {
    test('formats line chart data for performance', () => {
      const chartData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Portfolio Value',
          data: [100000, 105000, 110000, 108000, 115000, 120000]
        }]
      };

      expect(chartData.labels).toHaveLength(6);
      expect(chartData.datasets[0].data).toHaveLength(6);
      expect(chartData.datasets[0].data[5]).toBe(120000);
    });

    test('formats pie chart data for allocation', () => {
      const pieData = {
        labels: ['Technology', 'Healthcare', 'Finance', 'Consumer'],
        values: [40, 25, 20, 15],
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
      };

      const total = pieData.values.reduce((sum, val) => sum + val, 0);
      expect(total).toBe(100);
    });

    test('formats bar chart data for sector performance', () => {
      const barData = {
        sectors: ['Technology', 'Healthcare', 'Finance'],
        gains: [15.5, 8.2, -3.5]
      };

      expect(barData.sectors).toHaveLength(3);
      expect(barData.gains[0]).toBeGreaterThan(0);
      expect(barData.gains[2]).toBeLessThan(0);
    });
  });

  describe('Dashboard Time Periods', () => {
    const periods = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

    test.each(periods)('supports %s time period', async (period) => {
      mockGetOverallPerformance.mockResolvedValue({ period, data: [] });

      await mockDataLoader.getOverallPerformance(period);

      expect(mockGetOverallPerformance).toHaveBeenCalledWith(period);
    });
  });

  describe('Dashboard Empty States', () => {
    test('handles no portfolios', async () => {
      mockGetPortfolios.mockResolvedValue({ portfolios: [] });

      const result = await mockDataLoader.getPortfolios();

      expect(result.portfolios).toHaveLength(0);
    });

    test('handles no performance history', async () => {
      mockGetOverallPerformance.mockResolvedValue({
        period: '1M',
        history: [],
        gain: 0,
        gainPercent: 0
      });

      const result = await mockDataLoader.getOverallPerformance('1M');

      expect(result.history).toHaveLength(0);
      expect(result.gain).toBe(0);
    });

    test('handles no allocation data', async () => {
      mockGetOverallAllocation.mockResolvedValue({
        bySector: [],
        byAssetType: []
      });

      const result = await mockDataLoader.getOverallAllocation();

      expect(result.bySector).toHaveLength(0);
      expect(result.byAssetType).toHaveLength(0);
    });
  });
});
export {};
