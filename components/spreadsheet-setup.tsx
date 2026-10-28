'use client'

import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { SHEETS, TEMPLATE_COPY_URL } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Footer } from '@/components/footer'
import { useSignOutWithWarning } from '@/components/outbox-status'
import { AlertCircle, Copy, FileSpreadsheet, LogOut } from 'lucide-react'

export function SpreadsheetSetup() {
  const { requestSignOut, dialog: signOutDialog } = useSignOutWithWarning()
  const { spreadsheet, accessError, pickerError, isPicking, chooseSpreadsheet } = useSpreadsheet()
  // The deployment default is only reachable by its owner; for everyone else its failure just means "nothing chosen yet"
  const error = pickerError ?? (spreadsheet?.isDefault ? null : accessError)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Choose your spreadsheet</CardTitle>
            <CardDescription>
              The app reads your transactions from a Google Sheet. It can only access the file you select.
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

            <p className="text-sm text-muted-foreground">
              Already have a spreadsheet in the template format? Select it from your Google Drive.
            </p>

            <Button onClick={() => void chooseSpreadsheet()} disabled={isPicking} className="w-full flex items-center justify-center gap-3" size="lg">
              <FileSpreadsheet className="h-5 w-5" />
              {isPicking ? 'Opening Google Drive...' : 'Select from Google Drive'}
            </Button>

            <p className="text-sm text-muted-foreground pt-4 border-t">
              New here? Copy the template to your Google Drive. It contains sample transactions: delete them from
              the <strong>{SHEETS.FULL}</strong> tab before adding your own. Then come back and select the copy above.
            </p>

            <Button asChild variant="secondary" className="w-full flex items-center justify-center gap-3" size="lg">
              <a href={TEMPLATE_COPY_URL} target="_blank" rel="noopener noreferrer">
                <Copy className="h-5 w-5" />
                Make a copy of the template
              </a>
            </Button>

            <div className="flex justify-center pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={requestSignOut} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
      {signOutDialog}
    </div>
  )
}
