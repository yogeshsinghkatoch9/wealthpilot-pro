/**
 * WealthPilot Pro - Enhanced Service Worker
 * Provides advanced caching strategies, offline support, and background sync
 * Implements Workbox-style caching patterns without the library dependency
 */

const SW_VERSION = '1.0.0';
const CACHE_PREFIX = 'wealthpilot-';

// Cache names
const CACHES = {
    static: `${CACHE_PREFIX}static-v${SW_VERSION}`,
    dynamic: `${CACHE_PREFIX}dynamic-v${SW_VERSION}`,
    api: `${CACHE_PREFIX}api-v${SW_VERSION}`,
    images: `${CACHE_PREFIX}images-v${SW_VERSION}`,
    fonts: `${CACHE_PREFIX}fonts-v${SW_VERSION}`
};

// Static assets to precache
const PRECACHE_ASSETS = [
    '/',
    '/offline.html',
    '/css/style.css',
    '/css/dashboard.css',
    '/css/charts.css',
    '/js/app.js',
    '/js/performance-optimizer.js',
    '/js/data-cache.js',
    '/js/websocket-optimizer.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// API endpoints and their cache strategies
const API_CACHE_STRATEGIES = {
    // Network-first with cache fallback
    networkFirst: [
        '/api/portfolio',
        '/api/quotes',
        '/api/positions',
        '/api/transactions',
        '/api/alerts'
    ],
    // Cache-first with network fallback
    cacheFirst: [
        '/api/static',
        '/api/config',
        '/api/symbols',
        '/api/market-hours'
    ],
    // Stale-while-revalidate
    staleWhileRevalidate: [
        '/api/news',
        '/api/analysis',
        '/api/recommendations'
    ],
    // Network-only (no caching)
    networkOnly: [
        '/api/auth',
        '/api/login',
        '/api/logout',
        '/api/trade',
        '/api/order'
    ]
};

// Background sync queue name
const SYNC_QUEUE_NAME = 'wp-sync-queue';

// Offline actions store
const offlineActions = [];

/**
 * Install event - Precache static assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker:', SW_VERSION);

    event.waitUntil(
        (async () => {
            const staticCache = await caches.open(CACHES.static);

            // Precache static assets with error handling
            const precacheResults = await Promise.allSettled(
                PRECACHE_ASSETS.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: 'no-cache' });
                        if (response.ok) {
                            await staticCache.put(url, response);
                            return { url, status: 'cached' };
                        }
                        return { url, status: 'failed', reason: response.status };
                    } catch (error) {
                        return { url, status: 'failed', reason: error.message };
                    }
                })
            );

            console.log('[SW] Precache complete:', precacheResults);

            // Force activate new service worker
            await self.skipWaiting();
        })()
    );
});

/**
 * Activate event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker:', SW_VERSION);

    event.waitUntil(
        (async () => {
            // Delete old caches
            const cacheNames = await caches.keys();
            const deletionPromises = cacheNames
                .filter(name => name.startsWith(CACHE_PREFIX) && !Object.values(CACHES).includes(name))
                .map(name => {
                    console.log('[SW] Deleting old cache:', name);
                    return caches.delete(name);
                });

            await Promise.all(deletionPromises);

            // Take control of all clients
            await self.clients.claim();

            console.log('[SW] Activation complete');
        })()
    );
});

/**
 * Fetch event - Handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests for caching (but handle POST for background sync)
    if (event.request.method !== 'GET') {
        if (event.request.method === 'POST' && shouldSyncOffline(url.pathname)) {
            event.respondWith(handleOfflinePost(event.request));
        }
        return;
    }

    // Skip cross-origin requests except for known CDNs
    if (url.origin !== location.origin && !isAllowedOrigin(url.origin)) {
        return;
    }

    // Determine caching strategy based on request type
    const strategy = getCachingStrategy(url);

    event.respondWith(handleFetchWithStrategy(event.request, strategy));
});

/**
 * Get caching strategy for a URL
 */
function getCachingStrategy(url) {
    const pathname = url.pathname;

    // API requests
    if (pathname.startsWith('/api/')) {
        if (API_CACHE_STRATEGIES.networkOnly.some(p => pathname.startsWith(p))) {
            return 'networkOnly';
        }
        if (API_CACHE_STRATEGIES.cacheFirst.some(p => pathname.startsWith(p))) {
            return 'cacheFirst';
        }
        if (API_CACHE_STRATEGIES.staleWhileRevalidate.some(p => pathname.startsWith(p))) {
            return 'staleWhileRevalidate';
        }
        return 'networkFirst'; // Default for API
    }

    // Static assets
    if (pathname.match(/\.(css|js)$/)) {
        return 'cacheFirst';
    }

    // Images
    if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
        return 'cacheFirst';
    }

    // Fonts
    if (pathname.match(/\.(woff|woff2|ttf|eot)$/)) {
        return 'cacheFirst';
    }

    // HTML pages - network first
    return 'networkFirst';
}

