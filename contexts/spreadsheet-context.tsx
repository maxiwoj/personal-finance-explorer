'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { SPREADSHEET_ID } from '@/lib/config'
import { clearCache } from '@/lib/cache'
import { pickSpreadsheet, type PickedSpreadsheet } from '@/lib/google-picker'

const SELECTION_KEY_PREFIX = 'pfe_spreadsheet_'

export interface SelectedSpreadsheet {
  id: string
  name: string | null
  // True when the deployment's NEXT_PUBLIC_SPREADSHEET_ID is used instead of a user pick
  isDefault: boolean
}

interface SpreadsheetContextType {
  spreadsheet: SelectedSpreadsheet | null
  accessError: string | null
  isPicking: boolean
  pickerError: string | null
  chooseSpreadsheet: () => Promise<void>
  reportAccessError: (message: string) => void
}

const SpreadsheetContext = createContext<SpreadsheetContextType | null>(null)

// Keyed by Google user id so multiple accounts in one browser don't overwrite each other's choice
function storageKey(userId: string | null) {
  return `${SELECTION_KEY_PREFIX}${userId ?? 'anonymous'}`
}

function readStoredSelection(userId: string | null): PickedSpreadsheet | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.id === 'string' ? { id: parsed.id, name: parsed.name ?? '' } : null
  } catch {
    return null
  }
}

function writeStoredSelection(userId: string | null, selection: PickedSpreadsheet) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(selection))
  } catch (error) {
    console.error('Failed to store selected spreadsheet:', error)
  }
}

export function SpreadsheetProvider({ children }: { children: ReactNode }) {
  const { mode, accessToken, userId } = useAuth()
  const queryClient = useQueryClient()
  // Bumped after a pick so the stored selection is re-read
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  useEffect(() => {
    setAccessError(null)
  }, [mode, userId])

  // Read synchronously so the first fetch never targets the default sheet by mistake
  const spreadsheet = useMemo<SelectedSpreadsheet | null>(() => {
    if (mode !== 'google') return null
    const stored = readStoredSelection(userId)
    if (stored) return { id: stored.id, name: stored.name || null, isDefault: false }
    if (SPREADSHEET_ID) return { id: SPREADSHEET_ID, name: null, isDefault: true }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId, selectionVersion])

  const chooseSpreadsheet = useCallback(async () => {
    if (!accessToken) return

    setIsPicking(true)
    setPickerError(null)
    try {
      const picked = await pickSpreadsheet(accessToken)
      if (!picked) return

      writeStoredSelection(userId, picked)
      // Cached transactions belong to the previous spreadsheet
      await clearCache()
      setSelectionVersion((v) => v + 1)
      setAccessError(null)
      await queryClient.resetQueries()
    } catch (error) {
      console.error('Spreadsheet picker error:', error)
      setPickerError(error instanceof Error ? error.message : 'Failed to open Google Picker')
    } finally {
      setIsPicking(false)
    }
  }, [accessToken, queryClient, userId])

  const reportAccessError = useCallback((message: string) => {
    setAccessError(message)
  }, [])

  return (
    <SpreadsheetContext.Provider
      value={{ spreadsheet, accessError, isPicking, pickerError, chooseSpreadsheet, reportAccessError }}
    >
      {children}
    </SpreadsheetContext.Provider>
  )
}

export function useSpreadsheet() {
  const context = useContext(SpreadsheetContext)
  if (!context) {
    throw new Error('useSpreadsheet must be used within a SpreadsheetProvider')
  }
  return context
}
