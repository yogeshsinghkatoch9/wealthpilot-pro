const CACHE_NAME = 'wealthpilot-v6';
const OFFLINE_URL = '/offline.html';
const API_CACHE = 'wealthpilot-api-v1';
const STATIC_CACHE = 'wealthpilot-static-v1';

// Core app shell - always cache these
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/portfolios',
  '/offline.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/modern-design-system.css',
  '/js/app.js',
  '/js/keyboard-shortcuts.js',
  '/js/theme-toggle.js',
  '/js/toast.js',
  '/icons/icon-192.svg'
];

// API endpoints to cache for offline viewing
const CACHEABLE_API_PATTERNS = [
  /\/api\/market\/quote\//,
  /\/api\/portfolios$/,
  /\/api\/settings$/
];

// Cache duration for different content types (in ms)
const CACHE_DURATION = {
  api: 5 * 60 * 1000,      // 5 minutes for API data
  static: 7 * 24 * 60 * 60 * 1000  // 7 days for static assets
};

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network first, cache fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests
  if (event.request.url.includes('/api/')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Return from cache or offline page
        return caches.match(event.request)
          .then(cached => cached || caches.match(OFFLINE_URL));
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Sync any queued actions when back online
  console.log('Syncing data...');
}

// Push notifications
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'New notification from WealthPilot',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/dashboard' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'WealthPilot', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});
