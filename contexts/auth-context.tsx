'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DRIVE_FILE_SCOPE, GOOGLE_CLIENT_ID } from '@/lib/config'
import { clearCache } from '@/lib/cache'
import { clearStoredDemoTransactions } from '@/lib/demo-data'
import { MissingScopeError, classifyRefreshError, classifyRefreshStatus, type RefreshFailure } from '@/lib/auth-errors'

const STORAGE_KEY = 'pfe_access_token'
const EXPIRY_KEY = 'pfe_token_expiry'
const HINT_KEY = 'pfe_email_hint'
const MODE_KEY = 'pfe_auth_mode'
const USER_ID_KEY = 'pfe_user_id'
const REFRESH_TIMEOUT_MS = 15000

const REQUIRED_SCOPES = [
  DRIVE_FILE_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ')

export type AuthMode = 'google' | 'demo' | null

interface GoogleCodeClient {
  requestCode: () => void
}

interface AuthContextType {
  mode: AuthMode
  accessToken: string | null
  userId: string | null
  email: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isExpiring: boolean
  // Signed in, but the token couldn't be refreshed because of a network failure; accessToken is null
  isOffline: boolean
  expiryTime: number | null
  error: string | null
  signInWithGoogle: () => void
  enterDemoMode: () => void
  signOut: () => void
  refreshSession: () => Promise<boolean>
  // The refresh already running, if any (resolves to whether it succeeded); doesn't start one
  pendingRefresh: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | null>(null)

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string
            scope: string
            ux_mode?: 'popup' | 'redirect'
            redirect_uri?: string
            access_type?: 'offline' | 'online'
            prompt?: '' | 'consent' | 'select_account'
            callback: (response: { code?: string; error?: string }) => void
          }) => GoogleCodeClient
          revoke: (token: string, callback: () => void) => void
        }
      }
    }
  }
}

let googleScript: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        // Lets a later attempt try again
        googleScript = null
        script.remove()
        reject(new Error('Failed to load Google authentication'))
      }
      document.body.appendChild(script)
    })
  }
  return googleScript
}

