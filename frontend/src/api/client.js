/**
 * WealthPilot Pro API Client
 * Handles all API communication with the backend
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000/api';

class ApiClient {
  constructor() {
    this.token = null;
    this.refreshPromise = null;
  }

  // Token management
  setToken(token) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('wealthpilot_token', token);
    }
  }

  getToken() {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('wealthpilot_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wealthpilot_token');
    }
  }

  // Base request method
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle 401 - try token refresh
      if (response.status === 401 && token) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        }
        this.clearToken();
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      return this.handleResponse(response);
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async refreshToken() {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          this.setToken(data.token);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // HTTP methods
  get(endpoint) {
    return this.request(endpoint);
  }

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  delete(endpoint, data) {
    return this.request(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  // ==================== AUTH ====================
  
  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    this.setToken(data.token);
    return data;
  }

  async register(email, password, firstName, lastName) {
    const data = await this.post('/auth/register', { email, password, firstName, lastName });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.post('/auth/logout');
    this.clearToken();
  }

  async getCurrentUser() {
    return this.get('/auth/me');
  }

  async changePassword(currentPassword, newPassword) {
    return this.put('/auth/password', { currentPassword, newPassword });
  }

  // ==================== USER ====================

  async updateProfile(data) {
    return this.put('/users/profile', data);
  }

  async getSettings() {
    return this.get('/users/settings');
  }

  async updateSettings(data) {
    return this.put('/users/settings', data);
  }

  async exportData() {
    return this.get('/users/export');
  }

  // ==================== PORTFOLIOS ====================

  async getPortfolios() {
    return this.get('/portfolios');
  }

  async getPortfolio(id) {
    return this.get(`/portfolios/${id}`);
  }

  async createPortfolio(data) {
    return this.post('/portfolios', data);
  }

  async updatePortfolio(id, data) {
    return this.put(`/portfolios/${id}`, data);
  }

  async deletePortfolio(id) {
    return this.delete(`/portfolios/${id}`);
  }

  async getPortfolioPerformance(id, period = '1M') {
    return this.get(`/portfolios/${id}/performance?period=${period}`);
  }

  async getPortfolioAllocation(id) {
    return this.get(`/portfolios/${id}/allocation`);
  }

  async getPortfolioDividends(id) {
    return this.get(`/portfolios/${id}/dividends`);
  }

  async getPortfolioRisk(id) {
    return this.get(`/portfolios/${id}/risk`);
  }

  // ==================== HOLDINGS ====================

  async addHolding(data) {
    return this.post('/holdings', data);
  }

  async getHolding(id) {
    return this.get(`/holdings/${id}`);
  }

  async updateHolding(id, data) {
    return this.put(`/holdings/${id}`, data);
  }

  async deleteHolding(id, sellPrice) {
    return this.delete(`/holdings/${id}`, sellPrice ? { sellPrice } : undefined);
  }

  async sellShares(holdingId, shares, price, method = 'FIFO') {
    return this.post(`/holdings/${holdingId}/sell`, { shares, price, method });
  }

  // ==================== TRANSACTIONS ====================

  async getTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/transactions${query ? `?${query}` : ''}`);
  }

  async createTransaction(data) {
    return this.post('/transactions', data);
  }

  async deleteTransaction(id) {
    return this.delete(`/transactions/${id}`);
  }

  async importTransactions(portfolioId, transactions) {
    return this.post('/transactions/import', { portfolioId, transactions });
  }

  // ==================== WATCHLISTS ====================

  async getWatchlists() {
    return this.get('/watchlists');
  }

  async createWatchlist(data) {
    return this.post('/watchlists', data);
  }

  async addToWatchlist(watchlistId, symbol, targetPrice, notes) {
    return this.post(`/watchlists/${watchlistId}/items`, { symbol, targetPrice, notes });
  }

  async removeFromWatchlist(watchlistId, symbol) {
    return this.delete(`/watchlists/${watchlistId}/items/${symbol}`);
  }

  async deleteWatchlist(id) {
    return this.delete(`/watchlists/${id}`);
  }

  // ==================== ALERTS ====================

  async getAlerts() {
    return this.get('/alerts');
  }

  async createAlert(data) {
    return this.post('/alerts', data);
  }

  async updateAlert(id, data) {
    return this.put(`/alerts/${id}`, data);
  }

  async deleteAlert(id) {
    return this.delete(`/alerts/${id}`);
  }

  // ==================== MARKET DATA ====================

  async getQuote(symbol) {
    return this.get(`/market/quote/${symbol}`);
  }

  async getQuotes(symbols) {
    return this.get(`/market/quotes?symbols=${symbols.join(',')}`);
  }

  async getCompanyProfile(symbol) {
    return this.get(`/market/profile/${symbol}`);
  }

  async getHistoricalPrices(symbol, days = 365) {
    return this.get(`/market/history/${symbol}?days=${days}`);
  }

  async searchStocks(query) {
    return this.get(`/market/search?q=${encodeURIComponent(query)}`);
  }

  async getMarketMovers() {
    return this.get('/market/movers');
  }

  // ==================== DIVIDENDS ====================

  async getDividendCalendar() {
    return this.get('/dividends/calendar');
  }

  async getDividendIncome(portfolioId, year) {
    const params = new URLSearchParams();
    if (portfolioId) params.append('portfolioId', portfolioId);
    if (year) params.append('year', year);
    return this.get(`/dividends/income?${params}`);
  }

  async screenDividendStocks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/dividends/screener?${query}`);
  }

  // ==================== ANALYTICS ====================

  async getDashboard() {
    return this.get('/analytics/dashboard');
  }

  async getOverallPerformance(period = '1M') {
    return this.get(`/analytics/performance?period=${period}`);
  }

  async getOverallRisk() {
    return this.get('/analytics/risk');
  }

  async getOverallAllocation() {
    return this.get('/analytics/allocation');
  }

  async getTaxLots() {
    return this.get('/analytics/tax-lots');
  }

  async getCorrelations() {
    return this.get('/analytics/correlations');
  }

  async getFundamentals(symbol) {
    return this.get(`/analytics/fundamentals/${symbol}`);
  }
}

// Export singleton instance
const api = new ApiClient();

// ES6 exports for React compatibility
export { api, ApiClient };
export default api;
