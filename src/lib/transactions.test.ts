import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import {
  addTransaction,
  editTransaction,
  newTransactionId,
  removeTransaction,
  restoreTransaction,
} from './transactions'

const base: Transaction[] = [
  {
    id: 'a',
    date: '2026-10-03',
    type: 'expense',
    amount: 500,
    category: 'Groceries',
    account: 'SBI Bank',
    note: 'Vegetables',
  },
  {
    id: 'b',
    date: '2026-10-02',
    type: 'income',
    amount: 9000,
    category: 'Freelance',
    account: 'SBI Bank',
    note: 'Invoice 14',
  },
]

const values = {
  date: '2026-10-04',
  type: 'expense' as const,
  amount: 120,
  category: 'Transport',
  account: 'Cash',
  note: 'Auto fare',
}

describe('addTransaction', () => {
  it('adds a new record at the top with a fresh id', () => {
    const next = addTransaction(base, values)
    expect(next).toHaveLength(3)
    expect(next[0]).toMatchObject(values)
    expect(next[0].id).toBeTruthy()
    expect(next[0].id).not.toBe('a')
  })

  it('does not mutate the original list', () => {
    addTransaction(base, values)
    expect(base).toHaveLength(2)
  })

  it('never reuses an id', () => {
    const ids = new Set([
      newTransactionId(),
      newTransactionId(),
      newTransactionId(),
      newTransactionId(),
    ])
    expect(ids.size).toBe(4)
  })
})

describe('editTransaction', () => {
  it('replaces the fields but keeps the id and position', () => {
    const next = editTransaction(base, 'b', { ...values, note: 'Corrected' })
    expect(next).toHaveLength(2)
    expect(next[1].id).toBe('b')
    expect(next[1].note).toBe('Corrected')
    expect(next[1].amount).toBe(120)
    expect(next[0]).toEqual(base[0])
  })

  it('leaves the list unchanged for an unknown id', () => {
    const next = editTransaction(base, 'missing', values)
    expect(next).toEqual(base)
  })

  it('does not mutate the original list', () => {
    editTransaction(base, 'a', values)
    expect(base[0].amount).toBe(500)
  })
})

describe('removeTransaction', () => {
  it('removes only the matching record', () => {
    const next = removeTransaction(base, 'a')
    expect(next.map((t) => t.id)).toEqual(['b'])
  })

  it('is a no-op for an unknown id', () => {
    expect(removeTransaction(base, 'missing')).toEqual(base)
  })
})

describe('restoreTransaction', () => {
  it('puts a deleted record back', () => {
    const removed = base[0]
    const afterDelete = removeTransaction(base, removed.id)
    const restored = restoreTransaction(afterDelete, removed)
    expect(restored.map((t) => t.id)).toEqual(['a', 'b'])
    expect(restored[0]).toEqual(removed)
  })

  it('does not duplicate a record that is already present', () => {
    expect(restoreTransaction(base, base[0])).toEqual(base)
  })
})
