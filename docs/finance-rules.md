# Financial rules

This is the single definition of every money figure in the app. The
implementation lives in [`src/lib/finance.ts`](../src/lib/finance.ts) and the
worked examples below are enforced by
[`src/lib/finance.test.ts`](../src/lib/finance.test.ts).

There is no stored total, balance or chart series. Every number is derived
from two sources: the user's transactions and each account's opening balance.
Screens only format and lay out values they receive from `finance.ts`.

## Currency and precision

- Currency is **Indian Rupees (INR)**, displayed with the ₹ symbol.
- Amounts are stored as **positive** numbers; the transaction *type* decides
  the direction. No negative transactions exist.
- Money is stored in Postgres as `numeric(12,2)`: at most two decimal places
  (paise) and at most ₹10,00,00,000 (₹10 crore). The database rejects anything
  else, and the form rounds to paise before saving.
- Aggregations add **integer paise**, not floating-point rupees, and convert
  back once. This is why `₹0.10 + ₹0.20` is `₹0.30`, not
  `0.30000000000000004`.
- Rounding is to the nearest paise, with exact halves rounded **away from
  zero**: `₹1.005 → ₹1.01`, `−₹1.005 → −₹1.01`.
- Totals, cards and chart tooltips always show two decimals. Chart *axes* use
  whole rupees for legibility (`formatINRCompact`); the underlying value and
  tooltip keep full paise. This is a display choice, not a second calculation.
- No financial figure is hard-coded in a view. Empty states show zero because
  the derived value is zero, not because a zero was typed into the markup.

## Transaction types

| Type | Category | Accounts | Effect on balances | Counts as income/expense? |
| --- | --- | --- | --- | --- |
| `income` | Required, `kind = income` | One (`account`) | Increases that account | Income |
| `expense` | Required, `kind = expense` | One (`account`) | Decreases that account | Expense |
| `transfer` | Forbidden | Two, and they must differ (`account` → `toAccount`) | Decreases source, increases destination | **No** |

The database enforces these shapes, including category kind matching the
transaction type.

## Account balance

For one account:

```
opening balance
+ income credited to the account
+ transfers received by the account
− expenses paid from the account
− transfers sent from the account
= account balance
```

Opening balances are included because they are the money the account started
with. They are **not** income and never appear in monthly income or savings.

Balances are ledger balances: every recorded transaction counts, including a
transaction dated in the future. They are not a live bank-feed snapshot, and
the app does not silently drop scheduled entries.

## Total balance

```
sum of every account's opening balance
+ total income
− total expenses
= total balance
```

Transfers are deliberately absent: money moving between the user's own
accounts changes two account balances but not how much they own in total.
Equivalently, summing `accountBalance` over every account gives the same
result; a test asserts this equality.

## Income, expenses and savings

- **Income** for a period = sum of `income` transactions in it.
- **Expenses** for a period = sum of `expense` transactions in it.
- **Savings** (net cash flow) = income − expenses.
- **Transfers are never income, expenses or savings.** They are neither
  earned nor spent, and counting them would double-count money.
- Savings can be negative. A negative value means more was spent than earned
  in that period and is shown in red.
- Opening balances are not savings: they are the starting point, not a result
  of the period.

## Monthly reporting

- A transaction belongs to the **calendar month of its `occurred_on` date**
  (`YYYY-MM`), regardless of when it was created or edited.
- The dashboard uses the **last six calendar months**, oldest first, ending
  with the current month. The current month is partial by definition; a
  future-dated transaction inside it counts toward that month.
- The Reports page can show this month, the last 3 or 6 calendar months, this
  year, or an inclusive custom range. Presets cover **whole calendar months**,
  not a rolling number of days: “Last 3 months” is the current month and the
  two before it.
- A custom range is **inclusive of both dates**. A transaction dated on the
  start or end date is included; the day before and the day after are not.
  When a range covers only part of a month, only the rows inside that range
  are counted, even though the month label still appears on the chart.
- Monthly income, expenses and savings include only rows dated in that month
  and inside the selected range. Months with no rows report zero.
