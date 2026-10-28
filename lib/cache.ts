import { openDB, type IDBPDatabase } from 'idb'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { withoutErrors } from './query-persistence'

const DB_NAME = 'finance-explorer'
const DB_VERSION = 1
const QUERY_CACHE_PREFIX = 'query-cache:'
// Query cache changes come in bursts (a batch of queries settling); one write per second is enough
const WRITE_THROTTLE_MS = 1000

interface CacheDB {
  cache: {
    key: string
    value: unknown
  }
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null
// Bumped by clearCache, so a write scheduled before a clear can't bring the cleared data back
let generation = 0

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<CacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache')
        }
      },
    })
  }
  return dbPromise
}

// Stores the React Query cache under one key per scope (see persistScopeKey). IndexedDB keeps
// values as structured clones, so transaction timestamps come back as Dates.
export function createQueryPersister(scope: string): Persister {
  const key = `${QUERY_CACHE_PREFIX}${scope}`
  const createdIn = generation
  let latest: PersistedClient | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const write = async () => {
    timer = null
    const client = latest
    latest = null
    if (!client) return
    try {
      const db = await getDB()
      if (createdIn !== generation) return
      await db.put('cache', withoutErrors(client), key)
    } catch (error) {
      console.error('Failed to cache data:', error)
    }
  }

  return {
    async persistClient(client) {
      latest = client
      timer ??= setTimeout(() => void write(), WRITE_THROTTLE_MS)
    },
    async restoreClient() {
      const db = await getDB()
      return (await db.get('cache', key)) as PersistedClient | undefined
    },
    async removeClient() {
      try {
        const db = await getDB()
        await db.delete('cache', key)
      } catch (error) {
        console.error('Failed to remove cached data:', error)
      }
    },
  }
}

// Every user's and spreadsheet's cached data
export async function clearCache(): Promise<void> {
  generation++
  try {
    const db = await getDB()
    await db.clear('cache')
  } catch (error) {
    console.error('Failed to clear cache:', error)
  }
}
