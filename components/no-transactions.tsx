import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

// A page's empty state when the spreadsheet has no transactions yet, e.g. right after the
// template's sample data was cleared
export function NoTransactions({ message = 'No transactions found in your spreadsheet.' }: { message?: string }) {
  return (
    <div className="text-center py-20 space-y-4">
      <p className="text-muted-foreground">{message}</p>
      <Button asChild>
        <Link href="/add">
          <Plus className="h-4 w-4" />
          Add transaction
        </Link>
      </Button>
    </div>
  )
}
