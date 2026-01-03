/**
 * Frontend Authentication Middleware
 * Handles JWT tokens and API authentication
 */

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// Fetch helper with auth
async function apiFetch(endpoint, options = {}, token = null) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) {
      return { error: data.error || 'Request failed', status: response.status };
    }
    
    return data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err.message);
    return { error: 'Network error', status: 500 };
  }
}

// Auth middleware - checks for token and adds user to res.locals
function authMiddleware(req, res, next) {
  const token = req.cookies.token || null;
  res.locals.token = token;
  res.locals.isAuthenticated = !!token;
  res.locals.user = null;
  
  if (token) {
    // Decode JWT to get basic user info (without verification)
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      res.locals.user = {
        id: payload.userId,
        email: payload.email
      };
    } catch (e) {
      // Invalid token format
      res.clearCookie('token');
      res.locals.isAuthenticated = false;
    }
  }
  
  next();
}

// Require auth middleware - redirects to login if not authenticated
function requireAuth(req, res, next) {
  if (!res.locals.isAuthenticated) {
    return res.redirect('/login');
  }
  next();
}

// API data loader - fetches data and handles errors
function createDataLoader(token) {
  return {
    async getDashboard() {
      return apiFetch('/analytics/dashboard', {}, token);
    },
    
    async getPortfolios() {
      return apiFetch('/portfolios', {}, token);
    },
    
    async getPortfolio(id) {
      return apiFetch(`/portfolios/${id}`, {}, token);
    },
    
    async getPortfolioPerformance(id, period = '1M') {
      return apiFetch(`/portfolios/${id}/performance?period=${period}`, {}, token);
    },
    
    async getPortfolioAllocation(id) {
      return apiFetch(`/portfolios/${id}/allocation`, {}, token);
    },
    
    async getPortfolioRisk(id) {
      return apiFetch(`/portfolios/${id}/risk`, {}, token);
    },
    
    async getPortfolioDividends(id) {
      return apiFetch(`/portfolios/${id}/dividends`, {}, token);
    },
    
    async getTransactions(params = {}) {
      const query = new URLSearchParams(params).toString();
      return apiFetch(`/transactions?${query}`, {}, token);
    },
    
    async getWatchlists() {
      return apiFetch('/watchlists', {}, token);
    },
    
    async getAlerts() {
      return apiFetch('/alerts', {}, token);
    },
    
    async getQuote(symbol) {
      return apiFetch(`/market/quote/${symbol}`);
    },
    
    async getQuotes(symbols) {
      return apiFetch(`/market/quotes?symbols=${symbols.join(',')}`);
    },
    
    async searchStocks(query) {
      return apiFetch(`/market/search?q=${encodeURIComponent(query)}`);
    },
    
    async getMarketMovers() {
      return apiFetch('/market/movers');
    },
    
    async getDividendCalendar() {
      return apiFetch('/dividends/calendar', {}, token);
    },
    
    async getTaxLots() {
      return apiFetch('/analytics/tax-lots', {}, token);
    },
    
    async getOverallPerformance(period = '1M') {
      return apiFetch(`/analytics/performance?period=${period}`, {}, token);
    },
    
    async getOverallRisk() {
      return apiFetch('/analytics/risk', {}, token);
    },
    
    async getOverallAllocation() {
      return apiFetch('/analytics/allocation', {}, token);
    }
  };
}

// Data loader middleware - adds loader to req
function dataLoaderMiddleware(req, res, next) {
  req.api = createDataLoader(res.locals.token);
  next();
}

module.exports = {
  apiFetch,
  authMiddleware,
  requireAuth,
  createDataLoader,
  dataLoaderMiddleware,
  API_URL
};