- **Average monthly savings** = total savings ÷ number of months touched by
  the range, including months with no activity, rounded to paise. For the
  default six-month report the divisor is always six.
- The monthly chart, the summary cards and the category breakdown are built
  from one filtered list in a single pass (`summariseRange`), so they cannot
  disagree with each other.
- Budgets are separate per month (`budgets.month`, stored as the first day of
  that month); a month without a budget row has no limit.

## Category spending and budgets

```
category spending (month) =
  sum of expense amounts for that category
  where the transaction date is in that month
```

- Transfers and income are excluded.
- Budget **spent** is exactly this category spending. Progress is
  `spent ÷ limit`; 80–99.99% is "Almost there", exactly 100% is "At limit",
  and anything above is "Over budget". The bar is capped at 100% but the
  percentage text uses the real figure (for example 106%).
- **Remaining** = limit − spent. Negative means overspent; the amount over is
  exactly the absolute value of that figure. Spending exactly the limit leaves
  ₹0.00 and is not described as overspending.
- The budgets page's total budget, spent and remaining figures include only
  categories that have a budget in the selected month. Spending in expense
  categories without a budget is shown separately as **unbudgeted**, never
  added to the budgeted totals.
- Reports compare budgets one month at a time using the same
  `budgetProgressForMonth` function as the Budgets page. A multi-month range
  has no single limit to compare against, so the page asks for a month instead
  of estimating one.
- Deleting a budget never changes spending or transactions.

## CSV export

- The Reports page exports exactly the transactions in the selected range, or
  the drilled-in month when one is selected.
- The file is UTF-8 with CRLF line endings and a header row. Amounts are
  written with exactly two decimals (`2500.00`), not formatted currency.
- Cells are quoted when they contain a comma, quote or newline. A cell that a
  spreadsheet could treat as a formula (`=`, `+`, `-`, `@`, tab or carriage
  return at the start) is prefixed with an apostrophe, so user-provided notes
  cannot execute. This is a display-safety measure; the export is not imported
  back by the app.

## Filtered transaction totals

The Transactions page's **Money in**, **Money out** and **Net** describe the
rows currently visible after search, type, category and month filters:

- Money in = sum of visible `income` rows.
- Money out = sum of visible `expense` rows.
- Net = Money in − Money out.
- Visible transfers are listed but count as neither in nor out.

## Worked example

Accounts: Bank opening ₹10,000.00, Cash opening ₹1,000.00.

| Date | Type | Amount | Category | Account |
| --- | --- | ---: | --- | --- |
| 2026-09-15 | expense | 1,000.00 | Groceries | Cash |
| 2026-10-01 | income | 50,000.00 | Salary | Bank |
| 2026-10-02 | expense | 15,000.00 | Rent | Bank |
| 2026-10-03 | expense | 2,500.75 | Groceries | Bank |
| 2026-10-04 | transfer | 5,000.00 | — | Bank → Cash |
| 2026-10-05 | transfer | 250.25 | — | Cash → Bank |
| 2026-10-06 | expense | 1,200.50 | Dining Out | Cash |

Results:

| Figure | Expected |
| --- | ---: |
| Bank balance | ₹37,749.50 |
| Cash balance | ₹3,549.25 |
| Total balance | ₹41,298.75 |
| September income / expenses / savings | ₹0.00 / ₹1,000.00 / −₹1,000.00 |
| October income / expenses / savings | ₹50,000.00 / ₹18,701.25 / ₹31,298.75 |
| October spending: Rent / Groceries / Dining Out | ₹15,000.00 / ₹2,500.75 / ₹1,200.50 |
| Six-month total savings (these two months only) | ₹30,298.75 |
| Average monthly savings over two months | ₹15,149.38 |

Note that the October transfers (₹5,000.00 and ₹250.25) appear in each account's
balance but not in October income, expenses, savings or category spending.

## Changing these rules

Any change to a formula must include all of:

1. An update to this document.
2. An update to the pure function in `src/lib/finance.ts`.
3. A known-example test in `src/lib/finance.test.ts` (or
   [`src/lib/reporting.test.ts`](../src/lib/reporting.test.ts) for date ranges
   and budget progress).
