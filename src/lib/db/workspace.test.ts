import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../types'
import { buildRefs } from './rows'
import { insertTransaction } from './workspace'

/**
 * These tests never touch the network. They prove the duplicate-save guard in
 * `insertTransaction`: when the first attempt committed but its response was
 * lost, the retry hits the primary key, reads that row back and reports it as
 * the saved transaction instead of creating a second one or scary-failing.
 */

const refs = buildRefs(
  [{ id: 'acc-1', name: 'Bank', opening_balance: 1000 }],
  [{ id: 'cat-1', name: 'Groceries', kind: 'expense', color: '#10b981' }],
)

const values: Omit<Transaction, 'id'> = {
  date: '2026-10-26',
  type: 'expense',
  amount: 249.5,
  category: 'Groceries',
  account: 'Bank',
  note: 'Weekly shop',
}

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  occurred_on: '2026-10-26',
  type: 'expense' as const,
  amount: '249.50',
  category_id: 'cat-1',
  account_id: 'acc-1',
  to_account_id: null,
  note: 'Weekly shop',
}

const duplicate = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "transactions_pkey"',
}

/** `.rejects` is not in the Node compatibility shim, so assert it directly. */
async function expectRejection(promise: Promise<unknown>, pattern: RegExp) {
  let error: unknown
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  expect(error).toBeDefined()
  expect(String((error as Error)?.message ?? '')).toMatch(pattern)
}

/** A minimal PostgREST-shaped stub that records what was asked of it. */
function fakeClient(opts: { insertError?: unknown; existing?: typeof row | null }) {
  const calls: {
    tables: string[]
    inserts: Array<Record<string, unknown>>
    readIds: Array<[string, string]>
  } = { tables: [], inserts: [], readIds: [] }

  const client = {
    from(table: string) {
      calls.tables.push(table)
      return {
        insert(payload: Record<string, unknown>) {
          calls.inserts.push(payload)
          return {
            select: () => ({
              single: async () => ({
                data: opts.insertError ? null : row,
                error: opts.insertError ?? null,
              }),
            }),
          }
        },
        select: () => ({
          eq: (column: string, value: string) => {
            calls.readIds.push([column, value])
            return {
              maybeSingle: async () => ({
                data: opts.existing ?? null,
                error: null,
              }),
            }
          },
        }),
      }
    },
  }

  return { client, calls }
}

describe('insertTransaction', () => {
  it('sends the client-generated id so a retry is identifiable', async () => {
    const { client, calls } = fakeClient({})
    const saved = await insertTransaction(
      values,
      refs,
      '11111111-1111-4111-8111-111111111111',
      client as never,
    )

    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      occurred_on: '2026-10-26',
      amount: 249.5,
      category_id: 'cat-1',
      account_id: 'acc-1',
    })
    expect(saved).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      category: 'Groceries',
      account: 'Bank',
      amount: 249.5,
    })
  })

  it('treats a duplicate id as an already-saved retry and returns that row', async () => {
    const { client, calls } = fakeClient({ insertError: duplicate, existing: row })
    const saved = await insertTransaction(
      values,
      refs,
      '11111111-1111-4111-8111-111111111111',
      client as never,
    )

    expect(calls.inserts).toHaveLength(1)
    // The fallback reads only the same id; RLS still scopes it to this user.
    expect(calls.readIds).toEqual([
      ['id', '11111111-1111-4111-8111-111111111111'],
    ])
    expect(saved.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(saved.note).toBe('Weekly shop')
  })

  it('still reports a duplicate it cannot read back (never silently succeeds)', async () => {
    const { client } = fakeClient({ insertError: duplicate, existing: null })
    await expectRejection(
      insertTransaction(
        values,
        refs,
        '11111111-1111-4111-8111-111111111111',
        client as never,
      ),
      /already exists/i,
    )
  })

  it('does not hide other database errors as a duplicate', async () => {
    const { client } = fakeClient({
      insertError: { code: '42501', message: 'permission denied' },
    })
    await expectRejection(
      insertTransaction(
        values,
        refs,
        '11111111-1111-4111-8111-111111111111',
        client as never,
      ),
      /permission/i,
    )
  })

  it('does not try to read back when no pending id was supplied', async () => {
    const { client, calls } = fakeClient({ insertError: duplicate })
    await expectRejection(
      insertTransaction(values, refs, undefined, client as never),
      /already exists/i,
    )
    expect(calls.readIds).toHaveLength(0)
  })
})
