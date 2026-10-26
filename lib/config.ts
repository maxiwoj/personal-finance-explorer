import { Camera, Github, Linkedin } from 'lucide-react'

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
// Optional default spreadsheet; users can pick their own via Google Picker
export const SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID || ''
// Google Picker requires an API key and the Cloud project number (app ID)
export const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''
export const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || ''

// Configurable sheet names
export const SHEETS = {
  RECENT: 'expenses2',  // ~100-200 rows, last 3 months
  FULL: 'expenses',     // Full transaction history
  CATEGORIES: 'categories', // Optional: category order (column A) and colors (column B)
}

// Per-file access: only spreadsheets the user picks (or the app creates) are reachable
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const TEMPLATE_SPREADSHEET_ID = '1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo'
export const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SPREADSHEET_ID}/copy`

export const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export const REPO_URL = 'https://github.com/maxiwoj/personal-finance-explorer-rs'

// Author's profiles, shown in the app footer; add new entries here
export const AUTHOR = {
  name: 'Maksymilian Wojczuk',
  links: [
    { label: 'GitHub', href: 'https://github.com/maxiwoj', icon: Github },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/maksymilian-wojczuk-53a669121', icon: Linkedin },
    { label: 'Photography', href: 'https://mwojczuk.photo', icon: Camera },
  ],
}
