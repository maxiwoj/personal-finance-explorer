'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileFoldProps {
  label: string
  icon?: LucideIcon
  // Shown next to the label while folded, e.g. the active filters
  summary?: ReactNode
  className?: string
  contentClassName?: string
  children: ReactNode
}

// Folded behind a toggle on mobile; always shown from the md breakpoint up.
// Content stays mounted while folded, so popovers and inputs keep their state.
export function MobileFold({ label, icon: Icon, summary, className, contentClassName, children }: MobileFoldProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="md:hidden flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm font-medium"
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="shrink-0">{label}</span>
          {summary && <span className="truncate text-xs font-normal text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <div className={cn(!open && 'max-md:hidden', open && 'max-md:mt-3', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
