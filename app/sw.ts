/// <reference lib="webworker" />
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // The build's JS, CSS, fonts, public files and pages (app/serwist/[path]/route.ts)
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Only precached files are served from the cache: the pages, and the JS and CSS of the same build,
// so a page never mixes two versions. Anything else (/api/*, Google APIs, RSC requests) goes
// straight to the network. A new version waits until the page sends SKIP_WAITING (lib/app-update.ts).
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Vercel's skew protection adds ?dpl= to asset URLs
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^dpl$/],
  },
  skipWaiting: false,
  // Takes control of the page that installed it, so the app works offline from the first visit
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
})

serwist.addEventListeners()
