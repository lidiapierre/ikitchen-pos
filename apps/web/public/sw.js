// iKitchen POS — Service Worker
// Cache-first for static assets, network-first for pages

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ikitchen-static-${CACHE_VERSION}`;
const PAGES_CACHE = `ikitchen-pages-${CACHE_VERSION}`;

const APP_SHELL = ['/', '/tables'];

const SUPABASE_ORIGINS = [
  'supabase.co',
  'supabase.in',
];

function isSupabaseRequest(url) {
  return SUPABASE_ORIGINS.some((origin) => url.hostname.includes(origin));
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const current = new Set([STATIC_CACHE, PAGES_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('ikitchen-') && !current.has(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Supabase (auth'd) requests entirely
  if (request.method !== 'GET') return;
  if (isSupabaseRequest(url)) return;

  // Skip chrome-extension and non-http(s)
  if (!url.protocol.startsWith('http')) return;

  if (isStaticAsset(url)) {
    // Cache-first for Next.js static assets
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Network-first with cache fallback for app pages
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(PAGES_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          // Fallback to root shell
          const root = await cache.match('/');
          if (root) return root;
          return new Response('Offline', { status: 503 });
        }
      })
    );
  }
});
