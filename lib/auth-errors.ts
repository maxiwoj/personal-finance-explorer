// Kept free of runtime imports so `node --test` can load it

export class MissingScopeError extends Error {
  constructor() {
    super('Google Drive file access is required. Please sign in again and allow access to the files you select.')
    this.name = 'MissingScopeError'
  }
}

// 'network': the session may still be valid, keep the user signed in and retry later.
// 'rejected': the server refused the session, sign out.
export type RefreshFailure = 'network' | 'rejected'

// The refresh route answers 401 for a missing or revoked refresh token (invalid_grant) and 503 for
// transient failures; timeouts, rate limits and other 5xx (e.g. a proxy) are treated as transient too
export function classifyRefreshStatus(status: number): RefreshFailure {
  if (status >= 500 || status === 408 || status === 429) return 'network'
  return 'rejected'
}

// A thrown error means the request didn't complete (offline, timeout, a non-JSON body from a
// captive portal), except a token missing the required scope, which needs a new sign-in
export function classifyRefreshError(error: unknown): RefreshFailure {
  if (error instanceof MissingScopeError) return 'rejected'
  return 'network'
}
