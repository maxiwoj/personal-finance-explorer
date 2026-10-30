import { useEffect } from 'react'

// Forms with input that a reload would lose. A new app version is then offered instead of
// applied, and the app doesn't jump back to /add on resume (components/app-lifecycle.tsx).
const sources = new Set<object>()

export function hasUnsavedInput() {
  return sources.size > 0
}

export function useUnsavedInput(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const source = {}
    sources.add(source)
    return () => {
      sources.delete(source)
    }
  }, [unsaved])
}
