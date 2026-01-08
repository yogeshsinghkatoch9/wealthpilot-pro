/**
 * WealthPilot Pro - WebSocket Optimizer
 * Provides optimized WebSocket connections with smart reconnection,
 * selective subscriptions, and update batching
 */

class WebSocketOptimizer {
    constructor(options = {}) {
        this.options = {
            url: options.url || this.getDefaultWebSocketUrl(),
            protocols: options.protocols || [],
            reconnectAttempts: options.reconnectAttempts || 10,
            initialReconnectDelay: options.initialReconnectDelay || 1000,
            maxReconnectDelay: options.maxReconnectDelay || 30000,
            reconnectBackoffMultiplier: options.reconnectBackoffMultiplier || 2,
            heartbeatInterval: options.heartbeatInterval || 30000,
            heartbeatTimeout: options.heartbeatTimeout || 10000,
            batchInterval: options.batchInterval || 100,
            maxBatchSize: options.maxBatchSize || 50,
            compressionEnabled: options.compressionEnabled !== false,
            pauseOnHidden: options.pauseOnHidden !== false,
            deltaUpdatesEnabled: options.deltaUpdatesEnabled !== false,
            ...options
        };

        this.ws = null;
        this.state = 'disconnected'; // disconnected, connecting, connected, paused
        this.reconnectAttempt = 0;
        this.reconnectTimeout = null;
        this.heartbeatTimer = null;
        this.heartbeatTimeoutTimer = null;
        this.subscriptions = new Map();
        this.pendingSubscriptions = new Set();
        this.pendingUnsubscriptions = new Set();
        this.updateBatch = [];
        this.batchTimeout = null;
        this.lastData = new Map(); // For delta updates
        this.messageQueue = [];
        this.listeners = new Map();
        this.metrics = {
            messagesReceived: 0,
            messagesSent: 0,
            bytesReceived: 0,
            bytesSent: 0,
            reconnects: 0,
            errors: 0
        };

        // Bind methods
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
    }

