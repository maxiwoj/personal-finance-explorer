'use client'

import { useState } from 'react'
import { DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/lib/types'
import { useDefaultCurrency } from '@/hooks/use-transactions'

export type AmountField = 'amountPLN' | 'amountOriginal'

export interface AmountFilterValue {
  min: number | null
  max: number | null
  field: AmountField
}

interface AmountFilterProps {
  value: AmountFilterValue
  onChange: (value: AmountFilterValue) => void
  className?: string
}

export function AmountFilter({ value, onChange, className }: AmountFilterProps) {
  const defaultCurrency = useDefaultCurrency()
  const [open, setOpen] = useState(false)
  const [minInput, setMinInput] = useState(value.min !== null ? String(value.min) : '')
  const [maxInput, setMaxInput] = useState(value.max !== null ? String(value.max) : '')

  const hasFilter = value.min !== null || value.max !== null

  const apply = () => {
    const min = minInput !== '' ? parseFloat(minInput) : null
    const max = maxInput !== '' ? parseFloat(maxInput) : null
    onChange({ ...value, min, max })
    setOpen(false)
  }

  const clear = () => {
    setMinInput('')
    setMaxInput('')
    onChange({ min: null, max: null, field: value.field })
    setOpen(false)
  }

  const label = hasFilter
    ? [
        value.min !== null ? `≥ ${value.min}` : null,
        value.max !== null ? `≤ ${value.max}` : null,
      ]
        .filter(Boolean)
        .join(', ') + (value.field === 'amountPLN' ? ` ${defaultCurrency}` : ' orig.')
    : 'Amount range'

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setMinInput(value.min !== null ? String(value.min) : '')
          setMaxInput(value.max !== null ? String(value.max) : '')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 px-3 justify-start font-normal', !hasFilter && 'text-muted-foreground', className)}
        >
          <DollarSign className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-4" align="start">
        <div className="space-y-1">
          <p className="text-sm font-medium">Filter on</p>
          <ToggleGroup
            type="single"
            value={value.field}
            onValueChange={(v) => v && onChange({ ...value, field: v as AmountField })}
            className="justify-start"
          >
            <ToggleGroupItem value="amountPLN" className="h-8 text-xs">
              {defaultCurrency} (converted)
            </ToggleGroupItem>
            <ToggleGroupItem value="amountOriginal" className="h-8 text-xs">
              Original currency
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            className="h-8 text-sm"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={apply} className="flex-1">
            Apply
          </Button>
          {hasFilter && (
            <Button size="sm" variant="outline" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function filterByAmount(
  transactions: Transaction[],
  filter: AmountFilterValue
): Transaction[] {
  const { min, max, field } = filter
  if (min === null && max === null) return transactions
  return transactions.filter((t) => {
    const amount = Math.abs(t[field])
    if (min !== null && amount < min) return false
    if (max !== null && amount > max) return false
    return true
  })
}
