import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transaction } from '../types'
import type { WorkspaceRefs } from './db/rows'
import {
  deleteBudgetRow,
  deleteCategoryRow,
  deleteTransactionRow,
  ensureStarterData,
  insertCategory,
  insertTransaction,
  loadWorkspace,
  restoreTransactionRow,
  saveBudgetRow,
  updateCategoryRow,
  updateTransactionRow,
  type WorkspaceData,
} from './db/workspace'
import type { CategoryDraft } from './categoryForm'
import type { CategoryDef } from '../types'

const EMPTY: WorkspaceData = {
  accounts: [],
  categories: [],
  budgets: [],
  transactions: [],
}

/** How stale the screen may get before focusing the tab triggers a reload. */
const FOCUS_REFRESH_AFTER_MS = 5_000

/** Same-browser tabs announce writes on this channel. */
const SYNC_CHANNEL = 'expense-tracker-sync'

interface SyncMessage {
  type: 'changed'
  userId: string
}

/**
 * Owns the signed-in user's data: loads it once, keeps it in React state, and
 * writes every change through to Supabase before updating that state.
 *
 * A failed write throws, so the caller can show the message and keep the
 * user's typing intact.
 *
 * Synchronisation model:
 *   - every write is committed by Supabase first, then mirrored into state
 *   - another tab in this browser is told to reload over BroadcastChannel
 *   - returning to the tab (focus / visibilitychange / back online) reloads
 *     silently when the last successful load is older than five seconds
 *   - other devices see changes on their next load, refresh or focus; there
 *     is no live push subscription, and the UI says "last synced" rather
 *     than pretending otherwise
 */
