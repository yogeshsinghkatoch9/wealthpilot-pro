/**
 * WealthPilot Pro - Market Data Hook
 * Custom hook for fetching market indices and status
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/client';

const MARKET_INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', shortName: 'S&P' },
  { symbol: '^DJI', name: 'Dow Jones', shortName: 'DOW' },
  { symbol: '^IXIC', name: 'NASDAQ', shortName: 'NASDAQ' },
  { symbol: '^RUT', name: 'Russell 2000', shortName: 'RUT' },
  { symbol: '^VIX', name: 'VIX', shortName: 'VIX' }
];

const REFRESH_INTERVAL = 60000; // 1 minute

export const useMarketData = (options = {}) => {
  const { 
    autoRefresh = true,
    refreshInterval = REFRESH_INTERVAL,
    indices = MARKET_INDICES
  } = options;

  const [marketIndices, setMarketIndices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const isMarketOpen = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;
    
    // Market hours: Mon-Fri, 9:30 AM - 4:00 PM ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    // Check if weekend
    if (day === 0 || day === 6) return false;
    
    // Check market hours (assuming local time is ET for simplicity)
    return currentTime >= marketOpen && currentTime < marketClose;
  }, []);

  const getMarketStatus = useMemo(() => {
    if (isMarketOpen) {
      return { status: 'open', label: 'Market Open', color: 'green' };
    }
    
    const now = new Date();
    const hour = now.getHours();
    
    if (hour >= 4 && hour < 9.5) {
      return { status: 'premarket', label: 'Pre-Market', color: 'yellow' };
    }
    if (hour >= 16 && hour < 20) {
      return { status: 'afterhours', label: 'After Hours', color: 'yellow' };
    }
    return { status: 'closed', label: 'Market Closed', color: 'gray' };
  }, [isMarketOpen]);

  const fetchMarketData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch data for all indices
      const responses = await Promise.allSettled(
        indices.map(index => 
          api.get(`/market/quote/${encodeURIComponent(index.symbol)}`)
        )
      );

      const indexData = responses.map((response, i) => {
        const indexInfo = indices[i];
        
        if (response.status === 'fulfilled' && response.value.data) {
          const data = response.value.data;
          return {
            ...indexInfo,
            price: data.price || data.regularMarketPrice || 0,
            change: data.change || data.regularMarketChange || 0,
            changePercent: data.changePercent || data.regularMarketChangePercent || 0,
            previousClose: data.previousClose || 0,
            dayHigh: data.dayHigh || data.regularMarketDayHigh || 0,
            dayLow: data.dayLow || data.regularMarketDayLow || 0,
            volume: data.volume || data.regularMarketVolume || 0,
            isLoaded: true
          };
        }
        
        return {
          ...indexInfo,
          price: 0,
          change: 0,
          changePercent: 0,
          isLoaded: false,
          error: response.reason?.message || 'Failed to load'
        };
      });

      setMarketIndices(indexData);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [indices]);

  // Initial fetch
  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !isMarketOpen) return;

    const intervalId = setInterval(fetchMarketData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, isMarketOpen, refreshInterval, fetchMarketData]);

  // Refresh when market opens
  useEffect(() => {
    const checkMarketOpen = () => {
      if (isMarketOpen) {
        fetchMarketData();
      }
    };

    // Check every minute for market open
    const intervalId = setInterval(checkMarketOpen, 60000);
    return () => clearInterval(intervalId);
  }, [isMarketOpen, fetchMarketData]);

  const getIndexBySymbol = useCallback((symbol) => {
    return marketIndices.find(idx => idx.symbol === symbol);
  }, [marketIndices]);

  const getSP500 = useMemo(() => {
    return marketIndices.find(idx => idx.symbol === '^GSPC') || null;
  }, [marketIndices]);

  const marketSentiment = useMemo(() => {
    const sp500 = getSP500;
    if (!sp500?.isLoaded) return 'neutral';
    
    if (sp500.changePercent > 1) return 'bullish';
    if (sp500.changePercent > 0.3) return 'slightly-bullish';
    if (sp500.changePercent < -1) return 'bearish';
    if (sp500.changePercent < -0.3) return 'slightly-bearish';
    return 'neutral';
  }, [getSP500]);

  return {
    marketIndices,
    isLoading,
    error,
    lastUpdated,
    isMarketOpen,
    marketStatus: getMarketStatus,
    marketSentiment,
    sp500: getSP500,
    getIndexBySymbol,
    refresh: fetchMarketData
  };
};

/**
 * Hook for fetching individual stock quotes
 */
export const useStockQuote = (symbol, options = {}) => {
  const { autoRefresh = false, refreshInterval = 30000 } = options;
  
  const [quote, setQuote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    
    try {
      setIsLoading(true);
      const response = await api.get(`/market/quote/${symbol}`);
      setQuote(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  useEffect(() => {
    if (!autoRefresh || !symbol) return;
    
    const intervalId = setInterval(fetchQuote, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchQuote, symbol]);

  return { quote, isLoading, error, refresh: fetchQuote };
};

/**
 * Hook for batch stock quotes
 */
export const useBatchQuotes = (symbols = [], options = {}) => {
  const { autoRefresh = false, refreshInterval = 60000 } = options;
  
  const [quotes, setQuotes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuotes = useCallback(async () => {
    if (!symbols.length) {
      setQuotes({});
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await api.post('/market/quotes/batch', { symbols });
      
      const quotesMap = {};
      (response.data || []).forEach(quote => {
        quotesMap[quote.symbol] = quote;
      });
      
      setQuotes(quotesMap);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (!autoRefresh || !symbols.length) return;
    
    const intervalId = setInterval(fetchQuotes, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchQuotes, symbols]);

  const getQuote = useCallback((symbol) => quotes[symbol], [quotes]);

  return { quotes, isLoading, error, getQuote, refresh: fetchQuotes };
};

export default useMarketData;
