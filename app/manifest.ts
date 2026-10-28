import type { MetadataRoute } from 'next'

// Installed from /add and always opened there (see docs/deployment.md, "Install as an app")
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Personal Finance Explorer',
    short_name: 'Finance',
    description: 'Visualize and analyze your personal expenses from Google Sheets',
    start_url: '/add',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