export function useWorkspace(userId: string | undefined) {
  const [data, setData] = useState<WorkspaceData>(EMPTY)
  const [refs, setRefs] = useState<WorkspaceRefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  const aliveRef = useRef(true)
  /** Shared in-flight seeding so a double-mounted effect seeds only once. */
  const seedingRef = useRef<Promise<boolean> | null>(null)
  /** Ignores a slow response that a newer load has already replaced. */
  const requestSeqRef = useRef(0)
  /** A reload that began before a local write must not overwrite it. */
  const mutationSeqRef = useRef(0)
  const lastLoadAtRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const load = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      if (!userId) return false
      const silent = opts?.silent === true
      const seq = ++requestSeqRef.current
      const mutationsAtStart = mutationSeqRef.current

      if (!silent) {
        setLoading(true)
        setError(null)
      } else {
        setSyncing(true)
      }

      try {
        let snapshot = await loadWorkspace()

        // First sign-in on a fresh account: create the starter accounts and
        // categories, then re-read so ids and names line up. Another device
        // may seed at the same moment; those inserts are idempotent.
        if (snapshot.data.accounts.length === 0 || snapshot.data.categories.length === 0) {
          if (!seedingRef.current) seedingRef.current = ensureStarterData()
          const seeded = await seedingRef.current
          seedingRef.current = null
          if (seeded) snapshot = await loadWorkspace()
        }

        if (!aliveRef.current || seq !== requestSeqRef.current) return false
        // A transaction was saved while this reload was in flight; its result
        // is newer than this snapshot.
        if (mutationSeqRef.current !== mutationsAtStart) return false

        setData(snapshot.data)
        setRefs(snapshot.refs)
        setLastSyncedAt(new Date())
        setSyncError(null)
        lastLoadAtRef.current = Date.now()
        return true
      } catch (err) {
        if (!aliveRef.current || seq !== requestSeqRef.current) return false
        const message = err instanceof Error ? err.message : 'Could not load your data.'
        // A background refresh must not blank the screen: keep what is on
        // screen and let the banner explain that it may be out of date.
        if (silent) setSyncError(message)
        else setError(message)
        return false
      } finally {
        if (aliveRef.current && seq === requestSeqRef.current) {
          if (!silent) setLoading(false)
          else setSyncing(false)
        }
      }
    },
    [userId],
  )

  useEffect(() => {
    aliveRef.current = true
    void load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  const refresh = useCallback(() => load({ silent: true }), [load])

  /** Tell other tabs in this browser that the user's rows changed. */
  const announceChange = useCallback(() => {
    if (!userId) return
    const message: SyncMessage = { type: 'changed', userId }
    channelRef.current?.postMessage(message)
  }, [userId])

  /** Every successful write passes through here. */
  const markSynced = useCallback(() => {
    mutationSeqRef.current += 1
    setLastSyncedAt(new Date())
    setSyncError(null)
    lastLoadAtRef.current = Date.now()
    announceChange()
  }, [announceChange])

  useEffect(() => {
    if (!userId) return

    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SYNC_CHANNEL)
    if (channel) {
      channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        if (event.data?.type !== 'changed' || event.data.userId !== userId) return
        void refresh()
      }
      channelRef.current = channel
    }

    return () => {
      channelRef.current = null
      channel?.close()
    }
  }, [userId, refresh])

  useEffect(() => {
    if (!userId) return

    const refreshIfStale = () => {
      if (document.visibilityState === 'hidden') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (Date.now() - lastLoadAtRef.current < FOCUS_REFRESH_AFTER_MS) return
      void refresh()
    }

    const handleOnline = () => {
      setOnline(true)
      void refresh()
    }
    const handleOffline = () => setOnline(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfStale()
    }

    window.addEventListener('focus', refreshIfStale)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', refreshIfStale)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [userId, refresh])

  const requireRefs = useCallback((): WorkspaceRefs => {
    if (!refs) {
      throw new Error('Your accounts and categories are still loading. Try again in a moment.')
    }
    return refs
  }, [refs])

  const addTransaction = useCallback(
    async (values: Omit<Transaction, 'id'>, pendingId?: string) => {
      const created = await insertTransaction(values, requireRefs(), pendingId)
      setData((prev) => ({
        ...prev,
        // A retry of an already-saved draft returns that same row.
        transactions: prev.transactions.some((tx) => tx.id === created.id)
          ? prev.transactions
          : [created, ...prev.transactions],
      }))
      markSynced()
      return created
    },
    [requireRefs, markSynced],
  )

  const updateTransaction = useCallback(
    async (id: string, values: Omit<Transaction, 'id'>) => {
      const updated = await updateTransactionRow(id, values, requireRefs())
      setData((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) => (tx.id === id ? updated : tx)),
      }))
      markSynced()
      return updated
    },
    [requireRefs, markSynced],
  )

  const saveBudget = useCallback(
    async (category: string, monthlyLimit: number, monthKey: string) => {
      const saved = await saveBudgetRow(category, monthlyLimit, monthKey, requireRefs())
      setData((prev) => ({
        ...prev,
        budgets: [
          ...prev.budgets.filter(
            (b) => !(b.category === category && b.month === monthKey),
          ),
          saved,
        ].sort(
          (a, b) =>
            a.month.localeCompare(b.month) || a.category.localeCompare(b.category),
        ),
      }))
      markSynced()
      return saved
    },
    [requireRefs, markSynced],
  )

  const deleteBudget = useCallback(
    async (category: string, monthKey: string) => {
      await deleteBudgetRow(category, monthKey, requireRefs())
      setData((prev) => ({
        ...prev,
        budgets: prev.budgets.filter(
          (b) => !(b.category === category && b.month === monthKey),
        ),
      }))
      markSynced()
    },
    [requireRefs, markSynced],
  )

  const deleteTransaction = useCallback(
    async (id: string) => {
      await deleteTransactionRow(id)
      setData((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((tx) => tx.id !== id),
      }))
      markSynced()
    },
    [markSynced],
  )

  const restoreTransaction = useCallback(
    async (tx: Transaction) => {
      const restored = await restoreTransactionRow(tx, requireRefs())
      setData((prev) => ({
        ...prev,
        transactions: [restored, ...prev.transactions],
      }))
      markSynced()
      return restored
    },
    [requireRefs, markSynced],
  )

  /**
   * Create a category or change an existing one, then re-read everything so
   * names, charts, budgets and the id lookup tables all agree again.
   *
   * The write has already succeeded by the time the re-read runs: if that
   * re-read fails, the change is still in the database, so this only records
   * a sync warning instead of reporting the save as failed (which would
   * invite the user to submit it twice).
   */
  const saveCategory = useCallback(
    async (current: CategoryDef | null, values: CategoryDraft) => {
      if (current) await updateCategoryRow(current.name, values, requireRefs())
      else await insertCategory(values)
      mutationSeqRef.current += 1
      const refreshed = await refresh()
      if (refreshed) setLastSyncedAt(new Date())
      announceChange()
    },
    [requireRefs, refresh, announceChange],
  )

  const deleteCategory = useCallback(
    async (name: string) => {
      await deleteCategoryRow(name, requireRefs())
      mutationSeqRef.current += 1
      const refreshed = await refresh()
      if (refreshed) setLastSyncedAt(new Date())
      announceChange()
    },
    [requireRefs, refresh, announceChange],
  )

  return {
    data,
    loading,
    error,
    syncing,
    syncError,
    lastSyncedAt,
    online,
    reload: () => load(),
    refresh,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveBudget,
    deleteBudget,
    restoreTransaction,
    saveCategory,
    deleteCategory,
  }
}
