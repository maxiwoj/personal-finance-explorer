'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkForUpdates, registerServiceWorker } from '@/lib/app-update'
import { shouldResumeToAdd } from '@/lib/app-lifecycle'
import { hasUnsavedInput } from '@/lib/unsaved-input'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// Registers the service worker; on return to the foreground, checks for a new version and,
// in the installed app after a long time away, goes back to /add
export function AppLifecycle() {
  const router = useRouter()

  useEffect(() => {
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    let hiddenAt: number | null = null
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
      hiddenAt = null
      if (shouldResumeToAdd({ awayMs, pathname: window.location.pathname, standalone: isStandalone(), unsavedInput: hasUnsavedInput() })) {
        router.replace('/add')
      }
      void checkForUpdates()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [router])

  return null
}