/**
 * Handle fetch with specified caching strategy
 */
async function handleFetchWithStrategy(request, strategy) {
    switch (strategy) {
        case 'cacheFirst':
            return cacheFirst(request);
        case 'networkFirst':
            return networkFirst(request);
        case 'staleWhileRevalidate':
            return staleWhileRevalidate(request);
        case 'networkOnly':
            return networkOnly(request);
        default:
            return networkFirst(request);
    }
}

/**
 * Cache-first strategy
 */
async function cacheFirst(request) {
    const cached = await getCachedResponse(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            await cacheResponse(request, response.clone());
        }
        return response;
    } catch (error) {
        return getOfflineFallback(request);
    }
}

/**
 * Network-first strategy with cache fallback
 */
async function networkFirst(request, timeout = 5000) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            await cacheResponse(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await getCachedResponse(request);
        if (cached) {
            return cached;
        }
        return getOfflineFallback(request);
    }
}

/**
 * Stale-while-revalidate strategy
 */
async function staleWhileRevalidate(request) {
    const cached = await getCachedResponse(request);

    // Fetch in background
    const fetchPromise = fetch(request)
        .then(response => {
            if (response.ok) {
                cacheResponse(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    // Return cached immediately, or wait for fetch
    if (cached) {
        return cached;
    }

    const response = await fetchPromise;
    if (response) {
        return response;
    }

    return getOfflineFallback(request);
}

/**
 * Network-only strategy
 */
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Get cached response for a request
 */
async function getCachedResponse(request) {
    const url = new URL(request.url);

    // Determine appropriate cache
    const cacheName = getCacheNameForRequest(url);
    const cache = await caches.open(cacheName);

    return cache.match(request);
}

/**
 * Cache a response
 */
async function cacheResponse(request, response) {
    const url = new URL(request.url);
    const cacheName = getCacheNameForRequest(url);
    const cache = await caches.open(cacheName);

    // Add cache metadata headers
    const headers = new Headers(response.headers);
    headers.set('sw-cached-at', new Date().toISOString());

    const cachedResponse = new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers
    });

    await cache.put(request, cachedResponse);
}

/**
 * Get appropriate cache name for a request
 */
function getCacheNameForRequest(url) {
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
        return CACHES.api;
    }
    if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
        return CACHES.images;
    }
    if (pathname.match(/\.(woff|woff2|ttf|eot)$/)) {
        return CACHES.fonts;
    }
    if (pathname.match(/\.(css|js)$/)) {
        return CACHES.static;
    }
    return CACHES.dynamic;
}

/**
 * Get offline fallback response
 */
async function getOfflineFallback(request) {
    const url = new URL(request.url);

    // For navigation requests, show offline page
    if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
        const cache = await caches.open(CACHES.static);
        const offlinePage = await cache.match('/offline.html');
        if (offlinePage) {
            return offlinePage;
        }
    }

    // For API requests, return error JSON
    if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({
            error: 'Offline',
            message: 'You are currently offline. This data will be synced when you reconnect.',
            cached: true
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // For images, return placeholder
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/><text fill="#999" x="50%" y="50%" text-anchor="middle" dy=".3em">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
        );
    }

    // Generic offline response
    return new Response('Offline', { status: 503 });
}

/**
 * Check if origin is allowed for caching
 */
function isAllowedOrigin(origin) {
    const allowedOrigins = [
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://cdnjs.cloudflare.com'
    ];
    return allowedOrigins.includes(origin);
}

/**
 * Check if request should be synced offline
 */
function shouldSyncOffline(pathname) {
    const syncPatterns = [
        '/api/portfolio',
        '/api/alerts',
        '/api/watchlist',
        '/api/preferences'
    ];
    return syncPatterns.some(pattern => pathname.startsWith(pattern));
}

/**
 * Handle offline POST requests
 */