    /**
     * Get default WebSocket URL based on current page
     */
    getDefaultWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws`;
    }

    /**
     * Initialize the WebSocket connection
     * @returns {Promise<void>}
     */
    async initConnection() {
        if (this.ws && this.state === 'connected') {
            console.log('[WebSocketOptimizer] Already connected');
            return;
        }

        // Set up event listeners
        this.setupEventListeners();

        // Connect
        return this.connect();
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.state === 'connecting') {
                reject(new Error('Connection already in progress'));
                return;
            }

            this.state = 'connecting';
            console.log('[WebSocketOptimizer] Connecting to:', this.options.url);

            try {
                this.ws = new WebSocket(this.options.url, this.options.protocols);

                // Set up WebSocket event handlers
                this.ws.onopen = (event) => {
                    this.handleOpen(event);
                    resolve();
                };

                this.ws.onclose = (event) => {
                    this.handleClose(event);
                    if (this.state === 'connecting') {
                        reject(new Error('Connection failed'));
                    }
                };

                this.ws.onerror = (event) => {
                    this.handleError(event);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };

            } catch (error) {
                this.state = 'disconnected';
                reject(error);
            }
        });
    }

    /**
     * Handle WebSocket open event
     */
    handleOpen(event) {
        console.log('[WebSocketOptimizer] Connected');
        this.state = 'connected';
        this.reconnectAttempt = 0;

        // Start heartbeat
        this.startHeartbeat();

        // Process any queued messages
        this.processMessageQueue();

        // Resubscribe to symbols
        this.resubscribeAll();

        // Emit event
        this.emit('connected', { event });
    }

    /**
     * Handle WebSocket close event
     */
    handleClose(event) {
        console.log('[WebSocketOptimizer] Connection closed:', event.code, event.reason);

        this.stopHeartbeat();
        this.state = 'disconnected';

        // Emit event
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // Attempt reconnection if not intentional close
        if (event.code !== 1000 && event.code !== 1001) {
            this.scheduleReconnect();
        }
    }

    /**
     * Handle WebSocket error event
     */
    handleError(event) {
        console.error('[WebSocketOptimizer] Error:', event);
        this.metrics.errors++;
        this.emit('error', { event });
    }

    /**
     * Handle incoming WebSocket message
     */
    handleMessage(event) {
        this.metrics.messagesReceived++;
        this.metrics.bytesReceived += event.data?.length || 0;

        let data;
        try {
            data = this.parseMessage(event.data);
        } catch (error) {
            console.error('[WebSocketOptimizer] Failed to parse message:', error);
            return;
        }

        // Handle heartbeat response
        if (data.type === 'pong') {
            this.handlePong();
            return;
        }

        // Handle subscription confirmation
        if (data.type === 'subscribed') {
            this.handleSubscriptionConfirm(data);
            return;
        }

        // Handle unsubscription confirmation
        if (data.type === 'unsubscribed') {
            this.handleUnsubscriptionConfirm(data);
            return;
        }

        // Process data update
        if (this.options.deltaUpdatesEnabled) {
            data = this.processDeltaUpdate(data);
        }

        // Add to batch for processing
        this.addToBatch(data);
    }

    /**
     * Parse incoming message (handles compression)
     */
    parseMessage(rawData) {
        // Handle binary data (compressed)
        if (rawData instanceof ArrayBuffer || rawData instanceof Blob) {
            return this.decompressMessage(rawData);
        }

        // Handle string data
        return JSON.parse(rawData);
    }

    /**
     * Decompress message if compression is enabled
     */
    async decompressMessage(data) {
        if (!this.options.compressionEnabled) {
            return JSON.parse(new TextDecoder().decode(data));
        }

        // Use CompressionStream if available
        if ('DecompressionStream' in window) {
            const blob = data instanceof Blob ? data : new Blob([data]);
            const ds = new DecompressionStream('gzip');
            const stream = blob.stream().pipeThrough(ds);
            const text = await new Response(stream).text();
            return JSON.parse(text);
        }

        // Fallback: assume uncompressed
        const text = data instanceof Blob
            ? await data.text()
            : new TextDecoder().decode(data);
        return JSON.parse(text);
    }

    /**
     * Process delta updates - only receive changes
     */
    processDeltaUpdate(data) {
        if (!data.symbol) return data;

        const key = data.symbol;
        const lastValue = this.lastData.get(key);

        if (!lastValue) {
            this.lastData.set(key, { ...data });
            return data;
        }

        // Merge changes with last known data
        const merged = { ...lastValue, ...data };
        this.lastData.set(key, merged);

        // Mark which fields changed
        merged._changes = Object.keys(data).filter(k => k !== '_changes');

        return merged;
    }

    /**
     * Add message to batch for processing
     */
    addToBatch(data) {
        this.updateBatch.push(data);

        // Process immediately if batch is full
        if (this.updateBatch.length >= this.options.maxBatchSize) {
            this.processBatch();
        } else if (!this.batchTimeout) {
            // Schedule batch processing
            this.batchTimeout = setTimeout(() => {
                this.processBatch();
            }, this.options.batchInterval);
        }
    }

    /**
     * Process batched updates
     */
    processBatch() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        if (this.updateBatch.length === 0) return;

        const batch = this.updateBatch.splice(0);

        // Group updates by symbol
        const grouped = new Map();
        batch.forEach(update => {
            const key = update.symbol || update.type || 'general';
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(update);
        });

        // Emit batched updates
        grouped.forEach((updates, key) => {
            // Use only the latest update for each symbol (if multiple)
            const latestUpdate = updates[updates.length - 1];

            // Emit to specific symbol listeners
            this.emit(`update:${key}`, latestUpdate);

            // Emit to general update listeners
            this.emit('update', { key, data: latestUpdate, batch: updates });
        });

        // Emit batch complete event
        this.emit('batchComplete', { count: batch.length });
    }

    /**
     * Subscribe to symbols for real-time updates
     * @param {string|string[]} symbols - Symbol(s) to subscribe to
     * @returns {Promise<void>}
     */
    subscribeToSymbols(symbols) {
        const symbolList = Array.isArray(symbols) ? symbols : [symbols];

        symbolList.forEach(symbol => {
            if (!this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, { status: 'pending', subscribedAt: null });
                this.pendingSubscriptions.add(symbol);
            }
        });

        return this.sendSubscriptions();
    }

    /**
     * Unsubscribe from symbols
     * @param {string|string[]} symbols - Symbol(s) to unsubscribe from
     * @returns {Promise<void>}
     */
    unsubscribeFromSymbols(symbols) {
        const symbolList = Array.isArray(symbols) ? symbols : [symbols];

        symbolList.forEach(symbol => {
            if (this.subscriptions.has(symbol)) {
                this.subscriptions.delete(symbol);
                this.pendingUnsubscriptions.add(symbol);
                this.lastData.delete(symbol);
            }
        });

        return this.sendUnsubscriptions();
    }

    /**
     * Send pending subscriptions to server
     */
    async sendSubscriptions() {
        if (this.state !== 'connected' || this.pendingSubscriptions.size === 0) {
            return;
        }

        const symbols = Array.from(this.pendingSubscriptions);

        await this.send({
            type: 'subscribe',
            symbols
        });

        console.log('[WebSocketOptimizer] Subscribing to:', symbols);
    }

    /**
     * Send pending unsubscriptions to server
     */
    async sendUnsubscriptions() {
        if (this.state !== 'connected' || this.pendingUnsubscriptions.size === 0) {
            return;
        }

        const symbols = Array.from(this.pendingUnsubscriptions);

        await this.send({
            type: 'unsubscribe',
            symbols
        });

        console.log('[WebSocketOptimizer] Unsubscribing from:', symbols);
    }

    /**
     * Handle subscription confirmation
     */
    handleSubscriptionConfirm(data) {
        const symbols = data.symbols || [data.symbol];

        symbols.forEach(symbol => {
            if (this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, {
                    status: 'active',
                    subscribedAt: Date.now()
                });
            }
            this.pendingSubscriptions.delete(symbol);
        });

        this.emit('subscribed', { symbols });
    }

    /**
     * Handle unsubscription confirmation
     */
    handleUnsubscriptionConfirm(data) {
        const symbols = data.symbols || [data.symbol];

        symbols.forEach(symbol => {
            this.pendingUnsubscriptions.delete(symbol);
        });

        this.emit('unsubscribed', { symbols });
    }

    /**
     * Resubscribe to all active subscriptions
     */
    resubscribeAll() {
        const symbols = Array.from(this.subscriptions.keys());

        if (symbols.length > 0) {
            symbols.forEach(s => this.pendingSubscriptions.add(s));
            this.sendSubscriptions();
        }
    }

    /**
     * Handle page visibility change
     */
    handleVisibilityChange() {
        if (!this.options.pauseOnHidden) return;

        if (document.hidden) {
            this.pause();
        } else {
            this.resume();
        }
    }

    /**
     * Pause the WebSocket connection when tab is hidden
     */
    pause() {
        if (this.state !== 'connected') return;

        console.log('[WebSocketOptimizer] Pausing connection');
        this.state = 'paused';

        // Stop heartbeat
        this.stopHeartbeat();

        // Unsubscribe from updates (but keep track of subscriptions)
        const symbols = Array.from(this.subscriptions.keys());
        if (symbols.length > 0) {
            this.send({
                type: 'pause',
                symbols
            });
        }

        this.emit('paused');
    }

    /**
     * Resume the WebSocket connection when tab becomes visible
     */
    resume() {
        if (this.state === 'disconnected') {
            this.connect();
            return;
        }

        if (this.state !== 'paused') return;

        console.log('[WebSocketOptimizer] Resuming connection');
        this.state = 'connected';

        // Start heartbeat
        this.startHeartbeat();

        // Resubscribe to updates
        const symbols = Array.from(this.subscriptions.keys());
        if (symbols.length > 0) {
            this.send({
                type: 'resume',
                symbols
            });
        }

        this.emit('resumed');
    }

    /**
     * Start heartbeat mechanism
     */
    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            this.sendPing();
        }, this.options.heartbeatInterval);
    }

    /**
     * Stop heartbeat mechanism
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    /**
     * Send ping message
     */
    sendPing() {
        if (this.state !== 'connected') return;

        this.send({ type: 'ping', timestamp: Date.now() });

        // Set timeout for pong response
        this.heartbeatTimeoutTimer = setTimeout(() => {
            console.warn('[WebSocketOptimizer] Heartbeat timeout, reconnecting...');
            this.reconnect();
        }, this.options.heartbeatTimeout);
    }

    /**
     * Handle pong response
     */
    handlePong() {
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempt >= this.options.reconnectAttempts) {
            console.error('[WebSocketOptimizer] Max reconnection attempts reached');
            this.emit('maxReconnectAttempts');
            return;
        }

        const delay = Math.min(
            this.options.initialReconnectDelay * Math.pow(
                this.options.reconnectBackoffMultiplier,
                this.reconnectAttempt
            ),
            this.options.maxReconnectDelay
        );

        // Add jitter to prevent thundering herd
        const jitter = delay * 0.2 * Math.random();
        const actualDelay = delay + jitter;

        console.log(`[WebSocketOptimizer] Reconnecting in ${Math.round(actualDelay)}ms (attempt ${this.reconnectAttempt + 1})`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempt++;
            this.metrics.reconnects++;
            this.connect().catch(() => {
                this.scheduleReconnect();
            });
        }, actualDelay);

        this.emit('reconnecting', {
            attempt: this.reconnectAttempt + 1,
            delay: actualDelay
        });
    }

    /**
     * Force reconnection
     */
    reconnect() {
        this.disconnect();
        this.connect();
    }

    /**
     * Send message over WebSocket
     */
    async send(data) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);

        if (this.state !== 'connected') {
            // Queue message for later
            this.messageQueue.push(message);
            return;
        }

        try {
            // Compress if enabled and supported
            const payload = this.options.compressionEnabled
                ? await this.compressMessage(message)
                : message;

            this.ws.send(payload);
            this.metrics.messagesSent++;
            this.metrics.bytesSent += message.length;
        } catch (error) {
            console.error('[WebSocketOptimizer] Send error:', error);
            this.messageQueue.push(message);
        }
    }

    /**
     * Compress message before sending
     */
    async compressMessage(data) {
        if (!('CompressionStream' in window)) {
            return data;
        }

        try {
            const blob = new Blob([data]);
            const cs = new CompressionStream('gzip');
            const stream = blob.stream().pipeThrough(cs);
            return new Response(stream).arrayBuffer();
        } catch (error) {
            return data;
        }
    }

    /**
     * Process queued messages
     */
    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.state === 'connected') {
            const message = this.messageQueue.shift();
            this.ws.send(message);
            this.metrics.messagesSent++;
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Visibility change
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // Online/offline events
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
    }

    /**
     * Handle online event
     */
    handleOnline() {
        console.log('[WebSocketOptimizer] Network online');
        if (this.state === 'disconnected') {
            this.connect();
        }
    }

    /**
     * Handle offline event
     */
    handleOffline() {
        console.log('[WebSocketOptimizer] Network offline');
        this.emit('offline');
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[WebSocketOptimizer] Error in ${event} handler:`, error);
                }
            });
        }
    }

    /**
     * Get current subscriptions
     */
    getSubscriptions() {
        return Array.from(this.subscriptions.entries()).map(([symbol, info]) => ({
            symbol,
            ...info
        }));
    }

    /**
     * Get connection metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            state: this.state,
            subscriptionCount: this.subscriptions.size,
            queuedMessages: this.messageQueue.length,
            batchedUpdates: this.updateBatch.length
        };
    }

    /**
     * Get delta updates - returns only changed data
     * @param {string} symbol - Symbol to get delta for
     */
    getDeltaUpdates(symbol) {
        return this.lastData.get(symbol);
    }

    /**
     * Clear delta cache
     */
    clearDeltaCache() {
        this.lastData.clear();
    }

    /**
     * Disconnect and clean up
     */
    disconnect() {
        console.log('[WebSocketOptimizer] Disconnecting');

        // Clear timers
        this.stopHeartbeat();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnection
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }

        this.state = 'disconnected';
    }

    /**
     * Destroy instance and clean up
     */
    destroy() {
        this.disconnect();
        this.removeEventListeners();
        this.subscriptions.clear();
        this.pendingSubscriptions.clear();
        this.pendingUnsubscriptions.clear();
        this.lastData.clear();
        this.updateBatch = [];
        this.messageQueue = [];
        this.listeners.clear();
    }
}

// Auto-initialize if not in module context
if (typeof window !== 'undefined') {
    window.WebSocketOptimizer = WebSocketOptimizer;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketOptimizer;
}
