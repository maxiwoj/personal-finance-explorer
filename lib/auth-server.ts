import { google } from 'googleapis'
import { GOOGLE_CLIENT_ID } from './config'

export const COOKIE_NAME = 'pfe_refresh_token'
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
}

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  }
}
