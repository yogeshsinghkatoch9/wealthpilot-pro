/**
 * WealthPilot Pro - Portfolio Store
 * Zustand-based global state management for portfolio data
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import api from '../api/client';

// Helper to generate mock performance data
const generatePerformanceData = (startValue, days, volatility = 0.02) => {
  const data = [];
  let value = startValue;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  for (let i = 0; i <= days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    const dailyReturn = (Math.random() - 0.48) * volatility;
    const previousValue = value;
    value = value * (1 + dailyReturn);
    
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
      dayChange: Math.round((value - previousValue) * 100) / 100,
      dayChangePercent: Math.round(dailyReturn * 10000) / 100
    });
  }
  
  return data;
};

const usePortfolioStore = create(
  devtools(
    persist(
      immer((set, get) => ({
        // State
        portfolios: [],
        selectedPortfolioId: null,
        isLoading: false,
        error: null,
        lastUpdated: null,
        
        // Computed values
        get totalValue() {
          return get().portfolios.reduce((sum, p) => {
            const holdingsValue = (p.holdings || []).reduce((hSum, h) => hSum + (h.marketValue || 0), 0);
            return sum + holdingsValue + (p.cashBalance || 0);
          }, 0);
        },
        
        get totalGainLoss() {
          return get().portfolios.reduce((sum, p) => {
            return sum + (p.holdings || []).reduce((hSum, h) => hSum + (h.unrealizedGainLoss || 0), 0);
          }, 0);
        },
        
        get dayChange() {
          return get().portfolios.reduce((sum, p) => {
            return sum + (p.holdings || []).reduce((hSum, h) => hSum + (h.dayChange || 0), 0);
          }, 0);
        },

        // Actions
        fetchPortfolios: async () => {
          set(state => { state.isLoading = true; state.error = null; });
          
          try {
            const response = await api.get('/portfolios');
            const portfolios = response.data.data || response.data;
            
            set(state => {
              state.portfolios = portfolios;
              state.isLoading = false;
              state.lastUpdated = new Date().toISOString();
            });
            
            return portfolios;
          } catch (error) {
            set(state => {
              state.error = error.message;
              state.isLoading = false;
            });
            throw error;
          }
        },

        fetchPortfolioDetails: async (portfolioId) => {
          try {
            const [portfolioRes, holdingsRes] = await Promise.all([
              api.get(`/portfolios/${portfolioId}`),
              api.get(`/portfolios/${portfolioId}/holdings`)
            ]);
            
            set(state => {
              const index = state.portfolios.findIndex(p => p.id === portfolioId);
              if (index !== -1) {
                state.portfolios[index] = {
                  ...state.portfolios[index],
                  ...portfolioRes.data,
                  holdings: holdingsRes.data.data || holdingsRes.data
                };
              }
            });
          } catch (error) {
            console.error('Error fetching portfolio details:', error);
          }
        },

        createPortfolio: async (portfolioData) => {
          set(state => { state.isLoading = true; });
          
          try {
            const response = await api.post('/portfolios', portfolioData);
            const newPortfolio = response.data;
            
            set(state => {
              state.portfolios.push({ ...newPortfolio, holdings: [] });
              state.isLoading = false;
            });
            
            return newPortfolio;
          } catch (error) {
            set(state => { state.isLoading = false; state.error = error.message; });
            throw error;
          }
        },

        updatePortfolio: async (portfolioId, updates) => {
          try {
            const response = await api.put(`/portfolios/${portfolioId}`, updates);
            
            set(state => {
              const index = state.portfolios.findIndex(p => p.id === portfolioId);
              if (index !== -1) {
                state.portfolios[index] = { ...state.portfolios[index], ...response.data };
              }
            });
            
            return response.data;
          } catch (error) {
            set(state => { state.error = error.message; });
            throw error;
          }
        },

        deletePortfolio: async (portfolioId) => {
          try {
            await api.delete(`/portfolios/${portfolioId}`);
            
            set(state => {
              state.portfolios = state.portfolios.filter(p => p.id !== portfolioId);
              if (state.selectedPortfolioId === portfolioId) {
                state.selectedPortfolioId = null;
              }
            });
          } catch (error) {
            set(state => { state.error = error.message; });
            throw error;
          }
        },

        // Holdings
        getHoldingsForPortfolio: (portfolioId) => {
          const { portfolios } = get();
          if (portfolioId) {
            const portfolio = portfolios.find(p => p.id === portfolioId);
            return portfolio?.holdings || [];
          }
          return portfolios.flatMap(p => p.holdings || []);
        },

        addHolding: async (portfolioId, holdingData) => {
          try {
            const response = await api.post(`/portfolios/${portfolioId}/holdings`, holdingData);
            
            set(state => {
              const portfolio = state.portfolios.find(p => p.id === portfolioId);
              if (portfolio) {
                if (!portfolio.holdings) portfolio.holdings = [];
                portfolio.holdings.push(response.data);
              }
            });
            
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        updateHolding: async (portfolioId, holdingId, updates) => {
          try {
            const response = await api.put(`/holdings/${holdingId}`, updates);
            
            set(state => {
              const portfolio = state.portfolios.find(p => p.id === portfolioId);
              if (portfolio?.holdings) {
                const index = portfolio.holdings.findIndex(h => h.id === holdingId);
                if (index !== -1) {
                  portfolio.holdings[index] = { ...portfolio.holdings[index], ...response.data };
                }
              }
            });
            
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        updateHoldingPrice: (symbol, price, change) => {
          set(state => {
            state.portfolios.forEach(portfolio => {
              portfolio.holdings?.forEach(holding => {
                if (holding.symbol === symbol) {
                  holding.price = price;
                  holding.dayChange = change * holding.shares;
                  holding.marketValue = price * holding.shares;
                  holding.unrealizedGainLoss = holding.marketValue - holding.costBasis;
                }
              });
            });
            state.lastUpdated = new Date().toISOString();
          });
        },

        // Performance & Analytics
        getPerformanceHistory: (portfolioId, timeRange) => {
          const { portfolios, totalValue } = get();
          
          // Determine number of days based on time range
          const daysMap = {
            '1D': 1, '1W': 7, '1M': 30, '3M': 90,
            '6M': 180, 'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000),
            '1Y': 365, 'ALL': 730
          };
          const days = daysMap[timeRange] || 30;
          
          // Calculate starting value (approximate based on total return)
          const portfolio = portfolioId 
            ? portfolios.find(p => p.id === portfolioId)
            : null;
          
          const currentValue = portfolio 
            ? (portfolio.holdings || []).reduce((sum, h) => sum + (h.marketValue || 0), 0) + (portfolio.cashBalance || 0)
            : totalValue;
          
          // Generate simulated historical data
          // In production, this would come from the API
          return generatePerformanceData(currentValue * 0.9, days);
        },

        getBenchmarkData: (symbol, timeRange) => {
          const daysMap = {
            '1D': 1, '1W': 7, '1M': 30, '3M': 90,
            '6M': 180, 'YTD': Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000),
            '1Y': 365, 'ALL': 730
          };
          const days = daysMap[timeRange] || 30;
          
          // Generate benchmark data (SPY simulation)
          return generatePerformanceData(100, days, 0.015);
        },

        getAllocation: (portfolioId, type = 'asset') => {
          const holdings = get().getHoldingsForPortfolio(portfolioId);
          const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
          
          if (totalValue === 0) return [];
          
          // Group by type
          const groupKey = type === 'sector' ? 'sector' : 'assetType';
          const grouped = holdings.reduce((acc, holding) => {
            const key = holding[groupKey] || 'Other';
            if (!acc[key]) {
              acc[key] = { name: key, value: 0, holdings: 0 };
            }
            acc[key].value += holding.marketValue || 0;
            acc[key].holdings += 1;
            return acc;
          }, {});
          
          return Object.values(grouped).map(item => ({
            ...item,
            percent: (item.value / totalValue) * 100
          }));
        },

        // Selection
        setSelectedPortfolio: (portfolioId) => {
          set(state => { state.selectedPortfolioId = portfolioId; });
        },

        // Error handling
        clearError: () => {
          set(state => { state.error = null; });
        },

        // Reset
        reset: () => {
          set(state => {
            state.portfolios = [];
            state.selectedPortfolioId = null;
            state.isLoading = false;
            state.error = null;
            state.lastUpdated = null;
          });
        }
      })),
      {
        name: 'wealthpilot-portfolio-store',
        partialize: (state) => ({
          selectedPortfolioId: state.selectedPortfolioId
        })
      }
    )
  )
);

export { usePortfolioStore };
export default usePortfolioStore;
