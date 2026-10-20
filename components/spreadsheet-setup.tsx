'use client'

import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { TEMPLATE_COPY_URL } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Copy, FileSpreadsheet, LogOut } from 'lucide-react'

export function SpreadsheetSetup() {
  const { signOut } = useAuth()
  const { spreadsheet, accessError, pickerError, isPicking, chooseSpreadsheet } = useSpreadsheet()
  const error = pickerError ?? accessError

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Choose your spreadsheet</CardTitle>
          <CardDescription>
            Select the Google Sheet with your transactions. The app can only access the file you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
                {spreadsheet?.name && ` (${spreadsheet.name})`}
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={() => void chooseSpreadsheet()} disabled={isPicking} className="w-full flex items-center justify-center gap-3" size="lg">
            <FileSpreadsheet className="h-5 w-5" />
            {isPicking ? 'Opening Google Drive...' : 'Select from Google Drive'}
          </Button>

          <Button asChild variant="secondary" className="w-full flex items-center justify-center gap-3" size="lg">
            <a href={TEMPLATE_COPY_URL} target="_blank" rel="noopener noreferrer">
              <Copy className="h-5 w-5" />
              Make a copy of the template
            </a>
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            New here? Copy the template to your Drive, then select the copy above.
          </p>

          <div className="flex justify-center pt-4 border-t">
            <Button variant="ghost" size="sm" onClick={signOut} className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