function clearGoogleSession() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(EXPIRY_KEY)
  localStorage.removeItem(HINT_KEY)
  localStorage.removeItem(USER_ID_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [expiryTime, setExpiryTime] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [codeClient, setCodeClient] = useState<GoogleCodeClient | null>(null)
  const [isExpiring, setIsExpiring] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const refreshInFlight = useRef<Promise<boolean> | null>(null)
  const queryClient = useQueryClient()

  const clearAuthState = useCallback(() => {
    clearGoogleSession()
    setAccessToken(null)
    setUserId(null)
    setEmail(null)
    setExpiryTime(null)
    setMode(null)
    setIsExpiring(false)
    setIsOffline(false)
    localStorage.removeItem(MODE_KEY)
  }, [])

  // Keeps the signed-in user and their spreadsheet selection; only the token is missing until a refresh succeeds
  const enterOfflineState = useCallback(() => {
    setMode('google')
    setAccessToken(null)
    setUserId(localStorage.getItem(USER_ID_KEY))
    setEmail(localStorage.getItem(HINT_KEY))
    setExpiryTime(null)
    setIsExpiring(false)
    setIsOffline(true)
  }, [])

  // On a refresh the user is already known from the stored session, so userinfo is skipped;
  // a sign-in always fetches it, since another account may be signing in
  const handleAuthResponse = useCallback(async (data: { access_token: string, expiry_date: number, scope?: string }, { isRefresh = false } = {}) => {
    // Users can untick scopes on the consent screen; without drive.file the app can't read any sheet
    if (data.scope && !data.scope.split(' ').includes(DRIVE_FILE_SCOPE)) {
      throw new MissingScopeError()
    }

    // Resolve the user before exposing the token so per-user settings (selected spreadsheet) load correctly
    let resolvedUserId = localStorage.getItem(USER_ID_KEY)
    const storedEmail = localStorage.getItem(HINT_KEY)
    if (isRefresh && resolvedUserId && storedEmail) {
      setEmail(storedEmail)
    } else {
      try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${data.access_token}` },
        })

        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json()
          if (userInfo.email) {
            setEmail(userInfo.email)
            localStorage.setItem(HINT_KEY, userInfo.email)
          }
          if (userInfo.sub) {
            resolvedUserId = userInfo.sub
            localStorage.setItem(USER_ID_KEY, userInfo.sub)
          }
        }
      } catch (fetchError) {
        console.error('Failed to fetch user hint:', fetchError)
      }
    }

    setMode('google')
    setAccessToken(data.access_token)
    setUserId(resolvedUserId)
    setExpiryTime(data.expiry_date)
    setIsExpiring(false)
    setIsOffline(false)

    localStorage.setItem(MODE_KEY, 'google')
    localStorage.setItem(STORAGE_KEY, data.access_token)
    localStorage.setItem(EXPIRY_KEY, data.expiry_date.toString())
    setError(null)
  }, [])

  const runRefresh = useCallback(async () => {
    let failure: RefreshFailure
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        await handleAuthResponse(data, { isRefresh: true })
        return true
      }
      failure = classifyRefreshStatus(response.status)
    } catch (e) {
      if (e instanceof MissingScopeError) {
        // Session predates the drive.file scope (or it was declined): force a fresh consent
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
        setError(e.message)
      }
      console.error('Refresh error:', e)
      failure = classifyRefreshError(e)
    }

    // A network failure isn't a revoked session: stay signed in and retry once the network is back
    if (failure === 'network' && localStorage.getItem(MODE_KEY) === 'google') {
      enterOfflineState()
    } else {
      clearAuthState()
    }
    return false
  }, [clearAuthState, enterOfflineState, handleAuthResponse])

  // Startup, focus, reconnect and 401 retries can overlap; they share one request
  const refreshSession = useCallback(() => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = runRefresh().finally(() => {
        refreshInFlight.current = null
      })
    }
    return refreshInFlight.current
  }, [runRefresh])

  const pendingRefresh = useCallback(() => refreshInFlight.current ?? Promise.resolve(false), [])

  useEffect(() => {
    if (!expiryTime || mode !== 'google') return

    const checkExpiry = () => {
      const remaining = expiryTime - Date.now()
      setIsExpiring(remaining > 0 && remaining < 600000)

      if (remaining <= 0) {
        void refreshSession()
      }
    }

    checkExpiry()
    const interval = window.setInterval(checkExpiry, 30000)
    return () => window.clearInterval(interval)
  }, [expiryTime, mode, refreshSession])

  useEffect(() => {
    const onFocus = () => {
      if (mode === 'google' && expiryTime && expiryTime <= Date.now()) {
        void refreshSession()
      }
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [expiryTime, mode, refreshSession])

  useEffect(() => {
    if (!isOffline) return

    const retry = () => {
      if (document.visibilityState === 'visible') {
        void refreshSession()
      }
    }

    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [isOffline, refreshSession])

  useEffect(() => {
    const init = async () => {
      const storedMode = localStorage.getItem(MODE_KEY) as AuthMode
      const storedToken = localStorage.getItem(STORAGE_KEY)
      const storedExpiry = localStorage.getItem(EXPIRY_KEY)
      const hasValidStoredToken = !!storedToken && !!storedExpiry && Date.now() < parseInt(storedExpiry, 10) - 60000

      if (storedMode === 'demo') {
        setMode('demo')
        setIsLoading(false)
        return
      }

      if (hasValidStoredToken) {
        setMode('google')
        setAccessToken(storedToken)
        setUserId(localStorage.getItem(USER_ID_KEY))
        setEmail(localStorage.getItem(HINT_KEY))
        setExpiryTime(parseInt(storedExpiry!, 10))
        setIsLoading(false)
        return
      }

      // The stored user is shown while the refresh runs, so the app can render cached data;
      // isAuthenticated stays false until it succeeds
      if (storedMode === 'google') {
        setMode('google')
        setUserId(localStorage.getItem(USER_ID_KEY))
        setEmail(localStorage.getItem(HINT_KEY))
      }

      // A rejected refresh clears the stored session; a network failure keeps it (see runRefresh)
      await refreshSession()
      setIsLoading(false)
    }
    void init()
  }, [refreshSession])

  // The sign-in script (~277KB) is loaded only once sign-in is needed, so a signed-in launch skips it
  const needsSignIn = !isLoading && mode === null

  useEffect(() => {
    if (!needsSignIn) return
    let cancelled = false

    loadGoogleScript().then(() => {
      if (!cancelled && window.google && GOOGLE_CLIENT_ID) {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: REQUIRED_SCOPES,
          ux_mode: 'popup',
          access_type: 'offline',
          prompt: 'consent',
          callback: async (response) => {
            if (response.error) {
              setError(response.error === 'access_denied' ? 'Access denied. Please try again.' : response.error)
              setIsLoading(false)
              return
            }

            if (response.code) {
              setIsLoading(true)
              try {
                const loginResponse = await fetch('/api/auth/login', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code: response.code }),
                })

                if (loginResponse.ok) {
                  const data = await loginResponse.json()
                  await handleAuthResponse(data)
                } else {
                  const err = await loginResponse.json()
                  setError(err.error || 'Login failed')
                }
              } catch (e) {
                console.error('Login error:', e)
                if (e instanceof MissingScopeError) {
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
                  setError(e.message)
                } else {
                  setError('Failed to connect to authentication server')
                }
              }
              setIsLoading(false)
            }
          },
        })
        setCodeClient(client)
      }
    }, () => {
      if (cancelled) return
      setError('Failed to load Google authentication')
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [handleAuthResponse, needsSignIn])

  const signInWithGoogle = useCallback(() => {
    if (!codeClient) {
      setError('Authentication not ready. Please try again.')
      return
    }

    setError(null)
    try {
      codeClient.requestCode()
    } catch (signInError) {
      console.error('Sign-in failed to trigger:', signInError)
      setError('Authentication failed to start. Please check if popups are blocked.')
    }
  }, [codeClient])

  const enterDemoMode = useCallback(() => {
    clearGoogleSession()
    void clearCache()
    setAccessToken(null)
    setUserId(null)
    setEmail(null)
    setExpiryTime(null)
    setIsExpiring(false)
    setError(null)
    setMode('demo')
    localStorage.setItem(MODE_KEY, 'demo')
  }, [])

  const signOut = useCallback(async () => {
    const activeMode = mode ?? (localStorage.getItem(MODE_KEY) as AuthMode)
    const currentToken = accessToken || localStorage.getItem(STORAGE_KEY)

    if (activeMode === 'demo') {
      clearStoredDemoTransactions()
    }

    if (activeMode === 'google') {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      } catch (e) {
        console.error('Logout error:', e)
      }
    }

    void clearCache()
    setError(null)
    clearAuthState()
    queryClient.clear()

    if (activeMode === 'google' && currentToken) {
      loadGoogleScript()
        .then(() => window.google?.accounts.oauth2.revoke(currentToken, () => undefined))
        .catch((e) => console.error('Revoke error:', e))
    }
  }, [accessToken, clearAuthState, mode, queryClient])

  return (
    <AuthContext.Provider
      value={{
        mode,
        accessToken,
        userId,
        email,
        isAuthenticated: mode === 'demo' || !!accessToken || isOffline,
        isLoading,
        isExpiring,
        isOffline,
        expiryTime,
        error,
        signInWithGoogle,
        enterDemoMode,
        signOut,
        refreshSession,
        pendingRefresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
