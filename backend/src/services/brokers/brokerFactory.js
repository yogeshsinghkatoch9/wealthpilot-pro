/**
 * Broker Factory
 * Unified interface for multiple brokerage integrations
 * Supports: Alpaca, Interactive Brokers, TD Ameritrade (via Schwab), Robinhood (future)
 */

const logger = require('../../utils/logger');
const IBKRBrokerImpl = require('./ibkrBroker');

// Broker interface - all brokers must implement these methods
class BrokerInterface {
  constructor(credentials) {
    this.credentials = credentials;
    this.connected = false;
  }

  // Account methods
  async connect() { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }
  async getAccount() { throw new Error('Not implemented'); }
  async getPositions() { throw new Error('Not implemented'); }
  async getOrders(status) { throw new Error('Not implemented'); }

  // Trading methods
  async placeOrder(order) { throw new Error('Not implemented'); }
  async cancelOrder(orderId) { throw new Error('Not implemented'); }
  async modifyOrder(orderId, changes) { throw new Error('Not implemented'); }

  // Market data methods
  async getQuote(symbol) { throw new Error('Not implemented'); }
  async getQuotes(symbols) { throw new Error('Not implemented'); }
  async getBars(symbol, timeframe, limit) { throw new Error('Not implemented'); }

  // Streaming (optional)
  subscribeQuotes(symbols, callback) { throw new Error('Not implemented'); }
  unsubscribeQuotes(symbols) { throw new Error('Not implemented'); }
}

/**
 * Alpaca Broker Implementation
 */
class AlpacaBroker extends BrokerInterface {
  constructor(credentials) {
    super(credentials);
    this.baseUrl = credentials.paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    this.dataUrl = 'https://data.alpaca.markets';
  }

