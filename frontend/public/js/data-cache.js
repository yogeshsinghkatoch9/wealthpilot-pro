/**
 * WealthPilot Pro - Data Cache
 * IndexedDB-based caching system with TTL management
 * Provides persistent client-side caching for market data, portfolios, and preferences
 */

class DataCache {
    constructor(options = {}) {
        this.options = {
            dbName: options.dbName || 'WealthPilotCache',
            dbVersion: options.dbVersion || 1,
            defaultTTL: options.defaultTTL || 300000, // 5 minutes
            maxStorageQuota: options.maxStorageQuota || 50 * 1024 * 1024, // 50MB
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            stores: {
                quotes: { keyPath: 'key', ttl: 30000 }, // 30 seconds for real-time quotes
                portfolios: { keyPath: 'key', ttl: 300000 }, // 5 minutes
                userPreferences: { keyPath: 'key', ttl: 86400000 }, // 24 hours
                marketData: { keyPath: 'key', ttl: 60000 }, // 1 minute
                historical: { keyPath: 'key', ttl: 3600000 }, // 1 hour
                general: { keyPath: 'key', ttl: 300000 } // 5 minutes (default)
            },
            ...options
        };

        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.cleanupTimer = null;
        this.pendingWrites = new Map();

        // Bind methods
        this.handleStorageQuota = this.handleStorageQuota.bind(this);
    }

    /**
     * Initialize the IndexedDB database
     * @returns {Promise<DataCache>}
     */
    async init() {
        if (this.isInitialized) return this;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn('[DataCache] IndexedDB not supported, using fallback memory cache');
                this.useFallbackCache();
                resolve(this);
                return;
            }

            const request = indexedDB.open(this.options.dbName, this.options.dbVersion);

            request.onerror = (event) => {
                console.error('[DataCache] Failed to open database:', event.target.error);
                this.useFallbackCache();
                resolve(this); // Resolve anyway with fallback
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                this.startCleanupTimer();
                console.log('[DataCache] Database initialized successfully');
                resolve(this);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };

