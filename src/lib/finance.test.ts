import { describe, expect, it } from 'vitest'
import type { AccountDef, Transaction } from '../types'
import {
  accountBalance,
  categorySpend,
  monthlyTotals,
  roundMoney,
  savingsSummary,
  spendingByCategory,
  sumMoney,
  sumOf,
  toPaise,
  totalBalance,
} from './finance'

/**
 * One worked example used throughout:
 *
 *   Bank opening ₹10,000, Cash opening ₹1,000.
 *   Oct 1  salary   +₹50,000.00 into Bank
 *   Oct 2  rent     −₹15,000.00 from Bank
 *   Oct 3  groceries−₹ 2,500.75 from Bank
 *   Oct 4  transfer  ₹ 5,000.00 Bank → Cash
 *   Oct 5  transfer  ₹   250.25 Cash → Bank
 *   Oct 6  dinner   −₹ 1,200.50 from Cash
 *   Sep 15 groceries−₹ 1,000.00 from Cash
 *
 *   Bank: 10,000 + 50,000 − 15,000 − 2,500.75 − 5,000 + 250.25 = 37,749.50
 *   Cash:  1,000 + 5,000 − 250.25 − 1,200.50 − 1,000        =  3,549.25
 *   Total: 41,298.75
 *   October: income 50,000.00, expenses 18,701.25, savings 31,298.75
 *   September: income 0, expenses 1,000.00, savings −1,000.00
 */
const accounts: AccountDef[] = [
  { name: 'Bank', openingBalance: 10_000 },
  { name: 'Cash', openingBalance: 1_000 },
]

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  date: '2026-10-01',
  type: 'expense',
  amount: 100,
  category: 'Groceries',
  account: 'Bank',
  note: 'Test',
  ...overrides,
})

const transactions: Transaction[] = [
  tx({ id: 'salary', date: '2026-10-01', type: 'income', amount: 50_000, category: 'Salary' }),
  tx({ id: 'rent', date: '2026-10-02', amount: 15_000, category: 'Rent' }),
  tx({ id: 'groceries', date: '2026-10-03', amount: 2_500.75, category: 'Groceries' }),
  tx({
    id: 'to-cash',
    date: '2026-10-04',
    type: 'transfer',
    amount: 5_000,
    category: undefined,
    account: 'Bank',
    toAccount: 'Cash',
  }),
  tx({
    id: 'to-bank',
    date: '2026-10-05',
    type: 'transfer',
    amount: 250.25,
    category: undefined,
    account: 'Cash',
    toAccount: 'Bank',
  }),
  tx({
    id: 'dinner',
    date: '2026-10-06',
    amount: 1_200.5,
    category: 'Dining Out',
    account: 'Cash',
  }),
  tx({
    id: 'sept',
    date: '2026-09-15',
    amount: 1_000,
    category: 'Groceries',
    account: 'Cash',
  }),
]

describe('account balances', () => {
  it('adds income and subtracts expenses and both transfer directions', () => {
    expect(accountBalance('Bank', accounts, transactions)).toBe(37_749.5)
    expect(accountBalance('Cash', accounts, transactions)).toBe(3_549.25)
  })

  it('starts from the account opening balance', () => {
    expect(accountBalance('Bank', accounts, [])).toBe(10_000)
    expect(accountBalance('Unknown', accounts, [])).toBe(0)
  })

  it('makes transfers cancel in the total', () => {
    const total = totalBalance(accounts, transactions)
    expect(total).toBe(41_298.75)
    expect(total).toBe(
      accountBalance('Bank', accounts, transactions) +
        accountBalance('Cash', accounts, transactions),
    )
  })

  it('does not count opening balances as income or savings', () => {
    const openingOnly: AccountDef[] = [{ name: 'Bank', openingBalance: 50_000 }]
    expect(totalBalance(openingOnly, [])).toBe(50_000)
    expect(monthlyTotals([], ['2026-10'])[0]).toMatchObject({
      income: 0,
      expense: 0,
      savings: 0,
    })
  })
})

describe('monthly reporting', () => {
  const months = monthlyTotals(transactions, ['2026-09', '2026-10'])

  it('separates calendar months and ignores transfers', () => {
    expect(months).toEqual([
      { key: '2026-09', label: 'Sept', income: 0, expense: 1_000, savings: -1_000 },
      {
        key: '2026-10',
        label: 'Oct',
        income: 50_000,
        expense: 18_701.25,
        savings: 31_298.75,
      },
    ])
  })

  it('reports zero for a month containing only transfers', () => {
    const transfersOnly = transactions.filter((t) => t.type === 'transfer')
    expect(monthlyTotals(transfersOnly, ['2026-10'])[0]).toMatchObject({
      income: 0,
      expense: 0,
      savings: 0,
    })
  })

  it('sums six-month savings and rounds the average to paise', () => {
    expect(savingsSummary(months)).toEqual({
      months: 2,
      totalIncome: 50_000,
      totalExpense: 19_701.25,
      totalSavings: 30_298.75,
      // 30,298.75 / 2 = 15,149.375 → 15,149.38
      averageMonthlySavings: 15_149.38,
    })
  })
})

describe('category spending', () => {
  it('sums expenses per category for the month only', () => {
    expect(spendingByCategory(transactions, '2026-10')).toEqual({
      Rent: 15_000,
      Groceries: 2_500.75,
      'Dining Out': 1_200.5,
    })
    expect(spendingByCategory(transactions, '2026-09')).toEqual({ Groceries: 1_000 })
  })

  it('orders categories by spending, biggest first', () => {
    expect(categorySpend(transactions, '2026-10')).toEqual([
      { name: 'Rent', value: 15_000 },
      { name: 'Groceries', value: 2_500.75 },
      { name: 'Dining Out', value: 1_200.5 },
    ])
  })

  it('never includes income or transfers', () => {
    const totals = spendingByCategory(transactions, '2026-10')
    expect(totals).not.toHaveProperty('Salary')
    expect(Object.keys(totals)).toHaveLength(3)
  })
})

describe('type totals', () => {
  it('sums only the requested type and keeps transfers separate', () => {
    expect(sumOf(transactions, 'income')).toBe(50_000)
    expect(sumOf(transactions, 'expense')).toBe(19_701.25)
    expect(sumOf(transactions, 'transfer')).toBe(5_250.25)
  })
})

describe('currency precision', () => {
  it('adds paise without floating-point drift', () => {
    const cents = [tx({ amount: 0.1 }), tx({ amount: 0.2 })]
    expect(0.1 + 0.2).not.toBe(0.3) // the problem this guards against
    expect(sumOf(cents, 'expense')).toBe(0.3)
    expect(monthlyTotals(cents, ['2026-10'])[0]).toMatchObject({
      expense: 0.3,
      savings: -0.3,
    })
    expect(accountBalance('Bank', [{ name: 'Bank', openingBalance: 0 }], cents)).toBe(-0.3)
  })

  it('rounds halves away from zero at the paise boundary', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(-1.005)).toBe(-1.01)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(toPaise(1.005)).toBe(101)
  })

  it('sums large rupee values exactly', () => {
    expect(sumMoney([1_234.56, 2_345.67, 0.78])).toBe(3_581.01)
  })
})
