/**
 * WealthPilot Pro - Performance Optimizer
 * Provides progressive enhancement for application performance
 * All optimizations are non-breaking and gracefully degrade
 */

class PerformanceOptimizer {
    constructor(options = {}) {
        this.options = {
            lazyLoadThreshold: options.lazyLoadThreshold || '200px',
            virtualScrollItemHeight: options.virtualScrollItemHeight || 50,
            virtualScrollBuffer: options.virtualScrollBuffer || 5,
            batchDelay: options.batchDelay || 50,
            maxBatchSize: options.maxBatchSize || 10,
            cachePrefix: options.cachePrefix || 'wp_perf_',
            prefetchDelay: options.prefetchDelay || 1000,
            chartThrottleMs: options.chartThrottleMs || 100,
            ...options
        };

        this.requestQueue = [];
        this.batchTimeout = null;
        this.intersectionObserver = null;
        this.prefetchObserver = null;
        this.performanceMetrics = {};
        this.chartUpdateTimers = new Map();
        this.initialized = false;

        // Bind methods
        this.processBatch = this.processBatch.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    /**
     * Initialize all performance optimizations
     */
    init() {
        if (this.initialized) return;

        try {
            this.initLazyLoading();
            this.initRequestBatching();
            this.initCacheStrategy();
            this.initPrefetching();
            this.measurePerformance();
            this.setupVisibilityHandler();
            this.initialized = true;
            console.log('[PerformanceOptimizer] Initialized successfully');
        } catch (error) {
            console.warn('[PerformanceOptimizer] Partial initialization:', error.message);
        }

        return this;
    }

    /**
     * Initialize lazy loading for images and charts using Intersection Observer
     */
    initLazyLoading() {
        if (!('IntersectionObserver' in window)) {
            console.warn('[PerformanceOptimizer] IntersectionObserver not supported, skipping lazy loading');
            return this;
        }

        // Disconnect existing observer if any
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        this.intersectionObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;
                        this.loadElement(element);
                        observer.unobserve(element);
                    }
                });
            },
            {
                rootMargin: this.options.lazyLoadThreshold,
                threshold: 0.01
            }
        );

        // Observe images with data-src
        this.observeLazyElements();

        // Set up mutation observer to handle dynamically added elements
        this.setupMutationObserver();

        return this;
    }

    /**
     * Observe lazy-loadable elements
     */
    observeLazyElements() {
        // Lazy load images
        document.querySelectorAll('img[data-src]:not([data-lazy-loaded])').forEach(img => {
            this.intersectionObserver.observe(img);
        });

        // Lazy load charts
        document.querySelectorAll('[data-chart-lazy]:not([data-lazy-loaded])').forEach(chart => {
            this.intersectionObserver.observe(chart);
        });

        // Lazy load iframes
        document.querySelectorAll('iframe[data-src]:not([data-lazy-loaded])').forEach(iframe => {
            this.intersectionObserver.observe(iframe);
        });

        // Lazy load background images
        document.querySelectorAll('[data-bg-src]:not([data-lazy-loaded])').forEach(element => {
            this.intersectionObserver.observe(element);
        });
    }

    /**
     * Load a lazy element
     */
    loadElement(element) {
        const tagName = element.tagName.toLowerCase();

        if (element.dataset.src) {
            if (tagName === 'img') {
                element.src = element.dataset.src;
                if (element.dataset.srcset) {
                    element.srcset = element.dataset.srcset;
                }
            } else if (tagName === 'iframe') {
                element.src = element.dataset.src;
            }
        }

        if (element.dataset.bgSrc) {
            element.style.backgroundImage = `url('${element.dataset.bgSrc}')`;
        }

        if (element.dataset.chartLazy) {
            this.initializeLazyChart(element);
        }

        element.dataset.lazyLoaded = 'true';
        element.classList.add('lazy-loaded');
        element.classList.remove('lazy-loading');

        // Dispatch custom event
        element.dispatchEvent(new CustomEvent('lazyloaded', { bubbles: true }));
    }

    /**
     * Initialize a lazy-loaded chart
     */
    initializeLazyChart(element) {
        const chartType = element.dataset.chartLazy;
        const chartData = element.dataset.chartData;

        if (chartData) {
            try {
                const data = JSON.parse(chartData);
                element.dispatchEvent(new CustomEvent('chart:init', {
                    bubbles: true,
                    detail: { type: chartType, data }
                }));
            } catch (error) {
                console.warn('[PerformanceOptimizer] Failed to parse chart data:', error);
            }
        }
    }

    /**
     * Set up mutation observer for dynamic content
     */
    setupMutationObserver() {
        if (!('MutationObserver' in window)) return;

        const mutationObserver = new MutationObserver((mutations) => {
            let hasNewLazyElements = false;

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && (
                            node.matches('img[data-src]') ||
                            node.matches('[data-chart-lazy]') ||
                            node.matches('iframe[data-src]') ||
                            node.matches('[data-bg-src]')
                        )) {
                            hasNewLazyElements = true;
                        }

                        // Check children
                        if (node.querySelectorAll) {
                            const lazyChildren = node.querySelectorAll(
                                'img[data-src], [data-chart-lazy], iframe[data-src], [data-bg-src]'
                            );
                            if (lazyChildren.length > 0) {
                                hasNewLazyElements = true;
                            }
                        }
                    }
                });
            });

            if (hasNewLazyElements) {
                this.observeLazyElements();
            }
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Initialize virtual scrolling for long lists
     * @param {HTMLElement|string} container - Container element or selector
     * @param {Array} items - Array of items to render
     * @param {Function} renderFn - Function to render each item
     * @returns {Object} Virtual scroll controller
     */
    initVirtualScrolling(container, items, renderFn) {
        const containerEl = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!containerEl) {
            console.warn('[PerformanceOptimizer] Virtual scroll container not found');
            return null;
        }

        const itemHeight = this.options.virtualScrollItemHeight;
        const buffer = this.options.virtualScrollBuffer;

        // Create virtual scroll state
        const state = {
            items: items || [],
            scrollTop: 0,
            containerHeight: containerEl.clientHeight,
            itemHeight,
            buffer,
            renderedItems: new Map()
        };

        // Create content wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'virtual-scroll-wrapper';
        wrapper.style.cssText = 'position: relative; overflow: hidden;';

        const content = document.createElement('div');
        content.className = 'virtual-scroll-content';
        content.style.cssText = 'position: absolute; top: 0; left: 0; right: 0;';

        wrapper.appendChild(content);

        // Set total height
        const totalHeight = state.items.length * itemHeight;
        wrapper.style.height = `${totalHeight}px`;

        // Replace container content
        containerEl.innerHTML = '';
        containerEl.appendChild(wrapper);
        containerEl.style.overflow = 'auto';

        // Render visible items
        const render = () => {
            const scrollTop = containerEl.scrollTop;
            const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
            const visibleCount = Math.ceil(state.containerHeight / itemHeight) + buffer * 2;
            const endIndex = Math.min(state.items.length, startIndex + visibleCount);

            // Clear non-visible items
            state.renderedItems.forEach((el, index) => {
                if (index < startIndex || index >= endIndex) {
                    el.remove();
                    state.renderedItems.delete(index);
                }
            });

            // Render visible items
            for (let i = startIndex; i < endIndex; i++) {
                if (!state.renderedItems.has(i) && state.items[i]) {
                    const itemEl = renderFn(state.items[i], i);
                    if (itemEl) {
                        itemEl.style.cssText = `
                            position: absolute;
                            top: ${i * itemHeight}px;
                            left: 0;
                            right: 0;
                            height: ${itemHeight}px;
                        `;
                        content.appendChild(itemEl);
                        state.renderedItems.set(i, itemEl);
                    }
                }
            }
        };

        // Initial render
        render();

        // Throttled scroll handler
        let scrollTimeout;
        const handleScroll = () => {
            if (scrollTimeout) return;
            scrollTimeout = requestAnimationFrame(() => {
                render();
                scrollTimeout = null;
            });
        };

        containerEl.addEventListener('scroll', handleScroll, { passive: true });

        // Resize observer
        if ('ResizeObserver' in window) {
            const resizeObserver = new ResizeObserver(() => {
                state.containerHeight = containerEl.clientHeight;
                render();
            });
            resizeObserver.observe(containerEl);
        }

        // Return controller
        return {
            updateItems: (newItems) => {
                state.items = newItems;
                wrapper.style.height = `${newItems.length * itemHeight}px`;
                state.renderedItems.forEach(el => el.remove());
                state.renderedItems.clear();
                render();
            },
            scrollToIndex: (index) => {
                containerEl.scrollTop = index * itemHeight;
            },
            getVisibleRange: () => {
                const startIndex = Math.floor(containerEl.scrollTop / itemHeight);
                const endIndex = Math.min(
                    state.items.length,
                    startIndex + Math.ceil(state.containerHeight / itemHeight)
                );
                return { startIndex, endIndex };
            },
            destroy: () => {
                containerEl.removeEventListener('scroll', handleScroll);
                state.renderedItems.clear();
            }
        };
    }

    /**
     * Initialize request batching for API calls
     */
    initRequestBatching() {
        // Store original fetch if not already done
        if (!window._originalFetch) {
            window._originalFetch = window.fetch;
        }

        return this;
    }

    /**
     * Add request to batch queue
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise} - Resolves with response
     */
    batchRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });

            // Clear existing timeout
            if (this.batchTimeout) {
                clearTimeout(this.batchTimeout);
            }

            // Process immediately if batch is full
            if (this.requestQueue.length >= this.options.maxBatchSize) {
                this.processBatch();
            } else {
                // Otherwise wait for more requests
                this.batchTimeout = setTimeout(this.processBatch, this.options.batchDelay);
            }
        });
    }

    /**
     * Process queued requests in batch
     */
    async processBatch() {
        if (this.requestQueue.length === 0) return;

        const batch = this.requestQueue.splice(0, this.options.maxBatchSize);

        // Check if we can use batch endpoint
        const batchableRequests = batch.filter(req => this.isBatchable(req));
        const nonBatchableRequests = batch.filter(req => !this.isBatchable(req));

        // Process non-batchable requests individually
        nonBatchableRequests.forEach(async req => {
            try {
                const response = await window._originalFetch(req.url, req.options);
                req.resolve(response);
            } catch (error) {
                req.reject(error);
            }
        });

        // Process batchable requests
        if (batchableRequests.length > 0) {
            try {
                const batchPayload = batchableRequests.map(req => ({
                    url: req.url,
                    method: req.options.method || 'GET',
                    body: req.options.body
                }));

                // Try batch endpoint
                const batchResponse = await window._originalFetch('/api/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requests: batchPayload })
                });

                if (batchResponse.ok) {
                    const results = await batchResponse.json();
                    batchableRequests.forEach((req, index) => {
                        if (results.responses && results.responses[index]) {
                            req.resolve(new Response(JSON.stringify(results.responses[index].body), {
                                status: results.responses[index].status,
                                headers: results.responses[index].headers
                            }));
                        } else {
                            req.reject(new Error('Missing batch response'));
                        }
                    });
                } else {
                    // Fallback to individual requests
                    this.fallbackToIndividual(batchableRequests);
                }
            } catch (error) {
                // Fallback to individual requests on error
                this.fallbackToIndividual(batchableRequests);
            }
        }
    }

    /**
     * Check if a request can be batched
     */
    isBatchable(request) {
        const method = (request.options.method || 'GET').toUpperCase();
        return ['GET', 'POST'].includes(method) &&
            request.url.startsWith('/api/') &&
            !request.url.includes('/api/batch') &&
            !request.url.includes('/api/ws') &&
            !request.url.includes('/api/stream');
    }

    /**
     * Fallback to individual requests
     */
    async fallbackToIndividual(requests) {
        requests.forEach(async req => {
            try {
                const response = await window._originalFetch(req.url, req.options);
                req.resolve(response);
            } catch (error) {
                req.reject(error);
            }
        });
    }

    /**
     * Initialize client-side caching strategy
     */
    initCacheStrategy() {
        // Create memory cache for quick access
        this.memoryCache = new Map();
        this.memoryCacheMaxSize = 100;

        return this;
    }

    /**
     * Get from cache with cache-first strategy for market data
     * @param {string} key - Cache key
     * @param {Function} fetchFn - Function to fetch data if not cached
     * @param {Object} options - Cache options
     */
    async getCached(key, fetchFn, options = {}) {
        const {
            ttl = 60000, // 1 minute default
            staleWhileRevalidate = true,
            cacheFirst = false
        } = options;

        const cacheKey = this.options.cachePrefix + key;

        // Check memory cache first
        const memoryCached = this.memoryCache.get(cacheKey);
        if (memoryCached && Date.now() < memoryCached.expires) {
            if (staleWhileRevalidate && Date.now() > memoryCached.staleAt) {
                // Revalidate in background
                this.revalidateCache(key, fetchFn, ttl);
            }
            return memoryCached.data;
        }

        // Check IndexedDB cache if DataCache is available
        if (window.dataCache) {
            const cached = await window.dataCache.get(cacheKey);
            if (cached !== null) {
                // Update memory cache
                this.setMemoryCache(cacheKey, cached, ttl);

                if (staleWhileRevalidate) {
                    this.revalidateCache(key, fetchFn, ttl);
                }
                return cached;
            }
        }

        // Fetch fresh data
        try {
            const data = await fetchFn();
            this.setCache(key, data, ttl);
            return data;
        } catch (error) {
            // Return stale data if available
            if (memoryCached) {
                console.warn('[PerformanceOptimizer] Using stale data due to fetch error');
                return memoryCached.data;
            }
            throw error;
        }
    }

    /**
     * Set cache value
     */
    async setCache(key, data, ttl = 60000) {
        const cacheKey = this.options.cachePrefix + key;

        // Set memory cache
        this.setMemoryCache(cacheKey, data, ttl);

        // Set IndexedDB cache if available
        if (window.dataCache) {
            await window.dataCache.set(cacheKey, data, ttl);
        }
    }

    /**
     * Set memory cache with LRU eviction
     */
    setMemoryCache(key, data, ttl) {
        // LRU eviction
        if (this.memoryCache.size >= this.memoryCacheMaxSize) {
            const oldestKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(oldestKey);
        }

        this.memoryCache.set(key, {
            data,
            expires: Date.now() + ttl,
            staleAt: Date.now() + (ttl * 0.8) // Mark as stale at 80% of TTL
        });
    }

    /**
     * Revalidate cache in background
     */
    async revalidateCache(key, fetchFn, ttl) {
        try {
            const data = await fetchFn();
            this.setCache(key, data, ttl);
        } catch (error) {
            console.warn('[PerformanceOptimizer] Background revalidation failed:', error.message);
        }
    }

    /**
     * Initialize prefetching for likely next pages
     */
    initPrefetching() {
        if (!('IntersectionObserver' in window)) return this;

        // Disconnect existing observer if any
        if (this.prefetchObserver) {
            this.prefetchObserver.disconnect();
        }

        // Prefetch links when they become visible
        this.prefetchObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const link = entry.target;
                        this.prefetchLink(link);
                    }
                });
            },
            {
                rootMargin: '50px',
                threshold: 0.01
            }
        );

        // Observe prefetchable links
        this.observePrefetchLinks();

        // Prefetch on hover with delay
        document.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a[data-prefetch]');
            if (link && !link.dataset.prefetched) {
                setTimeout(() => {
                    if (link.matches(':hover')) {
                        this.prefetchLink(link);
                    }
                }, this.options.prefetchDelay);
            }
        });

        return this;
    }

    /**
     * Observe prefetchable links
     */
    observePrefetchLinks() {
        document.querySelectorAll('a[data-prefetch]:not([data-prefetched])').forEach(link => {
            this.prefetchObserver.observe(link);
        });
    }

    /**
     * Prefetch a link
     */
    async prefetchLink(link) {
        if (link.dataset.prefetched) return;

        const href = link.href;
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        try {
            // Use link prefetching if supported
            if ('connection' in navigator && navigator.connection.saveData) {
                return; // Don't prefetch on data saver mode
            }

            // Create prefetch link
            const prefetchEl = document.createElement('link');
            prefetchEl.rel = 'prefetch';
            prefetchEl.href = href;
            document.head.appendChild(prefetchEl);

            link.dataset.prefetched = 'true';

            // Prefetch API data if specified
            if (link.dataset.prefetchApi) {
                const apiUrl = link.dataset.prefetchApi;
                fetch(apiUrl, { priority: 'low' })
                    .then(res => res.json())
                    .then(data => {
                        this.setCache(`prefetch:${apiUrl}`, data, 300000); // 5 min TTL
                    })
                    .catch(() => {}); // Ignore prefetch errors
            }
        } catch (error) {
            // Ignore prefetch errors
        }
    }

    /**
     * Measure and collect performance metrics
     */
    measurePerformance() {
        if (!('performance' in window)) return this;

        // Collect navigation timing
        this.collectNavigationTiming();

        // Observe paint timing
        this.observePaintTiming();

        // Observe long tasks
        this.observeLongTasks();

        // Observe layout shifts
        this.observeLayoutShifts();

        // Observe largest contentful paint
        this.observeLCP();

        // Observe first input delay
        this.observeFID();

        return this;
    }

    /**
     * Collect navigation timing metrics
     */
    collectNavigationTiming() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const timing = performance.getEntriesByType('navigation')[0];
                if (timing) {
                    this.performanceMetrics.navigation = {
                        dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
                        tcpConnect: timing.connectEnd - timing.connectStart,
                        ttfb: timing.responseStart - timing.requestStart,
                        domContentLoaded: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
                        domInteractive: timing.domInteractive - timing.fetchStart,
                        pageLoad: timing.loadEventEnd - timing.fetchStart
                    };

                    this.reportMetrics('navigation', this.performanceMetrics.navigation);
                }
            }, 0);
        });
    }

    /**
     * Observe paint timing
     */
    observePaintTiming() {
        if (!('PerformanceObserver' in window)) return;

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    this.performanceMetrics[entry.name] = entry.startTime;
                    this.reportMetrics('paint', { [entry.name]: entry.startTime });
                });
            });
            observer.observe({ entryTypes: ['paint'] });
        } catch (error) {
            // Paint timing not supported
        }
    }

    /**
     * Observe long tasks
     */
    observeLongTasks() {
        if (!('PerformanceObserver' in window)) return;

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (!this.performanceMetrics.longTasks) {
                        this.performanceMetrics.longTasks = [];
                    }
                    this.performanceMetrics.longTasks.push({
                        duration: entry.duration,
                        startTime: entry.startTime
                    });
                });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            // Long task observation not supported
        }
    }

    /**
     * Observe layout shifts for CLS
     */
    observeLayoutShifts() {
        if (!('PerformanceObserver' in window)) return;

        let clsValue = 0;
        let clsEntries = [];

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        clsEntries.push(entry);
                    }
                });
                this.performanceMetrics.cls = clsValue;
            });
            observer.observe({ type: 'layout-shift', buffered: true });
        } catch (error) {
            // Layout shift observation not supported
        }
    }

    /**
     * Observe Largest Contentful Paint
     */
    observeLCP() {
        if (!('PerformanceObserver' in window)) return;

        try {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.performanceMetrics.lcp = lastEntry.startTime;
                this.reportMetrics('lcp', { value: lastEntry.startTime });
            });
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (error) {
            // LCP observation not supported
        }
    }

    /**
     * Observe First Input Delay
     */
    observeFID() {
        if (!('PerformanceObserver' in window)) return;

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    this.performanceMetrics.fid = entry.processingStart - entry.startTime;
                    this.reportMetrics('fid', { value: this.performanceMetrics.fid });
                });
            });
            observer.observe({ type: 'first-input', buffered: true });
        } catch (error) {
            // FID observation not supported
        }
    }

    /**
     * Report metrics (can be overridden for analytics)
     */
    reportMetrics(type, metrics) {
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('wp:performance:metric', {
            detail: { type, metrics, timestamp: Date.now() }
        }));

        // Log in development
        if (process?.env?.NODE_ENV === 'development' || window.WP_DEBUG) {
            console.log(`[Performance] ${type}:`, metrics);
        }
    }

    /**
     * Get all collected metrics
     */
    getMetrics() {
        return { ...this.performanceMetrics };
    }

    /**
     * Optimize chart rendering to reduce re-renders
     * @param {Object} chartInstance - Chart.js or similar chart instance
     * @param {Object} options - Optimization options
     */
    optimizeCharts(chartInstance, options = {}) {
        if (!chartInstance) return null;

        const {
            throttleMs = this.options.chartThrottleMs,
            batchUpdates = true,
            useRAF = true
        } = options;

        const chartId = chartInstance.id || Math.random().toString(36).substr(2, 9);

        // Store original update method
        const originalUpdate = chartInstance.update.bind(chartInstance);

        // Track pending updates
        let pendingUpdate = null;
        let pendingData = null;

        // Throttled update function
        const throttledUpdate = (mode) => {
            if (pendingUpdate) return;

            if (useRAF) {
                pendingUpdate = requestAnimationFrame(() => {
                    originalUpdate(mode);
                    pendingUpdate = null;
                });
            } else {
                pendingUpdate = setTimeout(() => {
                    originalUpdate(mode);
                    pendingUpdate = null;
                }, throttleMs);
            }
        };

        // Override update method
        chartInstance.update = (mode) => {
            throttledUpdate(mode);
        };

        // Batched data update
        chartInstance.batchDataUpdate = (newData, callback) => {
            pendingData = { ...pendingData, ...newData };

            if (!this.chartUpdateTimers.has(chartId)) {
                this.chartUpdateTimers.set(chartId, setTimeout(() => {
                    if (pendingData) {
                        if (chartInstance.data.datasets && pendingData.datasets) {
                            chartInstance.data.datasets = pendingData.datasets;
                        }
                        if (pendingData.labels) {
                            chartInstance.data.labels = pendingData.labels;
                        }
                        chartInstance.update('none');
                        pendingData = null;
                    }
                    this.chartUpdateTimers.delete(chartId);
                    if (callback) callback();
                }, throttleMs));
            }
        };

        // Restore original update method
        chartInstance.restoreUpdate = () => {
            chartInstance.update = originalUpdate;
            if (pendingUpdate) {
                cancelAnimationFrame(pendingUpdate);
                clearTimeout(pendingUpdate);
            }
            this.chartUpdateTimers.delete(chartId);
        };

        return chartInstance;
    }

    /**
     * Handle visibility change to pause/resume optimizations
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden - reduce activity
            this.pauseOptimizations();
        } else {
            // Page is visible - resume activity
            this.resumeOptimizations();
        }
    }

    /**
     * Set up visibility change handler
     */
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    /**
     * Pause non-essential optimizations when page is hidden
     */
    pauseOptimizations() {
        // Stop prefetching
        if (this.prefetchObserver) {
            this.prefetchObserver.disconnect();
        }

        // Dispatch pause event
        window.dispatchEvent(new CustomEvent('wp:performance:pause'));
    }

    /**
     * Resume optimizations when page becomes visible
     */
    resumeOptimizations() {
        // Resume prefetching
        this.observePrefetchLinks();

        // Dispatch resume event
        window.dispatchEvent(new CustomEvent('wp:performance:resume'));
    }

    /**
     * Clean up all optimizations
     */
    destroy() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        if (this.prefetchObserver) {
            this.prefetchObserver.disconnect();
        }
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        this.chartUpdateTimers.forEach(timer => clearTimeout(timer));
        this.chartUpdateTimers.clear();
        this.memoryCache.clear();
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        this.initialized = false;
    }
}

// Auto-initialize if not in module context
if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;

    // Create and initialize default instance
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.performanceOptimizer) {
            window.performanceOptimizer = new PerformanceOptimizer().init();
        }
    });
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceOptimizer;
}
