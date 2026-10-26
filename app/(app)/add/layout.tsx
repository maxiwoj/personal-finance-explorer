import type { Metadata } from 'next'

// Also the label iOS suggests when this page is added to the Home Screen
export const metadata: Metadata = {
  title: 'Add transaction',
}

export default function AddTransactionLayout({ children }: { children: React.ReactNode }) {
  return children
}
