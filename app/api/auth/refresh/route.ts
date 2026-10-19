import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createOAuth2Client, COOKIE_NAME, getRefreshCookieOptions } from '@/lib/auth-server'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get(COOKIE_NAME)?.value

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
    }

    const oauth2Client = createOAuth2Client()
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    })

    const { credentials } = await oauth2Client.refreshAccessToken()
    const rotatedRefreshToken = credentials.refresh_token ?? refreshToken

    cookieStore.set(COOKIE_NAME, rotatedRefreshToken, getRefreshCookieOptions())

    return NextResponse.json({
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      scope: credentials.scope,
    })
  } catch (error: any) {
    console.error('Refresh error:', error)

    // Only a revoked/expired refresh token means the session is gone. Transient failures
    // (network, Google 5xx) must keep the cookie so the next attempt can succeed.
    if (isInvalidGrant(error)) {
      const cookieStore = await cookies()
      cookieStore.delete(COOKIE_NAME)
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Token refresh failed, try again' }, { status: 503 })
  }
}

function isInvalidGrant(error: any): boolean {
  return error?.response?.data?.error === 'invalid_grant' || error?.message === 'invalid_grant'
}
