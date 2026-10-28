import { randomUUID } from 'node:crypto'
import { createSerwistRoute } from '@serwist/turbopack'

// Serves /serwist/sw.js, built with esbuild when the route is prerendered at build time
// (Turbopack can't run Serwist's webpack plugin)

// Opened offline from the cache. Their HTML names the build's JS files, so they get a new
// revision with every build.
const PAGES = ['/', '/add', '/dashboard', '/categories', '/yearly-summary', '/transactions', '/currencies', '/login', '/privacy', '/terms']
const revision = randomUUID()

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: process.env.NEXT_PUBLIC_SW_KILL_SWITCH === '1' ? 'app/sw-kill-switch.ts' : 'app/sw.ts',
  useNativeEsbuild: true,
  // A classic script: Safari only recently supports module service workers
  esbuildOptions: { format: 'iife' },
  additionalPrecacheEntries: [...PAGES, '/manifest.webmanifest'].map((url) => ({ url, revision })),
  // The build's JS, CSS and fonts (next/font serves them from /_next/static/media), and public/
  globPatterns: ['.next/static/**/*.{js,css,json,woff2,png,svg,ico,webp}', 'public/**/*'],
  // Unused images
  globIgnores: ['public/placeholder*'],
})
