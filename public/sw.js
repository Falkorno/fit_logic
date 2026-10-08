const CACHE_NAME = 'pulse-v4'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/splash-screen.jpg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

function cacheResponse(event, key, response) {
  if (response.status !== 200) return
  const copy = response.clone()
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, copy)).catch(() => undefined))
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      cacheResponse(event, '/', response)
      return response
    }).catch(() => caches.match('/').then((cached) => cached || Response.error())))
    return
  }
  event.respondWith(fetch(event.request).then((response) => {
    cacheResponse(event, event.request, response)
    return response
  }).catch(() => caches.match(event.request).then((cached) => cached || Response.error())))
})