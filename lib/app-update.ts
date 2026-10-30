import { useSyncExternalStore } from 'react'
import { hasUnsavedInput } from '@/lib/unsaved-input'

// Service worker registration and app updates. A new version installs in the background and waits;
// it's applied (SKIP_WAITING, then a reload once it controls the page) right away when no form has
// unsaved input, otherwise the nav offers "New version – Reload". Each page only ever loads the JS
// of the version it was served with.

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'failed' | 'available'

const SW_URL = '/serwist/sw.js'
const KILL_SWITCH = process.env.NEXT_PUBLIC_SW_KILL_SWITCH === '1'
const MESSAGE_MS = 4000

let status: UpdateStatus = 'idle'
let messageTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

let registration: ServiceWorkerRegistration | null = null
let waitingWorker: ServiceWorker | null = null
let applying = false
let reloading = false

function setStatus(next: UpdateStatus) {
  status = next
  clearTimeout(messageTimer)
  if (next === 'up-to-date' || next === 'failed') {
    messageTimer = setTimeout(() => setStatus('idle'), MESSAGE_MS)
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUpdateStatus() {
  return useSyncExternalStore(subscribe, () => status, () => 'idle' as UpdateStatus)
}

function reload() {
  if (reloading) return
  reloading = true
  window.location.reload()
}

export function applyUpdate() {
  applying = true
  if (waitingWorker) {
    // The reload follows on controllerchange, once the new version serves the page
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    waitingWorker = null
  } else {
    reload()
  }
}

function onWaiting(worker: ServiceWorker) {
  waitingWorker = worker
  if (hasUnsavedInput()) {
    setStatus('available')
  } else {
    applyUpdate()
  }
}

function watchInstalling(worker: ServiceWorker) {
  worker.addEventListener('statechange', () => {
    // Without a controller this is the first install, which takes over without a reload
    if (worker.state === 'installed' && navigator.serviceWorker.controller) onWaiting(worker)
    if (worker.state === 'redundant' && status === 'checking') setStatus('failed')
  })
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  if (KILL_SWITCH) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
    return
  }

  if (process.env.NODE_ENV !== 'production') return

  let controlled = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first install claiming this page serves the same version: nothing to reload
    if (!controlled) {
      controlled = true
      return
    }
    // Applied from here, or from another tab with the app open
    if (applying || !hasUnsavedInput()) {
      reload()
    } else {
      waitingWorker = null
      setStatus('available')
    }
  })

  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' })
  } catch {
    return
  }
  if (registration.waiting && navigator.serviceWorker.controller) onWaiting(registration.waiting)
  if (registration.installing) watchInstalling(registration.installing)
  registration.addEventListener('updatefound', () => {
    if (registration?.installing) watchInstalling(registration.installing)
  })
}

// On return to the foreground, and from the menu (manual: reports the result in the nav)
export async function checkForUpdates({ manual = false } = {}) {
  if (status === 'available' && !manual && !hasUnsavedInput()) {
    applyUpdate()
    return
  }
  if (!registration) {
    if (manual) setStatus('failed')
    return
  }
  if (status === 'available') return
  if (manual) setStatus('checking')
  try {
    await registration.update()
  } catch {
    if (manual) setStatus('failed')
    return
  }
  if (!manual || registration.installing) return
  if (registration.waiting) {
    onWaiting(registration.waiting)
    return
  }
  setStatus('up-to-date')
}
