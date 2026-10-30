/// <reference lib="webworker" />

// Built instead of app/sw.ts when NEXT_PUBLIC_SW_KILL_SWITCH=1, to recover installs from a bad
// release (docs/deployment.md, "Service worker kill switch"): it removes itself and its caches,
// then reloads open pages from the network. With the flag set, pages don't register a worker again.
declare const self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister()
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      const windows = await self.clients.matchAll({ type: 'window' })
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)))
    })()
  )
})

export {}
