import { describe, expect, it } from 'vitest'
import type { AccountDef, BudgetDef, CategoryDef, Transaction } from '../types'
import {
  EXPORT_SCHEMA,
  buildExportBundle,
  csvCell,
  exportFilename,
  jsonExportText,
  money,
  reportCsvFilename,
  transactionsToCsv,
} from './exportData'

const accounts: AccountDef[] = [
  { name: 'Bank', openingBalance: 2500 },
  { name: 'Cash', openingBalance: 0.1 },
]
const categories: CategoryDef[] = [
  { name: 'Groceries', type: 'expense', color: '#10b981' },
  { name: 'Salary', type: 'income', color: '#0ea5e9' },
]
const budgets: BudgetDef[] = [
  { category: 'Groceries', monthlyLimit: 8000, month: '2026-10' },
]
const transactions: Transaction[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    date: '2026-10-05',
    type: 'expense',
    amount: 187.5,
    category: 'Groceries',
    account: 'Bank',
    note: 'Market',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    date: '2026-10-01',
    type: 'transfer',
    amount: 500,
    account: 'Bank',
    toAccount: 'Cash',
    note: 'Cash withdrawal',
  },
]

const input = {
  email: 'sohail@example.com',
  userId: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaa1',
  accounts,
  categories,
  budgets,
  transactions,
  exportedAt: new Date('2026-10-26T10:30:00.000Z'),
}

describe('money', () => {
  it('keeps exactly two decimal places without binary drift', () => {
    expect(money(0.1 + 0.2)).toBe(0.3)
    expect(money(187.5)).toBe(187.5)
    expect(money(100.005)).toBe(100.01)
    expect(money(Number.NaN)).toBe(0)
  })
})

describe('buildExportBundle', () => {
  it('includes the user, schema and every row that was passed in', () => {
    const bundle = buildExportBundle(input)
    expect(bundle.schema).toBe(EXPORT_SCHEMA)
    expect(bundle.user).toEqual({
      id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaa1',
      email: 'sohail@example.com',
    })
    expect(bundle.counts).toEqual({
      accounts: 2,
      categories: 2,
      budgets: 1,
      transactions: 2,
    })
    expect(bundle.accounts).toEqual([
      { name: 'Bank', opening_balance: 2500 },
      { name: 'Cash', opening_balance: 0.1 },
    ])
    expect(bundle.transactions[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      category: 'Groceries',
      from_account: 'Bank',
      to_account: null,
    })
    expect(bundle.transactions[1]).toMatchObject({
      type: 'transfer',
      category: null,
      to_account: 'Cash',
    })
  })

  it('contains no credentials or connection details', () => {
    const text = jsonExportText(input)
    expect(text).not.toMatch(/supabase\.co/i)
    expect(text).not.toMatch(/service[_ -]?role/i)
    expect(text).not.toMatch(/api[_-]?key/i)
    expect(text).not.toMatch(/anon/i)
    expect(text).not.toMatch(/password/i)
  })

  it('is valid JSON with a trailing newline, so a partial write is obvious', () => {
    const text = jsonExportText(input)
    expect(text.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(text)).not.toThrow()
  })
})

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell(null)).toBe('')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+91 99999')).toBe("'+91 99999")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tcmd')).toBe("'\tcmd")
  })

  it('does not alter ordinary text', () => {
    expect(csvCell('Groceries')).toBe('Groceries')
    expect(csvCell(187.5)).toBe('187.5')
  })
})

describe('transactionsToCsv', () => {
  it('has a header, one line per transaction and two-decimal amounts', () => {
    const csv = transactionsToCsv(transactions)
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'id,date,type,amount_inr,category,from_account,to_account,note',
    )
    expect(lines[1]).toContain('187.50')
    expect(lines[1]).toContain('Groceries')
    expect(lines[2]).toContain('500.00')
    expect(lines[2]).toContain(',Cash,')
  })

  it('starts with a UTF-8 BOM and uses CRLF for spreadsheet compatibility', () => {
    const csv = transactionsToCsv(transactions)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('\r\n')
  })

  it('escapes a note that looks like a formula', () => {
    const csv = transactionsToCsv([
      { ...transactions[0], note: '=HYPERLINK("http://evil.example","click")' },
    ])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain('""click""')
  })
})

describe('reportCsvFilename', () => {
  it('names a range export with both validated dates', () => {
    expect(reportCsvFilename('2026-10-01', '2026-10-31')).toBe(
      'expense-tracker-report-2026-10-01-to-2026-10-31.csv',
    )
  })

  it('names a drilled-in month export with that month', () => {
    expect(reportCsvFilename('2026-05-01', '2026-10-31', '2026-10')).toBe(
      'expense-tracker-report-2026-10.csv',
    )
  })

  it('cannot be given a path or a command by user text', () => {
    const name = reportCsvFilename('../../etc/passwd', '2026-10-31; rm -rf /')
    expect(name).toBe('expense-tracker-report-start-to-2026-10-31.csv')
    expect(name).not.toMatch(/[\\/:*?"<>|;]/)
  })

  it('strips a malformed month instead of trusting it', () => {
    expect(reportCsvFilename('2026-05-01', '2026-10-31', '2026-10; rm')).toBe(
      'expense-tracker-report-2026-10.csv',
    )
  })
})

describe('exportFilename', () => {
  it('is predictable, dated and free of path characters', () => {
    const name = exportFilename('sohail+test@example.com', 'json', new Date(2026, 9, 26))
    expect(name).toBe('expense-tracker-sohailtest-2026-10-26.json')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })

  it('falls back when the email has no usable local part', () => {
    expect(exportFilename('@example.com', 'csv', new Date(2026, 0, 2))).toBe(
      'expense-tracker-account-2026-01-02.csv',
    )
  })
})
