'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TransactionForm } from '@/components/transaction-form'
import { CheckCircle2 } from 'lucide-react'

export default function AddTransactionPage() {
  // Bumping the key remounts the form, clearing it for the next entry
  const [formKey, setFormKey] = useState(0)
  const [saved, setSaved] = useState(false)

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Transaction</CardTitle>
          <CardDescription>Saved to your spreadsheet with the current date and time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {saved && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Transaction added.</AlertDescription>
            </Alert>
          )}
          <TransactionForm
            key={formKey}
            onSaved={() => {
              setSaved(true)
              setFormKey(key => key + 1)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
