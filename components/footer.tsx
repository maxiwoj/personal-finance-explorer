import { AUTHOR_LINKS, REPO_URL } from '@/lib/config'

const linkClassName = 'hover:text-primary transition-colors underline underline-offset-4'

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          Source on GitHub
        </a>
        <span aria-hidden="true">·</span>
        <span>More from the author:</span>
        {AUTHOR_LINKS.map(({ label, href }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            {label}
          </a>
        ))}
      </div>
    </footer>
  )
}
