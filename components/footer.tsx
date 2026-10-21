import { AUTHOR } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { OpenSourceNotice } from '@/components/open-source-notice'

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <OpenSourceNotice />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Built by {AUTHOR.name}</span>
          <div className="flex items-center">
            {AUTHOR.links.map(({ label, href, icon: Icon }) => (
              <Button key={href} asChild variant="ghost" size="icon" className="h-8 w-8">
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                  <Icon className="h-4 w-4" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
