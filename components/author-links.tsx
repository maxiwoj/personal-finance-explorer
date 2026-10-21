import { AUTHOR } from '@/lib/config'
import { Button } from '@/components/ui/button'

export function AuthorLinks() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
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
  )
}
