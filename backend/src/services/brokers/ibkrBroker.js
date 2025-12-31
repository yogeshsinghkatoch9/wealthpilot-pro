/**
 * Interactive Brokers (IBKR) Full Implementation
 *
 * Uses the Client Portal API (REST) for:
 * - Account management
 * - Order placement and management
 * - Real-time market data
 * - Position tracking
 *
 * Requires: IBKR Client Portal Gateway running
 * Default: https://localhost:5000 (or custom gateway URL)
 *
 * Authentication: OAuth or session-based via gateway
 */

const https = require('https');
const logger = require('../../utils/logger');

// IBKR Contract Types
const CONTRACT_TYPES = {
  STK: 'Stock',
  OPT: 'Option',
  FUT: 'Future',
  CASH: 'Forex',
  BOND: 'Bond',
  CFD: 'CFD',
  WAR: 'Warrant'
};

// IBKR Order Types
const ORDER_TYPES = {
  MKT: 'Market',
  LMT: 'Limit',
  STP: 'Stop',
  STP_LMT: 'Stop Limit',
  MIT: 'Market If Touched',
  LIT: 'Limit If Touched',
  TRAIL: 'Trailing Stop',
  TRAIL_LMT: 'Trailing Stop Limit',
  MOC: 'Market On Close',
  LOC: 'Limit On Close'
};

// Time in Force options
const TIME_IN_FORCE = {
  DAY: 'Day',
  GTC: 'Good Till Cancelled',
  IOC: 'Immediate Or Cancel',
  FOK: 'Fill Or Kill',
  OPG: 'At The Open',
  DTC: 'Day Till Cancelled'
};

/**
 * Interactive Brokers Client Portal API Broker
 */
class IBKRBroker {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.gatewayUrl || 'https://localhost:5000/v1/api';
    this.connected = false;
    this.accountId = credentials.accountId || null;
    this.sessionActive = false;
    this.lastHeartbeat = null;

