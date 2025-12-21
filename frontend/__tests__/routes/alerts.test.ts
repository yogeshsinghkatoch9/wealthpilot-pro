/**
 * Alerts Page Tests
 * Tests for alert creation, management, and triggering
 */

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock localStorage
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  }
});

Object.defineProperty(global, 'window', {
  value: { location: { href: '' } },
  writable: true
});

const { ApiClient } = require('../../src/api/client');

describe('Alerts Management', () => {
  let client: InstanceType<typeof ApiClient>;

  beforeEach(() => {
    client = new ApiClient();
    client.setToken('test-token');
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  describe('Alert Types', () => {
    test('creates price above alert', async () => {
      const alertData = {
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 },
        message: 'AAPL crossed $200'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: {
            id: 'alert-123',
            ...alertData,
            isActive: true,
            createdAt: '2024-06-15T10:00:00Z'
          }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('price_above');
      expect(result.alert.condition.price).toBe(200);
      expect(result.alert.isActive).toBe(true);
    });

    test('creates price below alert', async () => {
      const alertData = {
        symbol: 'AAPL',
        type: 'price_below',
        condition: { price: 150 },
        message: 'AAPL dropped below $150'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-124', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('price_below');
      expect(result.alert.condition.price).toBe(150);
    });

    test('creates price change alert', async () => {
      const alertData = {
        symbol: 'AAPL',
        type: 'price_change',
        condition: { changePercent: 5 },
        message: 'AAPL moved 5%'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-125', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('price_change');
      expect(result.alert.condition.changePercent).toBe(5);
    });

    test('creates portfolio value alert', async () => {
      const alertData = {
        type: 'portfolio_value',
        condition: { value: 100000 },
        message: 'Portfolio reached $100K'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-126', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('portfolio_value');
      expect(result.alert.condition.value).toBe(100000);
    });

    test('creates portfolio gain alert', async () => {
      const alertData = {
        type: 'portfolio_gain',
        condition: { gainPercent: 10 },
        message: 'Portfolio up 10%'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-127', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('portfolio_gain');
    });

    test('creates portfolio loss alert', async () => {
      const alertData = {
        type: 'portfolio_loss',
        condition: { lossPercent: 5 },
        message: 'Portfolio down 5%'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-128', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('portfolio_loss');
    });

    test('creates dividend alert', async () => {
      const alertData = {
        symbol: 'AAPL',
        type: 'dividend',
        condition: {},
        message: 'AAPL dividend announced'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-129', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('dividend');
    });

    test('creates earnings alert', async () => {
      const alertData = {
        symbol: 'AAPL',
        type: 'earnings',
        condition: {},
        message: 'AAPL earnings upcoming'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-130', ...alertData, isActive: true }
        })
      });

      const result = await client.createAlert(alertData);

      expect(result.alert.type).toBe('earnings');
    });
  });

  describe('Read Alerts', () => {
    test('fetches all alerts', async () => {
      const alertsData = {
        alerts: [
          { id: 'alert-1', symbol: 'AAPL', type: 'price_above', isActive: true },
          { id: 'alert-2', symbol: 'MSFT', type: 'price_below', isActive: true },
          { id: 'alert-3', type: 'portfolio_value', isActive: false }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(alertsData)
      });

      const result = await client.getAlerts();

      expect(result.alerts).toHaveLength(3);
      expect(result.alerts[0].symbol).toBe('AAPL');
    });

    test('handles empty alerts list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ alerts: [] })
      });

      const result = await client.getAlerts();

      expect(result.alerts).toHaveLength(0);
    });

    test('includes triggered status in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          alerts: [
            {
              id: 'alert-1',
              symbol: 'AAPL',
              type: 'price_above',
              isActive: false,
              triggeredAt: '2024-06-14T14:30:00Z',
              triggeredPrice: 201.50
            }
          ]
        })
      });

      const result = await client.getAlerts();

      expect(result.alerts[0].isActive).toBe(false);
      expect(result.alerts[0].triggeredAt).toBeDefined();
      expect(result.alerts[0].triggeredPrice).toBe(201.50);
    });
  });

  describe('Update Alert', () => {
    test('updates alert condition', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: {
            id: 'alert-123',
            condition: { price: 220 }
          }
        })
      });

      const result = await client.updateAlert('alert-123', {
        condition: { price: 220 }
      });

      expect(result.alert.condition.price).toBe(220);
    });

    test('toggles alert active status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-123', isActive: false }
        })
      });

      const result = await client.updateAlert('alert-123', { isActive: false });

      expect(result.alert.isActive).toBe(false);
    });

    test('updates alert message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { id: 'alert-123', message: 'Updated message' }
        })
      });

      const result = await client.updateAlert('alert-123', {
        message: 'Updated message'
      });

      expect(result.alert.message).toBe('Updated message');
    });

    test('re-enables triggered alert', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: {
            id: 'alert-123',
            isActive: true,
            triggeredAt: null,
            triggeredPrice: null
          }
        })
      });

      const result = await client.updateAlert('alert-123', { isActive: true });

      expect(result.alert.isActive).toBe(true);
      expect(result.alert.triggeredAt).toBeNull();
    });
  });

  describe('Delete Alert', () => {
    test('deletes alert successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          message: 'Alert deleted'
        })
      });

      const result = await client.deleteAlert('alert-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/alerts/alert-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.success).toBe(true);
    });

    test('handles delete of non-existent alert', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Alert not found' })
      });

      await expect(client.deleteAlert('nonexistent'))
        .rejects.toThrow('Alert not found');
    });
  });

  describe('Alert Validation', () => {
    test('validates symbol format', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'symbol', message: 'Symbol must be 1-10 characters' }]
        })
      });

      await expect(client.createAlert({
        symbol: 'VERYLONGSYMBOL123',
        type: 'price_above',
        condition: { price: 100 }
      })).rejects.toThrow();
    });

    test('validates alert type', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'type', message: 'Invalid alert type' }]
        })
      });

      await expect(client.createAlert({
        symbol: 'AAPL',
        type: 'invalid_type',
        condition: {}
      })).rejects.toThrow();
    });

    test('validates condition object', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'condition', message: 'Condition must be an object' }]
        })
      });

      await expect(client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: 'not an object' as unknown as object
      })).rejects.toThrow();
    });

    test('validates message length', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'Validation failed',
          details: [{ field: 'message', message: 'Message must be under 200 characters' }]
        })
      });

      const longMessage = 'A'.repeat(250);

      await expect(client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 },
        message: longMessage
      })).rejects.toThrow();
    });
  });

  describe('Alert Triggering', () => {
    test('marks alert as triggered with current price', async () => {
      const triggeredAlert = {
        id: 'alert-123',
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 },
        isActive: false,
        triggeredAt: '2024-06-14T14:30:00Z',
        triggeredPrice: 201.50
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ alerts: [triggeredAlert] })
      });

      const result = await client.getAlerts();

      const alert = result.alerts[0];
      expect(alert.isActive).toBe(false);
      expect(alert.triggeredPrice).toBeGreaterThan(alert.condition.price);
    });

    test('calculates time since trigger', () => {
      const triggeredAt = new Date('2024-06-14T14:30:00Z');
      const now = new Date('2024-06-14T15:30:00Z');
      const hoursSinceTrigger = (now.getTime() - triggeredAt.getTime()) / (1000 * 60 * 60);

      expect(hoursSinceTrigger).toBe(1);
    });
  });

  describe('Alert Notifications', () => {
    test('includes notification preferences', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: {
            id: 'alert-123',
            notifyEmail: true,
            notifyPush: true
          }
        })
      });

      const result = await client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 },
        notifyEmail: true,
        notifyPush: true
      });

      expect(result.alert.notifyEmail).toBe(true);
      expect(result.alert.notifyPush).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles zero price threshold', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { condition: { price: 0 } }
        })
      });

      const result = await client.createAlert({
        symbol: 'PENNY',
        type: 'price_above',
        condition: { price: 0 }
      });

      expect(result.alert.condition.price).toBe(0);
    });

    test('handles decimal price thresholds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { condition: { price: 175.50 } }
        })
      });

      const result = await client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 175.50 }
      });

      expect(result.alert.condition.price).toBe(175.50);
    });

    test('handles multiple alerts for same symbol', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          alerts: [
            { id: 'alert-1', symbol: 'AAPL', type: 'price_above', condition: { price: 200 } },
            { id: 'alert-2', symbol: 'AAPL', type: 'price_below', condition: { price: 150 } },
            { id: 'alert-3', symbol: 'AAPL', type: 'dividend', condition: {} }
          ]
        })
      });

      const result = await client.getAlerts();
      const appleAlerts = result.alerts.filter(
        (a: { symbol: string }) => a.symbol === 'AAPL'
      );

      expect(appleAlerts).toHaveLength(3);
    });

    test('handles special characters in message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          alert: { message: "AAPL crossed $200! Let's go! 🚀" }
        })
      });

      const result = await client.createAlert({
        symbol: 'AAPL',
        type: 'price_above',
        condition: { price: 200 },
        message: "AAPL crossed $200! Let's go! 🚀"
      });

      expect(result.alert.message).toContain('🚀');
    });
  });
});
export {};
