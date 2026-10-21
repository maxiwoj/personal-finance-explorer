import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <Button variant="ghost" asChild className="-ml-4">
          <Link href="/login" className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Login
          </Link>
        </Button>

        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </header>

        <section className="space-y-4 text-pretty">
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p>
            Your privacy is important to us. This Privacy Policy explains how Personal Finance Explorer
            collects, uses, and protects your information when you use our service.
          </p>

          <h2 className="text-xl font-semibold">2. Information We Collect</h2>
          <p>
            We collect the following types of information:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Google Account Information:</strong> To authenticate you and access the Google Sheet you select.</li>
            <li><strong>Financial Data:</strong> Data from your spreadsheets is read, and written when you add or edit a transaction, but not stored on our servers.</li>
            <li><strong>Usage Data:</strong> We may collect anonymized usage statistics to improve our service.</li>
          </ul>

          <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
          <p>
            We use your Google account information solely to provide the visualization and analysis features of the app.
            We do not share your financial data with any third parties.
          </p>

          <h2 className="text-xl font-semibold">4. Data Storage and Security</h2>
          <p>
            Personal Finance Explorer follows a "privacy-first" approach. Your financial transactions are fetched
            dynamically and are not persisted in our database. We use industry-standard security measures to
            protect your connection to Google services.
          </p>

          <h2 className="text-xl font-semibold">5. Third-Party Services</h2>
          <p>
            We use Google OAuth for authentication, Google Picker to let you select a spreadsheet, and Google Sheets API
            to read your financial data and save the transactions you add or edit. The app requests per-file Google Drive access, so it can only access files
            you select or create with it. Your selected spreadsheet is remembered in your browser&apos;s local storage.
            Please refer to Google's Privacy Policy for more information on how they handle your data.
          </p>

          <h2 className="text-xl font-semibold">6. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at support@example.com.
          </p>
        </section>

        <footer className="pt-8 border-t text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Personal Finance Explorer. All rights reserved.
        </footer>
      </div>
    </div>
  )
}
