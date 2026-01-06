/**
 * WealthPilot Pro - WebSocket Hook
 * Custom React hook for real-time market data updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_HEARTBEAT_INTERVAL = 30000;

export const useWebSocket = ({ 
  onPriceUpdate, 
  onAlertTriggered,
  onPortfolioUpdate,
  autoConnect = true 
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscribedSymbolsRef = useRef(new Set());

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_WS_URL || window.location.host;
    return `${protocol}//${host}/ws`;
  }, []);

  const startHeartbeat = useCallback(() => {
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, WS_HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      setLastUpdate(new Date().toISOString());

      switch (data.type) {
        case 'price_update':
          if (onPriceUpdate) {
            onPriceUpdate({
              symbol: data.symbol,
              price: data.price,
              change: data.change,
              changePercent: data.changePercent,
              volume: data.volume,
              timestamp: data.timestamp
            });
          }
          break;

        case 'alert_triggered':
          if (onAlertTriggered) {
            onAlertTriggered({
              alertId: data.alertId,
              symbol: data.symbol,
              condition: data.condition,
              threshold: data.threshold,
              currentPrice: data.currentPrice,
              message: data.message
            });
          }
          break;

        case 'portfolio_update':
          if (onPortfolioUpdate) {
            onPortfolioUpdate({
              portfolioId: data.portfolioId,
              totalValue: data.totalValue,
              dayChange: data.dayChange
            });
          }
          break;

        case 'pong':
          // Heartbeat response - connection is alive
          break;

        case 'subscribed':
          console.log(`Subscribed to: ${data.symbols?.join(', ')}`);
          break;

        case 'error':
          console.error('WebSocket error:', data.message);
          setError(data.message);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }, [onPriceUpdate, onAlertTriggered, onPortfolioUpdate]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const url = getWebSocketUrl();
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        setReconnectAttempts(0);
        startHeartbeat();

        // Re-subscribe to previously subscribed symbols
        if (subscribedSymbolsRef.current.size > 0) {
          wsRef.current.send(JSON.stringify({
            type: 'subscribe',
            symbols: Array.from(subscribedSymbolsRef.current)
          }));
        }

        // Get auth token and authenticate
        const token = localStorage.getItem('token');
        if (token) {
          wsRef.current.send(JSON.stringify({
            type: 'authenticate',
            token
          }));
        }
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        stopHeartbeat();

        // Attempt reconnection
        if (reconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS && autoConnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, WS_RECONNECT_DELAY * (reconnectAttempts + 1));
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError(err.message);
    }
  }, [getWebSocketUrl, handleMessage, startHeartbeat, stopHeartbeat, reconnectAttempts, autoConnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    stopHeartbeat();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, [stopHeartbeat]);

  const subscribe = useCallback((symbols) => {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    
    symbolArray.forEach(s => subscribedSymbolsRef.current.add(s.toUpperCase()));
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        symbols: symbolArray
      }));
    }
  }, []);

  const unsubscribe = useCallback((symbols) => {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    
    symbolArray.forEach(s => subscribedSymbolsRef.current.delete(s.toUpperCase()));
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        symbols: symbolArray
      }));
    }
  }, []);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Reconnect when window regains focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnected && autoConnect) {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, autoConnect, connect]);

  return {
    isConnected,
    lastUpdate,
    error,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    send
  };
};

export default useWebSocket;