    // SSL settings for self-signed cert (gateway uses self-signed)
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false // Gateway uses self-signed cert
    });
  }

  /**
   * Connect and authenticate with IBKR gateway
   */
  async connect() {
    try {
      // Check gateway status
      const status = await this.request('/iserver/auth/status');

      if (!status.authenticated) {
        // Need to authenticate via gateway UI first
        throw new Error(
          'IBKR Gateway not authenticated. Please log in via the gateway UI at ' +
          `${this.baseUrl.replace('/v1/api', '')}`
        );
      }

      // Get accounts
      const accounts = await this.getAccounts();
      if (accounts.length > 0) {
        this.accountId = this.credentials.accountId || accounts[0].accountId;
      }

      // Initialize brokerage session
      await this.request('/iserver/auth/ssodh/init', 'POST', {
        publish: true,
        compete: true
      });

      this.connected = true;
      this.sessionActive = true;
      this.lastHeartbeat = Date.now();

      // Start heartbeat to keep session alive
      this.startHeartbeat();

      logger.info(`Connected to IBKR. Account: ${this.accountId}`);

      return {
        success: true,
        accountId: this.accountId,
        authenticated: true
      };
    } catch (error) {
      logger.error('IBKR connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from IBKR
   */
  async disconnect() {
    this.stopHeartbeat();
    this.connected = false;
    this.sessionActive = false;
    logger.info('Disconnected from IBKR');
  }

  /**
   * Start session heartbeat (keeps session alive)
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.request('/tickle', 'POST');
        this.lastHeartbeat = Date.now();
      } catch (error) {
        logger.warn('IBKR heartbeat failed:', error.message);
      }
    }, 60000); // Every minute
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ==================== ACCOUNT METHODS ====================

  /**
   * Get all linked accounts
   */
  async getAccounts() {
    const response = await this.request('/portfolio/accounts');
    return response.map(acc => ({
      accountId: acc.accountId,
      accountAlias: acc.accountAlias,
      accountType: acc.type,
      currency: acc.currency,
      parent: acc.parent,
      desc: acc.desc
    }));
  }

  /**
   * Get account summary
   */
  async getAccount() {
    const summary = await this.request(`/portfolio/${this.accountId}/summary`);

    return {
      accountId: this.accountId,
      currency: summary.baseCurrency?.value || 'USD',
      buyingPower: summary.buyingpower?.amount || 0,
      cash: summary.totalcashvalue?.amount || 0,
      portfolioValue: summary.netliquidation?.amount || 0,
      equity: summary.equitywithloanvalue?.amount || 0,
      dayTradesRemaining: summary.daytradesremaining?.value || null,
      maintenanceMargin: summary.maintmarginreq?.amount || 0,
      availableFunds: summary.availablefunds?.amount || 0,
      excessLiquidity: summary.excessliquidity?.amount || 0,
      sma: summary.sma?.amount || 0,
      dayPnl: summary.pnl?.value?.amount || 0,
      unrealizedPnl: summary.unrealizedpnl?.amount || 0
    };
  }

  /**
   * Get account positions
   */
  async getPositions() {
    // First page
    let allPositions = [];
    let page = 0;

    while (true) {
      const response = await this.request(
        `/portfolio/${this.accountId}/positions/${page}`
      );

      if (!response || response.length === 0) break;

      allPositions = allPositions.concat(response);
      page++;

      // Safety limit
      if (page > 10) break;
    }

    return allPositions.map(pos => ({
      symbol: pos.contractDesc || pos.ticker,
      conid: pos.conid,
      quantity: pos.position,
      avgCost: pos.avgCost,
      currentPrice: pos.mktPrice,
      marketValue: pos.mktValue,
      unrealizedPnl: pos.unrealizedPnl,
      unrealizedPnlPct: pos.unrealizedPnlPercent,
      realizedPnl: pos.realizedPnl,
      currency: pos.currency,
      assetClass: pos.assetClass,
      exchange: pos.listingExchange,
      sector: pos.sector,
      group: pos.group
    }));
  }

  /**
   * Get orders with optional status filter
   */
  async getOrders(status = 'all') {
    // Force orders refresh
    await this.request('/iserver/account/orders', 'GET', null, { force: true });

    const response = await this.request('/iserver/account/orders');
    let orders = response.orders || [];

    // Filter by status if specified
    if (status !== 'all') {
      const statusMap = {
        'open': ['Submitted', 'PreSubmitted', 'PendingSubmit'],
        'filled': ['Filled'],
        'cancelled': ['Cancelled', 'Inactive'],
        'pending': ['PendingSubmit', 'PendingCancel']
      };

      const statuses = statusMap[status.toLowerCase()] || [];
      if (statuses.length > 0) {
        orders = orders.filter(o => statuses.includes(o.status));
      }
    }

    return orders.map(o => this.formatOrder(o));
  }

  // ==================== TRADING METHODS ====================

  /**
   * Search for contract by symbol
   */
  async searchContract(symbol, secType = 'STK') {
    const response = await this.request('/iserver/secdef/search', 'POST', {
      symbol: symbol.toUpperCase(),
      secType
    });

    if (!response || response.length === 0) {
      throw new Error(`Contract not found: ${symbol}`);
    }

    return response.map(contract => ({
      conid: contract.conid,
      symbol: contract.symbol,
      companyHeader: contract.companyHeader,
      companyName: contract.companyName,
      secType: contract.secType,
      exchange: contract.listingExchange,
      sections: contract.sections
    }));
  }

  /**
   * Get contract details by conid
   */
  async getContractDetails(conid) {
    const response = await this.request(`/iserver/contract/${conid}/info`);
    return {
      conid: response.con_id,
      symbol: response.symbol,
      companyName: response.company_name,
      exchange: response.exchange,
      secType: response.instrument_type,
      currency: response.currency,
      validExchanges: response.valid_exchanges,
      rules: response.rules
    };
  }

  /**
   * Place an order
   */
  async placeOrder(order) {
    // Get conid if not provided
    let conid = order.conid;
    if (!conid) {
      const contracts = await this.searchContract(order.symbol);
      conid = contracts[0].conid;
    }

    // Build IBKR order format
    const ibkrOrder = {
      acctId: this.accountId,
      conid: conid,
      secType: order.secType || 'STK',
      orderType: this.mapOrderType(order.orderType || 'market'),
      side: order.side.toUpperCase(),
      quantity: order.quantity,
      tif: this.mapTimeInForce(order.timeInForce || 'day'),
      outsideRTH: order.outsideRTH || false
    };

    // Add price fields based on order type
    if (order.limitPrice) ibkrOrder.price = order.limitPrice;
    if (order.stopPrice) ibkrOrder.auxPrice = order.stopPrice;

    // Submit order (may require confirmation)
    let response = await this.request(
      `/iserver/account/${this.accountId}/orders`,
      'POST',
      { orders: [ibkrOrder] }
    );

    // Handle order confirmations
    if (response && response[0]?.id) {
      // Order needs confirmation
      const confirmId = response[0].id;
      response = await this.request(
        `/iserver/reply/${confirmId}`,
        'POST',
        { confirmed: true }
      );
    }

    // Return formatted order
    if (response && response[0]?.order_id) {
      return {
        success: true,
        orderId: response[0].order_id,
        status: response[0].order_status || 'Submitted',
        message: response[0].text || 'Order placed'
      };
    }

    // Handle error response
    if (response?.error) {
      throw new Error(response.error);
    }

    return {
      success: true,
      response
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    const response = await this.request(
      `/iserver/account/${this.accountId}/order/${orderId}`,
      'DELETE'
    );

    return {
      success: !response.error,
      orderId,
      message: response.msg || response.error || 'Cancel requested'
    };
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(orderId, changes) {
    const modification = {
      acctId: this.accountId,
      orderId
    };

    if (changes.quantity) modification.quantity = changes.quantity;
    if (changes.limitPrice) modification.price = changes.limitPrice;
    if (changes.stopPrice) modification.auxPrice = changes.stopPrice;
    if (changes.orderType) modification.orderType = this.mapOrderType(changes.orderType);
    if (changes.timeInForce) modification.tif = this.mapTimeInForce(changes.timeInForce);

    let response = await this.request(
      `/iserver/account/${this.accountId}/order/${orderId}`,
      'POST',
      modification
    );

    // Handle confirmation
    if (response && response[0]?.id) {
      response = await this.request(
        `/iserver/reply/${response[0].id}`,
        'POST',
        { confirmed: true }
      );
    }

    return {
      success: !response?.error,
      orderId,
      message: response?.msg || 'Order modified'
    };
  }

  /**
   * Preview order (get estimated cost, margin impact)
   */
  async previewOrder(order) {
    let conid = order.conid;
    if (!conid) {
      const contracts = await this.searchContract(order.symbol);
      conid = contracts[0].conid;
    }

    const ibkrOrder = {
      acctId: this.accountId,
      conid: conid,
      orderType: this.mapOrderType(order.orderType || 'market'),
      side: order.side.toUpperCase(),
      quantity: order.quantity,
      tif: this.mapTimeInForce(order.timeInForce || 'day')
    };

    if (order.limitPrice) ibkrOrder.price = order.limitPrice;

    const response = await this.request(
      `/iserver/account/${this.accountId}/orders/whatif`,
      'POST',
      { orders: [ibkrOrder] }
    );

    if (response?.error) {
      throw new Error(response.error);
    }

    return {
      equity: response.equity,
      marginChange: response.initial?.margin || 0,
      commission: response.amount?.commission || 0,
      projectedMidPrice: response.amount?.amount || 0,
      warning: response.warn || null
    };
  }

  // ==================== MARKET DATA ====================

  /**
   * Get quote snapshot for a symbol
   */
  async getQuote(symbol) {
    // Get conid
    const contracts = await this.searchContract(symbol);
    const conid = contracts[0].conid;

    // Request snapshot
    const response = await this.request(
      `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,85,86,87,88,7295,7296`
    );

    const quote = response[0] || {};

    return {
      symbol,
      conid,
      price: quote['31'] || null, // Last price
      bid: quote['84'] || null,
      ask: quote['86'] || null,
      bidSize: quote['88'] || null,
      askSize: quote['85'] || null,
      volume: quote['87'] || null,
      open: quote['7295'] || null,
      close: quote['7296'] || null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get quotes for multiple symbols
   */
  async getQuotes(symbols) {
    // Get conids for all symbols
    const conidPromises = symbols.map(s => this.searchContract(s));
    const contractResults = await Promise.all(conidPromises);
    const conids = contractResults.map(c => c[0].conid);

    // Request snapshots
    const response = await this.request(
      `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=31,84,86`
    );

    const quotes = {};
    response.forEach((quote, index) => {
      quotes[symbols[index]] = {
        symbol: symbols[index],
        conid: conids[index],
        price: quote['31'] || null,
        bid: quote['84'] || null,
        ask: quote['86'] || null
      };
    });

    return quotes;
  }

  /**
   * Get historical bars
   */
  async getBars(symbol, timeframe = '1d', limit = 100) {
    const contracts = await this.searchContract(symbol);
    const conid = contracts[0].conid;

    // Map timeframe to IBKR format
    const periodMap = {
      '1m': { period: '1d', bar: '1min' },
      '5m': { period: '1w', bar: '5min' },
      '15m': { period: '1w', bar: '15min' },
      '1h': { period: '1m', bar: '1h' },
      '1d': { period: '1y', bar: '1d' },
      '1w': { period: '5y', bar: '1w' }
    };

    const params = periodMap[timeframe] || periodMap['1d'];

    const response = await this.request(
      `/iserver/marketdata/history?conid=${conid}&period=${params.period}&bar=${params.bar}`
    );

    return (response.data || []).slice(-limit).map(bar => ({
      timestamp: new Date(bar.t).toISOString(),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }

  // ==================== STREAMING (WebSocket) ====================

  /**
   * Subscribe to real-time quotes (requires WebSocket)
   */
  async subscribeQuotes(symbols, callback) {
    // Note: Full WebSocket implementation would require separate WS connection
    // For now, implement polling-based updates
    const pollInterval = setInterval(async () => {
      try {
        const quotes = await this.getQuotes(symbols);
        callback(null, quotes);
      } catch (error) {
        callback(error, null);
      }
    }, 1000);

    // Return unsubscribe function
    return () => clearInterval(pollInterval);
  }

  // ==================== HELPER METHODS ====================

  /**
   * Map standard order type to IBKR format
   */
  mapOrderType(type) {
    const map = {
      'market': 'MKT',
      'limit': 'LMT',
      'stop': 'STP',
      'stop_limit': 'STP_LMT',
      'trailing_stop': 'TRAIL',
      'market_on_close': 'MOC',
      'limit_on_close': 'LOC'
    };
    return map[type.toLowerCase()] || type.toUpperCase();
  }

  /**
   * Map standard time in force to IBKR format
   */
  mapTimeInForce(tif) {
    const map = {
      'day': 'DAY',
      'gtc': 'GTC',
      'ioc': 'IOC',
      'fok': 'FOK',
      'opg': 'OPG'
    };
    return map[tif.toLowerCase()] || tif.toUpperCase();
  }

  /**
   * Format IBKR order to standard format
   */
  formatOrder(o) {
    return {
      id: o.orderId || o.order_id,
      symbol: o.ticker || o.symbol,
      conid: o.conid,
      side: o.side,
      quantity: o.totalSize || o.quantity,
      filledQuantity: o.filledQuantity || 0,
      remainingQuantity: o.remainingQuantity || (o.totalSize - (o.filledQuantity || 0)),
      orderType: o.orderType,
      limitPrice: o.price || null,
      stopPrice: o.auxPrice || null,
      status: o.status || o.order_status,
      timeInForce: o.tif,
      createdAt: o.lastExecutionTime_r ? new Date(o.lastExecutionTime_r).toISOString() : null,
      filledPrice: o.avgPrice || null,
      account: o.acct || o.accountId,
      exchange: o.exchange,
      description: o.companyName || o.description
    };
  }

  /**
   * Make HTTP request to IBKR gateway
   */
  async request(endpoint, method = 'GET', body = null, queryParams = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      agent: this.httpsAgent
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url.toString(), options);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`IBKR API error: ${response.status} ${response.statusText}`);
        }
        return { success: true };
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `IBKR API error: ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('IBKR Gateway not running. Please start the Client Portal Gateway.');
      }
      throw error;
    }
  }
}

// Export constants for external use
IBKRBroker.CONTRACT_TYPES = CONTRACT_TYPES;
IBKRBroker.ORDER_TYPES = ORDER_TYPES;
IBKRBroker.TIME_IN_FORCE = TIME_IN_FORCE;

module.exports = IBKRBroker;
