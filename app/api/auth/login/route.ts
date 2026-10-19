import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createOAuth2Client, COOKIE_NAME, getRefreshCookieOptions } from '@/lib/auth-server'

export async function POST(request: Request) {
  try {
    const { code } = await request.json()

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    const oauth2Client = createOAuth2Client()
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: 'postmessage',
    })

    const cookieStore = await cookies()
    const existingRefreshToken = cookieStore.get(COOKIE_NAME)?.value
    const refreshToken = tokens.refresh_token ?? existingRefreshToken

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Google did not return a refresh token. Re-consent is required to enable persistent login.' },
        { status: 400 }
      )
    }

    cookieStore.set(COOKIE_NAME, refreshToken, getRefreshCookieOptions())

    return NextResponse.json({
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({ error: error.message || 'Authentication failed' }, { status: 500 })
  }
}
