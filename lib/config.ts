export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
// Optional default spreadsheet; users can pick their own via Google Picker
export const SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID || ''
// Google Picker requires an API key and the Cloud project number (app ID)
export const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''
export const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || ''
export const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000'

// Configurable sheet names
export const SHEETS = {
  RECENT: 'expenses2',  // ~100-200 rows, last 3 months
  FULL: 'expenses',     // Full transaction history
}

// Per-file access: only spreadsheets the user picks (or the app creates) are reachable
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const TEMPLATE_SPREADSHEET_ID = '1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo'
export const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SPREADSHEET_ID}/copy`

export const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export const REPO_URL = 'https://github.com/maxiwoj/personal-finance-explorer-rs'
// TODO: set the LinkedIn profile URL; links with an empty href are not rendered
export const LINKEDIN_URL = ''
// Author's other work, shown in the app footer; add new entries here
export const AUTHOR_LINKS = [
  { label: 'GitHub', href: 'https://github.com/maxiwoj' },
  { label: 'LinkedIn', href: LINKEDIN_URL },
  { label: 'Photography', href: 'https://mwojczuk.photo' },
].filter(({ href }) => href)
