import { REPO_URL } from '@/lib/config'
import { Github } from 'lucide-react'

export function OpenSourceNotice() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      <Github className="h-4 w-4" />
      <span>
        Free and open source. <span className="underline underline-offset-4">View on GitHub</span>
      </span>
    </a>
  )
}
