import { AuthorLinks } from '@/components/author-links'
import { OpenSourceNotice } from '@/components/open-source-notice'

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <OpenSourceNotice />
        <AuthorLinks />
      </div>
    </footer>
  )
}
