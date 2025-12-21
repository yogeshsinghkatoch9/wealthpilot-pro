/**
 * Authentication Middleware Tests
 * Tests for JWT handling and auth middleware functions
 */

import { Request, Response, NextFunction } from 'express';

// Mock the auth middleware
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Import the module under test
const authModule = require('../../src/middleware/auth');

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockReq = {
      cookies: {}
    };
    mockRes = {
      locals: {},
      redirect: jest.fn(),
      clearCookie: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authMiddleware', () => {
    test('sets isAuthenticated to false when no token present', () => {
      mockReq.cookies = {};

      authModule.authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.locals?.isAuthenticated).toBe(false);
      expect(mockRes.locals?.token).toBeNull();
      expect(mockRes.locals?.user).toBeNull();
      expect(mockNext).toHaveBeenCalled();
    });

    test('sets isAuthenticated to true when valid token present', () => {
      // Create a valid JWT token (header.payload.signature)
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const token = `header.${encodedPayload}.signature`;

      mockReq.cookies = { token };

      authModule.authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.locals?.isAuthenticated).toBe(true);
      expect(mockRes.locals?.token).toBe(token);
      expect(mockRes.locals?.user).toEqual({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    test('clears cookie and sets isAuthenticated false for invalid token', () => {
      mockReq.cookies = { token: 'invalid-token' };

      authModule.authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('token');
      expect(mockRes.locals?.isAuthenticated).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });

    test('handles malformed base64 in token payload', () => {
      mockReq.cookies = { token: 'header.!!!invalid-base64!!!.signature' };

      authModule.authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('token');
      expect(mockRes.locals?.isAuthenticated).toBe(false);
    });
  });

  describe('requireAuth', () => {
    test('calls next() when user is authenticated', () => {
      mockRes.locals = { isAuthenticated: true };

      authModule.requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    test('redirects to login when user is not authenticated', () => {
      mockRes.locals = { isAuthenticated: false };

      authModule.requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/login');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('apiFetch', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    test('makes request with correct headers', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authModule.apiFetch('/test-endpoint', {}, 'test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          })
        })
      );
      expect(result).toEqual({ data: 'test' });
    });

    test('handles successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true, data: { portfolios: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authModule.apiFetch('/portfolios');

      expect(result).toEqual({ success: true, data: { portfolios: [] } });
    });

    test('handles error response', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ error: 'Bad request' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authModule.apiFetch('/portfolios');

      expect(result).toEqual({ error: 'Bad request', status: 400 });
    });

    test('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await authModule.apiFetch('/portfolios');

      expect(result).toEqual({ error: 'Network error', status: 500 });
    });

    test('includes token in authorization header when provided', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authModule.apiFetch('/test', {}, 'my-jwt-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-jwt-token'
          })
        })
      );
    });

    test('does not include authorization header when no token', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authModule.apiFetch('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String)
          })
        })
      );
    });
  });

  describe('createDataLoader', () => {
    beforeEach(() => {
      mockFetch.mockReset();
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);
    });

    test('creates data loader with all methods', () => {
      const loader = authModule.createDataLoader('test-token');

      expect(typeof loader.getDashboard).toBe('function');
      expect(typeof loader.getPortfolios).toBe('function');
      expect(typeof loader.getPortfolio).toBe('function');
      expect(typeof loader.getPortfolioPerformance).toBe('function');
      expect(typeof loader.getPortfolioAllocation).toBe('function');
      expect(typeof loader.getPortfolioRisk).toBe('function');
      expect(typeof loader.getPortfolioDividends).toBe('function');
      expect(typeof loader.getTransactions).toBe('function');
      expect(typeof loader.getWatchlists).toBe('function');
      expect(typeof loader.getAlerts).toBe('function');
      expect(typeof loader.getQuote).toBe('function');
      expect(typeof loader.getQuotes).toBe('function');
      expect(typeof loader.searchStocks).toBe('function');
      expect(typeof loader.getMarketMovers).toBe('function');
      expect(typeof loader.getDividendCalendar).toBe('function');
    });

    test('getDashboard calls correct endpoint', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.getDashboard();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/dashboard'),
        expect.any(Object)
      );
    });

    test('getPortfolios calls correct endpoint', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.getPortfolios();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios'),
        expect.any(Object)
      );
    });

    test('getPortfolio calls correct endpoint with ID', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.getPortfolio('portfolio-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/portfolio-123'),
        expect.any(Object)
      );
    });

    test('getPortfolioPerformance includes period parameter', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.getPortfolioPerformance('portfolio-123', '3M');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolios/portfolio-123/performance?period=3M'),
        expect.any(Object)
      );
    });

    test('getQuote calls correct endpoint with symbol', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.getQuote('AAPL');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/quote/AAPL'),
        expect.any(Object)
      );
    });

    test('searchStocks encodes query parameter', async () => {
      const loader = authModule.createDataLoader('test-token');
      await loader.searchStocks('Apple Inc');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/search?q=Apple%20Inc'),
        expect.any(Object)
      );
    });
  });

  describe('dataLoaderMiddleware', () => {
    test('adds api loader to request object', () => {
      mockRes.locals = { token: 'test-token' };

      authModule.dataLoaderMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as Request & { api: unknown }).api).toBeDefined();
      expect(typeof (mockReq as Request & { api: { getDashboard: unknown } }).api.getDashboard).toBe('function');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
