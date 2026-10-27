import { describe, expect, it } from 'vitest'
import type { TransactionDraft } from './transactionForm'
import {
  clearDraft,
  draftKey,
  hasDraftContent,
  parseStoredDraft,
  readDraft,
  writeDraft,
  type DraftStorage,
} from './draftStorage'

class MemoryStorage implements DraftStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

const USER = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaa1'
const OTHER = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbb2'
const NOW = new Date('2026-10-26T10:00:00.000Z').getTime()

const draft: TransactionDraft = {
  type: 'expense',
  amount: '249.50',
  date: '2026-10-25',
  category: 'Groceries',
  account: 'Bank',
  toAccount: 'Cash',
  note: 'Weekly shop',
}

describe('draft round-trip', () => {
  it('restores exactly what was typed, with the same pending id', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW)
    const restored = readDraft(storage, USER, NOW + 1000)
    expect(restored?.values).toEqual(draft)
    expect(restored?.pendingId).toBe('pending-1')
    expect(restored?.userId).toBe(USER)
  })

  it('keeps one user’s draft away from another user', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW)
    expect(readDraft(storage, OTHER, NOW)).toBeNull()
  })

  it('clears only that user’s key', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW)
    clearDraft(storage, USER)
    expect(storage.getItem(draftKey(USER))).toBeNull()
    expect(readDraft(storage, USER, NOW)).toBeNull()
  })
})

describe('draft expiry and corruption', () => {
  it('expires after seven days', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW)
    expect(readDraft(storage, USER, NOW + 7 * 24 * 60 * 60 * 1000 + 1)).toBeNull()
  })

  it('ignores malformed JSON instead of throwing', () => {
    expect(parseStoredDraft('{nope', USER, NOW)).toBeNull()
  })

  it('ignores a draft missing required fields', () => {
    const storage = new MemoryStorage()
    storage.setItem(draftKey(USER), JSON.stringify({ version: 1, userId: USER }))
    expect(readDraft(storage, USER, NOW)).toBeNull()
  })

  it('rejects a finished save that was written for a different document shape', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW)
    const raw = JSON.parse(storage.getItem(draftKey(USER)) as string)
    raw.version = 99
    storage.setItem(draftKey(USER), JSON.stringify(raw))
    expect(readDraft(storage, USER, NOW)).toBeNull()
  })

  it('rejects timestamps far in the future', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER, 'pending-1', draft, NOW + 60 * 60 * 1000)
    expect(readDraft(storage, USER, NOW)).toBeNull()
  })

  it('does not throw when storage is unavailable', () => {
    const broken: DraftStorage = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
      removeItem() {
        throw new Error('blocked')
      },
    }
    expect(() => writeDraft(broken, USER, 'pending-1', draft)).not.toThrow()
    expect(readDraft(broken, USER)).toBeNull()
    expect(() => clearDraft(broken, USER)).not.toThrow()
  })
})

describe('hasDraftContent', () => {
  it('is false for a freshly opened empty form', () => {
    expect(
      hasDraftContent({
        type: 'expense',
        amount: '',
        date: '2026-10-26',
        category: '',
        account: 'Bank',
        toAccount: '',
        note: '',
      }),
    ).toBe(false)
  })

  it('is true once an amount, category or note is entered', () => {
    expect(hasDraftContent({ ...draft, amount: '1' })).toBe(true)
    expect(hasDraftContent({ ...draft, amount: '', note: 'coffee' })).toBe(true)
    expect(hasDraftContent({ ...draft, amount: '', note: '', category: 'Rent' })).toBe(true)
  })
})