            request.onblocked = () => {
                console.warn('[DataCache] Database upgrade blocked by another connection');
            };
        });

        return this.initPromise;
    }

    /**
     * Create object stores in the database
     */
    createStores(db) {
        // Create a store for each type
        Object.keys(this.options.stores).forEach(storeName => {
            if (!db.objectStoreNames.contains(storeName)) {
                const store = db.createObjectStore(storeName, {
                    keyPath: this.options.stores[storeName].keyPath
                });
                store.createIndex('expires', 'expires', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        });

        // Create metadata store
        if (!db.objectStoreNames.contains('_metadata')) {
            db.createObjectStore('_metadata', { keyPath: 'key' });
        }
    }

    /**
     * Use fallback in-memory cache when IndexedDB is unavailable
     */
    useFallbackCache() {
        this.fallbackCache = new Map();
        this.isInitialized = true;
        this.isFallback = true;
    }

    /**
     * Store a value with expiration
     * @param {string} key - Cache key
     * @param {*} value - Value to store
     * @param {number} ttl - Time to live in milliseconds
     * @param {string} storeName - Store name (optional)
     * @returns {Promise<boolean>}
     */
    async set(key, value, ttl = null, storeName = 'general') {
        await this.ensureInitialized();

        const store = this.options.stores[storeName] || this.options.stores.general;
        const actualTTL = ttl || store.ttl || this.options.defaultTTL;
        const now = Date.now();

        const record = {
            key,
            value,
            expires: now + actualTTL,
            createdAt: now,
            ttl: actualTTL
        };

        // Use fallback cache if IndexedDB unavailable
        if (this.isFallback) {
            this.fallbackCache.set(`${storeName}:${key}`, record);
            return true;
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.put(record);

                request.onsuccess = () => resolve(true);
                request.onerror = (event) => {
                    console.error('[DataCache] Set error:', event.target.error);
                    // Handle quota exceeded
                    if (event.target.error.name === 'QuotaExceededError') {
                        this.handleStorageQuota();
                    }
                    resolve(false);
                };
            } catch (error) {
                console.error('[DataCache] Set transaction error:', error);
                resolve(false);
            }
        });
    }

    /**
     * Retrieve a value if not expired
     * @param {string} key - Cache key
     * @param {string} storeName - Store name (optional)
     * @returns {Promise<*|null>}
     */
    async get(key, storeName = 'general') {
        await this.ensureInitialized();

        // Use fallback cache if IndexedDB unavailable
        if (this.isFallback) {
            const record = this.fallbackCache.get(`${storeName}:${key}`);
            if (record && record.expires > Date.now()) {
                return record.value;
            }
            this.fallbackCache.delete(`${storeName}:${key}`);
            return null;
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.get(key);

                request.onsuccess = (event) => {
                    const record = event.target.result;
                    if (record && record.expires > Date.now()) {
                        resolve(record.value);
                    } else {
                        // Delete expired record
                        if (record) {
                            this.delete(key, storeName);
                        }
                        resolve(null);
                    }
                };

                request.onerror = (event) => {
                    console.error('[DataCache] Get error:', event.target.error);
                    resolve(null);
                };
            } catch (error) {
                console.error('[DataCache] Get transaction error:', error);
                resolve(null);
            }
        });
    }

    /**
     * Delete a cache entry
     * @param {string} key - Cache key
     * @param {string} storeName - Store name
     * @returns {Promise<boolean>}
     */
    async delete(key, storeName = 'general') {
        await this.ensureInitialized();

        if (this.isFallback) {
            this.fallbackCache.delete(`${storeName}:${key}`);
            return true;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.delete(key);

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Invalidate cache entries matching a pattern
     * @param {string|RegExp} pattern - Pattern to match keys
     * @param {string} storeName - Store name (optional, clears from all if not specified)
     * @returns {Promise<number>} - Number of entries invalidated
     */
    async invalidate(pattern, storeName = null) {
        await this.ensureInitialized();

        const stores = storeName ? [storeName] : Object.keys(this.options.stores);
        let totalInvalidated = 0;

        if (this.isFallback) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            this.fallbackCache.forEach((value, key) => {
                if (regex.test(key)) {
                    this.fallbackCache.delete(key);
                    totalInvalidated++;
                }
            });
            return totalInvalidated;
        }

        for (const store of stores) {
            const count = await this.invalidateInStore(pattern, store);
            totalInvalidated += count;
        }

        return totalInvalidated;
    }

    /**
     * Invalidate entries in a specific store
     */
    async invalidateInStore(pattern, storeName) {
        return new Promise((resolve) => {
            try {
                const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.openCursor();
                let count = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (regex.test(cursor.key)) {
                            cursor.delete();
                            count++;
                        }
                        cursor.continue();
                    } else {
                        resolve(count);
                    }
                };

                request.onerror = () => resolve(0);
            } catch (error) {
                resolve(0);
            }
        });
    }

    /**
     * Cache-first pattern: Get from cache or fetch
     * @param {string} key - Cache key
     * @param {Function} fetchFn - Function to fetch data if not cached
     * @param {number} ttl - Time to live in milliseconds
     * @param {string} storeName - Store name
     * @returns {Promise<*>}
     */
    async getOrFetch(key, fetchFn, ttl = null, storeName = 'general') {
        // Check cache first
        const cached = await this.get(key, storeName);
        if (cached !== null) {
            return cached;
        }

        // Deduplicate concurrent requests for the same key
        const pendingKey = `${storeName}:${key}`;
        if (this.pendingWrites.has(pendingKey)) {
            return this.pendingWrites.get(pendingKey);
        }

        // Fetch and cache
        const fetchPromise = (async () => {
            try {
                const data = await fetchFn();
                await this.set(key, data, ttl, storeName);
                return data;
            } finally {
                this.pendingWrites.delete(pendingKey);
            }
        })();

        this.pendingWrites.set(pendingKey, fetchPromise);
        return fetchPromise;
    }

    /**
     * Store stock quote with short TTL
     * @param {string} symbol - Stock symbol
     * @param {Object} quote - Quote data
     */
    async setQuote(symbol, quote) {
        return this.set(symbol, quote, null, 'quotes');
    }

    /**
     * Get stock quote from cache
     * @param {string} symbol - Stock symbol
     */
    async getQuote(symbol) {
        return this.get(symbol, 'quotes');
    }

    /**
     * Store portfolio data
     * @param {string} portfolioId - Portfolio ID
     * @param {Object} data - Portfolio data
     */
    async setPortfolio(portfolioId, data) {
        return this.set(portfolioId, data, null, 'portfolios');
    }

    /**
     * Get portfolio from cache
     * @param {string} portfolioId - Portfolio ID
     */
    async getPortfolio(portfolioId) {
        return this.get(portfolioId, 'portfolios');
    }

    /**
     * Store user preference
     * @param {string} key - Preference key
     * @param {*} value - Preference value
     */
    async setPreference(key, value) {
        return this.set(key, value, null, 'userPreferences');
    }

    /**
     * Get user preference from cache
     * @param {string} key - Preference key
     */
    async getPreference(key) {
        return this.get(key, 'userPreferences');
    }

    /**
     * Store market data
     * @param {string} key - Data key
     * @param {*} data - Market data
     */
    async setMarketData(key, data) {
        return this.set(key, data, null, 'marketData');
    }

    /**
     * Get market data from cache
     * @param {string} key - Data key
     */
    async getMarketData(key) {
        return this.get(key, 'marketData');
    }

    /**
     * Store historical data
     * @param {string} key - Data key
     * @param {*} data - Historical data
     */
    async setHistorical(key, data) {
        return this.set(key, data, null, 'historical');
    }

    /**
     * Get historical data from cache
     * @param {string} key - Data key
     */
    async getHistorical(key) {
        return this.get(key, 'historical');
    }

    /**
     * Clear all expired entries from all stores
     * @returns {Promise<number>} - Number of entries cleared
     */
    async clearExpired() {
        if (this.isFallback) {
            let count = 0;
            const now = Date.now();
            this.fallbackCache.forEach((record, key) => {
                if (record.expires <= now) {
                    this.fallbackCache.delete(key);
                    count++;
                }
            });
            return count;
        }

        let totalCleared = 0;
        const stores = Object.keys(this.options.stores);

        for (const storeName of stores) {
            const count = await this.clearExpiredInStore(storeName);
            totalCleared += count;
        }

        return totalCleared;
    }

    /**
     * Clear expired entries from a specific store
     */
    async clearExpiredInStore(storeName) {
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const index = objectStore.index('expires');
                const now = Date.now();
                const range = IDBKeyRange.upperBound(now);
                const request = index.openCursor(range);
                let count = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        count++;
                        cursor.continue();
                    } else {
                        resolve(count);
                    }
                };

                request.onerror = () => resolve(0);
            } catch (error) {
                resolve(0);
            }
        });
    }

    /**
     * Clear all data from all stores
     * @returns {Promise<void>}
     */
    async clearAll() {
        if (this.isFallback) {
            this.fallbackCache.clear();
            return;
        }

        const stores = Object.keys(this.options.stores);

        for (const storeName of stores) {
            await this.clearStore(storeName);
        }
    }

    /**
     * Clear a specific store
     */
    async clearStore(storeName) {
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.clear();

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Get storage statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const stats = {
            stores: {},
            totalEntries: 0,
            expiredEntries: 0,
            estimatedSize: 0
        };

        if (this.isFallback) {
            stats.totalEntries = this.fallbackCache.size;
            stats.isFallback = true;
            return stats;
        }

        const stores = Object.keys(this.options.stores);
        const now = Date.now();

        for (const storeName of stores) {
            const storeStats = await this.getStoreStats(storeName, now);
            stats.stores[storeName] = storeStats;
            stats.totalEntries += storeStats.total;
            stats.expiredEntries += storeStats.expired;
        }

        // Estimate storage usage
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                stats.storageUsed = estimate.usage;
                stats.storageQuota = estimate.quota;
                stats.storagePercentage = ((estimate.usage / estimate.quota) * 100).toFixed(2);
            } catch (error) {
                // Storage API not available
            }
        }

        return stats;
    }

    /**
     * Get statistics for a specific store
     */
    async getStoreStats(storeName, now) {
        return new Promise((resolve) => {
            const stats = { total: 0, expired: 0, active: 0 };

            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        stats.total++;
                        if (cursor.value.expires <= now) {
                            stats.expired++;
                        } else {
                            stats.active++;
                        }
                        cursor.continue();
                    } else {
                        resolve(stats);
                    }
                };

                request.onerror = () => resolve(stats);
            } catch (error) {
                resolve(stats);
            }
        });
    }

    /**
     * Handle storage quota exceeded
     */
    async handleStorageQuota() {
        console.warn('[DataCache] Storage quota exceeded, cleaning up...');

        // Clear all expired entries first
        await this.clearExpired();

        // Get current stats
        const stats = await this.getStats();

        // If still over quota, clear oldest entries
        if (stats.storagePercentage > 90) {
            await this.clearOldestEntries(0.2); // Clear 20% of oldest entries
        }
    }

    /**
     * Clear oldest entries by percentage
     */
    async clearOldestEntries(percentage) {
        const stores = Object.keys(this.options.stores);

        for (const storeName of stores) {
            await this.clearOldestInStore(storeName, percentage);
        }
    }

    /**
     * Clear oldest entries in a specific store
     */
    async clearOldestInStore(storeName, percentage) {
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);
                const countRequest = objectStore.count();

                countRequest.onsuccess = () => {
                    const total = countRequest.result;
                    const toDelete = Math.ceil(total * percentage);
                    let deleted = 0;

                    const index = objectStore.index('createdAt');
                    const cursorRequest = index.openCursor();

                    cursorRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && deleted < toDelete) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        } else {
                            resolve(deleted);
                        }
                    };

                    cursorRequest.onerror = () => resolve(0);
                };

                countRequest.onerror = () => resolve(0);
            } catch (error) {
                resolve(0);
            }
        });
    }

    /**
     * Start periodic cleanup timer
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            const cleared = await this.clearExpired();
            if (cleared > 0) {
                console.log(`[DataCache] Cleared ${cleared} expired entries`);
            }
        }, this.options.cleanupInterval);
    }

    /**
     * Ensure database is initialized before operations
     */
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    /**
     * Export all cached data (for debugging/backup)
     * @returns {Promise<Object>}
     */
    async exportData() {
        await this.ensureInitialized();

        const data = {};
        const stores = Object.keys(this.options.stores);

        if (this.isFallback) {
            this.fallbackCache.forEach((value, key) => {
                data[key] = value;
            });
            return data;
        }

        for (const storeName of stores) {
            data[storeName] = await this.getAllFromStore(storeName);
        }

        return data;
    }

    /**
     * Get all entries from a store
     */
    async getAllFromStore(storeName) {
        return new Promise((resolve) => {
            const entries = [];

            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        entries.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(entries);
                    }
                };

                request.onerror = () => resolve(entries);
            } catch (error) {
                resolve(entries);
            }
        });
    }

    /**
     * Import cached data
     * @param {Object} data - Data to import
     */
    async importData(data) {
        await this.ensureInitialized();

        for (const [storeName, entries] of Object.entries(data)) {
            if (this.options.stores[storeName]) {
                for (const entry of entries) {
                    await this.set(entry.key, entry.value, entry.ttl, storeName);
                }
            }
        }
    }

    /**
     * Close database connection
     */
    close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        if (this.db) {
            this.db.close();
            this.db = null;
        }

        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * Delete the entire database
     * @returns {Promise<boolean>}
     */
    async deleteDatabase() {
        this.close();

        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(this.options.dbName);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }
}

// Auto-initialize if not in module context
if (typeof window !== 'undefined') {
    window.DataCache = DataCache;

    // Create and initialize default instance
    document.addEventListener('DOMContentLoaded', async () => {
        if (!window.dataCache) {
            window.dataCache = new DataCache();
            await window.dataCache.init();
        }
    });
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataCache;
}