async function handleOfflinePost(request) {
    try {
        // Try network first
        return await fetch(request);
    } catch (error) {
        // Store for background sync
        const action = {
            id: Date.now().toString(),
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body: await request.text(),
            timestamp: Date.now()
        };

        offlineActions.push(action);

        // Register for background sync
        if ('sync' in self.registration) {
            await self.registration.sync.register(SYNC_QUEUE_NAME);
        }

        return new Response(JSON.stringify({
            success: true,
            queued: true,
            message: 'Action queued for sync',
            syncId: action.id
        }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Background sync event handler
 */
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);

    if (event.tag === SYNC_QUEUE_NAME) {
        event.waitUntil(processOfflineActions());
    }
});

/**
 * Process queued offline actions
 */
async function processOfflineActions() {
    console.log('[SW] Processing offline actions:', offlineActions.length);

    const processedIds = [];

    for (const action of offlineActions) {
        try {
            const response = await fetch(action.url, {
                method: action.method,
                headers: action.headers,
                body: action.body
            });

            if (response.ok) {
                processedIds.push(action.id);
                console.log('[SW] Synced action:', action.id);

                // Notify clients
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SYNC_COMPLETE',
                        actionId: action.id,
                        status: 'success'
                    });
                });
            }
        } catch (error) {
            console.error('[SW] Failed to sync action:', action.id, error);
        }
    }

    // Remove processed actions
    processedIds.forEach(id => {
        const index = offlineActions.findIndex(a => a.id === id);
        if (index !== -1) {
            offlineActions.splice(index, 1);
        }
    });
}

/**
 * Push notification event handler
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'WealthPilot Pro',
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: 'wp-notification',
        data: {}
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (error) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        data: data.data,
        vibrate: [100, 50, 100],
        actions: data.actions || [],
        requireInteraction: data.requireInteraction || false
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

/**
 * Notification click event handler
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.notification.tag);

    event.notification.close();

    const data = event.notification.data || {};
    let targetUrl = data.url || '/';

    // Handle action clicks
    if (event.action) {
        switch (event.action) {
            case 'view':
                targetUrl = data.viewUrl || targetUrl;
                break;
            case 'dismiss':
                return; // Just close the notification
            default:
                targetUrl = data.actionUrls?.[event.action] || targetUrl;
        }
    }

    event.waitUntil(
        (async () => {
            const windowClients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            });

            // Check if there's already a window open
            for (const client of windowClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }

            // Open new window
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })()
    );
});

/**
 * Periodic background sync for data updates
 */
self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Periodic sync triggered:', event.tag);

    if (event.tag === 'wp-data-sync') {
        event.waitUntil(performPeriodicSync());
    }
});

/**
 * Perform periodic background sync
 */
async function performPeriodicSync() {
    console.log('[SW] Performing periodic data sync');

    try {
        // Fetch and cache latest portfolio data
        const portfolioResponse = await fetch('/api/portfolio/summary');
        if (portfolioResponse.ok) {
            const cache = await caches.open(CACHES.api);
            await cache.put('/api/portfolio/summary', portfolioResponse.clone());
        }

        // Fetch and cache watchlist quotes
        const watchlistResponse = await fetch('/api/watchlist/quotes');
        if (watchlistResponse.ok) {
            const cache = await caches.open(CACHES.api);
            await cache.put('/api/watchlist/quotes', watchlistResponse.clone());
        }

        // Notify clients of fresh data
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'PERIODIC_SYNC_COMPLETE',
                timestamp: Date.now()
            });
        });

        console.log('[SW] Periodic sync complete');
    } catch (error) {
        console.error('[SW] Periodic sync failed:', error);
    }
}

/**
 * Message event handler for client communication
 */
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    const { type, payload } = event.data;

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            clearAllCaches().then(() => {
                event.ports[0]?.postMessage({ success: true });
            });
            break;

        case 'CACHE_URLS':
            cacheUrls(payload.urls).then((results) => {
                event.ports[0]?.postMessage({ success: true, results });
            });
            break;

        case 'GET_CACHE_STATS':
            getCacheStats().then((stats) => {
                event.ports[0]?.postMessage({ success: true, stats });
            });
            break;

        case 'PREFETCH':
            prefetchUrls(payload.urls);
            break;
    }
});

/**
 * Clear all caches
 */
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames
            .filter(name => name.startsWith(CACHE_PREFIX))
            .map(name => caches.delete(name))
    );
    console.log('[SW] All caches cleared');
}

/**
 * Cache multiple URLs
 */
async function cacheUrls(urls) {
    const results = [];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                await cacheResponse(new Request(url), response);
                results.push({ url, status: 'cached' });
            } else {
                results.push({ url, status: 'failed', reason: response.status });
            }
        } catch (error) {
            results.push({ url, status: 'failed', reason: error.message });
        }
    }

    return results;
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
    const stats = {};

    for (const [name, cacheName] of Object.entries(CACHES)) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        stats[name] = {
            count: keys.length,
            urls: keys.map(r => r.url)
        };
    }

    return stats;
}

/**
 * Prefetch URLs in background
 */
async function prefetchUrls(urls) {
    for (const url of urls) {
        try {
            const response = await fetch(url, { priority: 'low' });
            if (response.ok) {
                await cacheResponse(new Request(url), response);
            }
        } catch (error) {
            // Ignore prefetch errors
        }
    }
}

console.log('[SW] Enhanced Service Worker loaded:', SW_VERSION);
