'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { REPO_URL } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, FlaskConical, Wallet } from 'lucide-react'

export default function LoginPage() {
  const { isAuthenticated, isLoading, error, signInWithGoogle, enterDemoMode } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary/10">
            <img src="/logo.png" alt="Logo" className="h-full w-full object-contain p-2" />
          </div>
          <CardTitle className="text-2xl">Personal Finance Explorer</CardTitle>
          <CardDescription>
            Connect to your Google Sheets or enter demo mode to explore the full application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3"
            size="lg"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </Button>

          <Button onClick={enterDemoMode} variant="secondary" className="w-full flex items-center justify-center gap-3" size="lg">
            <FlaskConical className="h-5 w-5" />
            Enter demo mode
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Google mode reads your spreadsheet. Demo mode generates sample transactions locally and supports reloading demo data.
          </p>

          <div className="flex justify-center gap-4 pt-4 border-t">
            <Link href="/terms" className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors underline underline-offset-4">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors underline underline-offset-4">
              Privacy Policy
            </Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors underline underline-offset-4">
              GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