  async connect() {
    try {
      const response = await this.request('/v2/account');
      this.connected = true;
      logger.info('Connected to Alpaca');
      return response;
    } catch (error) {
      logger.error('Alpaca connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    this.connected = false;
  }

  async getAccount() {
    return this.request('/v2/account');
  }

  async getPositions() {
    const positions = await this.request('/v2/positions');
    return positions.map(p => ({
      symbol: p.symbol,
      quantity: parseFloat(p.qty),
      avgCost: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPnl: parseFloat(p.unrealized_pl),
      unrealizedPnlPct: parseFloat(p.unrealized_plpc) * 100,
      side: p.side
    }));
  }

  async getOrders(status = 'all') {
    const orders = await this.request(`/v2/orders?status=${status}`);
    return orders.map(o => this.formatOrder(o));
  }

  async placeOrder(order) {
    const alpacaOrder = {
      symbol: order.symbol,
      qty: order.quantity,
      side: order.side,
      type: order.orderType || 'market',
      time_in_force: order.timeInForce || 'day'
    };

    if (order.limitPrice) alpacaOrder.limit_price = order.limitPrice;
    if (order.stopPrice) alpacaOrder.stop_price = order.stopPrice;

    const response = await this.request('/v2/orders', 'POST', alpacaOrder);
    return this.formatOrder(response);
  }

  async cancelOrder(orderId) {
    await this.request(`/v2/orders/${orderId}`, 'DELETE');
    return { success: true, orderId };
  }

  async getQuote(symbol) {
    const response = await this.dataRequest(`/v2/stocks/${symbol}/quotes/latest`);
    return {
      symbol,
      price: parseFloat(response.quote.ap),
      bid: parseFloat(response.quote.bp),
      ask: parseFloat(response.quote.ap),
      bidSize: response.quote.bs,
      askSize: response.quote.as,
      timestamp: response.quote.t
    };
  }

  async getBars(symbol, timeframe = '1Day', limit = 100) {
    const response = await this.dataRequest(
      `/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}`
    );
    return response.bars.map(b => ({
      timestamp: b.t,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v
    }));
  }

  formatOrder(o) {
    return {
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      quantity: parseFloat(o.qty),
      filledQuantity: parseFloat(o.filled_qty || 0),
      orderType: o.type,
      limitPrice: o.limit_price ? parseFloat(o.limit_price) : null,
      stopPrice: o.stop_price ? parseFloat(o.stop_price) : null,
      status: o.status,
      createdAt: o.created_at,
      filledAt: o.filled_at,
      filledPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null
    };
  }

  async request(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'APCA-API-KEY-ID': this.credentials.apiKey,
        'APCA-API-SECRET-KEY': this.credentials.secretKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Alpaca API error: ${response.status}`);
    }
    return response.json();
  }

  async dataRequest(endpoint) {
    const response = await fetch(`${this.dataUrl}${endpoint}`, {
      headers: {
        'APCA-API-KEY-ID': this.credentials.apiKey,
        'APCA-API-SECRET-KEY': this.credentials.secretKey
      }
    });
    if (!response.ok) throw new Error(`Alpaca data error: ${response.status}`);
    return response.json();
  }
}

/**
 * Interactive Brokers Implementation
 * Full implementation using Client Portal API
 * Wraps IBKRBrokerImpl to conform to BrokerInterface
 */
class IBKRBroker extends BrokerInterface {
  constructor(credentials) {
    super(credentials);
    this.impl = new IBKRBrokerImpl(credentials);
  }

  async connect() {
    const result = await this.impl.connect();
    this.connected = this.impl.connected;
    return result;
  }

  async disconnect() {
    await this.impl.disconnect();
    this.connected = false;
  }

  async getAccount() {
    return this.impl.getAccount();
  }

  async getPositions() {
    return this.impl.getPositions();
  }

  async getOrders(status = 'all') {
    return this.impl.getOrders(status);
  }

  async placeOrder(order) {
    return this.impl.placeOrder(order);
  }

  async cancelOrder(orderId) {
    return this.impl.cancelOrder(orderId);
  }

  async modifyOrder(orderId, changes) {
    return this.impl.modifyOrder(orderId, changes);
  }

  async getQuote(symbol) {
    return this.impl.getQuote(symbol);
  }

  async getQuotes(symbols) {
    return this.impl.getQuotes(symbols);
  }

  async getBars(symbol, timeframe = '1Day', limit = 100) {
    return this.impl.getBars(symbol, timeframe, limit);
  }

  subscribeQuotes(symbols, callback) {
    return this.impl.subscribeQuotes(symbols, callback);
  }

  // IBKR-specific methods
  async searchContract(symbol, secType = 'STK') {
    return this.impl.searchContract(symbol, secType);
  }

  async previewOrder(order) {
    return this.impl.previewOrder(order);
  }

  async getAccounts() {
    return this.impl.getAccounts();
  }
}

/**
 * Broker Factory - Creates broker instances
 */
class BrokerFactory {
  static SUPPORTED_BROKERS = {
    alpaca: { name: 'Alpaca', class: AlpacaBroker, oauth: false },
    ibkr: { name: 'Interactive Brokers', class: IBKRBroker, oauth: false },
    // Future implementations:
    // td_ameritrade: { name: 'TD Ameritrade', class: TDAmeritradeBroker, oauth: true },
    // robinhood: { name: 'Robinhood', class: RobinhoodBroker, oauth: true },
    // schwab: { name: 'Charles Schwab', class: SchwabBroker, oauth: true },
  };

  static create(brokerType, credentials) {
    const broker = this.SUPPORTED_BROKERS[brokerType.toLowerCase()];

    if (!broker) {
      throw new Error(`Unsupported broker: ${brokerType}. Supported: ${Object.keys(this.SUPPORTED_BROKERS).join(', ')}`);
    }

    return new broker.class(credentials);
  }

  static getSupportedBrokers() {
    return Object.entries(this.SUPPORTED_BROKERS).map(([key, value]) => ({
      id: key,
      name: value.name,
      requiresOAuth: value.oauth
    }));
  }
}

module.exports = {
  BrokerFactory,
  BrokerInterface,
  AlpacaBroker,
  IBKRBroker
};
